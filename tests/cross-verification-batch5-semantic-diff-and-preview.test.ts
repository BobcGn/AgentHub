import assert from 'node:assert/strict';
import test from 'node:test';
import { HubError } from '../src/domain/board.js';
import type { Principal } from '../src/domain/board.js';
import type { ContextCandidate, ModelPort } from '../src/domain/harness.js';
import { harnessFixture } from './harness-fixtures.js';

const human: Principal = { kind: 'human' };

function setupAcceptedGraph(model?: ModelPort) {
  const f = harnessFixture(model);
  const src0 = f.project.records.sources[0]!.id;

  // 1. 创建 Unit、Story、BoltPlan（初始 draft）
  let p = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.project.revision,
    collection: 'units',
    id: null,
    reason: '新增 Unit',
    confirmed: true,
    record: {
      kind: 'unit',
      id: 'unit-1',
      requirementId: 'REQ-HARNESS-1',
      title: '核心单元',
      problem: '单元问题',
      expectedOutcome: '单元预期',
      scope: { includes: ['模块A', '模块B'], excludes: ['外部依赖'] },
      rationale: '职责内聚',
      expectedImpact: '清晰边界',
      acceptanceCriteria: [
        { id: 'uc-1', description: '单元条件1', verification: '单测1' },
        { id: 'uc-2', description: '单元条件2', verification: '单测2' }
      ],
      responsibilities: ['职责1', '职责2'],
      inputs: ['输入A'],
      outputs: ['输出B'],
      dependsOn: [],
      sourceRefs: [src0],
      status: 'draft',
      result: null
    }
  }, 'req-b5-unit-01');

  p = f.records.saveRecord(human, p.id, {
    baseRevision: p.revision,
    collection: 'stories',
    id: null,
    reason: '新增 Story',
    confirmed: true,
    record: {
      kind: 'story',
      id: 'story-1',
      requirementId: 'REQ-HARNESS-1',
      unitId: 'unit-1',
      title: '核心故事',
      problem: '故事问题',
      expectedOutcome: '故事预期',
      scope: { includes: ['交互A', '交互B'], excludes: ['管理后台'] },
      rationale: '用户可感知',
      expectedImpact: '闭环体验',
      acceptanceCriteria: [
        { id: 'sc-1', description: '故事条件1', verification: '验证1' },
        { id: 'sc-2', description: '故事条件2', verification: '验证2' }
      ],
      userValue: '明确价值',
      dependsOn: [{ kind: 'unit', id: 'unit-1' }],
      sourceRefs: [src0],
      status: 'draft',
      result: null
    }
  }, 'req-b5-story-01');

  p = f.records.saveRecord(human, p.id, {
    baseRevision: p.revision,
    collection: 'boltPlans',
    id: null,
    reason: '新增 BoltPlan',
    confirmed: true,
    record: {
      kind: 'bolt_plan',
      id: 'bolt-1',
      requirementId: 'REQ-HARNESS-1',
      title: '首轮构建批次',
      problem: '分阶段实施',
      expectedOutcome: '可验证构建',
      scope: { includes: ['阶段一', '阶段二'], excludes: [] },
      rationale: '控制风险',
      expectedImpact: '稳步推进',
      acceptanceCriteria: [{ id: 'bc-1', description: '构建条件1', verification: '构建验证' }],
      storyIds: ['story-1'],
      constructionType: 'simple',
      stages: ['stage-compile', 'stage-verify'],
      exitConditions: ['退出A', '退出B'],
      dependsOn: [{ kind: 'story', id: 'story-1' }],
      sourceRefs: [src0],
      status: 'draft',
      result: null
    }
  }, 'req-b5-bolt-01');

  // 2. 添加观察证据
  p = f.records.saveRecord(human, p.id, {
    baseRevision: p.revision,
    collection: 'evidence',
    id: null,
    reason: '录入测试证据',
    confirmed: true,
    record: {
      id: 'ev-all',
      requirementId: 'REQ-HARNESS-1',
      targets: [
        { kind: 'requirement', id: 'REQ-HARNESS-1' },
        { kind: 'unit', id: 'unit-1' },
        { kind: 'story', id: 'story-1' },
        { kind: 'bolt_plan', id: 'bolt-1' }
      ],
      description: '集成验证证据',
      subject: 'tests/all.test.ts',
      environment: 'node',
      observedResult: 'ALL PASS',
      limitations: [],
      sourceRefs: [src0]
    }
  }, 'req-b5-ev-01');

  // 3. 更新 Requirement 验收条件与结果/PR
  p = f.records.saveRecord(human, p.id, {
    baseRevision: p.revision,
    collection: 'requirements',
    id: 'REQ-HARNESS-1',
    reason: '完善需求条件与结果',
    confirmed: true,
    record: {
      ...p.records.requirements[0]!,
      scope: { includes: ['范围1', '范围2'], excludes: ['自动接受'] },
      constraints: ['约束A', '约束B'],
      acceptanceCriteria: [
        { id: 'rc-1', description: '需求条件1', verification: '集成测试1' },
        { id: 'rc-2', description: '需求条件2', verification: '集成测试2' }
      ],
      result: { what: '完成需求', why: '对齐意图', actualImpact: '可核验', evidenceRefs: ['ev-all'] },
      pullRequest: {
        url: 'https://github.com/BobcGn/AgentHub/pull/10',
        what: 'PR内容',
        why: 'PR原因',
        verification: 'PR核验',
        result: 'PR通过'
      }
    }
  }, 'b5-req-setup');

  // 4. 录入全部 passed 核查
  const verifs = [
    { id: 'v-rc-1', target: { kind: 'requirement' as const, id: 'REQ-HARNESS-1' }, criterionId: 'rc-1' },
    { id: 'v-rc-2', target: { kind: 'requirement' as const, id: 'REQ-HARNESS-1' }, criterionId: 'rc-2' },
    { id: 'v-uc-1', target: { kind: 'unit' as const, id: 'unit-1' }, criterionId: 'uc-1' },
    { id: 'v-uc-2', target: { kind: 'unit' as const, id: 'unit-1' }, criterionId: 'uc-2' },
    { id: 'v-sc-1', target: { kind: 'story' as const, id: 'story-1' }, criterionId: 'sc-1' },
    { id: 'v-sc-2', target: { kind: 'story' as const, id: 'story-1' }, criterionId: 'sc-2' },
    { id: 'v-bc-1', target: { kind: 'bolt_plan' as const, id: 'bolt-1' }, criterionId: 'bc-1' }
  ];
  for (const v of verifs) {
    p = f.records.saveRecord(human, p.id, {
      baseRevision: p.revision,
      collection: 'verifications',
      id: null,
      reason: `核查通过 ${v.id}`,
      confirmed: true,
      record: {
        id: v.id,
        target: v.target,
        criterionId: v.criterionId,
        outcome: 'passed',
        method: 'test',
        explanation: '通过',
        evidenceRefs: ['ev-all'],
        sourceRefs: [src0]
      }
    }, `b5-verif-${v.id}`);
  }

  // 5. 将 Unit、Story、BoltPlan 标为 done，并整体接受 Requirement
  for (const [col, id] of [['units', 'unit-1'], ['stories', 'story-1'], ['boltPlans', 'bolt-1']] as const) {
    const existing = (p.records[col] as unknown as Array<Record<string, unknown>>).find(item => item['id'] === id);
    assert.ok(existing);
    p = f.records.saveRecord(human, p.id, {
      baseRevision: p.revision,
      collection: col,
      id,
      reason: `完成 ${id}`,
      confirmed: true,
      record: {
        ...existing,
        status: 'done',
        result: { what: '已完成', why: '通过核查', actualImpact: '达成预期', evidenceRefs: ['ev-all'] }
      }
    }, `b5-done-${id}`);
  }

  p = f.records.acceptRequirement(human, p.id, 'REQ-HARNESS-1', {
    baseRevision: p.revision,
    confirmed: true,
    reason: '本人整体接受'
  }, 'b5-accept-1');

  return { f, project: p, src0 };
}

test('Batch 5 反例 1：普通人端编辑纯键顺序、验收条件数组顺序或集合字段顺序变化时，不得误撤销核查或整体接受', t => {
  const { f, project } = setupAcceptedGraph();
  t.after(f.cleanup);

  const reqBefore = project.records.requirements[0]!;
  assert.equal(reqBefore.status, 'done');
  assert.ok(reqBefore.acceptance !== null);

  // 1) 对已接受的 Requirement 仅调换 acceptanceCriteria 顺序 [rc-2, rc-1]、scope.includes 顺序、constraints 顺序及对象键顺序
  const reorderedReq = {
    pullRequest: reqBefore.pullRequest,
    acceptance: reqBefore.acceptance,
    status: reqBefore.status,
    result: reqBefore.result,
    sourceRefs: reqBefore.sourceRefs,
    acceptanceCriteria: [
      JSON.parse(JSON.stringify({ verification: '集成测试2', description: '需求条件2', id: 'rc-2' })),
      JSON.parse(JSON.stringify({ verification: '集成测试1', description: '需求条件1', id: 'rc-1' }))
    ],
    constraints: ['约束B', '约束A'],
    scope: { excludes: ['自动接受'], includes: ['范围2', '范围1'] },
    expectedImpact: reqBefore.expectedImpact,
    rationale: reqBefore.rationale,
    expectedOutcome: reqBefore.expectedOutcome,
    problem: reqBefore.problem,
    title: reqBefore.title,
    intentId: reqBefore.intentId,
    identifier: reqBefore.identifier,
    id: reqBefore.id,
    kind: reqBefore.kind
  };

  const reqPreview = f.records.previewEdit(human, project.id, {
    baseRevision: project.revision,
    collection: 'requirements',
    id: 'REQ-HARNESS-1',
    record: reorderedReq,
    reason: '调整展示顺序'
  });
  assert.deepEqual(reqPreview.effects, [], '纯顺序变化预览不得产生核查失效或接受撤销副作用');
  assert.deepEqual(reqPreview.warnings, [], '纯顺序变化预览不应发出失效警告');

  const afterReqReorder = f.records.saveRecord(human, project.id, {
    baseRevision: project.revision,
    collection: 'requirements',
    id: 'REQ-HARNESS-1',
    record: reorderedReq,
    reason: '调整展示顺序',
    confirmed: true
  }, 'b5-reorder-req');

  const reqAfter = afterReqReorder.records.requirements[0]!;
  assert.equal(reqAfter.status, 'done', '纯顺序变化不得把已完成需求退回 review');
  assert.ok(reqAfter.acceptance !== null, '纯顺序变化不得误撤销整体接受');
  assert.ok(afterReqReorder.records.verifications.every(v => v.outcome === 'passed'), '纯顺序变化不得使任何已通过核查变 unknown');

  // 2) 对已完成的 Story 仅调换 acceptanceCriteria [sc-2, sc-1] 与 scope 嵌套键顺序
  const storyBefore = afterReqReorder.records.stories[0]!;
  const reorderedStory = {
    ...storyBefore,
    scope: { excludes: ['管理后台'], includes: ['交互B', '交互A'] },
    acceptanceCriteria: [
      { verification: '验证2', id: 'sc-2', description: '故事条件2' },
      { verification: '验证1', id: 'sc-1', description: '故事条件1' }
    ]
  };
  const afterStoryReorder = f.records.saveRecord(human, afterReqReorder.id, {
    baseRevision: afterReqReorder.revision,
    collection: 'stories',
    id: 'story-1',
    record: reorderedStory,
    reason: '调整故事条件展示顺序',
    confirmed: true
  }, 'b5-reorder-story');

  assert.equal(afterStoryReorder.records.stories[0]!.status, 'done', '纯顺序变化不得把已完成 Story 退回 review');
  assert.equal(afterStoryReorder.records.requirements[0]!.status, 'done', '子对象纯顺序变化不得撤销父需求完成状态');
  assert.ok(afterStoryReorder.records.requirements[0]!.acceptance !== null, '子对象纯顺序变化不得撤销父需求整体接受');
  assert.ok(afterStoryReorder.records.verifications.every(v => v.outcome === 'passed'), '子对象纯顺序变化不得使核查失效');
});

test('Batch 5 反例 2：普通人端编辑单个验收条件或有序构建阶段时精确触发失效、保留未改条件核查与历史证据，且不合并人端/模型权限', t => {
  const { f, project } = setupAcceptedGraph();
  t.after(f.cleanup);

  // 1) 人端仅修改 Requirement 的 rc-2 描述（rc-1 与核心字段保持不变）
  const req0 = project.records.requirements[0]!;
  const afterSingleCritEdit = f.records.saveRecord(human, project.id, {
    baseRevision: project.revision,
    collection: 'requirements',
    id: 'REQ-HARNESS-1',
    reason: '收紧 rc-2 验收标准',
    confirmed: true,
    record: {
      ...req0,
      acceptanceCriteria: [
        { id: 'rc-1', description: '需求条件1', verification: '集成测试1' },
        { id: 'rc-2', description: '需求条件2（新增超时边界要求）', verification: '集成测试2' }
      ]
    }
  }, 'b5-edit-rc2');

  const updatedReq = afterSingleCritEdit.records.requirements[0]!;
  assert.equal(updatedReq.status, 'review', '修改验收条件后已完成需求必须退回 review');
  assert.equal(updatedReq.acceptance, null, '修改验收条件后整体接受必须撤销');
  const vRc1 = afterSingleCritEdit.records.verifications.find(v => v.id === 'v-rc-1')!;
  const vRc2 = afterSingleCritEdit.records.verifications.find(v => v.id === 'v-rc-2')!;
  assert.equal(vRc1.outcome, 'passed', '未修改的 rc-1 对应核查应保持 passed（与候选应用细粒度规则一致）');
  assert.equal(vRc2.outcome, 'unknown', '已修改的 rc-2 对应核查必须变为 unknown');
  assert.ok(afterSingleCritEdit.records.evidence.some(e => e.id === 'ev-all'), '历史观察证据必须保留');

  // 重新通过 v-rc-2 并重新整体接受，再验证 BoltPlan.stages 执行阶段顺序变化属于真实语义变化
  let reAccepted = f.records.saveRecord(human, afterSingleCritEdit.id, {
    baseRevision: afterSingleCritEdit.revision,
    collection: 'verifications',
    id: 'v-rc-2',
    reason: '补充新条件测试后重新核查通过',
    confirmed: true,
    record: { ...vRc2, outcome: 'passed', explanation: '重新验证通过' }
  }, 'b5-repass-rc2');
  reAccepted = f.records.acceptRequirement(human, reAccepted.id, 'REQ-HARNESS-1', {
    baseRevision: reAccepted.revision,
    confirmed: true,
    reason: '重新整体接受'
  }, 'b5-reaccept');
  assert.equal(reAccepted.records.requirements[0]!.status, 'done');

  // 2) 调换 BoltPlan.stages 顺序 ['stage-compile', 'stage-verify'] -> ['stage-verify', 'stage-compile'] 属于有序阶段变化，必须失效！
  const bolt0 = reAccepted.records.boltPlans[0]!;
  const afterStageSwap = f.records.saveRecord(human, reAccepted.id, {
    baseRevision: reAccepted.revision,
    collection: 'boltPlans',
    id: 'bolt-1',
    reason: '调整构建阶段执行先后次序',
    confirmed: true,
    record: {
      ...bolt0,
      stages: ['stage-verify', 'stage-compile']
    }
  }, 'b5-bolt-stage-swap');

  assert.equal(afterStageSwap.records.boltPlans[0]!.status, 'review', 'BoltPlan 有序执行阶段改变必须使完成态退回 review');
  assert.equal(afterStageSwap.records.verifications.find(v => v.id === 'v-bc-1')!.outcome, 'unknown', 'BoltPlan 阶段改变必须使核查变 unknown');
  assert.equal(afterStageSwap.records.requirements[0]!.acceptance, null, '关联父需求接受必须一并撤销');
  assert.equal(afterStageSwap.records.requirements[0]!.status, 'review');

  // 3) 权限通路保持隔离：人端普通编辑仍不可绕过独立验收入口直接标 Requirement done，模型候选仍不可覆盖已完成子对象
  assert.throws(
    () => f.records.saveRecord(human, afterStageSwap.id, {
      baseRevision: afterStageSwap.revision,
      collection: 'requirements',
      id: 'REQ-HARNESS-1',
      reason: '试图绕过独立验收入口',
      confirmed: true,
      record: { ...afterStageSwap.records.requirements[0]!, status: 'done' }
    }, 'b5-bypass-gate'),
    (err: unknown) => err instanceof HubError && err.status === 403 && err.code === 'USE_ACCEPTANCE_GATE'
  );
  assert.throws(
    () => f.records.applyRunCandidate(human, afterStageSwap.id, {
      baseRevision: afterStageSwap.revision,
      runId: 'b5-model-overwrite-done-unit',
      candidate: {
        type: 'propose_decomposition',
        requirementId: 'REQ-HARNESS-1',
        units: [{ ...afterStageSwap.records.units[0]!, status: 'draft', result: null, title: '模型试图覆盖已完成 Unit' }],
        stories: [],
        sourceRefs: []
      },
      sources: []
    }),
    (err: unknown) => err instanceof HubError && err.status === 403 && err.code === 'CANNOT_OVERWRITE_DONE'
  );
});

test('Batch 5 反例 3：HarnessService.preview 必须返回真实 effects 与 warnings，且候选覆盖仅改单个条件时精确失效并保留原 sourceRefs', async t => {
  let candidatePayload: ContextCandidate | null = null;
  const model: ModelPort = {
    name: 'b5-candidate-model',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() {
      return candidatePayload!;
    }
  };
  const { f, project, src0 } = setupAcceptedGraph(model);
  t.after(f.cleanup);

  // 将 story-1 从 done 退回 review（使模型候选允许覆盖未完成的 story-1），此时 Requirement 自动撤销 acceptance 回 review，但 v-sc-1 / v-sc-2 仍为 passed
  const storyDone = project.records.stories[0]!;
  const pReview = f.records.saveRecord(human, project.id, {
    baseRevision: project.revision,
    collection: 'stories',
    id: 'story-1',
    reason: '退回 review 供候选迭代',
    confirmed: true,
    record: { ...storyDone, status: 'review' }
  }, 'b5-story-back-to-review');
  const storyInReview = pReview.records.stories[0]!;
  const originalStorySources = [...storyInReview.sourceRefs];
  assert.equal(pReview.records.verifications.find(v => v.id === 'v-sc-1')!.outcome, 'passed');
  assert.equal(pReview.records.verifications.find(v => v.id === 'v-sc-2')!.outcome, 'passed');

  // 子场景 A：模型提交纯顺序变化的 story-1（调换 sc-2/sc-1 与 scope 键顺序）+ 新增 story-2
  candidatePayload = {
    type: 'propose_decomposition',
    requirementId: 'REQ-HARNESS-1',
    units: [],
    stories: [
      {
        kind: 'story',
        id: 'story-1',
        requirementId: 'REQ-HARNESS-1',
        unitId: 'unit-1',
        title: '核心故事',
        problem: '故事问题',
        expectedOutcome: '故事预期',
        scope: { excludes: ['管理后台'], includes: ['交互B', '交互A'] },
        rationale: '用户可感知',
        expectedImpact: '闭环体验',
        acceptanceCriteria: [
          { id: 'sc-2', description: '故事条件2', verification: '验证2' },
          { id: 'sc-1', description: '故事条件1', verification: '验证1' }
        ],
        userValue: '明确价值',
        dependsOn: [{ kind: 'unit', id: 'unit-1' }],
        sourceRefs: [src0],
        status: 'draft',
        result: null
      },
      {
        kind: 'story',
        id: 'story-2',
        requirementId: 'REQ-HARNESS-1',
        unitId: 'unit-1',
        title: '新增故事二',
        problem: '补充分支',
        expectedOutcome: '补充结果',
        scope: { includes: ['交互C'], excludes: [] },
        rationale: '扩展覆盖',
        expectedImpact: '完善拆解',
        acceptanceCriteria: [{ id: 'sc-2-1', description: '新故事条件', verification: '测试' }],
        userValue: '补充价值',
        dependsOn: [],
        sourceRefs: [src0],
        status: 'draft',
        result: null
      }
    ],
    sourceRefs: [src0]
  };

  const runA = f.harness.start(human, pReview.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: pReview.revision,
    instruction: '拆解补充新故事并保持已有故事不变',
    confirmed: true
  }, 'b5-cand-pure-order');
  await f.harness.settled(runA.id);
  const previewA = f.harness.preview(human, runA.id) as {
    effects?: Array<{ target: string }>;
    warnings?: string[];
  };
  assert.ok(Array.isArray(previewA.effects), 'preview 必须返回 effects 数组');
  assert.ok(Array.isArray(previewA.warnings), 'preview 必须返回 warnings 数组');
  assert.equal(previewA.effects.length, 0, 'story-1 无实质内容变化时不得误将 v-sc-1/v-sc-2 失效');
  f.harness.apply(human, runA.id, { revision: f.harness.get(human, runA.id).revision, confirmed: true });

  const afterA = f.records.get(human, pReview.id);
  assert.equal(afterA.records.verifications.find(v => v.id === 'v-sc-1')!.outcome, 'passed');
  assert.equal(afterA.records.verifications.find(v => v.id === 'v-sc-2')!.outcome, 'passed');
  assert.equal(afterA.records.stories.find(s => s.id === 'story-1')!.status, 'review', '未发生语义变化的已有 Story 应保留其 review 状态与结果');
  for (const sRef of originalStorySources) {
    assert.ok(afterA.records.stories.find(s => s.id === 'story-1')!.sourceRefs.includes(sRef), `不得丢失原 Story 来源引用 ${sRef}`);
  }

  // 子场景 B：模型仅修改 story-1 的 sc-2 条件（sc-1 与核心字段不变） -> preview.effects 与 preview.warnings 必须精确展示 v-sc-2 失效，且与 apply 审计一致
  candidatePayload = {
    type: 'propose_decomposition',
    requirementId: 'REQ-HARNESS-1',
    units: [],
    stories: [
      {
        kind: 'story',
        id: 'story-1',
        requirementId: 'REQ-HARNESS-1',
        unitId: 'unit-1',
        title: '核心故事',
        problem: '故事问题',
        expectedOutcome: '故事预期',
        scope: { includes: ['交互A', '交互B'], excludes: ['管理后台'] },
        rationale: '用户可感知',
        expectedImpact: '闭环体验',
        acceptanceCriteria: [
          { id: 'sc-1', description: '故事条件1', verification: '验证1' },
          { id: 'sc-2', description: '故事条件2（实质修改验收要求）', verification: '验证2' }
        ],
        userValue: '明确价值',
        dependsOn: [{ kind: 'unit', id: 'unit-1' }],
        sourceRefs: [src0],
        status: 'draft',
        result: null
      }
    ],
    sourceRefs: [src0]
  };

  const runB = f.harness.start(human, afterA.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: afterA.revision,
    instruction: '修改 story-1 的 sc-2 条件',
    confirmed: true
  }, 'b5-cand-mod-sc2');
  await f.harness.settled(runB.id);
  const previewB = f.harness.preview(human, runB.id) as {
    effects?: Array<{ target: string; before: unknown; after: unknown }>;
    warnings?: string[];
  };
  assert.ok(Array.isArray(previewB.effects) && previewB.effects.some(e => e.target === 'verifications/v-sc-2'), 'preview.effects 必须展示 v-sc-2 失效');
  assert.ok(!previewB.effects!.some(e => e.target === 'verifications/v-sc-1'), '未修改的 sc-1 不应出现在失效 effects 中');
  assert.ok(Array.isArray(previewB.warnings) && previewB.warnings.length > 0, 'preview.warnings 必须返回具体失效提示');

  f.harness.apply(human, runB.id, { revision: f.harness.get(human, runB.id).revision, confirmed: true });
  const afterB = f.records.get(human, afterA.id);
  assert.equal(afterB.records.verifications.find(v => v.id === 'v-sc-1')!.outcome, 'passed');
  assert.equal(afterB.records.verifications.find(v => v.id === 'v-sc-2')!.outcome, 'unknown');
  const auditB = afterB.audit.at(-1)!;
  assert.deepEqual(auditB.effects.map(e => e.target), previewB.effects!.map(e => e.target), '预览 effects 必须与实际保存审计 effects 一致');
  for (const sRef of originalStorySources) {
    assert.ok(afterB.records.stories.find(s => s.id === 'story-1')!.sourceRefs.includes(sRef), '覆盖修改后仍须保留原 Story 来源引用');
  }
});
