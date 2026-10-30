import { RunPanel } from './run-panel.js';
import { IntentDraftEditor } from './intent-draft-editor.js';
import { defaultProjectPrefix, isProjectPrefix } from '../../domain/project-identifiers.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import type { Board } from '../../domain/board.js';
import type { RequirementRecord, WorkRecord } from '../../domain/record-contract.js';
import type { EditableCollection, MigrationPreview, RecordProject } from '../../domain/record-project.js';
import { collectionLabels, makeRecord, recordColumns, recordWorks } from './record-ui.js';
import { IssuesList, RecordApiError, recordApi, RecordEditor, RecordField, RecordModal } from './record-editor.js';
import type { EditingRecord } from './record-editor.js';
import './record-workspace.css';

function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="record-block"><div className="section-heading"><h3>{title}</h3>{action}</div>{children}</section>;
}
function Text({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="record-text"><span>{label}</span><p>{value || '尚未记录'}</p></div>;
}
function List({ values }: { values: string[] }) { return values.length ? <ul>{values.map((value, i) => <li key={i}>{value}</li>)}</ul> : <p className="muted tiny">暂无</p>; }
function safeLink(value: string): string | null {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null; } catch { return null; }
}
function WorkPreview({ record, project }: { record: WorkRecord; project: RecordProject }) {
  return <div className="record-work-preview"><div className="record-two-columns"><Text label="要解决的问题" value={record.problem} />
    <Text label="预期结果" value={record.expectedOutcome} /><Text label="为什么这样做" value={record.rationale} /><Text label="预期影响" value={record.expectedImpact} /></div>
    <div className="record-two-columns"><div><small>包含范围</small><List values={record.scope.includes} /></div><div><small>排除范围</small><List values={record.scope.excludes} /></div></div>
    <h4>验收条件与验证方式</h4>{!record.acceptanceCriteria.length && <p className="muted">尚未定义验收条件。</p>}
    {record.acceptanceCriteria.map(item => {
      const check = project.records.verifications.find(value => value.target.id === record.id && value.criterionId === item.id);
      return <div className="record-criterion" key={item.id}><strong>{item.description}</strong><p>{item.verification}</p>
        <small>{check ? '当前记录：' + ({ passed: '通过', failed: '失败', unknown: '未知' }[check.outcome]) + ' · ' + check.method : '尚无核查记录'}</small></div>;
    })}
    {record.result ? <div className="record-actual"><h4>已经记录的实际结果</h4><Text label="做了什么" value={record.result.what} />
      <Text label="为什么这样做" value={record.result.why} /><Text label="影响／结果" value={record.result.actualImpact} />
      <small>证据：{record.result.evidenceRefs.map(id => project.records.evidence.find(item => item.id === id)?.description ?? id).join('；')}</small></div>
      : <p className="records-empty">尚无实际结果，以上为计划与预期。</p>}
  </div>;
}
function RequirementDetails({ project, requirement, legacy, onClose, onEdit, onAccept, onLegacy, onChanged }: {
  project: RecordProject; requirement: RequirementRecord; legacy: Board | undefined; onClose: () => void;
  onEdit: (collection: EditableCollection, record?: unknown) => void; onAccept: () => void; onLegacy: () => void; onChanged: () => void;
}) {
  const data = project.records;
  const works = recordWorks(data).filter(item => item.kind === 'requirement' ? item.id === requirement.id : item.requirementId === requirement.id);
  const context = data.contextItems.filter(item => item.requirementId === requirement.id);
  const evidence = data.evidence.filter(item => item.requirementId === requirement.id);
  const checks = data.verifications.filter(item => works.some(work => work.id === item.target.id));
  const sourceIds = new Set([...data.intent.sourceRefs, ...works.flatMap(item => item.sourceRefs), ...context.flatMap(item => item.sourceRefs),
    ...evidence.flatMap(item => item.sourceRefs), ...checks.flatMap(item => item.sourceRefs)]);
  const sources = data.sources.filter(item => sourceIds.has(item.id));
  return <RecordModal label="Requirement 详情" drawer onClose={onClose}>
    <div className="record-detail-heading"><span className="eyebrow">{requirement.identifier ?? requirement.id} · ONE ISSUE, ONE PR</span><h1>{requirement.title}</h1>
      <div className="record-toolbar"><span className={'record-state ' + requirement.status}>{recordColumns.find(item => item.status === requirement.status)?.label}</span>
        <button className="secondary compact" onClick={() => onEdit('requirements', requirement)}>编辑 Requirement</button>
        {requirement.status !== 'done' && <button className="primary compact" onClick={onAccept}>确认整体接受</button>}</div>
      <p className="muted tiny">所属 Intent：{data.intent.title} · 所有拆解产物仅归属本需求，最终汇总一个 PR。</p>
    </div>
    <RunPanel key={requirement.id} project={project} requirementId={requirement.id} onChanged={onChanged} />
    <Block title="问题、理由、影响与验收"><WorkPreview record={requirement} project={project} /><List values={requirement.constraints} /></Block>
    {(['units','stories','boltPlans'] as const).map(collection => {
      const values = data[collection].filter(item => item.requirementId === requirement.id);
      return <Block key={collection} title={collectionLabels[collection] + ' · ' + values.length}
        action={<button className="secondary compact" onClick={() => onEdit(collection)}>新增 {collectionLabels[collection]}</button>}>
        {!values.length && <p className="muted">尚未拆分；本层可按需要出现。</p>}
        {values.map(item => <details className="record-artifact" key={item.id}><summary><strong>{item.title}</strong>
          <span className={'record-state ' + item.status}>{recordColumns.find(value => value.status === item.status)?.label}</span></summary>
          <div className="record-artifact-body"><button className="text-button" onClick={() => onEdit(collection, item)}>编辑 {collectionLabels[collection]}</button>
            {item.kind === 'unit' && <div className="record-two-columns"><div><h4>职责</h4><List values={item.responsibilities} /></div><div><h4>输入／输出</h4><List values={[...item.inputs, ...item.outputs]} /></div></div>}
            {item.kind === 'story' && <><Text label="用户价值" value={item.userValue} /><Text label="所属 Unit" value={data.units.find(value => value.id === item.unitId)?.title ?? '直接归属 Requirement'} /></>}
            {item.kind === 'bolt_plan' && <><Text label="计划类型" value={item.constructionType} /><List values={item.stages} />
              <Text label="安排的 Stories" value={item.storyIds.map(id => data.stories.find(value => value.id === id)?.title ?? id).join('；')} /><List values={item.exitConditions} />
              <p className="muted tiny">计划产物完成不代表一次实际运行已经结束。</p></>}
            <WorkPreview record={item} project={project} />
            {item.dependsOn.length > 0 && <Text label="同需求内依赖" value={item.dependsOn.map(ref => works.find(value => value.id === ref.id)?.title ?? ref.id).join('；')} />}
          </div></details>)}
      </Block>;
    })}
    <Block title="长期关键信息" action={<button className="secondary compact" onClick={() => onEdit('contextItems')}>新增长期信息</button>}>
      {!context.length && <p className="muted">暂无提炼后的记录。</p>}{context.map(item => <article className="record-note" key={item.id}>
        <small>{item.category} · {{ proposed: '建议／待核对', confirmed: '已确认的记录', unknown: '未知', observed: '观察记录' }[item.epistemicStatus]}</small>
        <p>{item.content}</p><button className="text-button" onClick={() => onEdit('contextItems', item)}>编辑此条信息</button></article>)}
    </Block>
    <Block title="验收证据" action={<button className="secondary compact" onClick={() => onEdit('evidence')}>追加证据</button>}>
      {!evidence.length && <p className="muted">暂无实际证据；不以计划或报告文字替代。</p>}{evidence.map(item => <article className="record-note" key={item.id}>
        <h4>{item.description}</h4><Text label="对应产物／提交" value={item.subject} /><Text label="观察环境" value={item.environment} />
        <Text label="实际观察" value={item.observedResult} /><List values={item.limitations} /><small>适用：{item.targets.map(ref => works.find(value => value.id === ref.id)?.title ?? ref.id).join('；')}</small>
      </article>)}<p className="muted tiny">证据由人端记录或引用；当前没有自动运行核验。更正时追加新记录，保留原文。</p>
    </Block>
    <Block title="逐条件核查" action={<button className="secondary compact" onClick={() => onEdit('verifications')}>新增核查记录</button>}>
      {!checks.length && <p className="muted">暂无核查记录。</p>}{checks.map(item => <article className="record-note" key={item.id}>
        <strong>{works.find(value => value.id === item.target.id)?.title ?? item.target.id}</strong><p>{item.explanation}</p>
        <small>记录为：{{ passed: '通过', failed: '失败', unknown: '未知' }[item.outcome]} · {item.method}</small>
        <button className="text-button" onClick={() => onEdit('verifications', item)}>更新核查记录</button></article>)}
    </Block>
    <Block title="唯一 PR 与整体接受">
      {requirement.pullRequest ? <><a href={requirement.pullRequest.url} target="_blank" rel="noreferrer">{requirement.pullRequest.url}</a>
        <Text label="做了什么" value={requirement.pullRequest.what} /><Text label="为什么这样做" value={requirement.pullRequest.why} />
        <Text label="如何验证" value={requirement.pullRequest.verification} /><Text label="影响／结果" value={requirement.pullRequest.result} /></>
        : <p className="muted">尚未记录最终 PR。</p>}
      <Text label="整体接受记录" value={requirement.acceptance ? (requirement.acceptance.outcome === 'accepted' ? '本人已记录整体接受' : '已要求调整') : '尚无整体接受'} />
    </Block>
    <Block title="最小出处" action={<button className="secondary compact" onClick={() => onEdit('sources')}>追加出处</button>}>
      {sources.map(item => { const link = safeLink(item.locator); return <article className="record-source" key={item.id}><small>{item.kind}</small>
        {link ? <a href={link} target="_blank" rel="noreferrer">{item.locator}</a> : <p>{item.locator}</p>}
        {item.excerpt && <blockquote>{item.excerpt}</blockquote>}</article>; })}
      {legacy && <button className="text-button" onClick={onLegacy}>查看迁移来源的原始记录（只读）</button>}
    </Block>
    <details className="record-json"><summary>查看本 Requirement 的完整记录</summary><pre>{JSON.stringify({
      requirement, units: data.units.filter(item => item.requirementId === requirement.id), stories: data.stories.filter(item => item.requirementId === requirement.id),
      boltPlans: data.boltPlans.filter(item => item.requirementId === requirement.id), context, evidence, verifications: checks
    }, null, 2)}</pre></details>
  </RecordModal>;
}
function ProjectCreation({ onClose, onCreate, busy, error }: { onClose: () => void; onCreate: (input: unknown) => void; busy: boolean; error: string }) {
  const [name, setName] = useState(''), [prefix, setPrefix] = useState('');
  const identifierPrefix = prefix.trim().toUpperCase() || defaultProjectPrefix(name);
  const validPrefix = isProjectPrefix(identifierPrefix);
  return <RecordModal label="新建/导入项目" onClose={onClose}>
    <p className="muted">先创建项目，再逐步明确意图。已有项目可在主页核对预览后导入。</p>
    <form onSubmit={event => { event.preventDefault(); if (validPrefix && name.trim()) onCreate({ name, identifierPrefix }); }}>
      <fieldset disabled={busy} className="record-fieldset">
        <RecordField label="项目名称" required area={false} value={name} onChange={setName} />
        <RecordField label="项目标记（选填）" area={false} value={prefix} onChange={value => setPrefix(value.toUpperCase())} />
        <p className="muted tiny">标记使用 1–20 位字母或数字，以字母开头。留空时取名称前三位字母，中文按拼音首字母取前三位；可在创建前修改。</p>
        <p role="status" aria-label="需求标识预览">需求标识预览：{validPrefix ? identifierPrefix + '-1' : '请修改项目标记'}</p>
        {!validPrefix && <p className="error">标记格式不正确，请使用以字母开头的 1–20 位英文字母或数字。</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!name.trim() || !validPrefix || busy}>创建项目</button></div>
      </fieldset></form>
  </RecordModal>;
}
export function RecordProjectsWorkspace({ legacyBoards, onLogout, onLegacy, syncState, syncError }: {
  legacyBoards: Board[]; onLogout: () => Promise<void>; onLegacy: (migratedIds: string[]) => void; syncState: string; syncError: string;
}) {
  const [projects, setProjects] = useState<RecordProject[]>([]), [selected, setSelected] = useState('');
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [creating, setCreating] = useState(false);
  const [requirementId, setRequirementId] = useState(''), [editing, setEditing] = useState<EditingRecord | null>(null);
  const [migration, setMigration] = useState<MigrationPreview | null>(null), [migrationConfirmed, setMigrationConfirmed] = useState(false);
  const [oldReference, setOldReference] = useState<Board | null>(null);
  const [accepting, setAccepting] = useState(false), [acceptConfirmed, setAcceptConfirmed] = useState(false), [acceptReason, setAcceptReason] = useState('');
  const [confirmingIntent, setConfirmingIntent] = useState(false), [intentConfirmed, setIntentConfirmed] = useState(false);
  const [editingIntent, setEditingIntent] = useState(false);
  const [intentBaseRevision, setIntentBaseRevision] = useState(0);
  const [intentSummary, setIntentSummary] = useState(''), [intentSource, setIntentSource] = useState('');
  const [operationReport, setOperationReport] = useState<import('../../domain/record-contract.js').ContractReport>();
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0), requestIds = useRef(new Map<string, string>()), mounted = useRef(true);
  const reload = useCallback(async () => {
    if (retry.current !== null) { clearTimeout(retry.current); retry.current = null; }
    const generation = ++sequence.current;
    try {
      const next = await recordApi<RecordProject[]>('/api/record-projects');
      if (!mounted.current || generation !== sequence.current) return;
      setProjects(next); setSelected(previous => next.some(item => item.id === previous) ? previous : next[0]?.id ?? ''); setError('');
    } catch (e) {
      if (mounted.current && generation === sequence.current) {
        setError(e instanceof Error ? e.message : '读取失败，保留上次内容。');
        if (!(e instanceof RecordApiError && e.status === 401)) retry.current = setTimeout(() => { void reload(); }, 2000);
      }
    }
    finally { if (mounted.current && generation === sequence.current) setReady(true); }
  }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; sequence.current += 1; if (retry.current !== null) clearTimeout(retry.current); }; }, []);
  useEffect(() => { void reload(); }, [legacyBoards, reload]);
  const project = projects.find(item => item.id === selected);
  const requirement = project?.records.requirements.find(item => item.id === requirementId);
  const oldBoard = project?.migration ? legacyBoards.find(item => item.project.id === project.migration?.legacyProjectId) : undefined;
  const unmigrated = legacyBoards.filter(item => !projects.some(project => project.id === item.project.id));
  async function write<T>(path: string, input: unknown): Promise<T> {
    const signature = JSON.stringify({ path, input });
    const id = requestIds.current.get(signature) ?? crypto.randomUUID(); requestIds.current.set(signature, id);
    const result = await recordApi<T>(path, input, id); requestIds.current.delete(signature); return result;
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setOperationReport(undefined);
    try { await action(); }
    catch (e) {
      if (e instanceof RecordApiError && e.status === 401) { await onLogout(); return; }
      setError(e instanceof Error ? e.message : '不能确定操作结果，请刷新核对。');
      if (e instanceof RecordApiError) setOperationReport(e.report);
    } finally { setBusy(false); }
  }
  function saved(next: RecordProject) {
    setProjects(previous => previous.some(item => item.id === next.id) ? previous.map(item => item.id === next.id ? next : item) : [...previous, next]);
    setSelected(next.id); setNotice('项目记录已保存。');
    void reload();
  }
  function editRecord(collection: EditableCollection, value?: unknown) {
    if (!project) return;
    const initial = value ? structuredClone(value) as Record<string, unknown> : makeRecord(collection, project, requirementId);
    setEditing({ collection, id: value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' ? value.id : null,
      initial, baseRevision: project.revision });
  }
  async function showMigration(id: string) {
    await run(async () => { const preview = await recordApi<MigrationPreview>('/api/projects/' + id + '/migration-preview'); setMigration(preview); setMigrationConfirmed(false); });
  }
  async function applyMigration() {
    if (!migration || !migrationConfirmed) return;
    await run(async () => {
      const next = await write<RecordProject>('/api/projects/' + migration.sourceProjectId + '/migrate-records', { fingerprint: migration.fingerprint, confirmed: true });
      saved(next); setMigration(null); setRequirementId(''); setNotice('项目已导入。旧记录保留只读，需求与意图仍需核对。');
    });
  }
  function dragStatus(event: DragEvent, status: string) {
    event.preventDefault();
    if (!project || editing) return;
    const id = event.dataTransfer.getData('text/plain');
    const req = project.records.requirements.find(item => item.id === id);
    if (!req || req.status === status) return;
    setRequirementId(req.id);
    if (status === 'done') { setAccepting(true); setAcceptConfirmed(false); setAcceptReason(''); return; }
    editRecordForRequirement(req, status);
  }
  function editRecordForRequirement(req: RequirementRecord, status: string) {
    if (!project) return;
    setEditing({ collection: 'requirements', id: req.id, initial: { ...structuredClone(req), status, acceptance: null }, baseRevision: project.revision });
  }
  const syncText = syncState === 'live' ? '自动同步已连接' : syncState === 'expired' ? '会话已失效，请重新登录' : '同步暂时中断，保留上次读取内容';
  return <div className="workspace record-workspace">
    <aside className="sidebar"><div className="brand"><span className="brand-mark">a<span>·</span></span>AgentHub</div>
      <div className="workspace-label"><span className="live-dot" /> 需求与交付</div>
      <div className="nav-label">项目<button className="icon-button" aria-label="新建/导入项目" onClick={() => { setCreating(true); setError(''); }}>＋</button></div>
      <nav aria-label="项目列表">{projects.map(item => <button key={item.id} className={'project-link ' + (selected === item.id ? 'active' : '')}
        onClick={() => { setSelected(item.id); setRequirementId(''); }}><span className="project-symbol" aria-hidden="true">{item.name.slice(0,1)}</span><span>{item.name}</span></button>)}</nav>
      {!projects.length && <p className="sidebar-empty">从已确认的意图开始。</p>}
      <button className="text-button record-legacy-switch" onClick={() => onLegacy(projects.map(item => item.id))}>旧版工作区</button>
      <div className="sidebar-bottom"><div className="human-avatar">你</div><div><strong>人端决策者</strong><small>理解之后，再推进</small></div><button className="text-button" disabled={busy} onClick={() => void onLogout()}>退出</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><span>工作区 <span className="slash">/</span> {project?.name ?? '欢迎'}</span>
      <div className="topbar-actions"><span className="local-badge">LOCAL RECORDS</span><button className="secondary compact" disabled={busy} onClick={() => void reload()}>刷新记录</button>
        <button className="text-button mobile-exit" disabled={busy} onClick={() => void onLogout()}>退出</button></div></header>
      <div className="page-body record-page">
        <p className={'sync-state ' + syncState} role="status" aria-label="自动同步状态">{syncText}</p>
        {(error || syncError) && <div className="error banner" role="alert">{error || syncError}<small>读取失败时保留上次内容；保存结果不明时请先刷新核对。</small></div>}
        <IssuesList report={operationReport} />
        {notice && <p className="notice" role="status">{notice}</p>}
        {!ready ? <p>正在读取正式记录…</p> : project ? <>
          <div className="page-heading"><div><span className="eyebrow">INTENT → REQUIREMENTS → ONE PR EACH</span><h1>{project.name}</h1>
            <p className="muted">每张 Issue 卡片对应一个 Requirement，分层产物在详情中展开。</p></div>
            <button className="primary compact" onClick={() => { setRequirementId(''); editRecord('requirements'); }}>新增 Requirement</button></div>
          <details className="record-intent" open><summary><strong>Intent · {project.records.intent.title || '待明确的项目意图'}</strong><span className="tag">{project.records.intent.confirmation.state === 'human_confirmed' ? '人端已确认' : project.migration ? '迁移后待核对' : '意图草稿 · 尚未确认'}</span></summary>
            <div className="record-two-columns"><Text label="源头问题" value={project.records.intent.problem} /><Text label="预期结果" value={project.records.intent.expectedOutcome} /></div>
            <div className="record-two-columns"><div><small>包含范围</small><List values={project.records.intent.scope.includes} /></div><div><small>约束／排除</small><List values={[...project.records.intent.constraints, ...project.records.intent.scope.excludes]} /></div></div>
            {project.records.intent.confirmation.state === 'proposed' && <div className="record-toolbar">
              {!project.migration && <button className="secondary compact" onClick={() => setEditingIntent(true)}>完善意图</button>}
              <button className="secondary compact" disabled={!project.records.intent.title.trim() || !project.records.intent.problem.trim() || !project.records.intent.expectedOutcome.trim() || !project.records.intent.scope.includes.length}
                onClick={() => { setIntentBaseRevision(project.revision); setConfirmingIntent(true); setIntentConfirmed(false); setIntentSummary(''); setIntentSource(''); setError(''); }}>{project.migration ? '核对迁移后的意图表示' : '核对并确认意图'}</button>
              <p className="muted tiny">可逐步补充草稿；明确标题、源头问题、预期结果和包含范围后，由你单独确认。确认前不能正式推进或启动需求运行。</p>
            </div>}
            {project.records.contextItems.some(item => item.requirementId === null) && <details className="record-note"><summary>Intent 关键上下文与旧验证说明</summary>
              {project.records.contextItems.filter(item => item.requirementId === null).map(item => <article className="record-note" key={item.id}><small>{item.category} · {item.epistemicStatus}</small><p>{item.content}</p>
                {item.sourceRefs.map(id => { const source = project.records.sources.find(value => value.id === id); return <small key={id}>出处：{source?.locator ?? id}</small>; })}</article>)}</details>}
            {oldBoard && <button className="text-button" onClick={() => setOldReference(oldBoard)}>查看旧项目来源（只读）</button>}
          </details>
          <div className="record-board" aria-label="Requirement 状态看板">{recordColumns.map(column => {
            const values = project.records.requirements.filter(item => item.status === column.status);
            return <section key={column.status} className={'record-column ' + column.status} aria-label={column.label}
              onDragOver={event => event.preventDefault()} onDrop={event => dragStatus(event, column.status)}>
              <div className="record-column-heading"><h2>{column.label}</h2><span>{values.length}</span></div>
              {!values.length && <p className="record-column-empty">暂无需求</p>}
              {values.map(req => {
                const artifacts = [...project.records.units, ...project.records.stories, ...project.records.boltPlans].filter(item => item.requirementId === req.id);
                return <button key={req.id} className="record-card" draggable onDragStart={event => event.dataTransfer.setData('text/plain', req.id)}
                  onClick={() => setRequirementId(req.id)}><span className="record-card-kind">{req.identifier ?? req.id} <span>↗</span></span>
                  <h3>{req.title}</h3><p>{req.expectedOutcome}</p><footer><span>{artifacts.filter(item => item.status === 'done').length}/{artifacts.length} 项产物记录完成</span>
                    <span>{req.pullRequest ? '1 个 PR' : 'PR 待记录'}</span></footer></button>;
              })}
            </section>;
          })}</div>
          <p className="record-board-note">需求工作状态由人端记录；运行区目前只使用脚本化替身，未接入真实模型或代码执行。拖动卡片先预览并确认；“已记录完成”不代替证据真实性核验。</p>
          <details className="record-history"><summary>变更与决定记录 · {project.audit.length}</summary>{[...project.audit].reverse().map(item =>
            <details key={item.id} className="record-note"><summary>{item.reason} <small>{new Date(item.at).toLocaleString('zh-CN')}</small></summary>
              <p>人端 · {item.action} · {item.target}</p><List values={item.warnings} /><div className="revision-columns"><pre>{JSON.stringify(item.before, null, 2)}</pre><pre>{JSON.stringify(item.after, null, 2)}</pre></div>{item.effects.length > 0 && <details><summary>关联内容的变化</summary><pre>{JSON.stringify(item.effects, null, 2)}</pre></details>}</details>)}</details>
        </> : <section className="welcome"><span className="eyebrow">START WITH AN INTENT</span><h1>让需求、拆解与证据<br />对应起来。</h1>
          <p>新建项目，或先核对已有项目的导入预览。旧记录会保留。</p><button className="primary" onClick={() => setCreating(true)}>新建/导入项目 →</button></section>}
        {unmigrated.length > 0 && <section className="record-migration-list"><h2>旧项目待核对迁移</h2><p className="muted">旧 Issue 不自动解释为新的 Unit / Story，先查看转换结果。</p>
          {unmigrated.map(item => <button className="secondary" key={item.project.id} disabled={busy} onClick={() => void showMigration(item.project.id)}>查看迁移预览：{item.project.name}</button>)}</section>}
      </div>
    </main>
    {creating && <ProjectCreation busy={busy} error={error} onClose={() => { if (!busy) setCreating(false); }} onCreate={input => void run(async () => {
      const next = await write<RecordProject>('/api/record-projects', input); saved(next); setCreating(false); setRequirementId('');
    })} />}
    {project && requirement && <RequirementDetails project={project} requirement={requirement} legacy={oldBoard}
      onClose={() => setRequirementId('')} onEdit={editRecord} onAccept={() => { setAccepting(true); setAcceptConfirmed(false); setAcceptReason(''); }}
      onChanged={() => { void reload(); }} onLegacy={() => { if (oldBoard) setOldReference(oldBoard); }} />}
    {project && editingIntent && <IntentDraftEditor key={project.id} project={project} onClose={() => setEditingIntent(false)} onSaved={saved} />}
    {project && editing && <RecordEditor key={editing.collection + ':' + (editing.id ?? String(editing.initial['id']))} project={project} edit={editing} onClose={() => setEditing(null)} onSaved={saved} />}
    {migration && <RecordModal label="旧项目迁移预览" onClose={() => { if (!busy) setMigration(null); }}>
      <ul className="notice">{migration.warnings.map((value, i) => <li key={i}>{value}</li>)}</ul><h3>{migration.records.intent.title}</h3>
      <p>将生成 {migration.records.requirements.length} 个 Requirement 草案，Unit / Story / Bolt Plan 均不自动推断。</p>
      {migration.records.requirements.map(item => <article className="record-note" key={item.id}><h4>{item.title}</h4><Text label="保留的问题" value={item.problem} />
        <List values={item.scope.includes} /><small>来源 {item.sourceRefs.length} 项 · 状态：草案</small></article>)}
      <details className="record-json"><summary>查看完整导入预览</summary><pre>{JSON.stringify(migration.records, null, 2)}</pre></details>
      <label className="scope-option"><input type="checkbox" checked={migrationConfirmed} onChange={event => setMigrationConfirmed(event.target.checked)} />已核对迁移预览，同意导入项目并保留旧记录</label>
      {error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setMigration(null)}>暂不迁移</button>
        <button className="primary" disabled={busy || !migrationConfirmed} onClick={() => void applyMigration()}>确认预览并迁移</button></div>
    </RecordModal>}
    {oldReference && <RecordModal label="旧项目原始记录（只读）" onClose={() => setOldReference(null)}>
      <p className="muted">只读来源。旧批准与报告不自动成为新 Requirement 的接受或证据。</p>
      <section className="record-block"><h3>旧工具令牌（仅允许撤销）</h3>
        {!oldReference.scopes.length && <p className="muted">没有旧工具令牌。</p>}
        {oldReference.scopes.map(scope => <div className="record-note" key={scope.id}><strong>{scope.label}</strong>
          <small>{scope.revokedAt ? '已撤销' : '仅保留原范围，不获得导入后项目的操作权限'}</small>
          {!scope.revokedAt && <button className="secondary compact" disabled={busy} onClick={() => void run(async () => {
            await write('/api/projects/' + oldReference.project.id + '/scopes/' + scope.id + '/revoke', {});
            const latest = await recordApi<Board[]>('/api/boards');
            setOldReference(latest.find(item => item.project.id === oldReference.project.id) ?? oldReference);
          })}>撤销旧令牌：{scope.label}</button>}</div>)}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <pre className="record-legacy-json">{JSON.stringify({ project: oldReference.project, intent: oldReference.intent, issues: oldReference.issues,
        proposals: oldReference.proposals, decisions: oldReference.decisions, records: oldReference.records, changes: oldReference.changes }, null, 2)}</pre>
    </RecordModal>}
    {project && requirement && accepting && <RecordModal label="Requirement 整体接受" onClose={() => { if (!busy) setAccepting(false); }}>
      <h3>{requirement.title}</h3><p>请核对全部子产物、整体条件、实际证据与唯一 PR。提交后会记录本人接受；本系统不会替你确认真实运行结果。</p>
      <Text label="最终 PR" value={requirement.pullRequest?.url} /><RecordField label="补充说明（选填）" value={acceptReason} onChange={setAcceptReason} />
      <label className="scope-option"><input type="checkbox" checked={acceptConfirmed} onChange={event => setAcceptConfirmed(event.target.checked)} />我已实际核对本需求的结果与证据，确认整体接受</label>
      <IssuesList report={operationReport} />{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={busy} onClick={() => setAccepting(false)}>返回核对</button>
        <button className="primary" disabled={busy || !acceptConfirmed} onClick={() => void run(async () => {
          const next = await write<RecordProject>('/api/record-projects/' + project.id + '/requirements/' + requirement.id + '/acceptance',
            { baseRevision: project.revision, confirmed: true, reason: acceptReason.trim() || null }); saved(next); setAccepting(false);
        })}>本人确认整体接受并标记完成</button></div>
    </RecordModal>}
    {project && confirmingIntent && <RecordModal label={project.migration ? "核对迁移后的意图表示" : "核对并确认意图"} onClose={() => { if (!busy) setConfirmingIntent(false); }}>
      <Text label="意图标题" value={project.records.intent.title} /><Text label="原始问题" value={project.records.intent.problem} /><Text label="预期结果" value={project.records.intent.expectedOutcome} />
      <List values={project.records.intent.scope.includes} /><Text label="排除范围与约束" value={[...project.records.intent.scope.excludes, ...project.records.intent.constraints].join("；")} /><p className="notice">请核对当前意图的目标、范围和约束。确认不修改正文，也不授予执行权限；仍有未决边界时，请继续澄清。</p>
      <RecordField label="已完成的商讨与核对结论" value={intentSummary} required onChange={setIntentSummary} />
      <RecordField label="商讨出处" value={intentSource} required onChange={setIntentSource} />
      <label className="scope-option"><input type="checkbox" checked={intentConfirmed} onChange={event => setIntentConfirmed(event.target.checked)} />我已商讨并核对当前意图表示，明确确认</label>
      {intentBaseRevision !== project.revision && <p className="error" role="alert">项目已更新，请关闭并重新核对当前意图，之前的勾选不再适用。</p>}
      {error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" onClick={() => setConfirmingIntent(false)}>继续核对</button>
        <button className="primary" disabled={busy || intentBaseRevision !== project.revision || !intentConfirmed || !intentSummary.trim() || !intentSource.trim()} onClick={() => void run(async () => {
          const next = await write<RecordProject>('/api/record-projects/' + project.id + '/intent-confirmation', { baseRevision: intentBaseRevision, confirmed: true,
            discussionSummary: intentSummary, sourceRef: intentSource }); saved(next); setConfirmingIntent(false);
        })}>确认当前意图表示</button></div>
    </RecordModal>}
  </div>;
}
