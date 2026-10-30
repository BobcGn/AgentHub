import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { serverFixture, projectInput, proposalInput } from './fixtures.js';
import type { Board, Decision, Proposal, ToolScope } from '../src/domain/board.js';
const exec = promisify(execFile);

test('HTTP + 真正 CLI：待审到批准、工具越权被拒、撤销即时生效', async t => {
  const f = await serverFixture(); t.after(f.stop);
  let response = await f.request('/api/projects', projectInput, { 'Idempotency-Key': 'http-project-1' });
  assert.equal(response.status, 201);
  const board = await response.json() as Board;
  response = await f.request('/api/projects/' + board.project.id + '/scopes', { label: 'CLI 测试' });
  const { token } = await response.json() as { token: string; scope: ToolScope };
  const env = { ...process.env, AGENTHUB_TOKEN: token };
  const file = join(f.dir, 'proposal.json'); writeFileSync(file, JSON.stringify(proposalInput));
  const command = ['--import', 'tsx', 'src/presentation/cli.ts', 'propose', '--server', f.base, '--project', board.project.id, '--file', file, '--request-id', 'http-propose-1'];
  const first = JSON.parse((await exec(process.execPath, command, { env })).stdout) as Proposal;
  const retry = JSON.parse((await exec(process.execPath, command, { env })).stdout) as Proposal;
  assert.equal(first.id, retry.id);
  assert.equal(f.service.overview({ kind: 'human' })[0]?.issues.length, 0);
  const input = { action: 'approve', reason: '验证方案与意图一致。', proposalVersion: 1, intentVersion: 1, planVersion: 1 };
  const endpoint = '/api/projects/' + board.project.id + '/proposals/' + first.id + '/decisions';
  response = await f.request(endpoint, input, { Authorization: 'Bearer ' + token, 'Idempotency-Key': 'http-approve-1' });
  assert.equal(response.status, 403);
  response = await f.request('/api/projects', { ...projectInput, actor: 'human' }, { Authorization: 'Bearer ' + token, 'Idempotency-Key': 'forged-human-1' });
  assert.equal(response.status, 403);
  response = await f.request(endpoint, input, { 'Idempotency-Key': 'http-approve-1' });
  assert.equal(response.status, 200);
  assert.equal(f.service.overview({ kind: 'human' })[0]?.issues.length, 1);
  const scope = f.service.overview({ kind: 'human' })[0]?.scopes[0];
  assert.ok(scope);
  response = await f.request('/api/projects/' + board.project.id + '/scopes/' + scope.id + '/revoke', {});
  assert.equal(response.status, 200);
  response = await fetch(f.base + '/api/boards', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(response.status, 401);
  await assert.rejects(exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'overview', '--server', f.base], { env }), error => {
    const e = error as { stderr?: string; code?: number };
    return e.code === 1 && !!e.stderr?.includes('UNAUTHENTICATED');
  });
});

test('未登录、跨站来源、缺 Origin、伪造 Host、非法 JSON 与过大正文均被拒绝', async t => {
  const f = await serverFixture(); t.after(f.stop);
  assert.equal((await fetch(f.base + '/api/boards')).status, 401);
  assert.equal((await f.request('/api/projects', projectInput, { Origin: 'https://untrusted.example', 'Idempotency-Key': 'bad-origin-1' })).status, 403);
  assert.equal((await fetch(f.base + '/api/projects', { method: 'POST', headers: { Cookie: f.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(projectInput) })).status, 403);
  const forgedHost = await new Promise<number>((done, reject) => {
    const request = httpRequest(f.base + '/api/boards', { headers: { Host: 'untrusted.example', Cookie: f.cookie } }, response => {
      response.resume(); response.on('end', () => done(response.statusCode ?? 0));
    });
    request.on('error', reject); request.end();
  });
  assert.equal(forgedHost, 403);
  assert.equal((await fetch(f.base + '/api/projects', { method: 'POST', headers: { Cookie: f.cookie, Origin: f.base, 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await f.request('/api/projects', { ...projectInput, problem: 'x'.repeat(50_000) })).status, 413);
  assert.equal((await f.request('/api/projects', projectInput)).status, 400);
  assert.equal(f.service.overview({ kind: 'human' }).length, 0);
});

test('人端账户无 HTTP 自举入口，密码错误限流，退出使原会话失效', async t => {
  const f = await serverFixture(); t.after(f.stop);
  assert.equal((await f.request('/api/setup', { password: 'forged-human-password' })).status, 404);
  for (let i = 0; i < 5; i++) {
    assert.equal((await f.request('/api/login', { password: 'wrong-password' })).status, 401);
  }
  assert.equal((await f.request('/api/login', { password: f.password })).status, 429);
  assert.equal((await f.request('/api/logout', {})).status, 200);
  assert.equal((await f.request('/api/boards')).status, 401);
});

test('人端决定接口按动作校验理由，空说明批准仍需人端身份并保持幂等', async t => {
  const f = await serverFixture(); t.after(f.stop);
  const human = { kind: 'human' } as const;
  const board = f.service.createProject(human, projectInput, 'reason-project-1');
  const issued = f.service.issueToken(human, board.project.id, '说明规则测试');
  const tool = { kind: 'tool', scope: issued.scope } as const;
  const versions = { proposalVersion: 1, intentVersion: 1, planVersion: 1 };
  for (const action of ['return', 'reject']) {
    const proposal = f.service.propose(tool, board.project.id, proposalInput, 'reason-proposal-' + action);
    const path = '/api/projects/' + board.project.id + '/proposals/' + proposal.id + '/decisions';
    for (const reason of [undefined, null, '', '   ']) {
      const response = await f.request(path, { ...versions, action, reason }, { 'Idempotency-Key': 'reason-missing-' + action });
      assert.equal(response.status, 400);
      const error = await response.json() as { error: { code: string } };
      assert.equal(error.error.code, 'DECISION_REASON_REQUIRED');
    }
    assert.equal(f.service.overview(human)[0]?.proposals.find(p => p.id === proposal.id)?.status, 'pending');
    assert.equal((await f.request(path, { ...versions, action, reason: '请补充方案与验证依据。' },
      { 'Idempotency-Key': 'reason-valid-' + action })).status, 200);
  }
  const proposal = f.service.propose(tool, board.project.id, proposalInput, 'reason-proposal-approve');
  const path = '/api/projects/' + board.project.id + '/proposals/' + proposal.id + '/decisions';
  assert.equal((await f.request(path, { ...versions, action: 'approve' },
    { Authorization: 'Bearer ' + issued.token, 'Idempotency-Key': 'tool-empty-approve' })).status, 403);
  let response = await f.request(path, { ...versions, action: 'approve', reason: 123 },
    { 'Idempotency-Key': 'invalid-reason-approve' });
  assert.equal(response.status, 400);
  response = await f.request(path, { ...versions, action: 'approve' }, { 'Idempotency-Key': 'no-reason-approve' });
  assert.equal(response.status, 200);
  const original = await response.json() as { decision: Decision; issue: { id: string } };
  assert.equal(original.decision.reason, null);
  response = await f.request(path, { ...versions, action: 'approve', reason: '   ' }, { 'Idempotency-Key': 'no-reason-approve' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), original);
  const current = f.service.overview(human)[0];
  assert.equal(current?.issues.length, 1);
  assert.equal(current?.decisions.length, 3);
  assert.equal(current?.planVersion, 2);
});

test('自动同步仅允许人端，失败写入不通知；成功通知不携带记录或凭据，退出后断开', async t => {
  const f = await serverFixture(); t.after(f.stop);
  const human = { kind: 'human' } as const;
  const board = f.service.createProject(human, projectInput, 'events-project-1');
  const issued = f.service.issueToken(human, board.project.id, '同步事件测试');
  assert.equal((await fetch(f.base + '/api/events')).status, 401);
  assert.equal((await fetch(f.base + '/api/events', { headers: { Authorization: 'Bearer ' + issued.token } })).status, 403);
  const controller = new AbortController(); t.after(() => controller.abort());
  const response = await fetch(f.base + '/api/events', { headers: { Cookie: f.cookie }, signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.ok(response.body);
  const reader = response.body.getReader();
  let buffer = '';
  async function frame(): Promise<string> {
    while (!buffer.includes('\n\n')) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error('通知流过早关闭');
      buffer += new TextDecoder().decode(chunk.value);
    }
    const end = buffer.indexOf('\n\n');
    const result = buffer.slice(0, end); buffer = buffer.slice(end + 2);
    return result;
  }
  assert.match(await frame(), /connected/);
  let notified = false;
  const notification = frame().then(value => { notified = true; return value; });
  const path = '/api/projects/' + board.project.id + '/proposals';
  let result = await f.request(path, { ...proposalInput, title: '' },
    { Authorization: 'Bearer ' + issued.token, 'Idempotency-Key': 'events-invalid-1' });
  assert.equal(result.status, 400);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(notified, false);
  result = await f.request(path, proposalInput, { Authorization: 'Bearer ' + issued.token, 'Idempotency-Key': 'events-valid-1' });
  assert.equal(result.status, 201);
  const message = await notification;
  assert.equal(message, 'data: {}');
  assert.equal(f.service.overview(human)[0]?.proposals.length, 1);
  const expired = frame();
  assert.equal((await f.request('/api/logout', {})).status, 200);
  assert.match(await expired, /event: session-expired/);
  assert.equal((await reader.read()).done, true);
});

test('关闭通知连接后人端可重新订阅并读取错过的最新数据，关闭服务释放长连接', async t => {
  const f = await serverFixture(); t.after(f.stop);
  const first = await f.request('/api/events');
  assert.ok(first.body);
  await first.body.cancel();
  const response = await f.request('/api/projects', projectInput, { 'Idempotency-Key': 'events-reconnect-1' });
  assert.equal(response.status, 201);
  const next = await f.request('/api/events');
  assert.ok(next.body);
  const reader = next.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /connected/);
  const boards = await (await f.request('/api/boards')).json() as Board[];
  assert.equal(boards.length, 1);
  f.server.closeUpdates();
  assert.equal((await reader.read()).done, true);
});
