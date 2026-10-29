import { createRecordSchemaRegistry } from './record-validator.js';
import type { AnySchemaObject, ValidateFunction } from 'ajv';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from '../domain/board.js';
import type { HarnessRun, RunRepository } from '../domain/harness.js';

export function resolveRunLocatorPath(runDir: string, locator: string): string {
  if (!locator || typeof locator !== 'string') {
    fail(400, 'INVALID_LOCATOR', '运行定位符不能为空。');
  }
  const clean = locator.trim();
  if (clean.includes('\0')) {
    fail(400, 'INVALID_LOCATOR', '运行定位符包含非法字符。');
  }
  if (isAbsolute(clean) || /^[A-Za-z]:[/\\]/.test(clean)) {
    fail(400, 'INVALID_LOCATOR', `运行定位符必须为相对路径，拒绝绝对路径: "${clean}"`);
  }
  const normalized = clean.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(s => s.length > 0);
  if (segments.some(s => s === '..')) {
    fail(400, 'INVALID_LOCATOR', `运行定位符禁止目录穿越 (..): "${clean}"`);
  }
  // 规范化：若包含单一子目录且名为 'runs'（旧版生成的 runs/:id.json 快照兼容），安全剥离
  if (segments.length > 2 || (segments.length === 2 && segments[0] !== 'runs')) {
    fail(400, 'INVALID_LOCATOR', `运行定位符超出预期相对路径范围: "${clean}"`);
  }
  const targetFile = segments[segments.length - 1]!;
  if (!/^[A-Za-z0-9-]+\.json$/.test(targetFile)) {
    fail(400, 'INVALID_LOCATOR', `运行定位符文件名非法: "${targetFile}"`);
  }

  // 物理根目录与静态符号链接检查
  const resolvedDir = resolve(runDir);
  const targetPath = join(resolvedDir, targetFile);

  try {
    const lstat = lstatSync(targetPath);
    if (lstat.isSymbolicLink()) {
      fail(400, 'UNSAFE_RUN_FILE', `运行账本禁止使用符号链接: "${clean}"`);
    }
    if (!lstat.isFile()) {
      fail(400, 'UNSAFE_RUN_FILE', `运行账本必须为普通文件: "${clean}"`);
    }
    const realDir = existsSync(resolvedDir) ? realpathSync(resolvedDir) : resolvedDir;
    const realTarget = realpathSync(targetPath);
    if (dirname(realTarget) !== realDir) {
      fail(400, 'UNSAFE_RUN_FILE', `运行账本物理路径逃逸出指定运行目录: "${clean}"`);
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }

  return targetPath;
}

export function readSafeRunFile(runDir: string, locator: string): { data: unknown; filePath: string } {
  const filePath = resolveRunLocatorPath(runDir, locator);
  if (!existsSync(filePath)) {
    fail(404, 'RUN_NOT_FOUND', `未找到运行账本文件: "${locator}"`);
  }
  const lstat = lstatSync(filePath);
  if (lstat.isSymbolicLink() || !lstat.isFile()) {
    fail(400, 'UNSAFE_RUN_FILE', `运行账本必须为普通文件，禁止符号链接: "${locator}"`);
  }
  if (lstat.size > 2 * 1024 * 1024) {
    fail(413, 'RUN_TOO_LARGE', `运行账本文件过大 (${lstat.size} 字节)，超过 2 MiB 上限。`);
  }
  try {
    const text = readFileSync(filePath, 'utf8');
    const data: unknown = JSON.parse(text);
    return { data, filePath };
  } catch (err: unknown) {
    fail(400, 'INVALID_RUN_FILE', `运行账本文件无法解析为 JSON: ${String(err)}`);
  }
}

export class JsonRunStore implements RunRepository {
  readonly storagePath: string;
  private readonly directory: string;
  private readonly validate: ValidateFunction<HarnessRun>;
  constructor(directory: string) {
    this.directory = resolve(directory);
    this.storagePath = this.directory;
    const ajv = createRecordSchemaRegistry();
    ajv.addSchema(JSON.parse(readFileSync(new URL('../../schemas/harness/candidate.schema.json', import.meta.url), 'utf8')) as AnySchemaObject);
    this.validate = ajv.compile<HarnessRun>(JSON.parse(readFileSync(new URL('../../schemas/harness/run.schema.json', import.meta.url), 'utf8')) as AnySchemaObject);
  }
  private path(id: string): string {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) fail(400, 'INVALID_RUN_ID', '运行标识不合法。');
    return join(this.directory, id + '.json');
  }
  get(id: string): HarnessRun | undefined {
    const path = this.path(id);
    if (!existsSync(path)) return undefined;
    const lstat = lstatSync(path);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      fail(400, 'UNSAFE_RUN_FILE', '运行账本必须为普通文件，禁止符号链接。');
    }
    if (lstat.size > 2 * 1024 * 1024) {
      fail(413, 'RUN_TOO_LARGE', '运行记录超过读取上限。');
    }
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!this.validate(data) || data.id !== id) fail(500, 'INVALID_RUN_FILE', '运行记录未通过合同校验，未覆盖原文件。');
    return data as HarnessRun;
  }
  list(projectId?: string): HarnessRun[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory).filter(name => /^[A-Za-z0-9-]+\.json$/.test(name)).flatMap(name => {
      const run = this.get(name.slice(0, -5)); return run && (!projectId || run.projectId === projectId) ? [run] : [];
    }).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  }
  create(run: HarnessRun): void {
    if (this.get(run.id)) fail(409, 'RUN_EXISTS', '运行已经存在。');
    this.write(run);
  }
  replace(run: HarnessRun, expectedRevision: number): void {
    if (this.get(run.id)?.revision !== expectedRevision || run.revision !== expectedRevision + 1) fail(409, 'STALE_RUN', '运行已变化，请重新读取。');
    this.write(run);
  }
  private write(run: HarnessRun): void {
    if (!this.validate(run)) fail(500, 'INVALID_RUN_FILE', '运行记录未通过合同校验。');
    const contents = JSON.stringify(run, null, 2) + '\n';
    if (Buffer.byteLength(contents) > 2 * 1024 * 1024) fail(413, 'RUN_TOO_LARGE', '运行记录超过保存上限。');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, '.' + randomUUID() + '.tmp');
    try {
      const fd = openSync(temporary, 'wx', 0o600);
      try { writeFileSync(fd, contents); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, this.path(run.id));
      const directory = openSync(this.directory, 'r');
      try { fsyncSync(directory); } finally { closeSync(directory); }
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
}
