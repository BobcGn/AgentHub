import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoardService } from '../src/application/board-service.js';
import { HubError } from '../src/domain/board.js';
import type { Principal } from '../src/domain/board.js';
import { issueContent, parseChange } from '../src/domain/changes.js';
import type { Change, NewChange } from '../src/domain/changes.js';
import { toolCredentials } from '../src/infrastructure/auth.js';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { fixture, human, projectInput, proposalInput } from './fixtures.js';
const code = (name: string) => (error: unknown) => error instanceof HubError && error.code === name;
function setup() {
  const f = fixture();
  const board = f.service.createProject(human, projectInput, 'change-project-1');
  const old = f.service.issueToken(human, board.project.id, '旧工具');
  const legacy: Principal = { kind: 'tool', scope: old.scope };
  const p = f.service.propose(legacy, board.project.id, proposalInput, 'change-original-1');
  const result = f.service.decide(human, board.project.id, p.id, { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 1 }, 'change-original-decision');
  assert.ok(result.issue);
  const issue = result.issue;
  const issued = f.service.issueToken(human, board.project.id, '变更工具', undefined, { intent: true, issueIds: [issue.id] });
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  const input: NewChange = { targetKind: 'issue', targetId: issue.id, baseVersion: 1, intentVersion: 1, planVersion: 2,
    reason: '补齐可复现的竞态验证', impact: '仅加强验证，增加一次快速切换检查', after: { ...issueContent(issue), verification: '快速切换十次，最终结果必须对应最后条件。' } };
  const intentInput: NewChange = { targetKind: 'intent', targetId: board.intent.id, baseVersion: 1, intentVersion: 1, planVersion: 2,
    reason: '讨论后澄清预期结果', impact: '已有 Issue 需要重新核对意图对应关系',
    after: { title: board.intent.title, problem: board.intent.problem, outcome: '明确最终条件与结果一致，并展示加载状态。', verification: board.intent.verification } };
  return { ...f, board, issue, legacy, tool, issued, input, intentInput };
}
const decision = (change: Change, action = 'approve', reason?: string) => ({
  action, reason, proposalVersion: change.version, intentVersion: change.intentVersion, planVersion: change.planVersion
});
const auth = (change: Change) => ({ proposalVersion: change.version, intentVersion: change.intentVersion,
  planVersion: change.planVersion, summary: '已商讨目标、风险和受影响单元，仅授权这份候选修订。',
  sourceRef: '外部反向对话 #1', confirmed: true });

test('关键变更需要独立精确范围；旧令牌、越界、未知字段和自我扩权被拒绝', t => {
  const f = setup(); t.after(f.cleanup);
  assert.throws(() => f.service.proposeChange(f.legacy, f.board.project.id, f.input, 'change-old-token'), code('OUT_OF_SCOPE'));
  const another = f.service.createProject(human, projectInput, 'change-other-project');
  assert.throws(() => f.service.proposeChange(f.tool, another.project.id, f.input, 'change-other-target'), code('OUT_OF_SCOPE'));
  for (const extra of [{ approved: true }, { actor: 'human' }, { before: f.input.after }]) assert.throws(() => parseChange({ ...f.input, ...extra }), code('INVALID_INPUT'));
  assert.throws(() => f.service.issueToken(f.tool, f.board.project.id, '扩大', undefined, { intent: true, issueIds: [] }), code('HUMAN_REQUIRED'));
  assert.throws(() => f.service.issueToken(human, f.board.project.id, '错误对象', undefined, { intent: false, issueIds: ['missing'] }), code('INVALID_CHANGE_SCOPE'));
  const limited = f.service.issueToken(human, f.board.project.id, '仅 Intent', undefined, { intent: true, issueIds: [] });
  assert.throws(() => f.service.proposeChange({ kind: 'tool', scope: limited.scope }, f.board.project.id, f.input, 'change-outside-issue'), code('OUT_OF_SCOPE'));
});

test('Issue 候选不改正式内容；批准保留旧快照、决定与权限，重试和重开一致', t => {
  const f = setup(); t.after(f.cleanup);
  const change = f.service.proposeChange(f.tool, f.board.project.id, f.input, 'change-issue-1');
  assert.deepEqual(f.service.overview(human)[0]?.issues[0], f.issue);
  assert.deepEqual(f.service.proposeChange(f.tool, f.board.project.id, f.input, 'change-issue-1'), change);
  const approved = f.service.decideChange(human, f.board.project.id, change.id, decision(change), 'change-approve-1');
  const current = f.service.overview(human)[0];
  assert.equal(current?.issues[0]?.verification, f.input.after.verification);
  assert.equal(current?.issues[0]?.version, 2);
  assert.equal(current?.planVersion, 3);
  assert.deepEqual(approved.before, issueContent(f.issue));
  assert.deepEqual(current?.scopes.find(s => s.id === f.issued.scope.id), f.issued.scope);
  assert.deepEqual(f.service.decideChange(human, f.board.project.id, change.id, decision(change), 'change-approve-1'), approved);
  assert.throws(() => f.service.decideChange(human, f.board.project.id, change.id, decision(change), 'change-approve-twice'), code('STALE_REVIEW'));
  f.store.close();
  const reopened = new SqliteStore(f.path); t.after(() => reopened.close());
  assert.deepEqual(new BoardService(reopened, toolCredentials).overview(human)[0], current);
});

test('退回和拒绝需要原因，保持原内容与计划；不同内容复用编号拒绝', t => {
  const f = setup(); t.after(f.cleanup);
  for (const action of ['return', 'reject']) {
    const c = f.service.proposeChange(f.tool, f.board.project.id, f.input, 'change-action-' + action);
    assert.throws(() => f.service.decideChange(human, f.board.project.id, c.id, decision(c, action), 'change-empty-' + action), code('DECISION_REASON_REQUIRED'));
    f.service.decideChange(human, f.board.project.id, c.id, decision(c, action, '请保留原验证并补充影响说明。'), 'change-done-' + action);
  }
  const current = f.service.overview(human)[0];
  assert.deepEqual(current?.issues[0], f.issue); assert.equal(current?.planVersion, 2);
  assert.throws(() => f.service.proposeChange(f.tool, f.board.project.id, { ...f.input, reason: '不同理由' }, 'change-action-return'), code('REQUEST_REUSED'));
});

test('Intent 修订必须独立商讨授权，Agent 不能自证；授权后仍未改意图，审批后旧 Issue 待核对', t => {
  const f = setup(); t.after(f.cleanup);
  const c = f.service.proposeChange(f.tool, f.board.project.id, f.intentInput, 'change-intent-1');
  assert.throws(() => f.service.decideChange(human, f.board.project.id, c.id, decision(c), 'change-intent-block'), code('INTENT_AUTHORIZATION_REQUIRED'));
  assert.throws(() => f.service.authorizeIntentChange(f.tool, f.board.project.id, c.id, auth(c), 'change-fake-auth'), code('HUMAN_REQUIRED'));
  assert.throws(() => f.service.authorizeIntentChange(human, f.board.project.id, c.id, { ...auth(c), confirmed: false }, 'change-no-consent'), code('EXPLICIT_AUTHORIZATION_REQUIRED'));
  const granted = f.service.authorizeIntentChange(human, f.board.project.id, c.id, auth(c), 'change-auth-1');
  assert.deepEqual(f.service.overview(human)[0]?.intent, f.board.intent);
  assert.throws(() => f.service.decideChange(human, f.board.project.id, c.id, decision(c), 'change-old-auth-review'), code('STALE_REVIEW'));
  f.service.decideChange(human, f.board.project.id, c.id, decision(granted), 'change-intent-approved');
  const after = f.service.overview(human)[0];
  assert.equal(after?.intent.version, 2); assert.equal(after?.planVersion, 3);
  assert.equal(after?.issues[0]?.intentVersion, 1);
  assert.deepEqual(after?.issues[0], f.issue);
  assert.deepEqual(after?.scopes.find(s => s.id === f.issued.scope.id), f.issued.scope);
});

test('Intent 授权可撤销且不转移给其他候选，撤销状态版本绑定', t => {
  const f = setup(); t.after(f.cleanup);
  const a = f.service.proposeChange(f.tool, f.board.project.id, f.intentInput, 'change-authorized-a');
  const b = f.service.proposeChange(f.tool, f.board.project.id, f.intentInput, 'change-unauthed-b');
  const granted = f.service.authorizeIntentChange(human, f.board.project.id, a.id, auth(a), 'change-grant-a');
  assert.throws(() => f.service.decideChange(human, f.board.project.id, b.id, decision(b), 'change-use-other-grant'), code('INTENT_AUTHORIZATION_REQUIRED'));
  const revoked = f.service.revokeIntentAuthorization(human, f.board.project.id, a.id, { proposalVersion: granted.version }, 'change-revoke-a');
  assert.ok(revoked.authorizations[0]?.revokedAt);
  assert.throws(() => f.service.decideChange(human, f.board.project.id, a.id, decision(granted), 'change-stale-grant'), code('STALE_REVIEW'));
  assert.throws(() => f.service.decideChange(human, f.board.project.id, a.id, decision(revoked), 'change-revoked-grant'), code('INTENT_AUTHORIZATION_REQUIRED'));
});

test('并发修订或 Intent 变化使旧基准失效；父子循环拒绝', t => {
  const f = setup(); t.after(f.cleanup);
  assert.throws(() => f.service.proposeChange(f.tool, f.board.project.id, { ...f.input, after: { ...f.input.after, parentIssueId: f.issue.id } }, 'change-self-parent'), code('INVALID_PARENT'));
  assert.throws(() => f.service.proposeChange(f.tool, f.board.project.id, { ...f.input, planVersion: 1 }, 'change-stale-submit'), code('STALE_CHANGE'));
  const a = f.service.proposeChange(f.tool, f.board.project.id, f.input, 'change-concurrent-a');
  const b = f.service.proposeChange(f.tool, f.board.project.id, f.input, 'change-concurrent-b');
  f.service.decideChange(human, f.board.project.id, a.id, decision(a), 'change-concurrent-approve');
  assert.throws(() => f.service.decideChange(human, f.board.project.id, b.id, { ...decision(b), planVersion: 3 }, 'change-outdated-base'), code('STALE_CHANGE'));
  f.service.decideChange(human, f.board.project.id, b.id, { ...decision(b, 'return', '请依据新版本重提。'), planVersion: 3 }, 'change-return-stale');
});

test('修订应用及授权尾部失败完整回滚，重试只生效一次', t => {
  const f = setup(); t.after(f.cleanup);
  const c = f.service.proposeChange(f.tool, f.board.project.id, f.input, 'change-rollback-1');
  const intentChange = f.service.proposeChange(f.tool, f.board.project.id, f.intentInput, 'change-auth-rollback');
  const before = f.service.overview(human)[0];
  f.store.db.exec("CREATE TRIGGER fail_change BEFORE INSERT ON requests WHEN NEW.actor IN ('human:decide-change', 'human:authorize-intent') BEGIN SELECT RAISE(ABORT, 'change failure'); END");
  assert.throws(() => f.service.decideChange(human, f.board.project.id, c.id, decision(c), 'change-rollback-apply'), /change failure/);
  assert.deepEqual(f.service.overview(human)[0], before);
  assert.throws(() => f.service.authorizeIntentChange(human, f.board.project.id, intentChange.id, auth(intentChange), 'change-auth-failure'), /change failure/);
  assert.deepEqual(f.service.overview(human)[0], before);
  f.store.db.exec('DROP TRIGGER fail_change');
  f.service.decideChange(human, f.board.project.id, c.id, decision(c), 'change-rollback-apply');
  assert.equal(f.service.overview(human)[0]?.issues[0]?.version, 2);
});

test('真实 v2 形状增量升级：旧 Issue 补版本，记录 / 凭据 / 幂等原文保留', t => {
  const f = setup(); t.after(f.cleanup);
  const stored = { ...f.issue } as Record<string, unknown>; delete stored['version']; delete stored['intentVersion'];
  f.store.db.prepare('UPDATE issues SET data = ? WHERE id = ?').run(JSON.stringify(stored), f.issue.id);
  f.service.appendEntry(human, f.board.project.id, { kind: 'note', body: '迁移前备注', issueId: null, intentVersion: 1 }, 'change-migration-note');
  const receipt = f.store.replay('human:create-project', 'change-project-1');
  f.store.db.exec('DROP TABLE changes; PRAGMA user_version = 2;'); f.store.close();
  const reopened = new SqliteStore(f.path); t.after(() => reopened.close());
  const current = reopened.getBoard(f.board.project.id);
  assert.equal(reopened.db.pragma('user_version', { simple: true }), 3);
  assert.equal(current?.issues[0]?.version, 1); assert.equal(current?.issues[0]?.intentVersion, 1);
  assert.equal(current?.records[0]?.body, '迁移前备注');
  assert.deepEqual(reopened.replay('human:create-project', 'change-project-1'), receipt);
  assert.deepEqual(current?.scopes.find(s => s.id === f.issued.scope.id), f.issued.scope);
});
