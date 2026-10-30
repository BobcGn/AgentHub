import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessFixture } from './harness-fixtures.js';
import type { ModelPort } from '../src/domain/harness.js';
import type { Principal } from '../src/domain/board.js';
import type { ContextCandidate } from '../src/domain/harness.js';
import { HubError } from '../src/domain/board.js';

const human: Principal = { kind: 'human' };

test('Issue 1: 验收条件修改后使旧核查失效、整体接受撤销，并退回 review；未变更则不失效', async t => {
  let sourceRef = '';
  let modelCandidate: ContextCandidate | null = null;
  const model: ModelPort = {
    name: 'test-criteria-updater',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => modelCandidate!
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  // 1. 先追加证据 ev-1
  const pEvidence = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.records.get(human, f.project.id).revision,
    collection: 'evidence',
    id: null,
    record: {
      id: 'ev-1',
      requirementId: 'REQ-HARNESS-1',
      targets: [{ kind: 'requirement', id: 'REQ-HARNESS-1' }],
      description: '自动化测试通过日志',
      subject: 'tests/crit-1.test.ts',
      environment: 'node-test',
      observedResult: 'PASS',
      limitations: [],
      sourceRefs: [sourceRef]
    },
    reason: '记录观察证据',
    confirmed: true
  }, 'req-setup-ev-01');

  // 2. 更新需求：设置初始验收条件 crit-1，并设置就绪的 result 与 pullRequest
  const pReq = f.records.saveRecord(human, pEvidence.id, {
    baseRevision: pEvidence.revision,
    collection: 'requirements',
    id: 'REQ-HARNESS-1',
    record: {
      ...pEvidence.records.requirements[0]!,
      acceptanceCriteria: [
        { id: 'crit-1', description: '初始验收条件描述', verification: '单元测试' }
      ],
      result: {
        what: '实现完成',
        why: '满足需求',
        actualImpact: '功能就绪',
        evidenceRefs: ['ev-1']
      },
      pullRequest: {
        url: 'https://github.com/BobcGn/AgentHub/pull/1',
        what: 'PR总结',
        why: 'PR理由',
        verification: 'PR验证',
        result: 'PR结果'
      }
    },
    reason: '设置初始验收标准与PR',
    confirmed: true
  }, 'req-setup-crit-01');

  // 3. 追加核查：crit-1 passed
  const pVerif = f.records.saveRecord(human, pReq.id, {
    baseRevision: pReq.revision,
    collection: 'verifications',
    id: null,
    record: {
      id: 'verif-1',
      target: { kind: 'requirement', id: 'REQ-HARNESS-1' },
      criterionId: 'crit-1',
      outcome: 'passed',
      method: 'test',
      explanation: '测试套件全部执行成功',
      evidenceRefs: ['ev-1'],
      sourceRefs: [sourceRef]
    },
    reason: '记录核查通过',
    confirmed: true
  }, 'req-setup-verif-01');

  // 4. 整体接受（通过独立入口 acceptRequirement）
  const pAccepted = f.records.acceptRequirement(human, pVerif.id, 'REQ-HARNESS-1', {
    baseRevision: pVerif.revision,
    confirmed: true,
    reason: '人端确认整体接受'
  }, 'req-setup-accept-01');

  assert.equal(pAccepted.records.requirements[0]!.status, 'done');
  assert.ok(pAccepted.records.requirements[0]!.acceptance);

  // 5. 模型提议修改已有的 crit-1 描述内容
  modelCandidate = {
    type: 'propose_criteria',
    requirementId: 'REQ-HARNESS-1',
    acceptanceCriteria: [
      { id: 'crit-1', description: '修改后的全新验收条件描述（更严格）', verification: '单元测试' }
    ],
    sourceRefs: [sourceRef]
  };

  const started = f.start('更新验收条件', 'harness-start-crit-01');
  await f.harness.settled(started.id);
  const run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');

  // 预览必须提示正式验收条件修改及核查/整体接受失效影响
  const preview = f.harness.preview(human, run.id);
  assert.match(preview.warning, /失效|待核对|review/);

  // 人端应用候选
  f.harness.apply(human, run.id, { revision: run.revision, confirmed: true });

  // 验证正式项目记录：
  // a) acceptance 必须被清空 (null)
  // b) status 必须退回 review
  // c) crit-1 对应的 verification outcome 必须变为 unknown，并有说明
  // d) 原 evidence 和 verification 历史记录保留（没有被删除）
  const updatedProject = f.records.get(human, f.project.id);
  const updatedReq = updatedProject.records.requirements.find(r => r.id === 'REQ-HARNESS-1')!;
  assert.equal(updatedReq.acceptanceCriteria[0]!.description, '修改后的全新验收条件描述（更严格）');
  assert.equal(updatedReq.acceptance, null, '整体接受必须因验收条件修改而失效');
  assert.equal(updatedReq.status, 'review', '需求状态必须从 done 退回到 review');

  const v1 = updatedProject.records.verifications.find(v => v.id === 'verif-1')!;
  assert.ok(v1, '旧核查记录不能被物理删除');
  assert.equal(v1.outcome, 'unknown', '同 ID 条件内容修改后，原核查必须标为 unknown');
  assert.match(v1.explanation, /修改/);

  const ev1 = updatedProject.records.evidence.find(e => e.id === 'ev-1');
  assert.ok(ev1, '旧证据记录不能被物理删除');

  // 6. 版本冲突与过期修订测试：使用过期 baseRevision 应用候选必须失败，不改动正式记录
  assert.throws(() => {
    f.records.applyRunCandidate(human, f.project.id, {
      baseRevision: 1, // 过期版本
      runId: 'fake-run-stale-01',
      candidate: modelCandidate!,
      sources: []
    });
  }, (err: unknown) => {
    assert.ok(err instanceof HubError);
    assert.equal(err.code, 'STALE_RECORD_PROJECT');
    return true;
  });

  // 7. 内容未变重复应用：再次应用相同内容，不应产生新的失效或异常
  const revBefore = updatedProject.revision;
  const sameReceipt = f.records.applyRunCandidate(human, f.project.id, {
    baseRevision: revBefore,
    runId: 'fake-run-same-01',
    candidate: modelCandidate!,
    sources: []
  });
  assert.equal(sameReceipt.projectRevision, revBefore + 1);
  const projectAfterSame = f.records.get(human, f.project.id);
  assert.equal(projectAfterSame.records.requirements.find(r => r.id === 'REQ-HARNESS-1')!.status, 'review');
});

test('Issue 2: Bolt Plan 跨 Requirement 接管或覆盖被拒绝；覆盖 done 状态 Bolt Plan 被拒绝；同需求正常修改', async t => {
  let sourceRef = '';
  const f = harnessFixture();
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  // 创建第二个需求 REQ-HARNESS-2
  const p1 = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.records.get(human, f.project.id).revision,
    collection: 'requirements',
    id: null,
    record: {
      id: 'REQ-HARNESS-2',
      kind: 'requirement',
      intentId: f.project.records.intent.id,
      title: '第二个需求',
      problem: 'P2',
      expectedOutcome: 'O2',
      scope: { includes: ['范围2'], excludes: [] },
      rationale: 'R2',
      expectedImpact: 'I2',
      acceptanceCriteria: [{ id: 'c-r2', description: '描述2', verification: '验证2' }],
      sourceRefs: [sourceRef],
      status: 'draft',
      result: null,
      constraints: [],
      acceptance: null,
      pullRequest: null
    },
    reason: '创建需求2',
    confirmed: true
  }, 'create-req-0002');

  // 在 REQ-HARNESS-2 下先创建一个 Story
  const p1_story = f.records.saveRecord(human, p1.id, {
    baseRevision: p1.revision,
    collection: 'stories',
    id: null,
    record: {
      kind: 'story',
      id: 'story-r2-1',
      title: '需求2的Story',
      problem: 'P',
      expectedOutcome: 'O',
      scope: { includes: ['范围'], excludes: [] },
      rationale: 'R',
      expectedImpact: 'I',
      acceptanceCriteria: [{ id: 'c-s2', description: 'desc', verification: 'verify' }],
      sourceRefs: [sourceRef],
      status: 'draft',
      result: null,
      requirementId: 'REQ-HARNESS-2',
      unitId: null,
      userValue: '价值',
      dependsOn: []
    },
    reason: '创建需求2 Story',
    confirmed: true
  }, 'create-story-r2');

  // 在 REQ-HARNESS-1 下也创建一个 Story
  const p1_story1 = f.records.saveRecord(human, p1_story.id, {
    baseRevision: p1_story.revision,
    collection: 'stories',
    id: null,
    record: {
      kind: 'story',
      id: 'story-r1-1',
      title: '需求1的Story',
      problem: 'P',
      expectedOutcome: 'O',
      scope: { includes: ['范围'], excludes: [] },
      rationale: 'R',
      expectedImpact: 'I',
      acceptanceCriteria: [{ id: 'c-s1', description: 'desc', verification: 'verify' }],
      sourceRefs: [sourceRef],
      status: 'draft',
      result: null,
      requirementId: 'REQ-HARNESS-1',
      unitId: null,
      userValue: '价值',
      dependsOn: []
    },
    reason: '创建需求1 Story',
    confirmed: true
  }, 'create-story-r1');

  // 在 REQ-HARNESS-2 下创建一个 Bolt Plan: bolt-foreign
  const p2 = f.records.saveRecord(human, p1_story1.id, {
    baseRevision: p1_story1.revision,
    collection: 'boltPlans',
    id: null,
    record: {
      kind: 'bolt_plan',
      id: 'bolt-foreign',
      requirementId: 'REQ-HARNESS-2',
      title: '需求2的构建计划',
      problem: 'P',
      expectedOutcome: 'O',
      scope: { includes: ['范围'], excludes: [] },
      rationale: 'R',
      expectedImpact: 'I',
      acceptanceCriteria: [{ id: 'c-b2', description: 'desc', verification: 'verify' }],
      stages: ['stage-1'],
      dependsOn: [],
      storyIds: ['story-r2-1'],
      constructionType: 'simple',
      exitConditions: ['退出条件1'],
      status: 'draft',
      result: null,
      sourceRefs: [sourceRef]
    },
    reason: '创建需求2构建计划',
    confirmed: true
  }, 'create-bolt-foreign');

  // 在 REQ-HARNESS-1 下创建一个已完成的 Bolt Plan: bolt-done
  const p3_draft = f.records.saveRecord(human, p2.id, {
    baseRevision: p2.revision,
    collection: 'boltPlans',
    id: null,
    record: {
      kind: 'bolt_plan',
      id: 'bolt-done',
      requirementId: 'REQ-HARNESS-1',
      title: '需求1已完成的计划',
      problem: 'P',
      expectedOutcome: 'O',
      scope: { includes: ['范围'], excludes: [] },
      rationale: 'R',
      expectedImpact: 'I',
      acceptanceCriteria: [{ id: 'c-bdone', description: 'desc', verification: 'verify' }],
      stages: ['stage-1'],
      dependsOn: [],
      storyIds: ['story-r1-1'],
      constructionType: 'simple',
      exitConditions: ['退出条件1'],
      status: 'draft',
      result: null,
      sourceRefs: [sourceRef]
    },
    reason: '创建计划草案',
    confirmed: true
  }, 'create-bolt-draft');

  // 追加针对 bolt-done 的证据
  const p3_ev = f.records.saveRecord(human, p3_draft.id, {
    baseRevision: p3_draft.revision,
    collection: 'evidence',
    id: null,
    record: {
      id: 'ev-bolt-done',
      requirementId: 'REQ-HARNESS-1',
      targets: [{ kind: 'bolt_plan', id: 'bolt-done' }],
      description: '构建计划通过证据',
      subject: 'tests/bolt.test.ts',
      environment: 'node',
      observedResult: 'PASS',
      limitations: [],
      sourceRefs: [sourceRef]
    },
    reason: '记录构建证据',
    confirmed: true
  }, 'ev-bolt-done-01');

  // 核查通过 bolt-done
  const p3_verif = f.records.saveRecord(human, p3_ev.id, {
    baseRevision: p3_ev.revision,
    collection: 'verifications',
    id: null,
    record: {
      id: 'verif-bolt-done',
      target: { kind: 'bolt_plan', id: 'bolt-done' },
      criterionId: 'c-bdone',
      outcome: 'passed',
      method: 'test',
      explanation: '构建计划执行完成且全部通过',
      evidenceRefs: ['ev-bolt-done'],
      sourceRefs: [sourceRef]
    },
    reason: '记录构建计划通过',
    confirmed: true
  }, 'verif-bolt-done-01');

  // 将 bolt-done 标为 done
  const p3 = f.records.saveRecord(human, p3_verif.id, {
    baseRevision: p3_verif.revision,
    collection: 'boltPlans',
    id: 'bolt-done',
    record: {
      ...p3_draft.records.boltPlans.find(b => b.id === 'bolt-done')!,
      status: 'done',
      result: {
        what: '构建完成',
        why: '满足批次',
        actualImpact: '已就绪',
        evidenceRefs: ['ev-bolt-done']
      }
    },
    reason: '标记构建计划完成',
    confirmed: true
  }, 'done-bolt-0001');

  // 1. 尝试跨需求接管/覆盖 bolt-foreign
  assert.throws(() => {
    f.records.applyRunCandidate(human, p3.id, {
      baseRevision: p3.revision,
      runId: 'fake-run-0001',
      candidate: {
        type: 'propose_bolt_plan',
        requirementId: 'REQ-HARNESS-1',
        boltPlan: {
          kind: 'bolt_plan',
          id: 'bolt-foreign',
          requirementId: 'REQ-HARNESS-1',
          title: '偷取需求2的计划',
          problem: 'P',
          expectedOutcome: 'O',
          scope: { includes: ['范围'], excludes: [] },
          rationale: 'R',
          expectedImpact: 'I',
          acceptanceCriteria: [{ id: 'c-b2', description: 'desc', verification: 'verify' }],
          stages: ['stage-steal'],
          dependsOn: [],
          storyIds: ['story-r1-1'],
          constructionType: 'simple',
          exitConditions: ['退出条件1'],
          status: 'draft',
          result: null,
          sourceRefs: [sourceRef]
        },
        sourceRefs: [sourceRef]
      },
      sources: p3.records.sources
    });
  }, (err: unknown) => {
    assert.ok(err instanceof HubError);
    assert.equal(err.code, 'BOLT_ID_CONFLICT');
    return true;
  });

  // 验证 bolt-foreign 依然归属 REQ-HARNESS-2
  const checkP = f.records.get(human, p3.id);
  const foreign = checkP.records.boltPlans.find(b => b.id === 'bolt-foreign')!;
  assert.equal(foreign.requirementId, 'REQ-HARNESS-2');
  assert.equal(foreign.title, '需求2的构建计划');

  // 2. 尝试覆盖已完成的 bolt-done
  assert.throws(() => {
    f.records.applyRunCandidate(human, p3.id, {
      baseRevision: p3.revision,
      runId: 'fake-run-0002',
      candidate: {
        type: 'propose_bolt_plan',
        requirementId: 'REQ-HARNESS-1',
        boltPlan: {
          kind: 'bolt_plan',
          id: 'bolt-done',
          requirementId: 'REQ-HARNESS-1',
          title: '试图将已完成计划退回 draft',
          problem: 'P',
          expectedOutcome: 'O',
          scope: { includes: ['范围'], excludes: [] },
          rationale: 'R',
          expectedImpact: 'I',
          acceptanceCriteria: [{ id: 'c-bdone', description: 'desc', verification: 'verify' }],
          stages: ['stage-1'],
          dependsOn: [],
          storyIds: ['story-r1-1'],
          constructionType: 'simple',
          exitConditions: ['退出条件1'],
          status: 'draft',
          result: null,
          sourceRefs: [sourceRef]
        },
        sourceRefs: [sourceRef]
      },
      sources: p3.records.sources
    });
  }, (err: unknown) => {
    assert.ok(err instanceof HubError);
    assert.equal(err.code, 'CANNOT_OVERWRITE_DONE');
    return true;
  });

  const doneBolt = checkP.records.boltPlans.find(b => b.id === 'bolt-done')!;
  assert.equal(doneBolt.status, 'done');

  // 3. 在 REQ-HARNESS-1 下正常修改一个处于 draft 状态的计划
  const pDraftPlan = f.records.saveRecord(human, p3.id, {
    baseRevision: p3.revision,
    collection: 'boltPlans',
    id: null,
    record: {
      kind: 'bolt_plan',
      id: 'bolt-editable',
      requirementId: 'REQ-HARNESS-1',
      title: '可编辑的计划',
      problem: 'P',
      expectedOutcome: 'O',
      scope: { includes: ['范围'], excludes: [] },
      rationale: 'R',
      expectedImpact: 'I',
      acceptanceCriteria: [{ id: 'c-edit', description: 'desc', verification: 'verify' }],
      stages: ['stage-1'],
      dependsOn: [],
      storyIds: ['story-r1-1'],
      constructionType: 'simple',
      exitConditions: ['退出条件1'],
      status: 'draft',
      result: null,
      sourceRefs: [sourceRef]
    },
    reason: '创建可编辑计划',
    confirmed: true
  }, 'create-bolt-editable-01');

  const receipt = f.records.applyRunCandidate(human, pDraftPlan.id, {
    baseRevision: pDraftPlan.revision,
    runId: 'fake-run-edit-01',
    candidate: {
      type: 'propose_bolt_plan',
      requirementId: 'REQ-HARNESS-1',
      boltPlan: {
        kind: 'bolt_plan',
        id: 'bolt-editable',
        requirementId: 'REQ-HARNESS-1',
        title: '已更新标题的可编辑计划',
        problem: 'P',
        expectedOutcome: 'O',
        scope: { includes: ['范围'], excludes: [] },
        rationale: 'R',
        expectedImpact: 'I',
        acceptanceCriteria: [{ id: 'c-edit', description: 'desc', verification: 'verify' }],
        stages: ['stage-1', 'stage-2'],
        dependsOn: [],
        storyIds: ['story-r1-1'],
        constructionType: 'simple',
        exitConditions: ['退出条件1'],
        status: 'draft',
        result: null,
        sourceRefs: [sourceRef]
      },
      sourceRefs: [sourceRef]
    },
    sources: []
  });
  assert.equal(receipt.projectRevision, pDraftPlan.revision + 1);
  const updatedBoltEditable = f.records.get(human, pDraftPlan.id).records.boltPlans.find(b => b.id === 'bolt-editable')!;
  assert.equal(updatedBoltEditable.title, '已更新标题的可编辑计划');
  assert.equal(updatedBoltEditable.stages.length, 2);
});

test('Issue 3: 嵌套产物内部 sourceRefs 绕过本次输入白名单被阻断', async t => {
  let sourceRef = '';
  let modelCandidate: ContextCandidate | null = null;
  const model: ModelPort = {
    name: 'test-nested-source-leaker',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => modelCandidate!
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  // 在项目中额外追加一个 source: source-in-project-secret，该来源存在于项目中，但不会被本次 run.snapshot 选取
  const pSecret = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.records.get(human, f.project.id).revision,
    collection: 'sources',
    id: null,
    record: {
      id: 'source-in-project-secret',
      kind: 'message',
      locator: 'human:secret-note',
      excerpt: '敏感配置说明'
    },
    reason: '记录项目内已有来源',
    confirmed: true
  }, 'add-secret-source-01');

  // 在 REQ-HARNESS-1 下创建一个合法的 Story 供 boltPlan 引用
  const pWithStory = f.records.saveRecord(human, pSecret.id, {
    baseRevision: pSecret.revision,
    collection: 'stories',
    id: null,
    record: {
      kind: 'story',
      id: 'story-existing-1',
      title: '已有 Story',
      problem: 'P',
      expectedOutcome: 'O',
      scope: { includes: ['范围'], excludes: [] },
      rationale: 'R',
      expectedImpact: 'I',
      acceptanceCriteria: [{ id: 'crit-s1', description: 'desc', verification: 'verify' }],
      sourceRefs: [sourceRef],
      status: 'draft',
      result: null,
      requirementId: 'REQ-HARNESS-1',
      unitId: null,
      userValue: '用户价值',
      dependsOn: []
    },
    reason: '前置 Story 准备',
    confirmed: true
  }, 'setup-story-bolt-01');

  // 1. propose_decomposition: top-level sourceRefs 属于本次输入，但 story 内部 sourceRefs 引用未提供给本次模型的项目内来源
  modelCandidate = {
    type: 'propose_decomposition',
    requirementId: 'REQ-HARNESS-1',
    units: [],
    stories: [
      {
        kind: 'story',
        id: 'story-leak-test',
        title: '故事标题',
        problem: 'P',
        expectedOutcome: 'O',
        scope: { includes: ['A'], excludes: [] },
        rationale: 'R',
        expectedImpact: 'I',
        acceptanceCriteria: [{ id: 'c1', description: 'desc', verification: 'test' }],
        sourceRefs: ['source-in-project-secret'], // 存在于项目但未提供给本次模型
        status: 'draft',
        result: null,
        requirementId: 'REQ-HARNESS-1',
        unitId: null,
        userValue: '价值',
        dependsOn: []
      }
    ],
    sourceRefs: [sourceRef]
  };

  const started1 = f.harness.start(human, pWithStory.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: pWithStory.revision,
    instruction: '拆解携带未发送的嵌套来源',
    confirmed: true
  }, 'harness-start-leak-01');
  await f.harness.settled(started1.id);
  const run1 = f.harness.get(human, started1.id);
  assert.equal(run1.state, 'failed');
  assert.equal(run1.stopReason, 'CANDIDATE_OUT_OF_SCOPE');

  // 2. propose_bolt_plan: boltPlan 内部 sourceRefs 引用未提供来源
  modelCandidate = {
    type: 'propose_bolt_plan',
    requirementId: 'REQ-HARNESS-1',
    boltPlan: {
      kind: 'bolt_plan',
      id: 'bolt-leak-test',
      requirementId: 'REQ-HARNESS-1',
      title: '计划标题',
      problem: 'P',
      expectedOutcome: 'O',
      scope: { includes: ['范围'], excludes: [] },
      rationale: 'R',
      expectedImpact: 'I',
      acceptanceCriteria: [{ id: 'crit-b-leak', description: 'desc', verification: 'verify' }],
      stages: ['stage-1'],
      dependsOn: [],
      storyIds: ['story-existing-1'],
      constructionType: 'simple',
      exitConditions: ['退出条件1'],
      status: 'draft',
      result: null,
      sourceRefs: ['source-in-project-secret'] // 存在于项目但未提供给本次模型
    },
    sourceRefs: [sourceRef]
  };

  const started2 = f.harness.start(human, pWithStory.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: pWithStory.revision,
    instruction: '构建计划携带非法嵌套来源',
    confirmed: true
  }, 'harness-start-leak-02');
  await f.harness.settled(started2.id);
  const run2 = f.harness.get(human, started2.id);
  assert.equal(run2.state, 'failed');
  assert.equal(run2.stopReason, 'CANDIDATE_OUT_OF_SCOPE');
});

test('Issue 1 & 2 (遗留): Story/Unit 覆盖使已有核查标为 unknown，撤销父需求接受，且 preview/audit 展示真实 before 覆盖对象与 effects', async t => {
  let sourceRef = '';
  let modelCandidate: ContextCandidate | null = null;
  const model: ModelPort = {
    name: 'test-story-overwriter',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => modelCandidate!
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  // 1. 先创建处于 draft 状态的 Story: story-1
  const pStoryDraft = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.records.get(human, f.project.id).revision,
    collection: 'stories',
    id: null,
    record: {
      kind: 'story',
      id: 'story-1',
      requirementId: 'REQ-HARNESS-1',
      title: '故事一',
      problem: '故事问题',
      expectedOutcome: '故事期望结果',
      scope: { includes: ['范围'], excludes: [] },
      rationale: '理由',
      expectedImpact: '影响',
      acceptanceCriteria: [{ id: 'sc-1', description: '故事条件一', verification: '单元测试' }],
      sourceRefs: [sourceRef],
      status: 'draft',
      result: null,
      unitId: null,
      userValue: '用户价值',
      dependsOn: []
    },
    reason: '创建 Story 草案',
    confirmed: true
  }, 'create-story-draft-01');

  // 追加针对 story-1 的证据
  const pEv = f.records.saveRecord(human, pStoryDraft.id, {
    baseRevision: pStoryDraft.revision,
    collection: 'evidence',
    id: null,
    record: {
      id: 'ev-s1',
      requirementId: 'REQ-HARNESS-1',
      targets: [{ kind: 'story', id: 'story-1' }],
      description: '故事测试证据',
      subject: 'tests/story.test.ts',
      environment: 'node',
      observedResult: 'PASS',
      limitations: [],
      sourceRefs: [sourceRef]
    },
    reason: '证据',
    confirmed: true
  }, 'create-ev-s1');

  // 追加针对 story-1 的核查（passed）
  const pVerif = f.records.saveRecord(human, pEv.id, {
    baseRevision: pEv.revision,
    collection: 'verifications',
    id: null,
    record: {
      id: 'verif-story-1',
      target: { kind: 'story', id: 'story-1' },
      criterionId: 'sc-1',
      outcome: 'passed',
      method: 'test',
      explanation: '测试通过',
      evidenceRefs: ['ev-s1'],
      sourceRefs: [sourceRef]
    },
    reason: '核查通过',
    confirmed: true
  }, 'create-verif-s1');

  // 将 story-1 推进到 review 并填写 result
  const pStoryReview = f.records.saveRecord(human, pVerif.id, {
    baseRevision: pVerif.revision,
    collection: 'stories',
    id: 'story-1',
    record: {
      ...pStoryDraft.records.stories.find(s => s.id === 'story-1')!,
      status: 'review',
      result: {
        what: '实现',
        why: '需求',
        actualImpact: '功能',
        evidenceRefs: ['ev-s1']
      }
    },
    reason: '推进到 review',
    confirmed: true
  }, 'story-to-review-01');

  // 2. 模型提出候选覆盖已有 story-1，修改 expectedOutcome
  modelCandidate = {
    type: 'propose_decomposition',
    requirementId: 'REQ-HARNESS-1',
    units: [],
    stories: [
      {
        kind: 'story',
        id: 'story-1',
        requirementId: 'REQ-HARNESS-1',
        title: '故事一（修改后）',
        problem: '故事问题',
        expectedOutcome: '实质修改后的故事期望结果（更严格要求）',
        scope: { includes: ['范围'], excludes: [] },
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'sc-1', description: '故事条件一', verification: '单元测试' }],
        sourceRefs: [sourceRef],
        status: 'draft',
        result: null,
        unitId: null,
        userValue: '用户价值',
        dependsOn: []
      }
    ],
    sourceRefs: [sourceRef]
  };

  const started = f.harness.start(human, pStoryReview.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: pStoryReview.revision,
    instruction: '拆解覆盖已有Story',
    confirmed: true
  }, 'harness-start-decomp-01');
  await f.harness.settled(started.id);
  const run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');

  // 3. 验证 preview:
  // a) before 不能是空数组，必须包含真实的旧 story-1
  // b) warning 必须提示覆盖已有对象及核查失效风险
  const preview = f.harness.preview(human, run.id);
  const previewBefore = preview.before as { units: unknown[]; stories: unknown[] };
  assert.ok(previewBefore && Array.isArray(previewBefore.stories) && previewBefore.stories.length > 0, 'preview.before 必须展示被覆盖的实际旧 Story');
  assert.match(preview.warning, /覆盖|失效/);

  // 4. 应用候选
  f.harness.apply(human, run.id, { revision: run.revision, confirmed: true });

  // 5. 验证正式记录：
  // a) 旧核查 verif-story-1 outcome 必须变为 unknown
  // b) 原证据 ev-s1 和 verif-story-1 保留未被删除
  const updatedP = f.records.get(human, f.project.id);
  const v = updatedP.records.verifications.find(item => item.id === 'verif-story-1')!;
  assert.equal(v.outcome, 'unknown', '覆盖已有 Story 导致内容改变后，已有核查必须标为 unknown');
  assert.ok(updatedP.records.evidence.some(e => e.id === 'ev-s1'), '证据不能被删除');

  // 6. 验证 audit:
  // audit.before 不能是空数组，effects 必须记录核查失效
  const lastAudit = updatedP.audit.at(-1)!;
  const auditBefore = lastAudit.before as { units?: unknown[]; stories?: unknown[] };
  assert.ok(auditBefore && Array.isArray(auditBefore.stories) && auditBefore.stories.length > 0, 'audit.before 必须保留真实前值');
});

test('Issue 3 (遗留): 已完成需求新增验收条件在初检阶段正常放行至 waiting_human，模拟回退后通过关系校验', async t => {
  let sourceRef = '';
  let modelCandidate: ContextCandidate | null = null;
  const model: ModelPort = {
    name: 'test-done-criteria-adder',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => modelCandidate!
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  // 准备已完成需求
  const pEv = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.records.get(human, f.project.id).revision,
    collection: 'evidence',
    id: null,
    record: {
      id: 'ev-done-req',
      requirementId: 'REQ-HARNESS-1',
      targets: [{ kind: 'requirement', id: 'REQ-HARNESS-1' }],
      description: '证据',
      subject: 'tests/req.test.ts',
      environment: 'node',
      observedResult: 'PASS',
      limitations: [],
      sourceRefs: [sourceRef]
    },
    reason: '证据',
    confirmed: true
  }, 'ev-done-req-01');

  const pReq = f.records.saveRecord(human, pEv.id, {
    baseRevision: pEv.revision,
    collection: 'requirements',
    id: 'REQ-HARNESS-1',
    record: {
      ...pEv.records.requirements[0]!,
      acceptanceCriteria: [{ id: 'c-init', description: '初始条件', verification: '测试' }],
      result: { what: '完成', why: '需求', actualImpact: '功能', evidenceRefs: ['ev-done-req'] },
      pullRequest: {
        url: 'https://github.com/BobcGn/AgentHub/pull/1',
        what: 'PR总结', why: 'PR理由', verification: 'PR验证', result: 'PR结果'
      }
    },
    reason: 'PR',
    confirmed: true
  }, 'req-done-setup-01');

  const pVerif = f.records.saveRecord(human, pReq.id, {
    baseRevision: pReq.revision,
    collection: 'verifications',
    id: null,
    record: {
      id: 'verif-init',
      target: { kind: 'requirement', id: 'REQ-HARNESS-1' },
      criterionId: 'c-init',
      outcome: 'passed',
      method: 'test',
      explanation: '通过',
      evidenceRefs: ['ev-done-req'],
      sourceRefs: [sourceRef]
    },
    reason: '核查',
    confirmed: true
  }, 'verif-done-setup-01');

  const pAccepted = f.records.acceptRequirement(human, pVerif.id, 'REQ-HARNESS-1', {
    baseRevision: pVerif.revision,
    confirmed: true,
    reason: '接受'
  }, 'accept-done-setup-01');

  assert.equal(pAccepted.records.requirements[0]!.status, 'done');

  // 模型提议为该已完成需求新增一个全新的验收条件 c-new
  modelCandidate = {
    type: 'propose_criteria',
    requirementId: 'REQ-HARNESS-1',
    acceptanceCriteria: [
      { id: 'c-init', description: '初始条件', verification: '测试' },
      { id: 'c-new', description: '全新补充的验收条件', verification: '新增自动化验证' }
    ],
    sourceRefs: [sourceRef]
  };

  // 必须正常完成初检，进入 waiting_human，而不能因 MISSING_PASSING_EVIDENCE 被初检错误阻断
  const started = f.start('为已完成需求新增验收条件', 'harness-start-done-crit-01');
  await f.harness.settled(started.id);
  const run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human', '初检应模拟回退后校验全图，允许为已完成需求新增条件进入等待确认');
});

test('Issue 4 (遗留): 验收条件键顺序改变或空白规范化不误触发失效与状态回退', async t => {
  let sourceRef = '';
  const f = harnessFixture();
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  // 准备已接受的需求
  const pEv = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.records.get(human, f.project.id).revision,
    collection: 'evidence',
    id: null,
    record: {
      id: 'ev-stable',
      requirementId: 'REQ-HARNESS-1',
      targets: [{ kind: 'requirement', id: 'REQ-HARNESS-1' }],
      description: '证据',
      subject: 'tests/stable.test.ts',
      environment: 'node',
      observedResult: 'PASS',
      limitations: [],
      sourceRefs: [sourceRef]
    },
    reason: '证据',
    confirmed: true
  }, 'ev-stable-01');

  const pReq = f.records.saveRecord(human, pEv.id, {
    baseRevision: pEv.revision,
    collection: 'requirements',
    id: 'REQ-HARNESS-1',
    record: {
      ...pEv.records.requirements[0]!,
      acceptanceCriteria: [{ id: 'c1', description: '核心条件', verification: '自动化测试' }],
      result: { what: '完成', why: '需求', actualImpact: '功能', evidenceRefs: ['ev-stable'] },
      pullRequest: {
        url: 'https://github.com/BobcGn/AgentHub/pull/1',
        what: 'PR总结', why: 'PR理由', verification: 'PR验证', result: 'PR结果'
      }
    },
    reason: '需求条件',
    confirmed: true
  }, 'req-stable-01');

  const pVerif = f.records.saveRecord(human, pReq.id, {
    baseRevision: pReq.revision,
    collection: 'verifications',
    id: null,
    record: {
      id: 'verif-stable',
      target: { kind: 'requirement', id: 'REQ-HARNESS-1' },
      criterionId: 'c1',
      outcome: 'passed',
      method: 'test',
      explanation: '通过',
      evidenceRefs: ['ev-stable'],
      sourceRefs: [sourceRef]
    },
    reason: '核查',
    confirmed: true
  }, 'verif-stable-01');

  const pAccepted = f.records.acceptRequirement(human, pVerif.id, 'REQ-HARNESS-1', {
    baseRevision: pVerif.revision,
    confirmed: true,
    reason: '接受'
  }, 'accept-stable-01');

  // 模型提议相同的验收条件，但 JSON 键顺序不同：verification 在前，id 在中，description 在后
  const candidateWithReorderedKeys: ContextCandidate = {
    type: 'propose_criteria',
    requirementId: 'REQ-HARNESS-1',
    acceptanceCriteria: [
      JSON.parse('{"verification":"自动化测试","id":"c1","description":"核心条件"}')
    ],
    sourceRefs: [sourceRef]
  };

  // 应用该候选
  const receipt = f.records.applyRunCandidate(human, pAccepted.id, {
    baseRevision: pAccepted.revision,
    runId: 'fake-run-key-order',
    candidate: candidateWithReorderedKeys,
    sources: []
  });
  assert.ok(receipt.projectRevision > 0);

  const finalProject = f.records.get(human, pAccepted.id);
  const finalReq = finalProject.records.requirements.find(r => r.id === 'REQ-HARNESS-1')!;
  // 必须保持 done 与 accepted，不能因键顺序不同而误判为内容修改并撤销整体接受！
  assert.equal(finalReq.status, 'done', '键顺序不同不应误使需求状态退回 review');
  assert.ok(finalReq.acceptance !== null, '键顺序不同不应误撤销整体接受');
  const finalV = finalProject.records.verifications.find(v => v.id === 'verif-stable')!;
  assert.equal(finalV.outcome, 'passed', '键顺序不同不应误使已通过核查失效');
});
