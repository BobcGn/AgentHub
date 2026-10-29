import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HubError } from '../src/domain/board.js';
import { WorkspaceToolExecutor } from '../src/infrastructure/workspace-tools.js';

function createChainFixture() {
  const base = mkdtempSync(join(tmpdir(), 'agenthub-b4-chain-'));
  const ws = join(base, 'workspace');
  const outside = join(base, 'outside');
  const customProtected = join(ws, 'hub-storage');

  mkdirSync(join(ws, 'src'), { recursive: true });
  mkdirSync(join(ws, '.git'), { recursive: true });
  mkdirSync(join(ws, 'unscoped'), { recursive: true });
  mkdirSync(customProtected, { recursive: true });
  mkdirSync(outside, { recursive: true });

  writeFileSync(join(ws, 'src', 'public.ts'), 'export const CHAIN_TARGET_TOKEN = "SAFE_SOURCE_42";\n', 'utf8');

  // 1) 中间跳位于默认排除受保护目录 (.git)：alias -> .git/hop -> ../src/public.ts (及目录链 alias_dir -> .git/hop_dir -> ../src)
  symlinkSync('../src/public.ts', join(ws, '.git', 'hop_file'));
  symlinkSync('.git/hop_file', join(ws, 'alias_via_git.ts'));
  symlinkSync('../src', join(ws, '.git', 'hop_dir'));
  symlinkSync('.git/hop_dir', join(ws, 'alias_dir_via_git'));

  // 2) 中间跳位于实际配置的 protectedPaths 目录：alias_via_hub -> hub-storage/hop_file -> ../src/public.ts
  symlinkSync('../src/public.ts', join(customProtected, 'hop_file'));
  symlinkSync('hub-storage/hop_file', join(ws, 'alias_via_hub.ts'));
  symlinkSync('../src', join(customProtected, 'hop_dir'));
  symlinkSync('hub-storage/hop_dir', join(ws, 'alias_dir_via_hub'));

  // 3) 中间跳逃逸到工作区外部再指回工作区普通源码：alias_via_outside -> ../outside/hop_back -> ../workspace/src/public.ts
  symlinkSync(join(ws, 'src', 'public.ts'), join(outside, 'hop_back_file'));
  symlinkSync(join(outside, 'hop_back_file'), join(ws, 'alias_via_outside.ts'));
  symlinkSync(join(ws, 'src'), join(outside, 'hop_back_dir'));
  symlinkSync(join(outside, 'hop_back_dir'), join(ws, 'alias_dir_via_outside'));

  // 4) 中间跳经过 readScope 之外的目录再指回 readScope 内：src/alias_via_unscoped.ts -> ../unscoped/hop_src -> ../src/public.ts
  symlinkSync('../src/public.ts', join(ws, 'unscoped', 'hop_src_file'));
  symlinkSync('../unscoped/hop_src_file', join(ws, 'src', 'alias_via_unscoped.ts'));

  // 5) 既定策略保留：授权根及 readScope 内的安全源码符号链接允许正常访问
  symlinkSync('public.ts', join(ws, 'src', 'safe_internal_link.ts'));
  symlinkSync('src/public.ts', join(ws, 'safe_root_link.ts'));

  return {
    ws,
    customProtected,
    cleanup: () => rmSync(base, { recursive: true, force: true })
  };
}

test('Batch 4 反例 1：途经受保护目录 (.git / protectedPaths) 或工作区外部再指回普通源码的符号链接链，read_file、list_directory、search_code 均必须拒绝', async t => {
  const f = createChainFixture();
  t.after(f.cleanup);

  const executor = new WorkspaceToolExecutor(f.ws, {
    readScope: ['.'],
    protectedPaths: [f.customProtected]
  });

  // read_file 直接读取途经 .git、protectedPaths、工作区外部的别名必须全部拒绝 (403)
  for (const badFile of ['alias_via_git.ts', 'alias_via_hub.ts', 'alias_via_outside.ts', 'alias_dir_via_git/public.ts', 'alias_dir_via_hub/public.ts', 'alias_dir_via_outside/public.ts']) {
    assert.throws(
      () => executor.readFile(badFile),
      (err: unknown) => err instanceof HubError && err.status === 403,
      `read_file("${badFile}") 必须因中间链接跳触及受保护或越界位置而被拒绝`
    );
    const res = await executor.execute({ id: `rf-${badFile}`, name: 'read_file', arguments: { path: badFile } });
    assert.ok(res.error, `execute read_file("${badFile}") 必须返回错误`);
  }

  // list_directory 直接列举途经受保护或外部中间跳的目录别名必须全部拒绝 (403)
  for (const badDir of ['alias_dir_via_git', 'alias_dir_via_hub', 'alias_dir_via_outside']) {
    assert.throws(
      () => executor.listDirectory(badDir),
      (err: unknown) => err instanceof HubError && err.status === 403,
      `list_directory("${badDir}") 必须拒绝`
    );
    const res = await executor.execute({ id: `ld-${badDir}`, name: 'list_directory', arguments: { path: badDir } });
    assert.ok(res.error, `execute list_directory("${badDir}") 必须返回错误`);
  }

  // search_code (同步与异步 execute) 直接指定这些目录别名必须全部拒绝 (403)
  for (const badDir of ['alias_dir_via_git', 'alias_dir_via_hub', 'alias_dir_via_outside']) {
    assert.throws(
      () => executor.searchCode('CHAIN_TARGET_TOKEN', badDir),
      (err: unknown) => err instanceof HubError && err.status === 403,
      `searchCode(..., "${badDir}") 必须拒绝`
    );
    const res = await executor.execute({ id: `sc-${badDir}`, name: 'search_code', arguments: { query: 'CHAIN_TARGET_TOKEN', path: badDir } });
    assert.ok(res.error, `execute search_code(..., "${badDir}") 必须返回错误`);
  }

  // 从根目录列举和搜索时，不得暴露或穿越任何途经受保护/越界中间跳的别名，但必须保留安全源码链接
  const rootListing = JSON.parse(executor.listDirectory('.')) as { entries: Array<{ name: string }> };
  const rootEntryNames = rootListing.entries.map(e => e.name);
  for (const forbidden of ['alias_via_git.ts', 'alias_via_hub.ts', 'alias_via_outside.ts', 'alias_dir_via_git', 'alias_dir_via_hub', 'alias_dir_via_outside']) {
    assert.ok(!rootEntryNames.includes(forbidden), `list_directory(".") 不得暴露非法链接链条目 ${forbidden}`);
  }
  assert.ok(rootEntryNames.includes('safe_root_link.ts'), '授权根内安全源码链接应正常保留在目录列表中');

  const syncSearch = JSON.parse(executor.searchCode('CHAIN_TARGET_TOKEN', '.')) as { matches: Array<{ file: string }> };
  const asyncSearchRes = await executor.execute({ id: 'sc-root', name: 'search_code', arguments: { query: 'CHAIN_TARGET_TOKEN', path: '.' } });
  assert.equal(asyncSearchRes.error, undefined);
  const asyncSearch = JSON.parse(asyncSearchRes.output) as { matches: Array<{ file: string }> };

  const forbiddenChains = ['alias_via_git.ts', 'alias_via_hub.ts', 'alias_via_outside.ts', 'alias_dir_via_git', 'alias_dir_via_hub', 'alias_dir_via_outside'];
  for (const matchedFiles of [syncSearch.matches.map(m => m.file), asyncSearch.matches.map(m => m.file)]) {
    for (const file of matchedFiles) {
      for (const bad of forbiddenChains) {
        assert.ok(!file.includes(bad), `search_code 不得通过非法链接链匹配文件: ${file}`);
      }
    }
    assert.ok(matchedFiles.includes('src/public.ts'), '真实安全源码文件应正常命中');
    assert.ok(matchedFiles.includes('safe_root_link.ts'), '安全源码链接应正常命中');
  }

  // 验证既定策略：安全源码链接可正常 read_file
  const safeRead = JSON.parse(executor.readFile('safe_root_link.ts')) as { content: string };
  assert.match(safeRead.content, /SAFE_SOURCE_42/);
});

test('Batch 4 反例 2：途经 readScope 之外目录再指回 readScope 内的符号链接链必须按超出读取范围拒绝', async t => {
  const f = createChainFixture();
  t.after(f.cleanup);

  const scopedExecutor = new WorkspaceToolExecutor(f.ws, {
    readScope: ['src'],
    protectedPaths: [f.customProtected]
  });

  // src/alias_via_unscoped.ts 位于 src 内，最终目标 src/public.ts 也位于 src 内，但中间跳位于 unscoped 目录 -> 必须拒绝！
  assert.throws(
    () => scopedExecutor.readFile('src/alias_via_unscoped.ts'),
    (err: unknown) => err instanceof HubError && err.status === 403 && err.code === 'PATH_OUT_OF_SCOPE'
  );

  // 同属 src 内的安全链接 src/safe_internal_link.ts -> public.ts 正常放行
  const safeScoped = JSON.parse(scopedExecutor.readFile('src/safe_internal_link.ts')) as { content: string };
  assert.match(safeScoped.content, /SAFE_SOURCE_42/);

  // list_directory('src') 与 search_code(..., 'src') 不得暴露或跟随 alias_via_unscoped.ts
  const srcList = JSON.parse(scopedExecutor.listDirectory('src')) as { entries: Array<{ name: string }> };
  const names = srcList.entries.map(e => e.name);
  assert.ok(!names.includes('alias_via_unscoped.ts'));
  assert.ok(names.includes('safe_internal_link.ts'));

  const asyncRes = await scopedExecutor.execute({ id: 'sc-src', name: 'search_code', arguments: { query: 'CHAIN_TARGET_TOKEN', path: 'src' } });
  assert.equal(asyncRes.error, undefined);
  const parsed = JSON.parse(asyncRes.output) as { matches: Array<{ file: string }> };
  assert.ok(!parsed.matches.some(m => m.file.includes('alias_via_unscoped.ts')));
  assert.ok(parsed.matches.some(m => m.file === 'src/safe_internal_link.ts'));
});
