import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HubError } from '../src/domain/board.js';
import { fixture, human, projectInput, proposalInput } from './fixtures.js';

test('Intent 修订后旧新增提案不能批准但可退回；原文及旧决定保留', t => {
  const f = fixture(); t.after(f.cleanup);
  const b = f.service.createProject(human, projectInput, 'intent-transition-project');
  const issued = f.service.issueToken(human, b.project.id, '候选工具', undefined, { intent: true, issueIds: [] });
  const tool = { kind: 'tool' as const, scope: issued.scope };
  const original = f.service.propose(tool, b.project.id, proposalInput, 'intent-transition-old');
  const change = f.service.proposeChange(tool, b.project.id, {
    targetKind: 'intent', targetId: b.intent.id, baseVersion: 1, intentVersion: 1, planVersion: 1,
    reason: '商讨后澄清目标', impact: '旧提案不能直接沿用',
    after: { title: b.intent.title, problem: b.intent.problem, outcome: '结果一致并可确认加载过程', verification: b.intent.verification }
  }, 'intent-transition-change');
  const granted = f.service.authorizeIntentChange(human, b.project.id, change.id, {
    proposalVersion: 1, intentVersion: 1, planVersion: 1, summary: '已商讨并授权这一修订', sourceRef: '本人外部对话', confirmed: true
  }, 'intent-transition-auth');
  f.service.decideChange(human, b.project.id, change.id, {
    action: 'approve', proposalVersion: granted.version, intentVersion: 1, planVersion: 1
  }, 'intent-transition-apply');
  const versions = { proposalVersion: 1, intentVersion: 2, planVersion: 2 };
  assert.throws(() => f.service.decide(human, b.project.id, original.id, { ...versions, action: 'approve' }, 'intent-transition-block'),
    error => error instanceof HubError && error.code === 'STALE_REVIEW');
  f.service.decide(human, b.project.id, original.id, { ...versions, action: 'return', reason: '请对照新意图重新提交。' }, 'intent-transition-return');
  const current = f.service.overview(human)[0];
  assert.equal(current?.proposals[0]?.intentVersion, 1);
  assert.equal(current?.proposals[0]?.status, 'returned');
  assert.equal(current?.issues.length, 0);
  assert.equal(current?.intent.version, 2);
});
