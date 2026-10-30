import { useId, useState } from 'react';
import type { Board, DecisionAction } from '../../domain/board.js';
import type { Change } from '../../domain/changes.js';

const labels: Record<string, string> = { title: '标题', problem: '源头问题', outcome: '预期结果',
  verification: '如何验证', scope: '范围与边界', solution: '方案', benefits: '预期收益', risks: '风险与代价', parentIssueId: '父 Issue' };
const statuses = { pending: '待你决定', approved: '已应用修订', returned: '已退回', rejected: '已拒绝' };
interface Versions { proposalVersion: number; intentVersion: number; planVersion: number }
export function ChangesWorkspace({ board, selected, onSelect, busy, onWrite }: {
  board: Board; selected: string; onSelect: (id: string) => void; busy: boolean;
  onWrite: (id: string, action: 'decisions' | 'authorization' | 'revoke-authorization', input: unknown) => void;
}) {
  const change = board.changes.find(item => item.id === selected);
  return <div className="review-grid"><section className="proposal-list" aria-label="关键变更列表">
    <div className="section-heading"><h2>关键变更</h2><span>{board.changes.length} 条</span></div>
    {!board.changes.length && <p>暂无关键变更建议。工具需先取得指定对象的提交权限，再通过 CLI change 提出建议。</p>}
    {[...board.changes].reverse().map(item => <button key={item.id} className={'proposal-card ' + (selected === item.id ? 'chosen' : '')}
      onClick={() => onSelect(item.id)}><span className={'status ' + item.status}>{statuses[item.status]}</span>
      <h3>{item.targetKind === 'intent' ? 'Intent 修订' : 'Issue 修订'}：{item.after.title}</h3>
      <p>{item.reason}</p><small>{item.sourceLabel} · 建议 v{item.version}</small></button>)}
  </section><section className="panel" aria-label="关键变更审阅">
    {change ? <ChangeReview key={change.id} board={board} change={change} busy={busy}
      onWrite={(action, input) => onWrite(change.id, action, input)} /> : <p>选择建议查看修改前后、理由与影响。未批准时正式内容保持有效。</p>}
  </section></div>;
}
function ChangeReview({ board, change, busy, onWrite }: {
  board: Board; change: Change; busy: boolean;
  onWrite: (action: 'decisions' | 'authorization' | 'revoke-authorization', input: unknown) => void;
}) {
  const id = useId();
  const snapshot = (): Versions => ({ proposalVersion: change.version, intentVersion: board.intent.version, planVersion: board.planVersion });
  const [reviewed, setReviewed] = useState(snapshot);
  const [action, setAction] = useState<DecisionAction>('approve');
  const [reasons, setReasons] = useState({ approve: '', return: '', reject: '' });
  const [summary, setSummary] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const staleReview = reviewed.proposalVersion !== change.version || reviewed.intentVersion !== board.intent.version || reviewed.planVersion !== board.planVersion;
  const currentVersion = change.targetKind === 'intent' ? board.intent.version : board.issues.find(issue => issue.id === change.targetId)?.version;
  const staleBase = change.baseVersion !== currentVersion || change.intentVersion !== board.intent.version || change.planVersion !== board.planVersion;
  const authorization = change.authorizations.find(item => item.revokedAt === null);
  const diffs = Object.entries(change.after).filter(([key, value]) => value !== change.before[key as keyof typeof change.before]);
  const reasonLabel = { approve: '补充说明（选填）', return: '退回原因（必填）', reject: '拒绝原因（必填）' }[action];
  function display(key: string, value: unknown): string {
    if (value === null) return '无';
    if (key === 'parentIssueId' && typeof value === 'string') return board.issues.find(issue => issue.id === value)?.title ?? value;
    return String(value);
  }
  return <><div className="section-heading"><span className="eyebrow">REVIEW THE REVISION</span>
    <span className={'status ' + change.status}>{statuses[change.status]}</span></div>
    <h2>{change.targetKind === 'intent' ? 'Intent 修订' : 'Issue 修订'}：{change.after.title}</h2>
    <p className="muted tiny">对象：{change.targetId} · 基于对象 v{change.baseVersion} / Intent v{change.intentVersion} / 计划 v{change.planVersion}</p>
    <div className="change-summary"><strong>为什么变动</strong><p>{change.reason}</p><strong>预期影响、收益与风险</strong><p>{change.impact}</p></div>
    <p className="muted">批准仅应用下面这份修订，不增加工具或执行权限。
      {change.targetKind === 'intent' && '当前 ' + board.issues.length + ' 个正式 Issue 将保留原内容，并标记需要对照新意图核对。'}</p>
    <section aria-label="修改前后" className="revision-diffs">
      {!diffs.length && <p>内容未变，本次仅重新确认该 Issue 与当前 Intent 的对应关系。</p>}
      {diffs.map(([key, value]) => <div className="revision-field" key={key}><h3>{labels[key] ?? key}</h3>
        <div className="revision-columns"><div><strong>修改前</strong><p>{display(key, change.before[key as keyof typeof change.before])}</p></div>
          <div><strong>修改后</strong><p>{display(key, value)}</p></div></div></div>)}
    </section>
    <p className="muted tiny">来源：{change.sourceLabel} · {new Date(change.createdAt).toLocaleString('zh-CN')} · 建议 {change.id}</p>
    {change.targetKind === 'intent' && <section className="intent-authorization" aria-label="Intent 商讨与授权">
      <h3>先商讨，再明确授权</h3><p className="muted tiny">这里由本人记录已经完成的外部商讨及明确授权，不由 Agent 摘要代替。登记授权不会立即修改 Intent。</p>
      {change.authorizations.map(item => <div className="decision-record" key={item.id}>
        <strong>{item.revokedAt ? '授权已撤销' : '本人已登记商讨并明确授权本修订'}</strong>
        <p>{item.summary}</p><p className="muted tiny">商讨来源：{item.sourceRef} · {new Date(item.createdAt).toLocaleString('zh-CN')}</p>
        {change.status === 'pending' && !item.revokedAt && <button className="secondary compact" disabled={busy || staleReview}
          onClick={() => onWrite('revoke-authorization', { proposalVersion: reviewed.proposalVersion })}>撤销本修订授权</button>}
      </div>)}
      {change.status === 'pending' && !authorization && !staleBase && <form onSubmit={event => {
        event.preventDefault();
        if (confirmed && !staleReview) onWrite('authorization', { ...reviewed, summary, sourceRef, confirmed });
      }}>
        <div className="field"><label htmlFor={id + '-summary'}>商讨结论与授权边界（必填）</label>
          <textarea id={id + '-summary'} required maxLength={4000} disabled={busy} value={summary} onChange={event => setSummary(event.target.value)} /></div>
        <div className="field"><label htmlFor={id + '-source'}>商讨来源（必填）</label>
          <input id={id + '-source'} required maxLength={2000} disabled={busy} value={sourceRef} onChange={event => setSourceRef(event.target.value)} /></div>
        <label className="scope-option"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          我已完成商讨，明确授权应用本页这份 Intent 修订</label>
        <button className="secondary" disabled={busy || staleReview || !confirmed || !summary.trim() || !sourceRef.trim()}>登记商讨与明确授权</button>
      </form>}
    </section>}
    {change.status === 'pending' ? <form className="decision-form" onSubmit={event => {
      event.preventDefault(); if (!staleReview) onWrite('decisions', { ...reviewed, action, reason: reasons[action] });
    }}><h3>你的决定</h3>
      {staleBase && <p className="error">建议的基准已失效，不能应用。可退回并根据最新快照另提建议，原文将保留。</p>}
      {staleReview && <div className="notice" role="status">计划或授权状态已变化，输入已保留，请重新核对。
        <button type="button" className="secondary compact" disabled={busy} onClick={() => setReviewed(snapshot())}>核对最新变更并继续</button></div>}
      {change.targetKind === 'intent' && !authorization && <p>批准前须先登记商讨与明确授权。</p>}
      <div className="decision-options">{(['approve', 'return', 'reject'] as const).map(value => <label key={value}>
        <input type="radio" name={id + '-action'} checked={action === value} disabled={busy} onChange={() => setAction(value)} />
        {{ approve: '批准应用修订', return: '退回补充', reject: '拒绝' }[value]}</label>)}</div>
      <div className="field"><label htmlFor={id + '-reason'}>{reasonLabel}</label>
        <textarea id={id + '-reason'} required={action !== 'approve'} maxLength={4000} disabled={busy} value={reasons[action]}
          onChange={event => setReasons(previous => ({ ...previous, [action]: event.target.value }))} /></div>
      <button className="primary full" disabled={busy || staleReview || (action !== 'approve' && !reasons[action].trim()) ||
        (action === 'approve' && (staleBase || (change.targetKind === 'intent' && !authorization)))}>
        {{ approve: '确认应用修订', return: '确认退回补充', reject: '确认拒绝' }[action]}</button>
    </form> : <section className="decision-record" aria-label="修订决定">
      <strong>人端决定 · {statuses[change.status]}</strong><p>{change.decision?.reason ?? '未补充说明'}</p>
      <small>被审建议 v{change.decision?.proposalVersion} · {change.decision && new Date(change.decision.createdAt).toLocaleString('zh-CN')}</small>
    </section>}
  </>;
}
