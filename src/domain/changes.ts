import { fail, object, parseProposal, textField, versionField } from './board.js';
import type { Intent, IssueContent, Decision, ProposalStatus } from './board.js';

export type IntentContent = Pick<Intent, 'title' | 'problem' | 'outcome' | 'verification'>;
export interface ChangeScope { intent: boolean; issueIds: string[] }
interface ChangeBase {
  targetId: string; baseVersion: number; intentVersion: number; planVersion: number;
  reason: string; impact: string;
}
export type NewChange = ChangeBase & (
  { targetKind: 'intent'; after: IntentContent } | { targetKind: 'issue'; after: IssueContent }
);
export interface IntentAuthorization {
  id: string; summary: string; sourceRef: string; createdAt: string; revokedAt: string | null;
}
export type Change = NewChange & {
  id: string; projectId: string; intentId: string; before: IntentContent | IssueContent;
  status: ProposalStatus; version: number; createdBy: string; sourceLabel: string; createdAt: string;
  authorizations: IntentAuthorization[]; decision: Decision | null;
};
export function parseIntentContent(value: unknown): IntentContent {
  const r = object(value, ['title', 'problem', 'outcome', 'verification']);
  return { title: textField(r, 'title', 200), problem: textField(r, 'problem'),
    outcome: textField(r, 'outcome'), verification: textField(r, 'verification') };
}
export function issueContent(value: IssueContent): IssueContent {
  return { title: value.title, problem: value.problem, scope: value.scope, solution: value.solution,
    benefits: value.benefits, risks: value.risks, verification: value.verification, parentIssueId: value.parentIssueId };
}
export function parseChange(value: unknown): NewChange {
  const r = object(value, ['targetKind', 'targetId', 'baseVersion', 'intentVersion', 'planVersion', 'reason', 'impact', 'after']);
  const base = { targetId: textField(r, 'targetId', 100), baseVersion: versionField(r, 'baseVersion'),
    intentVersion: versionField(r, 'intentVersion'), planVersion: versionField(r, 'planVersion'),
    reason: textField(r, 'reason'), impact: textField(r, 'impact') };
  if (r['targetKind'] === 'intent') return { ...base, targetKind: 'intent', after: parseIntentContent(r['after']) };
  if (r['targetKind'] === 'issue') {
    const after = object(r['after'], ['title', 'problem', 'scope', 'solution', 'benefits', 'risks', 'verification', 'parentIssueId']);
    return { ...base, targetKind: 'issue', after: issueContent(parseProposal({ ...after, intentVersion: base.intentVersion, reason: base.reason })) };
  }
  return fail(400, 'INVALID_INPUT', '变更对象只能是 intent 或 issue。');
}
export function parseChangeScope(value: unknown): ChangeScope | undefined {
  if (value === undefined || value === null) return undefined;
  const r = object(value, ['intent', 'issueIds']);
  const ids = r['issueIds'];
  if (typeof r['intent'] !== 'boolean' || !Array.isArray(ids) || ids.length > 100 ||
      !ids.every(id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id)) || (!r['intent'] && !ids.length)) {
    return fail(400, 'INVALID_CHANGE_SCOPE', '请选择允许提交变更建议的具体对象。');
  }
  return { intent: r['intent'], issueIds: [...new Set(ids as string[])] };
}
