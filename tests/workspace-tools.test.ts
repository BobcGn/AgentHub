import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HubError } from '../src/domain/board.js';
import { WorkspaceToolExecutor, WORKSPACE_TOOLS_DEFINITIONS } from '../src/infrastructure/workspace-tools.js';

test('WorkspaceToolExecutor: 工具定义完整且合法', () => {
  assert.equal(WORKSPACE_TOOLS_DEFINITIONS.length, 3);
  const names = WORKSPACE_TOOLS_DEFINITIONS.map(t => t.name);
  assert.ok(names.includes('list_directory'));
  assert.ok(names.includes('read_file'));
  assert.ok(names.includes('search_code'));
});

test('WorkspaceToolExecutor: 路径防逃逸保护 (Path Jail)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-tools-'));
  const executor = new WorkspaceToolExecutor(dir);

  try {
    assert.throws(() => executor.listDirectory('../'), (err: unknown) => err instanceof HubError && err.code === 'PATH_TRAVERSAL_DENIED');
    assert.throws(() => executor.readFile('../../etc/passwd'), (err: unknown) => err instanceof HubError && err.code === 'PATH_TRAVERSAL_DENIED');
    assert.throws(() => executor.readFile('.git/config'), (err: unknown) => err instanceof HubError && err.code === 'PROTECTED_PATH_DENIED');
    assert.throws(() => executor.readFile('.env'), (err: unknown) => err instanceof HubError && err.code === 'PROTECTED_PATH_DENIED');
    assert.throws(() => executor.readFile('.env.local'), (err: unknown) => err instanceof HubError && err.code === 'PROTECTED_PATH_DENIED');
    assert.throws(() => executor.readFile('node_modules/pkg/index.js'), (err: unknown) => err instanceof HubError && err.code === 'PROTECTED_PATH_DENIED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: listDirectory 列出文件与目录，跳过受保护目录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-tools-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, '.git'));
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'src', 'index.ts'), 'console.log("hello");');
  writeFileSync(join(dir, 'README.md'), '# Test Project');
  writeFileSync(join(dir, '.env'), 'SECRET=123');

  const executor = new WorkspaceToolExecutor(dir);
  try {
    const raw = executor.listDirectory('.');
    const parsed = JSON.parse(raw) as { directory: string; entries: Array<{ name: string; type: string }> };
    assert.equal(parsed.directory, '.');
    const entryNames = parsed.entries.map(e => e.name);
    assert.ok(entryNames.includes('src'));
    assert.ok(entryNames.includes('README.md'));
    assert.equal(entryNames.includes('.git'), false);
    assert.equal(entryNames.includes('node_modules'), false);
    assert.equal(entryNames.includes('.env'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: readFile 正常读取与分行读取', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-tools-'));
  const lines = ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'];
  writeFileSync(join(dir, 'test.txt'), lines.join('\n'));

  const executor = new WorkspaceToolExecutor(dir);
  try {
    const full = JSON.parse(executor.readFile('test.txt')) as { content: string; totalLines: number; startLine: number; endLine: number };
    assert.equal(full.totalLines, 5);
    assert.equal(full.startLine, 1);
    assert.equal(full.endLine, 5);
    assert.equal(full.content, lines.join('\n'));

    const partial = JSON.parse(executor.readFile('test.txt', 2, 4)) as { content: string; startLine: number; endLine: number };
    assert.equal(partial.startLine, 2);
    assert.equal(partial.endLine, 4);
    assert.equal(partial.content, ['line 2', 'line 3', 'line 4'].join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: searchCode 检索匹配项', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-tools-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'app.ts'), 'export const TARGET_CONSTANT = 42;\nfunction run() {}\n');
  writeFileSync(join(dir, 'src', 'other.ts'), 'const x = 10;\n');

  const executor = new WorkspaceToolExecutor(dir);
  try {
    const res = JSON.parse(executor.searchCode('TARGET_CONSTANT')) as { count: number; matches: Array<{ file: string; line: number; snippet: string }> };
    assert.equal(res.count, 1);
    assert.equal(res.matches[0]?.file, 'src/app.ts');
    assert.equal(res.matches[0]?.line, 1);
    assert.ok(res.matches[0]?.snippet.includes('TARGET_CONSTANT'));

    assert.throws(() => executor.searchCode('a'), (err: unknown) => err instanceof HubError && err.code === 'INVALID_QUERY');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: execute 统一调用与错误捕获', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-tools-'));
  writeFileSync(join(dir, 'demo.txt'), 'hello world');
  const executor = new WorkspaceToolExecutor(dir);

  try {
    const success = await executor.execute({ id: 'c1', name: 'read_file', arguments: { path: 'demo.txt' } });
    assert.equal(success.callId, 'c1');
    assert.equal(success.toolName, 'read_file');
    assert.ok(success.output.includes('hello world'));
    assert.equal(success.error, undefined);

    const notFound = await executor.execute({ id: 'c2', name: 'read_file', arguments: { path: 'nonexistent.txt' } });
    assert.equal(notFound.callId, 'c2');
    assert.equal(notFound.output, '');
    assert.ok(notFound.error && notFound.error.includes('文件不存在'));

    const unknownTool = await executor.execute({ id: 'c3', name: 'unknown_cmd', arguments: {} });
    assert.ok(unknownTool.error && unknownTool.error.includes('未知工具'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
