import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Change } from '../src/domain/changes.js';
import { human, projectInput, serverFixture } from './fixtures.js';
const exec = promisify(execFile);
test('真实 HTTP / CLI 关键修订：精确范围、工具不能商讨授权或决定、撤销后拒绝', async t => {
  const f = await serverFixture(); t.after(f.stop);
  const b = f.service.createProject(human, projectInput, 'http-change-project');
  const response = await f.request('/api/projects/' + b.project.id + '/scopes', {
    label: 'CLI 候选工具', changeScope: { intent: true, issueIds: [] }
  });
  assert.equal(response.status, 201);
  const issued = await response.json() as { token: string; scope: { id: string } };
  const input = { targetKind: 'intent', targetId: b.intent.id, baseVersion: 1, intentVersion: 1, planVersion: 1,
    reason: '外部对话待人端核对', impact: '澄清验证口径', after: { title: b.intent.title, problem: b.intent.problem,
      outcome: '结果需与最终选定条件一致，并区分加载过程。', verification: b.intent.verification } };
  const path = join(f.dir, 'change.json'); writeFileSync(path, JSON.stringify(input));
  const args = ['--import', 'tsx', 'src/presentation/cli.ts', 'change', '--server', f.base,
    '--project', b.project.id, '--file', path, '--request-id', 'http-cli-change-1'];
  const env = { ...process.env, AGENTHUB_TOKEN: issued.token };
  const a = JSON.parse((await exec(process.execPath, args, { env })).stdout) as Change;
  const retry = JSON.parse((await exec(process.execPath, args, { env })).stdout) as Change;
  assert.equal(a.id, retry.id);
  const base = '/api/projects/' + b.project.id + '/changes/' + a.id;
  const versions = { proposalVersion: 1, intentVersion: 1, planVersion: 1 };
  const auth = { ...versions, summary: '已商讨', sourceRef: '外部对话', confirmed: true };
  const headers = { Authorization: 'Bearer ' + issued.token, 'Idempotency-Key': 'http-change-human-1' };
  for (const action of ['authorization', 'revoke-authorization', 'decisions']) {
    assert.equal((await f.request(base + '/' + action, action === 'authorization' ? auth :
      action === 'decisions' ? { ...versions, action: 'approve' } : { proposalVersion: 1 }, headers)).status, 403);
  }
  assert.equal((await f.request(base + '/decisions', { ...versions, action: 'approve' }, { 'Idempotency-Key': 'http-no-auth-1' })).status, 403);
  assert.equal((await f.request(base + '/authorization', auth, { 'Idempotency-Key': 'http-auth-1' })).status, 200);
  assert.equal(f.service.overview(human)[0]?.intent.version, 1);
  assert.equal((await f.request(base + '/decisions', { ...versions, proposalVersion: 2, action: 'approve' },
    { 'Idempotency-Key': 'http-intent-approve' })).status, 200);
  assert.equal(f.service.overview(human)[0]?.intent.version, 2);
  await f.request('/api/projects/' + b.project.id + '/scopes/' + issued.scope.id + '/revoke', {});
  assert.equal((await f.request('/api/projects/' + b.project.id + '/changes', input, headers)).status, 401);
});
