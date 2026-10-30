import type {
  ContextItemRecord,
  IntentRecord,
  RequirementRecord,
  SourceRecord,
  ContractIssue,
  AcceptanceCriterion,
  UnitRecord,
  StoryRecord,
  BoltPlanRecord
} from './record-contract.js';

export interface AppendContextCandidate {
  type: 'append_context';
  requirementId: string;
  category: 'open_question' | 'assumption' | 'decision';
  epistemicStatus: 'unknown' | 'proposed';
  content: string;
  sourceRefs: string[];
}

export interface ProposeCriteriaCandidate {
  type: 'propose_criteria';
  requirementId: string;
  acceptanceCriteria: AcceptanceCriterion[];
  sourceRefs: string[];
}

export interface ProposeDecompositionCandidate {
  type: 'propose_decomposition';
  requirementId: string;
  units?: UnitRecord[];
  stories: StoryRecord[];
  sourceRefs: string[];
}

export interface ProposeBoltPlanCandidate {
  type: 'propose_bolt_plan';
  requirementId: string;
  boltPlan: BoltPlanRecord;
  sourceRefs: string[];
}

export type Candidate =
  | AppendContextCandidate
  | ProposeCriteriaCandidate
  | ProposeDecompositionCandidate
  | ProposeBoltPlanCandidate;

export type ContextCandidate = Candidate;

export interface ContextSnapshot {
  projectId: string; requirementId: string; projectRevision: number;
  intent: IntentRecord; requirement: RequirementRecord;
  contextItems: ContextItemRecord[]; sources: SourceRecord[];
  instruction: string; omitted: string[]; bytes: number; hash: string;
  focusOutline?: string[];
}
export interface RunLimits { maxInputBytes: number; maxOutputBytes: number; timeoutMs: number; maxCalls: number; maxToolCalls: number }
export type RunState = 'running' | 'waiting_human' | 'applying' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export interface RunEvent { sequence: number; at: string; type: string; details: Record<string, unknown> }
export interface ApplicationReceipt { projectRevision: number; auditId: string; contextId: string }

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  callId: string;
  toolName: string;
  output: string;
  error?: string;
}

export interface RunTurn {
  sequence: number;
  role: 'user' | 'assistant' | 'tool';
  content?: string | null;
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
}

export interface ModelStepInput {
  snapshot: ContextSnapshot;
  tools: ToolDefinition[];
  turns: RunTurn[];
  maxOutputBytes?: number;
}

export type ModelStepOutput =
  | { kind: 'candidate'; candidate: unknown; rawResponseBytes?: number }
  | { kind: 'tool_calls'; toolCalls: ToolCallRequest[]; rawResponseBytes?: number };

export interface WorkspaceAuthorization {
  authorized: boolean;
  root: string;
  readScope: string[];
  exclude: string[];
  egressScope: string;
}

export interface RunAuthorization {
  active: boolean;
  expiresAt: string;
  operation: 'propose_context';
  workspace?: WorkspaceAuthorization | null;
}

export type RuntimeProviderKind = 'scripted' | 'deepseek' | 'openai-compatible';

export interface ModelRuntimeConfig {
  id: string;
  version: number;
  name: string;
  provider: RuntimeProviderKind;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  timeoutMs: number;
  isPreset: boolean;
}

export interface ModelRuntimeBinding {
  id: string;
  configVersion: number;
  provider: RuntimeProviderKind;
  model: string;
  endpoint: string;
  external: boolean;
  fingerprint?: string;
}

export interface RunForkInfo {
  parentRunId: string;
  parentRevision: number;
  forkPointStep: number;
}

export interface RunMetrics {
  inputBytes: number;
  outputBytes: number;
  toolCallsCount: number;
  durationMs: number;
}

export interface HarnessRun {
  schemaVersion: '1.0.0'; id: string; revision: number; projectId: string; requirementId: string;
  createdAt: string; requestId: string; requestHash: string; baseRevision: number;
  state: RunState; stopReason: string | null;
  authorization: RunAuthorization;
  limits: RunLimits; model: string;
  runtime?: ModelRuntimeBinding | null;
  executionId?: string | null;
  calls: number; snapshot: ContextSnapshot | null;
  metrics?: RunMetrics;
  fork?: RunForkInfo | null;
  candidate: ContextCandidate | null; issues: ContractIssue[];
  outcome: 'kept' | 'rejected' | 'applied' | null; receipt: ApplicationReceipt | null;
  turns?: RunTurn[];
  events: RunEvent[];
}
export interface RunRepository {
  readonly storagePath?: string;
  list(projectId?: string): HarnessRun[]; get(id: string): HarnessRun | undefined;
  create(run: HarnessRun): void; replace(run: HarnessRun, expectedRevision: number): void;
}
export interface CandidateValidator {
  check(input: unknown): { valid: true; data: ContextCandidate } | { valid: false; issues: ContractIssue[] };
}
export interface ModelPort {
  readonly name: string;
  readonly providerKind?: RuntimeProviderKind;
  readonly endpoint?: string;
  measureStepInputBytes?(input: ModelStepInput): number;
  measureProposeInputBytes?(snapshot: ContextSnapshot): number;
  propose(input: ContextSnapshot, signal: AbortSignal): Promise<unknown>;
  step?(input: ModelStepInput, signal: AbortSignal): Promise<ModelStepOutput>;
}
