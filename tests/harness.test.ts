import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HubError } from '../src/domain/board.js';
import type { Principal } from '../src/domain/board.js';
import type { ModelPort, ContextSnapshot, RunRepository } from '../src/domain/harness.js';
import { JsonRunStore } from '../src/infrastructure/run-store.js';
import { scriptedModel } from '../src/infrastructure/scripted-model.js';
import { harnessFixture, deferred } from './harness-fixtures.js';
import { human, projectInput } from './fixtures.js';
import { createHubServer } from '../src/infrastructure/http-server.js';
import { initializeAdmin } from '../src/infrastructure/auth.js';

const code = (name: string) => (error: unknown) => error instanceof HubError && error.code === name;
const candidate = (input: ContextSnapshot) => ({ type: 'append_context', requirementId: input.requirementId,
  category: 'assumption', epistemicStatus: 'proposed', content: '待核对假设：正式记录足以恢复下一步。', sourceRefs: [] });
test('AgentHub 自测：保留候选、不改正式记录；人工应用后新服务与新运行继承 JSON 长期信息', async t => {
  const f = harnessFixture(); t.after(f.cleanup);
  const started = f.start(); await f.harness.settled(started.id);
  let run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human'); assert.equal(run.calls, 1);
  assert.equal(f.records.get(human, f.project.id).revision, f.project.revision);
  assert.ok(run.snapshot); assert.equal('audit' in run.snapshot, false);
  run = f.harness.decide(human, run.id, { revision: run.revision, action: 'keep' });
  assert.equal(run.outcome, 'kept'); assert.equal(f.records.get(human, f.project.id).records.contextItems.length, 0);
  const reopened = f.open(new JsonRunStore(join(f.dir, 'runs')));
  assert.equal(reopened.get(human, run.id).outcome, 'kept');
  const preview = reopened.preview(human, run.id); assert.equal(preview.before, null);
  assert.throws(() => reopened.apply(human, run.id, { revision: run.revision, confirmed: false }), code('EXPLICIT_CONFIRMATION_REQUIRED'));
  run = reopened.apply(human, run.id, { revision: run.revision, confirmed: true });
  assert.equal(run.outcome, 'applied'); assert.ok(run.receipt);
  const after = f.records.get(human, f.project.id);
  assert.equal(after.records.contextItems.length, 1); assert.equal(after.records.requirements[0]?.status, 'draft');
  assert.equal(after.records.requirements[0]?.acceptance, null);
  assert.equal(after.records.contextItems[0]?.epistemicStatus, 'unknown');
  assert.equal(after.audit[after.audit.length - 1]?.actor, 'human');
  reopened.apply(human, run.id, { revision: preview.runRevision, confirmed: true });
  assert.equal(f.records.get(human, f.project.id).records.contextItems.length, 1);
  const requirement = after.records.requirements[0]; assert.ok(requirement);
  const progressed = f.records.saveRecord(human, after.id, { baseRevision: after.revision, collection: 'requirements', id: requirement.id,
    record: { ...requirement, status: 'planned', acceptanceCriteria: [{ id: 'AC-INHERIT', description: '演示：继承最新进度',
      verification: '下一次运行读取最新工作状态和验收条件。' }] }, reason: '测试中由人端明确记录计划进度', confirmed: true }, 'harness-progress-update');
  const next = reopened.start(human, f.project.id, { requirementId: 'REQ-HARNESS-1', baseRevision: progressed.revision,
    instruction: '继续读取已保存的未知问题', confirmed: true }, 'harness-cross-session');
  await reopened.settled(next.id);
  assert.equal(reopened.get(human, next.id).snapshot?.contextItems[0]?.id, run.receipt.contextId);
  assert.equal(reopened.get(human, next.id).snapshot?.requirement.status, 'planned');
  assert.equal(reopened.get(human, next.id).snapshot?.projectRevision, progressed.revision);
  const persisted = JSON.parse(readFileSync(join(f.dir, 'runs', run.id + '.json'), 'utf8')) as { schemaVersion: string };
  assert.equal(persisted.schemaVersion, '1.0.0');
});
test('同请求重复启动不重复调用；退回要理由且不改正式记录', async t => {
  const f = harnessFixture(); t.after(f.cleanup);
  const first = f.start(); await f.harness.settled(first.id);
  assert.equal(f.start().id, first.id);
  assert.throws(() => f.start('另一指令'), code('REQUEST_REUSED'));
  const run = f.harness.get(human, first.id);
  assert.throws(() => f.harness.decide(human, run.id, { revision: run.revision, action: 'reject', reason: ' ' }), code('INVALID_INPUT'));
  const rejected = f.harness.decide(human, run.id, { revision: run.revision, action: 'reject', reason: '假设没有依据。' });
  assert.equal(rejected.outcome, 'rejected');
  assert.throws(() => f.harness.preview(human, run.id), code('CANDIDATE_UNAVAILABLE'));
  assert.equal(f.records.get(human, f.project.id).revision, f.project.revision);
});
for (const mode of ['illegal-field','foreign-requirement','foreign-source','claimed-confirmation'] as const) {
  test('非法模型候选被阻断：' + mode, async t => {
    const model: ModelPort = { name: 'failure-double', providerKind: 'scripted', endpoint: 'local://in-memory', async propose(input) {
      const output = candidate(input);
      if (mode === 'illegal-field') return { ...output, trusted: true };
      if (mode === 'foreign-requirement') return { ...output, requirementId: 'OTHER-REQUIREMENT' };
      if (mode === 'foreign-source') return { ...output, sourceRefs: ['PRIVATE-SOURCE'] };
      return { ...output, epistemicStatus: 'confirmed' };
    } };
    const f = harnessFixture(model); t.after(f.cleanup);
    const started = f.start(); await f.harness.settled(started.id);
    const run = f.harness.get(human, started.id);
    assert.equal(run.state, 'failed'); assert.equal(run.candidate, null); assert.ok(run.issues.length);
    assert.equal(f.records.get(human, f.project.id).revision, f.project.revision);
  });
}
test('项目在模型运行中变化：输出不得使用过期修订；等待中的候选同样不能应用', async t => {
  const gate = deferred<unknown>(), entered = deferred<ContextSnapshot>();
  const f = harnessFixture({ name: 'delayed', providerKind: 'scripted', endpoint: 'local://in-memory', async propose(input) { entered.resolve(input); return gate.promise; } }); t.after(f.cleanup);
  const started = f.start(), input = await entered.promise;
  const old = f.records.get(human, f.project.id), req = old.records.requirements[0]; assert.ok(req);
  f.records.saveRecord(human, old.id, { baseRevision: old.revision, collection: 'requirements', id: req.id,
    record: { ...req, title: req.title + '（新版本）' }, reason: '测试并发变更', confirmed: true }, 'harness-concurrent-edit');
  gate.resolve(candidate(input)); await f.harness.settled(started.id);
  assert.equal(f.harness.get(human, started.id).stopReason, 'STALE_RUN_CONTEXT');
  const second = f.start('核对新版本', 'harness-stale-wait');
  await f.harness.settled(second.id);
  const current = f.records.get(human, old.id), item = current.records.requirements[0]; assert.ok(item);
  f.records.saveRecord(human, old.id, { baseRevision: current.revision, collection: 'requirements', id: item.id,
    record: { ...item, title: item.title + '再变化' }, reason: '测试等待时变更', confirmed: true }, 'harness-concurrent-again');
  const run = f.harness.get(human, second.id);
  assert.throws(() => f.harness.apply(human, run.id, { revision: run.revision, confirmed: true }), code('STALE_RUN_CONTEXT'));
});
test('超时后晚到输出被丢弃，不写候选或正式内容', async t => {
  const gate = deferred<unknown>(), entered = deferred<ContextSnapshot>();
  const f = harnessFixture({ name: 'late-output', providerKind: 'scripted', endpoint: 'local://in-memory', async propose(input) { entered.resolve(input); return gate.promise; } }, { timeoutMs: 15 });
  t.after(f.cleanup); const started = f.start(), input = await entered.promise;
  await f.harness.settled(started.id);
  assert.equal(f.harness.get(human, started.id).stopReason, 'MODEL_TIMEOUT');
  gate.resolve(candidate(input)); await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(f.harness.get(human, started.id).candidate, null);
  assert.equal(f.records.get(human, f.project.id).revision, f.project.revision);
});
test('取消会撤销范围；不合作的模型晚到也无法产生副作用', async t => {
  const gate = deferred<unknown>(), entered = deferred<ContextSnapshot>();
  const f = harnessFixture({ name: 'cancel-double', providerKind: 'scripted', endpoint: 'local://in-memory', async propose(input) { entered.resolve(input); return gate.promise; } });
  t.after(f.cleanup); const started = f.start(), input = await entered.promise;
  const run = f.harness.get(human, started.id);
  const cancelled = f.harness.cancel(human, run.id, { revision: run.revision });
  assert.equal(cancelled.authorization.active, false); await f.harness.settled(run.id);
  gate.resolve(candidate(input)); await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(f.harness.get(human, run.id).state, 'cancelled');
  assert.throws(() => f.harness.resume(human, run.id, { revision: cancelled.revision, confirmed: true }), code('RUN_NOT_RESUMABLE'));
});
for (const [name, limits, reason] of [
  ['necessary-input', { maxInputBytes: 50 }, 'CONTEXT_BUDGET'],
  ['call-count', { maxCalls: 0 }, 'CALL_BUDGET'],
  ['response-size', { maxOutputBytes: 20 }, 'OUTPUT_BUDGET']
] as const) {
  test('预算终止：' + name, async t => {
    const f = harnessFixture(scriptedModel, limits); t.after(f.cleanup);
    const started = f.start(); await f.harness.settled(started.id);
    assert.equal(f.harness.get(human, started.id).stopReason, reason);
    assert.equal(f.records.get(human, f.project.id).revision, f.project.revision);
  });
}
test('恢复重查授权与修订；调用中断不自动重发', async t => {
  const gate = deferred<unknown>(), entered = deferred<ContextSnapshot>();
  let calls = 0;
  const f = harnessFixture({ name: 'restart-double', providerKind: 'scripted', endpoint: 'local://in-memory', async propose(input) { calls++; entered.resolve(input); return gate.promise; } }); t.after(f.cleanup);
  const started = f.start(); await entered.promise;
  f.harness.shutdown(); await f.harness.settled(started.id);
  const reopened = f.open(), run = reopened.get(human, started.id);
  assert.equal(run.state, 'interrupted'); assert.equal(calls, 1);
  assert.throws(() => reopened.resume(human, run.id, { revision: run.revision, confirmed: true }), code('NEW_RUN_REQUIRED'));
  assert.equal(calls, 1);
});
test('人工保留不重复调用；授权到期后仍可由本人重新核对并恢复判断', async t => {
  const f = harnessFixture(); t.after(f.cleanup);
  const started = f.start(); await f.harness.settled(started.id);
  const waiting = f.harness.get(human, started.id);
  const old = f.harness.decide(human, waiting.id, { revision: waiting.revision, action: 'keep' });
  f.runs.replace({ ...old, revision: old.revision + 1, authorization: { ...old.authorization, expiresAt: '2000-01-01T00:00:00.000Z' } }, old.revision);
  const run = f.harness.get(human, old.id);
  assert.throws(() => f.harness.preview(human, run.id), code('RUN_AUTHORIZATION_EXPIRED'));
  const resumed = f.harness.resume(human, run.id, { revision: run.revision, confirmed: true });
  assert.equal(resumed.state, 'waiting_human'); assert.equal(resumed.calls, 1);
});
test('正式保存后 Run 回执中断：重开根据真实项目回执核对，不重复追加', async t => {
  const f = harnessFixture(); t.after(f.cleanup);
  let once = true;
  const faulty: RunRepository = { list: id => f.runs.list(id), get: id => f.runs.get(id), create: run => f.runs.create(run),
    replace(run, revision) { if (once && run.events[run.events.length - 1]?.type === 'record_applied') { once = false; throw new Error('模拟回执落盘中断'); } f.runs.replace(run, revision); } };
  const harness = f.open(faulty);
  const started = harness.start(human, f.project.id, { requirementId: 'REQ-HARNESS-1', baseRevision: f.project.revision, instruction: '保存回执恢复', confirmed: true }, 'harness-fault-apply');
  await harness.settled(started.id);
  const run = harness.get(human, started.id);
  assert.throws(() => harness.apply(human, run.id, { revision: run.revision, confirmed: true }), /模拟回执/);
  assert.equal(f.records.get(human, f.project.id).records.contextItems.length, 1);
  const reopened = f.open(), interrupted = reopened.get(human, run.id);
  const restored = reopened.resume(human, run.id, { revision: interrupted.revision, confirmed: true });
  assert.equal(restored.outcome, 'applied'); assert.ok(restored.receipt);
  assert.equal(f.records.get(human, f.project.id).records.contextItems.length, 1);
});
test('Run JSON 损坏不能靠类型断言加载', async t => {
  const f = harnessFixture(); t.after(f.cleanup);
  const run = f.start(); await f.harness.settled(run.id);
  writeFileSync(join(f.dir, 'runs', run.id + '.json'), JSON.stringify({ id: run.id, state: 'waiting_human', schemaVersion: '1.0.0', revision: 1, events: [] }));
  assert.throws(() => f.runs.get(run.id), code('INVALID_RUN_FILE'));
});
test('HTTP 运行只接受真实人端会话；旧工具不继承权限，预览和应用均保持边界', async t => {
  const f = harnessFixture(); t.after(f.cleanup); initializeAdmin(f.store, 'harness-http-test-only');
  const server = createHubServer({ store: f.store, service: f.service, recordService: f.records, harness: f.harness, webRoot: 'dist/web' });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeUpdates(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const login = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'harness-http-test-only' }) });
  const cookie = login.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  const legacy = f.service.createProject(human, projectInput, 'harness-legacy-http'), token = f.service.issueToken(human, legacy.project.id, '旧工具测试');
  const route = '/api/record-projects/' + f.project.id + '/runs';
  assert.equal((await fetch(base + route)).status, 401);
  assert.equal((await fetch(base + route, { headers: { Cookie: cookie, Authorization: 'Bearer ' + token.token } })).status, 403);
  const input = { requirementId: 'REQ-HARNESS-1', baseRevision: f.project.revision, instruction: 'HTTP 自测', confirmed: true };
  assert.equal((await fetch(base + route, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 403);
  const response = await fetch(base + route, { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'Idempotency-Key': 'harness-http-start' }, body: JSON.stringify(input) });
  assert.equal(response.status, 201);
  const run = await response.json() as { id: string }; await f.harness.settled(run.id);
  assert.equal((await fetch(base + '/api/runs/' + run.id + '/preview', { headers: { Cookie: cookie } })).status, 200);
  const tool: Principal = { kind: 'tool', scope: token.scope };
  assert.throws(() => f.harness.get(tool, run.id), code('HUMAN_REQUIRED'));
  assert.throws(() => f.harness.apply(tool, run.id, { revision: 1, confirmed: true }), code('HUMAN_REQUIRED'));
});

test('上下文只选本需求与全局约束；不发送其他需求、审计与未选资料，省略清单可回查', async t => {
  const f = harnessFixture(scriptedModel, { maxInputBytes: 5000 }); t.after(f.cleanup);
  const project = f.records.get(human, f.project.id), req = project.records.requirements[0]; assert.ok(req);
  const data = structuredClone(project.records), ref = req.sourceRefs[0]; assert.ok(ref);
  data.requirements.push({ ...req, id: 'REQ-PRIVATE', identifier: 'AGE-2', title: 'PRIVATE-SIBLING-CONTENT' });
  data.contextItems.push({ id: 'GLOBAL-BOUNDARY', requirementId: null, category: 'constraint', content: '不能跳过人工决定。',
    epistemicStatus: 'confirmed', sourceRefs: [ref], evidenceRefs: [] });
  data.contextItems.push({ id: 'GLOBAL-DECISION', requirementId: null, category: 'decision', content: '必须先理解再推进。',
    epistemicStatus: 'confirmed', sourceRefs: [ref], evidenceRefs: [] });
  data.contextItems.push({ id: 'PRIVATE-CONTEXT', requirementId: 'REQ-PRIVATE', category: 'fact', content: 'PRIVATE-CONTEXT-CONTENT',
    epistemicStatus: 'proposed', sourceRefs: [ref], evidenceRefs: [] });
  for (let i = 0; i < 10; i++) data.contextItems.push({ id: 'OPTION-' + i, requirementId: req.id, category: 'assumption',
    content: '尚待核对'.repeat(180), epistemicStatus: 'proposed', sourceRefs: [ref], evidenceRefs: [] });
  f.recordStore.replace({ ...project, revision: project.revision + 1, records: data }, project.revision);
  const started = f.start(); await f.harness.settled(started.id);
  const run = f.harness.get(human, started.id); assert.equal(run.state, 'waiting_human', JSON.stringify({ reason: run.stopReason, issues: run.issues })); assert.ok(run.snapshot);
  assert.ok(run.snapshot.omitted.length); assert.ok(run.snapshot.contextItems.some(item => item.id === 'GLOBAL-BOUNDARY'));
  assert.ok(run.snapshot.contextItems.some(item => item.id === 'GLOBAL-DECISION'));
  assert.equal(JSON.stringify(run.snapshot).includes('PRIVATE-SIBLING-CONTENT'), false);
  assert.equal(JSON.stringify(run.snapshot).includes('PRIVATE-CONTEXT-CONTENT'), false);
  assert.equal('audit' in run.snapshot, false);
});

test('应用回执中断后取消：先核对已发生的保存，不掩盖或回滚正式事实', async t => {
  const f = harnessFixture(); t.after(f.cleanup);
  let once = true;
  const faulty: RunRepository = { list: id => f.runs.list(id), get: id => f.runs.get(id), create: run => f.runs.create(run),
    replace(run, revision) { if (once && run.events[run.events.length - 1]?.type === 'record_applied') { once = false; throw new Error('回执中断'); } f.runs.replace(run, revision); } };
  const harness = f.open(faulty);
  const started = harness.start(human, f.project.id, { requirementId: 'REQ-HARNESS-1', baseRevision: f.project.revision,
    instruction: '保存后取消必须保留实际影响', confirmed: true }, 'harness-cancel-unknown');
  await harness.settled(started.id);
  const ready = harness.get(human, started.id);
  assert.throws(() => harness.apply(human, ready.id, { revision: ready.revision, confirmed: true }), /回执中断/);
  const interrupted = harness.get(human, ready.id);
  const reconciled = harness.cancel(human, ready.id, { revision: interrupted.revision });
  assert.equal(reconciled.outcome, 'applied'); assert.equal(reconciled.state, 'completed');
  assert.equal(reconciled.authorization.active, false); assert.ok(reconciled.receipt);
  assert.equal(f.records.get(human, f.project.id).records.contextItems.length, 1);
});
