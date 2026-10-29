import type { RecordSet, RecordStatus, WorkContent, WorkRecord } from '../../domain/record-contract.js';
import type { EditableCollection, RecordProject } from '../../domain/record-project.js';

export const recordColumns: Array<{ status: RecordStatus; label: string }> = [
  { status: 'draft', label: '待规划' }, { status: 'planned', label: '待开始' },
  { status: 'in_progress', label: '进行中' }, { status: 'review', label: '待核对' }, { status: 'done', label: '已记录完成' }
];
export const collectionLabels: Record<EditableCollection, string> = {
  requirements: 'Requirement', units: 'Unit', stories: 'Story', boltPlans: 'Bolt Plan',
  contextItems: '长期上下文', sources: '出处', evidence: '验收证据', verifications: '条件核查'
};
export const recordWorks = (data: RecordSet): WorkRecord[] => [...data.requirements, ...data.units, ...data.stories, ...data.boltPlans];
export const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';
export const listValue = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
export const lines = (value: string): string[] => value.split('\n');
export function makeRecord(collection: EditableCollection, project: RecordProject, requirementId: string): Record<string, unknown> {
  const req = project.records.requirements.find(item => item.id === requirementId);
  const id = crypto.randomUUID();
  const common: WorkContent = { id, title: '', problem: req?.problem ?? '', expectedOutcome: req?.expectedOutcome ?? '',
    scope: structuredClone(req?.scope ?? { includes: [], excludes: [] }), rationale: req?.rationale ?? '',
    expectedImpact: req?.expectedImpact ?? '', acceptanceCriteria: [], sourceRefs: [], status: 'draft', result: null };
  const artifact = { ...common, requirementId, dependsOn: [] };
  const target = { kind: 'requirement', id: requirementId };
  switch (collection) {
    case 'requirements': return { ...common, kind: 'requirement', intentId: project.records.intent.id, constraints: [], acceptance: null, pullRequest: null };
    case 'units': return { ...artifact, kind: 'unit', responsibilities: [], inputs: [], outputs: [] };
    case 'stories': return { ...artifact, kind: 'story', unitId: null, userValue: '' };
    case 'boltPlans': return { ...artifact, kind: 'bolt_plan', storyIds: [], constructionType: 'simple', stages: ['Plan', 'Implement', 'Test'], exitConditions: [] };
    case 'contextItems': return { id, requirementId, category: 'open_question', content: '', epistemicStatus: 'unknown', sourceRefs: [], evidenceRefs: [] };
    case 'sources': return { id, kind: 'reference', locator: '', excerpt: null };
    case 'evidence': return { id, requirementId, targets: [target], description: '', subject: '', environment: '', observedResult: '', limitations: [], sourceRefs: [] };
    case 'verifications': return { id, target, criterionId: '', outcome: 'unknown', method: 'test', explanation: '', evidenceRefs: [], sourceRefs: [] };
  }
}
