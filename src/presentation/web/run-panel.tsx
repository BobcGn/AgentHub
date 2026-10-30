import { useCallback, useEffect, useRef, useState } from 'react';
import type { HarnessRun, ModelRuntimeConfig, RuntimeProviderKind } from '../../domain/harness.js';
import type { RecordProject } from '../../domain/record-project.js';
import { recordApi } from './record-editor.js';

interface PreviewEffect { target: string; before: unknown; after: unknown }
interface Preview {
  runRevision: number;
  projectRevision: number;
  before: unknown;
  after: unknown;
  warning: string;
  warnings?: string[];
  effects?: PreviewEffect[];
}
const stopLabels: Record<string, string> = {
  human_decision_required: '等待你判断候选', human_decision: '已记录你的决定', applied: '候选已保存到长期记录',
  process_interrupted: '服务中断，本轮未自动重发', cancelled: '你已取消并撤销本轮授权',
  application_requires_reconciliation: '保存结果需要重新核对', CONTEXT_BUDGET: '必要上下文超过字节预算',
  INPUT_BUDGET: '累计请求输入超过 UTF-8 字节预算',
  CALL_BUDGET: '调用预算已耗尽', OUTPUT_BUDGET: '返回内容超过 UTF-8 字节预算',
  TOOL_BUDGET_EXCEEDED: '工具调用次数已达本轮上限',
  EGRESS_OUT_OF_SCOPE: '目标端点超出本轮外发授权边界',
  UNKNOWN_ENDPOINT_DENIED: '未知或非法端点已被默认拒绝',
  RUNTIME_CONFIG_CHANGED: '绑定运行时配置已变更，拒绝静默切换',
  MODEL_TIMEOUT: '模型步骤超时',
  INVALID_CANDIDATE: '候选未通过结构检查', CANDIDATE_OUT_OF_SCOPE: '候选超出本轮范围',
  STALE_RUN_CONTEXT: '项目已变化，原候选不再适用', RUN_AUTHORIZATION_EXPIRED: '本轮授权已到期',
  MODEL_FAILURE: '模型步骤失败'
};
const stateLabels = { running: '运行中', waiting_human: '等待你判断', applying: '正在保存', completed: '本轮已结束',
  failed: '已停止：失败', cancelled: '已取消', interrupted: '已中断' };
export function RunPanel({ project, requirementId, onChanged }: {
  project: RecordProject; requirementId: string; onChanged: () => void;
}) {
  const [runs, setRuns] = useState<HarnessRun[]>([]), [selected, setSelected] = useState('');
  const [runtimes, setRuntimes] = useState<ModelRuntimeConfig[]>([]);
  const [selectedRuntime, setSelectedRuntime] = useState('');
  const [switchRuntime, setSwitchRuntime] = useState('');
  const [rtId, setRtId] = useState('custom-openai-1'), [rtName, setRtName] = useState('自定义 OpenAI 兼容运行时');
  const [rtProvider, setRtProvider] = useState<RuntimeProviderKind>('openai-compatible');
  const [rtBaseUrl, setRtBaseUrl] = useState('https://api.openai.com/v1');
  const [rtModel, setRtModel] = useState('gpt-4o-mini'), [rtApiKeyEnv, setRtApiKeyEnv] = useState('OPENAI_API_KEY');
  const [instruction, setInstruction] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [authWorkspace, setAuthWorkspace] = useState(false);
  const [workspaceRoot, setWorkspaceRoot] = useState('.');
  const [readScopeInput, setReadScopeInput] = useState('.');
  const [excludePaths, setExcludePaths] = useState('node_modules, dist, .git');
  const [egressScope, setEgressScope] = useState<'local_only' | 'internet'>('local_only');
  const pendingStart = useRef<{ fingerprint: string; key: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [applyConfirmed, setApplyConfirmed] = useState(false);
  const load = useCallback(async () => {
    try {
      const [loadedRuns, loadedRuntimes] = await Promise.all([
        recordApi<HarnessRun[]>('/api/record-projects/' + project.id + '/runs'),
        recordApi<ModelRuntimeConfig[]>('/api/runtimes').catch(() => [] as ModelRuntimeConfig[])
      ]);
      setRuns(loadedRuns);
      setRuntimes(loadedRuntimes);
      setLoadError('');
    }
    catch (e: unknown) { setLoadError(e instanceof Error ? e.message : '读取运行失败，保留原内容。'); }
  }, [project.id]);
  useEffect(() => {
    let live = true;
    const refresh = () => { if (live) void load(); };
    refresh(); const events = new EventSource('/api/events'); events.onmessage = refresh;
    const timer = setInterval(refresh, 3000);
    return () => { live = false; events.close(); clearInterval(timer); };
  }, [load]);
  const choices = runs.filter(item => item.requirementId === requirementId);
  const run = choices.find(item => item.id === selected) ?? choices[choices.length - 1];
  async function action(work: () => Promise<void>) {
    setBusy(true); setError('');
    try { await work(); await load(); } catch (e: unknown) { setError(e instanceof Error ? e.message : '操作失败，请核对运行状态。'); }
    finally { setBusy(false); }
  }
  async function write(actionName: string, input: unknown) {
    if (!run) return;
    await recordApi('/api/runs/' + run.id + '/' + actionName, input, crypto.randomUUID());
  }
  const mayApply = run && (run.state === 'waiting_human' || run.outcome === 'kept');
  return <section className="record-block harness-panel" aria-label="需求运行">
    <div className="section-heading"><h3>需求运行</h3><button className="secondary compact" onClick={() => void load()}>刷新运行</button></div>
    {(() => {
      const selectedRt = runtimes.find(r => r.id === selectedRuntime);
      const isScriptedOrLocal = !selectedRt || selectedRt.provider === 'scripted' || selectedRt.baseUrl.startsWith('local://');
      return (
        <p className="muted tiny">
          {isScriptedOrLocal
            ? '当前配置为本地受控/脚本化运行时，无云端调用。'
            : `当前配置为外部模型运行时 (${selectedRt.name || selectedRt.id} · ${selectedRt.provider}: ${selectedRt.model})，受外发边界保护。`}
          它只生成待核对信息；正式记录在你确认后保存，新会话从已保存记录继承。
        </p>
      );
    })()}
    {project.records.intent.confirmation.state !== 'human_confirmed' && <p className="notice">请先完善并确认项目意图，再开始需求运行。</p>}
    <form onSubmit={event => { event.preventDefault(); void action(async () => {
      const parsedScope = readScopeInput.split(',').map(s => s.trim()).filter(Boolean);
      const workspace = authWorkspace ? {
        authorized: true,
        root: workspaceRoot.trim() || '.',
        readScope: parsedScope.length > 0 ? parsedScope : ['.'],
        exclude: excludePaths.split(',').map(s => s.trim()).filter(Boolean),
        egressScope
      } : undefined;
      const input = {
        requirementId,
        baseRevision: project.revision,
        instruction,
        confirmed,
        workspace,
        ...(selectedRuntime ? { runtimeId: selectedRuntime } : {})
      };
      const fingerprint = JSON.stringify(input);
      if (pendingStart.current?.fingerprint !== fingerprint) pendingStart.current = { fingerprint, key: crypto.randomUUID() };
      const created = await recordApi<HarnessRun>('/api/record-projects/' + project.id + '/runs', input, pendingStart.current.key);
      pendingStart.current = null;
      setSelected(created.id); setPreview(null); setApplyConfirmed(false);
    }); }}>
      <label>本轮问题<textarea aria-label="本轮问题" rows={3} maxLength={600} required value={instruction}
        placeholder="用简短问题说明本轮需要提炼的未知或假设，不粘贴完整对话。"
        onChange={event => setInstruction(event.target.value)} /></label>

      {runtimes.length > 0 && (
        <label>模型运行时（预设或自定义）
          <select aria-label="模型运行时" value={selectedRuntime} onChange={e => setSelectedRuntime(e.target.value)}>
            <option value="">默认运行时</option>
            {runtimes.map(rt => <option key={rt.id} value={rt.id}>{rt.name} ({rt.id} · {rt.model})</option>)}
          </select>
        </label>
      )}

      <details className="scope-config" style={{ margin: '8px 0', border: '1px solid var(--border-subtle, #e0e0e0)', borderRadius: '4px', padding: '6px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
          工作区与工具授权配置（当前：{authWorkspace ? (readScopeInput.trim() === '.' ? '已授权整树只读' : `已授权子集 [${readScopeInput.trim()}] 只读`) : '未授权工作区，tools: []'}）
        </summary>
        <label className="scope-option" style={{ marginTop: '8px' }}>
          <input type="checkbox" checked={authWorkspace} onChange={e => setAuthWorkspace(e.target.checked)} />
          授权本轮使用工作区只读工具 (list_directory, read_file, search_code)
        </label>
        {authWorkspace ? (
          <div style={{ paddingLeft: '20px', marginTop: '6px' }}>
            <label>工作区根目录（默认递归覆盖整个工作区，敏感文件自动黑名单阻断）
              <input type="text" value={workspaceRoot} onChange={e => setWorkspaceRoot(e.target.value)} placeholder="." />
            </label>
            <label>读取范围 (Read Scope，默认 . 为整树，可指定子目录如 src, docs)
              <input type="text" value={readScopeInput} onChange={e => setReadScopeInput(e.target.value)} placeholder="." />
            </label>
            <label>额外排除路径（优先排除，逗号分隔）
              <input type="text" value={excludePaths} onChange={e => setExcludePaths(e.target.value)} placeholder="node_modules, dist, .git" />
            </label>
            <label>外发边界 (Egress Scope)
              <select aria-label="外发边界" value={egressScope} onChange={e => setEgressScope(e.target.value as 'local_only' | 'internet')}>
                <option value="local_only">仅允许本地 / 回环模型端点 (local_only)</option>
                <option value="internet">允许向外部云端模型 API 外发 (internet)</option>
              </select>
            </label>
            <p className="tiny muted">安全约束：读取范围受根目录限定；系统强约束黑名单自动拦截 `.git`、`.env*`、`.agenthub`、私钥及软链接越界。</p>
          </div>
        ) : (
          <p className="tiny muted" style={{ paddingLeft: '20px', marginTop: '4px' }}>未授权工作区：本轮模型工具清单将严格为 []，不读取本地文件，仅基于已确认记录快照推进。</p>
        )}
      </details>

      <label className="scope-option"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        我确认只读取当前意图和本需求的适用记录，生成待核对信息</label>
      <button className="primary compact" disabled={busy || project.records.intent.confirmation.state !== 'human_confirmed' || !confirmed || !instruction.trim()}>开始本轮运行</button>
    </form>

    <details style={{ margin: '8px 0', fontSize: '12px' }}>
      <summary style={{ cursor: 'pointer' }}>管理模型运行时（Multica 风格预设与自定义）</summary>
      <div style={{ padding: '8px', border: '1px solid var(--border-subtle, #e0e0e0)', borderRadius: '4px', marginTop: '4px' }}>
        <label>运行时 ID<input value={rtId} onChange={e => setRtId(e.target.value)} /></label>
        <label>显示名称<input value={rtName} onChange={e => setRtName(e.target.value)} /></label>
        <label>供应商类型
          <select value={rtProvider} onChange={e => setRtProvider(e.target.value as RuntimeProviderKind)}>
            <option value="openai-compatible">openai-compatible</option>
            <option value="deepseek">deepseek</option>
            <option value="scripted">scripted</option>
          </select>
        </label>
        <label>接口地址 (Base URL)<input value={rtBaseUrl} onChange={e => setRtBaseUrl(e.target.value)} /></label>
        <label>模型名称 (Model)<input value={rtModel} onChange={e => setRtModel(e.target.value)} /></label>
        <label>API Key 环境变量名（不存明文密钥）<input value={rtApiKeyEnv} onChange={e => setRtApiKeyEnv(e.target.value)} /></label>
        <button type="button" className="secondary compact" disabled={busy} onClick={() => void action(async () => {
          await recordApi('/api/runtimes', {
            id: rtId, name: rtName, provider: rtProvider, baseUrl: rtBaseUrl, model: rtModel, apiKeyEnv: rtApiKeyEnv, timeoutMs: 15000
          }, crypto.randomUUID());
        })}>保存运行时配置</button>
      </div>
    </details>

    {(error || loadError) && <p className="error" role="alert">{error || loadError}</p>}
    {choices.length > 0 && <label>运行历史<select aria-label="运行历史" value={run?.id ?? ''} onChange={event => {
      setSelected(event.target.value); setPreview(null); setApplyConfirmed(false);
    }}>{choices.map(item => <option key={item.id} value={item.id}>{stateLabels[item.state]} · {item.model} · {new Date(item.createdAt).toLocaleString('zh-CN')}</option>)}</select></label>}
    {run && <article className="harness-run">
      <h4>{stateLabels[run.state]}</h4><p className="muted tiny">基于项目修订 {run.baseRevision} · 调用 {run.calls} 次 · {run.id}</p>
      {run.fork && (
        <p className="tiny" style={{ background: '#eff6ff', padding: '4px 8px', borderRadius: '4px' }}>
          <strong>会话分叉来源：</strong>父会话 <code>{run.fork.parentRunId}</code>（修订 {run.fork.parentRevision}）· 分叉自第 {run.fork.forkPointStep} 步
        </p>
      )}
      <p>停止原因：{run.stopReason ? stopLabels[run.stopReason] ?? '已停止，详见检查结果' : '尚未停止'}</p>
      <div className="run-scope-details" style={{ margin: '8px 0', padding: '8px', background: 'var(--bg-subtle, #f5f5f5)', borderRadius: '4px' }}>
        <p className="tiny">
          <strong>运行时与模型绑定：</strong>
          {run.runtime
            ? `${run.runtime.id}@v${run.runtime.configVersion} · ${run.runtime.provider} · ${run.runtime.model} · ${run.runtime.endpoint} (${run.runtime.external ? '外部网络端点' : '本地受控端点'})`
            : `${run.model}（未记录显式运行时绑定）`}
        </p>
        <p className="tiny">
          <strong>外发边界：</strong>
          {!run.authorization.workspace?.authorized
            ? '未授权工作区外发 (none)'
            : run.authorization.workspace.egressScope === 'internet' || run.authorization.workspace.egressScope === 'model_api'
              ? `允许受控公网外发 (${run.authorization.workspace.egressScope})`
              : run.authorization.workspace.egressScope === 'local_only'
                ? '仅允许本地/回环端点 (local_only)'
                : `禁止外发 (${run.authorization.workspace.egressScope ?? 'none'})`}
        </p>
        <p className="tiny">
          <strong>工作区工具：</strong>
          {run.authorization.workspace?.authorized
            ? `已授权根目录: ${run.authorization.workspace.root} (${(!run.authorization.workspace.readScope || run.authorization.workspace.readScope.length === 0 || (run.authorization.workspace.readScope.length === 1 && run.authorization.workspace.readScope[0] === '.')) ? '整树只读' : `子集只读 [${run.authorization.workspace.readScope.join(', ')}]`}，黑名单与链接链强约束)`
            : '未授权工作区 (工具: 无，仅结构化快照)'}
        </p>
      </div>
      {run.metrics && (
        <div className="run-metrics-summary" style={{ margin: '6px 0', padding: '6px 8px', background: 'var(--bg-subtle, #f1f5f9)', borderRadius: '4px', fontSize: '12px' }}>
          <strong>运行预算账本（UTF-8 字节预算，非分词器 Token 估算）：</strong>
          累计耗时: {run.metrics.durationMs}ms ·
          输入: {run.metrics.inputBytes} / {run.limits.maxInputBytes} 字节 ·
          输出: {run.metrics.outputBytes} / {run.limits.maxOutputBytes} 字节 ·
          工具调用: {run.metrics.toolCallsCount} / {run.limits.maxToolCalls} 次 ·
          模型请求: {run.calls} / {run.limits.maxCalls} 次
        </div>
      )}
      {run.baseRevision !== project.revision && run.outcome !== 'applied' && <p className="notice">项目已变化，旧候选不自动适配当前内容。</p>}
      {run.snapshot && <details><summary>查看输入依据与已继承的记录</summary>
        <p>意图：{run.snapshot.intent.title}；需求：{run.snapshot.requirement.title}</p>
        <p>本轮问题：{run.snapshot.instruction}</p>
        <p className="muted tiny">来源摘要：{run.snapshot.hash} · 输入约 {run.snapshot.bytes} 字节；省略：{run.snapshot.omitted.join('、') || '无'}</p>
        <details><summary>查看本轮实际输入</summary><pre>{JSON.stringify(run.snapshot, null, 2)}</pre></details>
        <ul>{run.snapshot.contextItems.map(item => <li key={item.id}>{item.content}（{item.epistemicStatus}）</li>)}</ul>
      </details>}
      {run.issues.length > 0 && <ul className="error">{run.issues.map((item,i) => <li key={i}>{item.code}：{item.message}</li>)}</ul>}
      {run.candidate && <div className="notice">
        {run.candidate.type === 'append_context' && <>
          <strong>长期信息候选 · 未经实际核验</strong>
          <p>{run.candidate.content}</p>
          <small>{run.candidate.category === 'open_question' ? '未知问题' : run.candidate.category === 'decision' ? '架构决策' : '待核对假设'} · {run.candidate.epistemicStatus === 'unknown' ? '未知' : '待核对'}</small>
        </>}
        {run.candidate.type === 'propose_criteria' && <>
          <strong>验收准则候选 · 待人工核对</strong>
          <ul>{run.candidate.acceptanceCriteria.map(c => <li key={c.id}><strong>{c.id}</strong>: {c.description}</li>)}</ul>
        </>}
        {run.candidate.type === 'propose_decomposition' && <>
          <strong>Unit / Story 拆解草案 · 待人工核对</strong>
          {run.candidate.units && run.candidate.units.length > 0 && <p>Unit: {run.candidate.units.map(u => u.title).join('、')}</p>}
          <p>Story: {run.candidate.stories.map(s => s.title).join('、')}</p>
        </>}
        {run.candidate.type === 'propose_bolt_plan' && <>
          <strong>构建批次计划（Bolt Plan）· 待人工核对</strong>
          <p>{run.candidate.boltPlan.title}（阶段: {run.candidate.boltPlan.stages.join(' → ')}）</p>
        </>}
      </div>}
      {run.state === 'waiting_human' && <div className="harness-actions">
        <button className="secondary compact" disabled={busy} onClick={() => void action(() => write('decision', { revision: run.revision, action: 'keep' }))}>保留候选，本轮结束</button>
        <label>退回原因<input aria-label="运行退回原因" value={reason} onChange={event => setReason(event.target.value)} /></label>
        <button className="secondary compact" disabled={busy || !reason.trim()} onClick={() => void action(() => write('decision', { revision: run.revision, action: 'reject', reason }))}>退回本次候选</button>
      </div>}
      {mayApply && <button className="secondary compact" disabled={busy} onClick={() => void action(async () => {
        setPreview(await recordApi<Preview>('/api/runs/' + run.id + '/preview')); setApplyConfirmed(false);
      })}>预览保存到长期记录</button>}
      {preview && mayApply && <div className="record-actual" aria-label="运行候选保存预览">
        <h4>核对候选变更</h4>
        <p>修改前：{typeof preview.before === 'object' && preview.before !== null && 'content' in preview.before ? String((preview.before as { content?: unknown }).content) : (preview.before ? JSON.stringify(preview.before) : '无此条信息')}</p>
        <p>修改后：{typeof preview.after === 'object' && preview.after !== null && 'content' in preview.after ? String((preview.after as { content?: unknown }).content) : JSON.stringify(preview.after)}</p>
        <p>{preview.warning}</p>
        {preview.warnings && preview.warnings.length > 0 && (
          <ul className="tiny" aria-label="候选保存影响提示">
            {preview.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        )}
        {preview.effects && preview.effects.length > 0 && (
          <details className="tiny" style={{ margin: '6px 0' }} open>
            <summary><strong>关联影响对象（{preview.effects.length} 项）</strong></summary>
            <ul>
              {preview.effects.map((eff, idx) => <li key={idx}><code>{eff.target}</code></li>)}
            </ul>
          </details>
        )}
        <label className="scope-option"><input type="checkbox" checked={applyConfirmed} onChange={event => setApplyConfirmed(event.target.checked)} />
          我已核对差异，确认保存这条待核对信息</label>
        <button className="primary compact" disabled={busy || !applyConfirmed || preview.runRevision !== run.revision || preview.projectRevision !== project.revision}
          onClick={() => void action(async () => { await write('apply', { revision: preview.runRevision, confirmed: true }); setPreview(null); onChanged(); })}>确认保存候选</button>
      </div>}
      {(run.state === 'interrupted' || run.state === 'waiting_human' || run.outcome === 'kept') && (
        <div className="resume-and-switch" style={{ margin: '6px 0', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {runtimes.length > 0 && (
            <select aria-label="同会话切换运行时" value={switchRuntime} onChange={e => setSwitchRuntime(e.target.value)} style={{ width: 'auto' }}>
              <option value="">保持当前模型 ({run.model})</option>
              {runtimes.map(rt => <option key={rt.id} value={rt.id}>切换至：{rt.name} ({rt.id})</option>)}
            </select>
          )}
          <button className="secondary compact" disabled={busy}
            onClick={() => void action(() => write('resume', {
              revision: run.revision,
              confirmed: true,
              ...(switchRuntime ? { runtimeId: switchRuntime } : {})
            }))}>重新核对并恢复判断</button>
        </div>
      )}
      {run.outcome !== 'applied' && run.state !== 'cancelled' && <button className="text-button" disabled={busy}
        onClick={() => void action(() => write('cancel', { revision: run.revision }))}>取消并撤销本次运行授权</button>}
      {run.receipt && <p className="notice">已保存到项目修订 {run.receipt.projectRevision}；后续运行将读取这条长期信息。需求状态和验收结果未改变。</p>}
      {run.turns && run.turns.length > 0 && (
        <details className="step-ledger" style={{ margin: '8px 0' }} open>
          <summary><strong>可核验步骤账本（{run.turns.length} 步）</strong></summary>
          <ol style={{ paddingLeft: '20px', fontSize: '13px' }}>
            {run.turns.map(turn => (
              <li key={turn.sequence} style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="badge" style={{ fontWeight: 'bold' }}>[{turn.role.toUpperCase()}] 第 {turn.sequence} 步</span>
                  <button type="button" className="secondary compact" disabled={busy} onClick={() => void action(async () => {
                    const forked = await recordApi<HarnessRun>('/api/runs/' + run.id + '/fork', {
                      forkPointStep: turn.sequence,
                      confirmed: true,
                      ...(switchRuntime ? { runtimeId: switchRuntime } : {})
                    }, crypto.randomUUID());
                    setSelected(forked.id); setPreview(null); setApplyConfirmed(false);
                  })}>从第 {turn.sequence} 步分叉</button>
                </div>
                {turn.role === 'assistant' && turn.toolCalls && (
                  <div style={{ marginTop: '4px', padding: '4px 8px', background: '#f8f9fa', borderRadius: '4px' }}>
                    <small>请求工具调用：</small>
                    <ul style={{ margin: '2px 0', paddingLeft: '16px' }}>
                      {turn.toolCalls.map(tc => (
                        <li key={tc.id}>
                          <code>{tc.name}({JSON.stringify(tc.arguments)})</code> <span className="muted tiny">(调用ID: {tc.id})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {turn.role === 'tool' && (
                  <div style={{ marginTop: '4px', padding: '4px 8px', background: '#f0fdf4', borderRadius: '4px' }}>
                    <small>工具执行结果 <span className="muted tiny">(响应 ID: {turn.toolCallId ?? '未知'})</span>：</small>
                    <pre style={{ margin: '2px 0', maxHeight: '120px', overflow: 'auto', fontSize: '11px' }}>{turn.content}</pre>
                  </div>
                )}
                {turn.role === 'assistant' && turn.content && (
                  <div style={{ marginTop: '4px', padding: '4px 8px', background: '#faf5ff', borderRadius: '4px' }}>
                    <small>模型候选输出：</small>
                    <pre style={{ margin: '2px 0', maxHeight: '120px', overflow: 'auto', fontSize: '11px' }}>{turn.content}</pre>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
      <details><summary>查看运行过程（{run.events.length}）</summary><ol>{run.events.map(event =>
        <li key={event.sequence}>{event.type} · {new Date(event.at).toLocaleString('zh-CN')}<pre>{JSON.stringify(event.details, null, 2)}</pre></li>)}</ol></details>
    </article>}
  </section>;
}
