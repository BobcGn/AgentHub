import { RecordProjectService } from '../src/application/record-project-service.js';
import { JsonRecordProjectStore } from '../src/infrastructure/record-project-store.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BoardService } from '../src/application/board-service.js';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { initializeAdmin, toolCredentials } from '../src/infrastructure/auth.js';
import { createHubServer } from '../src/infrastructure/http-server.js';
import type { Principal } from '../src/domain/board.js';

export const human: Principal = { kind: 'human' };
export const projectInput = { name: '筛选体验演示', title: '让筛选结果符合用户预期',
  problem: '切换条件后结果没有更新，用户无法确认当前筛选生效。',
  outcome: '筛选条件与展示结果始终一致。', verification: '实际切换条件并核对结果与条件一致。' };
export const proposalInput = { title: '修复筛选条件切换后结果未刷新', problem: '旧结果造成误判。',
  scope: '只涉及列表筛选刷新，不调整搜索及权限。', solution: '统一条件变更触发的结果更新。',
  benefits: '减少结果误判。', risks: '频繁切换可能产生请求竞态，需要验证。',
  verification: '切换两个不同条件并验证结果；快速切换不得显示旧请求结果。',
  parentIssueId: null, intentVersion: 1, reason: '这是保持筛选语义一致的最小独立交付单元。' };
export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-b1-'));
  const path = join(dir, 'board.sqlite');
  const store = new SqliteStore(path);
  const recordStore = new JsonRecordProjectStore(join(dir, 'record-projects'));
  const service = new BoardService(store, toolCredentials, id => recordStore.get(id) !== undefined);
  return { dir, path, store, service, recordStore, cleanup() { if (store.db.open) store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
export async function serverFixture() {
  const f = fixture();
  const password = 'test-only-password-' + crypto.randomUUID();
  initializeAdmin(f.store, password);
  const recordService = new RecordProjectService(f.recordStore, f.service, createRecordStructureValidator());
  const server = createHubServer({ store: f.store, service: f.service, recordService, webRoot: resolve('dist/web') });
  await new Promise<void>(resolveStarted => server.listen(0, '127.0.0.1', resolveStarted));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务地址不可用');
  const base = 'http://127.0.0.1:' + address.port;
  const login = await fetch(base + '/api/login', { method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  if (!cookie || !login.ok) throw new Error('测试登录失败');
  async function request(path: string, input?: unknown, headers: Record<string, string> = {}) {
    return fetch(base + path, { method: input === undefined ? 'GET' : 'POST',
      headers: { Origin: base, Cookie: cookie ?? '', 'Content-Type': 'application/json', ...headers },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  }
  return { ...f, server, recordService, base, cookie, password, request, async stop() {
    server.closeUpdates();
    await new Promise<void>((done, reject) => { server.close(error => error ? reject(error) : done()); server.closeAllConnections(); });
    f.cleanup();
  } };
}
