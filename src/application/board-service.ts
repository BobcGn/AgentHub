import { randomUUID } from 'node:crypto';
import { fail, parseDecision, parseEntry, parseRecordScope, parseProject, parseProposal, requireHuman, requireScope } from '../domain/board.js';
import type { Board, BoardEntry, Decision, Issue, Principal, Proposal, ToolScope } from '../domain/board.js';

import { issueContent, parseChange, parseChangeScope, parseIntentContent } from '../domain/changes.js';
import type { Change } from '../domain/changes.js';
import { object, textField, versionField } from '../domain/board.js';

export interface Replay { payload: string; response: unknown }
export interface BoardRepository {
  transaction<T>(work: () => T): T;
  listProjects(): Board[];
  getBoard(projectId: string): Board | undefined;
  createBoard(board: Board): void;
  saveProposal(proposal: Proposal): void;
  finishProposal(proposal: Proposal, decision: Decision, issue: Issue | null): void;
  addScope(scope: ToolScope, tokenHash: string): void;
  appendEntry(entry: BoardEntry): void;
  saveChange(change: Change): void;
  finishChange(change: Change, issue: Issue | null, intent: Board['intent'] | null): void;
  revokeScope(id: string, at: string): void;
  replay(actor: string, key: string): Replay | undefined;
  remember(actor: string, key: string, replay: Replay): void;
}
export interface ToolCredentials { create(): { token: string; hash: string } }
export class BoardService {
  private readonly repository: BoardRepository;
  private readonly credentials: ToolCredentials;
  private readonly isLegacyReadOnly: (projectId: string) => boolean;
  constructor(repository: BoardRepository, credentials: ToolCredentials, isLegacyReadOnly: (projectId: string) => boolean = () => false) {
    this.repository = repository;
    this.credentials = credentials;
    this.isLegacyReadOnly = isLegacyReadOnly;
  }

  private requireWritable(projectId: string): void {
    if (this.isLegacyReadOnly(projectId)) fail(409, 'PROJECT_MIGRATED', '该项目已迁移到 JSON 看板，旧记录只读。');
  }

  overview(principal: Principal): Board[] {
    const boards = this.repository.listProjects();
    if (principal.kind === 'human') return boards;
    return boards.filter(b => !principal.scope.revokedAt && b.project.id === principal.scope.projectId && b.intent.id === principal.scope.intentId).map(b => ({ ...b, scopes: [] }));
  }

  private board(id: string): Board {
    return this.repository.getBoard(id) ?? fail(404, 'NOT_FOUND', '项目不存在。');
  }

  createProject(principal: Principal, input: unknown, key: string): Board {
    requireHuman(principal);
    const data = parseProject(input);
    return this.once('human:create-project', key, data, () => {
      const projectId = randomUUID();
      const board: Board = { project: { id: projectId, name: data.name, createdAt: new Date().toISOString() },
        intent: { id: randomUUID(), projectId, title: data.title, problem: data.problem,
          outcome: data.outcome, verification: data.verification, version: 1 },
        planVersion: 1, issues: [], proposals: [], decisions: [], scopes: [], records: [], changes: [] };
      this.repository.createBoard(board);
      return board;
    });
  }

  issueToken(principal: Principal, projectId: string, label: string, recordScopeInput?: unknown, changeScopeInput?: unknown): { token: string; scope: ToolScope } {
    requireHuman(principal);
    this.requireWritable(projectId);
    const board = this.board(projectId);
    const recordScope = parseRecordScope(recordScopeInput);
    if (recordScope?.issueIds.some(id => !board.issues.some(issue => issue.id === id))) {
      fail(400, 'INVALID_RECORD_SCOPE', '工具范围只能包含当前项目已经存在的正式 Issue。');
    }
    const changeScope = parseChangeScope(changeScopeInput);
    if (changeScope?.issueIds.some(id => !board.issues.some(issue => issue.id === id))) {
      fail(400, 'INVALID_CHANGE_SCOPE', '变更建议范围只能包含当前项目的正式 Issue。');
    }
    const credential = this.credentials.create();
    const scope: ToolScope = { id: randomUUID(), label, projectId, intentId: board.intent.id,
      operations: ['board:read', 'issue:propose', ...(recordScope ? ['record:append' as const] : []), ...(changeScope ? ['change:propose' as const] : [])],
      ...(recordScope ? { recordScope } : {}), ...(changeScope ? { changeScope } : {}), createdAt: new Date().toISOString(), revokedAt: null };
    this.repository.addScope(scope, credential.hash);
    return { token: credential.token, scope };
  }

  revokeToken(principal: Principal, projectId: string, id: string): void {
    requireHuman(principal);
    if (!this.board(projectId).scopes.some(scope => scope.id === id)) fail(404, 'NOT_FOUND', '工具范围不存在。');
    this.repository.revokeScope(id, new Date().toISOString());
  }

  propose(principal: Principal, projectId: string, input: unknown, key: string): Proposal {
    const data = parseProposal(input);
    const board = this.board(projectId);
    requireScope(principal, projectId, board.intent.id);
    if (principal.kind !== 'tool') return fail(403, 'TOOL_REQUIRED', '请通过已划定范围的工具凭据提交建议。');
    this.requireWritable(projectId);
    return this.once('tool:' + principal.scope.id, key, { projectId, data }, () => {
      const current = this.board(projectId);
      if (data.intentVersion !== current.intent.version) fail(409, 'STALE_INTENT', 'Intent 版本已变化，请重新核对。');
      if (data.parentIssueId && !current.issues.some(i => i.id === data.parentIssueId)) {
        fail(400, 'INVALID_PARENT', '父 Issue 必须属于当前 Intent 的正式清单。');
      }
      const proposal: Proposal = { ...data, id: randomUUID(), projectId, intentId: current.intent.id,
        status: 'pending', version: 1, createdBy: principal.scope.id, createdAt: new Date().toISOString() };
      this.repository.saveProposal(proposal);
      return proposal;
    });
  }

  decide(principal: Principal, projectId: string, proposalId: string, input: unknown, key: string):
    { proposal: Proposal; decision: Decision; issue: Issue | null } {
    requireHuman(principal);
    this.requireWritable(projectId);
    const data = parseDecision(input);
    return this.once('human:decide', key, { projectId, proposalId, data }, () => {
      const board = this.board(projectId);
      const proposal = board.proposals.find(p => p.id === proposalId) ?? fail(404, 'NOT_FOUND', '提案不存在。');
      if (proposal.status !== 'pending' || proposal.version !== data.proposalVersion ||
          board.intent.version !== data.intentVersion ||
          board.planVersion !== data.planVersion) {
        fail(409, 'STALE_REVIEW', '被审提案或正式计划已变化，请刷新后重新核对。');
      }
      if (data.action === 'approve' && proposal.intentVersion !== board.intent.version) {
        fail(409, 'STALE_REVIEW', '此提案基于旧 Intent，不能批准；请退回并基于最新意图重新提交。');
      }
      const now = new Date().toISOString();
      const decision: Decision = { id: randomUUID(), proposalId, proposalVersion: proposal.version,
        action: data.action, reason: data.reason, createdAt: now, actor: 'human' };
      const issue: Issue | null = data.action === 'approve' ? {
        id: randomUUID(), projectId, intentId: proposal.intentId, sourceProposalId: proposal.id,
        createdAt: now, version: 1, intentVersion: board.intent.version, title: proposal.title, problem: proposal.problem, scope: proposal.scope,
        solution: proposal.solution, benefits: proposal.benefits, risks: proposal.risks,
        verification: proposal.verification, parentIssueId: proposal.parentIssueId } : null;
      const decided: Proposal = { ...proposal, version: proposal.version + 1,
        status: data.action === 'approve' ? 'approved' : data.action === 'reject' ? 'rejected' : 'returned' };
      this.repository.finishProposal(decided, decision, issue);
      return { proposal: decided, decision, issue };
    });
  }


  appendEntry(principal: Principal, projectId: string, input: unknown, key: string): BoardEntry {
    const data = parseEntry(input);
    const board = this.board(projectId);
    if (principal.kind === 'tool') {
      requireScope(principal, projectId, board.intent.id, 'record:append');
      const boundary = principal.scope.recordScope;
      if (!boundary || !boundary.kinds.includes(data.kind) ||
          (data.issueId === null ? !boundary.intent : !boundary.issueIds.includes(data.issueId))) {
        fail(403, 'OUT_OF_SCOPE', '该对象或记录类型不在工具的追加范围内。');
      }
    }
    this.requireWritable(projectId);
    const actor = principal.kind === 'human' ? 'human:record' : 'tool-record:' + principal.scope.id;
    return this.once(actor, key, { projectId, data }, () => {
      const current = this.board(projectId);
      if (current.intent.version !== data.intentVersion) fail(409, 'STALE_INTENT', 'Intent 版本已变化，请重新核对记录关联。');
      if (data.issueId !== null && !current.issues.some(issue => issue.id === data.issueId)) {
        fail(400, 'INVALID_RECORD_TARGET', '记录只能关联当前 Intent 或其正式 Issue。');
      }
      const entry: BoardEntry = { ...data, id: randomUUID(), projectId, intentId: current.intent.id,
        createdAt: new Date().toISOString(), source: principal.kind === 'human'
          ? { kind: 'human', label: '人端' }
          : { kind: 'tool', label: principal.scope.label, scopeId: principal.scope.id } };
      this.repository.appendEntry(entry);
      return entry;
    });
  }


  proposeChange(principal: Principal, projectId: string, input: unknown, key: string): Change {
    const data = parseChange(input);
    const board = this.board(projectId);
    requireScope(principal, projectId, board.intent.id, 'change:propose');
    if (principal.kind !== 'tool') return fail(403, 'TOOL_REQUIRED', '请通过明确范围的工具凭据提交变更建议。');
    this.requireWritable(projectId);
    const scope = principal.scope.changeScope;
    if (!scope || (data.targetKind === 'intent' ? !scope.intent : !scope.issueIds.includes(data.targetId))) {
      fail(403, 'OUT_OF_SCOPE', '该对象不在工具的变更建议范围内。');
    }
    return this.once('tool-change:' + principal.scope.id, key, { projectId, data }, () => {
      const current = this.board(projectId);
      const issue = current.issues.find(item => item.id === data.targetId);
      if (data.targetKind === 'intent' ? data.targetId !== current.intent.id : !issue) {
        fail(400, 'INVALID_CHANGE_TARGET', '变更对象必须属于当前 Intent。');
      }
      if (data.intentVersion !== current.intent.version || data.planVersion !== current.planVersion ||
          data.baseVersion !== (data.targetKind === 'intent' ? current.intent.version : issue?.version)) {
        fail(409, 'STALE_CHANGE', '变更基准已过期，请重新读取并提交新建议。');
      }
      const before = data.targetKind === 'intent' ? {
        title: current.intent.title, problem: current.intent.problem,
        outcome: current.intent.outcome, verification: current.intent.verification
      } : issueContent(issue ?? fail(400, 'INVALID_CHANGE_TARGET', 'Issue 不存在。'));
      if (data.targetKind === 'issue') this.checkParent(current, data.targetId, data.after.parentIssueId);
      if (JSON.stringify(before) === JSON.stringify(data.after) &&
          !(data.targetKind === 'issue' && issue?.intentVersion !== current.intent.version)) {
        fail(400, 'NO_CHANGE', '建议未改变内容；如只补充过程信息，请使用普通记录。');
      }
      const change: Change = { ...data, id: randomUUID(), projectId, intentId: current.intent.id, before,
        status: 'pending', version: 1, createdBy: principal.scope.id, sourceLabel: principal.scope.label,
        createdAt: new Date().toISOString(), authorizations: [], decision: null };
      this.repository.saveChange(change);
      return change;
    });
  }

  private checkParent(board: Board, issueId: string, parentId: string | null): void {
    const seen = new Set([issueId]);
    let next = parentId;
    while (next !== null) {
      if (seen.has(next)) fail(400, 'INVALID_PARENT', '父子关系不能形成循环。');
      seen.add(next);
      const parent = board.issues.find(issue => issue.id === next);
      if (!parent) fail(400, 'INVALID_PARENT', '父 Issue 必须属于当前正式清单。');
      next = parent.parentIssueId;
    }
  }

  private pendingChange(board: Board, id: string, version: number): Change {
    const change = board.changes.find(item => item.id === id) ?? fail(404, 'NOT_FOUND', '变更建议不存在。');
    if (change.status !== 'pending' || change.version !== version) fail(409, 'STALE_REVIEW', '变更或授权状态已变化，请重新核对。');
    return change;
  }
  private currentChange(board: Board, change: Change): void {
    const version = change.targetKind === 'intent' ? board.intent.version : board.issues.find(issue => issue.id === change.targetId)?.version;
    if (board.intent.version !== change.intentVersion || board.planVersion !== change.planVersion || version !== change.baseVersion) {
      fail(409, 'STALE_CHANGE', '此建议的基准已失效；原文保留，请基于最新内容另提新建议。');
    }
  }

  authorizeIntentChange(principal: Principal, projectId: string, id: string, input: unknown, key: string): Change {
    requireHuman(principal);
    this.requireWritable(projectId);
    const r = object(input, ['proposalVersion', 'intentVersion', 'planVersion', 'summary', 'sourceRef', 'confirmed']);
    const version = versionField(r, 'proposalVersion');
    const intentVersion = versionField(r, 'intentVersion');
    const planVersion = versionField(r, 'planVersion');
    const summary = textField(r, 'summary');
    const sourceRef = textField(r, 'sourceRef', 2000);
    if (r['confirmed'] !== true) fail(400, 'EXPLICIT_AUTHORIZATION_REQUIRED', '须由本人确认已商讨并明确授权这份 Intent 修订。');
    const data = { version, intentVersion, planVersion, summary, sourceRef };
    return this.once('human:authorize-intent', key, { projectId, id, data }, () => {
      const board = this.board(projectId);
      const change = this.pendingChange(board, id, version);
      this.currentChange(board, change);
      if (change.targetKind !== 'intent') fail(400, 'INVALID_CHANGE_TARGET', '此入口仅用于 Intent 商讨授权。');
      if (board.intent.version !== intentVersion || board.planVersion !== planVersion) fail(409, 'STALE_REVIEW', '所审基准已改变。');
      if (change.authorizations.some(item => item.revokedAt === null)) fail(409, 'ALREADY_AUTHORIZED', '本建议已有有效授权。');
      const updated = { ...change, version: change.version + 1, authorizations: [...change.authorizations, {
        id: randomUUID(), summary, sourceRef, createdAt: new Date().toISOString(), revokedAt: null
      }] };
      this.repository.saveChange(updated);
      return updated;
    });
  }

  revokeIntentAuthorization(principal: Principal, projectId: string, id: string, input: unknown, key: string): Change {
    requireHuman(principal);
    this.requireWritable(projectId);
    const r = object(input, ['proposalVersion']);
    const version = versionField(r, 'proposalVersion');
    return this.once('human:revoke-intent', key, { projectId, id, version }, () => {
      const change = this.pendingChange(this.board(projectId), id, version);
      if (!change.authorizations.some(item => item.revokedAt === null)) fail(409, 'NOT_AUTHORIZED', '没有有效的商讨授权。');
      const updated = { ...change, version: change.version + 1,
        authorizations: change.authorizations.map(item => item.revokedAt ? item : { ...item, revokedAt: new Date().toISOString() }) };
      this.repository.saveChange(updated);
      return updated;
    });
  }

  decideChange(principal: Principal, projectId: string, id: string, input: unknown, key: string): Change {
    requireHuman(principal);
    this.requireWritable(projectId);
    const data = parseDecision(input);
    return this.once('human:decide-change', key, { projectId, id, data }, () => {
      const board = this.board(projectId);
      const change = this.pendingChange(board, id, data.proposalVersion);
      if (board.intent.version !== data.intentVersion || board.planVersion !== data.planVersion) fail(409, 'STALE_REVIEW', '所审 Intent 或计划版本已变化。');
      let issue: Issue | null = null;
      let intent: Board['intent'] | null = null;
      if (data.action === 'approve') {
        this.currentChange(board, change);
        if (change.targetKind === 'intent') {
          if (!change.authorizations.some(item => item.revokedAt === null)) {
            fail(403, 'INTENT_AUTHORIZATION_REQUIRED', '须先由本人登记商讨结论并明确授权本修订，再审批应用。');
          }
          intent = { ...board.intent, ...parseIntentContent(change.after), version: board.intent.version + 1 };
        } else {
          const previous = board.issues.find(item => item.id === change.targetId) ?? fail(400, 'INVALID_CHANGE_TARGET', 'Issue 不存在。');
          this.checkParent(board, change.targetId, change.after.parentIssueId);
          issue = { ...previous, ...change.after, version: previous.version + 1, intentVersion: board.intent.version };
        }
      }
      const updated: Change = { ...change, version: change.version + 1,
        status: data.action === 'approve' ? 'approved' : data.action === 'return' ? 'returned' : 'rejected',
        decision: { id: randomUUID(), proposalId: change.id, proposalVersion: change.version, action: data.action,
          reason: data.reason, createdAt: new Date().toISOString(), actor: 'human' } };
      this.repository.finishChange(updated, issue, intent);
      return updated;
    });
  }

  private once<T>(actor: string, key: string, input: unknown, execute: () => T): T {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) fail(400, 'INVALID_REQUEST_ID', 'Idempotency-Key 需要 8–100 位字母、数字、下划线或短横线。');
    return this.repository.transaction(() => {
      const payload = JSON.stringify(input);
      const previous = this.repository.replay(actor, key);
      if (previous) {
        if (previous.payload !== payload) fail(409, 'REQUEST_REUSED', '同一请求编号不能用于不同内容。');
        return previous.response as T;
      }
      const response = execute();
      this.repository.remember(actor, key, { payload, response });
      return response;
    });
  }
}
