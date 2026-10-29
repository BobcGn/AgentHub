import test from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { initializeAdmin, toolCredentials } from '../src/infrastructure/auth.js';
import { JsonRecordProjectStore } from '../src/infrastructure/record-project-store.js';
import { JsonRunStore, resolveRunLocatorPath, readSafeRunFile } from '../src/infrastructure/run-store.js';
import { BoardService } from '../src/application/board-service.js';
import { RecordProjectService } from '../src/application/record-project-service.js';
import { RecoveryService } from '../src/application/recovery-service.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { createCandidateValidator } from '../src/infrastructure/harness-validator.js';
import { scriptedModel } from '../src/infrastructure/scripted-model.js';
import { HarnessService } from '../src/application/harness-service.js';
import { createHubServer } from '../src/infrastructure/http-server.js';
import {
  buildRecoveryProjection,
  validateRecoveryBudget,
  verifyRetrievedRunAuthorization,
  analyzeProjectAuthorizations,
  renderVerificationMarkdown,
  createVerificationJsonReport,
  getUtf8ByteLength,
  DEFAULT_RECOVERY_BUDGET_BYTES,
  MIN_RECOVERY_BUDGET_BYTES,
  MAX_RECOVERY_BUDGET_BYTES,
  type ProjectRecoveryView
} from '../src/domain/recovery.js';
import { inspectRecordRelations } from '../src/domain/record-relations.js';
import type { RecordProject } from '../src/domain/record-project.js';
import type { ModelPort, HarnessRun } from '../src/domain/harness.js';

const human = { kind: 'human' as const };

function runConsumerCli(args: {
  projectDir: string;
  runDir: string;
  projectId?: string;
  targetRequirementId?: string;
  format?: 'json' | 'markdown';
  budgetBytes?: number | string;
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
    ...(args.format ? ['--format', args.format] : []),
    ...(args.budgetBytes !== undefined ? ['--budgetBytes', String(args.budgetBytes)] : [])
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

function createTestEnv(model: ModelPort = scriptedModel) {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-packet-budget-'));
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
  const recovery = new RecoveryService({
    projects: projectStore,
    runs: runStore,
    validator
  });

  return {
    dir,
    projectDir: join(dir, 'record-projects'),
    runDir: join(dir, 'runs'),
    store,
    projectStore,
    runStore,
    service,
    recordService,
    harness,
    recovery,
    cleanup: () => {
      if (store.db.open) store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('Batch 1 反例 1: 项目级 confirmed 决定与需求级 constraint 必须进入恢复包及 Markdown，保留出处与 ID', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '项目 B1',
      title: '意图 B1',
      problem: '痛点 B1',
      expectedOutcome: '期望 B1',
      includes: ['核心范畴'],
      excludes: ['外围无关'],
      constraints: ['项目级意图约束'],
      confirmed: true
    }, 'init-proj-b1');

    // 1. 添加一个项目级 confirmed decision，带有独立出处
    const source1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-DECISION-1',
        kind: 'human_observation',
        locator: 'docs/decisions.md#D99.1',
        excerpt: '经用户裁决，跨会话采用确定性投影恢复。'
      },
      reason: '添加决策出处',
      confirmed: true
    }, 'req-src1');

    const source2 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: source1.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-REQ-1',
        kind: 'reference',
        locator: 'specs/req-1.md#L10-L20',
        excerpt: '需求一详细技术规范说明'
      },
      reason: '添加需求出处',
      confirmed: true
    }, 'req-src2');

    // 添加项目级 confirmed 决定
    const pWithDecision = env.recordService.saveRecord(human, proj.id, {
      baseRevision: source2.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-DEC-1',
        requirementId: null, // 项目级
        category: 'decision',
        content: '架构决定：跨会话采用确定性投影恢复，零 Schema 扩张。',
        epistemicStatus: 'confirmed',
        sourceRefs: ['SRC-DECISION-1'],
        evidenceRefs: []
      },
      reason: '添加架构决定',
      confirmed: true
    }, 'req-dec1');

    // 添加需求一
    const pWithReq = env.recordService.saveRecord(human, proj.id, {
      baseRevision: pWithDecision.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-B1-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 B1-1',
        problem: '问题 B1-1',
        expectedOutcome: '期望 B1-1',
        scope: { includes: ['需求一范围'], excludes: [] },
        constraints: ['需求级自身约束'],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-B1-1', description: '条件一', verification: 'test' }],
        sourceRefs: ['SRC-REQ-1'],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '添加需求一',
      confirmed: true
    }, 'req-add1');

    // 添加归属于需求一的 contextItem 约束
    const finalProj = env.recordService.saveRecord(human, proj.id, {
      baseRevision: pWithReq.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-CONST-1',
        requirementId: 'REQ-B1-1',
        category: 'constraint',
        content: '需求约束：必须保持与真实文件系统大小写一致。',
        epistemicStatus: 'confirmed',
        sourceRefs: ['SRC-REQ-1'],
        evidenceRefs: []
      },
      reason: '添加需求约束',
      confirmed: true
    }, 'req-const1');

    env.store.close();

    // 跨进程恢复
    const res = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: finalProj.id,
      targetRequirementId: 'REQ-B1-1'
    });

    assert.strictEqual(res.status, 0, res.stderr);
    const view = res.json!;
    assert.ok(view);

    // 验证 contextItems 包含项目级 confirmed decision 和需求级 constraint
    assert.ok(Array.isArray(view.contextItems), 'view.contextItems 必须为数组');
    const decItem = view.contextItems.find(c => c.id === 'CTX-DEC-1');
    assert.ok(decItem, '项目级 confirmed 决定必须进入 recovery 视图');
    assert.strictEqual(decItem.category, 'decision');
    assert.strictEqual(decItem.epistemicStatus, 'confirmed');
    assert.ok(decItem.sourceRefs.includes('SRC-DECISION-1'), 'sourceRefs 必须包含 SRC-DECISION-1');

    const constItem = view.contextItems.find(c => c.id === 'CTX-CONST-1');
    assert.ok(constItem, '需求级 constraint 必须进入 recovery 视图');
    assert.strictEqual(constItem.category, 'constraint');
    assert.ok(constItem.sourceRefs.includes('SRC-REQ-1'), 'sourceRefs 必须包含 SRC-REQ-1');

    // 验证出处闭包：SRC-DECISION-1 与 SRC-REQ-1 均完整保留在 evidence.sources 中
    const srcDec = view.evidence.sources.find(s => s.id === 'SRC-DECISION-1');
    assert.ok(srcDec, '项目级决定的出处 SRC-DECISION-1 必须被闭包保留，不得被过滤');
    assert.strictEqual(srcDec.locator, 'docs/decisions.md#D99.1');

    const srcReq = view.evidence.sources.find(s => s.id === 'SRC-REQ-1');
    assert.ok(srcReq, '需求约束的出处 SRC-REQ-1 必须保留');

    // 验证 Markdown 格式下完整呈现
    const mdRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: finalProj.id,
      targetRequirementId: 'REQ-B1-1',
      format: 'markdown'
    });
    assert.strictEqual(mdRes.status, 0);
    assert.ok(mdRes.stdout.includes('CTX-DEC-1'), 'Markdown 必须列出已确认决定 ID');
    assert.ok(mdRes.stdout.includes('架构决定：跨会话采用确定性投影恢复'), 'Markdown 必须列出决定内容');
    assert.ok(mdRes.stdout.includes('CTX-CONST-1'), 'Markdown 必须列出约束 ID');
    assert.ok(mdRes.stdout.includes('必须保持与真实文件系统大小写一致'), 'Markdown 必须列出约束内容');
  } finally {
    env.cleanup();
  }
});

test('Batch 1 反例 2: proposed 决定绝不能升级为 confirmed 决定，目标外无关数据严格排除', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '项目 B1-2',
      title: '意图 B1-2',
      problem: '痛点',
      expectedOutcome: '期望',
      includes: ['目标范围'],
      excludes: [],
      constraints: [],
      confirmed: true
    }, 'init-proj-b1-2');

    // 添加需求一
    const p1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求一',
        problem: '问题一',
        expectedOutcome: '期望一',
        scope: { includes: ['范围一'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-1', description: '准则', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求一',
      confirmed: true
    }, 'req-b1-2-1');

    // 添加需求二（目标外）
    const p2 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: p1.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-2',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求二（目标外）',
        problem: '问题二',
        expectedOutcome: '期望二',
        scope: { includes: ['范围二'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-2', description: '准则二', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求二',
      confirmed: true
    }, 'req-b1-2-2');

    // 添加属于 REQ-2 的 contextItem
    const p3 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: p2.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-FOREIGN',
        requirementId: 'REQ-2',
        category: 'decision',
        content: '需求二独有决定',
        epistemicStatus: 'confirmed',
        sourceRefs: [],
        evidenceRefs: []
      },
      reason: '添加需求二上下文',
      confirmed: true
    }, 'req-b1-2-ctx-foreign');

    // 添加一个 proposed 决定
    const finalProj = env.recordService.saveRecord(human, proj.id, {
      baseRevision: p3.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-PROP-DEC',
        requirementId: 'REQ-1',
        category: 'decision',
        content: '草案决定（尚未确认）',
        epistemicStatus: 'proposed',
        sourceRefs: [],
        evidenceRefs: []
      },
      reason: '添加草案决定',
      confirmed: true
    }, 'req-b1-2-ctx-prop');

    env.store.close();

    const res = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: finalProj.id,
      targetRequirementId: 'REQ-1'
    });

    assert.strictEqual(res.status, 0, res.stderr);
    const view = res.json!;

    // 目标外 contextItem CTX-FOREIGN 必须被排除
    assert.strictEqual(view.contextItems.some(c => c.id === 'CTX-FOREIGN'), false, '目标外需求 REQ-2 的 contextItem 必须被排除');

    // proposed 决定必须保持 proposed，绝不能升级为 confirmed
    const propItem = view.contextItems.find(c => c.id === 'CTX-PROP-DEC');
    assert.ok(propItem, '属于目标需求的 proposed 决定保留在 contextItems 中');
    assert.strictEqual(propItem.epistemicStatus, 'proposed', 'proposed 决定状态必须保持 proposed');
  } finally {
    env.cleanup();
  }
});

test('Batch 2 反例: 数据结构损坏 (requirements[0].title=42, null 元素, 错类型) 在所有入口安全停止，不抛 TypeError', () => {
  // 1. requirements[0].title 为数字 42
  const corruptedDataTitleNumber: any = {
    schemaVersion: '1.0.0',
    intent: {
      id: 'INTENT-1',
      title: '意图',
      problem: '痛点',
      expectedOutcome: '期望',
      scope: { includes: [], excludes: [] },
      constraints: [],
      sourceRefs: [],
      confirmation: { state: 'human_confirmed', sourceRefs: [] }
    },
    requirements: [
      {
        id: 'REQ-1',
        title: 42, // 非法类型：数字而非字符串！
        problem: '问题',
        expectedOutcome: '期望',
        scope: { includes: [], excludes: [] },
        constraints: [],
        acceptanceCriteria: [],
        sourceRefs: [],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      }
    ],
    units: [],
    stories: [],
    boltPlans: [],
    sources: [],
    verifications: [],
    evidence: [],
    contextItems: []
  };

  const corruptedProj1: RecordProject = {
    id: 'corrupted-proj-1',
    name: '损坏项目1',
    createdAt: new Date().toISOString(),
    revision: 1,
    records: corruptedDataTitleNumber,
    audit: [],
    migration: null
  };

  // buildRecoveryProjection 直接调用不抛异常
  assert.doesNotThrow(() => {
    const view = buildRecoveryProjection(corruptedProj1, []);
    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(view.nextSafeAction.executableNow, false);
    assert.strictEqual(view.gapReport.hasGap, true);
  }, 'requirements[0].title 为数字时绝不能抛出 TypeError');

  // 2. requirements 数组内包含 null 元素
  const corruptedDataArrayNull: any = {
    schemaVersion: '1.0.0',
    intent: {
      id: 'INTENT-1',
      title: '意图',
      problem: '痛点',
      expectedOutcome: '期望',
      scope: { includes: [], excludes: [] },
      constraints: [],
      sourceRefs: [],
      confirmation: { state: 'human_confirmed', sourceRefs: [] }
    },
    requirements: [null], // 数组内元素为 null
    units: [],
    stories: [],
    boltPlans: [],
    sources: [],
    verifications: [],
    evidence: [],
    contextItems: []
  };

  const corruptedProj2: RecordProject = {
    id: 'corrupted-proj-2',
    name: '损坏项目2',
    createdAt: new Date().toISOString(),
    revision: 1,
    records: corruptedDataArrayNull,
    audit: [],
    migration: null
  };

  assert.doesNotThrow(() => {
    const view = buildRecoveryProjection(corruptedProj2, []);
    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(view.nextSafeAction.executableNow, false);
  }, 'requirements[0] 为 null 时绝不能抛出异常');

  // 3. units 为对象而非数组
  const corruptedUnitsObj: any = {
    ...corruptedDataTitleNumber,
    requirements: [],
    units: { bad: true } // 错顶级类型
  };
  const corruptedProj3: RecordProject = {
    id: 'corrupted-proj-3',
    name: '损坏项目3',
    createdAt: new Date().toISOString(),
    revision: 1,
    records: corruptedUnitsObj,
    audit: [],
    migration: null
  };

  assert.doesNotThrow(() => {
    const view = buildRecoveryProjection(corruptedProj3, []);
    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
  });

  // 4. 未知合同版本 schemaVersion
  const unknownSchemaData: any = {
    ...corruptedDataTitleNumber,
    schemaVersion: '9.9.9',
    requirements: []
  };
  const corruptedProj4: RecordProject = {
    id: 'corrupted-proj-4',
    name: '损坏项目4',
    createdAt: new Date().toISOString(),
    revision: 1,
    records: unknownSchemaData,
    audit: [],
    migration: null
  };
  const view4 = buildRecoveryProjection(corruptedProj4, []);
  assert.strictEqual(view4.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
  assert.ok(view4.gapReport.missingFacts.some(f => f.includes('不支持的记录合同版本')));
});

test('Batch 3 反例 1: 预算配置参数严格校验 (NaN, Infinity, 负数, 字符串, 超界)', () => {
  // 常量及默认值验证
  assert.strictEqual(MIN_RECOVERY_BUDGET_BYTES, 4096);
  assert.strictEqual(MAX_RECOVERY_BUDGET_BYTES, 1048576);
  assert.strictEqual(validateRecoveryBudget(undefined), DEFAULT_RECOVERY_BUDGET_BYTES);
  assert.strictEqual(validateRecoveryBudget(null), DEFAULT_RECOVERY_BUDGET_BYTES);
  assert.strictEqual(validateRecoveryBudget(32768), 32768);
  assert.strictEqual(validateRecoveryBudget(4096), 4096);
  assert.strictEqual(validateRecoveryBudget(1048576), 1048576);

  // 非法值拒绝
  assert.throws(() => validateRecoveryBudget(NaN), (err: any) => err.code === 'INVALID_BUDGET_CONFIGURATION');
  assert.throws(() => validateRecoveryBudget(Infinity), (err: any) => err.code === 'INVALID_BUDGET_CONFIGURATION');
  assert.throws(() => validateRecoveryBudget(-1024), (err: any) => err.code === 'INVALID_BUDGET_CONFIGURATION');
  assert.throws(() => validateRecoveryBudget(100), (err: any) => err.code === 'INVALID_BUDGET_CONFIGURATION'); // 小于 4096
  assert.throws(() => validateRecoveryBudget(2000000), (err: any) => err.code === 'INVALID_BUDGET_CONFIGURATION'); // 大于 1 MiB
  assert.throws(() => validateRecoveryBudget('32768'), (err: any) => err.code === 'INVALID_BUDGET_CONFIGURATION');
  assert.throws(() => validateRecoveryBudget(32768.5), (err: any) => err.code === 'INVALID_BUDGET_CONFIGURATION'); // 浮点数
});

test('Batch 3 反例 2: 必要内容超预算时明确停止并报告 (STOP_AND_REPORT_GAP, necessaryOverBudget)', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '预算超限项目',
      title: '非常长的大意图标题用于耗费预算'.repeat(20),
      problem: '非常详细的痛点说明用于占满空间'.repeat(30),
      expectedOutcome: '非常详细的预期结果用于测试预算边界'.repeat(30),
      includes: ['范围1'.repeat(20), '范围2'.repeat(20)],
      excludes: [],
      constraints: ['约束1'.repeat(20)],
      confirmed: true
    }, 'proj-overbudget');

    // 设定极小预算（4096 字节），而必要内容超过 4096 字节
    const view = env.recovery.getProjectRecovery(proj.id, { maxBudgetBytes: 4096 });

    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(view.nextSafeAction.executableNow, false);
    assert.ok(view.nextSafeAction.why.includes('必要上下文'), '必须说明必要内容超限');
    assert.strictEqual(view.contextBudget?.necessaryOverBudget, true);
    assert.strictEqual(view.contextBudget?.truncated, true);
  } finally {
    env.cleanup();
  }
});

test('Batch 3 反例 3: 可选内容超限时按序裁剪 (excerpt -> evidence -> assumptions) 并记录 omittedSummary', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '项目裁剪测试',
      title: '核心意图',
      problem: '核心问题',
      expectedOutcome: '核心期望',
      includes: ['核心'],
      excludes: [],
      constraints: ['核心约束'],
      confirmed: true
    }, 'proj-trim-test');

    // 添加多个长源码 excerpt (每个符合 schema maxLength 600，整体使全量视图达到 14 KiB)
    let curRev = proj.revision;
    const sourceIds: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const srcId = `SRC-LONG-${i}`;
      sourceIds.push(srcId);
      const resProj = env.recordService.saveRecord(human, proj.id, {
        baseRevision: curRev,
        collection: 'sources',
        id: null,
        record: {
          id: srcId,
          kind: 'reference',
          locator: `src/long-${i}.ts#L1-L500`,
          excerpt: `超长代码片段第${i}段内容`.repeat(40) // 约 480 字符 <= 600
        },
        reason: `添加长源码 ${i}`,
        confirmed: true
      }, `req-trim-src-${i}`);
      curRev = resProj.revision;
    }

    // 添加需求（先创建需求，证据才能指向该需求）
    const p2 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: curRev,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-TRIM-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求裁剪',
        problem: '问题',
        expectedOutcome: '期望',
        scope: { includes: ['范围'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-TRIM-1', description: '准则', verification: 'test' }],
        sourceRefs: sourceIds,
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '添加需求',
      confirmed: true
    }, 'req-trim-req');

    // 添加带长正文的证据 (符合 schema maxLength 4000)
    const p3 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: p2.revision,
      collection: 'evidence',
      id: null,
      record: {
        id: 'EV-LONG-DESC',
        requirementId: 'REQ-TRIM-1',
        targets: [{ kind: 'requirement', id: 'REQ-TRIM-1' }],
        subject: '性能测试',
        environment: 'node v24',
        observedResult: '超长观测结果文本'.repeat(30), // 240 字符
        description: '超长说明'.repeat(30), // 120 字符
        limitations: [],
        sourceRefs: sourceIds
      },
      reason: '添加长证据',
      confirmed: true
    }, 'req-trim-ev');

    // 添加假设
    const finalProj = env.recordService.saveRecord(human, proj.id, {
      baseRevision: p3.revision,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-ASSUMPTION-1',
        requirementId: 'REQ-TRIM-1',
        category: 'assumption',
        content: '这是一个测试假设内容'.repeat(20),
        epistemicStatus: 'proposed',
        sourceRefs: sourceIds,
        evidenceRefs: ['EV-LONG-DESC']
      },
      reason: '添加假设',
      confirmed: true
    }, 'req-trim-ctx');

    env.store.close();

    // 设定 8192 字节预算：必要内容可装下，但加上源码 excerpt、证据正文和假设会超限，必须触发裁剪
    const res = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: finalProj.id,
      targetRequirementId: 'REQ-TRIM-1',
      budgetBytes: 8192
    });

    assert.strictEqual(res.status, 0, res.stderr);
    const view = res.json!;
    assert.ok(view);

    // 预算受控：实际字节不超过 8192
    assert.ok(view.contextBudget, '必须包含 contextBudget');
    assert.strictEqual(view.contextBudget.maxBudgetBytes, 8192);
    assert.ok(view.contextBudget.actualBytes <= 8192, `实际字节 (${view.contextBudget.actualBytes}) 必须 <= 预算上限 (8192)`);
    assert.strictEqual(view.contextBudget.truncated, true);

    // 检验 omittedSummary
    assert.ok(view.contextBudget.omittedSummary, '必须包含 omittedSummary');
    assert.ok(view.contextBudget.omittedSummary.totalOmitted > 0);
    assert.ok(view.contextBudget.omittedSummary.entries.some(e => e.kind === 'source_excerpt'));
    assert.ok(view.contextBudget.omittedSummary.retrievalGuide.includes('/api/record-projects/'));

    // 核心 Intent 与 Requirement 依然完整保留
    assert.strictEqual(view.goal.intent.title, '核心意图');
    assert.strictEqual(view.goal.activeRequirement?.id, 'REQ-TRIM-1');
  } finally {
    env.cleanup();
  }
});

test('Batch 3 反例 4: 多字节中文、JSON 转义真实字节计量与 Markdown 格式事实语义一致性', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '项目·计量一致性',
      title: '中文多字节意图包含引号"与换行\n以及特殊符号©™',
      problem: '多字节 UTF-8 编码下每个汉字占用 3 字节，转义后 \\" 占用 2 字节',
      expectedOutcome: '渲染后的最终 UTF-8 字节精确计量',
      includes: ['中文计量'],
      excludes: [],
      constraints: ['不得以字符数代替字节数'],
      confirmed: true
    }, 'proj-utf8-parity');

    const p1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-PARITY-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求·双格式一致性',
        problem: '验证 JSON 视图与 Markdown 视图的语义对齐',
        expectedOutcome: '所有事实一致',
        scope: { includes: ['一致性'], excludes: [] },
        constraints: ['严格等价'],
        rationale: '防止双重事实源',
        expectedImpact: '高可信',
        acceptanceCriteria: [{ id: 'C-PARITY-1', description: '准则', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求',
      confirmed: true
    }, 'req-parity');

    env.store.close();

    // 1. 获取 JSON 视图
    const jsonRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: p1.id,
      format: 'json'
    });
    assert.strictEqual(jsonRes.status, 0);
    const jsonView = jsonRes.json!;
    assert.ok(jsonView);
    assert.ok(jsonView.contextBudget);

    // 精确验证 UTF-8 字节数：CLI 交付字节严格对齐（Gap 1 修复）
    const rawJsonBytes = Buffer.byteLength(jsonRes.stdout, 'utf8');
    assert.strictEqual(jsonView.contextBudget.actualBytes, rawJsonBytes, 'contextBudget.actualBytes 必须严格等于 CLI 实际输出的 UTF-8 字节数');

    // 2. 获取 Markdown 视图
    const mdRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: p1.id,
      format: 'markdown'
    });
    assert.strictEqual(mdRes.status, 0);
    const mdText = mdRes.stdout;
    const mdRawBytes = Buffer.byteLength(mdRes.stdout, 'utf8');
    assert.ok(mdRawBytes > 0, 'Markdown 输出字节数必须大于 0');

    // 3. 语义严格对齐：同一 Intent 标题、同一 ActionCode、同一阻断原因
    assert.ok(mdText.includes(jsonView.goal.intent.title), 'Markdown 必须包含与 JSON 完全一致的 Intent 标题');
    assert.ok(mdText.includes(jsonView.nextSafeAction.actionCode), 'Markdown 必须包含与 JSON 完全一致的 actionCode');
    assert.ok(mdText.includes(jsonView.nextSafeAction.why), 'Markdown 必须包含与 JSON 完全一致的行动依据');
    assert.ok(mdText.includes('r' + jsonView.authorizations.projectRevision), 'Markdown 必须包含正确的基准修订');
  } finally {
    env.cleanup();
  }
});

test('Batch 3 反例 5: 未应用候选、过期授权和旧 Run 不因恢复操作而生效或续期', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '授权状态隔离项目',
      title: '意图',
      problem: '痛点',
      expectedOutcome: '期望',
      includes: ['范畴'],
      excludes: [],
      constraints: [],
      confirmed: true
    }, 'proj-auth-isolation');

    const p1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-AUTH-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求',
        problem: '问题',
        expectedOutcome: '期望',
        scope: { includes: ['范畴'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-AUTH-1', description: '准则', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求',
      confirmed: true
    }, 'req-auth-1');

    // 发起一次运行并人工取消
    const run = env.harness.start(human, p1.id, {
      requirementId: 'REQ-AUTH-1',
      baseRevision: p1.revision,
      instruction: '测试过期与候选隔离',
      confirmed: true
    }, 'req-auth-run-1');

    env.harness.cancel(human, run.id, {
      revision: run.revision
    });

    env.store.close();

    // 运行独立恢复消费者
    const res = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: p1.id
    });

    assert.strictEqual(res.status, 0);
    const view = res.json!;
    assert.ok(view);

    // 恢复操作绝不改变 Run 终态，绝不给予新执行授权
    assert.strictEqual(view.authorizations.authorizationState, 'revoked');
    assert.strictEqual(view.nextSafeAction.actionCode, 'INSPECT_CANCELLED_RUN');
    assert.strictEqual(view.nextSafeAction.executableNow, true); // 人工可核对取消原因
    assert.strictEqual(view.nextSafeAction.actor, 'human');

    // 重新从 runStore 读取，验证 Run 账本没有任何副作用篡改
    const reloadedRun = env.runStore.get(run.id);
    assert.ok(reloadedRun);
    assert.strictEqual(reloadedRun.state, 'cancelled');
    assert.strictEqual(reloadedRun.authorization.active, false);
  } finally {
    env.cleanup();
  }
});

test('第十轮缺口 1 复现与修复: CLI 交付格式 (cli_json / cli_markdown) 实际 UTF-8 输出严格受控于 budgetBytes，不因格式化与换行超限', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: 'CLI输出预算严格受控',
      title: '验证 CLI 在紧凑 JSON 满足但在格式化缩进与换行时可能超限的边界',
      problem: 'CLI 会将 JSON 进行 null, 2 缩进并追加末尾换行，Markdown 也会追加换行。如果仅以紧凑 JSON 计量，交付给消费者的字节数会突破预算。',
      expectedOutcome: '以实际交付 UTF-8 字节精确计量并执行预算，交付文本必须严格 <= maxBudgetBytes',
      includes: ['CLI 交付计量'],
      excludes: [],
      constraints: ['不得超预算交付'],
      confirmed: true
    }, 'proj-cli-budget-tight');

    const p1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-CLI-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求·CLI 格式化交付有界',
        problem: '测试边界预算 4643 字节',
        expectedOutcome: '紧凑约 4600 字节但格式化后约 5900 字节，必须触发有界剪裁或安全停止',
        scope: { includes: ['范围'], excludes: [] },
        constraints: ['严格受控'],
        rationale: '防止消费者内存溢出或 Token 超限',
        expectedImpact: '高可靠',
        acceptanceCriteria: [{ id: 'C-CLI-1', description: '准则', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求',
      confirmed: true
    }, 'req-cli-1');

    env.store.close();

    // 针对 4643 字节边界：测试 CLI JSON 输出
    const cliJsonRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: p1.id,
      format: 'json',
      budgetBytes: 4643
    });
    assert.strictEqual(cliJsonRes.status, 0);
    const jsonDeliveredBytes = Buffer.byteLength(cliJsonRes.stdout, 'utf8');
    assert.ok(jsonDeliveredBytes <= 4643, `CLI JSON 实际交付字节 (${jsonDeliveredBytes}) 必须严格 <= 4643 字节预算`);
    const jsonView = cliJsonRes.json!;
    assert.ok(jsonView);
    assert.ok(jsonView.contextBudget);
    assert.strictEqual(jsonView.contextBudget.actualBytes, jsonDeliveredBytes, 'contextBudget.actualBytes 必须完全与 CLI 实际 stdout 字节吻合');

    // 针对 4643 字节边界：测试 CLI Markdown 输出
    const cliMdRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: p1.id,
      format: 'markdown',
      budgetBytes: 4643
    });
    assert.strictEqual(cliMdRes.status, 0);
    const mdDeliveredBytes = Buffer.byteLength(cliMdRes.stdout, 'utf8');
    assert.ok(mdDeliveredBytes <= 4643, `CLI Markdown 实际交付字节 (${mdDeliveredBytes}) 必须严格 <= 4643 字节预算`);
  } finally {
    env.cleanup();
  }
});

test('第十轮缺口 2 复现与修复: 多个 proposed 决定在超限时被剪裁至 omittedSummary，无法容纳时强制停止，绝不以 49 KiB 超限继续给出授权', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: 'Proposed 决定大量堆积项目',
      title: '验证大量未确认 proposed 决定不会越界撑破恢复包',
      problem: '之前 proposed 决定没有纳入可选裁剪序列，且裁剪后超限未强制兜底，导致 49 KiB 恢复包仍给出授权',
      expectedOutcome: 'proposed 决定优先裁剪至 omittedSummary，若必要内容仍超限则停止',
      includes: ['裁剪 proposed 决定'],
      excludes: [],
      constraints: ['已确认决定必须保留'],
      confirmed: true
    }, 'proj-prop-dec');

    let currentRev = proj.revision;

    // 添加 1 个已确认决定 (必要内容)
    const p1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: currentRev,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-CONFIRMED-CORE',
        requirementId: null,
        category: 'decision',
        content: '核心架构决定：人工确认方案 A。' + '重要论据'.repeat(5),
        epistemicStatus: 'confirmed',
        sourceRefs: [proj.records.sources[0]!.id],
        evidenceRefs: []
      },
      reason: '添加核心已确认决定',
      confirmed: true
    }, 'req-dec-conf-1');
    currentRev = p1.revision;

    // 添加 3 个未确认 proposed 决定 (大体积可选内容，使全量视图达到约 11 KiB)
    for (let i = 1; i <= 3; i++) {
      const p = env.recordService.saveRecord(human, proj.id, {
        baseRevision: currentRev,
        collection: 'contextItems',
        id: null,
        record: {
          id: `CTX-PROP-${i}`,
          requirementId: null,
          category: 'decision',
          content: `草拟决定 ${i}: ` + '详细方案论证与候选对比分析正文'.repeat(40),
          epistemicStatus: 'proposed',
          sourceRefs: [proj.records.sources[0]!.id],
          evidenceRefs: []
        },
        reason: `添加草拟决定 ${i}`,
        confirmed: true
      }, `req-dec-prop-${i}`);
      currentRev = p.revision;
    }

    // 添加 1 个需求
    const reqRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: currentRev,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-PROP-TEST',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求·测试 proposed 决定剪裁',
        problem: '测试问题',
        expectedOutcome: '期望结果',
        scope: { includes: ['范围'], excludes: [] },
        constraints: ['约束'],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-PROP-1', description: '准则', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求',
      confirmed: true
    }, 'req-prop-test-1');
    currentRev = reqRes.revision;

    // 设定紧凑预算 9000 字节：全量约 12 KiB 超限，裁剪 3 个 proposed 决定后约 7.6 KiB 可容纳
    const view = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 9000,
      deliveryFormat: 'compact_json'
    });

    // 1. 体积严格受限于 9000 字节，绝不返回超限包
    assert.ok(view.contextBudget);
    assert.ok(view.contextBudget.actualBytes <= 9000, `实际字节 (${view.contextBudget.actualBytes}) 必须 <= 9000`);
    assert.strictEqual(view.contextBudget.truncated, true);

    // 2. 已确认决定 CTX-CONFIRMED-CORE 必须保留
    const hasConfirmed = view.contextItems.some(c => c.id === 'CTX-CONFIRMED-CORE');
    assert.strictEqual(hasConfirmed, true, '已确认决定 CTX-CONFIRMED-CORE 必须保留');

    // 3. proposed 决定被裁剪至 omittedSummary，并记录了具体 ID 与取回定位
    const omittedProposed = view.contextBudget.omittedSummary?.entries.filter(e => e.kind === 'context_item');
    assert.ok(omittedProposed && omittedProposed.length > 0, '至少部分 proposed 决定被裁剪并记录在 omittedSummary 中');
    for (const entry of omittedProposed) {
      assert.ok(entry.id.startsWith('CTX-PROP-'), '被省略项必须有明确具体的 ID');
      assert.ok(entry.retrievalLocator.includes('#records.contextItems[id='), '被省略项必须有精确定位锚点');
    }
  } finally {
    env.cleanup();
  }
});

test('第十轮缺口 3 复现与修复: 出处闭包完整性——裁剪绝不盲目截断 sources 数组，保留已确认决定与约束所依赖的来源', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '出处闭包测试项目',
      title: '验证裁剪时出处闭包完整',
      problem: '之前使用 slice(0, 3) 截断 sources，导致排在后面的已确认决定所依赖的出处被破坏',
      expectedOutcome: '保留项所引用的出处必须 100% 保留在 evidence.sources 中',
      includes: ['出处闭包'],
      excludes: [],
      constraints: ['不得破坏闭包'],
      confirmed: true
    }, 'proj-closure');

    let currentRev = proj.revision;

    // 连续添加 6 个 source (SRC-2 到 SRC-7，加上创建时的 SRC-1 共 7 个)
    const sourceIds: string[] = [proj.records.sources[0]!.id];
    for (let i = 2; i <= 7; i++) {
      const srcRes = env.recordService.saveRecord(human, proj.id, {
        baseRevision: currentRev,
        collection: 'sources',
        id: null,
        record: {
          id: `SRC-${i}`,
          kind: 'reference',
          locator: `docs/reference-${i}.md#L10`,
          excerpt: `关键原文片段 ${i}`.repeat(15)
        },
        reason: `添加出处 ${i}`,
        confirmed: true
      }, `req-add-src-${i}`);
      currentRev = srcRes.revision;
      sourceIds.push(`SRC-${i}`);
    }

    // 添加一个 confirmed 决定，显式依赖排在最后面的 source: SRC-7
    const lastSourceId = sourceIds[sourceIds.length - 1]!;
    const decRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: currentRev,
      collection: 'contextItems',
      id: null,
      record: {
        id: 'CTX-RETAIN-SRC-7',
        requirementId: null,
        category: 'decision',
        content: '依赖最后出处的架构决定',
        epistemicStatus: 'confirmed',
        sourceRefs: [lastSourceId],
        evidenceRefs: []
      },
      reason: '创建依赖 SRC-7 的决定',
      confirmed: true
    }, 'req-dec-src-7');
    currentRev = decRes.revision;

    // 触发预算裁剪 (例如 7000 字节)
    const view = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 7000,
      deliveryFormat: 'compact_json'
    });

    // 验证：
    // 1. CTX-RETAIN-SRC-7 处于保留项中
    const decItem = view.contextItems.find(c => c.id === 'CTX-RETAIN-SRC-7');
    assert.ok(decItem, 'CTX-RETAIN-SRC-7 必须被保留');
    assert.ok(decItem.sourceRefs.includes(lastSourceId), `CTX-RETAIN-SRC-7 必须保留对 ${lastSourceId} 的引用`);

    // 2. evidence.sources 中必须完整保留该决定所依赖的 lastSourceId (SRC-7)，绝不因 slice(0, 3) 丢失！
    const retainedSourceIds = view.evidence.sources.map(s => s.id);
    assert.ok(
      retainedSourceIds.includes(lastSourceId),
      `evidence.sources (${retainedSourceIds.join(', ')}) 必须包含 CTX-RETAIN-SRC-7 依赖的 ${lastSourceId}`
    );

    // 3. 未被引用的次要 source (例如 SRC-2, SRC-3 等未被引用的出处) 可以被裁剪并计入 omittedSummary
    assert.ok(view.contextBudget);
    const omittedSources = view.contextBudget.omittedSummary?.entries.filter(e => e.kind === 'source_excerpt') ?? [];
    for (const omitted of omittedSources) {
      assert.notStrictEqual(omitted.id, lastSourceId, '被引用的 SRC-7 绝不能出现在 omittedSummary 中');
    }
  } finally {
    env.cleanup();
  }
});

test('第十轮缺口 4 复现与修复: 必要内容超限时返回紧凑有界停止视图 (buildCompactStopView < 2 KiB)，绝不回显 47 KiB 庞大正文', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '超大必要内容测试项目',
      title: '核心意图标题',
      problem: '核心问题说明',
      expectedOutcome: '核心期望结果',
      includes: ['核心范畴'],
      excludes: [],
      constraints: ['核心约束'],
      confirmed: true
    }, 'proj-huge-necessary');

    let currentRev = proj.revision;

    // 添加 1 个核心需求
    const reqRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: currentRev,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-HUGE-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '超大需求·用于测试必要内容超预算',
        problem: '超大需求问题说明'.repeat(100),
        expectedOutcome: '超大需求预期结果'.repeat(50),
        scope: { includes: ['范围'], excludes: [] },
        constraints: ['约束'],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-HUGE-1', description: '准则', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建超大需求',
      confirmed: true
    }, 'req-huge-problem');
    currentRev = reqRes.revision;

    // 添加 12 个大型已确认架构决定 (全属必要内容，不可被裁剪，每个约 3.5 KiB，总计约 42 KiB，加上需求与意图使必要内容达到 ~47 KiB)
    for (let i = 1; i <= 12; i++) {
      const decRes = env.recordService.saveRecord(human, proj.id, {
        baseRevision: currentRev,
        collection: 'contextItems',
        id: null,
        record: {
          id: `CTX-CONF-CORE-${i}`,
          requirementId: null,
          category: 'decision',
          content: `核心架构不可省略决定 ${i}: ` + '经过正式委员会审定的架构方案与不可变执行约束正文'.repeat(45),
          epistemicStatus: 'confirmed',
          sourceRefs: [proj.records.sources[0]!.id],
          evidenceRefs: []
        },
        reason: `添加不可裁剪的核心决定 ${i}`,
        confirmed: true
      }, `req-dec-conf-core-${i}`);
      currentRev = decRes.revision;
    }

    // 默认 32768 字节预算下获取恢复视图
    const view = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 32768,
      deliveryFormat: 'compact_json'
    });

    // 1. 触发停止与报告
    assert.strictEqual(view.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(view.nextSafeAction.executableNow, false);
    assert.ok(view.contextBudget);
    assert.strictEqual(view.contextBudget.necessaryOverBudget, true);
    assert.strictEqual(view.contextBudget.truncated, true);

    // 2. 紧凑停止视图体积必须严格小于 32768 字节，实际上为精简诊断 (< 5 KiB)，绝不能是展开原视图的 47+ KiB 巨大负载！
    assert.ok(view.contextBudget.actualBytes <= 32768, `停止视图实际字节 (${view.contextBudget.actualBytes}) 必须严格 <= 32768`);
    assert.ok(view.contextBudget.actualBytes < 5000, `停止视图实际字节 (${view.contextBudget.actualBytes}) 必须高度精简 (< 5000 字节)`);

    // 3. Markdown 渲染也同样受控且精简
    const md = env.recovery.formatProjectRecoveryMarkdown(proj.id, {
      maxBudgetBytes: 32768,
      deliveryFormat: 'markdown'
    });
    const mdBytes = Buffer.byteLength(md, 'utf8');
    assert.ok(mdBytes <= 32768, `Markdown 停止视图字节 (${mdBytes}) 必须严格 <= 32768`);
    assert.ok(mdBytes < 6000, `Markdown 停止视图字节 (${mdBytes}) 必须精简 (< 6000 字节)`);
  } finally {
    env.cleanup();
  }
});

test('第十轮缺口 5 复现与修复: 遗漏元数据具备具体对象 ID、精确锚点定位与真实存在的 GET /api/record-projects/:id 抓取入口', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '遗漏定位验证项目',
      title: '验证 omittedSummary 中的 locator 与 retrievalGuide',
      problem: '过去 locator 指向 404 的 /records 入口，且条目 ID 为通配 generic 字符串',
      expectedOutcome: '条目拥有具体 ID 与 #records.collection[id=...] 锚点，入口为已实现的 GET /api/record-projects/:id',
      includes: ['精确定位'],
      excludes: [],
      constraints: ['无404路由'],
      confirmed: true
    }, 'proj-loc-valid');

    let currentRev = proj.revision;

    // 添加 1 个需求
    const reqRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: currentRev,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-LOC-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求·测试定位与抓取入口',
        problem: '测试定位问题说明',
        expectedOutcome: '期望结果',
        scope: { includes: ['范围'], excludes: [] },
        constraints: ['约束'],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-LOC-1', description: '准则', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求',
      confirmed: true
    }, 'req-loc-1');
    currentRev = reqRes.revision;

    // 添加 2 个 source
    const s1 = env.recordService.saveRecord(human, proj.id, {
      baseRevision: currentRev,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-LOC-1',
        kind: 'reference',
        locator: 'docs/test-loc.md#L1',
        excerpt: '详细摘录内容用于占满部分空间'.repeat(15)
      },
      reason: '创建来源 1',
      confirmed: true
    }, 'req-src-loc-1');
    currentRev = s1.revision;

    // 添加 3 个 proposed decision (contextItem)，总大小使全量视图达到约 8 KiB
    for (let i = 1; i <= 3; i++) {
      const d = env.recordService.saveRecord(human, proj.id, {
        baseRevision: currentRev,
        collection: 'contextItems',
        id: null,
        record: {
          id: `CTX-PROP-LOC-${i}`,
          requirementId: null,
          category: 'decision',
          content: `草拟决定定位测试内容 ${i}：` + '候选方案详细说明与论证分析'.repeat(25),
          epistemicStatus: 'proposed',
          sourceRefs: [proj.records.sources[0]!.id],
          evidenceRefs: []
        },
        reason: `创建草拟决定 ${i}`,
        confirmed: true
      }, `req-dec-loc-${i}`);
      currentRev = d.revision;
    }

    // 预算设为 5000 字节，必然触发对 proposed decisions 的裁剪
    const view = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 5000,
      deliveryFormat: 'compact_json'
    });

    assert.ok(view.contextBudget);
    const omitted = view.contextBudget.omittedSummary;
    assert.ok(omitted && omitted.entries.length > 0, '必须存在被裁剪的条目');

    // 1. retrievalGuide 必须明确指向 GET /api/record-projects/${projectId}，绝不指向不存在的 /records
    assert.ok(omitted.retrievalGuide.includes(`/api/record-projects/${proj.id}`), 'retrievalGuide 必须包含有效的只读入口');
    assert.ok(!omitted.retrievalGuide.includes(`/api/record-projects/${proj.id}/records`), '绝不能出现 404 的 /records 路由');

    // 2. 每个 entry 必须有具体真实 ID 与精确锚点
    for (const entry of omitted.entries) {
      assert.notStrictEqual(entry.id, 'unknowns.assumptions', 'ID 不能是宽泛类别名称');
      assert.ok(
        entry.retrievalLocator.startsWith(`/api/record-projects/${proj.id}#records.`),
        `retrievalLocator (${entry.retrievalLocator}) 必须以真实项目路由加锚点开头`
      );
      assert.ok(entry.retrievalLocator.includes(`[id=${entry.id}]`), `retrievalLocator 必须明确包含实体 ID 筛选`);
    }

    // 3. 真实调用 recordService.get(human, proj.id)，验证该入口确实存在且能查找到被遗漏的实体
    const fullProject = env.recordService.get(human, proj.id);
    assert.ok(fullProject, '真实 GET /api/record-projects/:id 必须能成功返回项目');
    assert.strictEqual(fullProject.id, proj.id);

    // 验证 omitted 中的 CTX-PROP-LOC-1 确实存在于 fullProject.records.contextItems 中
    const foundDec = fullProject.records.contextItems.find(c => c.id === 'CTX-PROP-LOC-1');
    assert.ok(foundDec, '通过完整项目数据必须能取回被裁剪的 CTX-PROP-LOC-1');
  } finally {
    env.cleanup();
  }
});

test('第十一轮缺口 1 复现与修复: Intent 与活跃需求依赖的出处受闭包保护，绝不在步骤 6 误剪裁；必要出处超限时进入 STOP_AND_REPORT_GAP 拒绝可执行动作', () => {
  const env = createTestEnv();
  try {
    // 创建项目
    const proj = env.recordService.create(human, {
      name: '意图来源闭包保护测试项目',
      title: '意图来源保护验证',
      problem: '验证意图依赖的长 locator 来源在压缩步骤 6 不会被错误剥离',
      expectedOutcome: '所有意图引用的来源完整进入恢复包，或在超限时停止',
      includes: ['核心意图范围'],
      excludes: [],
      constraints: ['约束条件项'],
      confirmed: true
    }, 'proj-intent-provenance');

    let currentRev = proj.revision;

    // 添加 12 个长 locator 的 sources
    const sourceIds: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const srcId = `SRC-LONG-INTENT-${i}`;
      sourceIds.push(srcId);
      const res = env.recordService.saveRecord(human, proj.id, {
        baseRevision: currentRev,
        collection: 'sources',
        id: null,
        record: {
          id: srcId,
          kind: 'reference',
          locator: `docs/deep-nested-provenance-directory/intent-verification-source-audit-trace-${i}.md#L100-L300`,
          excerpt: null
        },
        reason: `创建意图依赖长来源 ${i}`,
        confirmed: true
      }, `req-src-${i}`);
      currentRev = res.revision;
    }

    // 添加若干 proposed decisions 使初始全量视图体积 > 32 KiB，确保触发预算压缩链路
    for (let i = 1; i <= 12; i++) {
      const decId = `CTX-PROP-LARGE-${i}`;
      const res = env.recordService.saveRecord(human, proj.id, {
        baseRevision: currentRev,
        collection: 'contextItems',
        id: null,
        record: {
          id: decId,
          requirementId: null,
          category: 'decision',
          content: `草拟决定测试内容 ${i}：` + '候选架构方案深入分析与权衡评估说明'.repeat(100),
          epistemicStatus: 'proposed',
          sourceRefs: [sourceIds[0]!],
          evidenceRefs: []
        },
        reason: `创建候选决定 ${i}`,
        confirmed: true
      }, `req-dec-${i}`);
      currentRev = res.revision;
    }

    // 更新 Intent，将 12 个 sourceIds 关联到 intent.sourceRefs 与 intent.confirmation.sourceRefs
    const fullProj = env.recordService.get(human, proj.id)!;
    fullProj.records.intent.sourceRefs = [...sourceIds];
    fullProj.records.intent.confirmation.sourceRefs = [...sourceIds];
    writeFileSync(join(env.projectDir, `${proj.id}.json`), JSON.stringify(fullProj, null, 2) + '\n', 'utf8');

    // 1. 在 10000 字节预算下恢复：
    // - 初始全量视图约 45 KiB 超出 10000 字节，进入压缩链路；
    // - 步骤 5 剪裁 12 个 proposed decisions 后仍超预算，继续进入步骤 6；
    // - 步骤 6 剪裁未被引用的审计消息等 sources，但绝不能将由意图引用的 12 个 sources 视为未引用而清空（原代码中此处 sources 会被误清零为 0 项并错误给出可执行动作！）
    const viewStep6 = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 10000,
      deliveryFormat: 'compact_json'
    });

    assert.strictEqual(
      viewStep6.evidence.sources.length,
      12,
      `所有 12 个由意图引用的来源必须完整保留，实际数量: ${viewStep6.evidence.sources.length} (修复前被误清零为 0)`
    );
    const actualSourceIds = new Set(viewStep6.evidence.sources.map(s => s.id));
    for (const expectedId of sourceIds) {
      assert.ok(actualSourceIds.has(expectedId), `恢复包必须包含 ${expectedId}`);
    }

    // 2. 在超小预算（例如 4096 字节）下：如果包含所有必要事实与 12 个长 locator 来源无法容纳
    // 绝不能清空 sources 并给出可执行动作（如 REQUIRE_RUN_AUTHORIZATION），必须停机报告 STOP_AND_REPORT_GAP！
    const viewSmall = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 4096,
      deliveryFormat: 'compact_json'
    });

    assert.strictEqual(viewSmall.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(viewSmall.nextSafeAction.executableNow, false);
    assert.strictEqual(viewSmall.contextBudget?.necessaryOverBudget, true);
    assert.ok(viewSmall.contextBudget!.actualBytes <= 4096, `停止视图实际字节 (${viewSmall.contextBudget!.actualBytes}) 必须 <= 4096`);
  } finally {
    env.cleanup();
  }
});

test('第十一轮缺口 2 复现与修复: 紧凑停止诊断具备确定性渐进压缩与最终预算断言，在 4096 字节极限预算下 CLI JSON 与 Markdown 均合规', () => {
  const env = createTestEnv();
  try {
    // 项目名称 30 个中文字符，意图标题 100 个中文字符，需求标题 100 个中文字符，多条长约束
    const longProjectName = '这是一个用于测试极限预算边界的三十个中文字符的项目名称'; // exactly 30 chars
    const longIntentTitle = '这是一个用于测试恢复包在极限预算四千零九十六字节下能否通过渐进式阶段压缩成功收敛的一百个中文字符的超长项目意图标题内容测试文本示例验证边界防御机制有效性确保不发生超限故障保障系统鲁棒性'; // 100 chars
    const longReqTitle = '这是一个用于测试恢复包在极限预算四千零九十六字节下能否通过渐进式阶段压缩成功收敛的一百个中文字符的超长需求标题内容测试文本示例验证边界防御机制有效性确保不发生超限故障保障业务合规性'; // 100 chars

    const proj = env.recordService.create(human, {
      name: longProjectName,
      title: longIntentTitle,
      problem: '超长问题描述：' + '核心痛点深入解释分析与论证'.repeat(20),
      expectedOutcome: '超长期望结果：' + '高质量成果交付与多维度验证'.repeat(20),
      includes: ['核心范围项一', '核心范围项二'],
      excludes: ['排除范围项一'],
      constraints: [
        '第一条核心约束：' + '系统在所有边界下必须严格遵从预算上限'.repeat(5),
        '第二条核心约束：' + '禁止模型在未获授权时进行任何修改或自批自结'.repeat(5)
      ],
      confirmed: true
    }, 'proj-extreme-budget');

    // 添加超长需求
    env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-EXTREME-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: longReqTitle,
        problem: '需求问题：' + '分析当前需求问题详情'.repeat(20),
        expectedOutcome: '需求成果：' + '达成可验证的技术指标'.repeat(20),
        scope: { includes: ['需求内范畴'], excludes: [] },
        rationale: '需求背景说明',
        expectedImpact: '正面业务影响',
        acceptanceCriteria: [
          { id: 'AC-1', description: '验收准则一描述'.repeat(10), verification: '自动化测试验证' }
        ],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null,
        constraints: ['需求级约束说明'.repeat(10)]
      },
      reason: '创建超长需求',
      confirmed: true
    }, 'req-extreme-1');

    // 1. 测试 CLI JSON 输出
    const cliJsonRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: proj.id,
      budgetBytes: 4096,
      format: 'json'
    });

    assert.strictEqual(cliJsonRes.status, 0, `CLI JSON 必须成功退出: ${cliJsonRes.stderr}`);
    const jsonStdoutBytes = Buffer.byteLength(cliJsonRes.stdout, 'utf8');
    assert.ok(
      jsonStdoutBytes <= 4096,
      `CLI JSON 实际输出字节 (${jsonStdoutBytes}) 必须严格 <= 4096 字节`
    );
    assert.ok(cliJsonRes.json, 'CLI JSON 必须能够解析为有效 JSON 恢复对象');
    assert.strictEqual(cliJsonRes.json.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');

    // 2. 测试 CLI Markdown 输出（原代码中输出 4405 字节超限！）
    const cliMdRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: proj.id,
      budgetBytes: 4096,
      format: 'markdown'
    });

    assert.strictEqual(cliMdRes.status, 0, `CLI Markdown 必须成功退出: ${cliMdRes.stderr}`);
    const mdStdoutBytes = Buffer.byteLength(cliMdRes.stdout, 'utf8');
    assert.ok(
      mdStdoutBytes <= 4096,
      `CLI Markdown 实际输出字节 (${mdStdoutBytes}) 必须严格 <= 4096 字节（修复前为 4405 字节超限）`
    );
    assert.ok(cliMdRes.stdout.includes('STOP_AND_REPORT_GAP'), 'Markdown 必须包含停止动作代码');
  } finally {
    env.cleanup();
  }
});

test('第十一轮缺口 3 复现与修复: 停止视图真实传递意图状态，proposed 意图绝不篡改为 human_confirmed', () => {
  const env = createTestEnv();
  try {
    // 意图为 proposed 状态（未人工确认：创建未填写的项目草案）
    const proj = env.recordService.create(human, {
      name: '未确认意图真实性测试项目'
    }, 'proj-intent-state-truth');

    assert.strictEqual(proj.records.intent.confirmation.state, 'proposed');

    // 补充完整意图内容，但保留 confirmation.state 为 proposed
    const fullProj = env.recordService.get(human, proj.id)!;
    fullProj.records.intent.title = '草拟意图标题';
    fullProj.records.intent.expectedOutcome = '草拟期望结果';
    // 故意增加极长问题描述使必要内容超出预算
    fullProj.records.intent.problem = '极长问题描述'.repeat(200);
    assert.strictEqual(fullProj.records.intent.confirmation.state, 'proposed');
    writeFileSync(join(env.projectDir, `${proj.id}.json`), JSON.stringify(fullProj, null, 2) + '\n', 'utf8');

    // 1. 触发预算超限停机（如极限预算 4096 字节）
    const viewBudgetStop = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 4096,
      deliveryFormat: 'compact_json'
    });

    assert.strictEqual(viewBudgetStop.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    // 核心断言：goal.intent.state 与 progress.intentState 绝不能被篡改为 'human_confirmed'！
    assert.strictEqual(
      viewBudgetStop.goal.intent.state,
      'proposed',
      `停止视图中的 goal.intent.state 必须如实反映为 'proposed'，绝不能被篡改为 'human_confirmed'`
    );
    assert.strictEqual(
      viewBudgetStop.progress.intentState,
      'proposed',
      `停止视图中的 progress.intentState 必须如实反映为 'proposed'，绝不能被篡改为 'human_confirmed'`
    );

    // 2. 触发底层结构损坏停机（例如 requirements 为 null）
    const corruptedProj = JSON.parse(JSON.stringify(fullProj)) as RecordProject;
    corruptedProj.records.requirements = null as any;

    const viewStructStop = buildRecoveryProjection(corruptedProj, [], {
      maxBudgetBytes: 4096,
      deliveryFormat: 'compact_json'
    });

    assert.strictEqual(viewStructStop.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(
      viewStructStop.goal.intent.state,
      'proposed',
      `结构损坏停止视图中的 goal.intent.state 必须保留原始 'proposed' 状态`
    );
    assert.strictEqual(
      viewStructStop.progress.intentState,
      'proposed',
      `结构损坏停止视图中的 progress.intentState 必须保留原始 'proposed' 状态`
    );
  } finally {
    env.cleanup();
  }
});

test('第十二轮缺口 1 复现与验证: 工作区包含海量读取范围时在 4096 字节极限预算下安全省略明细，保留 valid 状态，输出严格受控', async () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '海量授权读取范围项目',
      title: '意图标题',
      problem: '意图问题描述',
      expectedOutcome: '达成预期业务成果',
      includes: ['核心范围'],
      excludes: [],
      constraints: ['项目约束'],
      confirmed: true
    }, 'proj-huge-auth-scope');

    env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-AUTH-TEST',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '测试需求标题',
        problem: '需求问题详情',
        expectedOutcome: '需求成果指标',
        scope: { includes: ['需求内范畴'], excludes: [] },
        constraints: ['需求级约束说明'],
        rationale: '需求背景说明',
        expectedImpact: '正面业务影响',
        acceptanceCriteria: [
          { id: 'AC-1', description: '验收准则一描述', verification: '自动化测试验证' }
        ],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '添加需求',
      confirmed: true
    }, 'req-auth-test');

    const latestProj = env.recordService.get(human, proj.id)!;

    // 构造一个通过 Run JSON Schema 校验、包含 60 个 readScope (每条约 120 字符) 的合法运行
    const readScopes = Array.from({ length: 60 }, (_, i) =>
      `src/subpackages/deep_module_${i}/components/handlers/subpath_handler_${'abcde_'.repeat(10)}_${i}.ts`
    );

    const runWithHugeScope: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-HUGE-SCOPE-001',
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-AUTH-TEST',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-huge-scope-001',
      requestHash: 'a'.repeat(64),
      baseRevision: latestProj.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: readScopes,
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
        fingerprint: 'b'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-AUTH-TEST',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '待人工决定的关键问题',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };

    env.runStore.create(runWithHugeScope);

    // 1. 测试 CLI JSON 输出（修复前因保留 60 条 readScope 导致输出 10722 字节超限！）
    const cliJsonRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: proj.id,
      budgetBytes: 4096,
      format: 'json'
    });

    assert.strictEqual(cliJsonRes.status, 0, `CLI JSON 必须成功退出: ${cliJsonRes.stderr}`);
    const jsonBytes = Buffer.byteLength(cliJsonRes.stdout, 'utf8');
    assert.ok(
      jsonBytes <= 4096,
      `CLI JSON 实际输出 (${jsonBytes} 字节) 必须严格 <= 4096 字节（修复前为 10722 字节）`
    );
    assert.ok(cliJsonRes.json, 'CLI JSON 必须解析为合规对象');
    assert.strictEqual(cliJsonRes.json.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(cliJsonRes.json.authorizations.authorizationState, 'valid');
    assert.strictEqual(cliJsonRes.json.authorizations.authorizationDetailsOmitted, true);
    assert.strictEqual(cliJsonRes.json.authorizations.activeGrant, null);
    assert.strictEqual(cliJsonRes.json.authorizations.runtimeBinding, null);
    assert.ok(
      cliJsonRes.json.authorizations.notes.some(n => n.includes('授权详情未在停止诊断中包含') || n.includes('GET')),
      '必须在授权附注中提供真实回查指引'
    );

    // 2. 测试 CLI Markdown 输出（修复前因渲染 60 条 readScope 导致输出 10579 字节超限！）
    const cliMdRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: proj.id,
      budgetBytes: 4096,
      format: 'markdown'
    });

    assert.strictEqual(cliMdRes.status, 0, `CLI Markdown 必须成功退出: ${cliMdRes.stderr}`);
    const mdBytes = Buffer.byteLength(cliMdRes.stdout, 'utf8');
    assert.ok(
      mdBytes <= 4096,
      `CLI Markdown 实际输出 (${mdBytes} 字节) 必须严格 <= 4096 字节（修复前为 10579 字节）`
    );
    assert.ok(cliMdRes.stdout.includes('`valid`'), 'Markdown 必须真实显示授权状态为 valid');
    assert.ok(cliMdRes.stdout.includes('授权详情未包含，需取回重新核对'), 'Markdown 必须提示授权详情省略');

    // 3. 测试真实 HTTP 端点
    const server = createHubServer({
      store: env.store,
      service: env.service,
      recordService: env.recordService,
      recoveryService: env.recovery,
      harness: env.harness,
      webRoot: 'dist'
    });
    await new Promise<void>(res => server.listen(0, '127.0.0.1', () => res()));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const loginResp = await fetch(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'test-admin-password' })
      });
      assert.strictEqual(loginResp.status, 200);
      const cookie = loginResp.headers.get('set-cookie')?.split(';')[0];
      assert.ok(cookie);

      // 3.1 HTTP JSON
      const httpJsonResp = await fetch(`${baseUrl}/api/record-projects/${proj.id}/recovery?budgetBytes=4096`, {
        headers: { Cookie: cookie }
      });
      assert.strictEqual(httpJsonResp.status, 200);
      const httpJsonText = await httpJsonResp.text();
      assert.ok(Buffer.byteLength(httpJsonText, 'utf8') <= 4096);
      const httpJson = JSON.parse(httpJsonText) as ProjectRecoveryView;
      assert.strictEqual(httpJson.authorizations.authorizationState, 'valid');
      assert.strictEqual(httpJson.authorizations.authorizationDetailsOmitted, true);

      // 3.2 HTTP Markdown
      const httpMdResp = await fetch(`${baseUrl}/api/record-projects/${proj.id}/recovery?format=markdown&budgetBytes=4096`, {
        headers: { Cookie: cookie }
      });
      assert.strictEqual(httpMdResp.status, 200);
      const httpMdText = await httpMdResp.text();
      assert.ok(Buffer.byteLength(httpMdText, 'utf8') <= 4096);
      assert.ok(httpMdText.includes('授权详情未包含，需取回重新核对'));
    } finally {
      server.closeUpdates();
      await new Promise<void>(res => server.close(() => res()));
    }
  } finally {
    env.cleanup();
  }
});

test('第十二轮缺口 2 复现与验证: 停止诊断事实真实性与运行态/候选生命周期保护', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '候选与运行态测试项目',
      title: '意图标题',
      problem: '意图问题描述',
      expectedOutcome: '达成预期业务成果',
      includes: ['核心范围'],
      excludes: [],
      constraints: ['项目约束'],
      confirmed: true
    }, 'proj-run-state-truth');

    env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-STATE-TEST',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '测试需求标题',
        problem: '需求问题详情',
        expectedOutcome: '需求成果指标',
        scope: { includes: ['需求内范畴'], excludes: [] },
        constraints: ['需求级约束说明'],
        rationale: '需求背景说明',
        expectedImpact: '正面业务影响',
        acceptanceCriteria: [
          { id: 'AC-1', description: '验收准则一描述', verification: '自动化测试验证' }
        ],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '添加需求',
      confirmed: true
    }, 'req-state-test');

    const latestProj = env.recordService.get(human, proj.id)!;

    // 1. 测试处于 waiting_human 且包含 1 个待处理候选的运行
    const waitingRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-WAITING-001',
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-STATE-TEST',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-waiting-001',
      requestHash: 'c'.repeat(64),
      baseRevision: latestProj.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: ['src/index.ts'],
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
        fingerprint: 'd'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-STATE-TEST',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '待决技术问题内容',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };

    env.runStore.create(waitingRun);

    // 在 4096 字节极限预算下触发停止诊断（故意传一个极长问题使必要内容超限）
    const fullProj = env.recordService.get(human, proj.id)!;
    fullProj.records.intent.problem = '超长问题描述内容'.repeat(150);
    writeFileSync(join(env.projectDir, `${proj.id}.json`), JSON.stringify(fullProj, null, 2) + '\n', 'utf8');

    const viewStop = env.recovery.getProjectRecovery(proj.id, {
      maxBudgetBytes: 4096,
      deliveryFormat: 'compact_json'
    });

    assert.strictEqual(viewStop.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    // 核心断言：停止视图中的 progress 必须如实反映运行状态与候选计数，绝不能篡改为 null 或 0！
    assert.strictEqual(
      viewStop.progress.latestRunState,
      'waiting_human',
      `停止视图中的 latestRunState 必须为 'waiting_human'（修复前为 null/丢失）`
    );
    assert.strictEqual(
      viewStop.progress.pendingCandidateCount,
      1,
      `停止视图中的 pendingCandidateCount 必须为 1（修复前硬编码为 0）`
    );
    assert.strictEqual(viewStop.progress.keptCandidateCount, 0);

    // 测试 Markdown 渲染：绝不能渲染为 "最新运行 无" 或 "待审核候选 0 条"
    const mdStop = env.recovery.formatProjectRecoveryMarkdown(proj.id, {
      maxBudgetBytes: 4096,
      deliveryFormat: 'cli_markdown'
    });
    assert.ok(
      mdStop.includes('最新运行 waiting_human · 待审核候选 1 条'),
      `Markdown 必须包含 '最新运行 waiting_human · 待审核候选 1 条'（实际: ${mdStop.slice(0, 500)}）`
    );
    assert.ok(
      !mdStop.includes('最新运行 无 · 待审核候选 0 条'),
      'Markdown 绝不能出现失真的 "最新运行 无 · 待审核候选 0 条"'
    );

    // 2. 测试 running 状态
    const run1 = env.runStore.get(waitingRun.id)!;
    const runningRun = { ...run1, revision: run1.revision + 1, state: 'running' as const, candidate: null };
    env.runStore.replace(runningRun, run1.revision);
    const viewRunning = env.recovery.getProjectRecovery(proj.id, { maxBudgetBytes: 4096 });
    assert.strictEqual(viewRunning.progress.latestRunState, 'running');
    assert.strictEqual(viewRunning.progress.pendingCandidateCount, 0);

    // 3. 测试 interrupted 状态
    const run2 = env.runStore.get(waitingRun.id)!;
    const interruptedRun = { ...run2, revision: run2.revision + 1, state: 'interrupted' as const };
    env.runStore.replace(interruptedRun, run2.revision);
    const viewInterrupted = env.recovery.getProjectRecovery(proj.id, { maxBudgetBytes: 4096 });
    assert.strictEqual(viewInterrupted.progress.latestRunState, 'interrupted');

    // 4. 测试 kept 候选状态
    const run3 = env.runStore.get(waitingRun.id)!;
    const keptRun = {
      ...run3,
      revision: run3.revision + 1,
      state: 'waiting_human' as const,
      candidate: {
        type: 'append_context' as const,
        requirementId: 'REQ-STATE-TEST',
        category: 'open_question' as const,
        epistemicStatus: 'unknown' as const,
        content: '已保留候选内容',
        sourceRefs: []
      },
      outcome: 'kept' as const,
      receipt: null
    };
    env.runStore.replace(keptRun, run3.revision);
    const viewKept = env.recovery.getProjectRecovery(proj.id, { maxBudgetBytes: 4096 });
    assert.strictEqual(viewKept.progress.pendingCandidateCount, 0);
    assert.strictEqual(viewKept.progress.keptCandidateCount, 1);
  } finally {
    env.cleanup();
  }
});

test('停机原因与诊断无偏见分类: 结构损坏与预算超限具有明确不同的诊断原因与前置Gate', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '结构损坏对比测试项目',
      title: '意图标题',
      problem: '意图问题描述',
      expectedOutcome: '达成预期业务成果',
      includes: ['核心范围'],
      excludes: [],
      constraints: ['项目约束'],
      confirmed: true
    }, 'proj-struct-corrupt-test');

    const fullProj = env.recordService.get(human, proj.id)!;
    fullProj.records.requirements = null as any;

    const stopView = buildRecoveryProjection(fullProj, [], {
      maxBudgetBytes: 4096,
      deliveryFormat: 'compact_json'
    });

    assert.strictEqual(stopView.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');
    assert.strictEqual(stopView.contextBudget?.necessaryOverBudget, false);
    assert.ok(
      stopView.nextSafeAction.why.includes('底层结构错误') || stopView.nextSafeAction.why.includes('合同校验失败'),
      `why 必须包含结构错误原因，不能伪造为预算超限: ${stopView.nextSafeAction.why}`
    );
    assert.ok(
      !stopView.nextSafeAction.why.includes('恢复上下文超出预算上限'),
      '结构损坏时 why 绝不能写为预算超限'
    );
    assert.ok(
      !stopView.unknowns.pendingHumanGates.some(g => g.includes('核准恢复预算')),
      '结构损坏时 pendingHumanGates 绝不能提示核准恢复预算'
    );
  } finally {
    env.cleanup();
  }
});

test('第十三批 缺口 1: 授权恢复路径闭合与安全重检 — 极限预算省略明细时保留目标 Run 定位、在线 HTTP 与离线文件取回及漂移失效重检', async () => {
  const env = createTestEnv();
  let server: any;
  try {
    const proj = env.recordService.create(human, {
      name: '授权闭环与重检测试项目',
      title: '意图标题',
      problem: '意图问题描述',
      expectedOutcome: '达成预期业务成果',
      includes: ['核心范围'],
      excludes: [],
      constraints: ['项目约束'],
      confirmed: true
    }, 'proj-auth-closure-init');

    const directAnalysis = analyzeProjectAuthorizations({
      runs: [],
      projectRevision: proj.revision
    });
    assert.strictEqual(directAnalysis.authorizationState, 'none');
    assert.strictEqual(directAnalysis.targetRunId, null);

    // 添加初始来源
    const srcRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-INIT-1',
        kind: 'human_observation',
        locator: 'docs/intent.md#L1',
        excerpt: '意图来源'
      },
      reason: '创建初始来源',
      confirmed: true
    }, 'req-src-init-1');

    // 建立 Requirement
    const reqRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: srcRes.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-AUTH-TEST',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '测试授权闭环需求',
        problem: '需要核验授权链路',
        expectedOutcome: '授权链路完全闭合',
        status: 'draft',
        scope: { includes: ['范围 A'], excludes: [] },
        constraints: [],
        rationale: '授权闭环验证',
        expectedImpact: '提供可靠授权依据',
        acceptanceCriteria: [
          { id: 'CRIT-1', description: '验收条件 1', verification: '自动化测试' }
        ],
        acceptance: null,
        result: null,
        pullRequest: null,
        sourceRefs: ['SRC-INIT-1']
      },
      reason: '创建需求',
      confirmed: true
    }, 'create-req-auth');

    // 创建海量 readScope (60 条) 的运行，使得授权详情必须被省略
    const largeReadScope: string[] = [];
    for (let i = 0; i < 60; i++) {
      largeReadScope.push(`packages/subsystem-${i}/very-long-module-name-for-testing/source-code-file-${i}.ts`);
    }

    const runId = 'RUN-AUTH-TEST-HUGE';
    const runWithHugeScope: HarnessRun = {
      schemaVersion: '1.0.0',
      id: runId,
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-AUTH-TEST',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-huge-auth-closure',
      requestHash: 'a'.repeat(64),
      baseRevision: reqRes.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: largeReadScope,
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
        fingerprint: 'b'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-AUTH-TEST',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '待人工决定的关键问题',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    env.runStore.create(runWithHugeScope);

    // 1. 验证在 4096 极小预算下的 CLI JSON 与 CLI Markdown
    const cliJsonRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: proj.id,
      budgetBytes: 4096,
      format: 'json'
    });
    assert.strictEqual(cliJsonRes.status, 0, `CLI JSON 必须成功退出: ${cliJsonRes.stderr}`);
    const jsonView = cliJsonRes.json!;
    assert.ok(jsonView);
    assert.strictEqual(jsonView.authorizations.authorizationState, 'valid');
    assert.strictEqual(jsonView.authorizations.authorizationDetailsOmitted, true);
    assert.strictEqual(jsonView.authorizations.targetRunId, runId);
    assert.strictEqual(jsonView.authorizations.runRevision, runWithHugeScope.revision);
    assert.strictEqual(jsonView.authorizations.baseRevision, runWithHugeScope.baseRevision);
    assert.strictEqual(jsonView.authorizations.retrievalEndpoint, `/api/runs/${runId}`);
    assert.strictEqual(jsonView.authorizations.retrievalLocator, `${runId}.json`);
    const jsonBytes = Buffer.byteLength(cliJsonRes.stdout, 'utf8');
    assert.ok(jsonBytes <= 4096, `CLI JSON 输出 (${jsonBytes} 字节) 必须严格 <= 4096 字节`);

    // 验证 CLI Markdown
    const cliMdRes = runConsumerCli({
      projectDir: env.projectDir,
      runDir: env.runDir,
      projectId: proj.id,
      budgetBytes: 4096,
      format: 'markdown'
    });
    assert.strictEqual(cliMdRes.status, 0, `CLI Markdown 必须成功退出: ${cliMdRes.stderr}`);
    const mdStdout = cliMdRes.stdout;
    const mdBytes = Buffer.byteLength(mdStdout, 'utf8');
    assert.ok(mdBytes <= 4096, `CLI Markdown 输出 (${mdBytes} 字节) 必须严格 <= 4096 字节`);
    assert.ok(
      mdStdout.includes(`- **关联运行账本**：\`${runId}\``),
      `Markdown 必须包含精确运行账本链接，实际: ${mdStdout}`
    );
    assert.ok(
      mdStdout.includes(`端点: \`/api/runs/${runId}\``),
      `Markdown 必须包含精确回查端点，实际: ${mdStdout}`
    );
    assert.ok(
      mdStdout.includes(`文件: \`${runId}.json\``),
      `Markdown 必须包含精确回查文件路径，实际: ${mdStdout}`
    );
    assert.ok(
      mdStdout.includes('授权详情未包含，需取回重新核对'),
      'Markdown 必须提示授权详情省略'
    );

    // 2. 在线消费者：通过 HTTP 端点 GET /api/runs/:id 取回完整运行账本
    server = createHubServer({
      store: env.store,
      service: env.service,
      recordService: env.recordService,
      recoveryService: env.recovery,
      harness: env.harness,
      webRoot: 'dist'
    });
    await new Promise<void>(res => server.listen(0, '127.0.0.1', () => res()));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 人端鉴权凭证请求：应当成功返回 200 并包含全部 60 条 readScope
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl },
      body: JSON.stringify({ password: 'test-admin-password' })
    });
    assert.strictEqual(loginRes.status, 200);
    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie);
    const cookie = setCookie.split(';')[0]!;

    const runHttpRes = await fetch(`${baseUrl}${jsonView.authorizations.retrievalEndpoint}`, {
      headers: { Cookie: cookie }
    });
    assert.strictEqual(runHttpRes.status, 200);
    const onlineRun = await runHttpRes.json() as HarnessRun;
    assert.strictEqual(onlineRun.id, runId);
    assert.strictEqual(onlineRun.authorization.workspace?.readScope.length, 60);

    // 非人端身份访问该端点：未登录 401，工具令牌 403
    const unauthRes = await fetch(`${baseUrl}${jsonView.authorizations.retrievalEndpoint}`);
    assert.strictEqual(unauthRes.status, 401);

    const { token, hash: tokenHash } = toolCredentials.create();
    env.store.db.prepare('INSERT INTO projects VALUES (?, ?, ?)').run(proj.id, JSON.stringify({ id: proj.id, name: proj.name }), 1);
    env.store.addScope({
      id: 'scope-test-tool-1',
      projectId: proj.id,
      intentId: 'INTENT',
      label: 'test-tool-token',
      operations: ['issue:propose'],
      createdAt: '2026-10-29T00:00:00Z',
      revokedAt: null
    }, tokenHash);

    const toolRunRes = await fetch(`${baseUrl}${jsonView.authorizations.retrievalEndpoint}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(toolRunRes.status, 403);

    // 3. 离线消费者：通过 retrievalLocator 读取本地文件并调用 verifyRetrievedRunAuthorization
    const filePath = resolveRunLocatorPath(env.runDir, jsonView.authorizations.retrievalLocator!);
    const fileContent = readFileSync(filePath, 'utf8');
    const offlineRun = JSON.parse(fileContent) as HarnessRun;
    assert.strictEqual(offlineRun.id, runId);

    const currentProject = env.recordService.get(human, proj.id)!;

    const verifyOnline = verifyRetrievedRunAuthorization({
      run: onlineRun,
      recoveryView: jsonView,
      currentProject
    });
    assert.strictEqual(verifyOnline.valid, true);
    assert.strictEqual(verifyOnline.state, 'valid');
    assert.strictEqual(verifyOnline.activeGrant?.readScope.length, 60);

    const verifyOffline = verifyRetrievedRunAuthorization({
      run: offlineRun,
      recoveryView: jsonView,
      currentProject
    });
    assert.strictEqual(verifyOffline.valid, true);
    assert.strictEqual(verifyOffline.state, 'valid');

    // 4. 重检安全机制：运行或项目在生成恢复包后发生变化，消费者拒绝盲目信任 valid 快照

    // 场景 A: 运行账本修订发生漂移（被修改）
    const driftedRun: HarnessRun = { ...offlineRun, revision: offlineRun.revision + 1 };
    const verifyDrift = verifyRetrievedRunAuthorization({
      run: driftedRun,
      recoveryView: jsonView,
      currentProject
    });
    assert.strictEqual(verifyDrift.valid, false);
    assert.strictEqual(verifyDrift.state, 'stale_revision');
    assert.ok(verifyDrift.reason.includes('运行修订发生漂移'));

    // 场景 B: 正式项目基准前进（修订不匹配）
    const staleProject = { ...currentProject, revision: currentProject.revision + 1 };
    const verifyStaleProject = verifyRetrievedRunAuthorization({
      run: offlineRun,
      recoveryView: jsonView,
      currentProject: staleProject
    });
    assert.strictEqual(verifyStaleProject.valid, false);
    assert.strictEqual(verifyStaleProject.state, 'stale_revision');
    assert.ok(verifyStaleProject.reason.includes('D18.1 保守策略'));

    // 场景 C: 运行已到期（时间过期）
    const verifyExpired = verifyRetrievedRunAuthorization({
      run: offlineRun,
      recoveryView: jsonView,
      currentProject,
      now: Date.now() + 7200000 // 2 小时后
    });
    assert.strictEqual(verifyExpired.valid, false);
    assert.strictEqual(verifyExpired.state, 'expired');
    assert.ok(verifyExpired.reason.includes('已于'));

    // 场景 D: 运行被撤销或非活跃
    const revokedRun: HarnessRun = {
      ...offlineRun,
      authorization: { ...offlineRun.authorization, active: false }
    };
    const verifyRevoked = verifyRetrievedRunAuthorization({
      run: revokedRun,
      recoveryView: jsonView,
      currentProject
    });
    assert.strictEqual(verifyRevoked.valid, false);
    assert.strictEqual(verifyRevoked.state, 'revoked');
    assert.ok(verifyRevoked.reason.includes('撤销'));
  } finally {
    if (server) await new Promise<void>(res => server.close(() => res()));
    env.cleanup();
  }
});

test('第十三批 缺口 2: 未知与未验证授权状态如实表达 — 结构损坏标记为 unverified_due_to_corruption、多需求未定标记为 unknown、无运行标记为 none', async () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '授权状态真实表达测试项目',
      title: '意图标题',
      problem: '意图问题描述',
      expectedOutcome: '达成预期业务成果',
      includes: ['核心范围'],
      excludes: [],
      constraints: ['项目约束'],
      confirmed: true
    }, 'proj-auth-states-init');

    const directAnalysis = analyzeProjectAuthorizations({
      runs: [],
      projectRevision: proj.revision
    });
    assert.strictEqual(directAnalysis.authorizationState, 'none');
    assert.strictEqual(directAnalysis.targetRunId, null);

    // 添加初始来源
    const srcRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-INIT-2',
        kind: 'human_observation',
        locator: 'docs/intent.md#L1',
        excerpt: '意图来源'
      },
      reason: '创建初始来源',
      confirmed: true
    }, 'req-src-init-2');

    // 建立 2 个需求
    const req1Res = env.recordService.saveRecord(human, proj.id, {
      baseRevision: srcRes.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 1',
        problem: '问题 1',
        expectedOutcome: '结果 1',
        status: 'draft',
        scope: { includes: ['核心范围 1'], excludes: [] },
        constraints: [],
        rationale: '理由 1',
        expectedImpact: '影响 1',
        acceptanceCriteria: [{ id: 'C-1', description: '准则 1', verification: 'test' }],
        acceptance: null,
        result: null,
        pullRequest: null,
        sourceRefs: ['SRC-INIT-2']
      },
      reason: '创建需求 1',
      confirmed: true
    }, 'create-req-1');

    const req2Res = env.recordService.saveRecord(human, proj.id, {
      baseRevision: req1Res.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-2',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 2',
        problem: '问题 2',
        expectedOutcome: '结果 2',
        status: 'draft',
        scope: { includes: ['核心范围 2'], excludes: [] },
        constraints: [],
        rationale: '理由 2',
        expectedImpact: '影响 2',
        acceptanceCriteria: [{ id: 'C-2', description: '准则 2', verification: 'test' }],
        acceptance: null,
        result: null,
        pullRequest: null,
        sourceRefs: ['SRC-INIT-2']
      },
      reason: '创建需求 2',
      confirmed: true
    }, 'create-req-2');

    // 1. 无任何运行记录时：authorizationState 必须为 'none'
    const viewNoRuns = env.recovery.getProjectRecovery(proj.id, { maxBudgetBytes: 4096 });
    assert.strictEqual(viewNoRuns.authorizations.authorizationState, 'none');
    assert.strictEqual(viewNoRuns.authorizations.targetRunId, null);
    const mdNoRuns = env.recovery.formatProjectRecoveryMarkdown(proj.id, { maxBudgetBytes: 4096 });
    assert.ok(mdNoRuns.includes('**工作区授权状态**：`none`（无授权）'));

    // 为 REQ-1 创建运行
    const run1: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-FOR-REQ-1',
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-1',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-for-req-1',
      requestHash: 'a'.repeat(64),
      baseRevision: req2Res.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: ['src/app.ts'],
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
        fingerprint: 'b'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-1',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '候选 1',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    env.runStore.create(run1);

    // 为 REQ-2 创建运行
    const run2: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-FOR-REQ-2',
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-2',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-for-req-2',
      requestHash: 'b'.repeat(64),
      baseRevision: req2Res.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: ['src/index.ts'],
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
        fingerprint: 'b'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-2',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '候选 2',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    env.runStore.create(run2);

    // 2. 存在多需求运行但未指定目标需求时：authorizationState 必须为 'unknown'
    const viewMultiReq = env.recovery.getProjectRecovery(proj.id); // 默认 32 KiB 预算
    assert.strictEqual(viewMultiReq.authorizations.authorizationState, 'unknown');
    assert.strictEqual(viewMultiReq.authorizations.targetRunId, null);
    assert.strictEqual(viewMultiReq.nextSafeAction.actionCode, 'SELECT_TARGET_REQUIREMENT');
    const mdMultiReq = env.recovery.formatProjectRecoveryMarkdown(proj.id);
    assert.ok(mdMultiReq.includes('**工作区授权状态**：`unknown`（存在多需求运行但未指定目标需求，授权归属未知）'));

    // 验证在 4096 极小预算下，即使触发必要内容超限停止，授权状态依然保真为 unknown
    const viewMultiReq4096 = env.recovery.getProjectRecovery(proj.id, { maxBudgetBytes: 4096 });
    assert.strictEqual(viewMultiReq4096.authorizations.authorizationState, 'unknown');
    assert.strictEqual(viewMultiReq4096.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');

    // 3. 指定目标需求 REQ-1 时：精准匹配 run1，状态为 valid
    const viewReq1 = env.recovery.getProjectRecovery(proj.id, { targetRequirementId: 'REQ-1', maxBudgetBytes: 4096 });
    assert.strictEqual(viewReq1.authorizations.authorizationState, 'valid');
    assert.strictEqual(viewReq1.authorizations.targetRunId, run1.id);

    // 4. 核心反例：结构损坏分支（例如 intent.title 错填为 42）
    // 账本中存在具有有效授权的运行 run1，但项目记录结构损坏
    const fullProj = env.recordService.get(human, proj.id)!;
    fullProj.records.intent.title = 42 as any; // 故意破坏结构

    const stopViewCorrupted = buildRecoveryProjection(fullProj, [run1], {
      maxBudgetBytes: 4096,
      deliveryFormat: 'compact_json'
    });

    // 必须如实反映：授权适用性无法核验，绝不能篡改为 'none'，也绝不能因 active: true 谎报为可执行 'valid'
    assert.strictEqual(
      stopViewCorrupted.authorizations.authorizationState,
      'unverified_due_to_corruption',
      `结构损坏时授权状态必须为 unverified_due_to_corruption（实际: ${stopViewCorrupted.authorizations.authorizationState}）`
    );
    assert.strictEqual(stopViewCorrupted.authorizations.targetRunId, run1.id);
    assert.strictEqual(stopViewCorrupted.authorizations.retrievalEndpoint, `/api/runs/${run1.id}`);
    assert.strictEqual(stopViewCorrupted.nextSafeAction.actionCode, 'STOP_AND_REPORT_GAP');

    // 验证 Markdown
    const { renderRecoveryMarkdown } = await import('../src/domain/recovery.js');
    const mdCorruptedText = renderRecoveryMarkdown(stopViewCorrupted);
    assert.ok(
      mdCorruptedText.includes('**工作区授权状态**：`unverified_due_to_corruption`（因项目记录结构损坏，授权适用性未核对，禁止继续执行）'),
      `Markdown 必须如实表达 unverified_due_to_corruption，实际: ${mdCorruptedText}`
    );
    assert.ok(
      !mdCorruptedText.includes('`none`'),
      '结构损坏且存在运行时，工作区授权绝不能误写为 none'
    );

    // 消费者重检必须失败
    const verifyCorrupted = verifyRetrievedRunAuthorization({
      run: run1,
      recoveryView: stopViewCorrupted
    });
    assert.strictEqual(verifyCorrupted.valid, false);
    assert.strictEqual(verifyCorrupted.state, 'unverified_due_to_corruption');
    assert.ok(verifyCorrupted.reason.includes('结构损坏'));
  } finally {
    env.cleanup();
  }
});

test('第十四批 缺口 1: 目标绑定与归属全校验 — 双需求未定拒绝自行选定、跨项目/跨需求归属拦截、必须核对需求归属', async () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '目标绑定测试项目',
      title: '意图标题',
      problem: '意图问题',
      expectedOutcome: '达成预期成果',
      includes: ['核心范围'],
      excludes: [],
      constraints: ['项目约束'],
      confirmed: true
    }, 'proj-binding-test');

    const srcRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-BINDING-1',
        kind: 'human_observation',
        locator: 'docs/intent.md#L1',
        excerpt: '意图来源'
      },
      reason: '创建初始来源',
      confirmed: true
    }, 'req-src-binding-1');

    const req1Res = env.recordService.saveRecord(human, proj.id, {
      baseRevision: srcRes.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-BINDING-A',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 A',
        problem: '问题 A',
        expectedOutcome: '成果 A',
        status: 'draft',
        scope: { includes: ['范围 A'], excludes: [] },
        constraints: [],
        rationale: '理由 A',
        expectedImpact: '影响 A',
        acceptanceCriteria: [{ id: 'C-A', description: '准则 A', verification: 'test' }],
        acceptance: null,
        result: null,
        pullRequest: null,
        sourceRefs: ['SRC-BINDING-1']
      },
      reason: '创建需求 A',
      confirmed: true
    }, 'create-req-a');

    const req2Res = env.recordService.saveRecord(human, proj.id, {
      baseRevision: req1Res.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-BINDING-B',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 B',
        problem: '问题 B',
        expectedOutcome: '成果 B',
        status: 'draft',
        scope: { includes: ['范围 B'], excludes: [] },
        constraints: [],
        rationale: '理由 B',
        expectedImpact: '影响 B',
        acceptanceCriteria: [{ id: 'C-B', description: '准则 B', verification: 'test' }],
        acceptance: null,
        result: null,
        pullRequest: null,
        sourceRefs: ['SRC-BINDING-1']
      },
      reason: '创建需求 B',
      confirmed: true
    }, 'create-req-b');

    // 创建针对 REQ-BINDING-A 的运行 runA
    const runA: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-REQ-A',
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-BINDING-A',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-a-001',
      requestHash: 'a'.repeat(64),
      baseRevision: req2Res.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: ['src/a.ts'],
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
        fingerprint: 'b'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-BINDING-A',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '问题 A',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    env.runStore.create(runA);

    // 创建针对 REQ-BINDING-B 的运行 runB
    const runB: HarnessRun = {
      ...runA,
      id: 'RUN-REQ-B',
      requirementId: 'REQ-BINDING-B',
      candidate: { ...runA.candidate!, requirementId: 'REQ-BINDING-B' }
    };
    env.runStore.create(runB);

    const currentProject = env.recordService.get(human, proj.id)!;

    // 1. 双需求未选定目标需求时：恢复包产出 SELECT_TARGET_REQUIREMENT, authorizationState: unknown, targetRunId: null
    const viewMultiReq = env.recovery.getProjectRecovery(proj.id);
    assert.strictEqual(viewMultiReq.nextSafeAction.actionCode, 'SELECT_TARGET_REQUIREMENT');
    assert.strictEqual(viewMultiReq.authorizations.authorizationState, 'unknown');
    assert.strictEqual(viewMultiReq.authorizations.targetRunId, null);

    // 传入 runA 或 runB 进行重检：必须被阻断，绝不能被判为有效！
    const verifyUnselectedA = verifyRetrievedRunAuthorization({
      run: runA,
      recoveryView: viewMultiReq,
      currentProject
    });
    assert.strictEqual(verifyUnselectedA.valid, false);
    assert.strictEqual(verifyUnselectedA.state, 'unknown');
    assert.ok(verifyUnselectedA.reason.includes('SELECT_TARGET_REQUIREMENT'));

    const verifyUnselectedB = verifyRetrievedRunAuthorization({
      run: runB,
      recoveryView: viewMultiReq,
      currentProject
    });
    assert.strictEqual(verifyUnselectedB.valid, false);
    assert.strictEqual(verifyUnselectedB.state, 'unknown');

    // 2. 选定目标需求 REQ-BINDING-A，恢复包绑定 runA
    const viewReqA = env.recovery.getProjectRecovery(proj.id, { targetRequirementId: 'REQ-BINDING-A' });
    assert.strictEqual(viewReqA.authorizations.authorizationState, 'valid');
    assert.strictEqual(viewReqA.authorizations.targetRunId, 'RUN-REQ-A');

    // 正常匹配核对：通过
    const verifyValid = verifyRetrievedRunAuthorization({
      run: runA,
      recoveryView: viewReqA,
      currentProject
    });
    assert.strictEqual(verifyValid.valid, true);
    assert.strictEqual(verifyValid.state, 'valid');
    assert.strictEqual(verifyValid.checks.identityMatch, true);
    assert.strictEqual(verifyValid.checks.projectBindingMatch, true);
    assert.strictEqual(verifyValid.checks.requirementBindingMatch, true);

    // 3. 跨项目错绑拦截：传入其他项目的 Run
    const foreignProjectRun: HarnessRun = { ...runA, projectId: 'FOREIGN-PROJECT-999' };
    const verifyForeignProject = verifyRetrievedRunAuthorization({
      run: foreignProjectRun,
      recoveryView: viewReqA,
      currentProject
    });
    assert.strictEqual(verifyForeignProject.valid, false);
    assert.strictEqual(verifyForeignProject.state, 'unknown');
    assert.strictEqual(verifyForeignProject.checks.projectBindingMatch, false);
    assert.ok(verifyForeignProject.reason.includes('跨项目错绑'));

    // 4. 跨需求错绑拦截：传入其他需求的 Run（如 runB）
    const foreignReqRun: HarnessRun = { ...runA, requirementId: 'REQ-BINDING-B' };
    const verifyForeignReq = verifyRetrievedRunAuthorization({
      run: foreignReqRun,
      recoveryView: viewReqA,
      currentProject
    });
    assert.strictEqual(verifyForeignReq.valid, false);
    assert.strictEqual(verifyForeignReq.state, 'unknown');
    assert.strictEqual(verifyForeignReq.checks.requirementBindingMatch, false);
    assert.ok(verifyForeignReq.reason.includes('跨需求错绑'));

    // 5. Run ID 不匹配拦截
    const foreignIdRun: HarnessRun = { ...runA, id: 'RUN-DIFFERENT-ID' };
    const verifyForeignId = verifyRetrievedRunAuthorization({
      run: foreignIdRun,
      recoveryView: viewReqA,
      currentProject
    });
    assert.strictEqual(verifyForeignId.valid, false);
    assert.strictEqual(verifyForeignId.state, 'unknown');
    assert.strictEqual(verifyForeignId.checks.identityMatch, false);
    assert.ok(verifyForeignId.reason.includes('不匹配'));

    // 6. 目标需求在当前项目中已被删除
    const projectWithReqDeleted: RecordProject = {
      ...currentProject,
      records: {
        ...currentProject.records,
        requirements: currentProject.records.requirements.filter(r => r.id !== 'REQ-BINDING-A')
      }
    };
    const verifyDeletedReq = verifyRetrievedRunAuthorization({
      run: runA,
      recoveryView: viewReqA,
      currentProject: projectWithReqDeleted
    });
    assert.strictEqual(verifyDeletedReq.valid, false);
    assert.strictEqual(verifyDeletedReq.state, 'none');
    assert.strictEqual(verifyDeletedReq.checks.requirementExistsInCurrentProject, false);
    assert.ok(verifyDeletedReq.reason.includes('不存在'));

    // 7. 目标需求意图归属漂移
    const projectWithIntentDrifted: RecordProject = {
      ...currentProject,
      records: {
        ...currentProject.records,
        requirements: currentProject.records.requirements.map(r =>
          r.id === 'REQ-BINDING-A' ? { ...r, intentId: 'INTENT-DRIFTED' } : r
        )
      }
    };
    const verifyIntentDrifted = verifyRetrievedRunAuthorization({
      run: runA,
      recoveryView: viewReqA,
      currentProject: projectWithIntentDrifted
    });
    assert.strictEqual(verifyIntentDrifted.valid, false);
    assert.strictEqual(verifyIntentDrifted.state, 'unverified_due_to_corruption');
    assert.ok(verifyIntentDrifted.reason.includes('UNKNOWN_INTENT') || verifyIntentDrifted.reason.includes('意图'));
  } finally {
    env.cleanup();
  }
});

test('第十四批 缺口 2: 真实重检当前事实与结构校验 — 拒绝退回旧快照、覆盖当前项目损坏/修订前进/需求移除、区分授权适用与工作区权限', async () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '当前事实重检测试项目',
      title: '意图标题',
      problem: '意图问题描述',
      expectedOutcome: '达成预期业务成果',
      includes: ['核心范围'],
      excludes: [],
      constraints: ['项目约束'],
      confirmed: true
    }, 'proj-fact-recheck');

    const srcRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-FACT-1',
        kind: 'human_observation',
        locator: 'docs/intent.md#L1',
        excerpt: '意图来源'
      },
      reason: '创建来源',
      confirmed: true
    }, 'req-src-fact-1');

    const reqRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: srcRes.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-FACT-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '测试事实重检需求',
        problem: '需要核验当前事实',
        expectedOutcome: '当前事实真实有效',
        status: 'draft',
        scope: { includes: ['范围'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-1', description: '准则 1', verification: 'test' }],
        acceptance: null,
        result: null,
        pullRequest: null,
        sourceRefs: ['SRC-FACT-1']
      },
      reason: '创建需求',
      confirmed: true
    }, 'create-req-fact');

    const runValid: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-FACT-1',
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-FACT-1',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-fact-1',
      requestHash: 'c'.repeat(64),
      baseRevision: reqRes.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: ['src/app.ts'],
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
        fingerprint: 'd'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-FACT-1',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '问题',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    env.runStore.create(runValid);

    const view = env.recovery.getProjectRecovery(proj.id, { targetRequirementId: 'REQ-FACT-1' });
    const currentProject = env.recordService.get(human, proj.id)!;

    // 1. 缺少当前项目读取依据时（既无 currentProject 又无 revision）：必须拒绝并返回未核对，禁止退回旧快照
    const verifyNoCurrent = verifyRetrievedRunAuthorization({
      run: runValid,
      recoveryView: view
    });
    assert.strictEqual(verifyNoCurrent.valid, false);
    assert.strictEqual(verifyNoCurrent.state, 'unverified_due_to_corruption');
    assert.ok(verifyNoCurrent.reason.includes('缺少当前正式项目读取依据'));

    // 2. 恢复包生成后，当前项目结构发生损坏（如 intent.title 被意外篡改为空或非字符串）
    const corruptedProject: RecordProject = {
      ...currentProject,
      records: {
        ...currentProject.records,
        intent: {
          ...currentProject.records.intent,
          title: 42 as any // 结构损坏
        }
      }
    };
    const verifyCorruptedProject = verifyRetrievedRunAuthorization({
      run: runValid,
      recoveryView: view,
      currentProject: corruptedProject
    });
    assert.strictEqual(verifyCorruptedProject.valid, false);
    assert.strictEqual(verifyCorruptedProject.state, 'unverified_due_to_corruption');
    assert.strictEqual(verifyCorruptedProject.checks.projectStructureHealthy, false);
    assert.ok(verifyCorruptedProject.reason.includes('存在结构损坏'));

    // 3. 语义区分：运行授权适用 vs 是否获准读取工作区 vs 是否可执行某个动作
    // 情况 A: 获得工作区授权的完整运行
    const verifyFullWorkspace = verifyRetrievedRunAuthorization({
      run: runValid,
      recoveryView: view,
      currentProject
    });
    assert.strictEqual(verifyFullWorkspace.valid, true);
    assert.strictEqual(verifyFullWorkspace.runAuthorizationApplicable, true);
    assert.strictEqual(verifyFullWorkspace.workspaceAccessGranted, true);
    assert.strictEqual(verifyFullWorkspace.executableNow, true);
    assert.ok(verifyFullWorkspace.reason.includes('已获准工作区读取'));

    // 情况 B: 未授予工作区授权的上下文运行（workspace.authorized: false）
    // 关键规范：不能因未授予工作区读取就否定仅使用正式上下文的合法运行！
    const contextOnlyRun: HarnessRun = {
      ...runValid,
      authorization: {
        ...runValid.authorization,
        workspace: {
          ...runValid.authorization.workspace!,
          authorized: false
        }
      }
    };
    const verifyContextOnly = verifyRetrievedRunAuthorization({
      run: contextOnlyRun,
      recoveryView: view,
      currentProject
    });
    assert.strictEqual(verifyContextOnly.valid, true, '上下文运行授权应当有效，不应因未授权工作区而被判为无效');
    assert.strictEqual(verifyContextOnly.runAuthorizationApplicable, true);
    assert.strictEqual(verifyContextOnly.workspaceAccessGranted, false, '工作区读取权限应为 false');
    assert.ok(verifyContextOnly.reason.includes('未被授予工作区读取权限（仅限使用正式记录上下文）'));

    // 4. Markdown 报告与 JSON 报告格式化验证
    const mdReport = renderVerificationMarkdown(verifyFullWorkspace);
    assert.ok(mdReport.includes('# 跨会话冷启动恢复：运行授权核对报告'));
    assert.ok(mdReport.includes('**整体重检结论**：✅ 通过'));
    assert.ok(mdReport.includes('**运行授权是否适用**：是'));
    assert.ok(mdReport.includes('**是否获准读取工作区**：是 (根目录: `/tmp/worktree/test`)'));
    assert.ok(mdReport.includes('[x] 运行标识对齐：`RUN-FACT-1`'));

    const jsonReport = createVerificationJsonReport(verifyFullWorkspace);
    assert.strictEqual(jsonReport.valid, true);
    assert.strictEqual(jsonReport.runAuthorizationApplicable, true);
    assert.strictEqual(jsonReport.workspaceAccessGranted, true);
    const jsonBytes = Buffer.byteLength(JSON.stringify(jsonReport, null, 2), 'utf8');
    assert.ok(jsonBytes <= 4096, `验证 JSON 报告体积 (${jsonBytes} 字节) 必须 <= 4096 字节`);

    // 5. 应用服务层 verifyRecoveryAuthorization 闭环验证
    const serviceVerification = env.recovery.verifyRecoveryAuthorization(view);
    assert.strictEqual(serviceVerification.valid, true);
    assert.strictEqual(serviceVerification.state, 'valid');
    assert.strictEqual(serviceVerification.targetRunId, 'RUN-FACT-1');
  } finally {
    env.cleanup();
  }
});

test('第十四批 缺口 3: 统一 retrievalLocator 定位合同与防穿越安全解析 — 进程 A 保存恢复包 → 进程 B 纯依据定位字段与配置取回并完成真实重检闭环', async () => {
  const env = createTestEnv();
  try {
    // 1. 自定义非 runs 命名的运行账本目录，证明不硬编码 "runs" 目录名
    const customRunDir = join(env.dir, 'custom-harness-ledgers');
    const customRunStore = new JsonRunStore(customRunDir);

    const proj = env.recordService.create(human, {
      name: '跨进程定位测试项目',
      title: '意图标题',
      problem: '意图问题',
      expectedOutcome: '成果',
      includes: ['范围'],
      excludes: [],
      constraints: ['约束'],
      confirmed: true
    }, 'proj-cross-proc');

    const srcRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-PROC-1',
        kind: 'human_observation',
        locator: 'docs/intent.md#L1',
        excerpt: '意图来源'
      },
      reason: '创建来源',
      confirmed: true
    }, 'req-src-proc-1');

    const reqRes = env.recordService.saveRecord(human, proj.id, {
      baseRevision: srcRes.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-PROC-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '测试跨进程重检需求',
        problem: '需要核验跨进程消费',
        expectedOutcome: '跨进程消费自洽完成',
        status: 'draft',
        scope: { includes: ['范围'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C-1', description: '准则 1', verification: 'test' }],
        acceptance: null,
        result: null,
        pullRequest: null,
        sourceRefs: ['SRC-PROC-1']
      },
      reason: '创建需求',
      confirmed: true
    }, 'create-req-proc');

    const runId = 'RUN-PROC-LOOP-1';
    const procRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: runId,
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-PROC-1',
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-proc-loop-1',
      requestHash: 'e'.repeat(64),
      baseRevision: reqRes.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp/worktree/test',
          readScope: ['src/index.ts'],
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
        fingerprint: 'f'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: {
        type: 'append_context',
        requirementId: 'REQ-PROC-1',
        category: 'open_question',
        epistemicStatus: 'unknown',
        content: '待决问题',
        sourceRefs: []
      },
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    customRunStore.create(procRun);

    // 2. 测试 resolveRunLocatorPath 定位合同与边界防御
    // 2.1 规范定位符
    const resolvedCanonical = resolveRunLocatorPath(customRunDir, `${runId}.json`);
    assert.strictEqual(resolvedCanonical, join(customRunDir, `${runId}.json`));

    // 2.2 兼容旧版包含 runs/ 前缀的定位符（安全剥离，不猜测路径）
    const resolvedLegacy = resolveRunLocatorPath(customRunDir, `runs/${runId}.json`);
    assert.strictEqual(resolvedLegacy, join(customRunDir, `${runId}.json`));

    // 2.3 边界防御：拒绝目录穿越
    assert.throws(
      () => resolveRunLocatorPath(customRunDir, `../../etc/passwd`),
      (err: any) => err.code === 'INVALID_LOCATOR' && err.message.includes('禁止目录穿越')
    );
    assert.throws(
      () => resolveRunLocatorPath(customRunDir, `runs/../secret.json`),
      (err: any) => err.code === 'INVALID_LOCATOR' && err.message.includes('禁止目录穿越')
    );

    // 2.4 边界防御：拒绝绝对路径
    assert.throws(
      () => resolveRunLocatorPath(customRunDir, `/etc/passwd`),
      (err: any) => err.code === 'INVALID_LOCATOR' && err.message.includes('拒绝绝对路径')
    );

    // 2.5 边界防御：拒绝非法文件名
    assert.throws(
      () => resolveRunLocatorPath(customRunDir, `malicious.sh`),
      (err: any) => err.code === 'INVALID_LOCATOR' && err.message.includes('文件名非法')
    );

    // 3. 独立子进程闭环验证：
    // 进程 A: 生成并保存恢复包 → 退出进程 A
    const procARes = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--projectDir',
        env.projectDir,
        '--runDir',
        customRunDir,
        '--projectId',
        proj.id,
        '--targetRequirementId',
        'REQ-PROC-1',
        '--budgetBytes',
        '4096',
        '--format',
        'json'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(procARes.status, 0, `进程 A 必须成功退出: ${procARes.stderr}`);
    const packetJsonText = procARes.stdout;
    const packetJson = JSON.parse(packetJsonText) as ProjectRecoveryView;
    assert.strictEqual(packetJson.authorizations.targetRunId, runId);
    assert.strictEqual(packetJson.authorizations.retrievalLocator, `${runId}.json`);

    const packetFilePath = join(env.dir, 'recovery-packet-transport.json');
    writeFileSync(packetFilePath, packetJsonText, 'utf8');

    // 进程 B: 仅凭恢复包文件及必要读取配置，取回账本、读取当前项目并完成重检
    // 关键点：测试进程绝不带外传递 targetRunId，也不重建文件名，完全依赖恢复包内的 retrievalLocator
    const procBRes = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetFilePath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        customRunDir,
        '--budgetBytes',
        '4096',
        '--format',
        'json'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(procBRes.status, 0, `进程 B 必须成功退出: ${procBRes.stderr}`);
    const verdictJson = JSON.parse(procBRes.stdout);
    assert.strictEqual(verdictJson.valid, true);
    assert.strictEqual(verdictJson.state, 'valid');
    assert.strictEqual(verdictJson.runAuthorizationApplicable, true);
    assert.strictEqual(verdictJson.workspaceAccessGranted, true);
    assert.strictEqual(verdictJson.targetRunId, runId);
    assert.strictEqual(verdictJson.targetRequirementId, 'REQ-PROC-1');
    assert.strictEqual(verdictJson.checks.identityMatch, true);
    assert.strictEqual(verdictJson.checks.projectBindingMatch, true);
    assert.strictEqual(verdictJson.checks.requirementBindingMatch, true);
    assert.ok(Buffer.byteLength(procBRes.stdout, 'utf8') <= 4096);

    // 进程 B (Markdown 格式验证)
    const procBMdRes = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetFilePath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        customRunDir,
        '--budgetBytes',
        '4096',
        '--format',
        'markdown'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(procBMdRes.status, 0, `进程 B Markdown 必须成功退出: ${procBMdRes.stderr}`);
    const mdOut = procBMdRes.stdout;
    assert.ok(mdOut.includes('# 跨会话冷启动恢复：运行授权核对报告'));
    assert.ok(mdOut.includes('**整体重检结论**：✅ 通过'));
    assert.ok(mdOut.includes('**运行授权是否适用**：是'));
    assert.ok(mdOut.includes('[x] 运行标识对齐：`RUN-PROC-LOOP-1`'));
    assert.ok(Buffer.byteLength(mdOut, 'utf8') <= 4096);

    // 4. 变化检测验证：正式项目前进至新修订后，进程 B 重检精确识别 stale_revision
    env.recordService.saveRecord(human, proj.id, {
      baseRevision: reqRes.revision,
      collection: 'sources',
      id: null,
      record: {
        id: 'SRC-PROC-2',
        kind: 'human_observation',
        locator: 'docs/intent.md#L20',
        excerpt: '新修订来源'
      },
      reason: '项目推进至新修订',
      confirmed: true
    }, 'advance-project-rev');

    const procBStaleRes = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetFilePath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        customRunDir,
        '--format',
        'json'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(procBStaleRes.status, 0);
    const staleVerdict = JSON.parse(procBStaleRes.stdout);
    assert.strictEqual(staleVerdict.valid, false);
    assert.strictEqual(staleVerdict.state, 'stale_revision');
    assert.strictEqual(staleVerdict.checks.projectRevisionCurrent, false);
    assert.ok(staleVerdict.reason.includes('D18.1 保守策略'));

    // 5. 篡改与越界注入拦截：恢复包内 retrievalLocator 被恶意注入目录穿越路径
    const tamperedPacket: ProjectRecoveryView = {
      ...packetJson,
      authorizations: {
        ...packetJson.authorizations,
        retrievalLocator: '../../etc/passwd.json'
      }
    };
    const tamperedPath = join(env.dir, 'tampered-recovery-packet.json');
    writeFileSync(tamperedPath, JSON.stringify(tamperedPacket, null, 2) + '\n', 'utf8');

    const procBInjected = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        tamperedPath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        customRunDir
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(procBInjected.status, 1, '注入目录穿越时 CLI 必须以非零退出码失败拦截');
    assert.ok(procBInjected.stderr.includes('INVALID_LOCATOR'));
  } finally {
    env.cleanup();
  }
});

test('第十五批 缺口 1: 移除缺少当前项目时的兼容放行 — 禁止仅凭修订比较推断有效授权，必须具备真实项目并经结构与关系核验', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '项目 R15-G1',
      title: '意图 R15-G1',
      problem: '痛点',
      expectedOutcome: '期望',
      includes: ['核心'],
      excludes: [],
      constraints: [],
      confirmed: true
    }, 'init-proj-r15-g1');
    const reqId = 'REQ-R15-G1';
    const pWithReq = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: reqId,
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 R15-G1',
        problem: '问题',
        expectedOutcome: '期望',
        scope: { includes: ['范围'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C1', description: '条件', verification: 'test' }],
        sourceRefs: [],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '测试添加需求一',
      confirmed: true
    }, 'add-req-proj-r15-g1');

    const runId = 'RUN-R15-G1';
    const mockRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: runId,
      revision: 1,
      projectId: pWithReq.id,
      requirementId: reqId,
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-r15-g1-test',
      requestHash: 'e'.repeat(64),
      baseRevision: pWithReq.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: 'docs',
          readScope: ['docs/readme.md'],
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
        fingerprint: 'f'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };

    const recoveryView = buildRecoveryProjection(pWithReq, [mockRun], { targetRequirementId: reqId });

    // 1. 核心反例：仅传 currentProjectRevision 而不传 currentProject
    // 过去的老兼容分支会放行返回 valid: true，现在必须无条件返回 valid: false, unverified_due_to_corruption
    const resNoProject = verifyRetrievedRunAuthorization({
      recoveryView: {
        ...recoveryView,
        authorizations: {
          ...recoveryView.authorizations,
          targetRunId: runId,
          authorizationState: 'valid'
        }
      },
      run: mockRun,
      currentProjectRevision: pWithReq.revision
      // 故意不传 currentProject
    });
    assert.strictEqual(resNoProject.valid, false, '缺少当前项目事实时绝不允许放行返回 valid: true');
    assert.strictEqual(resNoProject.state, 'unverified_due_to_corruption');
    assert.strictEqual(resNoProject.checks.projectStructureHealthy, false);
    assert.strictEqual(resNoProject.checks.projectRelationsValid, false);
    assert.strictEqual(resNoProject.checks.requirementExistsInCurrentProject, false);
    assert.ok(
      resNoProject.reason.includes('缺少当前正式项目读取依据'),
      `原因必须准确指出缺少读取依据: ${resNoProject.reason}`
    );

    // 2. 正常传入 currentProject 但 run 为 null 时，返回 state: 'none', run: null
    const resNoRun = verifyRetrievedRunAuthorization({
      recoveryView: {
        ...recoveryView,
        authorizations: {
          ...recoveryView.authorizations,
          targetRunId: runId,
          authorizationState: 'valid'
        }
      },
      currentProject: pWithReq,
      run: null
    });
    assert.strictEqual(resNoRun.valid, false);
    assert.strictEqual(resNoRun.state, 'none');
    assert.strictEqual(resNoRun.run, null);
    assert.ok(resNoRun.reason.includes('未读取到目标运行账本内容'));

    // 3. 传入当前项目与运行，但需求在当前项目中已被删除，返回 state: 'none', checks.requirementExistsInCurrentProject: false
    const resStaleReq = verifyRetrievedRunAuthorization({
      recoveryView: {
        ...recoveryView,
        goal: {
          ...recoveryView.goal,
          activeRequirement: {
            ...recoveryView.goal.activeRequirement!,
            id: 'REQ-DELETED-FROM-PROJECT'
          }
        },
        authorizations: {
          ...recoveryView.authorizations,
          targetRunId: runId,
          authorizationState: 'valid'
        }
      },
      currentProject: pWithReq,
      run: {
        ...mockRun,
        requirementId: 'REQ-DELETED-FROM-PROJECT'
      }
    });
    assert.strictEqual(resStaleReq.valid, false);
    assert.strictEqual(resStaleReq.checks.requirementExistsInCurrentProject, false);
    assert.strictEqual(resStaleReq.state, 'none');
    assert.ok(resStaleReq.reason.includes('不存在（可能已被移除）'));
  } finally {
    env.cleanup();
  }
});

test('第十五批 缺口 2: 复用正式记录完整关系校验 — 仅凭 Ajv Schema 校验无法发现断裂引用，必须调用 inspectRecordRelations', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '项目 R15-G2',
      title: '意图 R15-G2',
      problem: '痛点',
      expectedOutcome: '期望',
      includes: ['核心'],
      excludes: [],
      constraints: [],
      confirmed: true
    }, 'init-proj-r15-g2');

    const sourceId = 'SRC-R15-G2';
    const pWithSrc = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'sources',
      id: null,
      record: {
        id: sourceId,
        kind: 'human_observation',
        locator: 'docs/test-source.md',
        excerpt: '用户测试出处内容'
      },
      reason: '测试添加出处',
      confirmed: true
    }, 'add-src-proj-r15-g2');

    const reqId = 'REQ-R15-G2';
    const pWithReq = env.recordService.saveRecord(human, proj.id, {
      baseRevision: pWithSrc.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: reqId,
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 R15-G2',
        problem: '痛点',
        expectedOutcome: '期望',
        scope: { includes: ['核心'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C1', description: '条件', verification: 'test' }],
        sourceRefs: [sourceId],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '测试添加需求二',
      confirmed: true
    }, 'add-req-proj-r15-g2');

    const runId = 'RUN-R15-G2';
    const validRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: runId,
      revision: 1,
      projectId: pWithReq.id,
      requirementId: reqId,
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-r15-g2-test',
      requestHash: 'e'.repeat(64),
      baseRevision: pWithReq.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: 'docs',
          readScope: ['docs/readme.md'],
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
        fingerprint: 'f'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    env.runStore.create(validRun);

    // 1. 构建包含 source 的恢复投影
    const recoveryView = buildRecoveryProjection(pWithReq, [validRun], { targetRequirementId: reqId });

    // 2. 构造关系断裂的项目数据（例如：Requirement 引用了一个不存在的 source，而 schema 仍然合法）
    const corruptedProj = JSON.parse(JSON.stringify(pWithReq)) as RecordProject;
    // Ajv 结构校验器
    const validator = createRecordStructureValidator();
    const schemaPassBefore = validator.check(corruptedProj.records);
    assert.strictEqual(schemaPassBefore.valid, true);

    // 制造断裂引用：清空 sources 数组，但 requirement.sourceRefs 仍引用 sourceId
    corruptedProj.records.sources = []; // 移除非空来源

    // 验证：Ajv Schema 层面校验完全通过（因为 sources 是合法空数组，requirements 也是合法对象）
    const schemaPassAfter = validator.check(corruptedProj.records);
    assert.strictEqual(schemaPassAfter.valid, true, '单纯的 Ajv Schema 结构校验在此处无法检测到引用断裂');

    // 验证：调用 inspectRecordRelations 会立即检测出 UNKNOWN_REFERENCE
    const relationIssues = inspectRecordRelations(corruptedProj.records);
    assert.ok(relationIssues.length > 0, '关系校验必须检测到断裂引用');
    assert.ok(relationIssues.some(i => i.code === 'UNKNOWN_REFERENCE'));

    // 3. 领域层 verifyRetrievedRunAuthorization 调用关系校验并返回 unverified_due_to_corruption
    const domainCheck = verifyRetrievedRunAuthorization({
      recoveryView: {
        ...recoveryView,
        authorizations: {
          ...recoveryView.authorizations,
          targetRunId: runId,
          authorizationState: 'valid'
        }
      },
      currentProject: corruptedProj,
      run: validRun,
      validator
    });
    assert.strictEqual(domainCheck.valid, false);
    assert.strictEqual(domainCheck.checks.projectStructureHealthy, true, '基础结构与 Schema 语法合法');
    assert.strictEqual(domainCheck.checks.projectRelationsValid, false, '但语义关系校验失败');
    assert.strictEqual(domainCheck.state, 'unverified_due_to_corruption');
    assert.ok(domainCheck.reason.includes('UNKNOWN_REFERENCE'), `原因应包含具体问题代码: ${domainCheck.reason}`);

    // 4. CLI 层面端到端消费验证：将关系断裂项目写入磁盘并执行验证
    writeFileSync(
      join(env.projectDir, `${corruptedProj.id}.json`),
      JSON.stringify(corruptedProj, null, 2) + '\n',
      'utf8'
    );
    const packetPath = join(env.dir, 'r15-g2-packet.json');
    writeFileSync(packetPath, JSON.stringify(recoveryView, null, 2) + '\n', 'utf8');

    const cliRes = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetPath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        env.runDir,
        '--format',
        'json'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(cliRes.status, 0);
    const cliVerdict = JSON.parse(cliRes.stdout);
    assert.strictEqual(cliVerdict.valid, false);
    assert.strictEqual(cliVerdict.checks.projectRelationsValid, false);
    assert.strictEqual(cliVerdict.state, 'unverified_due_to_corruption');
    assert.ok(cliVerdict.reason.includes('UNKNOWN_REFERENCE'));
  } finally {
    env.cleanup();
  }
});

test('第十五批 缺口 3: 落实验证报告的默认预算 32768 字节与真实交付边界 — 海量授权范围时省略明细并保留可查定位与结论', () => {
  const env = createTestEnv();
  try {
    const proj = env.recordService.create(human, {
      name: '项目 R15-G3',
      title: '意图 R15-G3',
      problem: '痛点',
      expectedOutcome: '期望',
      includes: ['核心'],
      excludes: [],
      constraints: [],
      confirmed: true
    }, 'init-proj-r15-g3');

    const reqId = 'REQ-R15-G3';
    const pWithReq = env.recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: reqId,
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '需求 R15-G3',
        problem: '痛点',
        expectedOutcome: '期望',
        scope: { includes: ['核心'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C1', description: '条件', verification: 'test' }],
        sourceRefs: [],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '测试添加需求三',
      confirmed: true
    }, 'add-req-proj-r15-g3');

    // 构造一个包含 500 个长路径 readScope 的海量授权运行（原始体积 > 50 KiB）
    const largeReadScope: string[] = [];
    for (let i = 0; i < 500; i++) {
      largeReadScope.push(
        `docs/sub-specifications/module-category-${i}/detailed-specification-document-file-name-with-extra-long-subpath-${i}.md`
      );
    }

    const runId = 'RUN-R15-G3-MASSIVE';
    const massiveRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: runId,
      revision: 1,
      projectId: pWithReq.id,
      requirementId: reqId,
      createdAt: '2026-10-29T00:00:00Z',
      requestId: 'req-r15-g3-massive',
      requestHash: 'e'.repeat(64),
      baseRevision: pWithReq.revision,
      state: 'waiting_human',
      stopReason: 'CANDIDATE_GENERATED',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: 'docs',
          readScope: largeReadScope,
          exclude: ['**/*.tmp'],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 100000, maxOutputBytes: 100000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false,
        fingerprint: 'f'.repeat(64)
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-29T00:00:00Z', type: 'started', details: {} }]
    };
    env.runStore.create(massiveRun);

    const recoveryView = buildRecoveryProjection(pWithReq, [massiveRun], {
      targetRequirementId: reqId
    });
    const packetPath = join(env.dir, 'r15-g3-massive-packet.json');
    writeFileSync(packetPath, JSON.stringify(recoveryView, null, 2) + '\n', 'utf8');

    // 1. 验证报告 JSON：不传 --budgetBytes 时默认生效 32768 字节
    const cliDefaultJson = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetPath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        env.runDir,
        '--format',
        'json'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(cliDefaultJson.status, 0);
    const defaultJsonBytes = getUtf8ByteLength(cliDefaultJson.stdout);
    assert.ok(
      defaultJsonBytes <= DEFAULT_RECOVERY_BUDGET_BYTES,
      `默认预算下实际输出字节 ${defaultJsonBytes} 必须 <= ${DEFAULT_RECOVERY_BUDGET_BYTES}`
    );
    const parsedDefault = JSON.parse(cliDefaultJson.stdout);
    assert.strictEqual(parsedDefault.valid, true);
    assert.strictEqual(parsedDefault.authorizationDetailsOmitted, true, '海量授权应安全省略明细');
    assert.strictEqual(parsedDefault.activeGrant, null, 'activeGrant 详细列表应置空以节约预算');
    assert.ok(parsedDefault.retrievalLocator || parsedDefault.retrievalEndpoint, '必须保留定位字段');
    assert.ok(parsedDefault.notes && parsedDefault.notes.length > 0);

    // 2. 验证报告 JSON：显式传入 4096 字节极限预算
    const cli4096Json = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetPath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        env.runDir,
        '--budgetBytes',
        '4096',
        '--format',
        'json'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(cli4096Json.status, 0);
    const json4096Bytes = getUtf8ByteLength(cli4096Json.stdout);
    assert.ok(
      json4096Bytes <= 4096,
      `4096 字节预算下实际输出字节 ${json4096Bytes} 必须 <= 4096`
    );
    const parsed4096 = JSON.parse(cli4096Json.stdout);
    assert.strictEqual(parsed4096.valid, true);

    // 3. 验证报告 Markdown：默认预算 (32768) 与极限预算 (4096)
    const cliDefaultMd = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetPath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        env.runDir,
        '--format',
        'markdown'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(cliDefaultMd.status, 0);
    const mdDefaultBytes = getUtf8ByteLength(cliDefaultMd.stdout);
    assert.ok(
      mdDefaultBytes <= DEFAULT_RECOVERY_BUDGET_BYTES,
      `Markdown 默认预算输出 ${mdDefaultBytes} 必须 <= ${DEFAULT_RECOVERY_BUDGET_BYTES}`
    );
    assert.ok(
      cliDefaultMd.stdout.includes('authorizationDetailsOmitted') ||
        cliDefaultMd.stdout.includes('retrievalLocator') ||
        cliDefaultMd.stdout.includes('授权读取范围清单'),
      'Markdown 默认预算输出应包含省略提示或定位说明'
    );

    const cli4096Md = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetPath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        env.runDir,
        '--budgetBytes',
        '4096',
        '--format',
        'markdown'
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(cli4096Md.status, 0);
    const md4096Bytes = getUtf8ByteLength(cli4096Md.stdout);
    assert.ok(
      md4096Bytes <= 4096,
      `Markdown 4096 预算输出 ${md4096Bytes} 必须 <= 4096`
    );
  } finally {
    env.cleanup();
  }
});

test('第十五批 缺口 4: 约束账本文件的物理读取范围与禁止符号链接 — 拦截符号链接越界与非普通文件攻击', () => {
  const env = createTestEnv();
  try {
    // 1. 在 runDir 外创建敏感文件
    const secretRunId = 'SECRET-RUN-OUTSIDE';
    const outsideFilePath = join(env.dir, `${secretRunId}.json`);
    const outsideSecretRun = {
      id: secretRunId,
      projectId: 'PROJ-SECRET',
      requirementId: 'REQ-SECRET',
      revision: 1,
      state: 'waiting_human',
      goal: '机密运行',
      activeGrant: null,
      runtimeBinding: null,
      contextSnapshot: { summary: '', decisions: [], assumptions: [], constraints: [] },
      workingCandidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: []
    };
    writeFileSync(outsideFilePath, JSON.stringify(outsideSecretRun, null, 2) + '\n', 'utf8');

    // 2. 在 runDir 内创建指向外部敏感文件的符号链接
    mkdirSync(env.runDir, { recursive: true });
    const symlinkName = 'RUN-SYMLINK.json';
    const symlinkPath = join(env.runDir, symlinkName);
    symlinkSync(outsideFilePath, symlinkPath);

    // 2.1 resolveRunLocatorPath 必须拦截符号链接
    assert.throws(
      () => resolveRunLocatorPath(env.runDir, symlinkName),
      (err: any) => err.code === 'UNSAFE_RUN_FILE' && err.message.includes('禁止使用符号链接')
    );

    // 2.2 readSafeRunFile 必须拦截符号链接
    assert.throws(
      () => readSafeRunFile(env.runDir, symlinkName),
      (err: any) => err.code === 'UNSAFE_RUN_FILE' && err.message.includes('禁止使用符号链接')
    );

    // 2.3 CLI 验证遇到符号链接时以非零退出码失败拦截
    const fakePacket: any = {
      projectId: 'PROJ-TEST',
      projectName: '测试项目',
      projectRevision: 1,
      generatedAt: '2026-10-29T00:00:00Z',
      standards: { schemaVersion: '1.0.0', rules: [], updateProtocolEndpoints: [] },
      goal: {
        intent: {
          id: 'INTENT-1',
          title: '意图',
          state: 'human_confirmed',
          problem: '',
          expectedOutcome: '',
          sourceRefs: []
        },
        activeRequirement: null
      },
      progress: {
        intentState: 'human_confirmed',
        requirementsCount: { total: 0, draft: 0, review: 0, done: 0 },
        pendingCandidateCount: 0,
        keptCandidateCount: 0
      },
      authorizations: {
        projectRevision: 1,
        authorizationState: 'valid',
        targetRunId: secretRunId,
        retrievalLocator: symlinkName,
        retrievalEndpoint: null,
        activeGrant: null,
        runtimeBinding: null,
        notes: []
      },
      nextSafeAction: {
        actionCode: 'EXECUTE_RUN_WITH_VALID_AUTHORIZATION',
        actor: 'model',
        description: '执行运行',
        why: '测试',
        executableNow: true,
        waitingFor: 'none',
        prerequisitesMet: [],
        blockingIssues: []
      },
      evidence: { sources: [], verifications: [], evidence: [] },
      unknowns: { openQuestions: [], assumptions: [], unverifiedCriteria: [], invalidatedVerifications: [], pendingHumanGates: [] },
      gapReport: { hasGap: false, missingFacts: [], contradictoryFacts: [] },
      contextItems: []
    };
    const packetPath = join(env.dir, 'symlink-attack-packet.json');
    writeFileSync(packetPath, JSON.stringify(fakePacket, null, 2) + '\n', 'utf8');

    const cliSymlinkRes = spawnSync(
      'node',
      [
        '--import',
        'tsx',
        resolve('src/presentation/recovery-cli-consumer.ts'),
        '--verifyRecovery',
        packetPath,
        '--projectDir',
        env.projectDir,
        '--runDir',
        env.runDir
      ],
      { encoding: 'utf8' }
    );
    assert.strictEqual(cliSymlinkRes.status, 1, '遇到符号链接账本时 CLI 必须以非零退出码失败退出');
    assert.ok(
      cliSymlinkRes.stderr.includes('UNSAFE_RUN_FILE'),
      `stderr 必须包含 UNSAFE_RUN_FILE 错误代码: ${cliSymlinkRes.stderr}`
    );

    // 3. 非普通文件（目录）拦截
    const subDirName = 'sub-dir.json';
    mkdirSync(join(env.runDir, subDirName));
    assert.throws(
      () => resolveRunLocatorPath(env.runDir, subDirName),
      (err: any) => err.code === 'UNSAFE_RUN_FILE' && err.message.includes('普通文件')
    );
    assert.throws(
      () => readSafeRunFile(env.runDir, subDirName),
      (err: any) => err.code === 'UNSAFE_RUN_FILE' && err.message.includes('普通文件')
    );

    // 4. 合法普通账本文件读取正常
    const validRunId = 'RUN-LEGITIMATE';
    const legitimateRun: any = {
      id: validRunId,
      projectId: 'PROJ-TEST',
      requirementId: 'REQ-1',
      revision: 1,
      state: 'waiting_human',
      activeGrant: null,
      runtimeBinding: null,
      contextSnapshot: { summary: '', decisions: [], assumptions: [], constraints: [] },
      workingCandidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: []
    };
    writeFileSync(
      join(env.runDir, `${validRunId}.json`),
      JSON.stringify(legitimateRun, null, 2) + '\n',
      'utf8'
    );

    const safePath = resolveRunLocatorPath(env.runDir, `${validRunId}.json`);
    assert.strictEqual(safePath, join(env.runDir, `${validRunId}.json`));
    const safeRead = readSafeRunFile(env.runDir, `${validRunId}.json`);
    assert.strictEqual((safeRead.data as any).id, validRunId);
  } finally {
    env.cleanup();
  }
});
