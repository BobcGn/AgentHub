import type { HarnessService } from '../application/harness-service.js';
import type { RecoveryService } from '../application/recovery-service.js';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { HubError, fail, object, textField } from '../domain/board.js';
import type { BoardService } from '../application/board-service.js';
import { Auth, SESSION_COOKIE } from './auth.js';
import { BoardEvents } from './board-events.js';
import type { SqliteStore } from './sqlite-store.js';
import { RecordProjectValidationError } from '../application/record-project-service.js';
import type { RecordProjectService } from '../application/record-project-service.js';
import { validateRecoveryBudget } from '../domain/recovery.js';

interface ServerOptions {
  harness?: HarnessService;
  store: SqliteStore;
  service: BoardService;
  recordService: RecordProjectService;
  recoveryService?: RecoveryService;
  webRoot: string;
  devOrigin?: string;
}
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
export function createHubServer(options: ServerOptions) {
  const auth = new Auth(options.store);
  const webRoot = resolve(options.webRoot);
  const events = new BoardEvents();
  options.harness?.onChange(() => events.publish());
  const changed = (res: ServerResponse, status: number, data: unknown): void => { events.publish(); json(res, status, data); };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    try {
      const expectedHost = '127.0.0.1:' + req.socket.localPort;
      if (req.headers.host !== expectedHost) fail(403, 'INVALID_HOST', '请使用服务显示的 127.0.0.1 地址。');
      const url = new URL(req.url ?? '/', 'http://' + expectedHost);
      if (!url.pathname.startsWith('/api/')) return await staticFile(url.pathname, res, webRoot, req.method);
      if (req.method !== 'GET' && req.method !== 'POST') fail(405, 'METHOD_NOT_ALLOWED', '该接口不支持此方法。');
      const method = req.method;
      // Browser mutations require an exact origin; bearer callers never inherit human cookie privileges.
      if (method === 'POST' && (!req.headers.authorization || req.headers.origin)) {
        const origin = req.headers.origin;
        if (origin !== 'http://' + expectedHost && origin !== options.devOrigin) fail(403, 'INVALID_ORIGIN', '请求来源未获允许。');
        if (!origin) fail(403, 'INVALID_ORIGIN', '人端写入必须携带同源 Origin。');
      }
      if (url.pathname === '/api/login' && method === 'POST') {
        if (req.headers.authorization) fail(403, 'HUMAN_REQUIRED', '工具令牌不能用于人端登录。');
        const input = object(await body(req), ['password']);
        const password = input['password'];
        if (typeof password !== 'string' || password.length < 1 || password.length > 256) fail(400, 'INVALID_INPUT', '密码格式不正确。');
        const token = auth.login(password);
        res.setHeader('Set-Cookie', SESSION_COOKIE + '=' + token + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800');
        return json(res, 200, { ok: true });
      }
      const principal = auth.principal(req.headers.authorization, req.headers.cookie);
      if (url.pathname === '/api/logout' && method === 'POST') {
        if (principal.kind !== 'human') fail(403, 'HUMAN_REQUIRED', '需要人端会话。');
        auth.logout(req.headers.cookie);
        events.publish();
        res.setHeader('Set-Cookie', SESSION_COOKIE + '=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/events' && method === 'GET') {
        if (principal.kind !== 'human') fail(403, 'HUMAN_REQUIRED', '自动同步仅供已登录的人端订阅。');
        events.subscribe(res, () => {
          try { return auth.principal(undefined, req.headers.cookie).kind === 'human'; }
          catch { return false; }
        });
        return;
      }
      if (url.pathname === '/api/access' && method === 'GET') return json(res, 200, principal);
      if (url.pathname === '/api/boards' && method === 'GET') return json(res, 200, options.service.overview(principal));
      if (url.pathname === '/api/projects' && method === 'POST') {
        return changed(res, 201, options.service.createProject(principal, await body(req), requestId(req)));
      }
      const projectRuns = /^\/api\/record-projects\/([^/]+)\/runs$/.exec(url.pathname);
      if (projectRuns?.[1]) {
        const harness = options.harness ?? fail(503, 'HARNESS_UNAVAILABLE', '运行功能尚未启用。');
        if (method === 'GET') return json(res, 200, harness.list(principal, projectRuns[1]));
        return changed(res, 201, harness.start(principal, projectRuns[1], await body(req), requestId(req)));
      }
      if (url.pathname === '/api/runtimes') {
        const harness = options.harness ?? fail(503, 'HARNESS_UNAVAILABLE', '运行功能尚未启用。');
        if (method === 'GET') return json(res, 200, harness.listRuntimes(principal));
        if (method === 'POST') return changed(res, 200, harness.saveRuntime(principal, await body(req)));
      }
      const runRoute = /^\/api\/runs\/([^/]+)(?:\/(preview|decision|apply|cancel|resume|fork))?$/.exec(url.pathname);
      if (runRoute?.[1]) {
        const harness = options.harness ?? fail(503, 'HARNESS_UNAVAILABLE', '运行功能尚未启用。');
        const id = runRoute[1], action = runRoute[2];
        if (method === 'GET' && !action) return json(res, 200, harness.get(principal, id));
        if (method === 'GET' && action === 'preview') return json(res, 200, harness.preview(principal, id));
        if (method === 'POST') {
          const input = await body(req);
          if (action === 'decision') return changed(res, 200, harness.decide(principal, id, input));
          if (action === 'apply') return changed(res, 200, harness.apply(principal, id, input));
          if (action === 'cancel') return changed(res, 200, harness.cancel(principal, id, input));
          if (action === 'resume') return changed(res, 200, harness.resume(principal, id, input));
          if (action === 'fork') return changed(res, 201, harness.fork(principal, id, input, requestId(req)));
        }
      }
      if (url.pathname === '/api/record-projects' && method === 'GET') return json(res, 200, options.recordService.list(principal));
      if (url.pathname === '/api/record-projects' && method === 'POST') return changed(res, 201, options.recordService.create(principal, await body(req), requestId(req)));
      const projectRecords = /^\/api\/record-projects\/([^/]+)$/.exec(url.pathname);
      if (projectRecords?.[1] && method === 'GET') return json(res, 200, options.recordService.get(principal, projectRecords[1]));
      const recoveryMatch = /^\/api\/record-projects\/([^/]+)\/recovery$/.exec(url.pathname);
      if (recoveryMatch?.[1] && method === 'GET') {
        const recoveryService = options.recoveryService;
        if (!recoveryService) fail(501, 'NOT_IMPLEMENTED', '恢复服务未配置。');
        const targetRequirementId = url.searchParams.get('targetRequirementId') || url.searchParams.get('requirementId') || undefined;
        const budgetParam = url.searchParams.get('budgetBytes') || url.searchParams.get('maxBudgetBytes') || undefined;
        let maxBudgetBytes: number | undefined;
        if (budgetParam !== undefined && budgetParam !== null) {
          const num = Number(budgetParam);
          maxBudgetBytes = validateRecoveryBudget(num);
        }
        const isMarkdown = url.searchParams.get('format') === 'markdown';
        const buildOptions = {
          ...(targetRequirementId ? { targetRequirementId } : {}),
          ...(maxBudgetBytes !== undefined ? { maxBudgetBytes } : {}),
          deliveryFormat: isMarkdown ? ('markdown' as const) : ('compact_json' as const)
        };
        if (isMarkdown) {
          const markdown = recoveryService.formatRecoveryMarkdown(principal, recoveryMatch[1], buildOptions);
          res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
          res.end(markdown);
          return;
        }
        return json(res, 200, recoveryService.getRecoveryView(principal, recoveryMatch[1], buildOptions));
      }
      const recordAction = /^\/api\/record-projects\/([^/]+)\/(record-preview|records|intent-confirmation|intent-draft-preview|intent-draft)$/.exec(url.pathname);
      if (recordAction?.[1] && method === 'POST') {
        const input = await body(req, 8 * 1024 * 1024);
        if (recordAction[2] === 'record-preview') return json(res, 200, options.recordService.previewEdit(principal, recordAction[1], input));
        if (recordAction[2] === 'intent-draft-preview') return json(res, 200, options.recordService.previewIntentDraft(principal, recordAction[1], input));
        if (recordAction[2] === 'intent-draft') return changed(res, 200, options.recordService.saveIntentDraft(principal, recordAction[1], input, requestId(req)));
        if (recordAction[2] === 'records') return changed(res, 200, options.recordService.saveRecord(principal, recordAction[1], input, requestId(req)));
        return changed(res, 200, options.recordService.confirmIntent(principal, recordAction[1], input, requestId(req)));
      }
      const acceptance = /^\/api\/record-projects\/([^/]+)\/requirements\/([^/]+)\/acceptance$/.exec(url.pathname);
      if (acceptance?.[1] && acceptance[2] && method === 'POST') return changed(res, 200,
        options.recordService.acceptRequirement(principal, acceptance[1], acceptance[2], await body(req), requestId(req)));
      const migrationPreview = /^\/api\/projects\/([^/]+)\/migration-preview$/.exec(url.pathname);
      if (migrationPreview?.[1] && method === 'GET') return json(res, 200, options.recordService.migrationPreview(principal, migrationPreview[1]));
      const migrate = /^\/api\/projects\/([^/]+)\/migrate-records$/.exec(url.pathname);
      if (migrate?.[1] && method === 'POST') return changed(res, 201,
        options.recordService.migrate(principal, migrate[1], await body(req), requestId(req)));
      const scopes = /^\/api\/projects\/([^/]+)\/scopes$/.exec(url.pathname);
      if (scopes?.[1] && method === 'POST') {
        const input = object(await body(req), ['label', 'recordScope', 'changeScope']);
        return changed(res, 201, options.service.issueToken(principal, scopes[1], textField(input, 'label', 120), input['recordScope'], input['changeScope']));
      }
      const revoke = /^\/api\/projects\/([^/]+)\/scopes\/([^/]+)\/revoke$/.exec(url.pathname);
      if (revoke?.[1] && revoke[2] && method === 'POST') {
        object(await body(req), []);
        options.service.revokeToken(principal, revoke[1], revoke[2]);
        return changed(res, 200, { ok: true });
      }
      const changes = /^\/api\/projects\/([^/]+)\/changes$/.exec(url.pathname);
      if (changes?.[1] && method === 'POST') {
        return changed(res, 201, options.service.proposeChange(principal, changes[1], await body(req), requestId(req)));
      }
      const changeAction = /^\/api\/projects\/([^/]+)\/changes\/([^/]+)\/(decisions|authorization|revoke-authorization)$/.exec(url.pathname);
      if (changeAction?.[1] && changeAction[2] && method === 'POST') {
        const input = await body(req);
        const result = changeAction[3] === 'decisions'
          ? options.service.decideChange(principal, changeAction[1], changeAction[2], input, requestId(req))
          : changeAction[3] === 'authorization'
            ? options.service.authorizeIntentChange(principal, changeAction[1], changeAction[2], input, requestId(req))
            : options.service.revokeIntentAuthorization(principal, changeAction[1], changeAction[2], input, requestId(req));
        return changed(res, 200, result);
      }
      const records = /^\/api\/projects\/([^/]+)\/records$/.exec(url.pathname);
      if (records?.[1] && method === 'POST') {
        return changed(res, 201, options.service.appendEntry(principal, records[1], await body(req), requestId(req)));
      }
      const proposals = /^\/api\/projects\/([^/]+)\/proposals$/.exec(url.pathname);
      if (proposals?.[1] && method === 'POST') {
        return changed(res, 201, options.service.propose(principal, proposals[1], await body(req), requestId(req)));
      }
      const decision = /^\/api\/projects\/([^/]+)\/proposals\/([^/]+)\/decisions$/.exec(url.pathname);
      if (decision?.[1] && decision[2] && method === 'POST') {
        return changed(res, 200, options.service.decide(principal, decision[1], decision[2], await body(req), requestId(req)));
      }
      fail(404, 'NOT_FOUND', '接口不存在。');
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof RecordProjectValidationError) return json(res, error.status, { error: { code: error.code, message: error.message }, report: error.report });
      if (error instanceof HubError) return json(res, error.status, { error: { code: error.code, message: error.message } });
      console.error('Hub 请求失败:', error instanceof Error ? error.message : 'Unknown');
      json(res, 500, { error: { code: 'INTERNAL_ERROR', message: '保存或读取失败，不能确认操作成功。请刷新核对后使用原请求编号重试。' } });
    }
  });
  server.once('close', () => events.close());
  return Object.assign(server, { closeUpdates: () => { options.harness?.shutdown(); events.close(); } });
}
function requestId(req: IncomingMessage): string {
  const value = req.headers['idempotency-key'];
  return typeof value === 'string' ? value : '';
}
async function body(req: IncomingMessage, maximum = 48 * 1024): Promise<unknown> {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'CONTENT_TYPE', '请求应使用 application/json。');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > maximum) fail(413, 'BODY_TOO_LARGE', '请求内容超过当前入口上限。');
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { return fail(400, 'INVALID_JSON', 'JSON 格式不正确。'); }
}
function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
async function staticFile(path: string, res: ServerResponse, root: string, method: string | undefined): Promise<void> {
  if (method !== 'GET' && method !== 'HEAD') return fail(405, 'METHOD_NOT_ALLOWED', '仅支持读取页面。');
  const requested = path === '/' ? '/index.html' : path;
  const file = resolve(root, '.' + requested);
  if (!file.startsWith(root + sep)) return fail(404, 'NOT_FOUND', '文件不存在。');
  try {
    if (!(await stat(file)).isFile()) return fail(404, 'NOT_FOUND', '文件不存在。');
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
    res.end(method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error instanceof HubError) throw error;
    return fail(404, 'NOT_FOUND', '页面尚未构建或文件不存在，请先运行 npm run build。');
  }
}
