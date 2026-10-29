import type { ReactNode } from 'react';
import type { Board, Issue } from '../../domain/board.js';
import { ContentDetails } from './details.js';

export function IssueWorkspace({ board, issue, onSelect, onIntent, onProposal, onChange, records }: {
  board: Board; issue: Issue | undefined; onSelect: (id: string) => void;
  onIntent: () => void; onProposal: (id: string) => void; onChange: (id: string) => void; records: ReactNode;
}) {
  const proposal = issue && board.proposals.find(p => p.id === issue.sourceProposalId);
  const decision = issue && board.decisions.find(d => d.proposalId === issue.sourceProposalId);
  const parent = board.issues.find(i => i.id === issue?.parentIssueId);
  const children = board.issues.filter(i => i.parentIssueId === issue?.id);
  return <div className="issue-workspace"><section className="panel issue-navigation" aria-label="正式交付清单">
    <div className="section-heading"><h2>正式交付清单</h2><span className="tag">{board.issues.length} 个</span></div>
    <p className="muted tiny">按问题边界组织。以下均已纳入计划，尚未接入执行。</p>
    {!board.issues.length && <p className="records-empty">还没有正式 Issue。待审提案会保留在“提案与决定”中。</p>}
    {board.issues.map(item => <button key={item.id} className={'issue-option ' + (issue?.id === item.id ? 'active' : '')}
      onClick={() => onSelect(item.id)}><strong>{item.parentIssueId ? '↳ ' : ''}{item.title}</strong>
      <small>{item.parentIssueId ? '父：' + (board.issues.find(i => i.id === item.parentIssueId)?.title ?? item.parentIssueId) : '独立交付单元'}</small>
      <span className="muted tiny">{board.records.filter(entry => entry.issueId === item.id).length} 条记录</span></button>)}
  </section>
  {issue ? <article className="panel issue-detail" aria-label="Issue 详情">
    <div className="section-heading"><span className="eyebrow">DELIVERY UNIT</span><span className="tag">已计划 · 尚未执行</span></div>
    <h2>{issue.title}</h2>
    <div className="issue-links"><button className="text-button" onClick={onIntent}>关联 Intent：{board.intent.title} ↗</button>
      {parent && <button className="text-button" onClick={() => onSelect(parent.id)}>父 Issue：{parent.title} ↗</button>}</div>
    <p className="muted tiny">Issue ID：<code>{issue.id}</code></p>
    {proposal && <div className="change-summary"><strong>为什么纳入计划</strong><p>{proposal.reason}</p></div>}
    <p className="muted tiny">Issue v{issue.version} · 确认时 Intent v{issue.intentVersion}</p>
    {issue.intentVersion !== board.intent.version && <p className="notice">Intent 已修订，需重新核对本单元与当前意图的对应关系。现有内容保留，未自动视为适配新版意图。</p>}
    <ContentDetails content={issue} approved />
    {board.changes.filter(change => change.targetId === issue.id).length > 0 && <section className="revision-history" aria-label="Issue 修订历史"><h3>修订历史与决定</h3>
      {[...board.changes].reverse().filter(change => change.targetId === issue.id).map(change => <button className="text-button" key={change.id} onClick={() => onChange(change.id)}>
        {change.status === 'approved' ? '已应用' : change.status === 'pending' ? '待审' : change.status === 'returned' ? '已退回' : '已拒绝'} · 基于 v{change.baseVersion} · {change.reason} ↗</button>)}
    </section>}
    <section className="decision-record" aria-label="方案决定"><span className="tag green">人端已批准 · 初始提案决定</span>
      <p>{decision?.reason ?? '未补充说明'}</p><small>被审提案 v{decision?.proposalVersion ?? '未知'} · {decision ? new Date(decision.createdAt).toLocaleString('zh-CN') : '决定记录未知'}</small>
      <button className="text-button" onClick={() => onProposal(issue.sourceProposalId)}>查看原始提案与决定 ↗</button></section>
    {children.length > 0 && <section className="child-issues"><h3>子交付单元</h3>{children.map(child =>
      <button key={child.id} className="secondary compact" onClick={() => onSelect(child.id)}>{child.title} ↗</button>)}</section>}
    {records}
  </article> : <section className="panel"><p className="records-empty">正式清单将在提案经人工批准后建立。</p></section>}
  </div>;
}
