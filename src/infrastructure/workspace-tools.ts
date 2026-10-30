import { closeSync, existsSync, fstatSync, lstatSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, statSync } from 'node:fs';
import { open as openAsync, readdir as readdirAsync, stat as statAsync } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { HubError } from '../domain/board.js';
import type { ToolCallRequest, ToolCallResult, ToolDefinition } from '../domain/harness.js';

const EXCLUDED_DEFAULT_NAMES = new Set([
  '.git', 'node_modules', '.agenthub', 'dist', '.env', 'runs', 'records', 'record-projects'
]);

export function isExcludedDefault(name: string): boolean {
  const lower = name.toLowerCase();
  if (EXCLUDED_DEFAULT_NAMES.has(lower)) return true;
  if (lower.startsWith('.env.') || lower.startsWith('.env')) return true;
  if (lower.endsWith('.sqlite') || lower.endsWith('.sqlite-wal') || lower.endsWith('.sqlite-shm') || lower === 'board.db') return true;
  if (lower === 'id_rsa' || lower.endsWith('.pem') || lower.endsWith('.key') || lower === 'credentials') return true;
  return false;
}

export const WORKSPACE_TOOLS_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'list_directory',
    description: '列出工作区内指定目录下的文件和子目录列表。用于了解项目结构。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '相对工作区根目录的路径，默认为 "." 表示根目录'
        }
      }
    }
  },
  {
    name: 'read_file',
    description: '读取工作区内指定文本文件的内容。支持指定行号范围。',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: '相对工作区根目录的文件路径'
        },
        startLine: {
          type: 'integer',
          minimum: 1,
          description: '起始行号（从 1 开始，可选）'
        },
        endLine: {
          type: 'integer',
          minimum: 1,
          description: '结束行号（可选）'
        }
      }
    }
  },
  {
    name: 'search_code',
    description: '在工作区代码中搜索关键词或符号。',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: '要搜索的关键词或符号'
        },
        path: {
          type: 'string',
          description: '搜索的相对子目录路径，默认为 "."'
        }
      }
    }
  }
];

export function truncateUtf8Safe(str: string, maxBytes = 16384): { text: string; truncated: boolean } {
  const fullBytes = Buffer.byteLength(str, 'utf8');
  if (fullBytes <= maxBytes) {
    return { text: str, truncated: false };
  }
  const marker = '\n... [output truncated to 16 KiB limit]';
  const markerBytes = Buffer.byteLength(marker, 'utf8');
  const targetBytes = Math.max(0, maxBytes - markerBytes);

  const buf = Buffer.from(str, 'utf8');
  const decoder = new StringDecoder('utf8');
  const safeSlice = decoder.write(buf.subarray(0, targetBytes));
  return { text: safeSlice + marker, truncated: true };
}

export interface WorkspaceExecutorOptions {
  readScope?: string[];
  exclude?: string[];
  protectedPaths?: string[];
  maxFileBytes?: number;
}

export class WorkspaceToolExecutor {
  private readonly workspaceRoot: string;
  private readonly realWorkspaceRoot: string;
  private readonly readScope: string[];
  private readonly customExcludes: Set<string>;
  private readonly protectedAbsPaths: string[];
  private readonly maxFileBytes: number;

  constructor(workspaceRoot: string, optionsOrMaxBytes: WorkspaceExecutorOptions | number = 16384) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()) {
      throw new HubError(403, 'WORKSPACE_NOT_AUTHORIZED', '未指定授权工作区根目录，禁止回退当前进程目录。');
    }
    this.workspaceRoot = resolve(workspaceRoot);
    if (existsSync(this.workspaceRoot)) {
      this.realWorkspaceRoot = realpathSync(this.workspaceRoot);
    } else {
      this.realWorkspaceRoot = this.workspaceRoot;
    }

    if (typeof optionsOrMaxBytes === 'number') {
      this.maxFileBytes = optionsOrMaxBytes;
      this.readScope = ['.'];
      this.customExcludes = new Set();
      this.protectedAbsPaths = [];
    } else {
      this.maxFileBytes = optionsOrMaxBytes?.maxFileBytes ?? 16384;
      this.readScope = (optionsOrMaxBytes?.readScope && optionsOrMaxBytes.readScope.length > 0)
        ? optionsOrMaxBytes.readScope.map(s => s.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)
        : ['.'];
      this.customExcludes = new Set(
        (optionsOrMaxBytes?.exclude ?? [])
          .map(s => s.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, ''))
          .filter(Boolean)
      );
      const protectedSet = new Set<string>();
      for (const rawProt of optionsOrMaxBytes?.protectedPaths ?? []) {
        if (typeof rawProt === 'string' && rawProt.trim()) {
          const abs = resolve(rawProt.trim());
          protectedSet.add(abs);
          if (existsSync(abs)) {
            try { protectedSet.add(realpathSync(abs)); } catch { /* ignore */ }
          }
        }
      }
      this.protectedAbsPaths = Array.from(protectedSet);
    }
  }

  private isProtectedAbsPath(absTarget: string): boolean {
    const targetNorm = absTarget.replace(/\\/g, '/');
    const targetLower = targetNorm.toLowerCase();
    for (const prot of this.protectedAbsPaths) {
      const protNorm = prot.replace(/\\/g, '/');
      const protLower = protNorm.toLowerCase();
      if (targetLower === protLower || targetLower.startsWith(protLower + '/')) {
        return true;
      }
    }
    return false;
  }

  private isExcluded(nameOrRel: string): boolean {
    const normalized = nameOrRel.replace(/\\/g, '/');
    const normLower = normalized.toLowerCase();
    if (isExcludedDefault(normalized)) return true;
    const segments = normalized.split('/').filter(Boolean);
    for (const seg of segments) {
      if (isExcludedDefault(seg)) return true;
    }
    if (this.customExcludes.has(normalized) || this.customExcludes.has(normLower)) return true;
    for (const ex of this.customExcludes) {
      const exLower = ex.toLowerCase();
      if (normLower === exLower || normLower.startsWith(exLower + '/') || normLower.endsWith('/' + exLower) || normLower.includes('/' + exLower + '/')) {
        return true;
      }
    }
    return false;
  }

  private isWithinReadScope(rel: string): boolean {
    const norm = rel.replace(/\\/g, '/');
    if (this.readScope.includes('.') || this.readScope.includes('')) return true;

    // 1. 精确大小写匹配（适用于大小写敏感系统如 Linux ext4，防止授权 src 时错误扩大放行 SRC 目录）
    for (const scope of this.readScope) {
      if (scope === '.' || scope === '') return true;
      if (norm === scope || norm.startsWith(scope + '/')) {
        return true;
      }
    }

    // 2. 物理磁盘实际大小写解析核对（适用于大小写不敏感系统如 macOS APFS / Windows NTFS）
    // 仅当底层物理文件系统指向同一实际目录（realpathSync.native 还原物理路径匹配白名单）时才允许访问
    const abs = resolve(this.workspaceRoot, norm);
    if (existsSync(abs)) {
      try {
        const canonical = typeof realpathSync.native === 'function' ? realpathSync.native(abs) : realpathSync(abs);
        const relCanonical = relative(this.realWorkspaceRoot, canonical).replace(/\\/g, '/');
        for (const scope of this.readScope) {
          if (scope === '.' || scope === '') return true;
          if (relCanonical === scope || relCanonical.startsWith(scope + '/')) {
            return true;
          }
        }
      } catch { /* ignore */ }
    }

    return false;
  }

  private isAncestorOfReadScope(rel: string): boolean {
    const norm = rel.replace(/\\/g, '/');
    if (norm === '.' || norm === '') return true;
    if (this.isWithinReadScope(norm)) return true;

    // 精确祖先匹配
    for (const scope of this.readScope) {
      if (scope.startsWith(norm + '/')) {
        return true;
      }
    }

    // 物理祖先匹配
    const abs = resolve(this.workspaceRoot, norm);
    if (existsSync(abs)) {
      try {
        const canonical = typeof realpathSync.native === 'function' ? realpathSync.native(abs) : realpathSync(abs);
        const relCanonical = relative(this.realWorkspaceRoot, canonical).replace(/\\/g, '/');
        for (const scope of this.readScope) {
          if (scope.startsWith(relCanonical + '/')) {
            return true;
          }
        }
      } catch { /* ignore */ }
    }

    return false;
  }

  private toWorkspaceRelative(absCandidate: string): string | null {
    const relReal = relative(this.realWorkspaceRoot, absCandidate);
    if (!relReal.startsWith('..') && !isAbsolute(relReal)) {
      return (relReal === '' ? '.' : normalize(relReal)).replace(/\\/g, '/');
    }
    const relLogical = relative(this.workspaceRoot, absCandidate);
    if (!relLogical.startsWith('..') && !isAbsolute(relLogical)) {
      return (relLogical === '' ? '.' : normalize(relLogical)).replace(/\\/g, '/');
    }
    return null;
  }

  private isProtectedRelPath(relInWs: string): boolean {
    const absLogical = relInWs === '.' ? this.workspaceRoot : resolve(this.workspaceRoot, relInWs);
    const absReal = relInWs === '.' ? this.realWorkspaceRoot : resolve(this.realWorkspaceRoot, relInWs);
    if (this.isProtectedAbsPath(absLogical) || this.isProtectedAbsPath(absReal)) {
      return true;
    }
    if (existsSync(absLogical)) {
      try {
        const nat = typeof realpathSync.native === 'function' ? realpathSync.native(absLogical) : realpathSync(absLogical);
        if (this.isProtectedAbsPath(nat)) return true;
      } catch { /* ignore */ }
    }
    return false;
  }

  private assertRelAllowed(relInWs: string, requireLeafScope: boolean): void {
    if (this.isProtectedRelPath(relInWs)) {
      throw new HubError(403, 'PROTECTED_PATH_DENIED', '禁止访问实际配置的受保护目录或数据库。');
    }
    if (relInWs !== '.' && this.isExcluded(relInWs)) {
      throw new HubError(403, 'PROTECTED_PATH_DENIED', `禁止访问受保护或已排除路径: ${relInWs}`);
    }
    const inScope = requireLeafScope ? this.isWithinReadScope(relInWs) : this.isAncestorOfReadScope(relInWs);
    if (!inScope) {
      throw new HubError(403, 'PATH_OUT_OF_SCOPE', `请求路径 ${relInWs} 超出授权的读取范围。`);
    }
  }

  private resolveSafePath(relativeTarget: string, allowScopeAncestor = false): string {
    const raw = relativeTarget.trim() || '.';
    const initialTarget = isAbsolute(raw) ? resolve(raw) : resolve(this.workspaceRoot, raw);

    // 1. 检查初始逻辑路径是否在工作区内，且不触碰受保护/排除目录或超出范围
    const initialRel = this.toWorkspaceRelative(initialTarget);
    if (initialRel === null) {
      throw new HubError(403, 'PATH_TRAVERSAL_DENIED', '禁止访问工作区外部路径。');
    }
    this.assertRelAllowed(initialRel, !allowScopeAncestor);

    if (initialRel === '.') {
      if (!existsSync(this.realWorkspaceRoot)) {
        throw new HubError(404, 'PATH_NOT_FOUND', '文件不存在或路径不存在。');
      }
      return this.realWorkspaceRoot;
    }

    // 2. 完整符号链接链逐跳 + 逐段核查（readlinkSync + lstatSync，不依赖单次 realpathSync 跳过受保护中间跳）
    const MAX_SYMLINK_HOPS = 32;
    let symlinkHops = 0;
    let resolvedSegments: string[] = [];
    let pendingSegments = initialRel.split('/').filter(Boolean);

    while (pendingSegments.length > 0) {
      const seg = pendingSegments.shift()!;
      if (seg === '.') continue;
      if (seg === '..') {
        if (resolvedSegments.length === 0) {
          throw new HubError(403, 'PATH_TRAVERSAL_DENIED', '禁止通过符号链接或相对路径逃逸工作区。');
        }
        resolvedSegments.pop();
        const parentRel = resolvedSegments.length === 0 ? '.' : resolvedSegments.join('/');
        this.assertRelAllowed(parentRel, pendingSegments.length === 0 && !allowScopeAncestor);
        continue;
      }

      const isFinalSegment = pendingSegments.length === 0;
      const candidateRel = [...resolvedSegments, seg].join('/');
      this.assertRelAllowed(candidateRel, isFinalSegment && !allowScopeAncestor);

      const candidateAbs = join(this.realWorkspaceRoot, candidateRel);
      let lst;
      try {
        lst = lstatSync(candidateAbs);
      } catch {
        throw new HubError(404, 'PATH_NOT_FOUND', '文件不存在或路径不存在。');
      }

      if (lst.isSymbolicLink()) {
        symlinkHops += 1;
        if (symlinkHops > MAX_SYMLINK_HOPS) {
          throw new HubError(403, 'SYMLINK_LOOP_DENIED', '检测到符号链接循环或链接层级过深。');
        }
        let rawLink: string;
        try {
          rawLink = readlinkSync(candidateAbs);
        } catch {
          throw new HubError(404, 'PATH_NOT_FOUND', '符号链接解析失败。');
        }

        const hopAbs = isAbsolute(rawLink)
          ? resolve(rawLink)
          : resolve(dirname(candidateAbs), rawLink);
        const hopRel = this.toWorkspaceRelative(hopAbs);
        if (hopRel === null) {
          throw new HubError(403, 'PATH_TRAVERSAL_DENIED', '禁止通过中间或目标符号链接逃逸工作区。');
        }
        this.assertRelAllowed(hopRel, isFinalSegment && !allowScopeAncestor);

        const hopSegments = hopRel === '.' ? [] : hopRel.split('/').filter(Boolean);
        resolvedSegments = [];
        pendingSegments = [...hopSegments, ...pendingSegments];
      } else {
        resolvedSegments.push(seg);
      }
    }

    const finalRel = resolvedSegments.length === 0 ? '.' : resolvedSegments.join('/');
    this.assertRelAllowed(finalRel, !allowScopeAncestor);
    const finalCandidateAbs = finalRel === '.' ? this.realWorkspaceRoot : join(this.realWorkspaceRoot, finalRel);

    // 3. 最终物理路径一致性复核
    let realTarget: string;
    try {
      realTarget = typeof realpathSync.native === 'function'
        ? realpathSync.native(finalCandidateAbs)
        : realpathSync(finalCandidateAbs);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'ELOOP') {
        throw new HubError(403, 'SYMLINK_LOOP_DENIED', '检测到符号链接循环。');
      }
      throw new HubError(404, 'PATH_NOT_FOUND', '符号链接解析失败。');
    }

    const realRel = this.toWorkspaceRelative(realTarget);
    if (realRel === null) {
      throw new HubError(403, 'PATH_TRAVERSAL_DENIED', '禁止访问指向工作区外部的符号链接。');
    }
    this.assertRelAllowed(realRel, !allowScopeAncestor);

    return realTarget;
  }

  private resolveSafeChildEntry(relEntry: string): { realPath: string; stat: import('node:fs').Stats } | null {
    try {
      const resolvedForDir = this.resolveSafePath(relEntry, true);
      const st = statSync(resolvedForDir);
      if (st.isDirectory()) {
        return { realPath: resolvedForDir, stat: st };
      }
      if (st.isFile()) {
        const resolvedForFile = this.resolveSafePath(relEntry, false);
        return { realPath: resolvedForFile, stat: st };
      }
      return null;
    } catch {
      return null;
    }
  }

  listDirectory(rawPath?: string, signal?: AbortSignal): string {
    if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
    if (rawPath !== undefined && typeof rawPath !== 'string') {
      throw new HubError(400, 'INVALID_ARGUMENT', '目录路径参数必须为字符串。');
    }
    const target = this.resolveSafePath(rawPath ?? '.', true);
    const stat = statSync(target);
    if (!stat.isDirectory()) {
      throw new HubError(400, 'NOT_A_DIRECTORY', '指定路径不是目录。');
    }
    const entries = readdirSync(target, { withFileTypes: true });
    const result: Array<{ name: string; type: 'file' | 'directory' | 'other'; size?: number }> = [];
    let truncated = false;
    for (const entry of entries) {
      if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
      const fullEntry = join(target, entry.name);
      if (this.isProtectedAbsPath(fullEntry)) continue;
      const relEntry = relative(this.realWorkspaceRoot, fullEntry).replace(/\\/g, '/');
      if (this.isExcluded(entry.name) || this.isExcluded(relEntry)) continue;

      const safeChild = this.resolveSafeChildEntry(relEntry);
      if (!safeChild) continue;
      const entryStat = safeChild.stat;

      if (entryStat.isDirectory()) {
        if (result.length >= 100) { truncated = true; break; }
        result.push({ name: entry.name, type: 'directory' });
      } else if (entryStat.isFile()) {
        if (result.length >= 100) { truncated = true; break; }
        result.push({ name: entry.name, type: 'file', size: entryStat.size });
      }
    }
    return JSON.stringify({
      directory: relative(this.realWorkspaceRoot, target).replace(/\\/g, '/') || '.',
      count: result.length,
      truncated,
      entries: result
    }, null, 2);
  }

  readFile(rawPath: string, startLine?: number, endLine?: number, signal?: AbortSignal): string {
    if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
    if (!rawPath || typeof rawPath !== 'string') {
      throw new HubError(400, 'INVALID_ARGUMENT', '文件路径不能为空。');
    }
    if (startLine !== undefined && (!Number.isSafeInteger(startLine) || startLine < 1)) {
      throw new HubError(400, 'INVALID_ARGUMENT', '起始行号必须为大于等于 1 的整数。');
    }
    if (endLine !== undefined && (!Number.isSafeInteger(endLine) || endLine < 1)) {
      throw new HubError(400, 'INVALID_ARGUMENT', '结束行号必须为大于等于 1 的整数。');
    }
    if (startLine !== undefined && endLine !== undefined && endLine < startLine) {
      throw new HubError(400, 'INVALID_ARGUMENT', '结束行号不能小于起始行号。');
    }

    const target = this.resolveSafePath(rawPath);
    let fd: number;
    try {
      fd = openSync(target, 'r');
    } catch {
      throw new HubError(404, 'FILE_NOT_FOUND', '无法打开文件。');
    }

    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) {
        throw new HubError(400, 'NOT_A_FILE', '指定路径不是文件。');
      }

      const reqStart = (typeof startLine === 'number' && startLine >= 1) ? Math.floor(startLine) : 1;
      const reqEnd = (typeof endLine === 'number' && endLine >= reqStart) ? Math.floor(endLine) : Infinity;

      const CHUNK_SIZE = 4096;
      const buf = Buffer.alloc(CHUNK_SIZE);
      let currentLineNumber = 1;
      let totalLines = 0;
      let scannedBytes = 0;
      const MAX_SCAN_BYTES = 512 * 1024; // 512 KiB scanning budget
      let lineAccumulator = '';
      const selectedLines: string[] = [];
      let truncated = false;
      let truncationReason: string | null = null;
      let selectedBytes = 0;
      const MAX_OUTPUT_CONTENT_BYTES = Math.max(1024, this.maxFileBytes - 4096);

      const decoder = new StringDecoder('utf8');
      let bytesRead = 0;
      while ((bytesRead = readSync(fd, buf, 0, CHUNK_SIZE, null)) > 0) {
        if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        scannedBytes += bytesRead;
        if (scannedBytes > MAX_SCAN_BYTES) {
          truncated = true;
          truncationReason = 'scan_budget_exceeded';
          break;
        }

        const chunkText = decoder.write(buf.subarray(0, bytesRead));
        for (let i = 0; i < chunkText.length; i++) {
          const char = chunkText[i];
          if (char === '\n') {
            totalLines++;
            if (currentLineNumber >= reqStart && currentLineNumber <= reqEnd) {
              const lineToAdd = lineAccumulator.slice(0, 4096);
              const lineBytes = Buffer.byteLength(lineToAdd, 'utf8') + 1;
              if (selectedBytes + lineBytes > MAX_OUTPUT_CONTENT_BYTES) {
                truncated = true;
                truncationReason = 'max_output_bytes';
                break;
              }
              selectedLines.push(lineToAdd);
              selectedBytes += lineBytes;
            }
            lineAccumulator = '';
            currentLineNumber++;
            if (currentLineNumber > reqEnd) {
              break;
            }
          } else {
            if (lineAccumulator.length < 4096) {
              lineAccumulator += char;
            } else {
              truncated = true;
              if (!truncationReason) truncationReason = 'line_too_long';
            }
          }
        }
        if (currentLineNumber > reqEnd || truncationReason === 'max_output_bytes') {
          break;
        }
      }

      if (lineAccumulator.length > 0 && truncationReason === null) {
        totalLines++;
        if (currentLineNumber >= reqStart && currentLineNumber <= reqEnd) {
          const lineToAdd = lineAccumulator.slice(0, 4096);
          const lineBytes = Buffer.byteLength(lineToAdd, 'utf8');
          if (selectedBytes + lineBytes <= MAX_OUTPUT_CONTENT_BYTES) {
            selectedLines.push(lineToAdd);
          } else {
            truncated = true;
            truncationReason = 'max_output_bytes';
          }
        }
      }

      let content = selectedLines.join('\n');
      if (truncated) {
        content += '\n... [内容已截断: ' + (truncationReason ?? 'limit') + ']';
      }

      return JSON.stringify({
        path: relative(this.realWorkspaceRoot, target),
        startLine: reqStart,
        endLine: reqEnd === Infinity ? currentLineNumber : reqEnd,
        totalLines,
        totalLinesChecked: totalLines,
        content,
        truncated
      }, null, 2);
    } finally {
      closeSync(fd);
    }
  }

  searchCode(query: string, rawPath?: string, signal?: AbortSignal): string {
    if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new HubError(400, 'INVALID_QUERY', '搜索关键词至少需要 2 个字符。');
    }
    if (rawPath !== undefined && typeof rawPath !== 'string') {
      throw new HubError(400, 'INVALID_ARGUMENT', '搜索路径参数必须为字符串。');
    }
    const rootDir = this.resolveSafePath(rawPath ?? '.', true);
    const stat = statSync(rootDir);
    if (!stat.isDirectory()) {
      throw new HubError(404, 'PATH_NOT_FOUND', '搜索目录不存在。');
    }

    const matches: Array<{ file: string; line: number; snippet: string }> = [];
    let scannedFiles = 0;
    let scannedBytes = 0;
    let truncated = false;
    let truncationReason: string | null = null;
    const MAX_FILES = 200;
    const MAX_BYTES = 1024 * 1024; // 1 MB
    const MAX_MATCHES = 25;
    const MAX_DEPTH = 8;

    const walk = (dir: string, depth: number): void => {
      if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
      if (depth > MAX_DEPTH) {
        truncated = true;
        truncationReason = 'max_depth';
        return;
      }
      if (matches.length >= MAX_MATCHES) {
        truncated = true;
        truncationReason = 'max_matches';
        return;
      }
      if (scannedFiles >= MAX_FILES) {
        truncated = true;
        truncationReason = 'max_files';
        return;
      }
      if (scannedBytes >= MAX_BYTES) {
        truncated = true;
        truncationReason = 'max_bytes';
        return;
      }

      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        if (matches.length >= MAX_MATCHES) {
          truncated = true;
          truncationReason = 'max_matches';
          break;
        }
        if (scannedFiles >= MAX_FILES) {
          truncated = true;
          truncationReason = 'max_files';
          break;
        }
        if (scannedBytes >= MAX_BYTES) {
          truncated = true;
          truncationReason = 'max_bytes';
          break;
        }

        const full = join(dir, entry.name);
        if (this.isProtectedAbsPath(full)) continue;
        const relEntry = relative(this.realWorkspaceRoot, full).replace(/\\/g, '/');
        if (this.isExcluded(entry.name) || this.isExcluded(relEntry)) continue;

        const safeChild = this.resolveSafeChildEntry(relEntry);
        if (!safeChild) continue;
        const realFull = safeChild.realPath;
        const entryStat = safeChild.stat;

        if (entryStat.isDirectory()) {
          walk(realFull, depth + 1);
        } else if (entryStat.isFile()) {
          scannedFiles++;
          let fd: number;
          try {
            fd = openSync(realFull, 'r');
          } catch {
            continue;
          }
          try {
            const fstat = fstatSync(fd);
            if (fstat.size > 200 * 1024) continue; // skip files > 200 KiB
            scannedBytes += fstat.size;
            const content = readFileSync(fd, 'utf8');
            if (content.includes('\0')) continue; // skip binary
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line && line.includes(query)) {
                matches.push({
                  file: relEntry,
                  line: i + 1,
                  snippet: line.trim().slice(0, 160)
                });
                if (matches.length >= MAX_MATCHES) {
                  truncated = true;
                  truncationReason = 'max_matches';
                  break;
                }
              }
            }
          } finally {
            closeSync(fd);
          }
        }
      }
    };

    walk(rootDir, 0);

    return JSON.stringify({
      query,
      count: matches.length,
      truncated,
      truncationReason,
      scannedFiles,
      scannedBytes,
      matches
    }, null, 2);
  }

  async searchCodeAsync(query: string, rawPath?: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      throw new HubError(400, 'INVALID_QUERY', '搜索关键词至少需要 2 个字符。');
    }
    if (rawPath !== undefined && typeof rawPath !== 'string') {
      throw new HubError(400, 'INVALID_ARGUMENT', '搜索路径参数必须为字符串。');
    }
    const rootDir = this.resolveSafePath(rawPath ?? '.', true);
    const stat = await statAsync(rootDir);
    if (!stat.isDirectory()) {
      throw new HubError(404, 'PATH_NOT_FOUND', '搜索目录不存在。');
    }

    const matches: Array<{ file: string; line: number; snippet: string }> = [];
    let scannedFiles = 0;
    let scannedBytes = 0;
    let truncated = false;
    let truncationReason: string | null = null;
    const MAX_FILES = 200;
    const MAX_BYTES = 1024 * 1024;
    const MAX_MATCHES = 25;
    const MAX_DEPTH = 8;

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
      if (depth > MAX_DEPTH) { truncated = true; truncationReason = 'max_depth'; return; }
      if (matches.length >= MAX_MATCHES) { truncated = true; truncationReason = 'max_matches'; return; }
      if (scannedFiles >= MAX_FILES) { truncated = true; truncationReason = 'max_files'; return; }
      if (scannedBytes >= MAX_BYTES) { truncated = true; truncationReason = 'max_bytes'; return; }

      let entries;
      try {
        entries = await readdirAsync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (signal?.aborted) throw new HubError(409, 'RUN_CANCELLED', '运行已取消。');
        if (matches.length >= MAX_MATCHES) { truncated = true; truncationReason = 'max_matches'; break; }
        if (scannedFiles >= MAX_FILES) { truncated = true; truncationReason = 'max_files'; break; }
        if (scannedBytes >= MAX_BYTES) { truncated = true; truncationReason = 'max_bytes'; break; }

        const full = join(dir, entry.name);
        if (this.isProtectedAbsPath(full)) continue;
        const relEntry = relative(this.realWorkspaceRoot, full).replace(/\\/g, '/');
        if (this.isExcluded(entry.name) || this.isExcluded(relEntry)) continue;

        const safeChild = this.resolveSafeChildEntry(relEntry);
        if (!safeChild) continue;
        const realFull = safeChild.realPath;
        const entryStat = safeChild.stat;

        if (entryStat.isDirectory()) {
          await walk(realFull, depth + 1);
        } else if (entryStat.isFile()) {
          scannedFiles++;
          if (scannedFiles % 20 === 0) {
            await new Promise<void>(resolveYield => setImmediate(resolveYield));
          }
          let handle;
          try {
            handle = await openAsync(realFull, 'r');
          } catch {
            continue;
          }
          try {
            const fstat = await handle.stat();
            if (fstat.size > 200 * 1024) continue;
            scannedBytes += fstat.size;
            const content = await handle.readFile({ encoding: 'utf8' });
            if (content.includes('\0')) continue;
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (line && line.includes(query)) {
                matches.push({
                  file: relEntry,
                  line: i + 1,
                  snippet: line.trim().slice(0, 160)
                });
                if (matches.length >= MAX_MATCHES) {
                  truncated = true;
                  truncationReason = 'max_matches';
                  break;
                }
              }
            }
          } finally {
            await handle.close();
          }
        }
      }
    };

    await walk(rootDir, 0);

    return JSON.stringify({
      query,
      count: matches.length,
      truncated,
      truncationReason,
      scannedFiles,
      scannedBytes,
      matches
    }, null, 2);
  }

  private assertAllowedKeys(args: Record<string, unknown>, allowed: readonly string[]): void {
    for (const key of Object.keys(args)) {
      if (!allowed.includes(key)) {
        throw new HubError(400, 'INVALID_ARGUMENT', `不支持的工具参数: ${key}`);
      }
    }
  }

  async execute(request: ToolCallRequest, signal?: AbortSignal): Promise<ToolCallResult> {
    if (signal?.aborted) {
      return { callId: request.id, toolName: request.name, output: '', error: '运行已取消。' };
    }
    try {
      if (!request.arguments || typeof request.arguments !== 'object' || Array.isArray(request.arguments)) {
        throw new HubError(400, 'INVALID_ARGUMENT', '工具调用参数必须为对象。');
      }
      const args = request.arguments;
      let rawOutput = '';
      if (request.name === 'list_directory') {
        this.assertAllowedKeys(args, ['path']);
        if (args['path'] !== undefined && typeof args['path'] !== 'string') {
          throw new HubError(400, 'INVALID_ARGUMENT', 'list_directory 的 path 参数必须为字符串。');
        }
        rawOutput = this.listDirectory(args['path'], signal);
      } else if (request.name === 'read_file') {
        this.assertAllowedKeys(args, ['path', 'startLine', 'endLine']);
        if (typeof args['path'] !== 'string' || !args['path'].trim()) {
          throw new HubError(400, 'INVALID_ARGUMENT', 'read_file 的 path 参数必须为非空字符串。');
        }
        if (args['startLine'] !== undefined && typeof args['startLine'] !== 'number') {
          throw new HubError(400, 'INVALID_ARGUMENT', 'read_file 的 startLine 参数必须为整数。');
        }
        if (args['endLine'] !== undefined && typeof args['endLine'] !== 'number') {
          throw new HubError(400, 'INVALID_ARGUMENT', 'read_file 的 endLine 参数必须为整数。');
        }
        rawOutput = this.readFile(args['path'], args['startLine'], args['endLine'], signal);
      } else if (request.name === 'search_code') {
        this.assertAllowedKeys(args, ['query', 'path']);
        if (typeof args['query'] !== 'string') {
          throw new HubError(400, 'INVALID_ARGUMENT', 'search_code 的 query 参数必须为字符串。');
        }
        if (args['path'] !== undefined && typeof args['path'] !== 'string') {
          throw new HubError(400, 'INVALID_ARGUMENT', 'search_code 的 path 参数必须为字符串。');
        }
        rawOutput = await this.searchCodeAsync(args['query'], args['path'], signal);
      } else {
        throw new HubError(404, 'UNKNOWN_TOOL', `未知工具: ${request.name}`);
      }

      // 严格检查 16 KiB (16384 bytes) UTF-8 字节上限
      const byteLen = Buffer.byteLength(rawOutput, 'utf8');
      if (byteLen <= 16384) {
        return { callId: request.id, toolName: request.name, output: rawOutput };
      }

      // 若超出 16 KiB，确保返回合法的结构化 JSON，而不是盲目截断字符串导致 JSON 语法损坏
      try {
        const parsed = JSON.parse(rawOutput) as Record<string, unknown>;
        parsed.truncated = true;
        parsed.truncationReason = 'output_bytes_exceeded';
        if (typeof parsed.content === 'string') {
          const availableBytes = 12 * 1024;
          const { text } = truncateUtf8Safe(parsed.content, availableBytes);
          parsed.content = text;
        } else if (Array.isArray(parsed.entries)) {
          parsed.entries = parsed.entries.slice(0, 20);
        } else if (Array.isArray(parsed.matches)) {
          parsed.matches = parsed.matches.slice(0, 10);
        }
        const jsonText = JSON.stringify(parsed, null, 2);
        if (Buffer.byteLength(jsonText, 'utf8') <= 16384) {
          return { callId: request.id, toolName: request.name, output: jsonText };
        }
      } catch {
        // fallback to standard truncated json
      }

      const fallback = JSON.stringify({
        tool: request.name,
        error: 'OUTPUT_TOO_LARGE',
        truncated: true,
        message: '工具输出超出 16 KiB 限制，已截断。'
      }, null, 2);
      return { callId: request.id, toolName: request.name, output: fallback };
    } catch (err: unknown) {
      const message = err instanceof HubError ? err.message : err instanceof Error ? err.message : String(err);
      return { callId: request.id, toolName: request.name, output: '', error: message };
    }
  }
}
