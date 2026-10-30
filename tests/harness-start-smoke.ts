// Engineering smoke test: only an isolated temporary AgentHub instance is touched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { initializeAdmin } from '../src/infrastructure/auth.js';
import type { HarnessRun } from '../src/domain/harness.js';
import type { RecordProject } from '../src/domain/record-project.js';

const directory = mkdtempSync(join(tmpdir(), 'agenthub-harness-start-'));
const database = join(directory, 'board.sqlite'), password = 'isolated-smoke-' + crypto.randomUUID();
const init = new SqliteStore(database); initializeAdmin(init, password); init.close();
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
const address = probe.address(); assert.ok(address && typeof address !== 'string');
const port = address.port; await new Promise<void>(resolve => probe.close(() => resolve()));
const base = 'http://127.0.0.1:' + port;
let processUnderTest: ChildProcess | undefined;
let cookie = '';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  const env: NodeJS.ProcessEnv = { ...process.env,
    AGENTHUB_DB: database, AGENTHUB_RECORDS_DIR: join(directory, 'record-projects'), AGENTHUB_PORT: String(port) };
  delete env['DEEPSEEK_API_KEY'];
  const child = spawn(process.execPath, ['dist/index.js'], { env,
    stdio: ['ignore','pipe','pipe'] });
  processUnderTest = child;
  let diagnostic = ''; child.stderr?.on('data', value => { diagnostic += String(value); });
  let up = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('当前构建产物启动失败：' + diagnostic);
    try { if ((await fetch(base, { signal: AbortSignal.timeout(500) })).status === 200) { up = true; break; } } catch { /* not listening yet */ }
    await pause(30);
  }
  assert.equal(up, true, '当前构建产物应启动');
  const response = await fetch(base + '/api/login', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }) });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? ''; assert.ok(cookie);
}
async function stop() {
  const child = processUnderTest; processUnderTest = undefined;
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('测试进程未正常退出')); }, 5000);
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('测试进程退出异常')); });
    child.kill('SIGTERM');
  });
}
async function api<T>(path: string, input?: unknown): Promise<T> {
  const response = await fetch(base + path, { headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    ...(input === undefined ? {} : { method: 'POST', body: JSON.stringify(input) }) });
  assert.ok(response.ok, '测试接口应成功：' + path + ' ' + response.status);
  return await response.json() as T;
}
async function waiting(id: string) {
  for (let i = 0; i < 100; i++) {
    const run = await api<HarnessRun>('/api/runs/' + id);
    if (run.state !== 'running') { assert.equal(run.state, 'waiting_human'); return run; }
    await pause(20);
  }
  throw new Error('等待运行候选超时');
}
try {
  await start();
  const icon = await fetch(base + '/agenthub-icon.png');
  assert.equal(icon.status, 200);
  assert.deepEqual(Buffer.from(await icon.arrayBuffer()), readFileSync(new URL('../src/presentation/web/public/agenthub-icon.png', import.meta.url)));
  assert.equal((await fetch(base + '/api/record-projects')).status, 401);
  const project = await api<RecordProject>('/api/record-projects', {
    name: 'AgentHub 构建产物自测', title: '从正式 JSON 继承 AgentHub 进度', problem: '跨会话不能依赖聊天印象。',
    expectedOutcome: '可观察、可停止、可恢复的候选闭环。', includes: ['单需求脚本化候选'], excludes: ['真实模型、Shell、Git'],
    constraints: ['隔离工程自测，不代表实际用户验收。'], confirmed: true });
  const saved = await api<RecordProject>('/api/record-projects/' + project.id + '/records', {
    baseRevision: project.revision, collection: 'requirements', id: null, reason: '隔离的 AgentHub 自测需求', confirmed: true,
    record: { kind: 'requirement', id: 'REQ-HARNESS-SMOKE', intentId: project.records.intent.id, title: '跨会话恢复 Harness 进度',
      problem: '进度必须从正式记录读取', expectedOutcome: '重启后候选与长期信息保留',
      scope: { includes: ['运行记录'], excludes: ['真实模型'] }, rationale: '先验证可观察的基础', expectedImpact: '减少丢失上下文',
      constraints: [], acceptanceCriteria: [], sourceRefs: [], status: 'draft', result: null, acceptance: null, pullRequest: null } });
  const initial = await api<HarnessRun>('/api/record-projects/' + saved.id + '/runs',
    { requirementId: 'REQ-HARNESS-SMOKE', baseRevision: saved.revision, instruction: '验证停止、保存与恢复', confirmed: true });
  let run = await waiting(initial.id);
  await api('/api/runs/' + run.id + '/preview');
  run = await api<HarnessRun>('/api/runs/' + run.id + '/apply', { revision: run.revision, confirmed: true });
  assert.equal(run.outcome, 'applied');
  await stop(); cookie = ''; await start();
  const after = await api<RecordProject>('/api/record-projects/' + saved.id);
  assert.equal(after.records.contextItems.length, 1); assert.equal(after.records.requirements[0]?.status, 'draft');
  assert.equal((await api<HarnessRun>('/api/runs/' + run.id)).outcome, 'applied');
  const next = await api<HarnessRun>('/api/record-projects/' + saved.id + '/runs',
    { requirementId: 'REQ-HARNESS-SMOKE', baseRevision: after.revision, instruction: '继续读取已保存的进度', confirmed: true });
  const inherited = await waiting(next.id);
  assert.equal(inherited.snapshot?.contextItems[0]?.id, after.records.contextItems[0]?.id);
  console.log(JSON.stringify({ startup: 'current dist/index.js', page: 200, unauthenticated: 401,
    restart: 'persisted', nextRun: 'inherited formal JSON', model: 'scripted only' }));
} finally {
  try { await stop(); } finally { rmSync(directory, { recursive: true, force: true }); }
}
