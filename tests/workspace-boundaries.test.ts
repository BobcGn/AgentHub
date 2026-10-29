import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HubError } from '../src/domain/board.js';
import { WorkspaceToolExecutor } from '../src/infrastructure/workspace-tools.js';
import { harnessFixture } from './harness-fixtures.js';
import { human } from './fixtures.js';
import type { ModelPort, ModelStepInput, ModelStepOutput } from '../src/domain/harness.js';

test('WorkspaceToolExecutor (Symlink Policy B): 允许工作区内部普通安全符号链接', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-symlink-'));
  try {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'target.txt'), 'hello safe symlink content');
    // 创建指向 src/target.txt 的工作区内部相对软链接
    symlinkSync('src/target.txt', join(dir, 'link.txt'));

    const executor = new WorkspaceToolExecutor(dir);
    const result = JSON.parse(executor.readFile('link.txt')) as { content: string };
    assert.equal(result.content, 'hello safe symlink content');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor (Symlink Policy B): 阻断指向工作区外部的符号链接', () => {
  const outsideDir = mkdtempSync(join(tmpdir(), 'agenthub-outside-'));
  const workspaceDir = mkdtempSync(join(tmpdir(), 'agenthub-ws-'));
  try {
    writeFileSync(join(outsideDir, 'secret.txt'), 'super secret outside content');
    // 创建指向工作区外部文件的软链接
    symlinkSync(join(outsideDir, 'secret.txt'), join(workspaceDir, 'escape.txt'));

    const executor = new WorkspaceToolExecutor(workspaceDir);
    assert.throws(
      () => executor.readFile('escape.txt'),
      (err: unknown) => err instanceof HubError && (err.code === 'PATH_TRAVERSAL_DENIED' || err.code === 'PATH_ESCAPE')
    );
  } finally {
    rmSync(outsideDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor (Symlink Policy B): 阻断指向受保护文件的符号链接及循环链接', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-protected-'));
  try {
    writeFileSync(join(dir, '.env'), 'API_KEY=leak-me');
    symlinkSync('.env', join(dir, 'env-link.txt'));

    // 循环链接 a -> b -> a
    symlinkSync('loop-b', join(dir, 'loop-a'));
    symlinkSync('loop-a', join(dir, 'loop-b'));

    const executor = new WorkspaceToolExecutor(dir);
    assert.throws(
      () => executor.readFile('env-link.txt'),
      (err: unknown) => err instanceof HubError && (err.code === 'PROTECTED_PATH_DENIED' || err.code === 'PATH_TRAVERSAL_DENIED')
    );

    assert.throws(
      () => executor.readFile('loop-a'),
      (err: unknown) => err instanceof HubError && (err.code === 'SYMLINK_LOOP_DENIED' || err.code === 'PATH_NOT_FOUND')
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: 16 KiB UTF-8 字节上限与安全截断（不破坏多字节字符）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-limit-'));
  try {
    // 构造一个包含大量中文字符（3 字节/字符）的大文件，超过 16 KiB
    const largeChinese = '测试中文字符'.repeat(2000); // 12000 字符 * 3 = 36000 字节
    writeFileSync(join(dir, 'large.txt'), largeChinese);

    const executor = new WorkspaceToolExecutor(dir);
    const result = await executor.execute({
      id: 'tc-limit',
      name: 'read_file',
      arguments: { path: 'large.txt' }
    });

    assert.equal(result.toolName, 'read_file');
    assert.ok(result.output);
    const byteLength = Buffer.byteLength(result.output, 'utf8');
    assert.ok(byteLength <= 16384, `输出字节数 (${byteLength}) 不能超过 16384 字节 (16 KiB)`);
    // 确保没有乱码（U+FFFD 替换符）
    assert.ok(!result.output.includes('\uFFFD'), '截断不得破坏多字节 UTF-8 字符序列');
    assert.ok(result.output.includes('[内容已截断') || result.output.includes('[output truncated'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: searchCode 资源预算限制与未找到/截断区分', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-search-'));
  try {
    // 构造空搜索目录与测试文件
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'file1.txt'), 'KEYWORD match 1\nKEYWORD match 2');

    const executor = new WorkspaceToolExecutor(dir);

    // 未找到情况
    const notFound = JSON.parse(executor.searchCode('NON_EXISTENT_KEYWORD')) as {
      count: number;
      truncated: boolean;
    };
    assert.equal(notFound.count, 0);
    assert.equal(notFound.truncated, false, '未找到结果时 truncated 必须为 false');

    // 找到情况
    const found = JSON.parse(executor.searchCode('KEYWORD')) as {
      count: number;
      truncated: boolean;
    };
    assert.equal(found.count, 2);
    assert.equal(found.truncated, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Workspace 授权与缺省边界：未授权工作区时 tools 为 []，不默认读取工作区', async t => {
  let receivedTools: unknown[] | null = null;
  const model: ModelPort = {
    name: 'test-boundary-model',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      receivedTools = input.tools;
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'open_question',
          epistemicStatus: 'unknown',
          content: '未授权工作区测试',
          sourceRefs: []
        }
      };
    }
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);

  // 启动 Run 时不传入 workspace 授权（缺省状态）
  const run = f.start('测试缺省工作区授权');
  await f.harness.settled(run.id);

  const finalRun = f.harness.get(human, run.id);
  assert.equal(finalRun.state, 'waiting_human');
  // 未授权时，模型接收到的 tools 必须为空数组，不能 fallback 到当前工作目录！
  assert.ok(receivedTools !== null);
  assert.deepEqual(receivedTools, [], '未授权工作区时 tools 必须为 []');
  assert.equal(finalRun.authorization.workspace ?? null, null);
});

test('Workspace 显式授权：人端指定 root 授权后提供 tools 并持久化元数据', async t => {
  const wsDir = mkdtempSync(join(tmpdir(), 'agenthub-ws-auth-'));
  writeFileSync(join(wsDir, 'test.txt'), 'authorized content');

  let receivedTools: unknown[] | null = null;
  const model: ModelPort = {
    name: 'test-authorized-model',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('not used'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      receivedTools = input.tools;
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-auth', name: 'read_file', arguments: { path: 'test.txt' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'decision',
          epistemicStatus: 'proposed',
          content: '读取到授权工作区内容',
          sourceRefs: []
        }
      };
    }
  };

  const f = harnessFixture(model);
  t.after(() => {
    f.cleanup();
    rmSync(wsDir, { recursive: true, force: true });
  });

  const run = f.harness.start(
    human,
    f.project.id,
    {
      requirementId: 'REQ-HARNESS-1',
      baseRevision: f.records.get(human, f.project.id).revision,
      instruction: '测试已授权工作区',
      confirmed: true,
      workspace: {
        authorized: true,
        root: wsDir,
        readScope: ['.'],
        exclude: [],
        egressScope: 'local_only'
      }
    },
    'harness-auth-run-001'
  );

  await f.harness.settled(run.id);

  const finalRun = f.harness.get(human, run.id);
  assert.equal(finalRun.state, 'waiting_human');
  assert.ok(receivedTools !== null);
  assert.equal((receivedTools as unknown[]).length, 3, '已授权工作区时提供 3 个工作区工具');
  assert.ok(finalRun.authorization.workspace);
  assert.equal(finalRun.authorization.workspace.authorized, true);
  assert.equal(finalRun.authorization.workspace.root, wsDir);
});
