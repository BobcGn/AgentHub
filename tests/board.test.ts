import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HubError, parseDecision, parseProposal } from '../src/domain/board.js';
import type { Principal } from '../src/domain/board.js';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { BoardService } from '../src/application/board-service.js';
import { toolCredentials } from '../src/infrastructure/auth.js';
import { fixture, human, projectInput, proposalInput } from './fixtures.js';

function isCode(code: string) { return (error: unknown) => error instanceof HubError && error.code === code; }
function scenario() {
  const f = fixture();
  const board = f.service.createProject(human, projectInput, 'create-project-1');
  const issued = f.service.issueToken(human, board.project.id, 'Codex 演示');
  const tool: Principal = { kind: 'tool', scope: issued.scope };
  return { ...f, board, tool };
}
const approve = { action: 'approve', reason: '边界合理且验证方式与 Intent 一致。', proposalVersion: 1, intentVersion: 1, planVersion: 1 };

test('提案不能伪造批准状态或人端身份，文本不得为空', () => {
  assert.throws(() => parseProposal({ ...proposalInput, status: 'approved' }), isCode('INVALID_INPUT'));
  assert.throws(() => parseProposal({ ...proposalInput, actor: 'human' }), isCode('INVALID_INPUT'));
  assert.throws(() => parseProposal({ ...proposalInput, risks: '   ' }), isCode('INVALID_INPUT'));
});

test('工具提案保持清单不变，人工批准才原子创建正式 Issue 与决定', t => {
  const f = scenario(); t.after(f.cleanup);
  const proposal = f.service.propose(f.tool, f.board.project.id, proposalInput, 'propose-issue-1');
  assert.equal(f.service.overview(human)[0]?.issues.length, 0);
  assert.equal(f.service.overview(human)[0]?.decisions.length, 0);
  const result = f.service.decide(human, f.board.project.id, proposal.id, approve, 'approve-issue-1');
  const board = f.service.overview(human)[0];
  assert.equal(board?.issues.length, 1);
  assert.equal(board?.proposals[0]?.status, 'approved');
  assert.equal(board?.decisions[0]?.reason, approve.reason);
  assert.equal(board?.planVersion, 2);
  assert.equal(result.issue?.verification, proposalInput.verification);
  assert.equal(board?.intent.problem, projectInput.problem);
});

test('退回与拒绝保留原意图与正式清单', t => {
  const f = scenario(); t.after(f.cleanup);
  for (const action of ['return', 'reject']) {
    const proposal = f.service.propose(f.tool, f.board.project.id, proposalInput, 'propose-' + action);
    f.service.decide(human, f.board.project.id, proposal.id, { ...approve, action }, 'decide-' + action);
  }
  const board = f.service.overview(human)[0];
  assert.equal(board?.issues.length, 0);
  assert.equal(board?.planVersion, 1);
  assert.deepEqual(board?.intent, f.board.intent);
  assert.deepEqual(board?.proposals.map(p => p.status), ['returned', 'rejected']);
});

test('工具不能批准、发放令牌或访问其他项目；父 Issue 不可越界', t => {
  const f = scenario(); t.after(f.cleanup);
  const other = f.service.createProject(human, { ...projectInput, name: '另一项目' }, 'other-project-1');
  assert.throws(() => f.service.propose(f.tool, other.project.id, proposalInput, 'other-propose-1'), isCode('OUT_OF_SCOPE'));
  assert.equal(f.service.overview(f.tool).length, 1);
  assert.equal(f.service.overview(f.tool)[0]?.scopes.length, 0);
  assert.throws(() => f.service.issueToken(f.tool, f.board.project.id, '伪造'), isCode('HUMAN_REQUIRED'));
  const proposal = f.service.propose(f.tool, f.board.project.id, proposalInput, 'propose-issue-1');
  assert.throws(() => f.service.decide(f.tool, f.board.project.id, proposal.id, approve, 'approve-issue-1'), isCode('HUMAN_REQUIRED'));
  assert.throws(() => f.service.propose(f.tool, f.board.project.id, { ...proposalInput, parentIssueId: 'unknown' }, 'wrong-parent-1'), isCode('INVALID_PARENT'));
});

test('旧 Intent、旧计划或旧提案版本不能误批，刷新计划后可重新决定', t => {
  const f = scenario(); t.after(f.cleanup);
  assert.throws(() => f.service.propose(f.tool, f.board.project.id, { ...proposalInput, intentVersion: 2 }, 'stale-intent-1'), isCode('STALE_INTENT'));
  const a = f.service.propose(f.tool, f.board.project.id, proposalInput, 'proposal-first-1');
  const b = f.service.propose(f.tool, f.board.project.id, proposalInput, 'proposal-second-1');
  assert.throws(() => f.service.decide(human, f.board.project.id, a.id, { ...approve, proposalVersion: 2 }, 'stale-version-1'), isCode('STALE_REVIEW'));
  f.service.decide(human, f.board.project.id, a.id, approve, 'approve-first-1');
  assert.throws(() => f.service.decide(human, f.board.project.id, b.id, approve, 'stale-plan-1'), isCode('STALE_REVIEW'));
  assert.equal(f.service.overview(human)[0]?.proposals[1]?.status, 'pending');
  f.service.decide(human, f.board.project.id, b.id, { ...approve, planVersion: 2 }, 'refresh-plan-1');
  assert.equal(f.service.overview(human)[0]?.issues.length, 2);
});

test('相同请求可重放，改内容复用编号或重复决定不产生额外记录', t => {
  const f = scenario(); t.after(f.cleanup);
  const p = f.service.propose(f.tool, f.board.project.id, proposalInput, 'propose-issue-1');
  assert.deepEqual(f.service.propose(f.tool, f.board.project.id, proposalInput, 'propose-issue-1'), p);
  assert.throws(() => f.service.propose(f.tool, f.board.project.id, { ...proposalInput, title: '其他工作' }, 'propose-issue-1'), isCode('REQUEST_REUSED'));
  const d = f.service.decide(human, f.board.project.id, p.id, approve, 'approve-issue-1');
  assert.deepEqual(f.service.decide(human, f.board.project.id, p.id, approve, 'approve-issue-1'), d);
  assert.throws(() => f.service.decide(human, f.board.project.id, p.id, approve, 'duplicate-decision-1'), isCode('STALE_REVIEW'));
  assert.equal(f.service.overview(human)[0]?.issues.length, 1);
  assert.equal(f.service.overview(human)[0]?.decisions.length, 1);
});

test('事务尾部持久化失败回滚正式 Issue、提案、决定和计划版本', t => {
  const f = scenario(); t.after(f.cleanup);
  const p = f.service.propose(f.tool, f.board.project.id, proposalInput, 'propose-issue-1');
  f.store.db.exec("CREATE TRIGGER fail_request BEFORE INSERT ON requests WHEN NEW.actor = 'human:decide' BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END");
  assert.throws(() => f.service.decide(human, f.board.project.id, p.id, approve, 'approve-issue-1'), /simulated write failure/);
  const board = f.service.overview(human)[0];
  assert.equal(board?.issues.length, 0); assert.equal(board?.decisions.length, 0);
  assert.equal(board?.planVersion, 1); assert.equal(board?.proposals[0]?.status, 'pending');
  f.store.db.exec('DROP TRIGGER fail_request');
  f.service.decide(human, f.board.project.id, p.id, approve, 'approve-issue-1');
  assert.equal(f.service.overview(human)[0]?.issues.length, 1);
});

test('关闭并重开 SQLite 后，内容、决定与重放结果保持一致', t => {
  const f = scenario(); t.after(f.cleanup);
  const p = f.service.propose(f.tool, f.board.project.id, proposalInput, 'propose-issue-1');
  f.service.decide(human, f.board.project.id, p.id, approve, 'approve-issue-1');
  const before = f.service.overview(human);
  f.store.close();
  const reopened = new SqliteStore(f.path); t.after(() => reopened.close());
  const service = new BoardService(reopened, toolCredentials);
  assert.deepEqual(service.overview(human), before);
  assert.equal(service.propose(f.tool, f.board.project.id, proposalInput, 'propose-issue-1').id, p.id);
});

test('批准说明可省略或留白，退回和拒绝必须提供非空理由', () => {
  const versions = { proposalVersion: 1, intentVersion: 1, planVersion: 1 };
  for (const reason of [undefined, null, '', ' \n\t ']) {
    assert.equal(parseDecision({ ...versions, action: 'approve', reason }).reason, null);
    for (const action of ['return', 'reject']) {
      assert.throws(() => parseDecision({ ...versions, action, reason }), isCode('DECISION_REASON_REQUIRED'));
    }
  }
  for (const action of ['approve', 'return', 'reject']) {
    assert.equal(parseDecision({ ...versions, action, reason: '  需要补充竞态验证。  ' }).reason, '需要补充竞态验证。');
    for (const reason of [12, false, [], {}, 'x'.repeat(4001)]) {
      assert.throws(() => parseDecision({ ...versions, action, reason }), isCode('INVALID_INPUT'));
    }
  }
});

test('无说明批准如实保存为空，重试及重开数据库保持说明和既有文本', t => {
  const f = scenario(); t.after(f.cleanup);
  const first = f.service.propose(f.tool, f.board.project.id, proposalInput, 'proposal-empty-1');
  const versions = { proposalVersion: 1, intentVersion: 1, planVersion: 1 };
  const result = f.service.decide(human, f.board.project.id, first.id, { ...versions, action: 'approve' }, 'approve-empty-1');
  assert.equal(result.decision.reason, null);
  assert.deepEqual(f.service.decide(human, f.board.project.id, first.id,
    { ...versions, action: 'approve', reason: '   ' }, 'approve-empty-1'), result);
  const second = f.service.propose(f.tool, f.board.project.id, proposalInput, 'proposal-note-1');
  f.service.decide(human, f.board.project.id, second.id, { ...approve, planVersion: 2 }, 'approve-note-1');
  f.store.close();
  const reopened = new SqliteStore(f.path); t.after(() => reopened.close());
  const service = new BoardService(reopened, toolCredentials);
  const board = service.overview(human)[0];
  assert.deepEqual(board?.decisions.map(d => d.reason), [null, approve.reason]);
  assert.equal(board?.issues.length, 2);
  assert.equal(board?.proposals[0]?.reason, proposalInput.reason);
});
