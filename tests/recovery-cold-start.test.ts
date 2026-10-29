import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
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
import { createHubServer } from '../src/infrastructure/http-server.js';
import { scriptedModel } from '../src/infrastructure/scripted-model.js';
import type { ModelPort, HarnessRun } from '../src/domain/harness.js';
import type { ProjectRecoveryView } from '../src/domain/recovery.js';

const human = { kind: 'human' as const };

/**
 * 跨进程执行消费 CLI：
 * 启动完全隔离的全新 OS 子进程，仅通过启动参数传递目录与项目 ID，
 * 不与写入环境共享内存、单例或前置对象。
 */
function runConsumerCli(args: {
  projectDir: string;
  runDir: string;
  projectId?: string;
  targetRequirementId?: string;
  format?: 'json' | 'markdown';
}): {
  status: number | null;
  stdout: string;
  stderr: string;
  json?: ProjectRecoveryView | undefined;
  error?: { code: string; message: string } | undefined;
} {
  const cliPath = resolve('src/presentation/recovery-cli-consumer.ts');
  const cliArgs = [
    '--import', 'tsx',
    cliPath,
    '--projectDir', args.projectDir,
    '--runDir', args.runDir,
    ...(args.projectId ? ['--projectId', args.projectId] : []),
    ...(args.targetRequirementId ? ['--targetRequirementId', args.targetRequirementId] : []),
    ...(args.format ? ['--format', args.format] : [])
  ];

  const result = spawnSync(process.execPath, cliArgs, {
    cwd: process.cwd(),
    encoding: 'utf8'
  });

  let json: ProjectRecoveryView | undefined;
  let error: { code: string; message: string } | undefined;

  if (result.status === 0 && (!args.format || args.format === 'json')) {
    try {
      json = JSON.parse(result.stdout) as ProjectRecoveryView;
    } catch {
      // ignore
    }
  }

  if (result.stderr.trim()) {
    try {
      const parsed = JSON.parse(result.stderr.trim());
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        error = parsed.error;
      }
    } catch {
      // ignore
    }
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json,
    error
  };
}

function createProducerEnv(model: ModelPort = scriptedModel) {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-mp-coldstart-'));
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
  const recoveryService = new RecoveryService({ projects: projectStore, runs: runStore, validator });

  return {
    dir,
    projectDir: projectStore.storagePath,
    runDir: runStore.storagePath,
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

function initBaseProject(env: ReturnType<typeof createProducerEnv>, suffix: string) {
  const SUFFIX = suffix.toUpperCase();
  const initial = env.recordService.create(human, {
    name: `项目 ${SUFFIX}`,
    title: `意图 ${SUFFIX}`,
    problem: `痛点 ${SUFFIX}`,
    expectedOutcome: `期望 ${SUFFIX}`,
    includes: ['冷启动', '多进程'],
    excludes: ['内存共享'],
    constraints: ['先理解再推进'],
    confirmed: true
  }, `init-proj-${SUFFIX}`);

  return env.recordService.saveRecord(human, initial.id, {
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
      scope: { includes: ['范围一'], excludes: [] },
      constraints: ['约束一'],
      rationale: '理由',
      expectedImpact: '影响',
      acceptanceCriteria: [{ id: `C-${SUFFIX}-1`, description: '验收条件一', verification: 'test' }],
      sourceRefs: [initial.records.sources[0]!.id],
      status: 'draft',
      result: null,
      acceptance: null,
      pullRequest: null
    },
    reason: '创建需求一',
    confirmed: true
  }, `add-req1-${SUFFIX}`);
}

// -------------------- 14 类场景跨进程验收测试 --------------------

test('场景 1: 正常推进——跨进程独立冷启动回答 7 核心问题，推导 REQUIRE_RUN_AUTHORIZATION', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc1');
    producer.store.close(); // 关闭写入端连接，模拟前置进程退出

    // 独立子进程启动消费端
    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });

    assert.strictEqual(res.status, 0, res.stderr);
    const view = res.json!;
    assert.ok(view);

    // Q1: Goal (包含 scope, constraints)
    assert.strictEqual(view.goal.intent.title, '意图 SC1');
    assert.strictEqual(view.goal.intent.state, 'human_confirmed');
    assert.deepStrictEqual(view.goal.intent.scope.includes, ['冷启动', '多进程']);
    assert.strictEqual(view.goal.activeRequirement?.id, 'REQ-SC1-1');
    assert.deepStrictEqual(view.goal.activeRequirement?.constraints, ['约束一']);

    // Q2: Progress
    assert.strictEqual(view.progress.requirementsCount.total, 1);
    assert.strictEqual(view.progress.requirementsCount.draft, 1);
    assert.strictEqual(view.progress.pendingCandidateCount, 0);

    // Q3: Next Safe Action
    assert.strictEqual(view.nextSafeAction.actionCode, 'REQUIRE_RUN_AUTHORIZATION');
    assert.strictEqual(view.nextSafeAction.actor, 'human');
    assert.strictEqual(view.nextSafeAction.executableNow, true);

    // Q4: Why & Prerequisites
    assert.ok(view.nextSafeAction.why.includes('动作建议本身不产生授权'));
    assert.ok(view.nextSafeAction.prerequisitesMet.length >= 2);

    // Q5: Authorizations
    assert.strictEqual(view.authorizations.projectRevision, proj.revision);
    assert.strictEqual(view.authorizations.authorizationState, 'none');

    // Q6: Evidence Links
    assert.ok(view.evidence.sources.length >= 1);
    assert.strictEqual(view.evidence.sources[0]?.kind, 'message');

    // Q7: Unknowns & Gates
    assert.strictEqual(view.unknowns.unverifiedCriteria.length, 1);
    assert.strictEqual(view.unknowns.unverifiedCriteria[0]?.criterionId, 'C-SC1-1');
    assert.strictEqual(view.gapReport.hasGap, false);

    // 验证 Markdown 格式输出
    const mdRes = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id,
      format: 'markdown'
    });
    assert.strictEqual(mdRes.status, 0);
    assert.ok(mdRes.stdout.includes('## 0. 规范与更新协议'));
    assert.ok(mdRes.stdout.includes('受控更新协议入口'));
    assert.ok(mdRes.stdout.includes('## 1. 当前目标（Goal）'));
    assert.ok(mdRes.stdout.includes('包含范围（Includes）：[冷启动, 多进程]'));
  } finally {
    producer.cleanup();
  }
});

test('场景 2: 多需求选定——多个未完成需求未指定时推导 SELECT_TARGET_REQUIREMENT，指定后唯一定位', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc2');
    const sourceRef = proj.records.sources[0]!.id;

    producer.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-SC2-2',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求二 sc2',
        problem: '问题二',
        expectedOutcome: '期望二',
        scope: { includes: ['范围二'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-SC2-2', description: '验收二', verification: 'test' }],
        sourceRefs: [sourceRef],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求二',
      confirmed: true
    }, 'add-req2-sc2');
    producer.store.close();

    // 未指定 targetRequirementId
    const resNoTarget = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(resNoTarget.status, 0);
    assert.strictEqual(resNoTarget.json?.nextSafeAction.actionCode, 'SELECT_TARGET_REQUIREMENT');
    assert.strictEqual(resNoTarget.json?.nextSafeAction.actor, 'human');
    assert.strictEqual(resNoTarget.json?.goal.activeRequirement, null);
    assert.strictEqual(resNoTarget.json?.goal.candidateRequirements?.length, 2);

    // 显式指定 targetRequirementId: REQ-SC2-2
    const resTarget = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id,
      targetRequirementId: 'REQ-SC2-2'
    });
    assert.strictEqual(resTarget.status, 0);
    assert.strictEqual(resTarget.json?.goal.activeRequirement?.id, 'REQ-SC2-2');
    assert.strictEqual(resTarget.json?.nextSafeAction.actionCode, 'REQUIRE_RUN_AUTHORIZATION');
  } finally {
    producer.cleanup();
  }
});

test('场景 3: 全完成——所有需求已完成且整体验收，推导 ALL_REQUIREMENTS_COMPLETED', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc3');
    const req = proj.records.requirements[0]!;
    const sourceRef = proj.records.sources[0]!.id;

    // 录入证据
    const withEv = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-SC3',
        requirementId: req.id,
        targets: [{ kind: 'requirement', id: req.id }],
        description: '证据', subject: '全部通过', environment: 'test',
        observedResult: 'PASS', limitations: [], sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'acc-ev-sc3');

    // 核查通过（符合 verification.schema.json 无多余属性，evidenceRefs 非空）
    const withVerif = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-SC3-1',
        target: { kind: 'requirement', id: req.id },
        criterionId: req.acceptanceCriteria[0]!.id,
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-SC3'],
        sourceRefs: [sourceRef],
        explanation: '测试通过'
      },
      reason: '核查通过',
      confirmed: true
    }, 'acc-v-sc3');

    // 补充结果与 PR 记录
    const withReqResult = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withVerif.revision,
      collection: 'requirements',
      id: req.id,
      record: {
        ...withVerif.records.requirements[0]!,
        result: { what: '全部完成', why: '验收通过', actualImpact: '达到预期', evidenceRefs: ['EV-SC3'] },
        pullRequest: { url: 'https://github.com/BobcGn/AgentHub/pull/1', what: 'PR', why: 'Done', verification: 'CI', result: 'Pass' }
      },
      reason: '补充 PR 记录与结果',
      confirmed: true
    }, 'acc-done-sc3');

    // 整体验收
    producer.recordService.acceptRequirement(human, proj.id, req.id, {
      baseRevision: withReqResult.revision,
      confirmed: true,
      reason: '本人整体验收'
    }, 'acc-accept-sc3');
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'ALL_REQUIREMENTS_COMPLETED');
    assert.strictEqual(res.json?.nextSafeAction.actor, 'human');
    assert.strictEqual(res.json?.nextSafeAction.executableNow, false);
    assert.strictEqual(res.json?.progress.requirementsCount.done, 1);
    assert.strictEqual(res.json?.progress.requirementsCount.draft, 0);
  } finally {
    producer.cleanup();
  }
});

test('场景 4: 无 Unit/BoltPlan 仅 Story——各层级按需出现，Story 完成后满足整体验收推导 REQUEST_HUMAN_OVERALL_ACCEPTANCE', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc4');
    const req = proj.records.requirements[0]!;
    const sourceRef = proj.records.sources[0]!.id;

    // 1. 先保存 draft 状态的 Story
    const pStoryDraft = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'stories',
      id: null,
      record: {
        id: 'STORY-SC4-1',
        kind: 'story',
        requirementId: req.id,
        title: 'Story 1',
        problem: 'P',
        expectedOutcome: 'O',
        scope: { includes: ['S1'], excludes: [] },
        rationale: 'R',
        expectedImpact: 'I',
        userValue: 'V',
        unitId: null,
        dependsOn: [],
        acceptanceCriteria: [{ id: 'SC4-S1', description: 'S1', verification: 'test' }],
        sourceRefs: [sourceRef],
        status: 'draft',
        result: null
      },
      reason: '创建 Story 1 草案',
      confirmed: true
    }, 'add-story1-sc4-draft');

    // 2. 保存证据，此时目标已存在
    const withEv = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: pStoryDraft.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-SC4',
        requirementId: req.id,
        targets: [{ kind: 'story', id: 'STORY-SC4-1' }, { kind: 'requirement', id: req.id }],
        description: '证据', subject: 'Story通过', environment: 'test',
        observedResult: 'PASS', limitations: [], sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'acc-ev-sc4');

    // 2.5 先核验 Story 自身验收准则（未通过准则的子产物不能标为 done）
    const withStoryVerif = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-SC4-S1',
        target: { kind: 'story', id: 'STORY-SC4-1' },
        criterionId: 'SC4-S1',
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-SC4'],
        sourceRefs: [sourceRef],
        explanation: 'Story 1 验收准则核验通过'
      },
      reason: 'Story 准则核验通过',
      confirmed: true
    }, 'add-verif-sc4-s1');

    // 3. 将 Story 更新为 done 状态
    const pStoryDone = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withStoryVerif.revision,
      collection: 'stories',
      id: 'STORY-SC4-1',
      record: {
        ...withStoryVerif.records.stories[0]!,
        status: 'done',
        result: { what: 'W', why: 'Y', actualImpact: 'A', evidenceRefs: ['EV-SC4'] }
      },
      reason: '完成 Story 1',
      confirmed: true
    }, 'update-story-done');

    // 4. 需求验收准则核验通过
    const withReqVerif = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: pStoryDone.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-SC4-1',
        target: { kind: 'requirement', id: req.id },
        criterionId: req.acceptanceCriteria[0]!.id,
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-SC4'],
        sourceRefs: [sourceRef],
        explanation: '准则核验通过'
      },
      reason: '核验通过',
      confirmed: true
    }, 'add-verif-sc4');

    // 5. 补充交付结果与最终 Pull Request，满足真实整体验收前置条件
    producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withReqVerif.revision,
      collection: 'requirements',
      id: req.id,
      record: {
        ...withReqVerif.records.requirements[0]!,
        status: 'review',
        result: { what: '完成 Story 1', why: '实现业务需求', actualImpact: '功能就绪', evidenceRefs: ['EV-SC4'] },
        pullRequest: {
          url: 'https://github.com/BobcGn/AgentHub/pull/4',
          what: '交付需求四',
          why: '完成 Story 1',
          verification: '测试通过',
          result: '达标'
        }
      },
      reason: '补充交付 PR 与结果',
      confirmed: true
    }, 'add-pr-sc4');
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    // 不机械要求 Unit/BoltPlan 存在，直接推导 REQUEST_HUMAN_OVERALL_ACCEPTANCE
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'REQUEST_HUMAN_OVERALL_ACCEPTANCE');
    assert.strictEqual(res.json?.nextSafeAction.actor, 'human');
    assert.strictEqual(res.json?.nextSafeAction.executableNow, true);
    assert.ok(res.json?.unknowns.pendingHumanGates.some(g => g.includes('Overall Acceptance Gate')));
  } finally {
    producer.cleanup();
  }
});

test('场景 5: 仅 Unit（无 Story/BoltPlan）——Unit 完成后推导 REQUEST_HUMAN_OVERALL_ACCEPTANCE', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc5');
    const req = proj.records.requirements[0]!;
    const sourceRef = proj.records.sources[0]!.id;

    // 1. 先保存 draft 状态的 Unit
    const pUnitDraft = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'units',
      id: null,
      record: {
        id: 'UNIT-SC5-1',
        kind: 'unit',
        requirementId: req.id,
        title: 'Unit 1',
        problem: 'P',
        expectedOutcome: 'O',
        scope: { includes: ['U1'], excludes: [] },
        rationale: 'R',
        expectedImpact: 'I',
        responsibilities: ['R'],
        inputs: [],
        outputs: ['Out'],
        dependsOn: [],
        acceptanceCriteria: [{ id: 'SC5-U1', description: 'U1', verification: 'test' }],
        sourceRefs: [sourceRef],
        status: 'draft',
        result: null
      },
      reason: '创建 Unit 1 草案',
      confirmed: true
    }, 'add-unit1-sc5-draft');

    // 2. 保存证据，此时目标已存在
    const withEv = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: pUnitDraft.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-SC5',
        requirementId: req.id,
        targets: [{ kind: 'unit', id: 'UNIT-SC5-1' }, { kind: 'requirement', id: req.id }],
        description: '证据', subject: 'Unit通过', environment: 'test',
        observedResult: 'PASS', limitations: [], sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'acc-ev-sc5');

    // 2.5 先核验 Unit 自身验收准则（未通过准则的子产物不能标为 done）
    const withUnitVerif = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-SC5-U1',
        target: { kind: 'unit', id: 'UNIT-SC5-1' },
        criterionId: 'SC5-U1',
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-SC5'],
        sourceRefs: [sourceRef],
        explanation: 'Unit 1 验收准则核验通过'
      },
      reason: 'Unit 准则核验通过',
      confirmed: true
    }, 'add-verif-sc5-u1');

    // 3. 将 Unit 更新为 done 状态
    const pUnitDone = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withUnitVerif.revision,
      collection: 'units',
      id: 'UNIT-SC5-1',
      record: {
        ...withUnitVerif.records.units[0]!,
        status: 'done',
        result: { what: 'W', why: 'Y', actualImpact: 'A', evidenceRefs: ['EV-SC5'] }
      },
      reason: '完成 Unit 1',
      confirmed: true
    }, 'update-unit-done');

    // 4. 需求验收准则核验通过
    const withReqVerif5 = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: pUnitDone.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-SC5-1',
        target: { kind: 'requirement', id: req.id },
        criterionId: req.acceptanceCriteria[0]!.id,
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-SC5'],
        sourceRefs: [sourceRef],
        explanation: '准则核验通过'
      },
      reason: '核验通过',
      confirmed: true
    }, 'add-verif-sc5');

    // 5. 补充交付结果与最终 Pull Request，满足真实整体验收前置条件
    producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withReqVerif5.revision,
      collection: 'requirements',
      id: req.id,
      record: {
        ...withReqVerif5.records.requirements[0]!,
        status: 'review',
        result: { what: '完成 Unit 1', why: '实现底层逻辑', actualImpact: '单测闭环', evidenceRefs: ['EV-SC5'] },
        pullRequest: {
          url: 'https://github.com/BobcGn/AgentHub/pull/5',
          what: '交付需求五',
          why: '完成 Unit 1',
          verification: '单测通过',
          result: '达标'
        }
      },
      reason: '补充交付 PR 与结果',
      confirmed: true
    }, 'add-pr-sc5');
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'REQUEST_HUMAN_OVERALL_ACCEPTANCE');
  } finally {
    producer.cleanup();
  }
});

test('场景 6: 子产物未完成——需求验收条件已通过，但子产物仍处于 draft/review，阻断整体验收', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc6');
    const req = proj.records.requirements[0]!;
    const sourceRef = proj.records.sources[0]!.id;

    // 录入证据
    const withEv = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-SC6',
        requirementId: req.id,
        targets: [{ kind: 'requirement', id: req.id }],
        description: '证据', subject: '部分完成', environment: 'test',
        observedResult: 'PASS', limitations: [], sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'acc-ev-sc6');

    // 建立一个处于 draft 的 Unit
    const p1 = producer.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv.revision,
      collection: 'units',
      id: null,
      record: {
        id: 'UNIT-SC6-1',
        kind: 'unit',
        requirementId: req.id,
        title: '未完成 Unit',
        problem: 'P',
        expectedOutcome: 'O',
        scope: { includes: ['范围1'], excludes: [] },
        rationale: 'R',
        expectedImpact: 'I',
        responsibilities: ['R'],
        inputs: [],
        outputs: ['Out'],
        dependsOn: [],
        acceptanceCriteria: [{ id: 'C-U', description: 'U', verification: 'test' }],
        sourceRefs: [sourceRef],
        status: 'draft', // 未完成！
        result: null
      },
      reason: '添加 draft unit',
      confirmed: true
    }, 'add-draft-unit-sc6');

    // 需求验收准则 passed
    producer.recordService.saveRecord(human, proj.id, {
      baseRevision: p1.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-SC6-1',
        target: { kind: 'requirement', id: req.id },
        criterionId: req.acceptanceCriteria[0]!.id,
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-SC6'],
        sourceRefs: [sourceRef],
        explanation: '通过'
      },
      reason: '核查通过',
      confirmed: true
    }, 'add-verif-sc6');
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    // 绝不能推导 REQUEST_HUMAN_OVERALL_ACCEPTANCE，必须阻断
    assert.notStrictEqual(res.json?.nextSafeAction.actionCode, 'REQUEST_HUMAN_OVERALL_ACCEPTANCE');
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'REQUIRE_RUN_AUTHORIZATION');
    assert.ok(res.json?.nextSafeAction.blockingIssues.some(b => b.includes('未完成拆解产物') && b.includes('UNIT-SC6-1')));
  } finally {
    producer.cleanup();
  }
});

test('场景 7: running 运行——识别活动中的执行并推导 AWAIT_ACTIVE_RUN (executableNow: false)', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc7');
    const req = proj.records.requirements[0]!;

    const run: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-SC7-ACTIVE',
      revision: 1,
      projectId: proj.id,
      requirementId: req.id,
      createdAt: new Date().toISOString(),
      requestId: 'req-active-001',
      requestHash: 'a'.repeat(64),
      baseRevision: proj.revision,
      state: 'running',
      stopReason: null,
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: producer.dir,
          readScope: ['*'],
          exclude: [],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false,
        fingerprint: 'fp-valid-001'
      },
      executionId: 'exec-active-001',
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: new Date().toISOString(), type: 'started', details: {} }]
    };
    producer.runStore.create(run);
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'AWAIT_ACTIVE_RUN');
    assert.strictEqual(res.json?.nextSafeAction.executableNow, false);
    assert.strictEqual(res.json?.nextSafeAction.waitingFor, 'active_run');
  } finally {
    producer.cleanup();
  }
});

test('场景 8: waiting_human 授权过期——动作保持 REVIEW_CANDIDATE_IN_HUMAN_BOARD 但 executableNow 为 false', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc8');
    const req = proj.records.requirements[0]!;

    const run: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-SC8-EXPIRED',
      revision: 1,
      projectId: proj.id,
      requirementId: req.id,
      createdAt: '2026-10-27T00:00:00Z',
      requestId: 'req-expired-001',
      requestHash: 'b'.repeat(64),
      baseRevision: proj.revision,
      state: 'waiting_human',
      stopReason: 'human_decision_required',
      authorization: {
        active: true,
        expiresAt: '2026-10-27T01:00:00Z', // 过去的时间（已过期）
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: producer.dir,
          readScope: ['*'],
          exclude: [],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false,
        fingerprint: 'fp-valid-001'
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: req.id,
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '过期候选待决',
        sourceRefs: [proj.records.sources[0]!.id]
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-27T00:00:00Z', type: 'candidate_produced', details: {} }]
    };
    producer.runStore.create(run);
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.authorizations.authorizationState, 'expired');
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'REVIEW_CANDIDATE_IN_HUMAN_BOARD');
    // 关键断言：已过期运行真实 preview API 会 403 拒绝，故 executableNow 必须为 false！
    assert.strictEqual(res.json?.nextSafeAction.executableNow, false);
    assert.ok(res.json?.nextSafeAction.blockingIssues.some(b => b.includes('到期') || b.includes('重新确认授权')));
  } finally {
    producer.cleanup();
  }
});

test('场景 9: 授权撤销或取消——推导 INSPECT_CANCELLED_RUN (executableNow: true 人工可核对)', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc9');
    const req = proj.records.requirements[0]!;

    const run: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-SC9-CANCELLED',
      revision: 1,
      projectId: proj.id,
      requirementId: req.id,
      createdAt: '2026-10-27T00:00:00Z',
      requestId: 'req-cancelled-001',
      requestHash: 'c'.repeat(64),
      baseRevision: proj.revision,
      state: 'cancelled',
      stopReason: 'cancelled',
      authorization: {
        active: false, // 授权已注销
        expiresAt: '2026-10-27T01:00:00Z',
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: producer.dir,
          readScope: ['*'],
          exclude: [],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false,
        fingerprint: 'fp-valid-001'
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-27T00:00:00Z', type: 'cancelled', details: {} }]
    };
    producer.runStore.create(run);
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.authorizations.authorizationState, 'revoked');
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'INSPECT_CANCELLED_RUN');
    assert.strictEqual(res.json?.nextSafeAction.executableNow, true);
  } finally {
    producer.cleanup();
  }
});

test('场景 10: stale 修订——运行基准落后于项目当前修订时推导 RECONCILE_STALE_RUN', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc10');
    const req = proj.records.requirements[0]!;

    // 写入一个基于 r2 的运行
    const run: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-SC10-STALE',
      revision: 1,
      projectId: proj.id,
      requirementId: req.id,
      createdAt: new Date().toISOString(),
      requestId: 'req-stale-001',
      requestHash: 'd'.repeat(64),
      baseRevision: proj.revision, // r2
      state: 'interrupted',
      stopReason: 'PROVIDER_RATE_LIMIT',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: producer.dir,
          readScope: ['*'],
          exclude: [],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false,
        fingerprint: 'fp-valid-001'
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: new Date().toISOString(), type: 'interrupted', details: {} }]
    };
    producer.runStore.create(run);

    // 项目发生新变更，推进修订至 r3
    producer.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-SC10-1',
        requirementId: req.id,
        category: 'assumption',
        epistemicStatus: 'proposed',
        content: '新修订假设',
        sourceRefs: [proj.records.sources[0]!.id],
        evidenceRefs: []
      },
      reason: '更新上下文，推进修订',
      confirmed: true
    }, 'add-ctx-sc10');
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.authorizations.authorizationState, 'stale_revision');
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'RECONCILE_STALE_RUN');
    assert.strictEqual(res.json?.nextSafeAction.executableNow, true);
    assert.ok(res.json?.nextSafeAction.blockingIssues.some(b => b.includes('不一致') || b.includes('落后')));
  } finally {
    producer.cleanup();
  }
});

test('场景 11: 无指纹旧运行——中断运行缺少 fingerprint 校验依据，推导 REQUIRE_RUN_AUTHORIZATION 并说明指纹缺失', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc11');
    const req = proj.records.requirements[0]!;

    const legacyRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-SC11-NOFP',
      revision: 1,
      projectId: proj.id,
      requirementId: req.id,
      createdAt: new Date().toISOString(),
      requestId: 'req-nofp-001',
      requestHash: 'e'.repeat(64),
      baseRevision: proj.revision,
      state: 'interrupted',
      stopReason: 'PROVIDER_RATE_LIMIT',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: producer.dir,
          readScope: ['*'],
          exclude: [],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false
        // 缺少 fingerprint
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: new Date().toISOString(), type: 'started', details: {} }]
    };
    producer.runStore.create(legacyRun);
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'REQUIRE_RUN_AUTHORIZATION');
    assert.ok(res.json?.nextSafeAction.blockingIssues.some(b => b.includes('旧运行缺少配置指纹校验依据')));
  } finally {
    producer.cleanup();
  }
});

test('场景 12: 未应用候选——已保留（kept）候选不混淆为正式事实，准确提示待人工决定', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc12');
    const req = proj.records.requirements[0]!;

    const keptRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-SC12-KEPT',
      revision: 1,
      projectId: proj.id,
      requirementId: req.id,
      createdAt: new Date().toISOString(),
      requestId: 'req-kept-001',
      requestHash: 'f'.repeat(64),
      baseRevision: proj.revision,
      state: 'waiting_human',
      stopReason: 'human_decision_required',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: producer.dir,
          readScope: ['*'],
          exclude: [],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false,
        fingerprint: 'fp-valid-001'
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: req.id,
        category: 'assumption',
        epistemicStatus: 'proposed',
        content: '已保留假设',
        sourceRefs: [proj.records.sources[0]!.id]
      },
      issues: [],
      outcome: 'kept', // 人端决定保留但未合入正式记录
      receipt: null,
      events: [{ sequence: 1, at: new Date().toISOString(), type: 'kept', details: {} }]
    };
    producer.runStore.create(keptRun);
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.progress.keptCandidateCount, 1);
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'REVIEW_CANDIDATE_IN_HUMAN_BOARD');
    assert.ok(res.json?.nextSafeAction.description.includes('已保留候选（待人工决定或未合入正式记录）'));
  } finally {
    producer.cleanup();
  }
});

test('场景 13: 结构不完整 / 矛盾——需求缺少标题或完成态核查缺失，推导 STOP_AND_REPORT_GAP 阻断执行', () => {
  const producer = createProducerEnv();
  try {
    const proj = initBaseProject(producer, 'sc13');
    // 直接破坏 JSON 文件中的结构：将需求标题清空
    const projectPath = join(producer.projectDir, `${proj.id}.json`);
    const content = JSON.parse(producer.projectStore.get(proj.id) ? JSON.stringify(producer.projectStore.get(proj.id)) : '{}');
    content.records.requirements[0].title = '   '; // 破坏标题
    writeFileSync(projectPath, JSON.stringify(content, null, 2), 'utf8');
    producer.store.close();

    const res = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: proj.id
    });
    assert.strictEqual(res.status, 0);
    assert.strictEqual(res.json?.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(res.json?.gapReport.hasGap, true);
    assert.ok(res.json?.gapReport.missingFacts.some(f => f.includes('缺少有效标题')));
  } finally {
    producer.cleanup();
  }
});

test('场景 14: Markdown 出错路径与端点保护——项目不存在或缺少参数返回错误响应，HTTP 服务保持健康无 unhandledRejection', async () => {
  const producer = createProducerEnv();
  try {
    // 1. CLI 缺少必填参数
    const resMissing = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir
      // 缺少 projectId
    });
    assert.strictEqual(resMissing.status, 1);
    assert.strictEqual(resMissing.error?.code, 'MISSING_ARGUMENTS');

    // 2. CLI 项目不存在
    const res404 = runConsumerCli({
      projectDir: producer.projectDir,
      runDir: producer.runDir,
      projectId: 'NONEXISTENT-PROJECT-ID'
    });
    assert.strictEqual(res404.status, 1);
    assert.strictEqual(res404.error?.code, 'PROJECT_NOT_FOUND');

    // 3. HTTP 服务器端的 Markdown 404 与防 premature writeHead 验证
    const proj = initBaseProject(producer, 'sc14');
    const serverInstance = createHubServer({
      store: producer.store,
      service: new BoardService(producer.store, toolCredentials, id => producer.projectStore.get(id) !== undefined),
      recordService: producer.recordService,
      recoveryService: producer.recoveryService,
      harness: producer.harness,
      webRoot: resolve('dist/web')
    });

    const mockHttp = await new Promise<{ server: any; url: string; close: () => Promise<void> }>((r) => {
      serverInstance.listen(0, '127.0.0.1', () => {
        const addr = serverInstance.address() as { port: number };
        r({
          server: serverInstance,
          url: `http://127.0.0.1:${addr.port}`,
          close: () => new Promise<void>((done) => serverInstance.close(() => done()))
        });
      });
    });

    try {
      // 登录获取认证 Cookie
      const loginResp = await fetch(`${mockHttp.url}/api/login`, {
        method: 'POST',
        headers: { Origin: mockHttp.url, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test-admin-password' })
      });
      assert.strictEqual(loginResp.status, 200);
      const cookie = loginResp.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);

      // 3.1 请求不存在项目的 Markdown 恢复视图，验证返回 404 JSON 而非触发 ERR_HTTP_HEADERS_SENT
      const resp404 = await fetch(`${mockHttp.url}/api/record-projects/nonexistent-proj/recovery?format=markdown`, {
        headers: { Cookie: cookie }
      });
      assert.strictEqual(resp404.status, 404);
      const json404 = await resp404.json() as { error: { code: string } };
      assert.strictEqual(json404.error.code, 'PROJECT_NOT_FOUND');

      // 3.2 正常项目的 Markdown 恢复视图，验证 200 返回 text/markdown 并包含核心规范段落
      const resp200 = await fetch(`${mockHttp.url}/api/record-projects/${proj.id}/recovery?format=markdown`, {
        headers: { Cookie: cookie }
      });
      assert.strictEqual(resp200.status, 200);
      assert.ok(resp200.headers.get('content-type')?.includes('text/markdown'));
      const mdBody = await resp200.text();
      assert.ok(mdBody.includes('# 项目冷启动恢复视图'));
      assert.ok(mdBody.includes('## 0. 规范与更新协议'));
      assert.ok(mdBody.includes('## 5. 依据与证据链'));
    } finally {
      await mockHttp.close();
    }
  } finally {
    producer.cleanup();
  }
});
