export type RecordStatus = 'draft' | 'planned' | 'in_progress' | 'review' | 'done';
export type TargetKind = 'requirement' | 'unit' | 'story' | 'bolt_plan';
export interface TargetRef { kind: TargetKind; id: string }
export interface ScopeBlock { includes: string[]; excludes: string[] }
export interface AcceptanceCriterion { id: string; description: string; verification: string }
export interface ActualResult { what: string; why: string; actualImpact: string; evidenceRefs: string[] }
export interface WorkContent {
  id: string; title: string; problem: string; expectedOutcome: string; scope: ScopeBlock;
  rationale: string; expectedImpact: string; acceptanceCriteria: AcceptanceCriterion[];
  sourceRefs: string[]; status: RecordStatus; result: ActualResult | null;
}
export interface IntentRecord {
  id: string; title: string; problem: string; expectedOutcome: string; scope: ScopeBlock;
  constraints: string[]; sourceRefs: string[];
  confirmation: { state: 'proposed' | 'human_confirmed'; sourceRefs: string[] };
}
export interface RequirementRecord extends WorkContent {
  kind: 'requirement'; intentId: string; identifier?: string; constraints: string[];
  acceptance: { outcome: 'accepted' | 'changes_requested'; sourceRefs: string[]; reason: string | null } | null;
  pullRequest: { url: string; what: string; why: string; verification: string; result: string } | null;
}
export interface ArtifactRecord extends WorkContent { requirementId: string; dependsOn: TargetRef[] }
export interface UnitRecord extends ArtifactRecord {
  kind: 'unit'; responsibilities: string[]; inputs: string[]; outputs: string[];
}
export interface StoryRecord extends ArtifactRecord { kind: 'story'; unitId: string | null; userValue: string }
export interface BoltPlanRecord extends ArtifactRecord {
  kind: 'bolt_plan'; storyIds: string[]; constructionType: 'simple' | 'ddd'; stages: string[]; exitConditions: string[];
}
export type WorkRecord = RequirementRecord | UnitRecord | StoryRecord | BoltPlanRecord;
export type DecompositionRecord = UnitRecord | StoryRecord | BoltPlanRecord;
export interface SourceRecord {
  id: string; kind: 'conversation' | 'message' | 'reference' | 'tool_output' | 'human_observation';
  locator: string; excerpt: string | null;
}
export interface ContextItemRecord {
  id: string; requirementId: string | null;
  category: 'decision' | 'constraint' | 'open_question' | 'assumption' | 'progress' | 'fact';
  content: string; epistemicStatus: 'confirmed' | 'proposed' | 'unknown' | 'observed';
  sourceRefs: string[]; evidenceRefs: string[];
}
export interface EvidenceRecord {
  id: string; requirementId: string; targets: TargetRef[]; description: string;
  subject: string; environment: string; observedResult: string; limitations: string[]; sourceRefs: string[];
}
export interface VerificationRecord {
  id: string; target: TargetRef; criterionId: string; outcome: 'passed' | 'failed' | 'unknown';
  method: 'static_check' | 'test' | 'runtime_observation' | 'human_observation' | 'model_review' | 'other';
  explanation: string; evidenceRefs: string[]; sourceRefs: string[];
}
export interface RecordSet {
  schemaVersion: '1.0.0'; intent: IntentRecord; requirements: RequirementRecord[];
  units: UnitRecord[]; stories: StoryRecord[]; boltPlans: BoltPlanRecord[]; sources: SourceRecord[];
  contextItems: ContextItemRecord[]; evidence: EvidenceRecord[]; verifications: VerificationRecord[];
}
export interface ContractIssue { code: string; path: string; message: string }
export interface ContractReport {
  valid: boolean; scope: 'structure-and-relations'; issues: ContractIssue[];
}
export type StructureResult = { valid: true; data: RecordSet } | { valid: false; issues: ContractIssue[] };
export interface RecordStructureValidator { check(value: unknown): StructureResult }
