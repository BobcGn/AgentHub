import { HubError } from '../domain/board.js';
import type { ContextSnapshot, ModelPort, ModelStepInput, ModelStepOutput, RunTurn, ToolCallRequest, ToolCallResult, ToolDefinition } from '../domain/harness.js';

export interface TurnCheckpointMeta {
  toolExecuted?: boolean;
}

export interface LoopOptions {
  model: ModelPort;
  snapshot: ContextSnapshot;
  tools?: ToolDefinition[] | undefined;
  toolExecutor?: ((call: ToolCallRequest) => Promise<ToolCallResult>) | undefined;
  initialTurns?: RunTurn[] | undefined;
  priorToolCallsCount?: number | undefined;
  onTurnCheckpoint?: ((turn: RunTurn, turns: RunTurn[], meta?: TurnCheckpointMeta) => Promise<void> | void) | undefined;
  onBeforeModelRequest?: ((info: { requestBytes: number; hasToolTurns: boolean }) => Promise<void> | void) | undefined;
  onAfterModelResponse?: ((info: { responseBytes: number }) => Promise<void> | void) | undefined;
  signal: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
  maxToolCalls?: number | undefined;
}

export interface LoopResult {
  candidate: unknown;
  turns: RunTurn[];
  outputBytes: number;
  toolCallsCount: number;
}

/**
 * 计算单次 step 请求实际发送的 UTF-8 字节数（覆盖上下文快照、历史步骤账本/工具结果及工具 Schema）。
 * 注：此为确定性 UTF-8 字节预算，不同于模型分词器的 Token 估算值。
 */
export function measureStepPayloadBytes(model: ModelPort, stepInput: ModelStepInput): number {
  if (typeof model.measureStepInputBytes === 'function') {
    return model.measureStepInputBytes(stepInput);
  }
  return Buffer.byteLength(JSON.stringify(stepInput), 'utf8');
}

export function measureProposePayloadBytes(model: ModelPort, snapshot: ContextSnapshot): number {
  if (typeof model.measureProposeInputBytes === 'function') {
    return model.measureProposeInputBytes(snapshot);
  }
  return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
}

export function buildProposeFallbackSnapshot(snapshot: ContextSnapshot, turns: RunTurn[]): ContextSnapshot {
  const proposeSnapshot = structuredClone(snapshot);
  if (turns.length > 0) {
    const callMap = new Map<string, ToolCallRequest>();
    for (const t of turns) {
      if (t.role === 'assistant' && t.toolCalls) {
        for (const c of t.toolCalls) callMap.set(c.id, c);
      }
    }
    const inheritedEntries = turns
      .filter(t => t.role === 'tool')
      .map(t => {
        const call = t.toolCallId ? callMap.get(t.toolCallId) : undefined;
        const label = call ? `${call.name}(${JSON.stringify(call.arguments)}) [${t.toolCallId}]` : (t.toolCallId ?? 'tool');
        return `  - [INHERITED TOOL RESULT ${label}]: ${t.content ?? ''}`;
      });
    proposeSnapshot.focusOutline = [...(proposeSnapshot.focusOutline ?? []), ...inheritedEntries];
    proposeSnapshot.bytes = Buffer.byteLength(JSON.stringify({ ...proposeSnapshot, bytes: 0, hash: '' }), 'utf8');
  }
  return proposeSnapshot;
}

export function countPendingToolCalls(turns: RunTurn[]): number {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn && turn.role === 'assistant' && turn.toolCalls && turn.toolCalls.length > 0) {
      const existingToolCallIds = new Set(
        turns.slice(i + 1).filter(t => t.role === 'tool' && t.toolCallId).map(t => t.toolCallId)
      );
      return turn.toolCalls.filter(c => !existingToolCallIds.has(c.id)).length;
    }
  }
  return 0;
}

export async function requestCandidate(
  model: ModelPort,
  snapshot: ContextSnapshot,
  parent: AbortSignal,
  timeoutMs: number,
  maxOutputBytes: number,
  options?: Partial<LoopOptions>
): Promise<LoopResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;

  const stopped = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new HubError(409, 'RUN_CANCELLED', '运行已取消。')); };
    parent.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      controller.abort(); reject(new HubError(408, 'MODEL_TIMEOUT', '模型步骤超时，晚到结果不会应用。'));
    }, timeoutMs);
  });

  try {
    if (parent.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
    const loopPromise = executeLoop({
      model,
      snapshot,
      tools: options?.tools ?? [],
      toolExecutor: options?.toolExecutor,
      initialTurns: options?.initialTurns,
      priorToolCallsCount: options?.priorToolCallsCount ?? 0,
      onTurnCheckpoint: options?.onTurnCheckpoint,
      onBeforeModelRequest: options?.onBeforeModelRequest,
      onAfterModelResponse: options?.onAfterModelResponse,
      signal: controller.signal,
      timeoutMs,
      maxOutputBytes,
      maxToolCalls: options?.maxToolCalls ?? 5
    });
    // Suppress unhandled rejection if loopPromise rejects after Promise.race has already settled on timeout/abort
    void loopPromise.catch(() => { /* handled via Promise.race or executionId guard */ });
    return await Promise.race([loopPromise, stopped]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) parent.removeEventListener('abort', abort);
  }
}

async function reconcilePendingToolTurns(
  turns: RunTurn[],
  priorToolCallsCount: number,
  toolExecutor: ((call: ToolCallRequest) => Promise<ToolCallResult>) | undefined,
  maxToolCalls: number,
  onTurnCheckpoint: ((turn: RunTurn, turns: RunTurn[], meta?: TurnCheckpointMeta) => Promise<void> | void) | undefined,
  signal: AbortSignal
): Promise<number> {
  let deltaToolCalls = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn && turn.role === 'assistant' && turn.toolCalls && turn.toolCalls.length > 0) {
      const existingToolCallIds = new Set(
        turns.slice(i + 1).filter(t => t.role === 'tool' && t.toolCallId).map(t => t.toolCallId)
      );
      const pendingCalls = turn.toolCalls.filter(c => !existingToolCallIds.has(c.id));
      for (const call of pendingCalls) {
        if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        if (priorToolCallsCount + deltaToolCalls >= maxToolCalls) {
          const toolTurn: RunTurn = {
            sequence: turns.length + 1,
            role: 'tool',
            content: `错误: 已达到单轮最大工具调用预算 (${maxToolCalls} 次)。`,
            toolCallId: call.id
          };
          turns.push(toolTurn);
          await onTurnCheckpoint?.(toolTurn, turns, { toolExecuted: false });
          continue;
        }
        if (!toolExecutor) {
          const toolTurn: RunTurn = {
            sequence: turns.length + 1,
            role: 'tool',
            content: '错误: 工具执行器未提供。',
            toolCallId: call.id
          };
          turns.push(toolTurn);
          await onTurnCheckpoint?.(toolTurn, turns, { toolExecuted: false });
          continue;
        }

        const result = await toolExecutor(call);
        if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        deltaToolCalls += 1;

        const toolTurn: RunTurn = {
          sequence: turns.length + 1,
          role: 'tool',
          content: result.error ? `错误: ${result.error}` : result.output,
          toolCallId: call.id
        };
        turns.push(toolTurn);
        await onTurnCheckpoint?.(toolTurn, turns, { toolExecuted: true });
      }
      break;
    }
  }
  return deltaToolCalls;
}

async function executeLoop(options: LoopOptions): Promise<LoopResult> {
  const {
    model,
    snapshot,
    tools = [],
    toolExecutor,
    priorToolCallsCount = 0,
    onTurnCheckpoint,
    onBeforeModelRequest,
    onAfterModelResponse,
    signal,
    maxOutputBytes,
    maxToolCalls = 5
  } = options;
  const turns: RunTurn[] = options.initialTurns ? structuredClone(options.initialTurns) : [];
  let deltaOutputBytes = 0;

  // 先对账初始 turns 中的未完成工具调用，仅对本次新补齐执行的工具计数（不重复计入已完成历史工具轮次）
  let deltaToolCalls = await reconcilePendingToolTurns(
    turns,
    priorToolCallsCount,
    toolExecutor,
    maxToolCalls,
    onTurnCheckpoint,
    signal
  );

  // If model does not support step, fall back to direct propose while preserving full inherited turns within explicit byte budget
  if (!model.step) {
    const proposeSnapshot = buildProposeFallbackSnapshot(snapshot, turns);
    const requestBytes = measureProposePayloadBytes(model, proposeSnapshot);
    const hasToolTurns = turns.some(t => t.role === 'tool');
    await onBeforeModelRequest?.({ requestBytes, hasToolTurns });
    if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');

    const output = await Promise.resolve().then(() => model.propose(proposeSnapshot, signal));
    if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
    const json = JSON.stringify(output);
    if (json === undefined) throw new HubError(400, 'INVALID_CANDIDATE', '模型没有返回结构化候选。');
    const bytes = Buffer.byteLength(json, 'utf8');
    deltaOutputBytes += bytes;
    await onAfterModelResponse?.({ responseBytes: bytes });
    if (deltaOutputBytes > maxOutputBytes) throw new HubError(413, 'OUTPUT_BUDGET', '模型输出超过预算。');
    if (turns.length > 0) {
      const finalTurn: RunTurn = {
        sequence: turns.length + 1,
        role: 'assistant',
        content: json
      };
      turns.push(finalTurn);
      await onTurnCheckpoint?.(finalTurn, turns, { toolExecuted: false });
    }
    return { candidate: JSON.parse(json) as unknown, turns, outputBytes: deltaOutputBytes, toolCallsCount: deltaToolCalls };
  }

  while (true) {
    if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
    const stepRemainingBudget = Math.max(0, maxOutputBytes - deltaOutputBytes);
    const stepInput: ModelStepInput = {
      snapshot: structuredClone(snapshot),
      tools: structuredClone(tools),
      turns: structuredClone(turns),
      maxOutputBytes: stepRemainingBudget
    };
    const requestBytes = measureStepPayloadBytes(model, stepInput);
    const hasToolTurns = turns.some(t => t.role === 'tool');
    await onBeforeModelRequest?.({ requestBytes, hasToolTurns });
    if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');

    let stepOutput: ModelStepOutput;
    try {
      stepOutput = await model.step(stepInput, signal);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'bytesRead' in err && typeof (err as { bytesRead?: unknown }).bytesRead === 'number') {
        const consumedBytes = (err as { bytesRead: number }).bytesRead;
        if (consumedBytes > 0) {
          deltaOutputBytes += consumedBytes;
          await onAfterModelResponse?.({ responseBytes: consumedBytes });
        }
      }
      throw err;
    }
    if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');

    if (stepOutput.kind === 'candidate') {
      const json = JSON.stringify(stepOutput.candidate);
      if (json === undefined) throw new HubError(400, 'INVALID_CANDIDATE', '模型没有返回结构化候选。');
      const candidateBytes = Buffer.byteLength(json, 'utf8');
      const stepBytes = stepOutput.rawResponseBytes ?? candidateBytes;
      deltaOutputBytes += stepBytes;
      await onAfterModelResponse?.({ responseBytes: stepBytes });
      if (deltaOutputBytes > maxOutputBytes) throw new HubError(413, 'OUTPUT_BUDGET', '模型输出超过预算。');

      const finalTurn: RunTurn = {
        sequence: turns.length + 1,
        role: 'assistant',
        content: json
      };
      turns.push(finalTurn);
      await onTurnCheckpoint?.(finalTurn, turns, { toolExecuted: false });

      return { candidate: JSON.parse(json) as unknown, turns, outputBytes: deltaOutputBytes, toolCallsCount: deltaToolCalls };
    }

    if (stepOutput.kind === 'tool_calls') {
      if (stepOutput.toolCalls.length === 0) {
        throw new HubError(400, 'INVALID_CANDIDATE', '模型未返回候选也未返回有效的工具调用。');
      }

      const callsBytes = stepOutput.rawResponseBytes ?? Buffer.byteLength(JSON.stringify(stepOutput.toolCalls), 'utf8');
      deltaOutputBytes += callsBytes;
      await onAfterModelResponse?.({ responseBytes: callsBytes });
      if (deltaOutputBytes > maxOutputBytes) throw new HubError(413, 'OUTPUT_BUDGET', '模型输出超过预算。');

      // Record assistant tool-calls turn
      const assistantTurn: RunTurn = {
        sequence: turns.length + 1,
        role: 'assistant',
        toolCalls: stepOutput.toolCalls
      };
      turns.push(assistantTurn);
      await onTurnCheckpoint?.(assistantTurn, turns, { toolExecuted: false });

      // Execute each tool call
      for (const call of stepOutput.toolCalls) {
        if (priorToolCallsCount + deltaToolCalls >= maxToolCalls) {
          throw new HubError(409, 'TOOL_BUDGET_EXCEEDED', `已达到单轮最大工具调用预算 (${maxToolCalls} 次)。`);
        }
        if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        if (!toolExecutor) {
          throw new HubError(400, 'TOOL_EXECUTOR_UNAVAILABLE', '工具执行器未提供。');
        }

        const result = await toolExecutor(call);
        if (signal.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        deltaToolCalls += 1;

        const toolTurn: RunTurn = {
          sequence: turns.length + 1,
          role: 'tool',
          content: result.error ? `错误: ${result.error}` : result.output,
          toolCallId: call.id
        };
        turns.push(toolTurn);
        await onTurnCheckpoint?.(toolTurn, turns, { toolExecuted: true });
      }
    }
  }
}
