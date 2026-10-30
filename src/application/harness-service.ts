import { createHash, randomUUID } from 'node:crypto';
import { fail, HubError, object, requireHuman, textField, versionField } from '../domain/board.js';
import type { Principal } from '../domain/board.js';
import type { RecordProject, RecordProjectRepository } from '../domain/record-project.js';
import type { RecordStructureValidator, ContextItemRecord, SourceRecord } from '../domain/record-contract.js';
import { WorkspaceToolExecutor, WORKSPACE_TOOLS_DEFINITIONS } from '../infrastructure/workspace-tools.js';
import type { CandidateValidator, ContextCandidate, HarnessRun, ModelPort, ModelRuntimeBinding, ModelRuntimeConfig, RunForkInfo, RunLimits, RunMetrics, RunRepository, ToolCallRequest, ToolCallResult, ToolDefinition } from '../domain/harness.js';
import type { RecordProjectService } from './record-project-service.js';
import { validateRecordSet } from './record-validation.js';
import { areCriteriaEqual, simulateCandidateMutation } from '../domain/record-candidate-mutations.js';
import { buildContext } from '../harness/context.js';
import {
  buildProposeFallbackSnapshot,
  countPendingToolCalls,
  measureProposePayloadBytes,
  measureStepPayloadBytes,
  requestCandidate
} from '../harness/loop.js';
import { RuntimeRegistry, type ResolvedRuntime } from '../infrastructure/providers/runtime-registry.js';

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const at = (): string => new Date().toISOString();
const defaultLimits: RunLimits = { maxInputBytes: 65536, maxOutputBytes: 16384, timeoutMs: 45000, maxCalls: 8, maxToolCalls: 5 };
interface Dependencies {
  runs: RunRepository; projects: RecordProjectRepository; records: RecordProjectService;
  validator: RecordStructureValidator; candidates: CandidateValidator; model: ModelPort;
  runtimes?: RuntimeRegistry;
  protectedPaths?: string[];
  tools?: ToolDefinition[];
  toolExecutor?: (call: ToolCallRequest) => Promise<ToolCallResult>;
  limits?: Partial<RunLimits>; notify?: () => void;
}
export class HarnessService {
  private readonly dependencies: Dependencies;
  private readonly runtimes: RuntimeRegistry;
  private readonly active = new Map<string, { executionId: string; controller: AbortController; promise: Promise<void> }>();
  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
    this.runtimes = dependencies.runtimes ?? new RuntimeRegistry();
    this.runtimes.registerDefaultPort(dependencies.model);
    for (const run of dependencies.runs.list()) if (run.state === 'running' || run.state === 'applying') {
      this.update(run, 'process_interrupted', { previousState: run.state }, { state: 'interrupted', stopReason: 'process_interrupted' });
    }
  }
  listRuntimes(principal: Principal): ModelRuntimeConfig[] {
    requireHuman(principal);
    return this.runtimes.list();
  }
  saveRuntime(principal: Principal, input: unknown): ModelRuntimeConfig {
    requireHuman(principal);
    const saved = this.runtimes.save(input);
    this.dependencies.notify?.();
    return saved;
  }
  registerModelPort(id: string, port: ModelPort): void {
    this.runtimes.registerPort(id, port);
  }
  private update(run: HarnessRun, type: string, details: Record<string, unknown>, patch: Partial<HarnessRun> = {}): HarnessRun {
    const next: HarnessRun = { ...run, ...patch, revision: run.revision + 1,
      events: [...run.events, { sequence: run.events.length + 1, at: at(), type, details }] };
    this.dependencies.runs.replace(next, run.revision); this.dependencies.notify?.(); return next;
  }
  onChange(notify: () => void): void { this.dependencies.notify = notify; }
  private read(id: string): HarnessRun { return this.dependencies.runs.get(id) ?? fail(404, 'RUN_NOT_FOUND', '运行不存在。'); }
  private project(run: HarnessRun, checkRevision = true): RecordProject {
    if (!run.authorization.active || (!Number.isFinite(Date.parse(run.authorization.expiresAt)) || Date.parse(run.authorization.expiresAt) <= Date.now())) fail(403, 'RUN_AUTHORIZATION_EXPIRED', '本次运行授权已撤销或到期，请本人重新核对。');
    const project = this.dependencies.projects.get(run.projectId) ?? fail(404, 'NOT_FOUND', '项目不存在。');
    if (!validateRecordSet(project.records, this.dependencies.validator).valid) fail(409, 'INVALID_RECORD_SET', '当前项目未通过合同校验。');
    if (checkRevision && project.revision !== run.baseRevision) fail(409, 'STALE_RUN_CONTEXT', '项目修订已变化，原候选不能应用，请核对最新记录并另起运行。');
    if (project.records.intent.confirmation.state !== 'human_confirmed' ||
      !project.records.requirements.some(item => item.id === run.requirementId)) fail(403, 'RUN_OUT_OF_SCOPE', '意图未确认或需求已不在本次范围。');
    return project;
  }
  list(principal: Principal, projectId: string): HarnessRun[] {
    requireHuman(principal); this.dependencies.records.get(principal, projectId);
    return this.dependencies.runs.list(projectId);
  }
  get(principal: Principal, id: string): HarnessRun { requireHuman(principal); return this.read(id); }
  private parseWorkspaceAuth(rawWorkspace: unknown): import('../domain/harness.js').WorkspaceAuthorization | null {
    if (rawWorkspace && typeof rawWorkspace === 'object' && !Array.isArray(rawWorkspace)) {
      const w = rawWorkspace as Record<string, unknown>;
      if (w['authorized'] === true) {
        const rawRoot = typeof w['root'] === 'string' && w['root'].trim() ? w['root'].trim() : fail(400, 'INVALID_WORKSPACE_ROOT', '工作区根目录不合法。');
        const parsedReadScope = Array.isArray(w['readScope'])
          ? (w['readScope'] as string[]).filter(s => typeof s === 'string' && s.trim().length > 0)
          : [];
        return {
          authorized: true,
          root: rawRoot,
          readScope: parsedReadScope.length > 0 ? parsedReadScope : ['.'],
          exclude: Array.isArray(w['exclude']) ? (w['exclude'] as string[]).filter(s => typeof s === 'string' && s.trim().length > 0) : [],
          egressScope: typeof w['egressScope'] === 'string' && w['egressScope'] ? w['egressScope'] : 'local_only'
        };
      }
      if (w['authorized'] === false && typeof w['egressScope'] === 'string' && w['egressScope'].trim()) {
        return {
          authorized: false,
          root: '',
          readScope: [],
          exclude: [],
          egressScope: w['egressScope'].trim()
        };
      }
    }
    return null;
  }
  private assertEgressAllowed(
    binding: ModelRuntimeBinding,
    workspace: import('../domain/harness.js').WorkspaceAuthorization | null | undefined,
    hasToolTurns: boolean
  ): void {
    if (binding.external) {
      const egress = workspace?.egressScope;
      const hasWorkspaceData = Boolean(workspace?.authorized) || hasToolTurns;
      if (hasWorkspaceData && egress !== 'internet' && egress !== 'model_api') {
        fail(403, 'EGRESS_OUT_OF_SCOPE', `当前运行外发边界 (${egress ?? 'local_only'}) 未授权向外部公网模型端点 (${binding.endpoint}) 发送工作区或工具账本数据。`);
      }
      if (egress === 'none' || egress === 'local_only') {
        fail(403, 'EGRESS_OUT_OF_SCOPE', `当前运行外发边界 (${egress}) 禁止访问外部公网模型端点 (${binding.endpoint})。`);
      }
    }
  }
  private resolveToolsSchema(workspace: import('../domain/harness.js').WorkspaceAuthorization | null | undefined): ToolDefinition[] {
    if (this.dependencies.tools !== undefined) return this.dependencies.tools;
    if (workspace?.authorized) return WORKSPACE_TOOLS_DEFINITIONS;
    return [];
  }
  private assertNextRequestFitsBudget(
    project: RecordProject,
    requirementId: string,
    instruction: string,
    limits: RunLimits,
    currentCalls: number,
    currentMetrics: RunMetrics,
    targetPort: ModelPort,
    workspace: import('../domain/harness.js').WorkspaceAuthorization | null | undefined,
    turns: import('../domain/harness.js').RunTurn[]
  ): void {
    if (currentCalls >= limits.maxCalls || limits.timeoutMs <= 0) {
      fail(409, 'CALL_BUDGET', '本轮调用预算已耗尽。');
    }
    if (currentMetrics.outputBytes >= limits.maxOutputBytes) {
      fail(413, 'OUTPUT_BUDGET', '模型输出超过预算。');
    }
    const previewSnapshot = buildContext(project, requirementId, instruction, limits.maxInputBytes, digest);
    const tools = this.resolveToolsSchema(workspace);
    const requestBytes = targetPort.step
      ? measureStepPayloadBytes(targetPort, {
          snapshot: previewSnapshot,
          tools: structuredClone(tools),
          turns: structuredClone(turns)
        })
      : measureProposePayloadBytes(targetPort, buildProposeFallbackSnapshot(previewSnapshot, turns));
    const nextInputBytes = currentMetrics.inputBytes + requestBytes;
    if (nextInputBytes > limits.maxInputBytes) {
      fail(413, 'INPUT_BUDGET', `累计请求输入字节数 (${nextInputBytes}B) 超过 UTF-8 字节预算上限 (${limits.maxInputBytes}B)。`);
    }
  }
  start(principal: Principal, projectId: string, input: unknown, requestId: string): HarnessRun {
    requireHuman(principal);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) fail(400, 'INVALID_REQUEST_ID', '运行请求编号不合法。');
    const r = object(input, ['requirementId','baseRevision','instruction','confirmed','workspace','model','runtimeId']);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '须本人确认本次读取及候选范围。');
    const requirementId = textField(r, 'requirementId', 120), instruction = textField(r, 'instruction', 600);
    const baseRevision = versionField(r, 'baseRevision');

    const workspaceAuth = this.parseWorkspaceAuth(r['workspace']);
    const runtimeId = typeof r['runtimeId'] === 'string' && r['runtimeId'].trim() ? r['runtimeId'].trim() : undefined;
    const modelInput = typeof r['model'] === 'string' && r['model'].trim() ? r['model'].trim() : undefined;
    const resolved = this.runtimes.resolve({ runtimeId, model: modelInput });
    this.assertEgressAllowed(resolved.binding, workspaceAuth, false);
    const targetPort = resolved.getPort();
    const hash = digest({
      projectId,
      requirementId,
      instruction,
      baseRevision,
      workspace: workspaceAuth,
      runtime: resolved.binding
    });
    const existing = this.dependencies.runs.list().find(item => item.requestId === requestId);
    if (existing) {
      if (existing.requestHash !== hash) fail(409, 'REQUEST_REUSED', '相同编号不能用于另一运行内容。');
      return existing;
    }
    const project = this.dependencies.records.get(principal, projectId);
    if (project.revision !== baseRevision) fail(409, 'STALE_RUN_CONTEXT', '项目已变化，请重新核对。');
    const now = at();
    const executionId = randomUUID();
    const run: HarnessRun = { schemaVersion: '1.0.0', id: randomUUID(), revision: 1, projectId, requirementId,
      createdAt: now, requestId, requestHash: hash, baseRevision, state: 'running', stopReason: null,
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        operation: 'propose_context',
        workspace: workspaceAuth
      },
      limits: { ...defaultLimits, timeoutMs: resolved.config.timeoutMs, ...this.dependencies.limits },
      model: targetPort.name, runtime: resolved.binding, executionId, calls: 0,
      snapshot: null, metrics: { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 },
      fork: null,
      candidate: null, issues: [], outcome: null, receipt: null, turns: [],
      events: [{ sequence: 1, at: now, type: 'created_by_human', details: { projectId, requirementId, baseRevision, instructionDigest: digest(instruction), workspace: workspaceAuth, model: targetPort.name, runtime: resolved.binding, executionId } }] };
    this.project(run);
    this.dependencies.runs.create(run);
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => this.execute(run.id, executionId, instruction, controller.signal, resolved));
    this.active.set(run.id, { executionId, controller, promise });
    void promise.finally(() => {
      if (this.active.get(run.id)?.executionId === executionId) {
        this.active.delete(run.id);
      }
    }).catch(() => { /* persisted running state is recovered as interrupted */ });
    this.dependencies.notify?.(); return run;
  }
  async settled(id: string): Promise<void> { await this.active.get(id)?.promise; }
  private addition(run: HarnessRun) {
    const sourceId = 'run-source-' + run.id, messageId = 'run-message-' + run.id;
    const sources: SourceRecord[] = [
      { id: sourceId, kind: 'tool_output', locator: 'harness:run/' + run.id + '/candidate',
        excerpt: '候选来自 ' + run.model + '，属于待核对内容，不是实际验收。' },
      { id: messageId, kind: 'message', locator: 'human:run/' + run.id + '/instruction', excerpt: run.snapshot?.instruction ?? null }
    ];
    return { sources, sourceId, messageId };
  }
  private checkedCandidate(run: HarnessRun, value: unknown, project: RecordProject): ContextCandidate {
    const parsed = this.dependencies.candidates.check(value);
    if (!parsed.valid) throw new CandidateError(parsed.issues);
    const candidate = parsed.data;
    if (candidate.requirementId !== run.requirementId) {
      fail(403, 'CANDIDATE_OUT_OF_SCOPE', '候选关联了范围外的需求。');
    }
    const allSourceRefs = new Set<string>(candidate.sourceRefs);
    if (candidate.type === 'propose_decomposition') {
      candidate.units?.forEach(u => u.sourceRefs.forEach(id => allSourceRefs.add(id)));
      candidate.stories.forEach(s => s.sourceRefs.forEach(id => allSourceRefs.add(id)));
    } else if (candidate.type === 'propose_bolt_plan') {
      candidate.boltPlan.sourceRefs.forEach(id => allSourceRefs.add(id));
    }
    for (const id of allSourceRefs) {
      if (!run.snapshot?.sources.some(source => source.id === id)) {
        fail(403, 'CANDIDATE_OUT_OF_SCOPE', '候选引用了未提供给本次模型的来源或范围外来源。');
      }
    }
    const { sources } = this.addition(run);
    const mutation = simulateCandidateMutation(project.records, candidate, sources, run.id);
    const report = validateRecordSet(mutation.records, this.dependencies.validator);
    if (!report.valid) throw new CandidateError(report.issues);
    return candidate;
  }
  private assertActiveExecution(id: string, executionId: string, signal: AbortSignal): HarnessRun {
    const current = this.read(id);
    if (signal.aborted || current.state !== 'running' || current.executionId !== executionId) {
      fail(409, 'RUN_CANCELLED', '当前执行尝试已结束或已被新执行取代。');
    }
    return current;
  }
  private async execute(id: string, executionId: string, instruction: string, signal: AbortSignal, resolvedRuntime: ResolvedRuntime): Promise<void> {
    const startedAt = Date.now();
    try {
      let run = this.read(id);
      if (run.state !== 'running' || run.executionId !== executionId) return;
      const project = this.project(run);
      const snapshot = buildContext(project, run.requirementId, instruction, run.limits.maxInputBytes, digest);
      const initialMetrics: RunMetrics = run.metrics ?? { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
      run = this.update(run, 'context_selected', {
        executionId,
        hash: snapshot.hash,
        bytes: snapshot.bytes,
        omitted: snapshot.omitted,
        budgetKind: 'utf8_bytes'
      }, {
        snapshot,
        metrics: { ...initialMetrics }
      });
      if (run.calls >= run.limits.maxCalls || run.limits.timeoutMs <= 0) fail(409, 'CALL_BUDGET', '本轮调用预算已耗尽。');
      const binding = resolvedRuntime.binding;
      const initialHasToolTurns = (run.turns ?? []).some(t => t.role === 'tool');
      this.assertEgressAllowed(binding, run.authorization.workspace, initialHasToolTurns);
      if (binding.external) {
        const egress = run.authorization.workspace?.egressScope;
        run = this.update(run, 'egress_authorized', {
          executionId,
          runtimeId: binding.id,
          configVersion: binding.configVersion,
          provider: binding.provider,
          model: binding.model,
          endpoint: binding.endpoint,
          egressScope: egress ?? 'model_api'
        });
      }
      const configuredProtectedPaths = [
        ...(this.dependencies.protectedPaths ?? []),
        ...(this.dependencies.runs.storagePath ? [this.dependencies.runs.storagePath] : []),
        ...(this.dependencies.projects.storagePath ? [this.dependencies.projects.storagePath] : [])
      ];
      let tools: ToolDefinition[];
      let toolExecutor: (call: ToolCallRequest) => Promise<ToolCallResult>;
      if (this.dependencies.tools !== undefined) {
        tools = this.dependencies.tools;
        if (this.dependencies.toolExecutor) {
          toolExecutor = this.dependencies.toolExecutor;
        } else if (run.authorization.workspace?.authorized) {
          const executor = new WorkspaceToolExecutor(run.authorization.workspace.root, {
            readScope: run.authorization.workspace.readScope,
            exclude: run.authorization.workspace.exclude,
            protectedPaths: configuredProtectedPaths
          });
          toolExecutor = call => executor.execute(call, signal);
        } else {
          toolExecutor = async call => ({
            callId: call.id,
            toolName: call.name,
            output: '',
            error: '工作区未授权，禁止回退当前进程目录。'
          });
        }
      } else if (run.authorization.workspace?.authorized) {
        tools = WORKSPACE_TOOLS_DEFINITIONS;
        const executor = new WorkspaceToolExecutor(run.authorization.workspace.root, {
          readScope: run.authorization.workspace.readScope,
          exclude: run.authorization.workspace.exclude,
          protectedPaths: configuredProtectedPaths
        });
        toolExecutor = call => executor.execute(call, signal);
      } else {
        tools = [];
        toolExecutor = async call => ({
          callId: call.id,
          toolName: call.name,
          output: '',
          error: '工作区未授权，无工具可用。'
        });
      }
      const activeModel = resolvedRuntime.getPort();
      const priorToolCallsCount = run.metrics?.toolCallsCount ?? 0;
      const remainingOutputBudget = Math.max(0, run.limits.maxOutputBytes - (run.metrics?.outputBytes ?? 0));
      const output = await requestCandidate(
        activeModel,
        snapshot,
        signal,
        run.limits.timeoutMs,
        remainingOutputBudget,
        {
          tools,
          toolExecutor,
          initialTurns: run.turns,
          priorToolCallsCount,
          maxToolCalls: run.limits.maxToolCalls,
          onBeforeModelRequest: ({ requestBytes, hasToolTurns }) => {
            const current = this.assertActiveExecution(id, executionId, signal);
            if (current.calls >= current.limits.maxCalls || current.limits.timeoutMs <= 0) {
              fail(409, 'CALL_BUDGET', '本轮调用预算已耗尽。');
            }
            const prevMetrics = current.metrics ?? { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
            const nextInputBytes = prevMetrics.inputBytes + requestBytes;
            if (nextInputBytes > current.limits.maxInputBytes) {
              fail(413, 'INPUT_BUDGET', `累计请求输入字节数 (${nextInputBytes}B) 超过 UTF-8 字节预算上限 (${current.limits.maxInputBytes}B)。`);
            }
            this.assertEgressAllowed(binding, current.authorization.workspace, hasToolTurns);
            this.update(current, 'model_started', {
              executionId,
              callIndex: current.calls + 1,
              runtimeId: binding.id,
              configVersion: binding.configVersion,
              provider: binding.provider,
              model: binding.model,
              endpoint: binding.endpoint,
              requestInputBytes: requestBytes,
              cumulativeInputBytes: nextInputBytes,
              maxOutputBytes: current.limits.maxOutputBytes,
              budgetKind: 'utf8_bytes'
            }, {
              calls: current.calls + 1,
              metrics: { ...prevMetrics, inputBytes: nextInputBytes }
            });
          },
          onAfterModelResponse: ({ responseBytes }) => {
            const current = this.assertActiveExecution(id, executionId, signal);
            const prevMetrics = current.metrics ?? { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
            const nextOutputBytes = prevMetrics.outputBytes + responseBytes;
            this.update(current, 'model_responded', {
              executionId,
              responseOutputBytes: responseBytes,
              cumulativeOutputBytes: nextOutputBytes,
              budgetKind: 'utf8_bytes'
            }, {
              metrics: { ...prevMetrics, outputBytes: nextOutputBytes }
            });
            if (nextOutputBytes > current.limits.maxOutputBytes) {
              fail(413, 'OUTPUT_BUDGET', `累计响应体字节数 (${nextOutputBytes}B) 超过 UTF-8 字节预算上限 (${current.limits.maxOutputBytes}B)。`);
            }
          },
          onTurnCheckpoint: (turn, turns, meta) => {
            const current = this.assertActiveExecution(id, executionId, signal);
            const prevMetrics = current.metrics ?? { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
            const nextToolCallsCount = meta?.toolExecuted ? prevMetrics.toolCallsCount + 1 : prevMetrics.toolCallsCount;
            this.update(current, turn.role === 'tool' ? 'tool_turn_executed' : 'assistant_turn_recorded',
              { executionId, role: turn.role, toolCallId: turn.toolCallId, sequence: turn.sequence, toolExecuted: Boolean(meta?.toolExecuted) },
              { turns, metrics: { ...prevMetrics, toolCallsCount: nextToolCallsCount } });
          }
        }
      );
      run = this.read(id);
      if (run.state !== 'running' || run.executionId !== executionId || signal.aborted) return;
      const elapsed = Date.now() - startedAt;
      const latestMetrics = run.metrics ?? { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
      const finalMetrics: RunMetrics = {
        inputBytes: latestMetrics.inputBytes,
        outputBytes: latestMetrics.outputBytes,
        toolCallsCount: latestMetrics.toolCallsCount,
        durationMs: latestMetrics.durationMs + elapsed
      };
      if (finalMetrics.outputBytes > run.limits.maxOutputBytes) {
        fail(413, 'OUTPUT_BUDGET', '累计响应体字节数超过上限。');
      }
      const candidate = this.checkedCandidate(run, output.candidate, this.project(run));
      this.update(run, 'candidate_checked', { executionId, check: 'structure-relations-scope-revision', semanticStatus: 'unverified' },
        { candidate, turns: output.turns, executionId: null, state: 'waiting_human', stopReason: 'human_decision_required', metrics: finalMetrics });
    } catch (error: unknown) {
      const run = this.read(id);
      if (run.state !== 'running' || run.executionId !== executionId) return;
      const elapsed = Date.now() - startedAt;
      const latestMetrics = run.metrics ?? { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
      const failedMetrics: RunMetrics = {
        inputBytes: latestMetrics.inputBytes,
        outputBytes: latestMetrics.outputBytes,
        toolCallsCount: latestMetrics.toolCallsCount,
        durationMs: latestMetrics.durationMs + elapsed
      };
      const code = error instanceof HubError ? error.code : 'MODEL_FAILURE';
      const issues = error instanceof CandidateError ? error.issues : [{ code, path: '', message: error instanceof HubError ? error.message : '模型步骤失败，未保存候选。' }];
      const recoverableCodes = new Set(['PROVIDER_NETWORK_ERROR', 'PROVIDER_RATE_LIMIT', 'MODEL_TIMEOUT', 'DEEPSEEK_NETWORK_ERROR', 'DEEPSEEK_RATE_LIMIT']);
      const isRecoverable = recoverableCodes.has(code) && run.snapshot !== null;
      if (isRecoverable) {
        this.update(run, 'interrupted_by_network', { executionId, code, metrics: failedMetrics }, { state: 'interrupted', stopReason: code, issues, metrics: failedMetrics });
      } else {
        this.update(run, 'stopped', { executionId, code, metrics: failedMetrics }, { state: 'failed', stopReason: code, issues, metrics: failedMetrics });
      }
    }
  }
  preview(principal: Principal, id: string) {
    requireHuman(principal);
    const run = this.read(id), project = this.project(run);
    if (!run.candidate || !['waiting_human','interrupted','completed'].includes(run.state) || run.outcome === 'rejected' || run.outcome === 'applied') {
      fail(409, 'CANDIDATE_UNAVAILABLE', '没有可应用的候选。');
    }
    this.checkedCandidate(run, run.candidate, project);
    const { sources } = this.addition(run);
    const mutation = simulateCandidateMutation(project.records, run.candidate, sources, run.id);

    let warning = '';
    if (run.candidate.type === 'append_context') {
      warning = '仅新增待核对长期信息，不改变意图、需求状态、核查或整体接受。';
    } else if (run.candidate.type === 'propose_criteria') {
      const req = project.records.requirements.find(r => r.id === run.requirementId);
      const beforeCriteria = (mutation.before ?? []) as import('../domain/record-contract.js').AcceptanceCriterion[];
      const afterCriteria = (mutation.after ?? []) as import('../domain/record-contract.js').AcceptanceCriterion[];
      const criteriaChanged = !areCriteriaEqual(beforeCriteria, afterCriteria);
      warning = '修改正式验收条件；';
      if (!criteriaChanged) {
        warning += '所提准则与当前完全一致，无状态变化。';
      } else if (req?.acceptance || req?.status === 'done') {
        warning += '因内容或条件发生变化，已有相关核查与原整体接受将失效，需求将回到待核对状态（review）。';
      } else {
        warning += '确认后正式生效。';
      }
    } else if (run.candidate.type === 'propose_decomposition') {
      const beforeObj = mutation.before as { units?: unknown[]; stories?: unknown[] };
      const hasOverwrite = (beforeObj.units && beforeObj.units.length > 0) || (beforeObj.stories && beforeObj.stories.length > 0);
      warning = '建议拆解 Unit / Story 草案；';
      if (hasOverwrite && (mutation.effects.length > 0 || mutation.warnings.length > 0)) {
        warning += '将覆盖已有同 ID 拆解对象；已有相关核查与关联整体接受将失效，各子产物仍需分别实现与验收。';
      } else if (hasOverwrite) {
        warning += '包含已有同 ID 拆解对象但无实质语义变化，已有核查保持有效；新增子产物仍需分别实现与验收。';
      } else {
        warning += '各子产物仍需分别实现与验收。';
      }
    } else {
      warning = '建议构建批次计划（Bolt Plan）；';
      if (mutation.before && (mutation.effects.length > 0 || mutation.warnings.length > 0)) {
        warning += '将覆盖已有同 ID 构建计划；相关核查或关联整体接受将失效，执行过程与退出准则需按计划重新核对。';
      } else if (mutation.before) {
        warning += '已有同 ID 构建计划无实质语义变化；执行过程与退出准则需按计划核对。';
      } else {
        warning += '执行过程与退出准则需按计划核对。';
      }
    }

    return {
      runRevision: run.revision,
      projectRevision: project.revision,
      before: mutation.before,
      after: mutation.after,
      sources,
      warning,
      warnings: mutation.warnings,
      effects: mutation.effects
    };
  }
  decide(principal: Principal, id: string, input: unknown): HarnessRun {
    requireHuman(principal);
    const r = object(input, ['revision','action','reason']);
    let run = this.read(id);
    if (run.revision !== versionField(r, 'revision')) fail(409, 'STALE_RUN', '运行已变化，请重新核对。');
    if (!run.candidate || run.state !== 'waiting_human') fail(409, 'RUN_NOT_WAITING', '运行当前不等待决定。');
    if (r['action'] !== 'keep' && r['action'] !== 'reject') fail(400, 'INVALID_INPUT', '未知决定。');
    const reason = r['action'] === 'reject' ? textField(r, 'reason') : null;
    run = this.update(run, 'human_decision', { action: r['action'], reason },
      { state: 'completed', outcome: r['action'] === 'keep' ? 'kept' : 'rejected', stopReason: 'human_decision' });
    return run;
  }
  apply(principal: Principal, id: string, input: unknown): HarnessRun {
    requireHuman(principal);
    const r = object(input, ['revision','confirmed']);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '请先预览并明确确认保存候选。');
    let run = this.read(id);
    // Recover a committed project write even if recording its Run receipt was interrupted.
    const known = this.dependencies.records.runApplication(principal, run.projectId, run.id);
    if (known) {
      if (run.receipt) return run;
      return this.update(run, 'application_recovered', { ...known }, { receipt: known, state: 'completed', outcome: 'applied', stopReason: 'applied' });
    }
    if (run.revision !== versionField(r, 'revision')) fail(409, 'STALE_RUN', '运行已变化，请重新核对。');
    const preview = this.preview(principal, id);
    if (run.state === 'interrupted') fail(409, 'RESUME_REQUIRED', '请先重新核对并恢复人工判断。');
    this.project(run);
    run = this.update(run, 'application_requested_by_human', {}, { state: 'applying' });
    try {
      const payload: Parameters<typeof this.dependencies.records.applyRunCandidate>[2] = {
        baseRevision: preview.projectRevision,
        runId: run.id,
        candidate: run.candidate!,
        sources: preview.sources
      };
      if (run.candidate!.type === 'append_context') {
        payload.item = preview.after as ContextItemRecord;
      }
      const receipt = this.dependencies.records.applyRunCandidate(principal, run.projectId, payload);
      return this.update(run, 'record_applied', { ...receipt },
        { state: 'completed', outcome: 'applied', stopReason: 'applied', receipt });
    } catch (error: unknown) {
      const current = this.read(id);
      if (current.state === 'applying') {
        this.update(current, 'application_interrupted', { code: error instanceof HubError ? error.code : 'STORAGE_FAILURE' },
          { state: 'interrupted', stopReason: 'application_requires_reconciliation' });
      }
      throw error;
    }
  }
  cancel(principal: Principal, id: string, input: unknown): HarnessRun {
    requireHuman(principal);
    const r = object(input, ['revision']);
    const run = this.read(id);
    if (run.revision !== versionField(r, 'revision')) fail(409, 'STALE_RUN', '运行已变化。');
    if (run.outcome === 'applied') fail(409, 'ALREADY_APPLIED', '记录已保存，取消不能撤销实际保存。');
    const known = this.dependencies.records.runApplication(principal, run.projectId, run.id);
    if (known) return this.update(run, 'application_observed_on_cancel', { ...known },
      { state: 'completed', outcome: 'applied', stopReason: 'applied', receipt: known,
        authorization: { ...run.authorization, active: false } });
    const next = this.update(run, 'cancelled_by_human', {}, { state: 'cancelled', stopReason: 'cancelled',
      authorization: { ...run.authorization, active: false } });
    this.active.get(id)?.controller.abort(); return next;
  }
  resume(principal: Principal, id: string, input: unknown): HarnessRun {
    requireHuman(principal);
    const r = object(input, ['revision','confirmed','model','runtimeId']);
    const run = this.read(id);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '请本人重新核对当前范围。');
    if (run.revision !== versionField(r, 'revision')) fail(409, 'STALE_RUN', '运行已变化。');
    const resumable = ['interrupted','waiting_human'].includes(run.state) || (run.state === 'completed' && run.outcome === 'kept');
    if (!run.authorization.active || !resumable) fail(409, 'RUN_NOT_RESUMABLE', '运行已取消或不需要恢复。');
    const receipt = this.dependencies.records.runApplication(principal, run.projectId, run.id);
    if (receipt) return this.update(run, 'application_recovered', { ...receipt },
      { state: 'completed', outcome: 'applied', stopReason: 'applied', receipt });

    const renewed = { ...run, authorization: { ...run.authorization, expiresAt: new Date(Date.now() + 86400000).toISOString() } };
    const project = this.project(renewed);

    const runtimeId = typeof r['runtimeId'] === 'string' && r['runtimeId'].trim() ? r['runtimeId'].trim() : undefined;
    const modelInput = typeof r['model'] === 'string' && r['model'].trim() ? r['model'].trim() : undefined;

    if (!run.runtime && !runtimeId) {
      fail(409, 'MISSING_RUNTIME_BINDING', '旧运行缺少明确有效的运行时绑定，不得隐式推断授权；请显式指定 runtimeId 重新确认运行时。');
    }
    if (run.runtime && !run.runtime.fingerprint && !runtimeId) {
      fail(409, 'MISSING_RUNTIME_FINGERPRINT', '旧运行绑定缺少配置指纹校验依据，不得隐式沿用未验证配置；请人端在看板中显式重新选择并确认运行时后继续。');
    }

    const hasExplicitSelector = Boolean(runtimeId || modelInput);
    const resolved = hasExplicitSelector
      ? this.runtimes.resolve({ runtimeId, model: modelInput })
      : (run.runtime
        ? this.runtimes.resolveBoundRuntime(run.runtime)
        : fail(409, 'MISSING_RUNTIME_BINDING', '旧运行缺少明确有效的运行时绑定，不得隐式推断授权；请显式指定 runtimeId 重新确认运行时。'));
    const isSwitchingModel = hasExplicitSelector && (
      !run.runtime ||
      resolved.binding.id !== run.runtime.id ||
      resolved.binding.configVersion !== run.runtime.configVersion ||
      resolved.binding.model !== run.model ||
      resolved.binding.endpoint !== run.runtime.endpoint
    );

    if (run.candidate && !isSwitchingModel) {
      this.assertEgressAllowed(
        resolved.binding,
        renewed.authorization.workspace,
        (run.turns ?? []).some(t => t.role === 'tool') || countPendingToolCalls(run.turns ?? []) > 0
      );
      this.checkedCandidate(renewed, run.candidate, project);
      return this.update(run, 'human_rechecked_scope', { projectRevision: project.revision }, {
        authorization: renewed.authorization, runtime: resolved.binding, state: 'waiting_human', outcome: null, stopReason: 'human_decision_required'
      });
    }

    let preservedTurns = structuredClone(run.turns ?? []);
    if (isSwitchingModel) {
      while (preservedTurns.length > 0) {
        const last = preservedTurns[preservedTurns.length - 1];
        if (last && last.role === 'assistant' && (!last.toolCalls || last.toolCalls.length === 0)) {
          preservedTurns.pop();
        } else {
          break;
        }
      }
      preservedTurns = preservedTurns.map((t, idx) => ({ ...t, sequence: idx + 1 }));
    }

    this.assertEgressAllowed(
      resolved.binding,
      renewed.authorization.workspace,
      preservedTurns.some(t => t.role === 'tool') || countPendingToolCalls(preservedTurns) > 0
    );
    const targetPort = resolved.getPort();
    const hasTurns = Array.isArray(run.turns) && run.turns.length > 0;
    const isProcessInterruptedWithoutTurns = run.stopReason === 'process_interrupted' && !hasTurns && !isSwitchingModel;
    if (isProcessInterruptedWithoutTurns || !run.snapshot) {
      fail(409, 'NEW_RUN_REQUIRED', '模型调用已中断，不自动重发；请基于当前记录启动新运行。');
    }

    const instruction = run.snapshot.instruction;
    const updatedLimits: RunLimits = {
      ...run.limits,
      ...(isSwitchingModel ? { timeoutMs: resolved.config.timeoutMs } : {}),
      ...this.dependencies.limits
    };
    const currentMetrics: RunMetrics = run.metrics ?? { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
    this.assertNextRequestFitsBudget(
      project,
      run.requirementId,
      instruction,
      updatedLimits,
      run.calls,
      currentMetrics,
      targetPort,
      renewed.authorization.workspace,
      preservedTurns
    );

    const now = at();
    const executionId = randomUUID();
    const nextEvents = [...run.events];
    if (isSwitchingModel) {
      nextEvents.push({
        sequence: nextEvents.length + 1,
        at: now,
        type: 'model_switched',
        details: {
          fromModel: run.model,
          toModel: targetPort.name,
          fromRuntime: run.runtime ?? null,
          toRuntime: resolved.binding,
          preservedTurnsCount: preservedTurns.length
        }
      });
    }
    nextEvents.push({
      sequence: nextEvents.length + 1,
      at: now,
      type: 'resumed_from_checkpoint',
      details: {
        projectRevision: project.revision,
        turnsCount: preservedTurns.length,
        model: targetPort.name,
        runtime: resolved.binding,
        executionId
      }
    });
    const resumedRun: HarnessRun = {
      ...run,
      revision: run.revision + 1,
      authorization: renewed.authorization,
      limits: updatedLimits,
      model: targetPort.name,
      runtime: resolved.binding,
      executionId,
      state: 'running',
      stopReason: null,
      issues: [],
      calls: run.calls,
      ...(isSwitchingModel ? { candidate: null, outcome: null, turns: preservedTurns } : {}),
      events: nextEvents
    };
    this.dependencies.runs.replace(resumedRun, run.revision);
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => this.execute(resumedRun.id, executionId, instruction, controller.signal, resolved));
    this.active.set(resumedRun.id, { executionId, controller, promise });
    void promise.finally(() => {
      if (this.active.get(resumedRun.id)?.executionId === executionId) {
        this.active.delete(resumedRun.id);
      }
    }).catch(() => { /* recover interrupted */ });
    this.dependencies.notify?.();
    return resumedRun;
  }
  fork(principal: Principal, parentRunId: string, input: unknown, requestId: string): HarnessRun {
    requireHuman(principal);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) fail(400, 'INVALID_REQUEST_ID', '运行请求编号不合法。');
    const r = object(input, ['forkPointStep','confirmed','instruction','model','runtimeId','workspace']);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_CONFIRMATION_REQUIRED', '须本人确认分叉会话范围与继承账本。');
    const parentRun = this.read(parentRunId);
    const parentTurns = parentRun.turns ?? [];
    const rawStep = r['forkPointStep'];
    const forkPointStep = rawStep === undefined || rawStep === null
      ? parentTurns.length
      : (typeof rawStep === 'number' && Number.isInteger(rawStep) && rawStep >= 0 && rawStep <= parentTurns.length
        ? rawStep
        : fail(400, 'INVALID_FORK_STEP', '分叉步数超出原会话账本范围。'));

    const slicedTurns = parentTurns.slice(0, forkPointStep);
    while (slicedTurns.length > 0) {
      const last = slicedTurns[slicedTurns.length - 1];
      if (last && last.role === 'assistant' && (!last.toolCalls || last.toolCalls.length === 0)) {
        slicedTurns.pop();
      } else {
        break;
      }
    }
    const inheritedTurns = slicedTurns.map((t, idx) => ({ ...structuredClone(t), sequence: idx + 1 }));

    const project = this.dependencies.records.get(principal, parentRun.projectId);
    if (project.revision !== parentRun.baseRevision && (forkPointStep > 0 || inheritedTurns.length > 0)) {
      fail(
        409,
        'STALE_OBSERVATIONS_NOT_INHERITABLE',
        '项目正式记录修订已变化，不能将旧修订下的步骤观察静默继承为当前依据；请指定 forkPointStep: 0 重新开始或另起新运行。'
      );
    }

    const workspaceAuth = r['workspace'] !== undefined
      ? this.parseWorkspaceAuth(r['workspace'])
      : (parentRun.authorization.workspace ? structuredClone(parentRun.authorization.workspace) : null);

    const runtimeId = typeof r['runtimeId'] === 'string' && r['runtimeId'].trim() ? r['runtimeId'].trim() : undefined;
    const modelInput = typeof r['model'] === 'string' && r['model'].trim() ? r['model'].trim() : undefined;

    if (!parentRun.runtime && !runtimeId) {
      fail(409, 'MISSING_RUNTIME_BINDING', '父运行缺少明确有效的运行时绑定，不得隐式推断授权；请显式指定 runtimeId 重新确认运行时。');
    }
    if (parentRun.runtime && !parentRun.runtime.fingerprint && !runtimeId) {
      fail(409, 'MISSING_RUNTIME_FINGERPRINT', '旧运行绑定缺少配置指纹校验依据，不得隐式沿用未验证配置；请人端在看板中显式重新选择并确认运行时后继续。');
    }

    const hasExplicitSelector = Boolean(runtimeId || modelInput);
    const resolved = hasExplicitSelector
      ? this.runtimes.resolve({ runtimeId, model: modelInput })
      : (parentRun.runtime
        ? this.runtimes.resolveBoundRuntime(parentRun.runtime)
        : fail(409, 'MISSING_RUNTIME_BINDING', '父运行缺少明确有效的运行时绑定，不得隐式推断授权；请显式指定 runtimeId 重新确认运行时。'));
    this.assertEgressAllowed(
      resolved.binding,
      workspaceAuth,
      inheritedTurns.some(t => t.role === 'tool') || countPendingToolCalls(inheritedTurns) > 0
    );
    const targetPort = resolved.getPort();

    const instruction = typeof r['instruction'] === 'string' && r['instruction'].trim()
      ? textField(r, 'instruction', 600)
      : (parentRun.snapshot?.instruction ?? '基于已继承步骤账本继续分析');

    const forkInfo: RunForkInfo = {
      parentRunId: parentRun.id,
      parentRevision: parentRun.revision,
      forkPointStep
    };
    const hash = digest({ parentRunId: parentRun.id, forkPointStep, instruction, runtime: resolved.binding, baseRevision: project.revision, workspace: workspaceAuth });
    const existing = this.dependencies.runs.list().find(item => item.requestId === requestId);
    if (existing) {
      if (existing.requestHash !== hash) fail(409, 'REQUEST_REUSED', '相同编号不能用于另一分叉请求。');
      return existing;
    }

    const now = at();
    const executionId = randomUUID();
    const forkLimits: RunLimits = { ...defaultLimits, timeoutMs: resolved.config.timeoutMs, ...this.dependencies.limits };
    const initialMetrics: RunMetrics = { inputBytes: 0, outputBytes: 0, toolCallsCount: 0, durationMs: 0 };
    const run: HarnessRun = {
      schemaVersion: '1.0.0',
      id: randomUUID(),
      revision: 1,
      projectId: parentRun.projectId,
      requirementId: parentRun.requirementId,
      createdAt: now,
      requestId,
      requestHash: hash,
      baseRevision: project.revision,
      state: 'running',
      stopReason: null,
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        operation: 'propose_context',
        workspace: workspaceAuth
      },
      limits: forkLimits,
      model: targetPort.name,
      runtime: resolved.binding,
      executionId,
      calls: 0,
      snapshot: null,
      metrics: initialMetrics,
      fork: forkInfo,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      turns: inheritedTurns,
      events: [{
        sequence: 1,
        at: now,
        type: 'forked_by_human',
        details: {
          parentRunId: parentRun.id,
          parentRevision: parentRun.revision,
          forkPointStep,
          inheritedTurnsCount: inheritedTurns.length,
          fromModel: parentRun.model,
          model: targetPort.name,
          runtime: resolved.binding,
          executionId
        }
      }]
    };
    this.project(run);
    this.assertNextRequestFitsBudget(
      project,
      run.requirementId,
      instruction,
      forkLimits,
      0,
      initialMetrics,
      targetPort,
      workspaceAuth,
      inheritedTurns
    );
    this.dependencies.runs.create(run);
    const controller = new AbortController();
    const promise = Promise.resolve().then(() => this.execute(run.id, executionId, instruction, controller.signal, resolved));
    this.active.set(run.id, { executionId, controller, promise });
    void promise.finally(() => {
      if (this.active.get(run.id)?.executionId === executionId) {
        this.active.delete(run.id);
      }
    }).catch(() => { /* recover interrupted */ });
    this.dependencies.notify?.();
    return run;
  }
  shutdown(): void {
    for (const [id, active] of this.active) {
      const run = this.read(id);
      if (run.state === 'running') this.update(run, 'process_stopping', {}, { state: 'interrupted', stopReason: 'process_interrupted' });
      active.controller.abort();
    }
  }
}
class CandidateError extends HubError {
  readonly issues: import('../domain/record-contract.js').ContractIssue[];
  constructor(issues: import('../domain/record-contract.js').ContractIssue[]) {
    super(400, 'INVALID_CANDIDATE', '候选未通过检查，正式记录未改变。'); this.issues = issues;
  }
}
