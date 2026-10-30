import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Board, DecisionAction, Proposal, ToolScope } from '../../domain/board.js';
import { ContentDetails, Detail } from './details.js';
import { IssueWorkspace } from './issues.js';
import { blankRecordDraft, RecordsFeed, RecordsPanel } from './records.js';
import type { RecordDraft } from './records.js';
import { ScopeBoundary, ToolScopeForm } from './tool-scope.js';
import { ChangesWorkspace } from './changes.js';
import './style.css';
import { RecordProjectsWorkspace } from './record-workspace.js';

class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
async function api<T>(path: string, input?: unknown, key?: string): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(10_000), ...(input === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(input)
  }) });
  const data = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new ApiError(response.status, data.error?.message ?? '请求失败。');
  return data as T;
}
function Field({ label, name, area = false, hint, ...props }: {
  label: string; name: string; area?: boolean; hint?: string; required?: boolean; type?: string; maxLength?: number;
}) {
  const id = useId();
  return <label className="field" htmlFor={id}><span>{label}</span>
    {area ? <textarea id={id} name={name} rows={3} maxLength={4000} {...props} /> :
      <input id={id} name={name} maxLength={200} {...props} />}
    {hint && <small>{hint}</small>}</label>;
}
const statusText = { pending: '待你决定', approved: '已纳入计划', rejected: '已拒绝', returned: '已退回' };
const actionText = { approve: '批准纳入', reject: '拒绝', return: '退回补充' };
interface ReviewVersions { proposalVersion: number; intentVersion: number; planVersion: number }

function App() {
  const [recordMode, setRecordMode] = useState(() => new URLSearchParams(window.location.search).get('view') !== 'legacy');
  const [migratedIds, setMigratedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState<'overview' | 'review' | 'issues' | 'records' | 'changes'>('overview');
  const [proposalId, setProposalId] = useState('');
  const [changeId, setChangeId] = useState('');
  const [issueId, setIssueId] = useState('');
  const [recordTarget, setRecordTarget] = useState('all');
  const [recordDrafts, setRecordDrafts] = useState<Record<string, RecordDraft>>({});
  const [creating, setCreating] = useState(false);
  const [scopesOpen, setScopesOpen] = useState(false);
  const [credential, setCredential] = useState<{ token: string; scope: ToolScope } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const requests = useRef(new Map<string, string>());
  const [syncState, setSyncState] = useState<'connecting' | 'live' | 'offline' | 'expired'>('connecting');
  const [syncError, setSyncError] = useState('');
  const sessionGeneration = useRef(0);
  const refreshAgain = useRef(false);
  const refreshFlight = useRef<{ generation: number; promise: Promise<void> } | null>(null);

  function refresh(): Promise<void> {
    const generation = sessionGeneration.current;
    const current = refreshFlight.current;
    if (current?.generation === generation) {
      refreshAgain.current = true;
      return current.promise;
    }
    const promise = (async () => {
      do {
        refreshAgain.current = false;
        const result = await api<Board[]>('/api/boards');
        if (generation !== sessionGeneration.current) return;
        setBoards(result);
        setAuthenticated(true);
        setSelected(previous => result.some(b => b.project.id === previous) ? previous : result[0]?.project.id ?? '');
        setSyncError('');
      } while (refreshAgain.current);
    })();
    const flight = { generation, promise };
    refreshFlight.current = flight;
    const clear = (): void => { if (refreshFlight.current === flight) refreshFlight.current = null; };
    void promise.then(clear, clear);
    return promise;
  }
  useEffect(() => {
    refresh().catch((e: unknown) => {
      if (!(e instanceof ApiError && e.status === 401)) setError(message(e));
    }).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let disposed = false;
    let expired = false;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    const update = (): void => {
      if (disposed || expired || !navigator.onLine) return;
      void refresh().then(() => {
        clearTimeout(retry); retry = undefined;
      }, (e: unknown) => {
        if (disposed) return;
        setSyncError(message(e));
        if (e instanceof ApiError && e.status === 401) {
          expired = true; source?.close(); setSyncState('expired');
        } else if (retry === undefined) {
          retry = setTimeout(() => { retry = undefined; update(); }, 2000);
        }
      });
    };
    const connect = (): void => {
      if (disposed || expired) return;
      clearTimeout(reconnect); reconnect = undefined;
      source?.close();
      if (!navigator.onLine) { source = null; setSyncState('offline'); return; }
      setSyncState('connecting');
      const connection = new EventSource('/api/events');
      source = connection;
      connection.onopen = () => { if (!disposed && source === connection) { setSyncState('live'); update(); } };
      connection.onmessage = update;
      connection.onerror = () => {
        if (disposed || source !== connection) return;
        setSyncState('offline');
        if (connection.readyState === EventSource.CLOSED) {
          update();
          reconnect ??= setTimeout(() => { reconnect = undefined; connect(); }, 2000);
        }
      };
      connection.addEventListener('session-expired', () => {
        expired = true; connection.close(); setSyncState('expired');
      });
    };
    const offline = (): void => { source?.close(); source = null; setSyncState('offline'); };
    const visible = (): void => { if (document.visibilityState === 'visible') update(); };
    connect();
    window.addEventListener('online', connect);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      source?.close();
      clearTimeout(retry);
      clearTimeout(reconnect);
      window.removeEventListener('online', connect);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [authenticated]);
  async function post<T>(path: string, input: unknown, idempotent = true): Promise<T> {
    const fingerprint = path + JSON.stringify(input);
    const key = requests.current.get(fingerprint) ?? crypto.randomUUID();
    if (idempotent) requests.current.set(fingerprint, key);
    const result = await api<T>(path, input, idempotent ? key : undefined);
    requests.current.delete(fingerprint);
    return result;
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  async function logout() {
    await run(async () => {
      try { await api('/api/logout', {}); }
      catch (e) { if (!(e instanceof ApiError && e.status === 401)) throw e; }
      sessionGeneration.current += 1;
      setAuthenticated(false); setBoards([]); setCredential(null); setCreating(false); setScopesOpen(false); setRecordDrafts({}); setChangeId(''); setIssueId(''); setRecordTarget('all');
    });
  }
  function formData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    return Object.fromEntries(new FormData(event.currentTarget).entries());
  }
  if (!ready) return <main className="loading" role="status">正在读取本地工作区…</main>;
  if (!authenticated) return <main className="login-shell">
    <div className="login-story"><Brand /><span className="eyebrow">A PLACE TO UNDERSTAND YOUR WORK</span>
      <h1>理解之后，<br />再向前一步。</h1><p>让每一个交付单元，都能说清做什么、为什么，以及如何验证。</p>
      <div className="story-line"><span>01 明确意图</span><span>02 审视取舍</span><span>03 人工决定</span></div></div>
    <section className="login-card"><span className="eyebrow">LOCAL WORKSPACE · B3</span><h2>进入你的工作区</h2>
      <p className="muted">使用终端初始化时设置的人端密码。</p>
      <form onSubmit={event => { const data = formData(event); void run(async () => {
        await api('/api/login', { password: data['password'] }); await refresh();
      }); }}>
        <Field label="人端密码" name="password" type="password" maxLength={256} required />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary full" disabled={busy}>{busy ? '正在登录…' : '进入工作区 →'}</button>
      </form><p className="setup-tip">第一次使用？在交互终端运行 <code>npm run setup</code>。</p>
      <p className="security-note">本地试用版。请使用演示数据；同一系统用户下的 Agent 隔离尚未验证。</p>
    </section>
  </main>;

  if (recordMode) return <RecordProjectsWorkspace legacyBoards={boards} onLogout={logout} syncState={syncState} syncError={syncError}
    onLegacy={ids => { setMigratedIds(ids); setRecordMode(false); }} />;
  const visibleLegacyBoards = boards.filter(item => !migratedIds.includes(item.project.id));
  const board = visibleLegacyBoards.find(b => b.project.id === selected);
  const pending = board?.proposals.filter(p => p.status === 'pending') ?? [];
  const pendingChanges = board?.changes.filter(change => change.status === 'pending') ?? [];
  const proposal = board?.proposals.find(p => p.id === proposalId);
  const selectedIssue = board?.issues.find(issue => issue.id === issueId) ?? board?.issues[0];
  function openIssue(id: string) { setIssueId(id); setTab('issues'); }
  function recordsPanel(target: string | null) {
    if (!board) return null;
    const key = target ?? board.intent.id;
    const draft = recordDrafts[key] ?? blankRecordDraft();
    return <RecordsPanel key={key} board={board} issueId={target} draft={draft} busy={busy}
      onDraft={value => setRecordDrafts(previous => ({ ...previous, [key]: value }))}
      onSave={() => void run(async () => {
        await post('/api/projects/' + board.project.id + '/records', { ...draft, issueId: target, intentVersion: board.intent.version });
        setRecordDrafts(previous => ({ ...previous, [key]: blankRecordDraft() }));
        setNotice('记录已追加，正式计划与用户决定保持不变。');
        await refresh();
      })} />;
  }
  return <div className="workspace">
    <aside className="sidebar"><Brand /><div className="workspace-label"><span className="live-dot" /> 本地工作区 <span className="version">B3</span></div>
      <div className="nav-label">项目 <button className="icon-button" aria-label="新建项目" onClick={() => setCreating(true)}>＋</button></div>
      <button className="text-button" onClick={() => setRecordMode(true)}>返回 Requirement 看板 ↗</button>
      <p className="muted tiny">旧版入口仅供未迁移项目使用。</p>
      <nav aria-label="项目列表">{visibleLegacyBoards.map(b => <button key={b.project.id} className={'project-link ' + (b.project.id === selected ? 'active' : '')}
        onClick={() => { setSelected(b.project.id); setProposalId(''); setCredential(null); setScopesOpen(false); setIssueId(''); setRecordTarget('all'); setChangeId(''); }}>
        <span className="project-symbol" aria-hidden="true">{b.project.name.slice(0, 1).toUpperCase()}</span><span>{b.project.name}</span></button>)}</nav>
      {!boards.length && <p className="sidebar-empty">从一个明确的意图开始。</p>}
      <div className="sidebar-bottom"><div className="human-avatar">你</div><div><strong>人端决策者</strong><small>意图与决定，由你掌握</small></div>
        <button className="text-button" onClick={() => void logout()} disabled={busy}>退出</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><span>工作区 <span className="slash">/</span> {board?.project.name ?? '欢迎'}</span>
      <div className="topbar-actions"><span className="local-badge">LOCAL ONLY</span><button className="text-button mobile-exit" disabled={busy} onClick={() => void logout()}>退出</button>
        <button className="secondary compact" disabled={busy} onClick={() => void run(refresh)}>刷新</button></div></header>
      <div className="page-body">
        <p className={'sync-state ' + syncState} role="status" aria-label="自动同步状态">
          {syncState === 'live' ? '自动同步已连接' : syncState === 'connecting' ? '正在连接自动同步…' :
            syncState === 'expired' ? '会话已失效，请退出后重新登录。' : '自动同步已断开，正在尝试重连；当前显示上次读取内容，可手动刷新。'}
        </p>
        {syncError && syncError !== error && <div className="error banner" role="alert">自动读取失败：{syncError} 当前保留上次内容，恢复连接或刷新后重试。</div>}
        {error && <div className="error banner" role="alert">{error} <span>读取失败时保留上次内容；刷新核对后再决定。</span></div>}
        {notice && <div className="notice banner" role="status">{notice}</div>}
        {!board ? <section className="welcome"><span className="eyebrow">YOUR FIRST INTENT</span><h1>你想解决什么问题？</h1>
          <p>先记录问题、预期结果和验证方式。工具提交建议后，由你决定是否纳入正式计划。</p>
          <button className="primary" onClick={() => setCreating(true)}>建立第一个项目 →</button></section> : <>
          <div className="page-heading"><div><span className="eyebrow">PROJECT WORKSPACE</span><h1>{board.project.name}</h1>
            <p className="muted">将意图、方案与决定放在同一条线上。</p></div>
            <button className="secondary" onClick={() => { setScopesOpen(!scopesOpen); setCredential(null); }}>管理工具范围 ↗</button></div>
          <div className="stats"><Stat number="01" label="已确认 Intent" /><Stat number={String(board.issues.length).padStart(2, '0')} label="正式交付单元" />
            <Stat number={String(pending.length + pendingChanges.length).padStart(2, '0')} label="等待你的决定" warm />
            <div className="stat-note"><span className="live-dot" /><span>计划版本 v{board.planVersion}<small>批准新增或修订后更新</small></span></div></div>
          <nav className="tabs" aria-label="工作区视图">
            <button className={tab === 'overview' ? 'selected' : ''} onClick={() => setTab('overview')}>意图概览</button>
            <button className={tab === 'review' ? 'selected' : ''} onClick={() => setTab('review')}>提案与决定 <span>{pending.length}</span></button>
            <button className={tab === 'issues' ? 'selected' : ''} onClick={() => setTab('issues')}>正式 Issue <span>{board.issues.length}</span></button>
            <button className={tab === 'records' ? 'selected' : ''} onClick={() => setTab('records')}>讨论与记录 <span>{board.records.length}</span></button>
            <button className={tab === 'changes' ? 'selected' : ''} onClick={() => setTab('changes')}>关键变更 <span>{board.changes.filter(change => change.status === 'pending').length}</span></button>
          </nav>
          {tab === 'changes' && <ChangesWorkspace key={board.project.id} board={board} selected={changeId} onSelect={setChangeId} busy={busy}
            onWrite={(id, action, input) => void run(async () => {
              await post('/api/projects/' + board.project.id + '/changes/' + id + '/' + action, input);
              setNotice(action === 'authorization' ? '已登记商讨与明确授权，Intent 尚未修改。请核对后审批。' :
                action === 'revoke-authorization' ? '本修订授权已撤销，原意图保持有效。' : '决定已保存，请核对正式内容与修订历史。');
              await refresh();
            })} />}
          {scopesOpen && <section className="panel scope-panel"><div className="section-heading"><h2>划定工具写入范围</h2><span className="tag">仅当前 Intent</span></div>
            <p className="muted">允许读取当前项目、提议新增 Issue；普通记录按你明确选择的对象和类型追加。令牌不能批准、修改正式内容或执行代码。</p>
            <ToolScopeForm key={board.project.id} board={board} busy={busy} onIssue={(label, recordScope, changeScope) => void run(async () => {
              const issued = await post<{ token: string; scope: ToolScope }>('/api/projects/' + board.project.id + '/scopes', { label,
                ...(recordScope ? { recordScope } : {}), ...(changeScope ? { changeScope } : {}) }, false);
              setCredential(issued); await refresh();
            })} />
            {credential && <div className="credential" role="status"><strong>仅本次显示，请保存到工具环境变量 AGENTHUB_TOKEN</strong>
              <code>{credential.token}</code><button className="text-button" onClick={() => setCredential(null)}>已保存，隐藏令牌</button></div>}
            <ul className="scope-list">{board.scopes.map(s => <li key={s.id}><div><strong>{s.label}</strong><small>{s.revokedAt ? '已撤销' : s.operations.join(' · ')} · {s.id.slice(0, 8)}</small><ScopeBoundary scope={s} board={board} /></div>
              {!s.revokedAt && <button className="secondary compact" disabled={busy} onClick={() => void run(async () => {
                await post('/api/projects/' + board.project.id + '/scopes/' + s.id + '/revoke', {}, false); setCredential(null); await refresh();
              })}>撤销</button>}</li>)}</ul><p className="muted tiny">项目 ID：<code>{board.project.id}</code> · Intent ID：<code>{board.intent.id}</code></p>
          </section>}
          {tab === 'overview' && <div className="overview-grid"><section className="panel intent-panel">
            <div className="section-heading"><span className="eyebrow">THE SOURCE OF INTENT</span><span className="tag green">已确认 · v{board.intent.version}</span></div>
            <h2>{board.intent.title}</h2><Detail label="源头问题" value={board.intent.problem} /><Detail label="预期结果" value={board.intent.outcome} />
            <Detail label="如何验证" value={board.intent.verification} /><div className="intent-footer">意图变更需先商讨并获得明确授权；可在“关键变更”审阅候选修订。
              {board.changes.some(change => change.targetKind === 'intent') && <button className="text-button" onClick={() => {
                setChangeId([...board.changes].reverse().find(change => change.targetKind === 'intent')?.id ?? ''); setTab('changes');
              }}>查看 Intent 修订历史 ↗</button>}</div></section>
            <section className="panel next-panel"><span className="eyebrow">NEXT HUMAN DECISION</span><h2>{pending.length + pendingChanges.length ? (pending.length + pendingChanges.length) + ' 个建议等待审阅' : '从建议到正式计划'}</h2>
              <p className="muted">先理解变动和理由，再决定下一步。待审建议不会自动成为正式交付范围。</p>
              <ol className="flow-list"><li><span>01</span><div><strong>外部 Agent 提交</strong><small>CLI 带来源、理由及验证方式</small></div></li><li><span>02</span><div><strong>你审视方案取舍</strong><small>检查收益、风险与意图的关系</small></div></li><li><span>03</span><div><strong>明确决定后纳入</strong><small>批准仅代表计划纳入，不代表验收</small></div></li></ol>
              <button className="secondary full" onClick={() => setTab('review')}>查看提案与决定 →</button>
              {pendingChanges.length > 0 && <button className="text-button" onClick={() => setTab('changes')}>查看 {pendingChanges.length} 项关键变更 →</button>}</section></div>}
          {tab === 'review' && <div className="review-grid"><section className="proposal-list" aria-label="提案列表">
            <div className="section-heading"><h2>提案</h2><span className="muted tiny">{board.proposals.length} 条记录</span></div>
            {!board.proposals.length && <Empty>还没有建议。发放工具令牌后，使用 CLI 提交第一个新增 Issue 提案。</Empty>}
            {[...board.proposals].reverse().map(p => <button key={p.id} className={'proposal-card ' + (proposalId === p.id ? 'chosen' : '')} onClick={() => setProposalId(p.id)}>
              <span className={'status ' + p.status}>{statusText[p.status]}</span><h3>{p.title}</h3><p>{p.reason}</p><small>{board.scopes.find(s => s.id === p.createdBy)?.label ?? '工具'} · 提案 v{p.version}</small></button>)}
          </section><section className="panel review-detail" aria-label="提案审阅">{proposal ? <ProposalReview key={proposal.id} proposal={proposal} board={board} busy={busy} onDecide={(action, reason, reviewed) => void run(async () => {
            await post('/api/projects/' + board.project.id + '/proposals/' + proposal.id + '/decisions',
              { action, reason, ...reviewed });
            setNotice(action === 'approve' ? '已批准并纳入正式清单。尚未执行或验收。' : action === 'reject' ? '已拒绝，正式清单保持不变。' : '已退回，正式清单保持不变。修订内容需另提新建议。');
            await refresh();
          })} /> : <Empty>选择一条提案，审阅变动、理由与验证方式。</Empty>}</section></div>}
          {tab === 'issues' && <IssueWorkspace board={board} issue={selectedIssue} onSelect={setIssueId}
            onIntent={() => setTab('overview')} onProposal={id => { setProposalId(id); setTab('review'); }}
            onChange={id => { setChangeId(id); setTab('changes'); }} records={selectedIssue ? recordsPanel(selectedIssue.id) : null} />}
          {tab === 'records' && <section className="panel">
            <div className="section-heading"><h2>讨论与记录</h2><span className="tag">按来源保留 · 不改变正式内容</span></div>
            <div className="field"><label htmlFor="record-target">记录对象</label><select id="record-target" value={recordTarget}
              onChange={event => setRecordTarget(event.target.value)}>
              <option value="all">全部记录</option><option value="">当前 Intent</option>
              {board.issues.map(issue => <option key={issue.id} value={issue.id}>{issue.title}</option>)}
            </select></div>
            {recordTarget === 'all' ? <><button className="secondary compact" onClick={() => setRecordTarget('')}>记录到当前 Intent</button>
              <RecordsFeed entries={board.records} board={board} onIssue={openIssue} /></> : recordsPanel(recordTarget || null)}
          </section>}
          {tab === 'overview' && <div className="overview-grid overview-followup">
            <section className="panel"><div className="section-heading"><h2>当前交付单元</h2><span className="tag">已计划 · 未执行</span></div>
              {!board.issues.length && <p className="records-empty">尚无正式交付单元，先在提案中明确方案和决定。</p>}
              {board.issues.slice(0, 5).map(issue => <button key={issue.id} className="overview-unit" onClick={() => openIssue(issue.id)}>
                <strong>{issue.title}</strong><small>{issue.parentIssueId ? '子交付单元' : '独立交付单元'} · 点击查看原意图、方案与决定 ↗</small></button>)}
              {board.issues.length > 5 && <button className="text-button" onClick={() => setTab('issues')}>查看全部 {board.issues.length} 个交付单元 →</button>}
            </section><section className="panel"><div className="section-heading"><h2>最近的讨论与记录</h2>
              <button className="text-button" onClick={() => setTab('records')}>全部 {board.records.length} 条 →</button></div>
              <RecordsFeed entries={board.records.slice(-3)} board={board} onIssue={openIssue} />
            </section></div>}
          <footer className="page-footer"><span>AgentHub · 理解与推进保持同步</span><span>本地试用 · 未接执行 Runtime · 未作实际验收</span></footer>
        </>}
      </div>
    </main>
    {creating && <Modal busy={busy} onClose={() => setCreating(false)}>
      <div className="section-heading"><div><span className="eyebrow">START WITH THE PROBLEM</span><h2 id="create-title">建立项目与初始 Intent</h2></div><button className="icon-button" aria-label="关闭" disabled={busy} onClick={() => setCreating(false)}>×</button></div>
      <p className="muted">请记录已通过对话明确的意图。本次保存代表你确认这份初始意图。</p>
      <form onSubmit={event => { const data = formData(event); void run(async () => {
        const result = await post<Board>('/api/projects', data); setCreating(false); setSelected(result.project.id); setTab('overview');
        setNotice('项目与初始 Intent 已保存。'); await refresh();
      }); }}><Field label="项目名称" name="name" maxLength={120} required /><Field label="Intent 标题" name="title" required />
        <Field label="要解决的源头问题" name="problem" area required /><Field label="预期结果" name="outcome" area required />
        <Field label="如何验证与原意图相符" name="verification" area required />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setCreating(false)}>取消</button><button className="primary" disabled={busy}>{busy ? '正在保存…' : '确认初始意图并建立'}</button></div>
      </form></Modal>}
  </div>;
}
function Modal({ children, busy, onClose }: { children: ReactNode; busy: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return <dialog ref={dialog} className="modal panel" aria-labelledby="create-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}
function ProposalReview({ proposal, board, busy, onDecide }: { proposal: Proposal; board: Board; busy: boolean; onDecide: (action: DecisionAction, reason: string, reviewed: ReviewVersions) => void }) {
  const [action, setAction] = useState<DecisionAction>('approve');
  const [reviewed, setReviewed] = useState<ReviewVersions>(() => ({
    proposalVersion: proposal.version, intentVersion: board.intent.version, planVersion: board.planVersion
  }));
  const stale = reviewed.proposalVersion !== proposal.version || reviewed.intentVersion !== board.intent.version ||
    reviewed.planVersion !== board.planVersion;
  const [reasons, setReasons] = useState<Record<DecisionAction, string>>({ approve: '', return: '', reject: '' });
  const reason = reasons[action];
  const reasonRequired = action !== 'approve';
  const obsoleteIntent = proposal.intentVersion !== board.intent.version;
  const reasonHintId = useId();
  const reasonLabel = { approve: '补充说明（选填）', return: '退回原因（必填）', reject: '拒绝原因（必填）' }[action];
  const reasonHint = {
    approve: '可直接确认当前提案。涉及范围或验收条件调整时，请先退回补充。',
    return: '请说明缺少什么信息、需要调整什么，便于重新提交。',
    reject: '请说明为什么不纳入本次计划。'
  }[action];
  const decision = board.decisions.find(d => d.proposalId === proposal.id);
  return <><div className="section-heading"><span className="eyebrow">REVIEW THE CHANGE</span><span className={'status ' + proposal.status}>{statusText[proposal.status]}</span></div>
    <h2>{proposal.title}</h2><div className="change-summary"><strong>本次变动</strong><p>{proposal.status === 'approved' ? '正式交付清单已新增 1 个 Issue：' : '建议新增 1 个 Issue：'}{proposal.title}</p><small>{proposal.status === 'pending' ? '当前 ' + board.issues.length + ' 个 → 批准后 ' + (board.issues.length + 1) + ' 个' : proposal.status === 'approved' ? '已纳入正式计划；尚未执行或验收' : '未纳入正式计划'} · Intent v{proposal.intentVersion} · 当前计划 v{board.planVersion}</small>
      {proposal.parentIssueId && <small>父 Issue：{board.issues.find(i => i.id === proposal.parentIssueId)?.title ?? proposal.parentIssueId}</small>}</div>
    <Detail label="为什么需要这次变动" value={proposal.reason} /><ContentDetails content={proposal} />
    <p className="muted tiny">来源：{board.scopes.find(s => s.id === proposal.createdBy)?.label ?? proposal.createdBy} · 提案 {proposal.id} · {new Date(proposal.createdAt).toLocaleString('zh-CN')}</p>
    {proposal.status === 'pending' ? <form className="decision-form" onSubmit={event => { event.preventDefault(); if (!stale) onDecide(action, reason, reviewed); }}>
      {obsoleteIntent && <p className="error">此提案基于旧 Intent，不能批准。可退回并根据当前意图重提。</p>}
      <h3>你的决定</h3><p className="muted tiny">本次决定绑定上述提案与当前计划版本。批准只纳入计划，不授予执行或 Git 权限。</p>
      {stale && <div className="notice banner" role="status">正式计划或被审内容已更新，请核对最新内容后继续。已输入的说明已保留。
        <button type="button" className="secondary compact" disabled={busy} onClick={() => setReviewed({
          proposalVersion: proposal.version, intentVersion: board.intent.version, planVersion: board.planVersion
        })}>核对最新内容并继续</button>
      </div>}
      <div className="decision-options">{(['approve', 'return', 'reject'] as const).map(value => <label key={value}><input type="radio" name="action" value={value} checked={action === value} onChange={() => setAction(value)} />{actionText[value]}</label>)}</div>
      <div className="field"><label htmlFor={reasonHintId + '-input'}>{reasonLabel}</label><textarea id={reasonHintId + '-input'} required={reasonRequired} aria-describedby={reasonHintId}
        placeholder={reasonHint} rows={3} maxLength={4000} value={reason}
        onChange={event => setReasons(previous => ({ ...previous, [action]: event.target.value }))} /></div>
      <p id={reasonHintId} className="muted tiny">{reasonHint}</p>
      <button className="primary full" disabled={busy || stale || (action === 'approve' && obsoleteIntent) || (reasonRequired && !reason.trim())}>{busy ? '正在保存决定…' : '确认' + actionText[action]}</button>
    </form> : decision && <div className="decision-record"><span className="tag green">人端决定 · {actionText[decision.action]}</span>{decision.reason ? <p>{decision.reason}</p> : <p className="muted tiny">未补充说明</p>}<small>审阅提案 v{decision.proposalVersion} · {new Date(decision.createdAt).toLocaleString('zh-CN')}</small></div>}
  </>;
}
function Empty({ children }: { children: ReactNode }) { return <div className="empty"><span className="empty-symbol">◇</span><p>{children}</p></div>; }
function Brand() { return <div className="brand"><span className="brand-mark">a<span>·</span></span>AgentHub</div>; }
function Stat({ number, label, warm = false }: { number: string; label: string; warm?: boolean }) { return <div className={'stat ' + (warm ? 'warm' : '')}><strong>{number}</strong><span>{label}</span></div>; }
function message(e: unknown): string { return e instanceof Error ? e.message : '发生未知错误，请刷新核对。'; }
const root = document.getElementById('root');
if (!root) throw new Error('缺少页面挂载点');
createRoot(root).render(<App />);
