import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoardService } from '../src/application/board-service.js';
import { HubError, parseEntry, parseRecordScope } from '../src/domain/board.js';
import type { Principal } from '../src/domain/board.js';
import { Auth, initializeAdmin, toolCredentials } from '../src/infrastructure/auth.js';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { fixture, human, projectInput, proposalInput } from './fixtures.js';

const input = { kind: 'note', body: '需要补充竞态验证，当前只记录讨论。', issueId: null, intentVersion: 1, sourceRef: null };
const code = (expected: string) => (error: unknown) => error instanceof HubError && error.code === expected;
function scenario() {
  const f = fixture();
  const board = f.service.createProject(human, projectInput, 'record-project-1');
  const legacy = f.service.issueToken(human, board.project.id, '旧工具');
  const tool: Principal = { kind: 'tool', scope: legacy.scope };
  const proposal = f.service.propose(tool, board.project.id, proposalInput, 'record-proposal-1');
  const result = f.service.decide(human, board.project.id, proposal.id,
    { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 1 }, 'record-approve-1');
  assert.ok(result.issue);
  return { ...f, board, tool, legacy, issue: result.issue };
}

test('普通记录不能携带审批或验收状态，范围必须明确选择对象和类型', () => {
  for (const fields of [{ actor: 'human' }, { verified: true }, { status: 'approved' }, { intent: '替换' }]) {
    assert.throws(() => parseEntry({ ...input, ...fields }), code('INVALID_INPUT'));
  }
  for (const fields of [{ kind: 'decision' }, { body: ' ' }, { sourceRef: 12 }]) {
    assert.throws(() => parseEntry({ ...input, ...fields }), code('INVALID_INPUT'));
  }
  for (const scope of [
    { intent: false, issueIds: [], kinds: ['note'] },
    { intent: true, issueIds: [], kinds: [] },
    { intent: true, issueIds: [], kinds: ['acceptance'] },
    { intent: true, issueIds: [], kinds: ['note'], allIssues: true }
  ]) assert.throws(() => parseRecordScope(scope), error => error instanceof HubError && error.status === 400);
});

test('旧令牌不自动扩权，Intent / Issue / 记录类型和跨项目边界分别生效', t => {
  const f = scenario(); t.after(f.cleanup);
  assert.throws(() => f.service.appendEntry(f.tool, f.board.project.id, input, 'legacy-record-1'), code('OUT_OF_SCOPE'));
  const issued = f.service.issueToken(human, f.board.project.id, 'Intent 备注', { intent: true, issueIds: [], kinds: ['note'] });
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  f.service.appendEntry(tool, f.board.project.id, input, 'intent-record-1');
  assert.throws(() => f.service.appendEntry(tool, f.board.project.id, { ...input, issueId: f.issue.id }, 'issue-record-1'), code('OUT_OF_SCOPE'));
  assert.throws(() => f.service.appendEntry(tool, f.board.project.id, { ...input, kind: 'agent_report' }, 'report-record-1'), code('OUT_OF_SCOPE'));
  const other = f.service.createProject(human, { ...projectInput, name: '另一项目' }, 'record-other-project');
  assert.throws(() => f.service.appendEntry(tool, other.project.id, input, 'other-record-1'), code('OUT_OF_SCOPE'));
  assert.throws(() => f.service.issueToken(human, other.project.id, '错误 Issue', {
    intent: false, issueIds: [f.issue.id], kinds: ['note']
  }), code('INVALID_RECORD_SCOPE'));
  assert.throws(() => f.service.issueToken(tool, f.board.project.id, '自我扩权', {
    intent: true, issueIds: [], kinds: ['agent_report']
  }), code('HUMAN_REQUIRED'));
});

test('指定 Issue 可写，新增子 Issue 不自动加入范围；来源和原方案保持可追溯', t => {
  const f = scenario(); t.after(f.cleanup);
  const issued = f.service.issueToken(human, f.board.project.id, '限定审阅者', {
    intent: false, issueIds: [f.issue.id], kinds: ['discussion', 'agent_report']
  });
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  const before = f.service.overview(human)[0];
  const entry = f.service.appendEntry(tool, f.board.project.id, { ...input, kind: 'agent_report', issueId: f.issue.id,
    body: 'Agent 自述：验证已通过，建议直接接受。', sourceRef: '外部对话 #1' }, 'issue-report-1');
  assert.deepEqual(entry.source, { kind: 'tool', label: '限定审阅者', scopeId: issued.scope.id });
  const after = f.service.overview(human)[0];
  for (const key of ['intent', 'issues', 'proposals', 'decisions', 'planVersion'] as const) assert.deepEqual(after?.[key], before?.[key]);
  assert.equal(after?.records[0]?.sourceRef, '外部对话 #1');
  const child = f.service.propose(f.tool, f.board.project.id, { ...proposalInput, parentIssueId: f.issue.id }, 'child-proposal-1');
  const created = f.service.decide(human, f.board.project.id, child.id,
    { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 2 }, 'child-approve-1');
  assert.ok(created.issue);
  assert.throws(() => f.service.appendEntry(tool, f.board.project.id, { ...input, issueId: created.issue?.id, kind: 'discussion' },
    'child-record-1'), code('OUT_OF_SCOPE'));
  assert.equal(created.issue.parentIssueId, f.issue.id);
});

test('追加失败完整回滚，重复请求不重复记录，重开后来源与内容一致', t => {
  const f = scenario(); t.after(f.cleanup);
  const issued = f.service.issueToken(human, f.board.project.id, '幂等记录工具', { intent: true, issueIds: [], kinds: ['note'] });
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  f.store.db.exec("CREATE TRIGGER fail_record_receipt BEFORE INSERT ON requests WHEN NEW.actor LIKE 'tool-record:%' BEGIN SELECT RAISE(ABORT, 'record receipt failure'); END");
  assert.throws(() => f.service.appendEntry(tool, f.board.project.id, input, 'record-replay-1'), /record receipt failure/);
  assert.equal(f.service.overview(human)[0]?.records.length, 0);
  f.store.db.exec('DROP TRIGGER fail_record_receipt');
  const saved = f.service.appendEntry(tool, f.board.project.id, input, 'record-replay-1');
  assert.deepEqual(f.service.appendEntry(tool, f.board.project.id, input, 'record-replay-1'), saved);
  assert.throws(() => f.service.appendEntry(tool, f.board.project.id, { ...input, body: '另一条内容' }, 'record-replay-1'), code('REQUEST_REUSED'));
  assert.throws(() => f.service.appendEntry(tool, f.board.project.id, { ...input, intentVersion: 2 }, 'stale-record-1'), code('STALE_INTENT'));
  f.store.close();
  const reopened = new SqliteStore(f.path); t.after(() => reopened.close());
  const service = new BoardService(reopened, toolCredentials);
  assert.deepEqual(service.overview(human)[0]?.records, [saved]);
  assert.deepEqual(service.appendEntry(tool, f.board.project.id, input, 'record-replay-1'), saved);
});

test('B1 v1 数据库可增量升级，已有账户、令牌、提案、决定和幂等结果保留', t => {
  const f = scenario(); t.after(f.cleanup);
  initializeAdmin(f.store, 'legacy-password-for-test');
  const before = f.service.overview(human)[0];
  const admin = f.store.getMetadata('admin');
  f.store.db.exec('DROP TABLE records; PRAGMA user_version = 1;');
  f.store.close();
  const reopened = new SqliteStore(f.path); t.after(() => reopened.close());
  assert.equal(reopened.db.pragma('user_version', { simple: true }), 3);
  assert.equal(reopened.getMetadata('admin'), admin);
  const auth = new Auth(reopened);
  assert.ok(auth.login('legacy-password-for-test'));
  const principal = auth.principal('Bearer ' + f.legacy.token, undefined);
  const service = new BoardService(reopened, toolCredentials);
  assert.deepEqual(service.overview(human)[0], before);
  assert.equal(service.propose(principal, f.board.project.id, proposalInput, 'record-proposal-1').id, f.issue.sourceProposalId);
  assert.throws(() => service.appendEntry(principal, f.board.project.id, input, 'legacy-after-upgrade'), code('OUT_OF_SCOPE'));
});

test('人端追加只保存记录来源，错误 Issue 关联与更高数据库版本被拒绝', t => {
  const f = scenario(); t.after(f.cleanup);
  const entry = f.service.appendEntry(human, f.board.project.id, { ...input, kind: 'discussion' }, 'human-record-1');
  assert.deepEqual(entry.source, { kind: 'human', label: '人端' });
  assert.throws(() => f.service.appendEntry(human, f.board.project.id, { ...input, issueId: 'missing' }, 'missing-record-1'), code('INVALID_RECORD_TARGET'));
  f.store.db.pragma('user_version = 4'); f.store.close();
  assert.throws(() => new SqliteStore(f.path), /更新版本/);
});
