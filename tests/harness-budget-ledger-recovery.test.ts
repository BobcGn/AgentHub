import test from 'node:test';
import assert from 'node:assert/strict';
import { harnessFixture } from './harness-fixtures.js';
import type { ModelPort, ModelStepInput, ModelStepOutput, ToolCallRequest, ToolCallResult, ToolDefinition } from '../src/domain/harness.js';
import { HubError } from '../src/domain/board.js';
import { buildContext } from '../src/harness/context.js';
import { createHash } from 'node:crypto';

const human = { kind: 'human' as const, name: 'Tester' };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const mockTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: '读取文件',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }
  },
  {
    name: 'search_code',
    description: '搜索代码',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
  }
];

test('运行预算：断点恢复不抹掉调用次数，诚实累计调用次数', async t => {
  let attempt = 0;
  const model: ModelPort = {
    name: 'recoverable-call-metering',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      attempt++;
      if (attempt === 1) {
        // 第一轮：读取工具，随后发生网络错误
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: 'a.txt' } }]
        };
      }
      if (attempt === 2) {
        // 第二次请求：抛出网络中断
        throw new HubError(502, 'PROVIDER_NETWORK_ERROR', '网络故障');
      }
      // 恢复后第三次请求：返回候选
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '恢复后产出假设',
          sourceRefs: []
        }
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => {
    return { callId: call.id, toolName: call.name, output: 'file contents' };
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '调用计数对账测试',
    confirmed: true
  }, 'req-metering-test');

  await harness.settled(started.id);

  let run = harness.get(human, started.id);
  assert.equal(run.state, 'interrupted');
  assert.equal(run.stopReason, 'PROVIDER_NETWORK_ERROR');
  // 首次运行实际发起了 2 次模型请求（第 1 步返回 tool_calls，第 2 步抛出网络故障）
  assert.equal(run.calls, 2);

  // 人端恢复运行：不应将 calls 退款！
  const resumed = harness.resume(human, run.id, { revision: run.revision, confirmed: true });
  await harness.settled(resumed.id);

  run = harness.get(human, resumed.id);
  assert.equal(run.state, 'waiting_human');
  // 恢复后再次发起第 3 次模型请求返回候选，calls 必须诚实累加为 3
  assert.equal(run.calls, 3);
  assert.ok(run.candidate);
});

test('步骤账本与恢复：未完成的工具轮次先对账补齐再发起模型调用', async t => {
  let stepCallCount = 0;
  const executedCalls: string[] = [];

  const model: ModelPort = {
    name: 'reconcile-tool-turns',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      stepCallCount++;
      if (input.turns.length === 0) {
        // 发出两个 tool_calls
        return {
          kind: 'tool_calls',
          toolCalls: [
            { id: 'call_alpha', name: 'read_file', arguments: { path: 'alpha.txt' } },
            { id: 'call_beta', name: 'search_code', arguments: { query: 'beta' } }
          ]
        };
      }

      // 在下一次调用模型前，检查 input.turns 是否完整对账了两个工具调用
      const toolTurnIds = input.turns.filter(t => t.role === 'tool').map(t => t.toolCallId);
      assert.deepEqual(toolTurnIds, ['call_alpha', 'call_beta'], '恢复后发起模型 step 前必须已补齐所有未完成的工具响应');

      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'decision',
          epistemicStatus: 'proposed',
          content: '已对账全部工具调用',
          sourceRefs: []
        }
      };
    }
  };

  let failBeforeBeta = true;
  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => {
    if (call.id === 'call_beta' && failBeforeBeta) {
      failBeforeBeta = false;
      throw new HubError(502, 'PROVIDER_NETWORK_ERROR', '网络故障，中断于 call_beta 执行');
    }
    executedCalls.push(call.id);
    return { callId: call.id, toolName: call.name, output: `Result of ${call.id}` };
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '未完成工具对账测试',
    confirmed: true
  }, 'req-unexecuted-tool');

  await harness.settled(started.id);

  // 验证首次运行因 call_beta 中断，但 call_alpha 结果保留在账本中
  let run = harness.get(human, started.id);
  assert.equal(run.state, 'interrupted');
  assert.equal(run.stopReason, 'PROVIDER_NETWORK_ERROR');
  assert.equal(run.turns?.length, 2); // assistant (tool calls) + tool (call_alpha)
  assert.equal(run.turns[1]?.toolCallId, 'call_alpha');

  // 恢复运行
  const resumed = harness.resume(human, run.id, { revision: run.revision, confirmed: true });
  await harness.settled(resumed.id);

  const finalRun = harness.get(human, resumed.id);
  assert.equal(finalRun.state, 'waiting_human');
  // 验证 call_beta 在模型调用前已被执行并对账入账本
  assert.ok(executedCalls.includes('call_beta'));
  assert.equal(finalRun.turns?.length, 4); // assistant (tool calls) -> tool alpha -> tool beta -> assistant (candidate)
  assert.equal(finalRun.turns[2]?.toolCallId, 'call_beta');
});

test('上下文提炼：focusOutline 直观呈现目标需求、验收准则、Unit 接口、Story 依赖与 BoltPlan 退出条件', () => {
  const f = harnessFixture();
  // 在当前项目中添加 Unit、Story 和 BoltPlan
  const project = f.records.get(human, f.project.id);
  project.records.requirements[0]!.acceptanceCriteria = [
    { id: 'AC-1', description: '准则 1', verification: '自动化测试' }
  ];
  project.records.units.push({
    schemaVersion: '1.0.0',
    id: 'UNIT-1',
    kind: 'unit',
    requirementId: 'REQ-HARNESS-1',
    title: '用户领域核心单元',
    problem: '封装核心实体与校验',
    expectedOutcome: '实体无外部依赖',
    scope: { includes: ['src/domain'], excludes: [] },
    rationale: '领域隔离',
    expectedImpact: '高内聚',
    acceptanceCriteria: [{ id: 'AC-U1', description: '无外部依赖', verification: '静态检查' }],
    sourceRefs: [],
    status: 'in_progress',
    result: null,
    dependsOn: [],
    responsibilities: ['管理领域状态', '提供纯计算方法'],
    inputs: ['UserParams'],
    outputs: ['UserEntity']
  } as unknown as import('../src/domain/record-contract.js').UnitRecord);

  project.records.stories.push({
    schemaVersion: '1.0.0',
    id: 'STORY-1',
    kind: 'story',
    requirementId: 'REQ-HARNESS-1',
    unitId: 'UNIT-1',
    title: '提供领域校验',
    problem: '非法参数需在领域层拒绝',
    expectedOutcome: '抛出 DomainError',
    scope: { includes: ['src/domain'], excludes: [] },
    rationale: '保障核心一致性',
    expectedImpact: '避免非法状态',
    acceptanceCriteria: [{ id: 'AC-S1', description: '非法值拒绝', verification: '单元测试' }],
    sourceRefs: [],
    status: 'planned',
    result: null,
    dependsOn: [{ kind: 'unit', id: 'UNIT-1' }],
    userValue: '确保业务状态永远合法'
  } as unknown as import('../src/domain/record-contract.js').StoryRecord);

  project.records.boltPlans.push({
    schemaVersion: '1.0.0',
    id: 'BOLT-1',
    kind: 'bolt_plan',
    requirementId: 'REQ-HARNESS-1',
    title: '第一批构建计划',
    problem: '按顺序落实领域单元与用例',
    expectedOutcome: '完成 Unit-1 与 Story-1',
    scope: { includes: ['src/domain'], excludes: [] },
    rationale: '增量推进',
    expectedImpact: '可验证',
    acceptanceCriteria: [],
    sourceRefs: [],
    status: 'planned',
    result: null,
    dependsOn: [],
    storyIds: ['STORY-1'],
    constructionType: 'ddd',
    stages: ['领域建模', '单元测试', '人端验收'],
    exitConditions: ['领域单测全部通过', '无类型错误']
  } as unknown as import('../src/domain/record-contract.js').BoltPlanRecord);

  const snapshot = buildContext(project, 'REQ-HARNESS-1', '测试上下文选择', 32768, digest);
  assert.ok(snapshot.focusOutline);

  const outlineText = snapshot.focusOutline.join('\n');
  // 必须直观包含需求与验收准则
  assert.ok(outlineText.includes('AC-1: 准则 1'));
  // 必须包含 Unit 接口与准则
  assert.ok(outlineText.includes('inputs=[UserParams], outputs=[UserEntity]'));
  assert.ok(outlineText.includes('AC-U1: 无外部依赖'));
  // 必须包含 Story 用户价值与依赖
  assert.ok(outlineText.includes('value: 确保业务状态永远合法'));
  assert.ok(outlineText.includes('unit:UNIT-1'));
  // 必须包含 BoltPlan 阶段与退出条件
  assert.ok(outlineText.includes('stages: 领域建模 -> 单元测试 -> 人端验收'));
  assert.ok(outlineText.includes('exitConditions: 领域单测全部通过; 无类型错误'));
});

test('运行预算：累计指标 (inputBytes, outputBytes, toolCallsCount, durationMs) 准确记录且超限立即阻断', async t => {
  const model: ModelPort = {
    name: 'metrics-budget-test',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-budget', name: 'read_file', arguments: { path: 'data.txt' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'decision',
          epistemicStatus: 'proposed',
          content: '指标收集验证',
          sourceRefs: []
        }
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => {
    return { callId: call.id, toolName: call.name, output: 'small response' };
  };

  const f = harnessFixture(model, { maxOutputBytes: 4096 });
  t.after(f.cleanup);
  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  // 1. 成功运行记录指标
  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '指标验证正常运行',
    confirmed: true
  }, 'req-metrics-ok');

  await harness.settled(started.id);
  const run = harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');
  assert.ok(run.metrics);
  assert.ok(run.metrics.inputBytes > 0, '必须记录 inputBytes');
  assert.ok(run.metrics.outputBytes > 0, '必须记录 outputBytes');
  assert.equal(run.metrics.toolCallsCount, 1, '必须记录 toolCallsCount 为 1');
  assert.ok(run.metrics.durationMs >= 0, '必须记录 durationMs');

  // 2. 超出输出预算时阻断
  const fOverflow = harnessFixture({
    name: 'overflow-model',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(): Promise<ModelStepOutput> {
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: 'REQ-HARNESS-1',
          category: 'decision',
          epistemicStatus: 'proposed',
          content: 'X'.repeat(500),
          sourceRefs: []
        }
      };
    }
  }, { maxOutputBytes: 50 });
  t.after(fOverflow.cleanup);

  const overflowHarness = fOverflow.open();
  const overflowRun = overflowHarness.start(human, fOverflow.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: fOverflow.project.revision,
    instruction: '超出输出预算测试',
    confirmed: true
  }, 'req-overflow-out');

  await overflowHarness.settled(overflowRun.id);
  const stoppedRun = overflowHarness.get(human, overflowRun.id);
  assert.equal(stoppedRun.state, 'failed');
  assert.equal(stoppedRun.stopReason, 'OUTPUT_BUDGET');
});
