import { closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from '../domain/board.js';
import type { RecordProject, RecordProjectRepository } from '../domain/record-project.js';

export class JsonRecordProjectStore implements RecordProjectRepository {
  readonly storagePath: string;
  private readonly directory: string;
  constructor(directory: string) {
    this.directory = resolve(directory);
    this.storagePath = this.directory;
  }
  private path(id: string): string {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(id)) return fail(400, 'INVALID_PROJECT_ID', '项目 ID 格式不正确。');
    return join(this.directory, id + '.json');
  }
  list(): RecordProject[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory).filter(name => /^[A-Za-z0-9-]+\.json$/.test(name))
      .sort().flatMap(name => { const item = this.get(name.slice(0, -5)); return item ? [item] : []; });
  }
  get(id: string): RecordProject | undefined {
    const path = this.path(id);
    if (!existsSync(path)) return undefined;
    const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !('id' in value) || value.id !== id || !('name' in value) || typeof value.name !== 'string' ||
        !('revision' in value) || !Number.isSafeInteger(value.revision) || !('records' in value) || !('audit' in value) || !Array.isArray(value.audit)) {
      return fail(500, 'INVALID_PROJECT_FILE', 'JSON 项目文件元数据不完整，未覆盖原文件。');
    }
    return value as RecordProject;
  }
  create(project: RecordProject): void {
    if (this.get(project.id)) fail(409, 'PROJECT_EXISTS', 'JSON 项目已存在。');
    this.write(project, true);
  }
  replace(project: RecordProject, expectedRevision: number): void {
    const current = this.get(project.id);
    if (!current || current.revision !== expectedRevision) fail(409, 'STALE_RECORD_PROJECT', '项目已更新，请重新核对。');
    if (project.revision !== expectedRevision + 1) fail(400, 'INVALID_REVISION', '保存序号不连续。');
    this.write(project, false);
  }
  private write(project: RecordProject, create: boolean): void {
    const contents = JSON.stringify(project, null, 2) + '\n';
    if (Buffer.byteLength(contents) > 16 * 1024 * 1024) fail(413, 'PROJECT_TOO_LARGE', '项目记录超过本地保存上限，本次未保存。');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const destination = this.path(project.id);
    const temporary = join(this.directory, '.' + project.id + '.' + randomUUID() + '.tmp');
    try {
      const fd = openSync(temporary, 'wx', 0o600);
      try { writeFileSync(fd, contents, 'utf8'); fsyncSync(fd); } finally { closeSync(fd); }
      if (create) { linkSync(temporary, destination); unlinkSync(temporary); }
      else renameSync(temporary, destination);
      const directory = openSync(this.directory, 'r');
      try { fsyncSync(directory); } finally { closeSync(directory); }
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
}
