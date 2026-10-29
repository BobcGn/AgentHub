import type { IssueContent } from '../../domain/board.js';

export function Detail({ label, value }: { label: string; value: string }) {
  return <div className="detail"><h3>{label}</h3><p>{value}</p></div>;
}
export function ContentDetails({ content, approved = false }: { content: IssueContent; approved?: boolean }) {
  return <><Detail label="做什么 / 解决什么问题" value={content.problem} /><Detail label="范围与边界" value={content.scope} />
    <Detail label={approved ? '已批准方案' : '建议方案'} value={content.solution} />
    <div className="tradeoffs"><Detail label="预期收益" value={content.benefits} /><Detail label="风险与代价" value={content.risks} /></div>
    <Detail label="如何验证" value={content.verification} /></>;
}
