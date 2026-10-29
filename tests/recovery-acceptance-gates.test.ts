import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RecordProjectService } from '../src/application/record-project-service.js';
import { JsonRecordProjectStore } from '../src/infrastructure/record-project-store.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { JsonRunStore } from '../src/infrastructure/run-store.js';
import { RecoveryService } from '../src/application/recovery-service.js';
import { BoardService } from '../src/application/board-service.js';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { initializeAdmin, toolCredentials } from '../src/infrastructure/auth.js';
import { checkRequirementAcceptanceEligibility, buildRecoveryProjection } from '../src/domain/recovery.js';
import type { RecordProject } from '../src/domain/record-project.js';
import type { HarnessRun } from '../src/domain/harness.js';
import { HubError } from '../src/domain/board.js';

import { HarnessService } from '../src/application/harness-service.js';
import { createCandidateValidator } from '../src/infrastructure/harness-validator.js';
import { scriptedModel } from '../src/infrastructure/scripted-model.js';

const human = { kind: 'human' as const, id: 'test-admin' };

function createTestEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-gate-test-'));
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
    model: scriptedModel
  });
  const recoveryService = new RecoveryService({ projects: projectStore, runs: runStore, validator });

  return {
    dir,
    store,
    projectStore,
    runStore,
    recordService,
    harness,
    recoveryService,
    validator,
    cleanup() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

function initBaseProject(env: ReturnType<typeof createTestEnv>, suffix = 'test'): RecordProject {
  const SUFFIX = suffix.toUpperCase();
  const initial = env.recordService.create(human, {
    name: `项目 ${SUFFIX}`,
    title: `意图 ${SUFFIX}`,
    problem: `痛点 ${SUFFIX}`,
    expectedOutcome: `期望 ${SUFFIX}`,
    includes: ['范围一'],
    excludes: [],
    constraints: ['约束一'],
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

test('Batch 1 反例 1: pullRequest 为 null 时，恢复视图不能建议整体验收，且 acceptRequirement 必须前置拒绝', () => {
  const env = createTestEnv();
  try {
    const proj = initBaseProject(env, 'pr-null');
    const req = proj.records.requirements[0]!;
    const sourceRef = proj.records.sources[0]!.id;

    // 1. 录入有效证据
    const withEv = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-PR-1',
        requirementId: req.id,
        targets: [{ kind: 'requirement', id: req.id }],
        description: '有效测试证据', subject: '测试通过', environment: 'test',
        observedResult: 'PASS', limitations: [], sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'add-ev-pr-1');

    // 2. 录入通过的核查（非 model_review，且有适用证据引用）
    const withVerif = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-PR-1',
        target: { kind: 'requirement', id: req.id },
        criterionId: req.acceptanceCriteria[0]!.id,
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-PR-1'],
        sourceRefs: [sourceRef],
        explanation: '测试准则通过'
      },
      reason: '核验通过',
      confirmed: true
    }, 'add-verif-pr-1');

    // 3. 补充完成结果 result，但 pullRequest 保持为 null
    const withResultNoPR = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withVerif.revision,
      collection: 'requirements',
      id: req.id,
      record: {
        ...withVerif.records.requirements[0]!,
        status: 'review',
        result: { what: '已完成功能', why: '通过测试', actualImpact: '符合预期', evidenceRefs: ['EV-PR-1'] },
        pullRequest: null // 缺失 PR
      },
      reason: '更新结果但未提交 PR',
      confirmed: true
    }, 'add-result-no-pr-1');

    // 检验纯领域判定函数
    const eligibility = checkRequirementAcceptanceEligibility(withResultNoPR.records.requirements[0]!, withResultNoPR.records, []);
    assert.strictEqual(eligibility.eligible, false, '缺失 pullRequest 必须判定为不可整体验收');
    assert.ok(eligibility.reasons.some(r => r.includes('Pull Request') || r.includes('pullRequest')), '原因中必须说明缺少 PR');

    // 检验恢复视图动作推导
    const view = env.recoveryService.getRecoveryView(human, proj.id, { targetRequirementId: req.id });
    assert.notStrictEqual(view.nextSafeAction.actionCode, 'REQUEST_HUMAN_OVERALL_ACCEPTANCE', '未关联合法 PR 绝不能推导 REQUEST_HUMAN_OVERALL_ACCEPTANCE');
    assert.ok(!view.unknowns.pendingHumanGates.some(g => g.includes('Overall Acceptance Gate')), '未关联合法 PR 绝不能在 pendingHumanGates 中挂载整体验收门禁');
    assert.ok(view.nextSafeAction.blockingIssues.some(b => b.includes('Pull Request') || b.includes('pullRequest')), '阻塞理由中必须明确提示缺少 PR');

    // 检验真实 acceptRequirement 入口：必须在前置检查中被拒绝，且记录不发生变化
    assert.throws(() => {
      env.recordService.acceptRequirement(human, proj.id, req.id, {
        baseRevision: withResultNoPR.revision,
        confirmed: true,
        reason: '尝试非法验收'
      }, 'try-accept-no-pr');
    }, (err: unknown) => {
      assert.ok(err instanceof HubError);
      assert.strictEqual(err.code, 'INVALID_RECORD_SET');
      assert.ok((err as any).report?.issues?.some((i: any) => i.code === 'ACCEPTANCE_PREFLIGHT_FAILED' && (i.message.includes('Pull Request') || i.message.includes('pullRequest'))));
      return true;
    });

    // 确认项目 revision 和记录未被污染
    const current = env.projectStore.get(proj.id)!;
    assert.strictEqual(current.revision, withResultNoPR.revision);
    assert.strictEqual(current.records.requirements[0]!.status, 'review');
  } finally {
    env.cleanup();
  }
});

test('Batch 1 反例 2: 核查为 model_review 时，不能满足整体验收条件', () => {
  const env = createTestEnv();
  try {
    const proj = initBaseProject(env, 'model-rev');
    const req = proj.records.requirements[0]!;
    const sourceRef = proj.records.sources[0]!.id;

    // 1. 录入有效证据
    const withEv = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-MR-1',
        requirementId: req.id,
        targets: [{ kind: 'requirement', id: req.id }],
        description: '有效测试证据', subject: '模型评估报告', environment: 'local',
        observedResult: 'PASS', limitations: [], sourceRefs: [sourceRef]
      },
      reason: '录入证据',
      confirmed: true
    }, 'add-ev-mr-1');

    // 2. 录入核查，但 method 为 model_review（依据 record-relations.ts，模型审查不能单独满足完成条件）
    const withVerif = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-MR-1',
        target: { kind: 'requirement', id: req.id },
        criterionId: req.acceptanceCriteria[0]!.id,
        method: 'model_review', // 纯模型审查
        outcome: 'passed',
        evidenceRefs: ['EV-MR-1'],
        sourceRefs: [sourceRef],
        explanation: '模型审查通过'
      },
      reason: '核验通过',
      confirmed: true
    }, 'add-verif-mr-1');

    // 3. 补充 PR 与完成结果
    const withPR = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withVerif.revision,
      collection: 'requirements',
      id: req.id,
      record: {
        ...withVerif.records.requirements[0]!,
        status: 'review',
        result: { what: '完成', why: '审查通过', actualImpact: '无', evidenceRefs: ['EV-MR-1'] },
        pullRequest: {
          url: 'https://github.com/BobcGn/AgentHub/pull/1',
          what: 'PR',
          why: 'Done',
          verification: 'CI',
          result: 'Pass'
        }
      },
      reason: '补充 PR 记录',
      confirmed: true
    }, 'add-pr-mr-1');

    // 检验纯领域判定函数
    const eligibility = checkRequirementAcceptanceEligibility(withPR.records.requirements[0]!, withPR.records, []);
    assert.strictEqual(eligibility.eligible, false, '核查 method 为 model_review 必须判定为不可整体验收');
    assert.ok(eligibility.reasons.some(r => r.includes('model_review') || r.includes('模型审查')), '原因中必须说明模型审查不能单独满足');

    // 检验恢复视图动作推导
    const view = env.recoveryService.getRecoveryView(human, proj.id, { targetRequirementId: req.id });
    assert.notStrictEqual(view.nextSafeAction.actionCode, 'REQUEST_HUMAN_OVERALL_ACCEPTANCE', '仅有 model_review 绝不能推导 REQUEST_HUMAN_OVERALL_ACCEPTANCE');
    assert.ok(!view.unknowns.pendingHumanGates.some(g => g.includes('Overall Acceptance Gate')), '仅有 model_review 绝不能挂载整体验收门禁');

    // 检验真实 acceptRequirement 入口：必须在前置检查中拒绝
    assert.throws(() => {
      env.recordService.acceptRequirement(human, proj.id, req.id, {
        baseRevision: withPR.revision,
        confirmed: true,
        reason: '尝试非法验收'
      }, 'try-accept-mr');
    }, (err: unknown) => {
      assert.ok(err instanceof HubError);
      assert.strictEqual(err.code, 'INVALID_RECORD_SET');
      assert.ok((err as any).report?.issues?.some((i: any) => i.code === 'ACCEPTANCE_PREFLIGHT_FAILED' && (i.message.includes('model_review') || i.message.includes('模型审查'))));
      return true;
    });
  } finally {
    env.cleanup();
  }
});

test('Batch 1 反例 3: 数据结构损坏（如 requirements: null / intent: null）时必须安全阻断，禁止抛出 TypeError', () => {
  const env = createTestEnv();
  try {
    const proj = initBaseProject(env, 'struct-err');

    // 构造一份损坏的数据：requirements 设为 null
    const corruptedProject = {
      ...proj,
      records: {
        ...proj.records,
        requirements: null as unknown as typeof proj.records.requirements
      }
    };

    // 直接调用纯领域投影函数，传入结构校验问题
    const structureIssues = [{ code: 'INVALID_TYPE', path: '/requirements', message: 'must be array' }];
    const view = buildRecoveryProjection(corruptedProject, [], { structureIssues });

    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(view.nextSafeAction.executableNow, false);
    assert.strictEqual(view.gapReport.hasGap, true);
    assert.ok(view.gapReport.missingFacts.some(f => f.includes('must be array') || f.includes('/requirements')));

    // 检查 Markdown 渲染入口也不得抛出未捕获异常
    const md = env.recoveryService.formatRecoveryMarkdown(human, proj.id);
    assert.ok(typeof md === 'string' && md.length > 0);
  } finally {
    env.cleanup();
  }
});

  test('Batch 1 反例 4: 运行候选被人工拒绝（rejected）后，pendingHumanGates 绝不能挂载 Candidate Decision Gate', () => {
  const env = createTestEnv();
  try {
    const proj = initBaseProject(env, 'cand-rejected');
    const req = proj.records.requirements[0]!;

    const rejectedRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-REJECTED-1',
      revision: 1,
      projectId: proj.id,
      requirementId: req.id,
      createdAt: new Date().toISOString(),
      requestId: 'req-rejected-001',
      requestHash: 'e'.repeat(64),
      baseRevision: proj.revision,
      state: 'completed',
      stopReason: 'human_decision',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: false,
          root: env.dir,
          readScope: [],
          exclude: [],
          egressScope: 'local_only'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'scripted-v1',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false,
        fingerprint: 'a'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: req.id,
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '新待决问题',
        sourceRefs: [proj.records.sources[0]!.id]
      },
      issues: [],
      outcome: 'rejected',
      receipt: null,
      events: [{ sequence: 1, at: new Date().toISOString(), type: 'candidate_produced', details: {} }]
    };

    env.runStore.create(rejectedRun);

    const view = env.recoveryService.getRecoveryView(human, proj.id, { targetRequirementId: req.id });

    // 候选已被拒绝，待审候选计数必须为 0
    assert.strictEqual(view.progress.pendingCandidateCount, 0, '被拒绝的候选不能计入 pendingCandidateCount');
    assert.strictEqual(view.progress.keptCandidateCount, 0);

    // pendingHumanGates 绝不能出现 Candidate Decision Gate
    assert.ok(
      !view.unknowns.pendingHumanGates.some(g => g.includes('Candidate Decision Gate')),
      '已拒绝的候选绝不能要求等待人工决定（Candidate Decision Gate）'
    );
  } finally {
    env.cleanup();
  }
});

test('Batch 2 验证: 指定 targetRequirementId 时聚焦上下文，严格排除无关需求的数据、证据与假设', () => {
  const env = createTestEnv();
  try {
    const proj = initBaseProject(env, 'batch2-focus');
    const req1 = proj.records.requirements[0]!;
    const sourceRef = proj.records.sources[0]!.id;

    // 1. 创建需求 2
    const withReq2 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-BATCH2-2',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求二',
        problem: '问题二',
        expectedOutcome: '期望二',
        scope: { includes: ['范围二'], excludes: [] },
        constraints: [],
        rationale: '理由二',
        expectedImpact: '影响二',
        acceptanceCriteria: [{ id: 'C-B2-2', description: '准则二', verification: 'test' }],
        sourceRefs: [sourceRef],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求二',
      confirmed: true
    }, 'add-req2-b2');

    // 2. 分别为需求 1 和需求 2 录入独立的证据与核查
    const withEv1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withReq2.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-B2-REQ1',
        requirementId: req1.id,
        targets: [{ kind: 'requirement', id: req1.id }],
        description: '需求 1 专属证据',
        subject: '需求 1',
        environment: 'test',
        observedResult: '通过',
        limitations: [],
        sourceRefs: [sourceRef]
      },
      reason: '录入需求 1 证据',
      confirmed: true
    }, 'add-ev1-b2');

    const withEv2 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv1.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-B2-REQ2',
        requirementId: 'REQ-BATCH2-2',
        targets: [{ kind: 'requirement', id: 'REQ-BATCH2-2' }],
        description: '需求 2 专属证据',
        subject: '需求 2',
        environment: 'test',
        observedResult: '通过',
        limitations: [],
        sourceRefs: [sourceRef]
      },
      reason: '录入需求 2 证据',
      confirmed: true
    }, 'add-ev2-b2');

    const withVerif1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withEv2.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-B2-REQ1',
        target: { kind: 'requirement', id: req1.id },
        criterionId: req1.acceptanceCriteria[0]!.id,
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-B2-REQ1'],
        sourceRefs: [sourceRef],
        explanation: '需求 1 验证通过'
      },
      reason: '需求 1 核查',
      confirmed: true
    }, 'add-verif1-b2');

    const withVerif2 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withVerif1.revision,
      collection: 'verifications',
      id: null,
      record: {
        id: 'VERIF-B2-REQ2',
        target: { kind: 'requirement', id: 'REQ-BATCH2-2' },
        criterionId: 'C-B2-2',
        method: 'test',
        outcome: 'passed',
        evidenceRefs: ['EV-B2-REQ2'],
        sourceRefs: [sourceRef],
        explanation: '需求 2 验证通过'
      },
      reason: '需求 2 核查',
      confirmed: true
    }, 'add-verif2-b2');

    // 3. 录入全项目级问题与需求 2 专属问题
    const withCtxProj = env.recordService.saveRecord(human, proj.id, {
      baseRevision: withVerif2.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-PROJ-1',
        requirementId: null,
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '全项目未决问题 P',
        sourceRefs: [sourceRef],
        evidenceRefs: []
      },
      reason: '全项目级问题',
      confirmed: true
    }, 'add-ctx-proj');

    env.recordService.saveRecord(human, proj.id, {
      baseRevision: withCtxProj.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-REQ2-1',
        requirementId: 'REQ-BATCH2-2',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '需求 2 专属未决问题 Q2',
        sourceRefs: [sourceRef],
        evidenceRefs: []
      },
      reason: '需求 2 问题',
      confirmed: true
    }, 'add-ctx-req2');

    // 4. 聚焦需求 1 提取恢复视图
    const view1 = env.recoveryService.getRecoveryView(human, proj.id, { targetRequirementId: req1.id });

    // 必须聚焦于需求 1
    assert.strictEqual(view1.goal.activeRequirement?.id, req1.id);

    // 证据与核查列表仅包含需求 1，排除需求 2
    assert.ok(view1.evidence.verifications.some(v => v.id === 'VERIF-B2-REQ1'), '必须包含需求 1 的核查');
    assert.ok(!view1.evidence.verifications.some(v => v.id === 'VERIF-B2-REQ2'), '绝不得包含需求 2 的核查');

    assert.ok(view1.evidence.evidence.some(e => e.id === 'EV-B2-REQ1'), '必须包含需求 1 的证据');
    assert.ok(!view1.evidence.evidence.some(e => e.id === 'EV-B2-REQ2'), '绝不得包含需求 2 的证据');

    // 未决问题包含全项目级问题，但排除需求 2 的专属问题
    assert.ok(view1.unknowns.openQuestions.includes('全项目未决问题 P'), '必须包含全项目级问题');
    assert.ok(!view1.unknowns.openQuestions.includes('需求 2 专属未决问题 Q2'), '绝不得泄漏需求 2 专属问题');
  } finally {
    env.cleanup();
  }
});

test('Batch 3 验证: RecoveryService 纯只读投影与人端主体检查解耦，CLI 独立进程无需伪造身份', () => {
  const env = createTestEnv();
  try {
    const proj = initBaseProject(env, 'batch3-decouple');

    // 1. getProjectRecovery 纯只读投影：无需 Principal 参数即可成功获取
    const view = env.recoveryService.getProjectRecovery(proj.id);
    assert.strictEqual(view.projectId, proj.id);
    assert.strictEqual(view.goal.intent.title, '意图 BATCH3-DECOUPLE');

    // 2. formatProjectRecoveryMarkdown 纯只读渲染：无需 Principal 参数即可格式化
    const md = env.recoveryService.formatProjectRecoveryMarkdown(proj.id);
    assert.ok(md.includes('意图 BATCH3-DECOUPLE'));

    // 3. getRecoveryView 面向 HTTP 依然严格要求 human 身份门禁，拒绝非 human 主体
    assert.throws(() => {
      env.recoveryService.getRecoveryView({ kind: 'tool' } as any, proj.id);
    }, (err: any) => err.code === 'FORBIDDEN');
  } finally {
    env.cleanup();
  }
});
