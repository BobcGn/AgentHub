import Database from 'better-sqlite3';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BoardRepository, Replay } from '../application/board-service.js';
import type { Change } from '../domain/changes.js';
import type { Board, BoardEntry, Decision, Issue, Proposal, ToolScope } from '../domain/board.js';

type Row = { data: string };
function decode<T>(row: unknown): T | undefined {
  if (!row) return undefined;
  return JSON.parse((row as Row).data) as T;
}
export class SqliteStore implements BoardRepository {
  readonly db: Database.Database;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    const version = this.db.pragma('user_version', { simple: true }) as number;
    if (version > 3) { this.db.close(); throw new Error('数据库来自更新版本，当前程序不能打开。'); }
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.transaction(() => this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL, plan_version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS intents (project_id TEXT PRIMARY KEY REFERENCES projects(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id), project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS issues (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), proposal_id TEXT NOT NULL UNIQUE REFERENCES proposals(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scopes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), token_hash TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (actor TEXT NOT NULL, request_key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(actor, request_key));
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), issue_id TEXT REFERENCES issues(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_project ON records(project_id);
      CREATE TABLE IF NOT EXISTS changes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS changes_project ON changes(project_id);
      UPDATE issues SET data = json_set(data, '$.version', 1, '$.intentVersion', COALESCE((SELECT json_extract(proposals.data, '$.intentVersion') FROM proposals WHERE proposals.id = issues.proposal_id), 1)) WHERE json_extract(data, '$.version') IS NULL;
      PRAGMA user_version = 3;
    `)).immediate();
  }
  close(): void { this.db.close(); }
  transaction<T>(work: () => T): T { return this.db.transaction(work).immediate(); }
  listProjects(): Board[] {
    const ids = this.db.prepare('SELECT id FROM projects ORDER BY rowid').all() as { id: string }[];
    return ids.flatMap(({ id }) => { const board = this.getBoard(id); return board ? [board] : []; });
  }
  getBoard(id: string): Board | undefined {
    const row = this.db.prepare('SELECT data, plan_version FROM projects WHERE id = ?').get(id) as
      { data: string; plan_version: number } | undefined;
    if (!row) return undefined;
    const intent = decode<Board['intent']>(this.db.prepare('SELECT data FROM intents WHERE project_id = ?').get(id));
    if (!intent) throw new Error('数据库缺少项目 Intent');
    const all = <T>(table: string): T[] => this.db.prepare('SELECT data FROM ' + table + ' WHERE project_id = ? ORDER BY rowid')
      .all(id).map(value => JSON.parse((value as Row).data) as T);
    return { project: JSON.parse(row.data) as Board['project'], intent, planVersion: row.plan_version,
      proposals: all<Proposal>('proposals'), decisions: all<Decision>('decisions'),
      issues: all<Issue>('issues'), scopes: all<ToolScope>('scopes'), records: all<BoardEntry>('records'), changes: all<Change>('changes') };
  }
  createBoard(board: Board): void {
    this.db.prepare('INSERT INTO projects VALUES (?, ?, ?)').run(board.project.id, JSON.stringify(board.project), board.planVersion);
    this.db.prepare('INSERT INTO intents VALUES (?, ?)').run(board.project.id, JSON.stringify(board.intent));
  }
  saveProposal(proposal: Proposal): void {
    this.db.prepare('INSERT INTO proposals VALUES (?, ?, ?)').run(proposal.id, proposal.projectId, JSON.stringify(proposal));
  }
  finishProposal(proposal: Proposal, decision: Decision, issue: Issue | null): void {
    this.db.prepare('UPDATE proposals SET data = ? WHERE id = ?').run(JSON.stringify(proposal), proposal.id);
    this.db.prepare('INSERT INTO decisions VALUES (?, ?, ?, ?)').run(decision.id, proposal.id, proposal.projectId, JSON.stringify(decision));
    if (issue) {
      this.db.prepare('INSERT INTO issues VALUES (?, ?, ?, ?)').run(issue.id, issue.projectId, proposal.id, JSON.stringify(issue));
      this.db.prepare('UPDATE projects SET plan_version = plan_version + 1 WHERE id = ?').run(issue.projectId);
    }
  }
  appendEntry(entry: BoardEntry): void {
    this.db.prepare('INSERT INTO records VALUES (?, ?, ?, ?)').run(entry.id, entry.projectId, entry.issueId, JSON.stringify(entry));
  }
  saveChange(change: Change): void {
    this.db.prepare('INSERT INTO changes VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
      .run(change.id, change.projectId, JSON.stringify(change));
  }
  finishChange(change: Change, issue: Issue | null, intent: Board['intent'] | null): void {
    this.saveChange(change);
    if (issue) this.db.prepare('UPDATE issues SET data = ? WHERE id = ?').run(JSON.stringify(issue), issue.id);
    if (intent) this.db.prepare('UPDATE intents SET data = ? WHERE project_id = ?').run(JSON.stringify(intent), intent.projectId);
    if (issue || intent) this.db.prepare('UPDATE projects SET plan_version = plan_version + 1 WHERE id = ?').run(change.projectId);
  }
  addScope(scope: ToolScope, tokenHash: string): void {
    this.db.prepare('INSERT INTO scopes VALUES (?, ?, ?, ?)').run(scope.id, scope.projectId, tokenHash, JSON.stringify(scope));
  }
  scopeForHash(hash: string): ToolScope | undefined {
    const scope = decode<ToolScope>(this.db.prepare('SELECT data FROM scopes WHERE token_hash = ?').get(hash));
    return scope?.revokedAt ? undefined : scope;
  }
  revokeScope(id: string, at: string): void {
    const scope = decode<ToolScope>(this.db.prepare('SELECT data FROM scopes WHERE id = ?').get(id));
    if (scope) this.db.prepare('UPDATE scopes SET data = ? WHERE id = ?').run(JSON.stringify({ ...scope, revokedAt: at }), id);
  }
  replay(actor: string, key: string): Replay | undefined {
    return decode<Replay>(this.db.prepare('SELECT data FROM requests WHERE actor = ? AND request_key = ?').get(actor, key));
  }
  remember(actor: string, key: string, replay: Replay): void {
    this.db.prepare('INSERT INTO requests VALUES (?, ?, ?)').run(actor, key, JSON.stringify(replay));
  }
  getMetadata(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }
  setMetadata(key: string, value: string): void {
    this.db.prepare('INSERT INTO metadata VALUES (?, ?)').run(key, value);
  }
}
