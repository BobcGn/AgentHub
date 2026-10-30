import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessFixture } from './harness-fixtures.js';
import type { ModelPort } from '../src/domain/harness.js';
import type { Principal } from '../src/domain/board.js';

const human: Principal = { kind: 'human' };

test('候选动作：propose_criteria 提炼验收标准并通过人端应用生效', async t => {
  let sourceRef = '';
  const model: ModelPort = {
    name: 'test-criteria-proposer',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => ({
      type: 'propose_criteria',
      requirementId: 'REQ-HARNESS-1',
      acceptanceCriteria: [
        {
          id: 'crit-auto-1',
          description: 'Given 用户未登录 When 访问受保护接口 Then 返回 HTTP 401',
          verification: '自动化集成测试验证'
        },
        {
          id: 'crit-auto-2',
          description: 'Given 凭据合法 When 请求项目列表 Then 返回对应项目清单',
          verification: '自动化接口测试验证'
        }
      ],
      sourceRefs: [sourceRef]
    })
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  const started = f.start('提炼验收标准');
  await f.harness.settled(started.id);

  const run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');
  assert.ok(run.candidate);
  assert.equal(run.candidate.type, 'propose_criteria');

  // 人端核对差异
  const preview = f.harness.preview(human, run.id);
  assert.equal(preview.warning, '修改正式验收条件；确认后正式生效。');
  assert.ok(Array.isArray(preview.after));
  assert.equal((preview.after as unknown[]).length, 2);

  // 人端确认应用
  const applied = f.harness.apply(human, run.id, { revision: run.revision, confirmed: true });
  assert.equal(applied.outcome, 'applied');
  assert.equal(applied.state, 'completed');

  // 验证正式项目记录更新
  const project = f.records.get(human, f.project.id);
  const req = project.records.requirements.find(r => r.id === 'REQ-HARNESS-1');
  assert.ok(req);
  assert.equal(req.acceptanceCriteria.length, 2);
  assert.equal(req.acceptanceCriteria[0]?.id, 'crit-auto-1');
  assert.equal(req.acceptanceCriteria[1]?.id, 'crit-auto-2');
});

test('候选动作：propose_decomposition 拆解 Unit 与 Story 草案并通过人端核对应用', async t => {
  let sourceRef = '';
  const model: ModelPort = {
    name: 'test-decomposer',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => ({
      type: 'propose_decomposition',
      requirementId: 'REQ-HARNESS-1',
      units: [
        {
          kind: 'unit',
          id: 'unit-core-auth',
          title: '核心认证能力单元',
          problem: '需要安全校验会话',
          expectedOutcome: '提供标准校验契约',
          scope: { includes: ['Session check'], excludes: [] },
          rationale: '保证无状态隔离',
          expectedImpact: '拦截未授权请求',
          acceptanceCriteria: [
            { id: 'crit-u1', description: '校验有效 session', verification: '单元测试' }
          ],
          sourceRefs: [sourceRef],
          status: 'draft',
          result: null,
          requirementId: 'REQ-HARNESS-1',
          dependsOn: [],
          responsibilities: ['管理会话状态'],
          inputs: [],
          outputs: ['Principal']
        }
      ],
      stories: [
        {
          kind: 'story',
          id: 'story-login-check',
          title: '用户登录凭据校验',
          problem: '需要核对密码',
          expectedOutcome: '密码一致返回 Token',
          scope: { includes: ['Password auth'], excludes: [] },
          rationale: '基础安全屏障',
          expectedImpact: '保障数据隔离',
          acceptanceCriteria: [
            { id: 'crit-s1', description: '密码匹配时颁发令牌', verification: '集成测试' }
          ],
          sourceRefs: [sourceRef],
          status: 'draft',
          result: null,
          requirementId: 'REQ-HARNESS-1',
          dependsOn: [],
          unitId: 'unit-core-auth',
          userValue: '用户能安全登录'
        }
      ],
      sourceRefs: [sourceRef]
    })
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  const started = f.start('拆解认证模块');
  await f.harness.settled(started.id);

  const run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');
  assert.equal(run.candidate?.type, 'propose_decomposition');

  // 差异核对
  const preview = f.harness.preview(human, run.id);
  assert.equal(preview.warning, '建议拆解 Unit / Story 草案；各子产物仍需分别实现与验收。');

  // 应用
  const applied = f.harness.apply(human, run.id, { revision: run.revision, confirmed: true });
  assert.equal(applied.outcome, 'applied');

  // 检查正式记录
  const project = f.records.get(human, f.project.id);
  assert.equal(project.records.units.length, 1);
  assert.equal(project.records.units[0]?.id, 'unit-core-auth');
  assert.equal(project.records.units[0]?.status, 'draft');
  assert.equal(project.records.stories.length, 1);
  assert.equal(project.records.stories[0]?.id, 'story-login-check');
  assert.equal(project.records.stories[0]?.status, 'draft');
});

test('候选动作：propose_bolt_plan 规划构建批次并应用', async t => {
  let sourceRef = '';
  const model: ModelPort = {
    name: 'test-bolt-planner',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => ({
      type: 'propose_bolt_plan',
      requirementId: 'REQ-HARNESS-1',
      boltPlan: {
        kind: 'bolt_plan',
        id: 'bolt-batch-1',
        title: '第一批次构建计划',
        problem: '按批次推进 Story 交付',
        expectedOutcome: '完成认证核心测试',
        scope: { includes: ['Batch 1'], excludes: [] },
        rationale: '降低首次交付风险',
        expectedImpact: '建立初始基线',
        acceptanceCriteria: [{ id: 'crit-b1', description: '批次内所有测试通过', verification: 'CI 检查' }],
        sourceRefs: [sourceRef],
        status: 'draft',
        result: null,
        requirementId: 'REQ-HARNESS-1',
        dependsOn: [],
        storyIds: ['story-existing-1'],
        constructionType: 'simple',
        stages: ['编码实现', '测试覆盖'],
        exitConditions: ['所有单测绿色', '无类型错误']
      },
      sourceRefs: [sourceRef]
    })
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  sourceRef = f.project.records.sources[0]!.id;

  // 在项目中先准备一个合法的 Story
  const proj = f.records.get(human, f.project.id);
  const data = structuredClone(proj.records);
  data.stories.push({
    kind: 'story',
    id: 'story-existing-1',
    title: '已存在的 Story',
    problem: 'P', expectedOutcome: 'O',
    scope: { includes: ['A'], excludes: [] },
    rationale: 'R', expectedImpact: 'I',
    acceptanceCriteria: [{ id: 'c1', description: 'desc', verification: 'verify' }],
    sourceRefs: [sourceRef],
    status: 'draft',
    result: null,
    requirementId: 'REQ-HARNESS-1',
    dependsOn: [],
    unitId: null,
    userValue: 'V'
  });
  f.recordStore.replace({ ...proj, revision: proj.revision + 1, records: data }, proj.revision);

  const started = f.start('规划构建批次');
  await f.harness.settled(started.id);

  const run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');
  assert.equal(run.candidate?.type, 'propose_bolt_plan');

  const preview = f.harness.preview(human, run.id);
  assert.equal(preview.warning, '建议构建批次计划（Bolt Plan）；执行过程与退出准则需按计划核对。');

  const applied = f.harness.apply(human, run.id, { revision: run.revision, confirmed: true });
  assert.equal(applied.outcome, 'applied');

  const updatedProject = f.records.get(human, f.project.id);
  assert.equal(updatedProject.records.boltPlans.length, 1);
  assert.equal(updatedProject.records.boltPlans[0]?.id, 'bolt-batch-1');
  assert.equal(updatedProject.records.boltPlans[0]?.status, 'draft');
});

test('安全防御：模型不能提议 done 状态的产物，也不能伪造 confirmed 决策', async t => {
  let sourceRef = '';
  // 1. 尝试提议 status 为 done 的 Story
  const modelDone: ModelPort = {
    name: 'illegal-done-proposer',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => ({
      type: 'propose_decomposition',
      requirementId: 'REQ-HARNESS-1',
      stories: [
        {
          kind: 'story',
          id: 'story-fake-done',
          title: '伪造已完成的 Story',
          problem: 'P', expectedOutcome: 'O',
          scope: { includes: ['A'], excludes: [] },
          rationale: 'R', expectedImpact: 'I',
          acceptanceCriteria: [{ id: 'c1', description: 'desc', verification: 'verify' }],
          sourceRefs: [sourceRef],
          status: 'done', // 非法！模型不可提议 done
          result: null,
          requirementId: 'REQ-HARNESS-1',
          dependsOn: [],
          unitId: null,
          userValue: 'V'
        }
      ],
      sourceRefs: [sourceRef]
    })
  };

  const f1 = harnessFixture(modelDone);
  t.after(f1.cleanup);
  sourceRef = f1.project.records.sources[0]!.id;

  const started1 = f1.start('尝试伪造完成');
  await f1.harness.settled(started1.id);
  const run1 = f1.harness.get(human, started1.id);
  assert.equal(run1.state, 'failed');
  assert.equal(run1.stopReason, 'INVALID_CANDIDATE');

  // 2. 尝试提议 confirmed 的 decision
  const modelDecision: ModelPort = {
    name: 'illegal-decision-proposer',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    propose: async () => ({
      type: 'append_context',
      requirementId: 'REQ-HARNESS-1',
      category: 'decision',
      epistemicStatus: 'confirmed', // 非法！decision 候选只能为 proposed
      content: '模型自封已确认的架构决策',
      sourceRefs: [sourceRef]
    })
  };

  const f2 = harnessFixture(modelDecision);
  t.after(f2.cleanup);

  const started2 = f2.start('尝试伪造决策');
  await f2.harness.settled(started2.id);
  const run2 = f2.harness.get(human, started2.id);
  assert.equal(run2.state, 'failed');
  assert.equal(run2.stopReason, 'INVALID_CANDIDATE');
});
