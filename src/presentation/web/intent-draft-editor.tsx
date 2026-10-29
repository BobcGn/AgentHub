import { useEffect, useRef, useState } from 'react';
import type { RecordEditPreview, RecordProject } from '../../domain/record-project.js';
import { IssuesList, RecordApiError, recordApi, RecordField, RecordModal } from './record-editor.js';
import { lines } from './record-ui.js';

export function IntentDraftEditor({ project, onClose, onSaved }: {
  project: RecordProject; onClose: () => void; onSaved: (project: RecordProject) => void;
}) {
  const [baseRevision, setBaseRevision] = useState(project.revision);
  const [values, setValues] = useState(() => {
    const intent = project.records.intent;
    return { title: intent.title, problem: intent.problem, expectedOutcome: intent.expectedOutcome,
      includes: intent.scope.includes.join('\n'), excludes: intent.scope.excludes.join('\n'), constraints: intent.constraints.join('\n') };
  });
  const [preview, setPreview] = useState<RecordEditPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const requestIds = useRef(new Map<string, string>());
  const stale = project.revision !== baseRevision;
  useEffect(() => { if (stale) { setPreview(null); setConfirmed(false); } }, [stale]);
  const input = () => ({ ...values, baseRevision,
    includes: lines(values.includes).map(value => value.trim()).filter(Boolean),
    excludes: lines(values.excludes).map(value => value.trim()).filter(Boolean),
    constraints: lines(values.constraints).map(value => value.trim()).filter(Boolean) });
  async function perform(save: boolean) {
    setBusy(true); setError('');
    try {
      if (!save) setPreview(await recordApi<RecordEditPreview>('/api/record-projects/' + project.id + '/intent-draft-preview', input()));
      else {
        const data = { ...input(), confirmed: true }, signature = JSON.stringify(data);
        const key = requestIds.current.get(signature) ?? crypto.randomUUID(); requestIds.current.set(signature, key);
        const next = await recordApi<RecordProject>('/api/record-projects/' + project.id + '/intent-draft', data, key);
        requestIds.current.delete(signature); onSaved(next); onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存结果不明，请先核对项目记录。');
      if (e instanceof RecordApiError && e.report) setPreview(previous => previous ? { ...previous, report: e.report ?? previous.report } : null);
    } finally { setBusy(false); }
  }
  return <RecordModal label="完善意图草稿" onClose={() => { if (!busy) onClose(); }}>
    <p className="notice">可以只填写当前已明确的部分，之后继续补充。保存草稿不代表确认意图，也不会启动运行。</p>
    {stale && <section className="error" role="alert"><p>项目已更新，草稿已保留。请核对最新意图后重新预览。</p>
      <details><summary>查看最新意图</summary><pre>{JSON.stringify(project.records.intent, null, 2)}</pre></details>
      <button className="secondary" disabled={busy || project.records.intent.confirmation.state !== 'proposed'}
        onClick={() => { setBaseRevision(project.revision); setPreview(null); setConfirmed(false); }}>核对最新意图并保留草稿</button></section>}
    {project.records.intent.confirmation.state !== 'proposed' && <p role="alert" className="error">意图已确认，不能再通过草稿入口修改。</p>}
    <fieldset disabled={busy || preview !== null} className="record-fieldset">
      {Object.entries({ title: '意图标题', problem: '源头问题', expectedOutcome: '意图预期结果',
        includes: '意图包含范围（每行一项）', excludes: '意图排除范围（每行一项）', constraints: '意图约束（每行一项）' }).map(([field,label]) =>
        <RecordField key={field} label={label} value={values[field as keyof typeof values]} area={field !== 'title'}
          onChange={value => { setValues(previous => ({ ...previous, [field]: value })); setPreview(null); setConfirmed(false); }} />)}
    </fieldset>
    {preview && <section><h3>核对意图草稿变更</h3><p className="muted">左侧为保存前，右侧为本次草稿。尚未确认的内容不会成为正式推进依据。</p>
      <div className="revision-columns"><pre>{JSON.stringify(preview.before, null, 2)}</pre><pre>{JSON.stringify(preview.after, null, 2)}</pre></div>
      <IssuesList report={preview.report} />
      <label className="scope-option"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已核对差异，保存为未确认草稿</label>
    </section>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => preview ? (setPreview(null), setConfirmed(false)) : onClose()}>{preview ? '返回修改' : '取消'}</button>
      {preview ? <button className="primary" disabled={busy || stale || !confirmed || !preview.report.valid || project.records.intent.confirmation.state !== 'proposed'} onClick={() => void perform(true)}>保存意图草稿</button>
        : <button className="primary" disabled={busy || stale || project.records.intent.confirmation.state !== 'proposed'} onClick={() => void perform(false)}>检查并预览草稿</button>}</div>
  </RecordModal>;
}
