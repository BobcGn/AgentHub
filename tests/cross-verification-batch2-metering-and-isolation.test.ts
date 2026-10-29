import assert from 'node:assert/strict';
import test from 'node:test';
import { HubError } from '../src/domain/board.js';
import type { ModelPort, ModelStepInput, ModelStepOutput, ToolCallRequest, ToolCallResult, ToolDefinition } from '../src/domain/harness.js';
import { DeepSeekModel } from '../src/infrastructure/deepseek-model.js';
import { deferred, harnessFixture } from './harness-fixtures.js';

const human = { kind: 'human' as const };

const mockTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: '读取工作区文件',
    parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }
  }
];

test('Batch 2 反例 1：多步请求按每次真实模型调用检查并累计 calls 与实际发送字节预算（含历史工具结果与工具定义）', async t => {
  let actualModelRequests = 0;
  const largeToolResult = 'T'.repeat(2200);

  const threeStepModel: ModelPort = {
    name: 'three-step-metered',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      actualModelRequests += 1;
      const toolTurns = input.turns.filter(turn => turn.role === 'tool');
      if (toolTurns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: { path: 'a.ts' } }]
        };
      }
      if (toolTurns.length === 1) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-2', name: 'read_file', arguments: { path: 'b.ts' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '三步请求计量完成',
          sourceRefs: []
        }
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => ({
    callId: call.id,
    toolName: call.name,
    output: largeToolResult
  });

  // 1a) Sufficient budget: 3 model requests must record calls === 3 and inputBytes covering all 3 payloads + historical tool outputs
  const f1 = harnessFixture(threeStepModel, { maxCalls: 5, maxInputBytes: 65536 });
  t.after(f1.cleanup);
  const h1 = f1.open();
  (h1 as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (h1 as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const s1 = h1.start(human, f1.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f1.project.revision,
    instruction: '测试三步调用与累计字节计量',
    confirmed: true
  }, 'b2-three-step-ok');
  await h1.settled(s1.id);
  const r1 = h1.get(human, s1.id);

  assert.equal(r1.state, 'waiting_human');
  assert.equal(actualModelRequests, 3);
  assert.equal(r1.calls, 3, '3 次真实模型请求必须累计 calls === 3，不能只计 1 次');
  assert.ok(r1.snapshot);
  // Step 1 sends snapshot+tools; Step 2 sends snapshot+tools+2200B tool output; Step 3 sends snapshot+tools+4400B tool outputs
  const minExpectedBytes = r1.snapshot.bytes * 3 + 2200 + 4400;
  assert.ok(
    (r1.metrics?.inputBytes ?? 0) >= minExpectedBytes,
    `累计 inputBytes (${r1.metrics?.inputBytes}) 必须覆盖 3 次请求的上下文、历史工具结果与工具定义 (>= ${minExpectedBytes})`
  );

  // 1b) Per-step maxCalls enforcement: setting maxCalls: 2 must stop BEFORE the 3rd model request
  actualModelRequests = 0;
  const fCallCap = harnessFixture(threeStepModel, { maxCalls: 2, maxInputBytes: 65536 });
  t.after(fCallCap.cleanup);
  const hCallCap = fCallCap.open();
  (hCallCap as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (hCallCap as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const sCallCap = hCallCap.start(human, fCallCap.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: fCallCap.project.revision,
    instruction: '测试单次循环内第 3 次请求触发 CALL_BUDGET',
    confirmed: true
  }, 'b2-step-call-cap');
  await hCallCap.settled(sCallCap.id);
  const rCallCap = hCallCap.get(human, sCallCap.id);

  assert.equal(rCallCap.state, 'failed');
  assert.equal(rCallCap.stopReason, 'CALL_BUDGET');
  assert.equal(actualModelRequests, 2, '超出 maxCalls=2 时不得发出第 3 次模型请求');
  assert.equal(rCallCap.calls, 2);

  // 1c) Per-step maxInputBytes enforcement: Step 1 fits, Step 2 (with 2200B tool output added) exceeds maxInputBytes -> stops BEFORE Step 2 request!
  actualModelRequests = 0;
  const tightInputBudget = r1.snapshot.bytes + 2000; // Enough for Step 1, NOT enough for Step 1 + Step 2!
  const fInputCap = harnessFixture(threeStepModel, { maxCalls: 5, maxInputBytes: tightInputBudget });
  t.after(fInputCap.cleanup);
  const hInputCap = fInputCap.open();
  (hInputCap as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (hInputCap as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const sInputCap = hInputCap.start(human, fInputCap.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: fInputCap.project.revision,
    instruction: '测试多步循环内历史工具结果触发 INPUT_BUDGET',
    confirmed: true
  }, 'b2-step-input-cap');
  await hInputCap.settled(sInputCap.id);
  const rInputCap = hInputCap.get(human, sInputCap.id);

  assert.equal(rInputCap.state, 'failed');
  assert.equal(rInputCap.stopReason, 'INPUT_BUDGET');
  assert.equal(actualModelRequests, 1, '第 2 次请求超输入字节预算时必须在发送前阻断');
  assert.equal(rInputCap.calls, 1);

  // 1d) OpenAiCompatibleProvider measures actual HTTP request body bytes (including system prompt + messages + tools)
  const provider = new DeepSeekModel({ apiKey: 'sk-synthetic', baseUrl: 'http://127.0.0.1:19999' });
  assert.equal(typeof provider.measureStepInputBytes, 'function');
  const step1Bytes = provider.measureStepInputBytes!({ snapshot: r1.snapshot, tools: mockTools, turns: [] });
  const step2Bytes = provider.measureStepInputBytes!({
    snapshot: r1.snapshot,
    tools: mockTools,
    turns: [
      { sequence: 1, role: 'assistant', toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: { path: 'a.ts' } }] },
      { sequence: 2, role: 'tool', toolCallId: 'tc-1', content: largeToolResult }
    ]
  });
  assert.ok(step1Bytes > r1.snapshot.bytes, 'HTTP 请求字节数须包含系统提示词与工具 Schema');
  assert.ok(step2Bytes >= step1Bytes + 2200, '第 2 步请求字节数须包含新增历史工具输出');
});

test('Batch 2 反例 2：断点恢复时不得重复累计已执行过的历史工具调用次数', async t => {
  let stepAttempt = 0;
  let actualToolExecutions = 0;

  const model: ModelPort = {
    name: 'resume-tool-dedup-model',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      stepAttempt += 1;
      if (stepAttempt === 1) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'call_first', name: 'read_file', arguments: { path: 'one.ts' } }]
        };
      }
      if (stepAttempt === 2) {
        throw new HubError(502, 'PROVIDER_NETWORK_ERROR', '第 2 次请求网络中断');
      }
      if (stepAttempt === 3) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'call_second', name: 'read_file', arguments: { path: 'two.ts' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '恢复后再调一次工具完成',
          sourceRefs: []
        }
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => {
    actualToolExecutions += 1;
    return { callId: call.id, toolName: call.name, output: `content of ${call.id}` };
  };

  const f = harnessFixture(model, { maxCalls: 6, maxInputBytes: 65536 });
  t.after(f.cleanup);
  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '测试恢复后工具计数不翻倍',
    confirmed: true
  }, 'b2-tool-dedup');
  await harness.settled(started.id);

  const interrupted = harness.get(human, started.id);
  assert.equal(interrupted.state, 'interrupted');
  assert.equal(actualToolExecutions, 1);
  assert.equal(interrupted.metrics?.toolCallsCount, 1);
  assert.equal(interrupted.calls, 2, '中断前已发生 2 次真实模型调用尝试');

  const resumed = harness.resume(human, interrupted.id, { revision: interrupted.revision, confirmed: true });
  await harness.settled(resumed.id);

  const completed = harness.get(human, resumed.id);
  assert.equal(completed.state, 'waiting_human');
  assert.equal(actualToolExecutions, 2);
  assert.equal(completed.metrics?.toolCallsCount, 2, '总共仅执行 2 次工具，恢复后绝不能重复累计为 3');
  assert.equal(completed.calls, 4, '恢复后又发生 2 次模型请求，累计 calls 应为 4');
});

test('Batch 2 反例 3：多步执行中途失败（如超输出预算或候选非法）必须保留已发生的调用、输入、输出和工具消耗', async t => {
  const model: ModelPort = {
    name: 'mid-way-failure-model',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-ok', name: 'read_file', arguments: { path: 'ok.ts' } }]
        };
      }
      // Step 2 returns oversized candidate exceeding maxOutputBytes=250
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: 'Z'.repeat(400),
          sourceRefs: []
        }
      };
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => ({
    callId: call.id,
    toolName: call.name,
    output: 'ok content'
  });

  const f = harnessFixture(model, { maxCalls: 5, maxInputBytes: 65536, maxOutputBytes: 250 });
  t.after(f.cleanup);
  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '测试中途失败保留已知消耗',
    confirmed: true
  }, 'b2-failure-accounting');
  await harness.settled(started.id);

  const failed = harness.get(human, started.id);
  assert.equal(failed.state, 'failed');
  assert.equal(failed.stopReason, 'OUTPUT_BUDGET');
  assert.equal(failed.calls, 2, '失败前已发生 2 次模型请求');
  assert.equal(failed.metrics?.toolCallsCount, 1, '失败前已执行 1 次工具');
  assert.ok((failed.metrics?.inputBytes ?? 0) > (failed.snapshot?.bytes ?? 0) * 2, '失败后仍须保留 2 次请求的累计 inputBytes');
  assert.ok((failed.metrics?.outputBytes ?? 0) > 250, '失败后仍须保留第 1 步与第 2 步实际已接收到的 outputBytes，不能丢回 0');
});

test('Batch 2 反例 4：独立 executionId 隔离——超时后的旧执行迟到回调绝不能污染恢复后的新执行账本或候选', async t => {
  const exec1Entered = deferred<void>();
  const exec1LateRelease = deferred<ModelStepOutput>();
  const exec2Entered = deferred<void>();
  const exec2Release = deferred<ModelStepOutput>();

  let invocation = 0;
  const uncooperativeModel: ModelPort = {
    name: 'uncooperative-late-model',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('unused'); },
    async step(): Promise<ModelStepOutput> {
      invocation += 1;
      if (invocation === 1) {
        exec1Entered.resolve();
        // Deliberately ignore AbortSignal to simulate an uncooperative in-flight request resolving late!
        return exec1LateRelease.promise;
      }
      exec2Entered.resolve();
      return exec2Release.promise;
    }
  };

  const toolExecutor = async (call: ToolCallRequest): Promise<ToolCallResult> => ({
    callId: call.id,
    toolName: call.name,
    output: `executed ${call.id}`
  });

  // Set short timeout for Execution 1 (25ms), then override higher timeout via custom runtime or sufficient time for Execution 2
  const f = harnessFixture(uncooperativeModel, { timeoutMs: 30, maxCalls: 6, maxInputBytes: 65536 });
  t.after(f.cleanup);
  const harness = f.open();
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.tools = mockTools;
  (harness as unknown as { dependencies: { tools: ToolDefinition[]; toolExecutor: typeof toolExecutor } }).dependencies.toolExecutor = toolExecutor;

  // Start Execution 1 -> times out after 30ms into state 'interrupted' (MODEL_TIMEOUT is recoverable)
  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '测试旧执行迟到污染隔离',
    confirmed: true
  }, 'b2-exec-isolation');

  await exec1Entered.promise;
  await harness.settled(started.id);

  const timedOut = harness.get(human, started.id);
  assert.equal(timedOut.state, 'interrupted');
  assert.equal(timedOut.stopReason, 'MODEL_TIMEOUT');
  const firstExecutionId = timedOut.executionId;
  assert.ok(firstExecutionId, '每次执行必须拥有独立 executionId');

  // Bump limits.timeoutMs on dependencies before resuming Execution 2 so Execution 2 stays in 'running' while Execution 1 resolves late!
  (harness as unknown as { dependencies: { limits: { timeoutMs: number } } }).dependencies.limits = { timeoutMs: 5000 };
  // Also update persisted run limits timeoutMs via resume or high enough window: 30ms is plenty for synchronous microtask test, let's resolve within 5ms!
  const resumed = harness.resume(human, timedOut.id, { revision: timedOut.revision, confirmed: true });
  assert.equal(resumed.state, 'running');
  assert.notEqual(resumed.executionId, firstExecutionId, '新一次恢复执行必须生成全新的 executionId');

  await exec2Entered.promise;

  // WHILE Execution 2 is actively in state === 'running', Execution 1 resolves late with a rogue tool_call!
  exec1LateRelease.resolve({
    kind: 'tool_calls',
    toolCalls: [{ id: 'rogue_late_call_from_exec_1', name: 'read_file', arguments: { path: 'rogue.ts' } }]
  });
  // Flush microtasks so Execution 1's late continuation attempts to checkpoint turns
  await new Promise(resolve => setTimeout(resolve, 5));

  // Now finish Execution 2 cleanly with a valid candidate
  exec2Release.resolve({
    kind: 'candidate',
    candidate: {
      type: 'append_context',
      requirementId: 'REQ-HARNESS-1',
      category: 'assumption',
      epistemicStatus: 'proposed',
      content: '来自第 2 次合法执行的干净候选',
      sourceRefs: []
    }
  });
  await harness.settled(resumed.id);

  const finalRun = harness.get(human, resumed.id);
  assert.equal(finalRun.state, 'waiting_human');
  const hasRogueTurn = (finalRun.turns ?? []).some(
    turn => turn.toolCallId === 'rogue_late_call_from_exec_1' ||
      turn.toolCalls?.some(c => c.id === 'rogue_late_call_from_exec_1')
  );
  assert.equal(hasRogueTurn, false, '旧执行的迟到结果绝不能写入新执行的步骤账本');
  assert.equal(finalRun.candidate?.type, 'append_context');
  if (finalRun.candidate?.type === 'append_context') {
    assert.equal(finalRun.candidate.content, '来自第 2 次合法执行的干净候选');
  }
});
