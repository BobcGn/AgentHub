import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RecordProjectService } from '../src/application/record-project-service.js';
import { HubError } from '../src/domain/board.js';
import { defaultProjectPrefix } from '../src/domain/project-identifiers.js';
import type { RecordProject } from '../src/domain/record-project.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { JsonRecordProjectStore } from '../src/infrastructure/record-project-store.js';
import { join } from 'node:path';
import { fixture, human, projectInput, serverFixture } from './fixtures.js';
import { harnessFixture } from './harness-fixtures.js';

const code = (value: string) => (error: unknown) => error instanceof HubError && error.code === value;
function setup() { const f = fixture(); return { ...f, records: new RecordProjectService(f.recordStore, f.service, createRecordStructureValidator()) }; }
function requirement(project: RecordProject, id: string) {
  return { id, kind: 'requirement', intentId: project.records.intent.id, title: '待讨论的需求', problem: '需要明确边界',
    expectedOutcome: '形成明确的交付单元', scope: { includes: ['记录'], excludes: [] }, rationale: '保留讨论进度', expectedImpact: '便于核对',
    acceptanceCriteria: [], sourceRefs: [], status: 'draft', result: null, constraints: [], acceptance: null, pullRequest: null };
}
const confirmation = { confirmed: true, discussionSummary: '测试人端已讨论目标和边界；不是用户实际验收。', sourceRef: 'test:discussion' };

test('名称即可创建；意图真实留空且未确认，幂等重开不改旧库，非法标记拒绝', t => {
  const f = setup(); t.after(f.cleanup);
  const before = f.service.overview(human);
  assert.throws(() => f.records.create(human, { name: ' ' }, 'empty-name-001'), code('INVALID_INPUT'));
  for (const prefix of ['1ABC','BAD-PREFIX','测试','A'.repeat(21),123]) {
    assert.throws(() => f.records.create(human, { name: 'AgentHub', identifierPrefix: prefix }, 'invalid-prefix-001'), code('INVALID_PROJECT_PREFIX'));
  }
  const project = f.records.create(human, { name: 'AgentHub', identifierPrefix: ' agenthub ' }, 'draft-create-001');
  assert.equal(project.identifierPrefix, 'AGENTHUB');
  assert.equal(project.records.intent.title, '');
  assert.equal(project.records.intent.problem, '');
  assert.equal(project.records.intent.expectedOutcome, '');
  assert.deepEqual(project.records.intent.scope, { includes: [], excludes: [] });
  assert.deepEqual(project.records.intent.confirmation, { state: 'proposed', sourceRefs: [] });
  assert.match(project.records.sources[0]?.excerpt ?? '', /尚未填写或确认/);
  assert.deepEqual(f.records.create(human, { name: 'AgentHub', identifierPrefix: ' agenthub ' }, 'draft-create-001'), project);
  const reopened = new RecordProjectService(new JsonRecordProjectStore(join(f.dir, 'record-projects')), f.service, createRecordStructureValidator());
  assert.deepEqual(reopened.get(human, project.id), project);
  assert.deepEqual(f.service.overview(human), before);
});

test('默认项目标记：英文前三位、中文拼音首字母、中英混合、短名称及无字母回退', () => {
  for (const [name,prefix] of [['AgentHub','AGE'],['项目管理','XMG'],['重庆项目','CQX'],['AI项目','AIX'],['测试','CS'],['a','A'],['123😊','PRJ']]) {
    assert.equal(defaultProjectPrefix(name ?? ''), prefix);
  }
});

test('意图草稿可分次保存并预览，冲突与失败保留旧版；保存不等于确认', t => {
  const f = setup(); t.after(f.cleanup);
  const project = f.records.create(human, { name: '项目管理' }, 'intent-draft-create');
  const first = { baseRevision: 1, title: '先理解再推进' };
  const preview = f.records.previewIntentDraft(human, project.id, first);
  assert.equal(preview.report.valid, true); assert.equal(f.records.get(human, project.id).revision, 1);
  assert.throws(() => f.records.saveIntentDraft(human, project.id, first, 'draft-no-confirm'), code('EXPLICIT_CONFIRMATION_REQUIRED'));
  const saved = f.records.saveIntentDraft(human, project.id, { ...first, confirmed: true }, 'intent-draft-save');
  assert.deepEqual(saved.records.intent, preview.after);
  assert.equal(saved.records.intent.confirmation.state, 'proposed');
  assert.deepEqual(f.records.saveIntentDraft(human, project.id, { ...first, confirmed: true }, 'intent-draft-save'), saved);
  assert.throws(() => f.records.saveIntentDraft(human, project.id, { ...first, title: '不同输入', confirmed: true }, 'intent-draft-save'), code('REQUEST_REUSED'));
  assert.throws(() => f.records.saveIntentDraft(human, project.id, { ...first, problem: '过期', confirmed: true }, 'intent-draft-stale'), code('STALE_RECORD_PROJECT'));
  assert.throws(() => f.records.confirmIntent(human, project.id, { baseRevision: saved.revision, ...confirmation }, 'incomplete-confirm'), code('INVALID_RECORD_SET'));
  assert.equal(f.records.get(human, project.id).revision, 2);
  assert.throws(() => f.records.saveIntentDraft(human, project.id, { baseRevision: 2, title: 1, confirmed: true }, 'draft-bad-text'), code('INVALID_INPUT'));
  const replace = f.recordStore.replace.bind(f.recordStore);
  f.recordStore.replace = () => { throw new Error('simulated draft persistence failure'); };
  assert.throws(() => f.records.saveIntentDraft(human, project.id, { baseRevision: 2, problem: '尚未明确', confirmed: true }, 'draft-disk-failure'), /persistence failure/);
  assert.equal(f.records.get(human, project.id).revision, 2); f.recordStore.replace = replace;
  const full = f.records.saveIntentDraft(human, project.id, { baseRevision: 2, problem: '推进过程不透明', expectedOutcome: '过程可核对',
    includes: ['单需求记录'], excludes: ['代码执行'], constraints: [], confirmed: true }, 'intent-draft-complete');
  assert.equal(full.records.intent.confirmation.state, 'proposed');
  const confirmed = f.records.confirmIntent(human, project.id, { baseRevision: full.revision, ...confirmation }, 'intent-confirm-real');
  assert.equal(confirmed.records.intent.confirmation.state, 'human_confirmed');
  assert.throws(() => f.records.saveIntentDraft(human, project.id, { baseRevision: confirmed.revision, title: '偷偷改意图', confirmed: true }, 'confirmed-cannot-edit'), code('INTENT_DRAFT_UNAVAILABLE'));
  assert.equal(f.records.get(human, project.id).records.intent.title, '先理解再推进');
});

test('需求编号在成功保存时递增；预览、失败、重试不消耗序号，内部 ID 不变且不能改标识', t => {
  const f = setup(); t.after(f.cleanup);
  const project = f.records.create(human, { name: 'AgentHub', identifierPrefix: 'AGENTHUB' }, 'number-create-001');
  const edit = { baseRevision: 1, collection: 'requirements', id: null, record: requirement(project, 'uuid-stable-1'), reason: '讨论中的草案' };
  assert.equal((f.records.previewEdit(human, project.id, edit).after as { identifier: string }).identifier, 'AGENTHUB-1');
  assert.equal(f.records.get(human, project.id).nextRequirementNumber, 1);
  const invalid = { ...edit, record: { ...edit.record, title: '' }, confirmed: true };
  assert.throws(() => f.records.saveRecord(human, project.id, invalid, 'number-bad-001'), code('INVALID_RECORD_SET'));
  assert.equal(f.records.get(human, project.id).nextRequirementNumber, 1);
  const replace = f.recordStore.replace.bind(f.recordStore);
  f.recordStore.replace = () => { throw new Error('number write failed'); };
  assert.throws(() => f.records.saveRecord(human, project.id, { ...edit, confirmed: true }, 'number-save-001'), /number write failed/);
  f.recordStore.replace = replace;
  const saved = f.records.saveRecord(human, project.id, { ...edit, confirmed: true }, 'number-save-001');
  assert.equal(saved.records.requirements[0]?.identifier, 'AGENTHUB-1');
  assert.equal(saved.records.requirements[0]?.id, 'uuid-stable-1');
  assert.equal(saved.nextRequirementNumber, 2);
  assert.equal(f.records.saveRecord(human, project.id, { ...edit, confirmed: true }, 'number-save-001').nextRequirementNumber, 2);
  assert.throws(() => f.records.saveRecord(human, project.id, { ...edit, confirmed: true }, 'number-stale-001'), code('STALE_RECORD_PROJECT'));
  const req = saved.records.requirements[0]; assert.ok(req);
  assert.throws(() => f.records.saveRecord(human, project.id, { ...edit, baseRevision: 2, id: req.id, record: { ...req, identifier: 'AGENTHUB-9' }, confirmed: true }, 'number-rename-001'), code('IDENTITY_CHANGED'));
  assert.throws(() => f.records.saveRecord(human, project.id, { ...edit, baseRevision: 2, record: { ...requirement(project, 'uuid-2'), identifier: 'AGENTHUB-1' }, confirmed: true }, 'number-forged-001'), code('INVALID_IDENTIFIER'));
  const next = f.records.saveRecord(human, project.id, { ...edit, baseRevision: 2, record: requirement(project, 'uuid-2'), confirmed: true }, 'number-save-002');
  assert.equal(next.records.requirements[1]?.identifier, 'AGENTHUB-2');
  assert.equal(next.nextRequirementNumber, 3);
});

test('旧项目无需补字段即可读取，新需求按名称分配标识，旧记录与引用不回写', t => {
  const f = setup(); t.after(f.cleanup);
  const project = f.records.create(human, { name: '项目管理' }, 'legacy-meta-create');
  const old = { ...project }; delete old.identifierPrefix; delete old.nextRequirementNumber;
  f.recordStore.replace({ ...old, revision: 2 }, 1);
  const reopened = f.records.get(human, project.id); assert.equal(reopened.identifierPrefix, undefined);
  assert.equal(f.recordStore.get(project.id)?.revision, 2);
  const saved = f.records.saveRecord(human, project.id, { baseRevision: 2, collection: 'requirements', id: null,
    record: requirement(project, 'stable-old-reference'), reason: '新增草案', confirmed: true }, 'legacy-meta-save');
  assert.equal(saved.records.requirements[0]?.identifier, 'XMG-1');
  assert.deepEqual(saved.records.intent, project.records.intent);
});

test('未确认意图允许草案记录，但拒绝正式计划与 Harness，不生成运行或人工确认', t => {
  const f = harnessFixture(); t.after(f.cleanup);
  const project = f.records.create(human, { name: 'Draft' }, 'harness-draft-project');
  const edit = { baseRevision: 1, collection: 'requirements', id: null, record: requirement(project, 'req-unconfirmed'), reason: '保留草案', confirmed: true };
  const saved = f.records.saveRecord(human, project.id, edit, 'harness-draft-req');
  assert.throws(() => f.records.saveRecord(human, project.id, { ...edit, baseRevision: saved.revision, id: 'req-unconfirmed',
    record: { ...saved.records.requirements[0], status: 'planned', acceptanceCriteria: [{ id: 'criterion', description: '条件', verification: '观察' }] } }, 'harness-draft-plan'), code('INVALID_RECORD_SET'));
  assert.throws(() => f.harness.start(human, project.id, { requirementId: 'req-unconfirmed', baseRevision: saved.revision,
    instruction: '不能在未确认意图上运行', confirmed: true }, 'draft-run-denied'), code('RUN_OUT_OF_SCOPE'));
  assert.equal(f.runs.list(project.id).length, 0);
  assert.equal(f.records.get(human, project.id).records.intent.confirmation.state, 'proposed');
});

test('草稿 HTTP 入口：真实人端预览／保存／确认；旧工具、缺 Origin、过期均拒绝', async () => {
  const f = await serverFixture();
  try {
    const created = await f.request('/api/record-projects', { name: '项目管理' }, { 'Idempotency-Key': 'draft-http-create' });
    assert.equal(created.status, 201);
    const project = await created.json() as RecordProject, base = '/api/record-projects/' + project.id;
    const input = { baseRevision: 1, title: '进度可继承' };
    assert.equal((await f.request(base + '/intent-draft-preview', input)).status, 200);
    assert.equal((await f.request(base + '/intent-draft', { ...input, confirmed: true }, { 'Idempotency-Key': 'draft-http-save' })).status, 200);
    assert.equal((await f.request(base + '/intent-draft', { ...input, confirmed: true }, { 'Idempotency-Key': 'draft-http-stale' })).status, 409);
    assert.equal((await f.request(base + '/intent-confirmation', { ...confirmation, baseRevision: 2 }, { 'Idempotency-Key': 'draft-http-confirm' })).status, 400);
    const noOrigin = await fetch(f.base + base + '/intent-draft-preview', { method: 'POST', headers: { Cookie: f.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(noOrigin.status, 403);
    const legacy = f.service.createProject(human, projectInput, 'draft-http-legacy');
    const token = f.service.issueToken(human, legacy.project.id, '旧工具不可改草稿');
    for (const route of ['intent-draft-preview','intent-draft','intent-confirmation']) {
      const denied = await fetch(f.base + base + '/' + route, { method: 'POST', headers: { Origin: f.base, Authorization: 'Bearer ' + token.token,
        'Content-Type': 'application/json', 'Idempotency-Key': 'draft-tool-denied' }, body: JSON.stringify({ ...input, confirmed: true }) });
      assert.equal(denied.status, 403);
    }
    assert.equal(f.recordService.get(human, project.id).revision, 2);
  } finally { await f.stop(); }
});
