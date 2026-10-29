import { HubError } from '../../domain/board.js';
import type { ContextSnapshot, ModelPort, ModelStepInput, ModelStepOutput, RuntimeProviderKind, ToolCallRequest, ToolDefinition } from '../../domain/harness.js';

export interface ProviderOptions {
  id?: string;
  name?: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxOutputBytes?: number;
}

async function readStreamBounded(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal
): Promise<{ text: string; bytesRead: number }> {
  if (!response.body) {
    return { text: '', bytesRead: 0 };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  const decoder = new TextDecoder('utf-8');

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel('Aborted');
        const err = new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        (err as unknown as { bytesRead: number }).bytesRead = bytesRead;
        throw err;
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel('Response exceeded max output bytes');
          const err = new HubError(413, 'RESPONSE_SIZE_EXCEEDED', `模型响应体大小超过上限 (${maxBytes} 字节)。`);
          (err as unknown as { bytesRead: number }).bytesRead = bytesRead;
          throw err;
        }
        chunks.push(value);
      }
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && !('bytesRead' in err)) {
      (err as { bytesRead?: number }).bytesRead = bytesRead;
    }
    if (err instanceof HubError) throw err;
    try { await reader.cancel(); } catch { /* ignore */ }
    throw err;
  }

  const totalBuffer = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    totalBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: decoder.decode(totalBuffer), bytesRead };
}

export class OpenAiCompatibleProvider implements ModelPort {
  readonly name: string;
  readonly providerKind: RuntimeProviderKind;
  readonly endpoint: string;
  readonly maxOutputBytes?: number | undefined;
  protected readonly apiModel: string;
  protected readonly apiKey: string;
  protected readonly baseUrl: string;

  constructor(
    options: ProviderOptions,
    defaultModel: string = 'openai-generic',
    defaultBaseUrl: string = 'https://api.openai.com/v1',
    providerKind: RuntimeProviderKind = 'openai-compatible'
  ) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new HubError(400, 'INVALID_API_KEY', '模型 API Key 不能为空。');
    }
    this.name = options.model?.trim() || options.name?.trim() || defaultModel;
    this.providerKind = providerKind;
    this.apiModel = this.resolveApiModel(this.name);
    this.apiKey = options.apiKey.trim();
    this.baseUrl = (options.baseUrl?.trim() || defaultBaseUrl).replace(/\/+$/, '');
    this.endpoint = this.baseUrl;
    this.maxOutputBytes = options.maxOutputBytes;
  }

  protected resolveApiModel(modelName: string): string {
    return modelName.trim();
  }

  protected buildSystemPrompt(snapshot: ContextSnapshot, tools: ToolDefinition[]): string {
    const toolDescriptions = tools.length > 0
      ? `\nAvailable Tools:\nYou have access to read-only workspace tools to inspect code and directory structure before concluding. Call tools when you need to inspect files. When you have collected enough evidence or if no tools are needed, return the final candidate JSON.`
      : '';
    const outlineDesc = snapshot.focusOutline && snapshot.focusOutline.length > 0
      ? `\nProject Outline & Focus:\n${snapshot.focusOutline.join('\n')}\n`
      : '';

    return `You are an untrusted AI analytical assistant working inside AgentHub, an AI-DLC development harness.
Your role is to strictly analyze the given requirement, instruction, and available context items/sources.
You do NOT have authority to approve, complete, or make formal decisions.
Items marked [DONE] are verified immutable baselines; do NOT re-implement or modify them.
Focus strictly on the [ACTIVE TARGET] requirement indicated.${outlineDesc}${toolDescriptions}

When providing your final answer, you MUST respond with a single valid JSON object matching one of the following candidate action schemas according to the instruction:

1. append_context (for questions, assumptions, or architectural decisions):
{
  "type": "append_context",
  "requirementId": "${snapshot.requirementId}",
  "category": "open_question" | "assumption" | "decision",
  "epistemicStatus": "unknown" | "proposed",
  "content": "Description of the open question, assumption, or decision trade-off (max 4000 chars)",
  "sourceRefs": ["source-id-1", ...]
}

2. propose_criteria (for refining/supplementing acceptance criteria):
{
  "type": "propose_criteria",
  "requirementId": "${snapshot.requirementId}",
  "acceptanceCriteria": [
    {
      "id": "crit-1",
      "description": "Given ... When ... Then ...",
      "verification": "How to verify"
    }
  ],
  "sourceRefs": ["source-id-1", ...]
}

3. propose_decomposition (for breaking down requirement into Unit and Story drafts):
{
  "type": "propose_decomposition",
  "requirementId": "${snapshot.requirementId}",
  "units": [ ...Unit drafts with status="draft", result=null, requirementId="${snapshot.requirementId}"... ],
  "stories": [ ...Story drafts with status="draft", result=null, requirementId="${snapshot.requirementId}"... ],
  "sourceRefs": ["source-id-1", ...]
}

4. propose_bolt_plan (for proposing construction phases and story sequencing):
{
  "type": "propose_bolt_plan",
  "requirementId": "${snapshot.requirementId}",
  "boltPlan": { ...BoltPlan draft with status="draft", result=null, requirementId="${snapshot.requirementId}"... },
  "sourceRefs": ["source-id-1", ...]
}

CRITICAL RULES:
1. "requirementId" MUST be exactly "${snapshot.requirementId}".
2. For append_context: if category is "open_question", epistemicStatus MUST be "unknown"; if "decision", epistemicStatus MUST be "proposed".
3. For units, stories, and boltPlan: status MUST be "draft" and result MUST be null.
4. "sourceRefs" must only contain source IDs that explicitly exist in the provided sources list.
5. Output raw JSON only for the final candidate. Do NOT wrap in markdown formatting (no \`\`\`json) or include any explanatory text outside the JSON.`;
  }

  protected buildUserPrompt(snapshot: ContextSnapshot): string {
    return JSON.stringify({
      instruction: snapshot.instruction,
      focusOutline: snapshot.focusOutline,
      intent: {
        title: snapshot.intent.title,
        problem: snapshot.intent.problem,
        expectedOutcome: snapshot.intent.expectedOutcome,
        scope: snapshot.intent.scope,
        constraints: snapshot.intent.constraints
      },
      requirement: {
        id: snapshot.requirement.id,
        title: snapshot.requirement.title,
        problem: snapshot.requirement.problem,
        expectedOutcome: snapshot.requirement.expectedOutcome,
        scope: snapshot.requirement.scope,
        constraints: snapshot.requirement.constraints,
        rationale: snapshot.requirement.rationale,
        expectedImpact: snapshot.requirement.expectedImpact,
        acceptanceCriteria: snapshot.requirement.acceptanceCriteria,
        sourceRefs: snapshot.requirement.sourceRefs
      },
      contextItems: snapshot.contextItems.map(item => ({
        id: item.id,
        category: item.category,
        epistemicStatus: item.epistemicStatus,
        content: item.content,
        sourceRefs: item.sourceRefs
      })),
      availableSources: snapshot.sources.map(source => ({
        id: source.id,
        kind: source.kind,
        locator: source.locator,
        excerpt: source.excerpt
      }))
    }, null, 2);
  }

  protected formatTools(tools: ToolDefinition[]): Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  protected mapHttpError(status: number, errorText: string): HubError {
    if (status === 401) {
      return new HubError(401, 'PROVIDER_AUTH_ERROR', `${this.name} API Key 无效或未授权。`);
    }
    if (status === 429) {
      return new HubError(429, 'PROVIDER_RATE_LIMIT', `${this.name} API 请求频率过高或余额不足。`);
    }
    return new HubError(502, 'PROVIDER_API_ERROR', `${this.name} API 返回错误 (${status}): ${errorText.slice(0, 300)}`);
  }

  protected cleanCandidateJson(content: string): unknown {
    const trimmed = content.trim();
    const cleanJson = trimmed.startsWith('```')
      ? trimmed.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '').trim()
      : trimmed;

    try {
      return JSON.parse(cleanJson);
    } catch {
      throw new HubError(400, 'INVALID_CANDIDATE', `无法将模型输出解析为 JSON: ${cleanJson.slice(0, 100)}`);
    }
  }

  protected buildRequestPayload(input: ModelStepInput): Record<string, unknown> {
    const messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool';
      content?: string | null;
      tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
      tool_call_id?: string;
    }> = [
      { role: 'system', content: this.buildSystemPrompt(input.snapshot, input.tools) },
      { role: 'user', content: this.buildUserPrompt(input.snapshot) }
    ];

    const hasActiveTools = input.tools.length > 0;
    for (const turn of input.turns) {
      if (turn.role === 'assistant') {
        if (hasActiveTools) {
          const toolCalls = turn.toolCalls?.map(call => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: JSON.stringify(call.arguments) }
          }));
          messages.push({
            role: 'assistant',
            content: turn.content ?? null,
            ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
          });
        } else {
          const callSummary = turn.toolCalls && turn.toolCalls.length > 0
            ? `[Inherited Tool Calls]: ${turn.toolCalls.map(c => `${c.name}(${JSON.stringify(c.arguments)}) [id=${c.id}]`).join('; ')}`
            : '';
          messages.push({
            role: 'assistant',
            content: [turn.content, callSummary].filter(Boolean).join('\n') || '[Assistant Step]'
          });
        }
      } else if (turn.role === 'tool') {
        if (hasActiveTools) {
          messages.push({
            role: 'tool',
            content: turn.content ?? '',
            ...(turn.toolCallId ? { tool_call_id: turn.toolCallId } : {})
          });
        } else {
          messages.push({
            role: 'user',
            content: `[Inherited Tool Output (callId=${turn.toolCallId ?? 'unknown'})]:\n${turn.content ?? ''}`
          });
        }
      } else if (turn.role === 'user') {
        messages.push({
          role: 'user',
          content: turn.content ?? ''
        });
      }
    }

    const bodyPayload: Record<string, unknown> = {
      model: this.apiModel,
      messages,
      temperature: 0.2
    };

    if (input.tools.length > 0) {
      bodyPayload['tools'] = this.formatTools(input.tools);
    } else {
      bodyPayload['response_format'] = { type: 'json_object' };
    }
    return bodyPayload;
  }

  /**
   * 精确计算每次 HTTP 请求实际发送的 UTF-8 字节数（包含系统提示词、快照、历史工具账本及工具定义）。
   * 注意：该指标为确定性 UTF-8 字节预算计量，不冒充各厂商分词器的 Token 计费数量。
   */
  measureStepInputBytes(input: ModelStepInput): number {
    return Buffer.byteLength(JSON.stringify(this.buildRequestPayload(input)), 'utf8');
  }

  measureProposeInputBytes(snapshot: ContextSnapshot): number {
    return this.measureStepInputBytes({ snapshot, tools: [], turns: [] });
  }

  async step(input: ModelStepInput, signal: AbortSignal): Promise<ModelStepOutput> {
    const bodyPayload = this.buildRequestPayload(input);
    const serializedBody = JSON.stringify(bodyPayload);

    const cleanBase = this.baseUrl.replace(/\/+$/, '');
    const url = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: serializedBody,
        redirect: 'manual',
        signal
      });
    } catch (err: unknown) {
      if (signal.aborted) {
        throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
      }
      const message = err instanceof Error ? err.message : String(err);
      const causeMsg = err instanceof Error && 'cause' in err && (err as { cause?: { message?: string } }).cause?.message;
      if (message.includes('redirect') || (causeMsg && causeMsg.includes('redirect'))) {
        throw new HubError(403, 'REDIRECT_NOT_ALLOWED', '模型服务商端点返回重定向，已拒绝自动重定向。');
      }
      throw new HubError(502, 'PROVIDER_NETWORK_ERROR', `连接 ${this.name} API 失败: ${message}`);
    }

    if (response.status >= 300 && response.status < 400) {
      throw new HubError(403, 'REDIRECT_NOT_ALLOWED', `模型服务商端点返回重定向 (${response.status})，已拒绝自动重定向。`);
    }

    const effectiveMax = Math.min(
      this.maxOutputBytes ?? Infinity,
      input.maxOutputBytes ?? Infinity
    );
    const maxBytes = Number.isFinite(effectiveMax) ? effectiveMax : 10 * 1024 * 1024;

    if (!response.ok) {
      let errorText = '';
      let errorBytesRead = 0;
      const errorMax = Math.min(4096, maxBytes);
      try {
        const errorRead = await readStreamBounded(response, errorMax, signal);
        errorText = errorRead.text;
        errorBytesRead = errorRead.bytesRead;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'bytesRead' in err) {
          errorBytesRead = Number((err as { bytesRead: unknown }).bytesRead) || 0;
        }
        if (err instanceof HubError && err.code === 'RESPONSE_SIZE_EXCEEDED') {
          throw err;
        }
        if (signal.aborted) {
          throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        }
        errorText = '';
      }
      const mapped = this.mapHttpError(response.status, errorText);
      (mapped as unknown as { bytesRead: number }).bytesRead = errorBytesRead;
      throw mapped;
    }

    const { text: responseText, bytesRead } = await readStreamBounded(response, maxBytes, signal);

    let resultJson: unknown;
    try {
      resultJson = JSON.parse(responseText);
    } catch {
      const err = new HubError(502, 'PROVIDER_BAD_RESPONSE', `${this.name} 返回的响应不是有效 JSON。`);
      (err as unknown as { bytesRead: number }).bytesRead = bytesRead;
      throw err;
    }

    const payload = resultJson as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
        };
        finish_reason?: string;
      }>;
    };

    const choice = payload.choices?.[0]?.message;
    if (!choice) {
      const err = new HubError(502, 'PROVIDER_EMPTY_RESPONSE', `${this.name} 没有返回有效的选择。`);
      (err as unknown as { bytesRead: number }).bytesRead = bytesRead;
      throw err;
    }

    // Check if the model requested tool calls
    if (choice.tool_calls && choice.tool_calls.length > 0) {
      const toolCalls: ToolCallRequest[] = [];
      for (const call of choice.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = typeof call.function.arguments === 'string' && call.function.arguments.trim()
            ? JSON.parse(call.function.arguments) as Record<string, unknown>
            : {};
        } catch {
          args = {};
        }
        toolCalls.push({
          id: call.id,
          name: call.function.name,
          arguments: args
        });
      }
      return { kind: 'tool_calls', toolCalls, rawResponseBytes: bytesRead };
    }

    // Otherwise it returned content (the candidate)
    const content = choice.content;
    if (typeof content !== 'string' || !content.trim()) {
      const err = new HubError(502, 'PROVIDER_EMPTY_RESPONSE', `${this.name} 没有返回有效的候选内容。`);
      (err as unknown as { bytesRead: number }).bytesRead = bytesRead;
      throw err;
    }

    try {
      return { kind: 'candidate', candidate: this.cleanCandidateJson(content), rawResponseBytes: bytesRead };
    } catch (err: unknown) {
      if (err && typeof err === 'object') {
        (err as { bytesRead?: number }).bytesRead = bytesRead;
      }
      throw err;
    }
  }

  async propose(snapshot: ContextSnapshot, signal: AbortSignal): Promise<unknown> {
    const res = await this.step({ snapshot, tools: [], turns: [] }, signal);
    if (res.kind === 'candidate') {
      return res.candidate;
    }
    throw new HubError(400, 'INVALID_CANDIDATE', '模型在无工具请求下未返回候选。');
  }
}
