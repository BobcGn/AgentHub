import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecordProjectService } from '../src/application/record-project-service.js';
import { JsonRecordProjectStore } from '../src/infrastructure/record-project-store.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { createCandidateValidator } from '../src/infrastructure/harness-validator.js';
import { JsonRunStore } from '../src/infrastructure/run-store.js';
import { HarnessService } from '../src/application/harness-service.js';
import { RecoveryService } from '../src/application/recovery-service.js';
import { BoardService } from '../src/application/board-service.js';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { initializeAdmin, toolCredentials } from '../src/infrastructure/auth.js';
import { scriptedModel } from '../src/infrastructure/scripted-model.js';
import type { ModelPort, HarnessRun } from '../src/domain/harness.js';
import type { RecordProject } from '../src/domain/record-project.js';

const human = { kind: 'human' as const };

function createTestEnv(model: ModelPort = scriptedModel) {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-cold-start-acc-'));
  const dbPath = join(dir, 'board.sqlite');
  const store = new SqliteStore(dbPath);
  initializeAdmin(store, 'test-admin-password');
  const projectStore = new JsonRecordProjectStore(join(dir, 'record-projects'));
  const runStore = new JsonRunStore(join(dir, 'runs'));
  const service = new BoardService(store, toolCredentials, id => projectStore.get(id) !== undefined);
  const validator = createRecordStructureValidator();
  const recordService = new RecordProjectService(projectStore, service, validator);
  const harness = new HarnessService({
    runs: runStore,
    projects: projectStore,
    records: recordService,
    validator,
    candidates: createCandidateValidator(),
    model
  });
  const recoveryService = new RecoveryService({ projects: projectStore, runs: runStore });

  return {
    dir,
    store,
    projectStore,
    runStore,
    recordService,
    harness,
    recoveryService,
    cleanup() {
      if (store.db.open) store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function createBaseProject(env: ReturnType<typeof createTestEnv>, suffix: string) {
  const SUFFIX = suffix.toUpperCase();
  const initial = env.recordService.create(human, {
    name: `验收项目 ${SUFFIX}`,
    title: `核心意图 ${SUFFIX}`,
    problem: `核心痛点 ${SUFFIX}`,
    expectedOutcome: `预期成果 ${SUFFIX}`,
    includes: ['冷启动验收'],
    excludes: ['真实外部依赖'],
    constraints: ['先理解再推进'],
    confirmed: true
  }, `acc-create-proj-${SUFFIX}`);

  const withReq1 = env.recordService.saveRecord(human, initial.id, {
    baseRevision: initial.revision,
    collection: 'requirements',
    id: null,
    record: {
      id: `REQ-${SUFFIX}-1`,
      kind: 'requirement',
      intentId: initial.records.intent.id,
      title: `需求一 ${SUFFIX}`,
      problem: `问题一 ${SUFFIX}`,
      expectedOutcome: `期望一 ${SUFFIX}`,
      scope: { includes: ['范围1'], excludes: [] },
      constraints: [],
      rationale: '理由1',
      expectedImpact: '影响1',
      acceptanceCriteria: [
        { id: `C-${SUFFIX}-1-1`, description: '核心能力具备', verification: 'test' }
      ],
      sourceRefs: [initial.records.sources[0]!.id],
      status: 'draft',
      result: null,
      acceptance: null,
      pullRequest: null
    },
    reason: `创建需求一 ${SUFFIX}`,
    confirmed: true
  }, `acc-req1-${SUFFIX}`);

  return withReq1;
}

test('Scenario 1: 零内存残留冷启动——关闭服务并重启全新实例，准确回答 7 个核心问题且不依赖任何内存引用', () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc1');
    const sourceRef = project.records.sources[0]!.id;

    // 录入证据与核查
    const withEv = env.recordService.saveRecord(human, project.id, {
      baseRevision: project.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-SC1-1',
        requirementId: 'REQ-SC1-1',
        targets: [{ kind: 'requirement', id: 'REQ-SC1-1' }],
        description: '测试输出证据',
        subject: 'C-sc1-1-1 单元测试',
        environment: 'node-test',
        observedResult: '所有断言通过',
        limitations: [],
        sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'acc-ev-sc1');

    const withVerif = env.recordService.saveRecord(human, project.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'V-SC1-1',
        target: { kind: 'requirement', id: 'REQ-SC1-1' },
        criterionId: 'C-SC1-1-1',
        outcome: 'passed',
        method: 'test',
        explanation: '已通过测试验证',
        evidenceRefs: ['EV-SC1-1'],
        sourceRefs: [sourceRef]
      },
      reason: '完成核查',
      confirmed: true
    }, 'acc-v-sc1');

    // 补充交付结果与最终 Pull Request，满足真实整体验收前置条件
    const withReqReady = env.recordService.saveRecord(human, project.id, {
      baseRevision: withVerif.revision,
      collection: 'requirements',
      id: 'REQ-SC1-1',
      record: {
        ...withVerif.records.requirements[0]!,
        status: 'draft',
        result: { what: '完成核心能力', why: '满足意图要求', actualImpact: '核心能力就绪', evidenceRefs: ['EV-SC1-1'] },
        pullRequest: {
          url: 'https://github.com/BobcGn/AgentHub/pull/101',
          what: '核心交付',
          why: '满足意图',
          verification: '自动化测试通过',
          result: '全部验收条件满足'
        }
      },
      reason: '补充交付 PR 与交付结果',
      confirmed: true
    }, 'acc-req-ready-sc1');

    // 彻底销毁当前服务，只保留磁盘数据，启动完全独立的全新 Store 与 RecoveryService
    const freshProjectStore = new JsonRecordProjectStore(join(env.dir, 'record-projects'));
    const freshRunStore = new JsonRunStore(join(env.dir, 'runs'));
    const freshRecovery = new RecoveryService({ projects: freshProjectStore, runs: freshRunStore });

    const view = freshRecovery.getRecoveryView(human, project.id);

    // Q1: Goal
    assert.strictEqual(view.goal.intent.title, '核心意图 SC1');
    assert.strictEqual(view.goal.intent.state, 'human_confirmed');
    assert.strictEqual(view.goal.activeRequirement?.id, 'REQ-SC1-1');

    // Q2: Progress
    assert.strictEqual(view.progress.requirementsCount.total, 1);
    assert.strictEqual(view.progress.requirementsCount.draft, 1);
    assert.strictEqual(view.progress.pendingCandidateCount, 0);

    // Q3: Next Safe Action
    assert.strictEqual(view.nextSafeAction.actionCode, 'REQUEST_HUMAN_OVERALL_ACCEPTANCE');
    assert.strictEqual(view.nextSafeAction.actor, 'human');

    // Q4: Why & Prerequisites
    assert.ok(view.nextSafeAction.why.includes('整体验收') || view.nextSafeAction.why.includes('验收条件'));
    assert.ok(view.nextSafeAction.prerequisitesMet.length >= 2);

    // Q5: Authorizations
    assert.strictEqual(view.authorizations.projectRevision, withReqReady.revision);
    assert.strictEqual(view.authorizations.authorizationState, 'none');

    // Q6: Evidence Links
    assert.strictEqual(view.evidence.verifications.length, 1);
    assert.strictEqual(view.evidence.verifications[0]?.outcome, 'passed');

    // Q7: Unknowns & Gates
    assert.strictEqual(view.unknowns.unverifiedCriteria.length, 0);
    assert.strictEqual(view.gapReport.hasGap, false);

    // Markdown 导出
    const md = freshRecovery.formatRecoveryMarkdown(human, project.id);
    assert.ok(md.includes('## 0. 规范与更新协议'));
    assert.ok(md.includes('## 1. 当前目标（Goal）'));
    assert.ok(md.includes('## 3. 下一步安全动作（Next Safe Action）'));
    assert.ok(md.includes('上下文最小化声明'));
  } finally {
    env.cleanup();
  }
});

test('Scenario 2: 多需求选择——存在多个未完成需求时，不擅自猜测优先级，推导 SELECT_TARGET_REQUIREMENT 请求人端指定', () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc2');
    const sourceRef = project.records.sources[0]!.id;

    // 创建第二个未完成需求
    env.recordService.saveRecord(human, project.id, {
      baseRevision: project.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-SC2-2',
        kind: 'requirement',
        intentId: project.records.intent.id,
        title: '需求二 sc2',
        problem: '问题二',
        expectedOutcome: '期望二',
        scope: { includes: ['范围2'], excludes: [] },
        constraints: [],
        rationale: '理由2',
        expectedImpact: '影响2',
        acceptanceCriteria: [{ id: 'C-SC2-2-1', description: '条件2', verification: 'test' }],
        sourceRefs: [sourceRef],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建第二需求',
      confirmed: true
    }, 'acc-req2-sc2');

    const freshProjectStore = new JsonRecordProjectStore(join(env.dir, 'record-projects'));
    const freshRunStore = new JsonRunStore(join(env.dir, 'runs'));
    const freshRecovery = new RecoveryService({ projects: freshProjectStore, runs: freshRunStore });

    // 未指定 targetRequirementId 时，推导 SELECT_TARGET_REQUIREMENT
    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.nextSafeAction.actionCode, 'SELECT_TARGET_REQUIREMENT');
    assert.strictEqual(view.nextSafeAction.actor, 'human');
    assert.strictEqual(view.goal.activeRequirement, null);
    assert.ok(view.goal.candidateRequirements && view.goal.candidateRequirements.length === 2);

    // 明确指定 targetRequirementId 后，准确定位到指定需求
    const viewScoped = freshRecovery.getRecoveryView(human, project.id, { targetRequirementId: 'REQ-SC2-2' });
    assert.strictEqual(viewScoped.goal.activeRequirement?.id, 'REQ-SC2-2');
    assert.strictEqual(viewScoped.nextSafeAction.actionCode, 'REQUIRE_RUN_AUTHORIZATION');
  } finally {
    env.cleanup();
  }
});

test('Scenario 3: 全部需求已完成——所有需求均标记为 done 时，推导 ALL_REQUIREMENTS_COMPLETED', () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc3');
    const sourceRef = project.records.sources[0]!.id;

    // 添加证据与核查
    const withEv = env.recordService.saveRecord(human, project.id, {
      baseRevision: project.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-SC3',
        requirementId: 'REQ-SC3-1',
        targets: [{ kind: 'requirement', id: 'REQ-SC3-1' }],
        description: '证据', subject: '全部通过', environment: 'test',
        observedResult: 'PASS', limitations: [], sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'acc-ev-sc3');

    const withVerif = env.recordService.saveRecord(human, project.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'V-SC3',
        target: { kind: 'requirement', id: 'REQ-SC3-1' },
        criterionId: 'C-SC3-1-1',
        outcome: 'passed',
        method: 'test',
        explanation: '验证通过',
        evidenceRefs: ['EV-SC3'],
        sourceRefs: [sourceRef]
      },
      reason: '核查通过',
      confirmed: true
    }, 'acc-v-sc3');

    // 补充结果与 PR 记录并整体验收
    const withReqResult = env.recordService.saveRecord(human, project.id, {
      baseRevision: withVerif.revision,
      collection: 'requirements',
      id: 'REQ-SC3-1',
      record: {
        ...withVerif.records.requirements[0]!,
        result: { what: '全部完成', why: '验收通过', actualImpact: '达到预期', evidenceRefs: ['EV-SC3'] },
        pullRequest: { url: 'https://github.com/BobcGn/AgentHub/pull/1', what: 'PR', why: 'Done', verification: 'CI', result: 'Pass' }
      },
      reason: '补充 PR 记录与结果',
      confirmed: true
    }, 'acc-done-sc3');

    env.recordService.acceptRequirement(human, project.id, 'REQ-SC3-1', {
      baseRevision: withReqResult.revision,
      confirmed: true,
      reason: '本人整体验收'
    }, 'acc-accept-sc3');

    const freshRecovery = new RecoveryService({
      projects: new JsonRecordProjectStore(join(env.dir, 'record-projects')),
      runs: new JsonRunStore(join(env.dir, 'runs'))
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.nextSafeAction.actionCode, 'ALL_REQUIREMENTS_COMPLETED');
    assert.strictEqual(view.nextSafeAction.actor, 'human');
    assert.strictEqual(view.progress.requirementsCount.done, 1);
    assert.strictEqual(view.progress.requirementsCount.draft, 0);
  } finally {
    env.cleanup();
  }
});

test('Scenario 4: 存在未完成子产物——需求已核查通过但其拆解的 Unit 处于 review/draft 时，阻断整体验收', () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc4');
    const sourceRef = project.records.sources[0]!.id;

    // 录入需求证据与核查
    const withEv = env.recordService.saveRecord(human, project.id, {
      baseRevision: project.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-SC4', requirementId: 'REQ-SC4-1', targets: [{ kind: 'requirement', id: 'REQ-SC4-1' }],
        description: 'E', subject: 'S', environment: 'T', observedResult: 'R', limitations: [], sourceRefs: [sourceRef]
      },
      reason: 'E', confirmed: true
    }, 'acc-ev-sc4');

    const withVerif = env.recordService.saveRecord(human, project.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'V-SC4', target: { kind: 'requirement', id: 'REQ-SC4-1' }, criterionId: 'C-SC4-1-1',
        outcome: 'passed', method: 'test', explanation: 'P', evidenceRefs: ['EV-SC4'], sourceRefs: [sourceRef]
      },
      reason: 'V', confirmed: true
    }, 'acc-v-sc4');

    // 添加一个仍处于 draft 的 Unit
    env.recordService.saveRecord(human, project.id, {
      baseRevision: withVerif.revision,
      collection: 'units',
      id: null,
      record: {
        id: 'UNIT-SC4-1', kind: 'unit', requirementId: 'REQ-SC4-1', title: '未完成的单元',
        problem: 'P', expectedOutcome: 'O', scope: { includes: ['范围1'], excludes: [] }, rationale: 'R',
        expectedImpact: 'I', acceptanceCriteria: [{ id: 'CU-1', description: 'CD', verification: 'test' }],
        responsibilities: ['R'], inputs: ['输入1'], outputs: ['输出1'], dependsOn: [], sourceRefs: [sourceRef],
        status: 'draft', result: null
      },
      reason: '新增 Unit', confirmed: true
    }, 'acc-unit-sc4');

    const freshRecovery = new RecoveryService({
      projects: new JsonRecordProjectStore(join(env.dir, 'record-projects')),
      runs: new JsonRunStore(join(env.dir, 'runs'))
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    // 即使 Requirement 验收条件已通过，但因有未完成的 Unit，不能提议整体验收，动作仍为要求工作区授权推进子产物
    assert.strictEqual(view.nextSafeAction.actionCode, 'REQUIRE_RUN_AUTHORIZATION');
    assert.ok(view.nextSafeAction.blockingIssues.some(b => b.includes('未完成拆解产物')));
  } finally {
    env.cleanup();
  }
});

test('Scenario 5: 正在执行中的运行（running）——准确识别活动运行并推导 AWAIT_ACTIVE_RUN', async () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc5');

    // 启动运行
    const started = env.harness.start(human, project.id, {
      requirementId: 'REQ-SC5-1',
      baseRevision: project.revision,
      instruction: '执行分析',
      confirmed: true
    }, 'acc-run-sc5');

    // 构造或模拟磁盘持久化为 running 状态的 Run
    const run = env.runStore.get(started.id)!;
    const runningRun: HarnessRun = { ...run, revision: run.revision + 1, state: 'running' };
    env.runStore.replace(runningRun, run.revision);

    const freshRecovery = new RecoveryService({
      projects: new JsonRecordProjectStore(join(env.dir, 'record-projects')),
      runs: new JsonRunStore(join(env.dir, 'runs'))
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.nextSafeAction.actionCode, 'AWAIT_ACTIVE_RUN');
    assert.strictEqual(view.nextSafeAction.waitingFor, 'active_run');
    assert.strictEqual(view.nextSafeAction.executableNow, false);
  } finally {
    env.cleanup();
  }
});

test('Scenario 6: 授权过期——authorization.expiresAt 已在过去时，推导 REQUIRE_RUN_AUTHORIZATION 并说明过期', async () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc6');

    // 启动运行产生授权记录
    const started = env.harness.start(human, project.id, {
      requirementId: 'REQ-SC6-1',
      baseRevision: project.revision,
      instruction: '授权测试',
      confirmed: true
    }, 'acc-run-sc6');

    await env.harness.settled(started.id);

    // 先通过人端决定驳回候选，再将授权修改为已过期
    const run = env.runStore.get(started.id)!;
    const decided = env.harness.decide(human, started.id, { revision: run.revision, action: 'reject', reason: '驳回候选' });
    const expiredRun: HarnessRun = {
      ...decided,
      revision: decided.revision + 1,
      authorization: {
        ...decided.authorization,
        expiresAt: new Date(Date.now() - 60000).toISOString()
      }
    };
    env.runStore.replace(expiredRun, decided.revision);

    const freshRecovery = new RecoveryService({
      projects: new JsonRecordProjectStore(join(env.dir, 'record-projects')),
      runs: new JsonRunStore(join(env.dir, 'runs'))
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.authorizations.authorizationState, 'expired');
    assert.strictEqual(view.nextSafeAction.actionCode, 'REQUIRE_RUN_AUTHORIZATION');
    assert.ok(view.authorizations.notes.some(n => n.includes('已过期')));
  } finally {
    env.cleanup();
  }
});

test('Scenario 7: 撤销授权或运行被取消——推导 INSPECT_CANCELLED_RUN 避免静默恢复', async () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc7');

    const started = env.harness.start(human, project.id, {
      requirementId: 'REQ-SC7-1',
      baseRevision: project.revision,
      instruction: '取消测试',
      confirmed: true
    }, 'acc-run-sc7');

    await env.harness.settled(started.id);

    // 取消运行
    const curRun = env.harness.get(human, started.id);
    env.harness.cancel(human, started.id, { revision: curRun.revision });

    const freshRecovery = new RecoveryService({
      projects: new JsonRecordProjectStore(join(env.dir, 'record-projects')),
      runs: new JsonRunStore(join(env.dir, 'runs'))
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.nextSafeAction.actionCode, 'INSPECT_CANCELLED_RUN');
    assert.strictEqual(view.nextSafeAction.actor, 'human');
    assert.ok(view.nextSafeAction.why.includes('取消'));
  } finally {
    env.cleanup();
  }
});

test('Scenario 8: 运行基准滞后于项目修订——推导 RECONCILE_STALE_RUN', async () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc8');

    const started = env.harness.start(human, project.id, {
      requirementId: 'REQ-SC8-1',
      baseRevision: project.revision,
      instruction: '修订测试',
      confirmed: true
    }, 'acc-run-sc8');

    await env.harness.settled(started.id);

    // 项目修订向前推进
    env.recordService.saveRecord(human, project.id, {
      baseRevision: project.revision,
      collection: 'sources',
      id: null,
      record: { id: 'SRC-ADVANCE-1', kind: 'reference', locator: 'doc://update', excerpt: '更新' },
      reason: '推进修订',
      confirmed: true
    }, 'acc-source-sc8');

    const freshRecovery = new RecoveryService({
      projects: new JsonRecordProjectStore(join(env.dir, 'record-projects')),
      runs: new JsonRunStore(join(env.dir, 'runs'))
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.authorizations.authorizationState, 'stale_revision');
    assert.strictEqual(view.nextSafeAction.actionCode, 'RECONCILE_STALE_RUN');
    assert.strictEqual(view.nextSafeAction.actor, 'human');
  } finally {
    env.cleanup();
  }
});

test('Scenario 9: 破坏关系完整性（缺失核查证据）——推导 STOP_AND_REPORT_GAP 拒绝盲目执行', () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc9');

    // 录入一条引用了不存在 evidence 的 verification
    const corrupted: RecordProject = {
      ...project,
      revision: project.revision + 1,
      records: {
        ...project.records,
        verifications: [{
          id: 'V-BROKEN',
          target: { kind: 'requirement', id: 'REQ-SC9-1' },
          criterionId: 'C-sc9-1-1',
          outcome: 'passed',
          method: 'test',
          explanation: '引用了幽灵证据',
          evidenceRefs: ['EV-NONEXISTENT'],
          sourceRefs: []
        }]
      }
    };
    env.projectStore.replace(corrupted, project.revision);

    const freshRecovery = new RecoveryService({
      projects: env.projectStore,
      runs: env.runStore
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.gapReport.hasGap, true);
    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(view.nextSafeAction.actor, 'human');
    assert.ok(view.gapReport.contradictoryFacts.some(f => f.includes('UNKNOWN_REFERENCE')));
  } finally {
    env.cleanup();
  }
});

test('Scenario 10: 不支持的合同版本（schemaVersion 9.9.9）——推导 STOP_AND_REPORT_GAP 阻断执行', () => {
  const env = createTestEnv();
  try {
    const project = createBaseProject(env, 'sc10');

    const unsupportedVersionProject: RecordProject = {
      ...project,
      revision: project.revision + 1,
      records: {
        ...project.records,
        schemaVersion: '9.9.9' as any
      }
    };
    env.projectStore.replace(unsupportedVersionProject, project.revision);

    const freshRecovery = new RecoveryService({
      projects: env.projectStore,
      runs: env.runStore
    });

    const view = freshRecovery.getRecoveryView(human, project.id);
    assert.strictEqual(view.gapReport.hasGap, true);
    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(view.nextSafeAction.actor, 'human');
    assert.ok(view.gapReport.missingFacts.some(f => f.includes('不支持的记录合同版本')));
  } finally {
    env.cleanup();
  }
});
