import { useId } from 'react';
import type { Board, BoardEntry, RecordKind } from '../../domain/board.js';

export const kindLabels: Record<RecordKind, string> = {
  discussion: '讨论摘要', note: '备注', agent_report: 'Agent 报告'
};
export interface RecordDraft { kind: RecordKind; body: string; sourceRef: string }
export const blankRecordDraft = (): RecordDraft => ({ kind: 'discussion', body: '', sourceRef: '' });

export function RecordsFeed({ entries, board, onIssue }: {
  entries: BoardEntry[]; board: Board; onIssue?: (id: string) => void;
}) {
  if (!entries.length) return <p className="records-empty">暂无记录。讨论结论、备注和报告会保留来源与关联对象。</p>;
  return <ol className="records-feed">{[...entries].reverse().map(entry => <li key={entry.id}>
    <div className="section-heading"><span className="tag">{kindLabels[entry.kind]}</span>
      <span className="muted tiny">{new Date(entry.createdAt).toLocaleString('zh-CN')}</span></div>
    <p className="record-body">{entry.body}</p>
    {entry.sourceRef && <p className="muted tiny">记录者提供的外部来源：{entry.sourceRef}</p>}
    <div className="record-provenance"><span>{entry.source.kind === 'tool' ? '工具写入' : '人端记录'} · {entry.source.label} · Intent v{entry.intentVersion}</span>
      {entry.issueId && onIssue ? <button className="text-button" onClick={() => onIssue(entry.issueId ?? '')}>
        关联 Issue：{board.issues.find(issue => issue.id === entry.issueId)?.title ?? entry.issueId} ↗</button>
        : <span>{entry.issueId ? '关联 Issue：' + entry.issueId : '关联当前 Intent'}</span>}</div>
    <small className="record-status">{entry.kind === 'agent_report' ? 'Agent 报告 · 未经实际运行核验' :
      entry.kind === 'discussion' ? '讨论记录 · 不自动成为用户决定' : '普通备注 · 不改变正式计划'}</small>
  </li>)}</ol>;
}

export function RecordsPanel({ board, issueId, draft, onDraft, onSave, busy }: {
  board: Board; issueId: string | null; draft: RecordDraft; onDraft: (draft: RecordDraft) => void;
  onSave: () => void; busy: boolean;
}) {
  const id = useId();
  const entries = board.records.filter(entry => entry.issueId === issueId);
  return <section className="records-panel" aria-label={issueId ? 'Issue 记录' : 'Intent 记录'}>
    <div className="section-heading"><h2>{issueId ? '该 Issue 的讨论与记录' : 'Intent 的讨论与记录'}</h2>
      <span className="muted tiny">{entries.length} 条</span></div>
    <p className="muted tiny">记录用于保留外部讨论与过程信息；正式方案和用户决定可在原提案中追溯。这里的内容不会修改意图或验收条件。</p>
    <form className="record-form" onSubmit={event => { event.preventDefault(); onSave(); }}>
      <div className="field"><label htmlFor={id + '-kind'}>记录类型</label>
        <select id={id + '-kind'} disabled={busy} value={draft.kind} onChange={event => onDraft({ ...draft, kind: event.target.value as RecordKind })}>
          {Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></div>
      <div className="field"><label htmlFor={id + '-body'}>记录内容</label>
        <textarea id={id + '-body'} required rows={4} maxLength={4000} disabled={busy} value={draft.body}
          placeholder="记录讨论结论、需要关注的事项或 Agent 报告。"
          onChange={event => onDraft({ ...draft, body: event.target.value })} /></div>
      <div className="field"><label htmlFor={id + '-source'}>外部来源（选填）</label>
        <input id={id + '-source'} maxLength={2000} disabled={busy} value={draft.sourceRef}
          placeholder="例如：外部对话标题或链接，仅作为记录者提供的线索"
          onChange={event => onDraft({ ...draft, sourceRef: event.target.value })} /></div>
      <div className="record-form-footer"><small>人端追加 · 保存后保留原文，后续可追加更正</small>
        <button className="primary" disabled={busy || !draft.body.trim()}>{busy ? '正在保存…' : '追加记录'}</button></div>
    </form>
    <RecordsFeed entries={entries} board={board} />
  </section>;
}
