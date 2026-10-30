import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ContractReport } from '../../domain/record-contract.js';
import type { EditableCollection, RecordEditPreview, RecordProject } from '../../domain/record-project.js';
import { collectionLabels, lines, listValue, objectValue, recordColumns, recordWorks, stringValue } from './record-ui.js';

export class RecordApiError extends Error {
  readonly status: number; readonly report: ContractReport | undefined;
  constructor(status: number, message: string, report?: ContractReport) { super(message); this.status = status; this.report = report; }
}
export async function recordApi<T>(path: string, input?: unknown, key?: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(15000),
    ...(input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(input) }) });
  const data = await response.json() as { error?: { message?: string }; report?: ContractReport };
  if (!response.ok) throw new RecordApiError(response.status, data.error?.message ?? '读取或保存失败。', data.report);
  return data as T;
}
export function RecordModal({ label, children, onClose, drawer = false }: { label: string; children: ReactNode; onClose: () => void; drawer?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={drawer ? 'record-dialog record-drawer' : 'record-dialog'} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="record-dialog-top"><strong>{label}</strong><button type="button" className="icon-button" aria-label={'关闭' + label} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}
export function RecordField({ label, value, onChange, required = false, area = true }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; area?: boolean;
}) {
  const id = useId();
  return <label className="field" htmlFor={id}><span>{label}</span>{area
    ? <textarea id={id} value={value} rows={3} required={required} maxLength={4000} onChange={event => onChange(event.target.value)} />
    : <input id={id} value={value} required={required} maxLength={4000} onChange={event => onChange(event.target.value)} />}</label>;
}
export function IssuesList({ report }: { report: ContractReport | undefined }) {
  return report && !report.valid ? <ul className="record-errors" aria-label="合同校验问题">{report.issues.map((issue, i) =>
    <li key={i}><strong>{issue.code}</strong><code>{issue.path || '/'}</code><span>{issue.message}</span></li>)}</ul> : null;
}
export interface EditingRecord { collection: EditableCollection; id: string | null; initial: Record<string, unknown>; baseRevision: number }
const textLabels: Record<string, string> = { title: '标题', problem: '要解决的问题', expectedOutcome: '预期结果',
  rationale: '为什么这样做', expectedImpact: '预期影响', userValue: '用户价值', description: '证据说明',
  subject: '证据对应的产物／提交', environment: '观察环境', observedResult: '实际观察结果',
  content: '长期关键信息', locator: '出处定位线索', explanation: '核查说明' };
const arrayLabels: Record<string, string> = { constraints: '约束（每行一项）', responsibilities: '职责（每行一项）',
  inputs: '输入（每行一项）', outputs: '输出（每行一项）', stages: '阶段（每行一项）',
  exitConditions: '退出条件（每行一项）', limitations: '证据局限（每行一项）' };
export function RecordEditor({ project, edit, onClose, onSaved }: { project: RecordProject; edit: EditingRecord;
  onClose: () => void; onSaved: (project: RecordProject) => void }) {
  const [record, setRecord] = useState<Record<string, unknown>>(() => {
    const value = structuredClone(edit.initial);
    if (edit.collection === 'requirements' && value['status'] === 'done') { value['status'] = 'review'; value['acceptance'] = null; }
    return value;
  });
  const [baseRevision, setBaseRevision] = useState(edit.baseRevision);
  const [reason, setReason] = useState('');
  const [rawMode, setRawMode] = useState(false), [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<RecordEditPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [report, setReport] = useState<ContractReport>();
  const requestIds = useRef(new Map<string, string>());
  const stale = baseRevision !== project.revision;
  const reqId = edit.collection === 'requirements' ? stringValue(record['id']) : stringValue(record['requirementId']);
  const works = recordWorks(project.records).filter(item => item.kind === 'requirement' ? item.id === reqId : item.requirementId === reqId);
  const update = (key: string, value: unknown): void => { setRecord(previous => ({ ...previous, [key]: value })); setPreview(null); setConfirmed(false); };
  function preparedRecord(value: unknown): unknown {
    if (rawMode) return value;
    const next = structuredClone(objectValue(value));
    for (const name of ['constraints','responsibilities','inputs','outputs','stages','exitConditions','limitations']) {
      if (Array.isArray(next[name])) next[name] = (next[name] as unknown[]).map(item => typeof item === 'string' ? item.trim() : item).filter(item => item !== '');
    }
    if (next['scope']) {
      const scope = objectValue(next['scope']);
      next['scope'] = { includes: listValue(scope['includes']).map(item => item.trim()).filter(Boolean),
        excludes: listValue(scope['excludes']).map(item => item.trim()).filter(Boolean) };
    }
    return next;
  }
  const payload = (value: unknown) => ({ baseRevision, collection: edit.collection, id: edit.id, record: value, reason });
  const close = (): void => { if (busy) return; if ((reason || preview) && !window.confirm('放弃本次未保存的编辑？')) return; onClose(); };
  async function inspect() {
    setBusy(true); setError(''); setReport(undefined);
    try {
      const value: unknown = rawMode ? JSON.parse(raw) : preparedRecord(record);
      const next = await recordApi<RecordEditPreview>('/api/record-projects/' + project.id + '/record-preview', payload(value));
      setPreview(next); setReport(next.report); setConfirmed(false);
    } catch (e) { setError(e instanceof Error ? e.message : '检查失败。'); if (e instanceof RecordApiError) setReport(e.report); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview?.report.valid || !confirmed || stale) return;
    setBusy(true); setError('');
    try {
      const value: unknown = rawMode ? JSON.parse(raw) : preparedRecord(record);
      const input = { ...payload(value), confirmed: true }, signature = JSON.stringify(input);
      const key = requestIds.current.get(signature) ?? crypto.randomUUID(); requestIds.current.set(signature, key);
      const next = await recordApi<RecordProject>('/api/record-projects/' + project.id + '/records', input, key);
      onSaved(next); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : '不能确认保存成功，请保留草稿并重新核对。'); if (e instanceof RecordApiError) setReport(e.report); }
    finally { setBusy(false); }
  }
  const selectedTarget = objectValue(record['target']);
  const targetWork = works.find(item => item.id === selectedTarget['id']);
  function multiple(label: string, key: string, options: Array<{ value: string; label: string }>, selected: string[], map?: (value: string) => unknown) {
    return <label className="field"><span>{label}</span><select multiple value={selected} onChange={event => {
      const values = Array.from(event.target.selectedOptions, item => item.value); update(key, map ? values.map(map) : values);
    }}>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small>可按住 Command / Ctrl 选择多项。</small></label>;
  }
  const evidenceOptions = project.records.evidence.filter(item => item.requirementId === reqId).map(item => ({ value: item.id, label: item.description }));
  function resultForm() {
    const result = record['result'];
    const block = objectValue(result);
    return <section className="record-edit-block"><h3>实际产出与结果</h3>
      <label className="scope-option"><input type="checkbox" checked={result !== null} onChange={event => update('result',
        event.target.checked ? { what: '', why: stringValue(record['rationale']), actualImpact: '', evidenceRefs: [] } : null)} />补充已经发生的实际结果</label>
      {result !== null && <><RecordField label="实际做了什么" value={stringValue(block['what'])} required onChange={value => update('result', { ...block, what: value })} />
        <RecordField label="实际为什么这样做" value={stringValue(block['why'])} required onChange={value => update('result', { ...block, why: value })} />
        <RecordField label="实际影响／结果" value={stringValue(block['actualImpact'])} required onChange={value => update('result', { ...block, actualImpact: value })} />
        <label className="field"><span>结果证据</span><select multiple value={listValue(block['evidenceRefs'])} onChange={event => update('result', { ...block,
          evidenceRefs: Array.from(event.target.selectedOptions, item => item.value) })}>{evidenceOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></>}
    </section>;
  }
  function prForm() {
    const pr = record['pullRequest'], block = objectValue(pr);
    return <section className="record-edit-block"><h3>唯一 PR 与交付说明</h3>
      <label className="scope-option"><input type="checkbox" checked={pr !== null} onChange={event => update('pullRequest',
        event.target.checked ? { url: '', what: '', why: '', verification: '', result: '' } : null)} />记录已存在的最终 PR</label>
      {pr !== null && Object.entries({ url: 'PR 地址', what: 'PR：做了什么', why: 'PR：为什么这样做',
        verification: 'PR：如何验证', result: 'PR：影响／结果' }).map(([key, label]) => <RecordField key={key} label={label} required
          value={stringValue(block[key])} onChange={value => update('pullRequest', { ...block, [key]: value })} />)}
      <p className="muted tiny">这里只记录 PR 和说明，不会代你推送或创建 PR。整体接受通过独立操作记录。</p>
    </section>;
  }
  return <RecordModal label={(edit.id ? '编辑' : '新增') + collectionLabels[edit.collection]} onClose={close}>
    <p className="muted">先编辑内容，再核对差异并确认。来源和观察证据采用追加更正。</p>
    {stale && <div className="notice" role="status">项目已更新，草稿已保留。请核对最新内容后再提交。
      <button className="secondary compact" type="button" onClick={() => { setBaseRevision(project.revision); setPreview(null); setConfirmed(false); }}>核对最新内容并保留草稿</button></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <IssuesList report={report} />
    {!preview ? <form onSubmit={event => { event.preventDefault(); void inspect(); }}>
      <fieldset disabled={busy} className="record-fieldset">
        <div className="record-editor-heading"><code>{stringValue(record['id'])}</code><button type="button" className="text-button" onClick={() => {
          if (rawMode) { try { const next: unknown = JSON.parse(raw); setRecord(objectValue(next)); setRawMode(false); setError(''); } catch { setError('记录格式不完整，草稿仍保留。'); } }
          else { setRaw(JSON.stringify(record, null, 2)); setRawMode(true); }
        }}>{rawMode ? '返回分块表单' : '高级编辑'}</button></div>
        {rawMode ? <label className="field"><span>记录内容（高级）</span><textarea className="record-raw-input" aria-label="记录内容（高级）" rows={20} maxLength={8 * 1024 * 1024} value={raw} onChange={event => setRaw(event.target.value)} /></label> : <>
          <section className="record-edit-block"><h3>问题、理由与预期</h3>
            {Object.entries(textLabels).filter(([key]) => key in record).map(([key, label]) =>
              <RecordField key={key} label={label} value={stringValue(record[key])} required onChange={value => update(key, value)} area={key !== 'title'} />)}
            {'scope' in record && <><RecordField label="包含范围（每行一项）" value={listValue(objectValue(record['scope'])['includes']).join('\n')} required
              onChange={value => update('scope', { ...objectValue(record['scope']), includes: lines(value) })} />
              <RecordField label="排除范围（每行一项）" value={listValue(objectValue(record['scope'])['excludes']).join('\n')}
                onChange={value => update('scope', { ...objectValue(record['scope']), excludes: lines(value) })} /></>}
            {'status' in record && <label className="field"><span>工作状态</span><select aria-label="工作状态" value={stringValue(record['status'])} onChange={event => update('status', event.target.value)}>
              {recordColumns.filter(item => edit.collection !== 'requirements' || item.status !== 'done').map(item => <option key={item.status} value={item.status}>{item.label}</option>)}</select></label>}
            {Object.entries(arrayLabels).filter(([key]) => key in record).map(([key, label]) => <RecordField key={key} label={label} required={['responsibilities','outputs','stages','exitConditions'].includes(key)}
              value={listValue(record[key]).join('\n')} onChange={value => update(key, lines(value))} />)}
          </section>
          {Array.isArray(record['acceptanceCriteria']) && <section className="record-edit-block"><h3>验收条件与验证方式</h3>
            {!record['acceptanceCriteria'].length && <p className="muted">尚未设条件；进入计划或完成前需补充。</p>}
            {record['acceptanceCriteria'].map((value: unknown, i) => {
              const item = objectValue(value);
              const change = (key: string, next: string): void => update('acceptanceCriteria',
                (record['acceptanceCriteria'] as unknown[]).map((entry, index) => index === i ? { ...objectValue(entry), [key]: next } : entry));
              return <div className="record-criterion-editor" key={stringValue(item['id'])}><small>条件 {i + 1} · {stringValue(item['id'])}</small>
                <RecordField label={'条件 ' + (i + 1)} value={stringValue(item['description'])} required onChange={value => change('description', value)} />
                <RecordField label={'验证方式 ' + (i + 1)} value={stringValue(item['verification'])} required onChange={value => change('verification', value)} />
                <button className="text-button" type="button" onClick={() => update('acceptanceCriteria', (record['acceptanceCriteria'] as unknown[]).filter((_, index) => index !== i))}>移除此条件</button></div>;
            })}
            <button className="secondary compact" type="button" onClick={() => update('acceptanceCriteria', [
              ...(record['acceptanceCriteria'] as unknown[]), { id: crypto.randomUUID(), description: '', verification: '' }
            ])}>添加验收条件</button>
          </section>}
          {'unitId' in record && <label className="field"><span>所属 Unit（可不选）</span><select value={stringValue(record['unitId'])} onChange={event => update('unitId', event.target.value || null)}>
            <option value="">直接归属 Requirement</option>{project.records.units.filter(item => item.requirementId === reqId).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
          {'storyIds' in record && multiple('安排的 Stories', 'storyIds', project.records.stories.filter(item => item.requirementId === reqId).map(item => ({ value: item.id, label: item.title })), listValue(record['storyIds']))}
          {'constructionType' in record && <label className="field"><span>计划类型</span><select value={stringValue(record['constructionType'])} onChange={event => update('constructionType', event.target.value)}><option value="simple">Simple</option><option value="ddd">DDD</option></select></label>}
          {'dependsOn' in record && multiple('依赖的拆解产物', 'dependsOn', works.filter(item => item.kind !== 'requirement' && item.id !== record['id']).map(item => ({ value: item.id, label: item.kind + ' · ' + item.title })),
            Array.isArray(record['dependsOn']) ? record['dependsOn'].map((item: unknown) => stringValue(objectValue(item)['id'])) : [],
            id => { const item = works.find(value => value.id === id); return { kind: item?.kind, id }; })}
          {'category' in record && <label className="field"><span>信息类型</span><select value={stringValue(record['category'])} onChange={event => {
            update('category', event.target.value); if (event.target.value === 'open_question') update('epistemicStatus', 'unknown');
          }}>{['decision','constraint','open_question','assumption','progress','fact'].map(value => <option key={value}>{value}</option>)}</select></label>}
          {'epistemicStatus' in record && <label className="field"><span>信息性质</span><select value={stringValue(record['epistemicStatus'])} onChange={event => update('epistemicStatus', event.target.value)}>
            <option value="proposed">建议／待核对</option><option value="confirmed">已确认的记录</option><option value="unknown">未知</option><option value="observed">有证据的观察记录</option></select></label>}
          {edit.collection === 'sources' && <><label className="field"><span>出处类型</span><select value={stringValue(record['kind'])} onChange={event => update('kind', event.target.value)}>
            {['reference','conversation','message','tool_output','human_observation'].map(value => <option key={value}>{value}</option>)}</select></label>
            <RecordField label="必要短摘录（最多 600 字符，可留空）" value={stringValue(record['excerpt'])} onChange={value => update('excerpt', value || null)} /></>}
          {edit.collection === 'evidence' && multiple('证据适用对象', 'targets', works.map(item => ({ value: item.id, label: item.kind + ' · ' + item.title })),
            Array.isArray(record['targets']) ? record['targets'].map((item: unknown) => stringValue(objectValue(item)['id'])) : [],
            id => { const item = works.find(value => value.id === id); return { kind: item?.kind, id }; })}
          {edit.collection === 'verifications' && <>
            <label className="field"><span>核查对象</span><select value={stringValue(selectedTarget['id'])} onChange={event => {
              const item = works.find(value => value.id === event.target.value); update('target', { kind: item?.kind, id: event.target.value }); update('criterionId', '');
            }}>{works.map(item => <option key={item.id} value={item.id}>{item.kind} · {item.title}</option>)}</select></label>
            <label className="field"><span>对应验收条件</span><select value={stringValue(record['criterionId'])} onChange={event => update('criterionId', event.target.value)}>
              <option value="">请选择</option>{targetWork?.acceptanceCriteria.map(item => <option key={item.id} value={item.id}>{item.description}</option>)}</select></label>
            <label className="field"><span>核查记录结果</span><select value={stringValue(record['outcome'])} onChange={event => update('outcome', event.target.value)}>
              <option value="unknown">未知</option><option value="passed">记录为通过</option><option value="failed">记录为失败</option></select></label>
            <label className="field"><span>检查方法</span><select value={stringValue(record['method'])} onChange={event => update('method', event.target.value)}>
              {['test','static_check','runtime_observation','human_observation','model_review','other'].map(value => <option key={value}>{value}</option>)}</select></label>
          </>}
          {'evidenceRefs' in record && multiple('关联证据', 'evidenceRefs', evidenceOptions, listValue(record['evidenceRefs']))}
          {'sourceRefs' in record && <details><summary>关联已有出处（另自动记录本次人端填写出处）</summary>
            {multiple('已有出处', 'sourceRefs', project.records.sources.map(item => ({ value: item.id, label: item.locator })), listValue(record['sourceRefs']))}</details>}
          {'result' in record && resultForm()}
          {'pullRequest' in record && prForm()}
        </>}
        <RecordField label="为什么进行这次变更" value={reason} required onChange={setReason} />
        <div className="modal-actions"><button type="button" className="secondary" onClick={close}>取消</button><button className="primary" disabled={busy || stale}>检查并预览差异</button></div>
      </fieldset>
    </form> : <section className="record-review">
      <h3>核对本次变更</h3><div className="revision-columns"><div><strong>修改前</strong><pre>{JSON.stringify(preview.before, null, 2)}</pre></div>
        <div><strong>修改后</strong><pre>{JSON.stringify(preview.after, null, 2)}</pre></div></div>
      {preview.warnings.length > 0 && <ul className="notice">{preview.warnings.map((value, i) => <li key={i}>{value}</li>)}</ul>}
      {preview.effects.length > 0 && <details className="record-json"><summary>核对关联内容的变化</summary><pre>{JSON.stringify(preview.effects, null, 2)}</pre></details>}
      <label className="scope-option"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已核对内容、影响和变更理由，确认保存</label>
      <div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => { setPreview(null); setConfirmed(false); }}>返回修改</button>
        <button className="primary" disabled={busy || stale || !confirmed || !preview.report.valid} onClick={() => void save()}>{busy ? '正在保存…' : '确认保存到项目'}</button></div>
    </section>}
  </RecordModal>;
}
