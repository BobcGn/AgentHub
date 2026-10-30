import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fail } from '../domain/board.js';
import type { Principal } from '../domain/board.js';
import type { SqliteStore } from './sqlite-store.js';

export const SESSION_COOKIE = 'agenthub_session';
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const toolCredentials = {
  create(): { token: string; hash: string } {
    const token = 'ah_tool_' + randomBytes(32).toString('base64url');
    return { token, hash: hashToken(token) };
  }
};
export function initializeAdmin(store: SqliteStore, password: string): void {
  if (store.getMetadata('admin')) fail(409, 'ALREADY_INITIALIZED', '已有人端账户，不能重新初始化。');
  if (password.length < 12 || password.length > 256) fail(400, 'WEAK_PASSWORD', '密码长度应为 12–256 字符。');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  store.setMetadata('admin', JSON.stringify({ salt, hash }));
}
export class Auth {
  private readonly sessions = new Map<string, number>();
  private failures = 0;
  private blockedUntil = 0;
  private readonly store: SqliteStore;
  constructor(store: SqliteStore) { this.store = store; }
  login(password: string): string {
    if (Date.now() < this.blockedUntil) fail(429, 'LOGIN_THROTTLED', '失败次数过多，请一分钟后重试。');
    const saved = this.store.getMetadata('admin');
    if (!saved) fail(503, 'SETUP_REQUIRED', '请先在终端运行 npm run setup 建立人端账户。');
    const { salt, hash } = JSON.parse(saved) as { salt: string; hash: string };
    const actual = scryptSync(password, salt, 64);
    if (!timingSafeEqual(Buffer.from(hash, 'hex'), actual)) {
      this.failures += 1;
      if (this.failures >= 5) { this.blockedUntil = Date.now() + 60_000; this.failures = 0; }
      return fail(401, 'INVALID_LOGIN', '密码不正确。');
    }
    this.failures = 0;
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(hashToken(token), Date.now() + 8 * 60 * 60 * 1000);
    return token;
  }
  logout(cookie: string | undefined): void {
    const token = this.cookieToken(cookie);
    if (token) this.sessions.delete(hashToken(token));
  }
  principal(authorization: string | undefined, cookie: string | undefined): Principal {
    if (authorization) {
      if (!authorization.startsWith('Bearer ')) return fail(401, 'UNAUTHENTICATED', '需要有效的工具令牌。');
      const scope = this.store.scopeForHash(hashToken(authorization.slice(7)));
      return scope ? { kind: 'tool', scope } : fail(401, 'UNAUTHENTICATED', '工具令牌无效或已撤销。');
    }
    const token = this.cookieToken(cookie);
    if (token) {
      const hash = hashToken(token);
      const expires = this.sessions.get(hash);
      if (expires && expires > Date.now()) return { kind: 'human' };
      this.sessions.delete(hash);
    }
    return fail(401, 'UNAUTHENTICATED', '请先登录人端，或提供工具令牌。');
  }
  private cookieToken(cookie: string | undefined): string | undefined {
    return cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
  }
}
