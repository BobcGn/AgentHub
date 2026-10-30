import { useId, useState } from 'react';
import type { Board, RecordKind, RecordScope } from '../../domain/board.js';
import type { ChangeScope } from '../../domain/changes.js';
import { kindLabels } from './records.js';

export function ToolScopeForm({ board, busy, onIssue }: {
  board: Board; busy: boolean; onIssue: (label: string, recordScope: RecordScope | undefined, changeScope: ChangeScope | undefined) => void;
}) {
  const id = useId();
  const [label, setLabel] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [intent, setIntent] = useState(false);
  const [issueIds, setIssueIds] = useState<string[]>([]);
  const [kinds, setKinds] = useState<RecordKind[]>([]);
  const [changeEnabled, setChangeEnabled] = useState(false);
  const [changeIntent, setChangeIntent] = useState(false);
  const [changeIssues, setChangeIssues] = useState<string[]>([]);
  const invalid = (changeEnabled && !changeIntent && !changeIssues.length) || enabled && ((!intent && !issueIds.length) || !kinds.length);
  return <form className="scope-form" onSubmit={event => {
    event.preventDefault();
    if (!invalid) onIssue(label, enabled ? { intent, issueIds, kinds } : undefined, changeEnabled ? { intent: changeIntent, issueIds: changeIssues } : undefined);
  }}>
    <div className="field"><label htmlFor={id}>工具来源名称</label><input id={id} required maxLength={120}
      disabled={busy} value={label} onChange={event => setLabel(event.target.value)} /></div>
    <label className="scope-option"><input type="checkbox" checked={enabled} disabled={busy}
      onChange={event => setEnabled(event.target.checked)} />允许追加普通记录</label>
    {enabled && <div className="scope-boundary">
      <fieldset disabled={busy}><legend>允许追加的对象</legend>
        <label className="scope-option"><input type="checkbox" checked={intent} onChange={event => setIntent(event.target.checked)} />当前 Intent</label>
        {board.issues.map(issue => <label key={issue.id} className="scope-option"><input type="checkbox" checked={issueIds.includes(issue.id)}
          onChange={event => setIssueIds(previous => event.target.checked ? [...previous, issue.id] : previous.filter(value => value !== issue.id))} />
          Issue：{issue.title}</label>)}
        {!board.issues.length && <small className="muted">尚无正式 Issue，可先仅允许当前 Intent。</small>}
      </fieldset>
      <fieldset disabled={busy}><legend>允许的记录类型</legend>
        {(Object.keys(kindLabels) as RecordKind[]).map(kind => <label key={kind} className="scope-option"><input type="checkbox" checked={kinds.includes(kind)}
          onChange={event => setKinds(previous => event.target.checked ? [...previous, kind] : previous.filter(value => value !== kind))} />{kindLabels[kind]}</label>)}
      </fieldset>
      <p className="muted tiny">范围按当前勾选的具体对象保存，后续新增 Issue 不会自动加入。记录不能变更正式内容或成为可信验收。</p>
      {invalid && <p className="muted tiny">至少选择一个对象和一种记录类型后才能发放。</p>}
    </div>}
    <label className="scope-option"><input type="checkbox" disabled={busy} checked={changeEnabled}
      onChange={event => setChangeEnabled(event.target.checked)} />允许提交关键变更建议</label>
    {changeEnabled && <fieldset className="scope-boundary" disabled={busy}><legend>允许提议修订的对象</legend>
      <label className="scope-option"><input type="checkbox" checked={changeIntent}
        onChange={event => setChangeIntent(event.target.checked)} />变更对象：当前 Intent</label>
      {board.issues.map(issue => <label className="scope-option" key={issue.id}><input type="checkbox" checked={changeIssues.includes(issue.id)}
        onChange={event => { const checked = event.target.checked; setChangeIssues(previous => checked ? [...previous, issue.id] : previous.filter(value => value !== issue.id)); }} />
        变更对象：{issue.title}</label>)}
      <p className="muted tiny">只允许提交候选建议，未批准不修改正式内容。Intent 应用还需要本人登记商讨与明确授权。</p>
    </fieldset>}
    <div className="record-form-footer"><small>始终允许读取当前项目和提议新增 Issue；无审批或执行权限。</small>
      <button className="primary" disabled={busy || !label.trim() || invalid}>发放工具令牌</button></div>
  </form>;
}

export function ScopeBoundary({ scope, board }: { scope: { recordScope?: RecordScope; changeScope?: ChangeScope }; board: Board }) {
  const boundary = scope.recordScope;
  return <><small>可提议修订：{scope.changeScope ? [...(scope.changeScope.intent ? ['当前 Intent'] : []), ...scope.changeScope.issueIds.map(id => board.issues.find(issue => issue.id === id)?.title ?? id)].join('、') : '无关键变更建议权限'}</small>
    {!boundary ? <small>无普通记录追加权限</small> : <small>可追加：{[...(boundary.intent ? ['当前 Intent'] : []),
    ...boundary.issueIds.map(id => board.issues.find(issue => issue.id === id)?.title ?? id)].join('、')}<br />
    类型：{boundary.kinds.map(kind => kindLabels[kind]).join('、')}</small>}</>;
}
