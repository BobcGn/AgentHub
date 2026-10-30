import type { Board } from './board.js';
import type { RecordSet } from './record-contract.js';

export const editableCollections = ['requirements', 'units', 'stories', 'boltPlans', 'contextItems', 'sources', 'evidence', 'verifications'] as const;
export type EditableCollection = typeof editableCollections[number];
export interface RecordAudit {
  id: string; action: string; actor: 'human'; at: string; reason: string;
  requestId: string; requestHash: string; target: string; resultRevision?: number;
  before: unknown; after: unknown; warnings: string[];
  effects: Array<{ target: string; before: unknown; after: unknown }>;
}
export interface MigrationOrigin {
  legacyProjectId: string; fingerprint: string;
  mappings: Array<{ legacyIssueId: string; requirementId: string; parentIssueId: string | null; sourceProposalId: string }>;
}
export interface RecordProject {
  id: string; name: string; createdAt: string; revision: number;
  identifierPrefix?: string; nextRequirementNumber?: number;
  records: RecordSet; audit: RecordAudit[]; migration: MigrationOrigin | null;
}
export interface RecordProjectRepository {
  readonly storagePath?: string;
  list(): RecordProject[];
  get(id: string): RecordProject | undefined;
  create(project: RecordProject): void;
  replace(project: RecordProject, expectedRevision: number): void;
}
export interface MigrationPreview { sourceProjectId: string; fingerprint: string; records: RecordSet; warnings: string[] }
export interface RecordEditPreview { before: unknown; after: unknown; warnings: string[]; report: import('./record-contract.js').ContractReport; effects: RecordAudit['effects'] }
export function legacyMigration(board: Board): { records: RecordSet; mappings: MigrationOrigin['mappings']; warnings: string[] } {
  const records: RecordSet = {
    schemaVersion: '1.0.0',
    intent: { id: board.intent.id, title: board.intent.title, problem: board.intent.problem,
      expectedOutcome: board.intent.outcome,
      scope: { includes: ['待核对：旧记录未单列范围，不据此扩大授权。'], excludes: [] },
      constraints: [], confirmation: { state: 'proposed', sourceRefs: [] }, sourceRefs: [] },
    requirements: [], units: [], stories: [], boltPlans: [], sources: [],
    contextItems: [], evidence: [], verifications: []
  };
  function source(id: string, locator: string, excerpt: string | null): string {
    records.sources.push({ id, kind: 'reference', locator, excerpt: excerpt?.slice(0, 600) ?? null });
    return id;
  }
  const intentSource = source('legacy-intent:' + board.intent.id, 'legacy:project/' + board.project.id + '/intent', board.intent.problem);
  records.intent.sourceRefs = [intentSource];
  records.contextItems.push({ id: 'legacy-intent-check:' + board.intent.id, requirementId: null, category: 'constraint',
    content: board.intent.verification, epistemicStatus: 'proposed', sourceRefs: [intentSource], evidenceRefs: [] });
  const mappings: MigrationOrigin['mappings'] = [];
  for (const issue of board.issues) {
    const id = source('legacy-issue:' + issue.id, 'legacy:project/' + board.project.id + '/issue/' + issue.id, issue.scope);
    const proposal = board.proposals.find(item => item.id === issue.sourceProposalId);
    const currentChange = board.changes.find(item => item.targetKind === 'issue' && item.targetId === issue.id && item.status === 'approved' && item.baseVersion + 1 === issue.version);
    records.requirements.push({ id: issue.id, kind: 'requirement', intentId: board.intent.id, title: issue.title,
      problem: issue.problem, expectedOutcome: '待核对：旧 Issue 未单列预期结果。',
      scope: { includes: [issue.scope], excludes: [] }, rationale: currentChange?.reason ?? proposal?.reason ?? issue.solution,
      expectedImpact: issue.benefits, constraints: [], acceptanceCriteria: [{
        id: 'legacy-check:' + issue.id, description: issue.verification, verification: issue.verification
      }], sourceRefs: [id], status: 'draft', result: null, acceptance: null, pullRequest: null });
    mappings.push({ legacyIssueId: issue.id, requirementId: issue.id, parentIssueId: issue.parentIssueId, sourceProposalId: issue.sourceProposalId });
    const fields = [['solution', issue.solution], ['benefits', issue.benefits], ['risks', issue.risks]] as const;
    for (const [field, content] of fields) {
      const ref = source('legacy-' + field + ':' + issue.id, 'legacy:issue/' + issue.id + '/' + field, content);
      records.contextItems.push({ id: 'legacy-context-' + field + ':' + issue.id, requirementId: issue.id,
        category: 'fact', content, epistemicStatus: 'proposed', sourceRefs: [ref], evidenceRefs: [] });
    }
    if (issue.parentIssueId) records.contextItems.push({ id: 'legacy-parent:' + issue.id, requirementId: issue.id,
      category: 'fact', content: '旧父 Issue：' + issue.parentIssueId + '。仅保留关系原文，不自动推断 Unit / Story。',
      epistemicStatus: 'proposed', sourceRefs: [id], evidenceRefs: [] });
  }
  for (const decision of board.decisions) {
    const issue = board.issues.find(item => item.sourceProposalId === decision.proposalId);
    const ref = source('legacy-decision:' + decision.id, 'legacy:project/' + board.project.id + '/decision/' + decision.id + '?action=' + decision.action,
      decision.reason ?? '旧决定未补充说明');
    records.contextItems.push({ id: 'legacy-decision-context:' + decision.id, requirementId: issue?.id ?? null,
      category: 'decision', content: decision.reason ?? ('旧决定：' + decision.action + '，未补充说明。'),
      epistemicStatus: 'proposed', sourceRefs: [ref], evidenceRefs: [] });
  }
  for (const change of board.changes) {
    const requirementId = change.targetKind === 'issue' && records.requirements.some(item => item.id === change.targetId) ? change.targetId : null;
    const ref = source('legacy-change:' + change.id, 'legacy:project/' + board.project.id + '/change/' + change.id + '?status=' + change.status, change.reason);
    for (const [field, content] of [['reason', change.reason], ['impact', change.impact]] as const) {
      records.contextItems.push({ id: 'legacy-change-' + field + ':' + change.id, requirementId, category: 'decision',
        content, epistemicStatus: 'proposed', sourceRefs: [ref], evidenceRefs: [] });
    }
    if (change.decision) {
      const decision = change.decision;
      const decisionRef = source('legacy-change-decision:' + decision.id, 'legacy:project/' + board.project.id + '/change/' + change.id + '/decision/' + decision.id + '?action=' + decision.action,
        decision.reason ?? '旧修订决定未补充说明');
      records.contextItems.push({ id: 'legacy-change-decision-context:' + decision.id, requirementId, category: 'decision',
        content: decision.reason ?? ('旧修订决定：' + decision.action + '，未补充说明。'), epistemicStatus: 'proposed', sourceRefs: [decisionRef], evidenceRefs: [] });
    }
  }
  for (const entry of board.records) {
    const ref = source('legacy-entry:' + entry.id, 'legacy:project/' + board.project.id + '/record/' + entry.id, entry.body);
    records.contextItems.push({ id: 'legacy-entry-context:' + entry.id,
      requirementId: entry.issueId && records.requirements.some(item => item.id === entry.issueId) ? entry.issueId : null,
      category: 'fact', content: entry.body, epistemicStatus: 'proposed', sourceRefs: [ref], evidenceRefs: [] });
  }
  return { records, mappings, warnings: [
    '每个旧正式 Issue 转为一个 Requirement 草案，未自动推断 Unit / Story / Bolt Plan。',
    '父子关系、方案、批准与普通记录以待核对内容及来源保留，未转换为新模型的接受或验证通过。',
    '旧 Intent 缺少独立范围字段，新表示暂为待确认；旧库中的原意图和历史不变。',
    '导入后使用新的项目记录；旧记录保留，只读访问，不再允许旧入口继续修改同一项目。'
  ] };
}
