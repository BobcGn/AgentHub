import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardEntry, ToolScope } from '../src/domain/board.js';
import { human, projectInput, proposalInput, serverFixture } from './fixtures.js';
const exec = promisify(execFile);
const record = { kind: 'discussion', body: '外部讨论结论：先验证快速切换，再考虑下一步。', issueId: null, intentVersion: 1, sourceRef: '外部对话' };

test('真实 CLI 查询自身边界、追加与查询同一记录；旧令牌和撤销令牌被拒绝', async t => {
  const f = await serverFixture(); t.after(f.stop);
  const board = f.service.createProject(human, projectInput, 'cli-record-project');
  const legacy = f.service.issueToken(human, board.project.id, '旧令牌');
  const endpoint = '/api/projects/' + board.project.id + '/records';
  assert.equal((await f.request(endpoint, record, { Authorization: 'Bearer ' + legacy.token, 'Idempotency-Key': 'legacy-cli-record' })).status, 403);
  const response = await f.request('/api/projects/' + board.project.id + '/scopes', {
    label: '外部记录工具', recordScope: { intent: true, issueIds: [], kinds: ['discussion'] }
  });
  assert.equal(response.status, 201);
  const issued = await response.json() as { token: string; scope: ToolScope };
  const env = { ...process.env, AGENTHUB_TOKEN: issued.token };
  const access = JSON.parse((await exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'scope', '--server', f.base], { env })).stdout) as { kind: string; scope: ToolScope };
  assert.deepEqual(access.scope.recordScope, { intent: true, issueIds: [], kinds: ['discussion'] });
  assert.equal(access.kind, 'tool');
  const path = join(f.dir, 'record.json'); writeFileSync(path, JSON.stringify(record));
  const args = ['--import', 'tsx', 'src/presentation/cli.ts', 'record', '--server', f.base, '--project', board.project.id,
    '--file', path, '--request-id', 'cli-record-write-1'];
  const first = JSON.parse((await exec(process.execPath, args, { env })).stdout) as BoardEntry;
  const retry = JSON.parse((await exec(process.execPath, args, { env })).stdout) as BoardEntry;
  assert.equal(first.id, retry.id);
  const snapshot = JSON.parse((await exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'overview', '--server', f.base], { env })).stdout) as { records: BoardEntry[] }[];
  assert.deepEqual(snapshot[0]?.records, [first]);
  assert.deepEqual(first.source, { kind: 'tool', label: '外部记录工具', scopeId: issued.scope.id });
  assert.equal((await f.request('/api/projects/' + board.project.id + '/scopes/' + issued.scope.id + '/revoke', {})).status, 200);
  assert.equal((await f.request(endpoint, record, { Authorization: 'Bearer ' + issued.token, 'Idempotency-Key': 'revoked-cli-record' })).status, 401);
});

test('普通记录接口不接受人工确认或验收伪装，也不能写入无关对象或自行扩大范围', async t => {
  const f = await serverFixture(); t.after(f.stop);
  const board = f.service.createProject(human, projectInput, 'record-guards-project');
  const issued = f.service.issueToken(human, board.project.id, '报告工具', { intent: true, issueIds: [], kinds: ['agent_report'] });
  const headers = { Authorization: 'Bearer ' + issued.token, 'Idempotency-Key': 'record-guard-1' };
  const endpoint = '/api/projects/' + board.project.id + '/records';
  for (const extra of [{ actor: 'human' }, { verified: true }, { approved: true }, { kind: 'decision' }]) {
    assert.equal((await f.request(endpoint, { ...record, kind: 'agent_report', ...extra }, headers)).status, 400);
  }
  assert.equal((await f.request(endpoint, { ...record, kind: 'note' }, headers)).status, 403);
  const other = f.service.createProject(human, projectInput, 'record-other-project');
  assert.equal((await f.request('/api/projects/' + other.project.id + '/records', { ...record, kind: 'agent_report' }, headers)).status, 403);
  assert.equal((await f.request('/api/projects/' + board.project.id + '/scopes', {
    label: '自我扩大', recordScope: { intent: true, issueIds: [], kinds: ['note'] }
  }, headers)).status, 403);
  const accepted = await f.request(endpoint, { ...record, kind: 'agent_report', body: 'Agent 声称：运行通过。' }, headers);
  assert.equal(accepted.status, 201);
  const current = f.service.overview(human)[0];
  assert.equal(current?.issues.length, 0);
  assert.equal(current?.decisions.length, 0);
  assert.equal(current?.planVersion, 1);
  const proposed = f.service.propose({ kind: 'tool', scope: issued.scope }, board.project.id, proposalInput, 'record-guard-proposal');
  const denied = await f.request('/api/projects/' + board.project.id + '/proposals/' + proposed.id + '/decisions',
    { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 1 }, headers);
  assert.equal(denied.status, 403);
});
