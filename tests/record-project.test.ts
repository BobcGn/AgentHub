import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { RecordProjectService } from '../src/application/record-project-service.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { JsonRecordProjectStore } from '../src/infrastructure/record-project-store.js';
import { HubError } from '../src/domain/board.js';
import type { Principal } from '../src/domain/board.js';
import type { RecordProject } from '../src/domain/record-project.js';
import type { RecordSet } from '../src/domain/record-contract.js';
import { fixture, human, projectInput, proposalInput, serverFixture } from './fixtures.js';

const input = { name: '正式 JSON 项目', title: '核对需求与结果', problem: '需要清楚的拆解与证据',
  expectedOutcome: '每项需求可以被核对', includes: ['记录与验收'], excludes: [], constraints: [], confirmed: true };
const code = (name: string) => (e: unknown) => e instanceof HubError && e.code === name;
function setup() {
  const f = fixture();
  const service = new RecordProjectService(f.recordStore, f.service, createRecordStructureValidator());
  return { ...f, records: service };
}
function reqRecord(project: RecordProject, id = 'REQ-NEW') {
  return { kind: 'requirement', id, title: '确认筛选行为', problem: '旧结果可能造成误判', expectedOutcome: '结果与当前条件一致',
    scope: { includes: ['筛选更新'], excludes: [] }, rationale: '维持筛选含义', expectedImpact: '减少误判', acceptanceCriteria: [],
    sourceRefs: [], status: 'draft', result: null, intentId: project.records.intent.id, constraints: [], acceptance: null, pullRequest: null };
}
function synthetic(name: string): RecordSet {
  return JSON.parse(readFileSync(new URL('../examples/records/' + name, import.meta.url), 'utf8')) as RecordSet;
}
function seedCompleted(f: ReturnType<typeof setup>): RecordProject {
  const project = f.records.create(human, input, 'create-complete-001');
  const records = synthetic('completed.synthetic.json');
  const seeded = { ...project, revision: 2, records };
  f.recordStore.replace(seeded, 1);
  return seeded;
}

test('JSON 正式项目：人端确认、创建幂等、重新打开与文件持久化，旧库内容不变', t => {
  const f = setup(); t.after(f.cleanup);
  assert.throws(() => f.records.create(human, { ...input, confirmed: false }, 'no-confirm-001'), code('EXPLICIT_CONFIRMATION_REQUIRED'));
  const oldBefore = JSON.stringify(f.service.overview(human));
  const created = f.records.create(human, input, 'create-record-001');
  assert.equal(created.records.intent.confirmation.state, 'human_confirmed');
  assert.equal(created.revision, 1);
  assert.deepEqual(f.records.create(human, input, 'create-record-001'), created);
  assert.throws(() => f.records.create(human, { ...input, name: '另一输入' }, 'create-record-001'), code('REQUEST_REUSED'));
  const reopened = new RecordProjectService(new JsonRecordProjectStore(join(f.dir, 'record-projects')), f.service, createRecordStructureValidator());
  assert.deepEqual(reopened.get(human, created.id), created);
  assert.equal(readdirSync(join(f.dir, 'record-projects')).filter(name => name.endsWith('.json')).length, 1);
  assert.equal(JSON.stringify(f.service.overview(human)), oldBefore);
});

test('预览不保存；明确确认后写入，自动记录人端出处，旧序号和重用编号被拒绝', t => {
  const f = setup(); t.after(f.cleanup);
  const project = f.records.create(human, input, 'create-record-002');
  const edit = { baseRevision: 1, collection: 'requirements', id: null, record: reqRecord(project), reason: '按本意图新增需求' };
  const preview = f.records.previewEdit(human, project.id, edit);
  assert.equal(preview.report.valid, true);
  assert.equal(f.records.get(human, project.id).revision, 1);
  assert.throws(() => f.records.saveRecord(human, project.id, edit, 'save-record-001'), code('EXPLICIT_CONFIRMATION_REQUIRED'));
  const saved = f.records.saveRecord(human, project.id, { ...edit, confirmed: true }, 'save-record-001');
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.records.requirements[0], preview.after);
  assert.equal(saved.records.requirements[0]?.sourceRefs.length, 1);
  assert.deepEqual(f.records.saveRecord(human, project.id, { ...edit, confirmed: true }, 'save-record-001'), saved);
  assert.throws(() => f.records.saveRecord(human, project.id, { ...edit, confirmed: true }, 'save-stale-001'), code('STALE_RECORD_PROJECT'));
  assert.throws(() => f.records.saveRecord(human, project.id, { ...edit, reason: '另一理由', confirmed: true }, 'save-record-001'), code('REQUEST_REUSED'));
});

test('非法结构和伪造整体接受不落盘；观察出处追加，旧快照保持', t => {
  const f = setup(); t.after(f.cleanup);
  const project = f.records.create(human, input, 'create-record-003');
  const base = { baseRevision: 1, collection: 'requirements', id: null, reason: '添加需求', confirmed: true };
  assert.throws(() => f.records.saveRecord(human, project.id, { ...base, record: { ...reqRecord(project), trusted: true } }, 'save-bad-001'), code('INVALID_RECORD_SET'));
  assert.throws(() => f.records.saveRecord(human, project.id, { ...base, record: {
    ...reqRecord(project), acceptance: { outcome: 'accepted', sourceRefs: project.records.intent.sourceRefs, reason: null }
  } }, 'save-fake-001'), code('USE_ACCEPTANCE_GATE'));
  assert.equal(f.records.get(human, project.id).revision, 1);
  const source = project.records.sources[0]; assert.ok(source);
  assert.throws(() => f.records.saveRecord(human, project.id, { baseRevision: 1, collection: 'sources', id: source.id,
    record: { ...source, excerpt: '篡改' }, reason: '尝试修改来源', confirmed: true }, 'source-edit-001'), code('APPEND_ONLY_RECORD'));
});

test('内容变化使旧核查未知、子产物及整体接受失效，保留变更前后与影响', t => {
  const f = setup(); t.after(f.cleanup);
  const project = seedCompleted(f);
  const unit = project.records.units[0]; assert.ok(unit);
  const saved = f.records.saveRecord(human, project.id, { baseRevision: 2, collection: 'units', id: unit.id,
    record: { ...unit, expectedOutcome: '改变后的预期，需要重新核对' }, reason: '明确产物边界', confirmed: true }, 'invalidate-unit-001');
  assert.equal(saved.records.units[0]?.status, 'review');
  assert.equal(saved.records.requirements[0]?.status, 'review');
  assert.equal(saved.records.requirements[0]?.acceptance, null);
  assert.equal(saved.records.verifications.find(item => item.target.id === unit.id)?.outcome, 'unknown');
  const audit = saved.audit.at(-1); assert.ok(audit);
  assert.ok(audit.effects.some(item => item.target.startsWith('requirements/')));
  assert.ok(audit.warnings.length);
});

test('仅将已核验子产物标完成不会撤销其当前通过，需求必须走独立整体接受', t => {
  const f = setup(); t.after(f.cleanup);
  const project = seedCompleted(f);
  const data = structuredClone(project.records);
  const unit = data.units[0], req = data.requirements[0]; assert.ok(unit); assert.ok(req);
  unit.status = 'review'; req.status = 'review'; req.acceptance = null;
  f.recordStore.replace({ ...project, revision: 3, records: data }, 2);
  const finished = f.records.saveRecord(human, project.id, { baseRevision: 3, collection: 'units', id: unit.id,
    record: { ...unit, status: 'done' }, reason: '已核对该产物证据', confirmed: true }, 'unit-finish-001');
  assert.equal(finished.records.units[0]?.status, 'done');
  assert.equal(finished.records.verifications.find(item => item.target.id === unit.id)?.outcome, 'passed');
  assert.throws(() => f.records.saveRecord(human, project.id, { baseRevision: 4, collection: 'requirements', id: req.id,
    record: { ...req, status: 'done' }, reason: '直接完成', confirmed: true }, 'bypass-accept-001'), code('USE_ACCEPTANCE_GATE'));
  assert.throws(() => f.records.acceptRequirement(human, project.id, req.id, { baseRevision: 4, confirmed: false }, 'accept-no-001'), code('EXPLICIT_CONFIRMATION_REQUIRED'));
  const accepted = f.records.acceptRequirement(human, project.id, req.id, { baseRevision: 4, confirmed: true, reason: null }, 'accept-real-001');
  assert.equal(accepted.records.requirements[0]?.status, 'done');
  assert.equal(accepted.records.requirements[0]?.acceptance?.outcome, 'accepted');
});

test('完整验收条件未满足时不能整体接受，保存异常不应覆盖原快照', t => {
  const f = setup(); t.after(f.cleanup);
  const project = f.records.create(human, input, 'create-record-004');
  const saved = f.records.saveRecord(human, project.id, { baseRevision: 1, collection: 'requirements', id: null,
    record: reqRecord(project), reason: '新增需求', confirmed: true }, 'save-record-004');
  assert.throws(() => f.records.acceptRequirement(human, project.id, 'REQ-NEW', { baseRevision: 2, confirmed: true }, 'accept-missing-001'), code('INVALID_RECORD_SET'));
  assert.equal(f.records.get(human, project.id).revision, saved.revision);
  const replace = f.recordStore.replace.bind(f.recordStore);
  f.recordStore.replace = () => { throw new Error('simulated record write failure'); };
  const req = saved.records.requirements[0]; assert.ok(req);
  assert.throws(() => f.records.saveRecord(human, project.id, { baseRevision: 2, collection: 'requirements', id: req.id,
    record: { ...req, title: '修改后的标题' }, reason: '改标题', confirmed: true }, 'save-failure-001'), /simulated/);
  assert.equal(f.records.get(human, project.id).revision, saved.revision);
  f.recordStore.replace = replace;
});

test('迁移预览保留父子及批准出处，不推断层级；确认后另存，旧用例只读但可撤销令牌', t => {
  const f = setup(); t.after(f.cleanup);
  const old = f.service.createProject(human, projectInput, 'create-legacy-001');
  const issued = f.service.issueToken(human, old.project.id, '旧工具');
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  const proposal = f.service.propose(tool, old.project.id, proposalInput, 'legacy-propose-001');
  const first = f.service.decide(human, old.project.id, proposal.id, { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 1 }, 'legacy-approve-001');
  assert.ok(first.issue);
  const child = f.service.propose(tool, old.project.id, { ...proposalInput, parentIssueId: first.issue.id, title: '旧子单元' }, 'legacy-child-001');
  f.service.decide(human, old.project.id, child.id, { action: 'approve', reason: '历史批准理由', proposalVersion: 1, intentVersion: 1, planVersion: 2 }, 'legacy-child-approve');
  const before = JSON.stringify(f.service.overview(human));
  const preview = f.records.migrationPreview(human, old.project.id);
  assert.equal(f.records.list(human).length, 0);
  assert.equal(preview.records.requirements.length, 2);
  assert.equal(preview.records.units.length, 0);
  assert.equal(preview.records.intent.confirmation.state, 'proposed');
  assert.ok(preview.records.contextItems.some(item => item.content.includes(first.issue?.id ?? '')));
  const migrated = f.records.migrate(human, old.project.id, { fingerprint: preview.fingerprint, confirmed: true }, 'migrate-old-001');
  assert.equal(JSON.stringify(f.service.overview(human)), before);
  assert.ok(migrated.records.requirements.every(item => item.status === 'draft' && item.acceptance === null));
  assert.throws(() => f.service.propose(tool, old.project.id, proposalInput, 'blocked-old-001'), code('PROJECT_MIGRATED'));
  assert.throws(() => f.service.issueToken(human, old.project.id, '不能扩权'), code('PROJECT_MIGRATED'));
  f.service.revokeToken(human, old.project.id, issued.scope.id);
  assert.ok(f.service.overview(human)[0]?.scopes[0]?.revokedAt);
  const confirmed = f.records.confirmIntent(human, migrated.id, { baseRevision: 1, confirmed: true,
    discussionSummary: '本人已对照原意图核对转换表示，不扩大边界', sourceRef: '测试商讨记录' }, 'confirm-migrated-001');
  assert.equal(confirmed.records.intent.confirmation.state, 'human_confirmed');
});

test('旧记录变化使迁移预览失效；工具不能迁移、写入或读取新 JSON 项目', t => {
  const f = setup(); t.after(f.cleanup);
  const old = f.service.createProject(human, projectInput, 'create-legacy-002');
  const issued = f.service.issueToken(human, old.project.id, '旧工具');
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  const preview = f.records.migrationPreview(human, old.project.id);
  f.service.propose(tool, old.project.id, proposalInput, 'change-legacy-002');
  assert.throws(() => f.records.migrate(human, old.project.id, { fingerprint: preview.fingerprint, confirmed: true }, 'stale-migrate-002'), code('STALE_MIGRATION'));
  assert.throws(() => f.records.list(tool), code('HUMAN_REQUIRED'));
  assert.throws(() => f.records.migrationPreview(tool, old.project.id), code('HUMAN_REQUIRED'));
  assert.throws(() => f.records.create(tool, input, 'tool-project-001'), code('HUMAN_REQUIRED'));
});

test('HTTP：真实人端项目与预览／保存，CSRF、工具伪装、冲突及合同错误均明确拒绝', async () => {
  const f = await serverFixture();
  try {
    const created = await f.request('/api/record-projects', input, { 'Idempotency-Key': 'http-create-record-001' });
    assert.equal(created.status, 201);
    const project = await created.json() as RecordProject;
    const base = '/api/record-projects/' + project.id;
    const edit = { baseRevision: 1, collection: 'requirements', id: null, record: reqRecord(project), reason: '新增需求' };
    const preview = await f.request(base + '/record-preview', edit);
    assert.equal(preview.status, 200);
    assert.equal((await preview.json() as { report: { valid: boolean } }).report.valid, true);
    const saved = await f.request(base + '/records', { ...edit, confirmed: true }, { 'Idempotency-Key': 'http-save-record-001' });
    assert.equal(saved.status, 200);
    const stale = await f.request(base + '/records', { ...edit, confirmed: true }, { 'Idempotency-Key': 'http-save-stale-001' });
    assert.equal(stale.status, 409);
    const missingOrigin = await fetch(f.base + base + '/records', { method: 'POST', headers: { Cookie: f.cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(missingOrigin.status, 403);
    const old = f.service.createProject(human, projectInput, 'http-old-scope-001');
    const token = f.service.issueToken(human, old.project.id, '不能访问新记录');
    const denied = await fetch(f.base + '/api/record-projects', { headers: { Authorization: 'Bearer ' + token.token } });
    assert.equal(denied.status, 403);
  } finally { await f.stop(); }
});


test('B3 修订纳入迁移预览版本与出处，当前需求理由采用已批准的适用修订', t => {
  const f = setup(); t.after(f.cleanup);
  const old = f.service.createProject(human, projectInput, 'legacy-b3-project');
  const issued = f.service.issueToken(human, old.project.id, '修订来源');
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  const proposal = f.service.propose(tool, old.project.id, proposalInput, 'legacy-b3-propose');
  const first = f.service.decide(human, old.project.id, proposal.id,
    { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 1 }, 'legacy-b3-approve');
  assert.ok(first.issue);
  const grant = f.service.issueToken(human, old.project.id, '有修订范围', undefined, { intent: false, issueIds: [first.issue.id] });
  const before = f.records.migrationPreview(human, old.project.id);
  const { id: _id, projectId: _projectId, intentId: _intentId, sourceProposalId: _sourceProposalId,
    createdAt: _createdAt, version: _version, intentVersion: _intentVersion, ...content } = first.issue;
  const change = f.service.proposeChange({ kind: 'tool', scope: grant.scope }, old.project.id, {
    targetKind: 'issue', targetId: first.issue.id, baseVersion: 1, intentVersion: 1, planVersion: 2,
    reason: '因重新讨论而加强验收', impact: '只增加最终条件核对', after: { ...content, verification: '快速切换后核对最后一个条件。' }
  }, 'legacy-b3-change');
  assert.throws(() => f.records.migrate(human, old.project.id, { fingerprint: before.fingerprint, confirmed: true }, 'legacy-b3-stale'), code('STALE_MIGRATION'));
  f.service.decideChange(human, old.project.id, change.id,
    { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 2, reason: '本人核对修订说明' }, 'legacy-b3-change-approve');
  const current = f.records.migrationPreview(human, old.project.id);
  assert.equal(current.records.requirements[0]?.rationale, '因重新讨论而加强验收');
  assert.ok(current.records.contextItems.some(item => item.content === '本人核对修订说明' && item.epistemicStatus === 'proposed'));
  assert.ok(current.records.sources.some(item => item.locator.includes('/change/' + change.id + '/decision/')));
  assert.equal(current.records.requirements[0]?.acceptance, null);
});
