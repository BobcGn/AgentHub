import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HubError } from '../src/domain/board.js';
import type { ModelPort, ModelStepInput, ModelStepOutput, ToolCallRequest, ToolCallResult, ToolDefinition } from '../src/domain/harness.js';
import { harnessFixture } from './harness-fixtures.js';
import { human } from './fixtures.js';

const mockTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: '读文件',
    parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }
  }
];

test('Harness 多步循环：模型请求工具 -> 本地安全执行 -> 结果回填 -> 产出候选', async t => {
  let stepCount = 0;
  const model: ModelPort = {
    name: 'multi-turn-mock',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('应优先调用 step'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      stepCount++;
      if (input.turns.length === 0) {
        // 第一轮：模型请求读取文件
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: { path: 'package.json' } }]
        };
      }
      // 第二轮：模型看到工具输出，产出候选
      assert.equal(input.turns.length, 2);
      assert.equal(input.turns[0]?.role, 'assistant');
      assert.equal(input.turns[1]?.role, 'tool');
      assert.ok(input.turns[1]?.content?.includes('"name": "agenthub"'));
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'open_question',
          epistemicStatus: 'unknown',
          content: '基于读取到的 package.json，待核对依赖是否有安全漏洞？',
          sourceRefs: []
        }
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => {
    assert.equal(call.name, 'read_file');
    return { callId: call.id, toolName: call.name, output: '{\n  "name": "agenthub"\n}' };
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);

  // 显式传入 tools 与 toolExecutor
  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '请先读代码再提问',
    confirmed: true
  }, 'req-multi-1');

  await harness.settled(started.id);

  const run = harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');
  assert.ok(run.candidate);
  assert.equal(run.candidate.type, 'append_context');
  if (run.candidate.type === 'append_context') {
    assert.equal(run.candidate.content, '基于读取到的 package.json，待核对依赖是否有安全漏洞？');
  }
  assert.ok(run.turns);
  assert.equal(run.turns.length, 3); // assistant tool_calls, tool result, assistant final candidate
  assert.equal(run.turns[0]?.role, 'assistant');
  assert.equal(run.turns[1]?.role, 'tool');
  assert.equal(run.turns[2]?.role, 'assistant');
  assert.equal(stepCount, 2);
});

test('Harness 多步循环：工具调用次数超预算立即熔断', async t => {
  const model: ModelPort = {
    name: 'infinite-tool-caller',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(): Promise<ModelStepOutput> {
      // 一直请求工具
      return {
        kind: 'tool_calls',
        toolCalls: [{ id: 'tc-repeat', name: 'read_file', arguments: { path: 'a.txt' } }]
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => {
    return { callId: call.id, toolName: call.name, output: 'data' };
  };

  const f = harnessFixture(model, { maxToolCalls: 2 });
  t.after(f.cleanup);

  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '无限调用测试',
    confirmed: true
  }, 'req-multi-budget');

  await harness.settled(started.id);

  const run = harness.get(human, started.id);
  assert.equal(run.state, 'failed');
  assert.equal(run.stopReason, 'TOOL_BUDGET_EXCEEDED');
  assert.ok(run.turns);
  assert.equal(run.turns.length, 5); // 2 tool calls requested + 2 tool results executed + 1 tool call exceeding budget
});

test('Harness 中断与恢复：网络抖动中断后保留已执行步骤，人端核对后可从断点恢复', async t => {
  let attempt = 0;
  const model: ModelPort = {
    name: 'network-fail-once',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      attempt++;
      if (input.turns.length === 0) {
        // 第 1 步：读取文件
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: { path: 'config.json' } }]
        };
      }
      if (attempt === 2) {
        // 第 2 步：模拟网络异常中断
        throw new HubError(502, 'PROVIDER_NETWORK_ERROR', '网络连接突然断开');
      }
      // 恢复后：模型看到已有的工具输出，顺利产出候选
      assert.ok(input.turns.length >= 2);
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '从中断恢复后生成的假设：网络已稳定',
          sourceRefs: []
        }
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => {
    return { callId: call.id, toolName: call.name, output: '{"timeout": 30}' };
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);

  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '网络中断测试',
    confirmed: true
  }, 'req-net-fail');

  await harness.settled(started.id);

  // 验证第一次因为网络错误中断，但已执行的 2 个 turn (assistant tool call + tool result) 完整保留
  let run = harness.get(human, started.id);
  assert.equal(run.state, 'interrupted');
  assert.equal(run.stopReason, 'PROVIDER_NETWORK_ERROR');
  assert.ok(run.turns);
  assert.equal(run.turns.length, 2);
  assert.equal(run.turns[1]?.content, '{"timeout": 30}');

  // 人端核对并恢复
  const resumed = harness.resume(human, run.id, { revision: run.revision, confirmed: true });
  assert.equal(resumed.state, 'running');
  await harness.settled(resumed.id);

  // 恢复后顺利完成并生成候选
  run = harness.get(human, resumed.id);
  assert.equal(run.state, 'waiting_human');
  assert.ok(run.candidate);
  assert.equal(run.candidate.type, 'append_context');
  if (run.candidate.type === 'append_context') {
    assert.equal(run.candidate.content, '从中断恢复后生成的假设：网络已稳定');
  }
  assert.equal(run.turns?.length, 3);
});
