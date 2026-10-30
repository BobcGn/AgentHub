import type { Change, ChangeScope } from './changes.js';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'returned';
export type DecisionAction = 'approve' | 'reject' | 'return';

export interface Project { id: string; name: string; createdAt: string }
export interface Intent {
  id: string; projectId: string; title: string; problem: string;
  outcome: string; verification: string; version: number;
}
export interface IssueContent {
  title: string; problem: string; scope: string; solution: string;
  benefits: string; risks: string; verification: string; parentIssueId: string | null;
}
export interface Issue extends IssueContent {
  id: string; projectId: string; intentId: string; sourceProposalId: string; createdAt: string;
  version: number; intentVersion: number;
}
export interface Proposal extends IssueContent {
  id: string; projectId: string; intentId: string; intentVersion: number;
  reason: string; status: ProposalStatus; version: number;
  createdBy: string; createdAt: string;
}
export interface Decision {
  id: string; proposalId: string; proposalVersion: number;
  action: DecisionAction; reason: string | null; createdAt: string; actor: 'human';
}
export interface ToolScope {
  id: string; label: string; projectId: string; intentId: string;
  operations: readonly ToolOperation[];
  recordScope?: RecordScope;
  changeScope?: ChangeScope;
  createdAt: string; revokedAt: string | null;
}
export interface Board {
  project: Project; intent: Intent; planVersion: number;
  issues: Issue[]; proposals: Proposal[]; decisions: Decision[]; scopes: ToolScope[]; records: BoardEntry[]; changes: Change[];
}
export type Principal = { kind: 'human' } | { kind: 'tool'; scope: ToolScope };
export interface NewProject { name: string; title: string; problem: string; outcome: string; verification: string }
export interface NewProposal extends IssueContent { intentVersion: number; reason: string }
export interface Decide {
  action: DecisionAction; reason: string | null; proposalVersion: number;
  intentVersion: number; planVersion: number;
}

export class HubError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'HubError';
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new HubError(status, code, message);
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(400, 'INVALID_INPUT', '请求必须是 JSON 对象。');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key))) {
    return fail(400, 'INVALID_INPUT', '请求包含不允许的字段。');
  }
  return record;
}
export function textField(record: Record<string, unknown>, key: string, max = 4000): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    return fail(400, 'INVALID_INPUT', key + ' 必须是 1–' + max + ' 字符的非空文本。');
  }
  return value.trim();
}
export function versionField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return fail(400, 'INVALID_INPUT', key + ' 必须是正整数。');
  }
  return value;
}
export function parseProject(value: unknown): NewProject {
  const r = object(value, ['name', 'title', 'problem', 'outcome', 'verification']);
  return { name: textField(r, 'name', 120), title: textField(r, 'title', 200),
    problem: textField(r, 'problem'), outcome: textField(r, 'outcome'),
    verification: textField(r, 'verification') };
}
export function parseProposal(value: unknown): NewProposal {
  const r = object(value, ['title', 'problem', 'scope', 'solution', 'benefits',
    'risks', 'verification', 'parentIssueId', 'intentVersion', 'reason']);
  const parentIssueId = r['parentIssueId'] === null ? null : textField(r, 'parentIssueId', 100);
  return { title: textField(r, 'title', 200), problem: textField(r, 'problem'),
    scope: textField(r, 'scope'), solution: textField(r, 'solution'),
    benefits: textField(r, 'benefits'), risks: textField(r, 'risks'),
    verification: textField(r, 'verification'), parentIssueId,
    intentVersion: versionField(r, 'intentVersion'), reason: textField(r, 'reason') };
}
export function parseDecision(value: unknown): Decide {
  const r = object(value, ['action', 'reason', 'proposalVersion', 'intentVersion', 'planVersion']);
  const action = r['action'];
  if (action !== 'approve' && action !== 'reject' && action !== 'return') {
    return fail(400, 'INVALID_INPUT', '未知决定类型。');
  }
  const rawReason = r['reason'];
  let reason: string | null = null;
  if (rawReason !== undefined && rawReason !== null) {
    if (typeof rawReason !== 'string' || rawReason.length > 4000) {
      fail(400, 'INVALID_INPUT', '决定说明必须是至多 4000 字符的文本。');
    }
    reason = rawReason.trim() || null;
  }
  if (action !== 'approve' && reason === null) {
    fail(400, 'DECISION_REASON_REQUIRED', action === 'return'
      ? '退回补充需要填写理由，说明需要调整或补充的内容。'
      : '拒绝需要填写理由，说明不纳入计划的原因。');
  }
  return { action, reason, proposalVersion: versionField(r, 'proposalVersion'),
    intentVersion: versionField(r, 'intentVersion'), planVersion: versionField(r, 'planVersion') };
}
export function requireHuman(principal: Principal): void {
  if (principal.kind !== 'human') fail(403, 'HUMAN_REQUIRED', '此操作需要人端会话，工具凭据不能批准。');
}
export function requireScope(principal: Principal, projectId: string, intentId: string, operation: ToolOperation = 'issue:propose'): void {
  if (principal.kind !== 'tool' || principal.scope.revokedAt ||
      principal.scope.projectId !== projectId || principal.scope.intentId !== intentId || !principal.scope.operations.includes(operation)) {
    fail(403, 'OUT_OF_SCOPE', '请求超出工具被授予的项目 / Intent 范围。');
  }
}

export const recordKinds = ['discussion', 'note', 'agent_report'] as const;
export type RecordKind = typeof recordKinds[number];
export type ToolOperation = 'board:read' | 'issue:propose' | 'record:append' | 'change:propose';
export interface RecordScope { intent: boolean; issueIds: string[]; kinds: RecordKind[] }
export interface NewEntry {
  kind: RecordKind; body: string; issueId: string | null;
  intentVersion: number; sourceRef: string | null;
}
export interface BoardEntry extends NewEntry {
  id: string; projectId: string; intentId: string; createdAt: string;
  source: { kind: 'human'; label: string } | { kind: 'tool'; label: string; scopeId: string };
}
export function parseEntry(input: unknown): NewEntry {
  const r = object(input, ['kind', 'body', 'issueId', 'intentVersion', 'sourceRef']);
  const kind = r['kind'];
  if (typeof kind !== 'string' || !recordKinds.includes(kind as RecordKind)) {
    return fail(400, 'INVALID_INPUT', '记录类型只能是 discussion、note 或 agent_report。');
  }
  const sourceRef = r['sourceRef'];
  if (sourceRef !== undefined && sourceRef !== null && (typeof sourceRef !== 'string' || sourceRef.length > 2000)) {
    return fail(400, 'INVALID_INPUT', '外部来源必须是至多 2000 字符的文本。');
  }
  return { kind: kind as RecordKind, body: textField(r, 'body'),
    issueId: r['issueId'] === null ? null : textField(r, 'issueId', 100),
    intentVersion: versionField(r, 'intentVersion'),
    sourceRef: typeof sourceRef === 'string' ? sourceRef.trim() || null : null };
}
export function parseRecordScope(input: unknown): RecordScope | undefined {
  if (input === undefined || input === null) return undefined;
  const r = object(input, ['intent', 'issueIds', 'kinds']);
  const issueIds = r['issueIds'];
  const kinds = r['kinds'];
  if (typeof r['intent'] !== 'boolean' || !Array.isArray(issueIds) || issueIds.length > 100 ||
      !issueIds.every(id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id)) ||
      !Array.isArray(kinds) || !kinds.length || kinds.length > recordKinds.length ||
      !kinds.every(kind => typeof kind === 'string' && recordKinds.includes(kind as RecordKind)) ||
      (!r['intent'] && !issueIds.length)) {
    return fail(400, 'INVALID_RECORD_SCOPE', '请选择至少一个记录对象和一种允许的记录类型。');
  }
  return { intent: r['intent'], issueIds: [...new Set(issueIds as string[])], kinds: [...new Set(kinds as RecordKind[])] };
}
