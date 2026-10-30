import type {
  RequirementRecord,
  UnitRecord,
  StoryRecord,
  BoltPlanRecord,
  RecordStatus,
  RecordSet
} from './record-contract.js';
import type { RecordProject } from './record-project.js';
import type { HarnessRun, ModelRuntimeBinding, WorkspaceAuthorization } from './harness.js';
import { inspectRecordRelations } from './record-relations.js';
import { HubError } from './board.js';

export const DEFAULT_RECOVERY_BUDGET_BYTES = 32768; // 32 KiB
export const MIN_RECOVERY_BUDGET_BYTES = 4096; // 4 KiB
export const MAX_RECOVERY_BUDGET_BYTES = 1048576; // 1 MiB

export function validateRecoveryBudget(maxBudgetBytes?: unknown): number {
  if (maxBudgetBytes === undefined || maxBudgetBytes === null) {
    return DEFAULT_RECOVERY_BUDGET_BYTES;
  }
  if (
    typeof maxBudgetBytes !== 'number' ||
    !Number.isInteger(maxBudgetBytes) ||
    !Number.isFinite(maxBudgetBytes) ||
    Number.isNaN(maxBudgetBytes) ||
    maxBudgetBytes < MIN_RECOVERY_BUDGET_BYTES ||
    maxBudgetBytes > MAX_RECOVERY_BUDGET_BYTES
  ) {
    throw new HubError(
      400,
      'INVALID_BUDGET_CONFIGURATION',
      `恢复上下文预算配置非法: "${String(maxBudgetBytes)}"。必须为介于 ${MIN_RECOVERY_BUDGET_BYTES} 与 ${MAX_RECOVERY_BUDGET_BYTES} 字节之间的有限整数（默认 ${DEFAULT_RECOVERY_BUDGET_BYTES} 字节 / 32 KiB）。`
    );
  }
  return maxBudgetBytes;
}

export interface RecoveryContextItem {
  id: string;
  requirementId: string | null;
  category: 'decision' | 'constraint' | 'open_question' | 'assumption' | 'progress' | 'fact';
  content: string;
  epistemicStatus: 'confirmed' | 'proposed' | 'unknown' | 'observed';
  sourceRefs: string[];
  evidenceRefs: string[];
}

export type RecoveryDeliveryFormat =
  | 'compact_json'
  | 'formatted_json'
  | 'cli_json'
  | 'markdown'
  | 'cli_markdown';

export interface OmittedItemEntry {
  kind: 'source_excerpt' | 'evidence_detail' | 'assumption' | 'verification' | 'context_item';
  id: string;
  reason: string;
  retrievalLocator: string;
}

export interface RecoveryOmittedSummary {
  totalOmitted: number;
  entries: OmittedItemEntry[];
  truncatedOmissionList?: boolean;
  retrievalGuide: string;
}

export interface RecoveryContextBudget {
  maxBudgetBytes: number;
  actualBytes: number;
  truncated: boolean;
  necessaryOverBudget?: boolean;
  deliveryFormat?: RecoveryDeliveryFormat;
  omittedSummary?: RecoveryOmittedSummary;
}

export interface RecoveryGoal {
  intent: {
    id: string;
    title: string;
    problem: string;
    expectedOutcome: string;
    state: string;
    scope: { includes: string[]; excludes: string[] };
    constraints: string[];
    sourceRefs?: string[];
    confirmationSourceRefs?: string[];
  };
  activeRequirement?: {
    id: string;
    title: string;
    problem: string;
    expectedOutcome: string;
    status: RecordStatus;
    hasAcceptedOutcome: boolean;
    scope: { includes: string[]; excludes: string[] };
    constraints: string[];
    acceptanceCriteria: Array<{ id: string; description: string; verification: string }>;
    sourceRefs?: string[];
  } | null;
  candidateRequirements?: Array<{
    id: string;
    title: string;
    status: RecordStatus;
  }> | undefined;
}

export type RecoveryRequirementsCount = { total: number; draft: number; review: number; done: number };

export interface RecoveryProgress {
  intentState: string;
  requirementsCount: RecoveryRequirementsCount;
  activeRequirementBreakdown?: {
    units: { total: number; done: number; review: number; draft: number };
    stories: { total: number; done: number; review: number; draft: number };
    boltPlans: { total: number; done: number; review: number; draft: number };
  } | null;
  latestRunState?: string | null;
  pendingCandidateCount: number;
  keptCandidateCount: number;
}

export type SafeActionCode =
  | 'STOP_AND_REPORT_GAP'
  | 'REQUIRE_HUMAN_INTENT_CONFIRMATION'
  | 'AWAIT_HUMAN_REQUIREMENT_CREATION'
  | 'ALL_REQUIREMENTS_COMPLETED'
  | 'SELECT_TARGET_REQUIREMENT'
  | 'REQUIREMENT_ALREADY_COMPLETED'
  | 'AWAIT_ACTIVE_RUN'
  | 'REVIEW_CANDIDATE_IN_HUMAN_BOARD'
  | 'RECONCILE_STALE_RUN'
  | 'RESUME_INTERRUPTED_RUN'
  | 'CHECK_FAILED_RUN'
  | 'INSPECT_CANCELLED_RUN'
  | 'REQUEST_HUMAN_OVERALL_ACCEPTANCE'
  | 'REQUIRE_RUN_AUTHORIZATION'
  | 'EXECUTE_RUN_WITH_VALID_AUTHORIZATION';

export interface AlternativeSafeAction {
  actionCode: SafeActionCode;
  actor: 'human' | 'model';
  description: string;
  tradeOff: string;
}

export interface RecoveryNextSafeAction {
  actionCode: SafeActionCode;
  actor: 'human' | 'model';
  description: string;
  why: string;
  executableNow: boolean;
  waitingFor: 'human' | 'model' | 'active_run' | 'none';
  prerequisitesMet: string[];
  blockingIssues: string[];
  alternativeActions?: AlternativeSafeAction[];
}

export type RecoveryAuthorizationState =
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'stale_revision'
  | 'none'
  | 'unknown'
  | 'unverified_due_to_corruption';

export interface RecoveryAuthorizations {
  projectRevision: number;
  authorizationState: RecoveryAuthorizationState;
  activeGrant: WorkspaceAuthorization | null;
  runtimeBinding: ModelRuntimeBinding | null;
  notes: string[];
  authorizationDetailsOmitted?: boolean;
  targetRunId?: string | null;
  runRevision?: number | null;
  baseRevision?: number | null;
  retrievalEndpoint?: string | null;
  retrievalLocator?: string | null;
}

export interface RecoveryEvidenceLinks {
  sources: Array<{ id: string; kind: string; locator: string; excerpt?: string | null }>;
  verifications: Array<{ id: string; targetId: string; criterionId: string; outcome: string; method: string; explanation?: string | null; sourceRefs?: string[] }>;
  evidence: Array<{ id: string; targetIds: string[]; subject: string; observedResult: string; environment?: string | null; description?: string | null; sourceRefs?: string[] }>;
}

export interface RecoveryUnknowns {
  openQuestions: string[];
  assumptions: string[];
  unverifiedCriteria: Array<{ requirementId: string; criterionId: string; description: string }>;
  invalidatedVerifications: Array<{ id: string; targetId: string; reason: string }>;
  pendingHumanGates: string[];
}

export interface RecoveryGapReport {
  hasGap: boolean;
  missingFacts: string[];
  contradictoryFacts: string[];
}

export interface RecoveryStandards {
  schemaVersion: string;
  rules: string[];
  updateProtocolEndpoints: string[];
}

export interface ProjectRecoveryView {
  projectId: string;
  projectName: string;
  projectRevision: number;
  generatedAt: string;
  standards: RecoveryStandards;
  goal: RecoveryGoal;
  progress: RecoveryProgress;
  nextSafeAction: RecoveryNextSafeAction;
  authorizations: RecoveryAuthorizations;
  evidence: RecoveryEvidenceLinks;
  unknowns: RecoveryUnknowns;
  gapReport: RecoveryGapReport;
  contextItems: RecoveryContextItem[];
  contextBudget?: RecoveryContextBudget;
}

function countStatus<T extends { status: RecordStatus }>(items: T[]) {
  let draft = 0, review = 0, done = 0;
  for (const item of items) {
    if (item.status === 'done') done++;
    else if (item.status === 'review') review++;
    else draft++;
  }
  return { total: items.length, draft, review, done };
}

export interface RecoveryBuildOptions {
  targetRequirementId?: string | undefined;
  now?: number | undefined;
  structureIssues?: Array<{ code: string; path: string; message: string }> | undefined;
  maxBudgetBytes?: number | undefined;
  deliveryFormat?: RecoveryDeliveryFormat | undefined;
}

export interface RequirementAcceptanceEligibility {
  eligible: boolean;
  activeUnverified: Array<{ requirementId: string; criterionId: string; description: string }>;
  relevantUnits: UnitRecord[];
  relevantStories: StoryRecord[];
  relevantBoltPlans: BoltPlanRecord[];
  incompleteChildren: Array<{ kind: string; id: string; status: RecordStatus }>;
  reasons: string[];
}

/**
 * 统一整体验收前置条件判定（供 pendingHumanGates, deriveNextSafeAction 以及 RecordProjectService.acceptRequirement 统一共享）
 * 严格遵从：
 * 1. Unit / Story / BoltPlan 分层按需出现，不机械要求所有可选层级均存在；现有拆解子产物必须全部处于 done 状态。
 * 2. 需求必须已关联最终 Pull Request (pullRequest 不能为空且各项非空)。
 * 3. 需求必须具备交付结果记录 (result 不能为空且各项非空、引用有效证据)。
 * 4. 需求的每项验收条件必须具备 outcome === 'passed'、method !== 'model_review'，且有适用证据支持的当前核查记录。
 * 消除“恢复视图建议整体验收，但实际接口提交必被拒”的不一致性。
 */
export function checkRequirementAcceptanceEligibility(
  req: RequirementRecord,
  data: RecordProject['records'],
  _unverifiedCriteria?: Array<{ requirementId: string; criterionId: string; description: string }>
): RequirementAcceptanceEligibility {
  const reasons: string[] = [];

  // 1. 状态判断：已处于 done 态的不应重复验收
  if (req.status === 'done') {
    reasons.push('需求已处于完成态（done），无需重复整体验收');
  }

  // 2. 验收条件完整性
  if (!req.acceptanceCriteria || req.acceptanceCriteria.length === 0) {
    reasons.push('需求尚未定义任何验收条件');
  }

  // 3. 子产物拆解状态（Unit / Story / BoltPlan）：按需出现，若存在则必须全部为 done
  const relevantUnits = data.units.filter(u => u.requirementId === req.id);
  const relevantStories = data.stories.filter(s => s.requirementId === req.id);
  const relevantBoltPlans = data.boltPlans.filter(b => b.requirementId === req.id);

  const incompleteChildren: Array<{ kind: string; id: string; status: RecordStatus }> = [];
  for (const u of relevantUnits) {
    if (u.status !== 'done') incompleteChildren.push({ kind: 'unit', id: u.id, status: u.status });
  }
  for (const s of relevantStories) {
    if (s.status !== 'done') incompleteChildren.push({ kind: 'story', id: s.id, status: s.status });
  }
  for (const b of relevantBoltPlans) {
    if (b.status !== 'done') incompleteChildren.push({ kind: 'bolt_plan', id: b.id, status: b.status });
  }
  if (incompleteChildren.length > 0) {
    reasons.push(`现有拆解产物中尚有 ${incompleteChildren.length} 项未完成 (${incompleteChildren.map(c => `${c.kind} ${c.id}[${c.status}]`).join(', ')})`);
  }

  // 4. 交付结果（result）：完成态要求 result 必须为有效对象
  if (!req.result) {
    reasons.push('需求尚未记录交付结果（result 不能为空）');
  } else {
    if (!req.result.what || !req.result.what.trim()) reasons.push('交付结果缺少有效变更内容说明（result.what 不能为空）');
    if (!req.result.why || !req.result.why.trim()) reasons.push('交付结果缺少有效业务原因说明（result.why 不能为空）');
    if (!req.result.actualImpact || !req.result.actualImpact.trim()) reasons.push('交付结果缺少有效实际影响说明（result.actualImpact 不能为空）');
    if (!Array.isArray(req.result.evidenceRefs) || req.result.evidenceRefs.length === 0) {
      reasons.push('交付结果缺少支持证据引用（result.evidenceRefs 不能为空）');
    } else {
      for (const evId of req.result.evidenceRefs) {
        const found = data.evidence.find(e => e.id === evId);
        if (!found) {
          reasons.push(`交付结果引用的证据 "${evId}" 在项目中不存在`);
        } else if (found.requirementId !== req.id && !found.targets.some(t => t.id === req.id)) {
          reasons.push(`交付结果引用的证据 "${evId}" 不属于该需求`);
        }
      }
    }
  }

  // 5. 最终 Pull Request（pullRequest）：完成态要求必须关联 Pull Request 对象
  if (!req.pullRequest) {
    reasons.push('需求尚未关联最终 Pull Request（pullRequest 不能为空）');
  } else {
    if (!req.pullRequest.url || !req.pullRequest.url.trim()) reasons.push('Pull Request 缺少有效链接（pullRequest.url 不能为空）');
    if (!req.pullRequest.what || !req.pullRequest.what.trim()) reasons.push('Pull Request 缺少变更说明（pullRequest.what 不能为空）');
    if (!req.pullRequest.why || !req.pullRequest.why.trim()) reasons.push('Pull Request 缺少变更原因（pullRequest.why 不能为空）');
    if (!req.pullRequest.verification || !req.pullRequest.verification.trim()) reasons.push('Pull Request 缺少验证说明（pullRequest.verification 不能为空）');
    if (!req.pullRequest.result || !req.pullRequest.result.trim()) reasons.push('Pull Request 缺少结果说明（pullRequest.result 不能为空）');
  }

  // 6. 验收条件核验（Verifications）：每个条件须有 outcome === 'passed'、method !== 'model_review'，且有适用证据支持
  const activeUnverified: Array<{ requirementId: string; criterionId: string; description: string }> = [];
  if (req.acceptanceCriteria && req.acceptanceCriteria.length > 0) {
    for (const c of req.acceptanceCriteria) {
      const validVerif = data.verifications.find(v =>
        v.target.kind === 'requirement' &&
        v.target.id === req.id &&
        v.criterionId === c.id &&
        v.outcome === 'passed' &&
        v.method !== 'model_review' &&
        Array.isArray(v.evidenceRefs) &&
        v.evidenceRefs.length > 0 &&
        v.evidenceRefs.every(evId => {
          const ev = data.evidence.find(e => e.id === evId);
          return ev && (ev.requirementId === req.id || ev.targets.some(t => t.id === req.id));
        })
      );

      if (!validVerif) {
        activeUnverified.push({ requirementId: req.id, criterionId: c.id, description: c.description });
        const modelOnly = data.verifications.find(v =>
          v.target.kind === 'requirement' &&
          v.target.id === req.id &&
          v.criterionId === c.id &&
          v.outcome === 'passed' &&
          v.method === 'model_review'
        );
        if (modelOnly) {
          reasons.push(`验收条件 "${c.id}" 仅具备 model_review 模型审查核查，模型审查不能单独满足整体验收，须具备自动化测试或人工核验等独立证据`);
        } else {
          reasons.push(`验收条件 "${c.id}" 尚未通过有效核验（缺少 passed 态非模型审查核查或适用证据）`);
        }
      }
    }
  }

  const eligible = reasons.length === 0;

  return {
    eligible,
    activeUnverified,
    relevantUnits,
    relevantStories,
    relevantBoltPlans,
    incompleteChildren,
    reasons
  };
}

export function validateBasicStructuralHealth(data: unknown): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, issues: ['项目 records 为空或不是有效对象。'] };
  }
  const d = data as Record<string, unknown>;
  const supportedSchemaVersion = '1.0.0';
  if (d.schemaVersion !== supportedSchemaVersion) {
    issues.push(`不支持的记录合同版本: "${String(d.schemaVersion)}"，当前仅支持 "${supportedSchemaVersion}"。`);
  }
  if (!d.intent || typeof d.intent !== 'object') {
    issues.push('项目缺少顶级 intent 对象。');
  } else {
    const intent = d.intent as Record<string, unknown>;
    if (typeof intent.id !== 'string' || !intent.id.trim()) issues.push('intent.id 必须为非空字符串。');
    if (typeof intent.title !== 'string' || !intent.title.trim()) issues.push('intent.title 必须为非空字符串。');
    if (typeof intent.problem !== 'string' || !intent.problem.trim()) issues.push('intent.problem 必须为非空字符串。');
    if (typeof intent.expectedOutcome !== 'string' || !intent.expectedOutcome.trim()) issues.push('intent.expectedOutcome 必须为非空字符串。');
    if (!intent.confirmation || typeof intent.confirmation !== 'object') {
      issues.push('intent 缺少 confirmation 对象。');
    } else {
      const conf = intent.confirmation as Record<string, unknown>;
      if (conf.state !== 'proposed' && conf.state !== 'human_confirmed') {
        issues.push(`intent.confirmation.state 非法: "${String(conf.state)}"`);
      }
    }
    if (intent.scope && typeof intent.scope === 'object') {
      const sc = intent.scope as Record<string, unknown>;
      if (!Array.isArray(sc.includes) || !Array.isArray(sc.excludes)) {
        issues.push('intent.scope.includes 与 excludes 必须为数组。');
      }
    }
  }

  const collections = ['requirements', 'units', 'stories', 'boltPlans', 'sources', 'verifications', 'evidence', 'contextItems'] as const;
  for (const col of collections) {
    if (!Array.isArray(d[col])) {
      issues.push(`项目缺少顶级 ${col} 集合或非数组。`);
    }
  }

  if (Array.isArray(d.requirements)) {
    for (let i = 0; i < d.requirements.length; i++) {
      const r = d.requirements[i];
      if (!r || typeof r !== 'object') {
        issues.push(`requirements[${i}] 为 null 或非对象。`);
        continue;
      }
      const req = r as Record<string, unknown>;
      const reqId = typeof req.id === 'string' && req.id ? req.id : `index-${i}`;
      if (typeof req.title !== 'string' || !req.title.trim()) {
        issues.push(`需求 ${reqId} 缺少有效标题（title 不能为空）。`);
      }
      if (typeof req.problem !== 'string' || !req.problem.trim()) {
        issues.push(`需求 ${reqId} 缺少有效问题描述（problem 不能为空）。`);
      }
      if (typeof req.expectedOutcome !== 'string' || !req.expectedOutcome.trim()) {
        issues.push(`需求 ${reqId} 缺少有效预期结果（expectedOutcome 不能为空）。`);
      }
      if (!Array.isArray(req.acceptanceCriteria)) {
        issues.push(`需求 ${reqId} 的 acceptanceCriteria 必须为数组。`);
      }
      if (!Array.isArray(req.sourceRefs)) {
        issues.push(`需求 ${reqId} 的 sourceRefs 必须为数组。`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

const utf8Encoder = new TextEncoder();

export function getUtf8ByteLength(text: string): number {
  return utf8Encoder.encode(text).length;
}

export function renderRecoveryMarkdown(view: ProjectRecoveryView): string {
  const lines: string[] = [];
  lines.push(`# 项目冷启动恢复视图：${view.projectName} (r${view.projectRevision})`);
  lines.push(`> 依据 AIDLC 第4章最小可恢复上下文标准提炼，生成时间: ${view.generatedAt}\n`);

  lines.push(`## 0. 规范与更新协议（Standards & Update Protocol）`);
  lines.push(`- **记录合同版本**：\`${view.standards.schemaVersion}\``);
  lines.push(`- **核心约束规则**：`);
  for (const rule of view.standards.rules) {
    lines.push(`  - ${rule}`);
  }
  if (view.standards.updateProtocolEndpoints && view.standards.updateProtocolEndpoints.length > 0) {
    lines.push(`- **受控更新协议入口**：`);
    for (const ep of view.standards.updateProtocolEndpoints) {
      lines.push(`  - \`${ep}\``);
    }
  }

  lines.push(`\n## 1. 当前目标（Goal）`);
  lines.push(`- **意图 [${view.goal.intent.state}]**：${view.goal.intent.title}`);
  lines.push(`  - 核心痛点：${view.goal.intent.problem}`);
  lines.push(`  - 预期成果：${view.goal.intent.expectedOutcome}`);
  if (view.goal.intent.scope) {
    lines.push(`  - 包含范围（Includes）：[${view.goal.intent.scope.includes.join(', ')}]`);
    lines.push(`  - 排除范围（Excludes）：[${view.goal.intent.scope.excludes.join(', ')}]`);
  }
  if (view.goal.intent.constraints && view.goal.intent.constraints.length > 0) {
    lines.push(`  - 约束条件：[${view.goal.intent.constraints.join(', ')}]`);
  }

  if (view.goal.activeRequirement) {
    const r = view.goal.activeRequirement;
    lines.push(`- **当前需求 [${r.status}]**：${r.title} (${r.id})`);
    lines.push(`  - 问题：${r.problem}`);
    lines.push(`  - 预期结果：${r.expectedOutcome}`);
    if (r.scope) {
      lines.push(`  - 包含范围（Includes）：[${r.scope.includes.join(', ')}]`);
      lines.push(`  - 排除范围（Excludes）：[${r.scope.excludes.join(', ')}]`);
    }
    if (r.constraints && r.constraints.length > 0) {
      lines.push(`  - 约束条件：[${r.constraints.join(', ')}]`);
    }
    if (r.acceptanceCriteria && r.acceptanceCriteria.length > 0) {
      lines.push(`  - 验收准则：`);
      for (const crit of r.acceptanceCriteria) {
        lines.push(`    - [${crit.id}] ${crit.description} (核查方式: ${crit.verification})`);
      }
    }
    lines.push(`  - 整体验收：${r.hasAcceptedOutcome ? '已通过整体验收' : '未完成整体验收'}`);
  } else if (view.goal.candidateRequirements && view.goal.candidateRequirements.length > 0) {
    lines.push(`- **多需求待选清单（请人端指定 targetRequirementId）**：`);
    for (const cr of view.goal.candidateRequirements) {
      lines.push(`  - \`${cr.id}\` [${cr.status}]：${cr.title}`);
    }
  } else {
    lines.push(`- **当前无活跃需求**：项目中所有需求均已完成或尚未创建需求。`);
  }

  lines.push(`\n## 2. 当前推进进度（Progress）`);
  lines.push(
    `- **需求总数**：${view.progress.requirementsCount.total}（完成 ${view.progress.requirementsCount.done} · 评审中 ${view.progress.requirementsCount.review} · 草案 ${view.progress.requirementsCount.draft}）`
  );
  if (view.progress.activeRequirementBreakdown) {
    const b = view.progress.activeRequirementBreakdown;
    lines.push(
      `- **活跃需求拆解**：Unit (${b.units.done}/${b.units.total} done) · Story (${b.stories.done}/${b.stories.total} done) · BoltPlan (${b.boltPlans.done}/${b.boltPlans.total} done)`
    );
  }
  const runStateDisplay = view.progress.latestRunState === null ? '无运行' : (view.progress.latestRunState || '未知');
  lines.push(
    `- **运行账本状态**：最新运行 ${runStateDisplay} · 待审核候选 ${view.progress.pendingCandidateCount} 条 · 已保留候选（待人工决定或未合入正式记录） ${view.progress.keptCandidateCount} 条`
  );

  lines.push(`\n## 3. 下一步安全动作（Next Safe Action）`);
  lines.push(`- **动作代码**：\`${view.nextSafeAction.actionCode}\`（执行主体：${view.nextSafeAction.actor} · 可立即执行：${view.nextSafeAction.executableNow ? '是' : '否'}）`);
  lines.push(`- **行动描述**：${view.nextSafeAction.description}`);
  lines.push(`- **原因依据**：${view.nextSafeAction.why}`);
  if (view.nextSafeAction.prerequisitesMet.length > 0) {
    lines.push(`- **已满足前置条件**：`);
    for (const pre of view.nextSafeAction.prerequisitesMet) {
      lines.push(`  - ${pre}`);
    }
  }
  if (view.nextSafeAction.blockingIssues.length > 0) {
    lines.push(`- **阻断项 / 待决人工事项**：`);
    for (const blk of view.nextSafeAction.blockingIssues) {
      lines.push(`  - ${blk}`);
    }
  }
  if (view.nextSafeAction.alternativeActions && view.nextSafeAction.alternativeActions.length > 0) {
    lines.push(`- **备选安全方案**：`);
    for (const alt of view.nextSafeAction.alternativeActions) {
      lines.push(`  - \`${alt.actionCode}\` (${alt.actor}): ${alt.description} (权衡: ${alt.tradeOff})`);
    }
  }

  lines.push(`\n## 4. 适用修订与授权（Authorizations）`);
  lines.push(`- **项目基准修订**：r${view.authorizations.projectRevision}`);
  let authStateDesc = `\`${view.authorizations.authorizationState}\``;
  if (view.authorizations.authorizationState === 'unverified_due_to_corruption') {
    authStateDesc += '（因项目记录结构损坏，授权适用性未核对，禁止继续执行）';
  } else if (view.authorizations.authorizationState === 'stale_revision') {
    authStateDesc += '（项目修订已前进，授权跨修订失效，依据 D18.1 保守策略禁止继承）';
  } else if (view.authorizations.authorizationState === 'expired') {
    authStateDesc += '（授权已到期，不能作为有效授权使用）';
  } else if (view.authorizations.authorizationState === 'revoked') {
    authStateDesc += '（授权已被主动撤销或处于非活跃状态）';
  } else if (view.authorizations.authorizationState === 'unknown') {
    authStateDesc += '（存在多需求运行但未指定目标需求，授权归属未知）';
  } else if (view.authorizations.authorizationState === 'none') {
    authStateDesc += '（无授权）';
  }
  lines.push(`- **工作区授权状态**：${authStateDesc}`);

  if (view.authorizations.targetRunId) {
    const runRev = view.authorizations.runRevision ?? 0;
    const baseRev = view.authorizations.baseRevision ?? view.authorizations.projectRevision;
    const ep = view.authorizations.retrievalEndpoint ?? `/api/runs/${view.authorizations.targetRunId}`;
    const loc = view.authorizations.retrievalLocator ?? `${view.authorizations.targetRunId}.json`;
    lines.push(`- **关联运行账本**：\`${view.authorizations.targetRunId}\` (运行修订: r${runRev} · 基准修订: r${baseRev} · 端点: \`${ep}\` · 文件: \`${loc}\`)`);
  }

  if (view.authorizations.activeGrant) {
    const g = view.authorizations.activeGrant;
    lines.push(`- **有效授权范围**：根目录 \`${g.root}\` · 只读范围 [${g.readScope.join(', ')}] · 外发范围 \`${g.egressScope}\``);
  } else if (view.authorizations.authorizationDetailsOmitted) {
    const ep = view.authorizations.retrievalEndpoint ?? (view.authorizations.targetRunId ? `/api/runs/${view.authorizations.targetRunId}` : null);
    if (ep) {
      lines.push(`- **有效授权范围**：授权详情未包含，需取回重新核对（可通过 \`${ep}\` 重新核对）`);
    } else {
      lines.push(`- **有效授权范围**：授权详情未包含，需取回重新核对`);
    }
  }
  if (view.authorizations.runtimeBinding) {
    const rt = view.authorizations.runtimeBinding;
    lines.push(`- **绑定运行时**：\`${rt.id}\` (v${rt.configVersion}) · 模型: \`${rt.model}\` · 端点: \`${rt.endpoint}\` · 指纹: \`${rt.fingerprint ?? 'none'}\``);
  }
  if (view.authorizations.notes.length > 0) {
    lines.push(`- **授权附注**：`);
    for (const note of view.authorizations.notes) {
      lines.push(`  - ${note}`);
    }
  }

  lines.push(`\n## 5. 依据与证据链分层（Stratified Facts & Evidence）`);
  lines.push(`### 5.1 正式记录事实（Formal Record Facts）`);
  const confirmedDecisions = view.contextItems?.filter(c => c.category === 'decision' && c.epistemicStatus === 'confirmed') ?? [];
  lines.push(`- **已确认决定**：${confirmedDecisions.length} 项（具有规范效力）`);
  for (const dec of confirmedDecisions) {
    lines.push(`  - [${dec.id}] ${dec.requirementId ? `(需求 ${dec.requirementId})` : '(项目级)'}: ${dec.content}${dec.sourceRefs.length > 0 ? ` (出处: ${dec.sourceRefs.join(', ')})` : ''}`);
  }

  const applicableConstraints = view.contextItems?.filter(c => c.category === 'constraint') ?? [];
  lines.push(`- **适用约束**：${applicableConstraints.length} 项`);
  for (const con of applicableConstraints) {
    lines.push(`  - [${con.id}] ${con.requirementId ? `(需求 ${con.requirementId})` : '(项目级)'}: ${con.content}${con.sourceRefs.length > 0 ? ` (出处: ${con.sourceRefs.join(', ')})` : ''}`);
  }

  const passedVerifs = view.evidence.verifications.filter(v => v.outcome === 'passed');
  lines.push(`- **已通过核查**：${passedVerifs.length} / ${view.evidence.verifications.length} 项`);
  for (const v of passedVerifs) {
    lines.push(`  - [${v.id}] 目标: ${v.targetId} · 准则: ${v.criterionId} · 方法: ${v.method}${v.explanation ? ` · 说明: "${v.explanation}"` : ''}`);
  }

  lines.push(`- **已登记证据**：${view.evidence.evidence.length} 条观察记录`);
  for (const ev of view.evidence.evidence) {
    lines.push(`  - [${ev.id}] 主题: ${ev.subject} · 观测结果: ${ev.observedResult}${ev.environment ? ` · 环境: ${ev.environment}` : ''}${ev.description ? ` · 说明: ${ev.description}` : ''}`);
  }

  lines.push(`- **已登记来源**：${view.evidence.sources.length} 项`);
  for (const src of view.evidence.sources) {
    lines.push(`  - [${src.id}] (${src.kind}) 定位: \`${src.locator}\`${src.excerpt ? ` · 摘要: "${src.excerpt}"` : ''}`);
  }

  lines.push(`\n### 5.2 前置运行观察（Prior Run Observations）`);
  lines.push(`- **历史运行状态**：最新运行 \`${runStateDisplay}\` · 授权状态: \`${view.authorizations.authorizationState}\` (基准修订: r${view.authorizations.projectRevision})`);
  lines.push(`  - 说明：运行账本中的步骤与工具调用属历史客观观察记录，不构成新授权，不代表正式记录已变更。`);

  lines.push(`\n### 5.3 未知事项与待验证假设（Unknowns, Hypotheses & Gates）`);
  lines.push(`- **待决人工 Gate**：${view.unknowns.pendingHumanGates.join('；') || '无'}`);
  lines.push(`- **未核验验收条件**：${view.unknowns.unverifiedCriteria.length} 项`);
  for (const crit of view.unknowns.unverifiedCriteria.slice(0, 10)) {
    lines.push(`  - [${crit.requirementId}] ${crit.criterionId}: ${crit.description}`);
  }
  if (view.unknowns.unverifiedCriteria.length > 10) {
    lines.push(`  - ... 另有 ${view.unknowns.unverifiedCriteria.length - 10} 项省略`);
  }
  if (view.unknowns.invalidatedVerifications.length > 0) {
    lines.push(`- **已失效核查（待重新核查）**：${view.unknowns.invalidatedVerifications.length} 条`);
    for (const inv of view.unknowns.invalidatedVerifications) {
      lines.push(`  - 核查 \`${inv.id}\` (目标 \`${inv.targetId}\`): ${inv.reason}`);
    }
  }
  lines.push(`- **未决问题**：${view.unknowns.openQuestions.length} 条`);
  for (const q of view.unknowns.openQuestions) {
    lines.push(`  - ${q}`);
  }
  lines.push(`- **待验证假设**：${view.unknowns.assumptions.length} 条`);
  for (const asm of view.unknowns.assumptions) {
    lines.push(`  - ${asm}`);
  }

  if (view.contextBudget) {
    lines.push(`\n## 6. 恢复包预算与省略清单（Context Budget & Omissions）`);
    lines.push(`- **预算上限**：${view.contextBudget.maxBudgetBytes} 字节 (UTF-8)`);
    lines.push(`- **实际体积**：${view.contextBudget.actualBytes} 字节`);
    lines.push(`- **交付格式**：${view.contextBudget.deliveryFormat ?? 'compact_json'}`);
    lines.push(`- **是否发生裁剪**：${view.contextBudget.truncated ? '是' : '否'}`);
    if (view.contextBudget.omittedSummary) {
      const o = view.contextBudget.omittedSummary;
      lines.push(`- **省略对象总数**：${o.totalOmitted} 项`);
      for (const entry of o.entries) {
        lines.push(`  - [${entry.kind}] \`${entry.id}\`: ${entry.reason} (取回入口: \`${entry.retrievalLocator}\`)`);
      }
      lines.push(`- **完整取回入口指引**：${o.retrievalGuide}`);
    }
  }

  if (view.gapReport.hasGap) {
    lines.push(`\n> [!CAUTION] 缺口与矛盾告警`);
    lines.push(`> 检测到关键记录矛盾或缺失，严禁模型自主猜测执行：`);
    for (const m of view.gapReport.missingFacts) lines.push(`> - [缺失] ${m}`);
    for (const c of view.gapReport.contradictoryFacts) lines.push(`> - [矛盾] ${c}`);
  }

  lines.push(
    `\n> [!NOTE] 上下文最小化声明\n> 详细步骤事件流、未提炼候选与历史工具交互已完整归档于对应运行账本，本恢复视图仅保留冷启动最小上下文栈，杜绝冗余 Token 消耗与事实漂移。`
  );

  return lines.join('\n');
}

export function serializeRecoveryPayload(
  view: ProjectRecoveryView,
  format: RecoveryDeliveryFormat = 'compact_json'
): string {
  switch (format) {
    case 'formatted_json':
    case 'cli_json':
      return JSON.stringify(view, null, 2) + '\n';
    case 'cli_markdown':
      return renderRecoveryMarkdown(view) + '\n';
    case 'markdown':
      return renderRecoveryMarkdown(view);
    case 'compact_json':
    default:
      return JSON.stringify(view);
  }
}

function setExactActualBytes(
  view: ProjectRecoveryView,
  deliveryFormat: RecoveryDeliveryFormat = 'compact_json'
): number {
  if (!view.contextBudget) return 0;
  view.contextBudget.deliveryFormat = deliveryFormat;
  let payload = serializeRecoveryPayload(view, deliveryFormat);
  let actualBytes = getUtf8ByteLength(payload);
  view.contextBudget.actualBytes = actualBytes;
  payload = serializeRecoveryPayload(view, deliveryFormat);
  let nextBytes = getUtf8ByteLength(payload);
  let iterations = 0;
  while (nextBytes !== actualBytes && iterations < 5) {
    iterations++;
    actualBytes = nextBytes;
    view.contextBudget.actualBytes = actualBytes;
    payload = serializeRecoveryPayload(view, deliveryFormat);
    nextBytes = getUtf8ByteLength(payload);
  }
  return actualBytes;
}

export function computeRetainedRequiredSources(view: ProjectRecoveryView): Set<string> {
  const referencedSources = new Set<string>();
  if (view.goal?.intent?.sourceRefs) {
    for (const s of view.goal.intent.sourceRefs) referencedSources.add(s);
  }
  if (view.goal?.intent?.confirmationSourceRefs) {
    for (const s of view.goal.intent.confirmationSourceRefs) referencedSources.add(s);
  }
  if (view.goal?.activeRequirement?.sourceRefs) {
    for (const s of view.goal.activeRequirement.sourceRefs) referencedSources.add(s);
  }
  for (const c of view.contextItems ?? []) {
    for (const s of c.sourceRefs ?? []) referencedSources.add(s);
  }
  for (const v of view.evidence?.verifications ?? []) {
    for (const s of v.sourceRefs ?? []) referencedSources.add(s);
  }
  for (const e of view.evidence?.evidence ?? []) {
    for (const s of e.sourceRefs ?? []) referencedSources.add(s);
  }
  return referencedSources;
}

export function hasCompleteRequiredSources(view: ProjectRecoveryView): boolean {
  const requiredSources = computeRetainedRequiredSources(view);
  const existingSourceIds = new Set(view.evidence?.sources?.map(s => s.id) ?? []);
  for (const id of requiredSources) {
    if (!existingSourceIds.has(id)) {
      return false;
    }
  }
  return true;
}

function buildCompactStopView(params: {
  projectId: string;
  projectName: string;
  projectRevision: number;
  generatedAt: string;
  schemaVersion?: string;
  activeRequirement?: { id: string; title: string; status: RecordStatus } | null;
  maxBudgetBytes: number;
  deliveryFormat: RecoveryDeliveryFormat;
  why: string;
  missingFacts: string[];
  necessaryOverBudget?: boolean;
  omittedEntries?: OmittedItemEntry[];
  retrievalGuide?: string;
  standardsRules?: string[];
  standardsEndpoints?: string[];
  intentTitle?: string;
  intentId?: string;
  intentState?: string;
  requirementsCount?: RecoveryRequirementsCount;
  latestRunState?: string | null | undefined;
  pendingCandidateCount?: number | undefined;
  keptCandidateCount?: number | undefined;
  authorizationState?: RecoveryAuthorizations['authorizationState'] | undefined;
  activeGrant?: WorkspaceAuthorization | null | undefined;
  runtimeBinding?: ModelRuntimeBinding | null | undefined;
  targetRunId?: string | null | undefined;
  runRevision?: number | null | undefined;
  baseRevision?: number | null | undefined;
  retrievalEndpoint?: string | null | undefined;
  retrievalLocator?: string | null | undefined;
  authorizationNotes?: string[] | undefined;
}): ProjectRecoveryView {
  const retrievalGuide = params.retrievalGuide ??
    `完整记录可通过 GET /api/record-projects/${params.projectId} (基准修订: r${params.projectRevision}) 查看与取回。`;

  const totalOmitted = (params.omittedEntries ?? []).length;
  const boundedEntries = (params.omittedEntries ?? []).slice(0, 5);

  const stopView: ProjectRecoveryView = {
    projectId: params.projectId,
    projectName: params.projectName || '未命名项目',
    projectRevision: params.projectRevision ?? 0,
    generatedAt: params.generatedAt,
    standards: {
      schemaVersion: params.schemaVersion ?? '1.0.0',
      rules: params.standardsRules ? [...params.standardsRules] : ['AIDLC-R1: 意图为唯一规范事实源', 'AIDLC-R2: 模型仅产生候选'],
      updateProtocolEndpoints: params.standardsEndpoints ? [...params.standardsEndpoints] : [`/api/record-projects/${params.projectId}`]
    },
    goal: {
      intent: {
        id: params.intentId ?? 'INTENT',
        title: (params.intentTitle ?? '当前意图').slice(0, 100),
        problem: '',
        expectedOutcome: '',
        state: params.intentState ?? 'unknown',
        scope: { includes: [], excludes: [] },
        constraints: []
      },
      activeRequirement: params.activeRequirement ? {
        id: params.activeRequirement.id,
        title: params.activeRequirement.title.slice(0, 100),
        status: params.activeRequirement.status,
        problem: '',
        expectedOutcome: '',
        scope: { includes: [], excludes: [] },
        constraints: [],
        acceptanceCriteria: [],
        hasAcceptedOutcome: false
      } : null
    },
    progress: {
      intentState: params.intentState ?? 'unknown',
      requirementsCount: params.requirementsCount ?? { total: params.activeRequirement ? 1 : 0, draft: 0, review: 0, done: 0 },
      latestRunState: params.latestRunState ?? null,
      pendingCandidateCount: params.pendingCandidateCount ?? 0,
      keptCandidateCount: params.keptCandidateCount ?? 0
    },
    nextSafeAction: {
      actionCode: 'STOP_AND_REPORT_GAP',
      actor: 'human',
      description: params.necessaryOverBudget
        ? '停止自主执行并报告必要上下文体积超出预算上限'
        : '停止自主执行并报告记录结构错误与关键事实缺失',
      why: params.why,
      executableNow: false,
      waitingFor: 'human',
      prerequisitesMet: [],
      blockingIssues: [params.why]
    },
    authorizations: {
      projectRevision: params.projectRevision ?? 0,
      authorizationState: params.authorizationState ?? 'none',
      activeGrant: params.activeGrant ?? null,
      runtimeBinding: params.runtimeBinding ?? null,
      notes: params.authorizationNotes ? [...params.authorizationNotes] : [`项目基准修订 r${params.projectRevision}。`],
      targetRunId: params.targetRunId ?? null,
      ...(params.targetRunId ? {
        runRevision: params.runRevision ?? null,
        baseRevision: params.baseRevision ?? null,
        retrievalEndpoint: params.retrievalEndpoint ?? null,
        retrievalLocator: params.retrievalLocator ?? null
      } : {})
    },
    evidence: {
      sources: [],
      verifications: [],
      evidence: []
    },
    unknowns: {
      openQuestions: [],
      assumptions: [],
      unverifiedCriteria: [],
      invalidatedVerifications: [],
      pendingHumanGates: params.necessaryOverBudget
        ? ['人端核准恢复预算或指定更小范围']
        : ['人端核对并修复损坏的记录文件']
    },
    gapReport: {
      hasGap: true,
      missingFacts: [...params.missingFacts],
      contradictoryFacts: []
    },
    contextItems: [],
    contextBudget: {
      maxBudgetBytes: params.maxBudgetBytes,
      actualBytes: 0,
      truncated: true,
      necessaryOverBudget: params.necessaryOverBudget ?? true,
      deliveryFormat: params.deliveryFormat,
      omittedSummary: {
        totalOmitted,
        entries: boundedEntries,
        truncatedOmissionList: totalOmitted > boundedEntries.length,
        retrievalGuide
      }
    }
  };

  let actualBytes = setExactActualBytes(stopView, params.deliveryFormat);
  if (actualBytes <= params.maxBudgetBytes) {
    return stopView;
  }

  // 阶段 1：清空省略明细条目，收敛 missingFacts
  if (stopView.contextBudget?.omittedSummary) {
    stopView.contextBudget.omittedSummary.entries = [];
  }
  if (params.necessaryOverBudget) {
    stopView.gapReport.missingFacts = [`必要恢复上下文超出预算上限 (${params.maxBudgetBytes} 字节)`];
  } else if (stopView.gapReport.missingFacts.length > 3) {
    stopView.gapReport.missingFacts = stopView.gapReport.missingFacts.slice(0, 3);
  }
  actualBytes = setExactActualBytes(stopView, params.deliveryFormat);
  if (actualBytes <= params.maxBudgetBytes) {
    return stopView;
  }

  // 阶段 2：缩短 why 至 80 字符，精简规则、端点与取回指引；若授权详情过大或超限，省略授权明细并保留真实状态与回查入口
  stopView.nextSafeAction.why = stopView.nextSafeAction.why.slice(0, 80) + '... (已截断)';
  stopView.nextSafeAction.blockingIssues = [stopView.nextSafeAction.why];
  stopView.standards.rules = ['AIDLC: 意图为唯一规范事实源'];
  const targetRunEp = stopView.authorizations.retrievalEndpoint ?? (stopView.authorizations.targetRunId ? `/api/runs/${stopView.authorizations.targetRunId}` : null);
  stopView.standards.updateProtocolEndpoints = targetRunEp
    ? [`/api/record-projects/${params.projectId}`, targetRunEp]
    : [`/api/record-projects/${params.projectId}`];
  if (stopView.contextBudget?.omittedSummary) {
    stopView.contextBudget.omittedSummary.retrievalGuide = `/api/record-projects/${params.projectId}`;
  }
  if (stopView.authorizations.activeGrant || stopView.authorizations.runtimeBinding) {
    stopView.authorizations.activeGrant = null;
    stopView.authorizations.runtimeBinding = null;
    stopView.authorizations.authorizationDetailsOmitted = true;
    stopView.authorizations.notes = [
      `r${params.projectRevision}`,
      targetRunEp && stopView.authorizations.targetRunId
        ? `授权详情未在停止诊断中包含（真实授权状态保持为: ${stopView.authorizations.authorizationState}），需通过回查接口 GET ${targetRunEp} 重新核对运行 ${stopView.authorizations.targetRunId} 授权。`
        : `授权详情未在停止诊断中包含（真实授权状态保持为: ${stopView.authorizations.authorizationState}）。`
    ];
  } else {
    stopView.authorizations.notes = [`r${params.projectRevision}`];
  }
  actualBytes = setExactActualBytes(stopView, params.deliveryFormat);
  if (actualBytes <= params.maxBudgetBytes) {
    return stopView;
  }

  // 阶段 3：缩短标题（项目名称 20 字符，意图与需求标题 30 字符），压缩 why 至 50 字符
  stopView.projectName = stopView.projectName.slice(0, 20);
  stopView.goal.intent.title = stopView.goal.intent.title.slice(0, 30);
  if (stopView.goal.activeRequirement) {
    stopView.goal.activeRequirement.title = stopView.goal.activeRequirement.title.slice(0, 30);
  }
  stopView.nextSafeAction.why = stopView.nextSafeAction.why.slice(0, 50) + '...';
  stopView.nextSafeAction.blockingIssues = [stopView.nextSafeAction.why];
  if (params.necessaryOverBudget) {
    stopView.unknowns.pendingHumanGates = ['核准恢复预算'];
  }
  if (stopView.authorizations.authorizationDetailsOmitted) {
    const ep = stopView.authorizations.retrievalEndpoint ?? (stopView.authorizations.targetRunId ? `/api/runs/${stopView.authorizations.targetRunId}` : null);
    stopView.authorizations.notes = ep
      ? [`r${params.projectRevision}`, `授权详情已省略，回查: GET ${ep}`]
      : [`r${params.projectRevision}`, '授权详情已省略'];
  }
  actualBytes = setExactActualBytes(stopView, params.deliveryFormat);
  if (actualBytes <= params.maxBudgetBytes) {
    return stopView;
  }

  // 阶段 4：强力收敛非核心元数据，剥离规则与端点清单，清除省略明细容器
  stopView.projectName = stopView.projectName.slice(0, 10);
  stopView.goal.intent.title = stopView.goal.intent.title.slice(0, 15);
  if (stopView.goal.activeRequirement) {
    stopView.goal.activeRequirement.title = stopView.goal.activeRequirement.title.slice(0, 15);
  }
  stopView.standards.rules = [];
  stopView.standards.updateProtocolEndpoints = [];
  stopView.authorizations.notes = [];
  if (params.necessaryOverBudget) {
    stopView.nextSafeAction.description = '停止执行并报告上下文超限';
    stopView.nextSafeAction.why = '恢复上下文超出预算上限';
    stopView.nextSafeAction.blockingIssues = [stopView.nextSafeAction.why];
    stopView.gapReport.missingFacts = ['上下文超限'];
    stopView.unknowns.pendingHumanGates = [];
  } else {
    stopView.nextSafeAction.description = '停止执行并报告记录结构损坏';
    stopView.nextSafeAction.why = '项目记录结构损坏或合同校验失败';
    stopView.nextSafeAction.blockingIssues = [stopView.nextSafeAction.why];
    if (stopView.gapReport.missingFacts.length > 1) {
      stopView.gapReport.missingFacts = stopView.gapReport.missingFacts.slice(0, 1);
    }
    stopView.unknowns.pendingHumanGates = [];
  }
  if (stopView.contextBudget) {
    delete stopView.contextBudget.omittedSummary;
  }
  actualBytes = setExactActualBytes(stopView, params.deliveryFormat);
  if (actualBytes <= params.maxBudgetBytes) {
    return stopView;
  }

  // 阶段 5：终极紧凑骨架保障，确保在任何极小边界（如 4096 字节）下均严格合规
  stopView.projectName = '项目';
  stopView.goal.intent.title = '意图';
  if (stopView.goal.activeRequirement) {
    stopView.goal.activeRequirement.title = '需求';
  }
  if (params.necessaryOverBudget) {
    stopView.nextSafeAction.description = '停止';
    stopView.nextSafeAction.why = '超限';
    stopView.nextSafeAction.blockingIssues = ['超限'];
  } else {
    stopView.nextSafeAction.description = '停止';
    stopView.nextSafeAction.why = '结构损坏';
    stopView.nextSafeAction.blockingIssues = ['结构损坏'];
  }
  actualBytes = setExactActualBytes(stopView, params.deliveryFormat);
  if (actualBytes > params.maxBudgetBytes) {
    throw new HubError(
      413,
      'BUDGET_EXCEEDED',
      `恢复诊断包体积 (${actualBytes} 字节) 超出预算上限 (${params.maxBudgetBytes} 字节)，无法在指定预算内生成合规的诊断包。`
    );
  }

  return stopView;
}

function applyRecoveryBudget(
  view: ProjectRecoveryView,
  maxBudgetBytes: number,
  projectId: string,
  projectRevision: number,
  deliveryFormat: RecoveryDeliveryFormat = 'compact_json'
): ProjectRecoveryView {
  // 1. 检查完整视图是否已经在预算内
  view.contextBudget = {
    maxBudgetBytes,
    actualBytes: 0,
    truncated: false,
    deliveryFormat
  };
  const currentBytes = setExactActualBytes(view, deliveryFormat);
  if (currentBytes <= maxBudgetBytes) {
    return view;
  }

  // 2. 完整视图超预算：自底向上按确定顺序渐进式压缩与省略
  const omittedEntries: OmittedItemEntry[] = [];
  const retrievalGuide = `完整省略对象可通过 GET /api/record-projects/${projectId} (基准修订: r${projectRevision}) 查看与取回。`;

  // 步骤 1: 压缩/剥离 sources 中的长 excerpt
  for (const s of view.evidence.sources) {
    if (s.excerpt) {
      omittedEntries.push({
        kind: 'source_excerpt',
        id: s.id,
        reason: '源码摘要片段过长，已压缩省略正文，保留定位行号与标识',
        retrievalLocator: `/api/record-projects/${projectId}#records.sources[id=${s.id}].excerpt`
      });
      s.excerpt = null;
    }
  }
  if (measureBudget(view, maxBudgetBytes, omittedEntries, projectId, projectRevision, deliveryFormat)) {
    return view;
  }

  // 步骤 2: 截断 evidence 观测结果与描述
  for (const e of view.evidence.evidence) {
    if (e.observedResult && e.observedResult.length > 64) {
      omittedEntries.push({
        kind: 'evidence_detail',
        id: e.id,
        reason: '证据观测结果过长，已截断至 64 字符',
        retrievalLocator: `/api/record-projects/${projectId}#records.evidence[id=${e.id}].observedResult`
      });
      e.observedResult = e.observedResult.slice(0, 64) + '... (已截断)';
    }
    if (e.description) {
      e.description = null;
    }
  }
  if (measureBudget(view, maxBudgetBytes, omittedEntries, projectId, projectRevision, deliveryFormat)) {
    return view;
  }

  // 步骤 3: 省略次要假设 (assumptions)
  const assumptions = view.contextItems.filter(c => c.category === 'assumption');
  if (assumptions.length > 0) {
    for (const asm of assumptions) {
      omittedEntries.push({
        kind: 'assumption',
        id: asm.id,
        reason: '次要假设已从恢复包中省略',
        retrievalLocator: `/api/record-projects/${projectId}#records.contextItems[id=${asm.id}]`
      });
    }
    view.unknowns.assumptions = [];
    view.contextItems = view.contextItems.filter(c => c.category !== 'assumption');
  }
  if (measureBudget(view, maxBudgetBytes, omittedEntries, projectId, projectRevision, deliveryFormat)) {
    return view;
  }

  // 步骤 4: 省略非通过态或历史核查记录
  const keptVerifications = view.evidence.verifications.filter(v => v.outcome === 'passed');
  const omittedVerifications = view.evidence.verifications.filter(v => v.outcome !== 'passed');
  if (omittedVerifications.length > 0) {
    for (const v of omittedVerifications) {
      omittedEntries.push({
        kind: 'verification',
        id: v.id,
        reason: `非通过态核查 (outcome=${v.outcome}) 已从恢复包中省略`,
        retrievalLocator: `/api/record-projects/${projectId}#records.verifications[id=${v.id}]`
      });
    }
    view.evidence.verifications = keptVerifications;
  }
  if (measureBudget(view, maxBudgetBytes, omittedEntries, projectId, projectRevision, deliveryFormat)) {
    return view;
  }

  // 步骤 5: 省略候选决定与未确认讨论项 (Gap 2 修复)
  const optionalContextItems = view.contextItems.filter(
    c => !(c.category === 'constraint' ||
           (c.category === 'decision' && c.epistemicStatus === 'confirmed') ||
           (c.category === 'open_question' && c.epistemicStatus === 'unknown'))
  );
  if (optionalContextItems.length > 0) {
    for (const item of optionalContextItems) {
      omittedEntries.push({
        kind: 'context_item',
        id: item.id,
        reason: item.category === 'decision' && item.epistemicStatus === 'proposed'
          ? '候选决定（尚未由人工确认）已从恢复包中省略'
          : '次要背景讨论项已从恢复包中省略',
        retrievalLocator: `/api/record-projects/${projectId}#records.contextItems[id=${item.id}]`
      });
    }
    view.contextItems = view.contextItems.filter(
      c => c.category === 'constraint' ||
           (c.category === 'decision' && c.epistemicStatus === 'confirmed') ||
           (c.category === 'open_question' && c.epistemicStatus === 'unknown')
    );
  }
  if (measureBudget(view, maxBudgetBytes, omittedEntries, projectId, projectRevision, deliveryFormat)) {
    return view;
  }

  // 步骤 6: 裁剪未被保留项引用的次要 sources (Gap 1 修复：保护 Intent, confirmation, activeRequirement, contextItems, verifications, evidence 所引用的所有出处闭包)
  const referencedSources = computeRetainedRequiredSources(view);

  const keptSources = view.evidence.sources.filter(s => referencedSources.has(s.id));
  const unrefSources = view.evidence.sources.filter(s => !referencedSources.has(s.id));
  if (unrefSources.length > 0) {
    for (const s of unrefSources) {
      omittedEntries.push({
        kind: 'source_excerpt',
        id: s.id,
        reason: '未被当前保留项引用的次要来源记录已省略',
        retrievalLocator: `/api/record-projects/${projectId}#records.sources[id=${s.id}]`
      });
    }
    view.evidence.sources = keptSources;
  }
  if (measureBudget(view, maxBudgetBytes, omittedEntries, projectId, projectRevision, deliveryFormat)) {
    if (hasCompleteRequiredSources(view)) {
      return view;
    }
  }

  // 步骤 7: 可选内容已全部剪裁，但必要内容体积仍然超限 (Gap 2 & Gap 3 修复：真实传递事实状态与有界渐进压缩)
  const necessaryBytes = view.contextBudget?.actualBytes ?? maxBudgetBytes;
  const overageBytes = Math.max(1, necessaryBytes - maxBudgetBytes);
  const why = `必要上下文（意图、当前需求、已确认决定、约束及出处闭包）在格式 ${deliveryFormat} 下体积（${necessaryBytes} 字节）超出设定的预算上限（${maxBudgetBytes} 字节，超出 ${overageBytes} 字节）。当前无法在安全预算内完整呈现必要依据。建议通过指定具体目标需求缩小范围，或在恢复请求中显式调大 budgetBytes 参数（例如 --budgetBytes ${Math.min(MAX_RECOVERY_BUDGET_BYTES, Math.ceil(necessaryBytes * 1.2))}）重试。`;

  return buildCompactStopView({
    projectId,
    projectName: view.projectName,
    projectRevision,
    generatedAt: view.generatedAt,
    schemaVersion: view.standards.schemaVersion,
    activeRequirement: view.goal.activeRequirement ? {
      id: view.goal.activeRequirement.id,
      title: view.goal.activeRequirement.title,
      status: view.goal.activeRequirement.status
    } : null,
    intentTitle: view.goal.intent.title,
    intentId: view.goal.intent.id,
    intentState: view.goal.intent.state,
    requirementsCount: view.progress.requirementsCount,
    latestRunState: view.progress.latestRunState,
    pendingCandidateCount: view.progress.pendingCandidateCount,
    keptCandidateCount: view.progress.keptCandidateCount,
    authorizationState: view.authorizations.authorizationState,
    activeGrant: view.authorizations.activeGrant,
    runtimeBinding: view.authorizations.runtimeBinding,
    targetRunId: view.authorizations.targetRunId,
    runRevision: view.authorizations.runRevision,
    baseRevision: view.authorizations.baseRevision,
    retrievalEndpoint: view.authorizations.retrievalEndpoint,
    retrievalLocator: view.authorizations.retrievalLocator,
    authorizationNotes: view.authorizations.notes,
    maxBudgetBytes,
    deliveryFormat,
    why,
    missingFacts: [`必要恢复上下文体积 (${necessaryBytes} 字节) 超出预算上限 (${maxBudgetBytes} 字节)`],
    necessaryOverBudget: true,
    omittedEntries,
    retrievalGuide
  });
}

function measureBudget(
  view: ProjectRecoveryView,
  maxBudgetBytes: number,
  omittedEntries: OmittedItemEntry[],
  projectId: string,
  projectRevision: number,
  deliveryFormat: RecoveryDeliveryFormat
): boolean {
  const totalOmitted = omittedEntries.length;
  // 有界省略清单（最多 10 条，防止省略清单自身耗尽预算）
  const boundedEntries = omittedEntries.slice(0, 10);
  view.contextBudget = {
    maxBudgetBytes,
    actualBytes: 0,
    truncated: totalOmitted > 0,
    deliveryFormat,
    ...(totalOmitted > 0 ? {
      omittedSummary: {
        totalOmitted,
        entries: boundedEntries,
        truncatedOmissionList: totalOmitted > 10,
        retrievalGuide: `完整省略对象可通过 GET /api/record-projects/${projectId} (基准修订: r${projectRevision}) 查看与取回。`
      }
    } : {})
  };
  const actualBytes = setExactActualBytes(view, deliveryFormat);
  return actualBytes <= maxBudgetBytes;
}

export function analyzeProjectAuthorizations(params: {
  runs: HarnessRun[];
  projectRevision: number;
  targetRequirementId?: string | null;
  isProjectCorrupted?: boolean;
  now?: number;
}): RecoveryAuthorizations {
  const now = params.now ?? Date.now();
  const authNotes: string[] = [];
  let authState: RecoveryAuthorizationState = 'none';
  let targetRun: HarnessRun | undefined;
  let activeGrant: WorkspaceAuthorization | null = null;
  let runtimeBinding: ModelRuntimeBinding | null = null;
  let targetRunId: string | null = null;
  let runRevision: number | null = null;
  let baseRevision: number | null = null;
  let retrievalEndpoint: string | null = null;
  let retrievalLocator: string | null = null;

  const validRuns = Array.isArray(params.runs) ? params.runs : [];

  if (validRuns.length === 0) {
    authState = 'none';
    if (params.targetRequirementId) {
      authNotes.push(`需求 ${params.targetRequirementId} 尚无运行记录，未授予任何工作区或模型外发权限。`);
    } else {
      authNotes.push('当前没有选定活跃需求，未分配任何运行授权。');
    }
  } else if (params.targetRequirementId) {
    const reqRuns = validRuns.filter(r => r.requirementId === params.targetRequirementId);
    if (reqRuns.length === 0) {
      authState = 'none';
      authNotes.push(`需求 ${params.targetRequirementId} 尚无运行记录，未授予任何工作区或模型外发权限。`);
    } else {
      targetRun = reqRuns[reqRuns.length - 1];
    }
  } else {
    // 未指定 targetRequirementId
    const distinctReqIds = Array.from(new Set(validRuns.map(r => r.requirementId)));
    if (distinctReqIds.length === 1) {
      targetRun = validRuns[validRuns.length - 1];
    } else {
      authState = 'unknown';
      authNotes.push(`存在跨多个不同需求 (${distinctReqIds.join(', ')}) 的运行记录，但未指定目标需求，授权归属状态未知。`);
    }
  }

  if (targetRun) {
    targetRunId = targetRun.id;
    runRevision = targetRun.revision;
    baseRevision = targetRun.baseRevision;
    retrievalEndpoint = `/api/runs/${targetRun.id}`;
    retrievalLocator = `${targetRun.id}.json`;
    runtimeBinding = targetRun.runtime ?? null;
    if (targetRun.authorization?.workspace?.authorized) {
      activeGrant = targetRun.authorization.workspace;
    }

    const expiresAtMs = targetRun.authorization?.expiresAt ? new Date(targetRun.authorization.expiresAt).getTime() : 0;
    const isExpired = !expiresAtMs || expiresAtMs <= now;
    const isStaleRevision = targetRun.baseRevision !== params.projectRevision;

    if (!targetRun.authorization?.active || targetRun.state === 'cancelled') {
      authState = 'revoked';
      authNotes.push(`运行 ${targetRun.id} 的授权已被主动撤销或处于非活跃状态。`);
    } else if (params.isProjectCorrupted) {
      authState = 'unverified_due_to_corruption';
      authNotes.push(`运行 ${targetRun.id} 账本记录存在有效授权配置，但因正式项目结构损坏或合同校验失败，基准修订与需求适用性无法可靠核对，禁止继续执行。`);
    } else if (isStaleRevision) {
      authState = 'stale_revision';
      authNotes.push(`运行 ${targetRun.id} 基于项目修订 r${targetRun.baseRevision}，当前正式项目已前进至 r${params.projectRevision}。依据 D18.1 保守策略，旧步骤观察与授权不得静默跨修订继承。`);
    } else if (isExpired) {
      authState = 'expired';
      authNotes.push(`运行 ${targetRun.id} 授权已于 ${targetRun.authorization.expiresAt} 到期（已过期），读取恢复视图不自动续期，需人端重新授权。`);
    } else if (targetRun.state === 'running' || targetRun.state === 'waiting_human') {
      authState = 'valid';
      authNotes.push(`运行 ${targetRun.id} 处于有效授权窗口内 (有效至: ${targetRun.authorization.expiresAt})，与当前项目修订 r${params.projectRevision} 严格对齐。`);
    } else {
      authState = 'expired';
      authNotes.push(`运行 ${targetRun.id} 处于终态 (${targetRun.state})，原单轮授权已结束。`);
    }
  }

  if (!targetRun) {
    return {
      projectRevision: params.projectRevision,
      authorizationState: authState,
      activeGrant,
      runtimeBinding,
      notes: authNotes,
      targetRunId: null
    };
  }

  return {
    projectRevision: params.projectRevision,
    authorizationState: authState,
    activeGrant,
    runtimeBinding,
    notes: authNotes,
    targetRunId,
    runRevision,
    baseRevision,
    retrievalEndpoint,
    retrievalLocator
  };
}

export interface RetrievedRunAuthorizationChecks {
  identityMatch: boolean;
  projectBindingMatch: boolean;
  requirementBindingMatch: boolean;
  requirementExistsInCurrentProject: boolean;
  projectStructureHealthy: boolean;
  projectRelationsValid: boolean;
  projectRevisionCurrent: boolean;
  runRevisionCurrent: boolean;
  runNotExpired: boolean;
  runActive: boolean;
  runStateApplicable: boolean;
}

export interface RetrievedRunAuthorizationVerification {
  valid: boolean;
  runAuthorizationApplicable: boolean;
  workspaceAccessGranted: boolean;
  executableNow: boolean;
  state: RecoveryAuthorizationState;
  reason: string;
  run: HarnessRun | null;
  targetProjectId: string;
  targetRequirementId: string | null;
  targetRunId: string | null;
  currentProjectRevision: number | null;
  runRevision: number | null;
  baseRevision: number | null;
  observedAt: string;
  checks: RetrievedRunAuthorizationChecks;
  activeGrant: WorkspaceAuthorization | null;
  runtimeBinding: ModelRuntimeBinding | null;
  authorizationDetailsOmitted?: boolean;
  notes?: string[];
  retrievalLocator?: string | null;
  retrievalEndpoint?: string | null;
}

export function verifyRetrievedRunAuthorization(params: {
  run?: HarnessRun | null | undefined;
  recoveryView: ProjectRecoveryView;
  currentProject?: RecordProject | null | undefined;
  currentProjectRevision?: number | undefined;
  validator?: { check: (records: unknown) => { valid: boolean; issues?: unknown[] } } | undefined;
  now?: number | undefined;
}): RetrievedRunAuthorizationVerification {
  const { run, recoveryView, currentProject, validator } = params;
  const now = params.now ?? Date.now();
  const observedAt = new Date(now).toISOString();

  const checks: RetrievedRunAuthorizationChecks = {
    identityMatch: false,
    projectBindingMatch: false,
    requirementBindingMatch: false,
    requirementExistsInCurrentProject: false,
    projectStructureHealthy: false,
    projectRelationsValid: false,
    projectRevisionCurrent: false,
    runRevisionCurrent: false,
    runNotExpired: false,
    runActive: false,
    runStateApplicable: false
  };

  const expectedProjectId = recoveryView.projectId;
  const expectedReqId = recoveryView.goal.activeRequirement?.id ?? null;
  const expectedRunId = recoveryView.authorizations.targetRunId ?? null;

  // 0. 恢复视图本身若标记为结构损坏，绝不能盲目执行
  if (recoveryView.authorizations.authorizationState === 'unverified_due_to_corruption') {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unverified_due_to_corruption',
      reason: '恢复视图记录存在结构损坏或合同校验失败，运行授权适用性未经验证，禁止执行',
      run: run ?? null,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject?.revision ?? recoveryView.projectRevision,
      runRevision: run?.revision ?? null,
      baseRevision: run?.baseRevision ?? null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run?.runtime ?? null
    };
  }

  // 0.5 必须具备当前重新读取的正式项目读取依据；若未提供或读取失败，严禁推导授权适用性
  if (!currentProject) {
    checks.projectStructureHealthy = false;
    checks.projectRelationsValid = false;
    checks.requirementExistsInCurrentProject = false;
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unverified_due_to_corruption',
      reason: '缺少当前正式项目读取依据（未提供当前项目或读取失败），无法执行结构与关系校验，禁止推导授权适用性',
      run: run ?? null,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: params.currentProjectRevision ?? recoveryView.projectRevision ?? null,
      runRevision: run?.revision ?? null,
      baseRevision: run?.baseRevision ?? null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run?.runtime ?? null
    };
  }

  // 核验当前项目的结构健康度与 Schema
  const records = (currentProject as any).records ?? currentProject;
  const basicHealth = validateBasicStructuralHealth(records);
  let isHealthy = basicHealth.valid;
  if (isHealthy && validator) {
    isHealthy = validator.check(records).valid;
  }
  if (!isHealthy) {
    checks.projectStructureHealthy = false;
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unverified_due_to_corruption',
      reason: '当前正式项目存在结构损坏或合同校验错误，运行授权无法安全核验',
      run: run ?? null,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: run?.revision ?? null,
      baseRevision: run?.baseRevision ?? null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run?.runtime ?? null
    };
  }
  checks.projectStructureHealthy = true;

  // 复用正式记录完整关系校验（inspectRecordRelations，严禁另写弱化版本）
  const relationIssues = inspectRecordRelations(records as RecordSet);
  if (relationIssues.length > 0) {
    checks.projectRelationsValid = false;
    const issueSummary = relationIssues
      .slice(0, 3)
      .map(i => `[${i.code}] ${i.path}: ${i.message}`)
      .join('; ');
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unverified_due_to_corruption',
      reason: `当前正式项目未通过完整关系校验（发现 ${relationIssues.length} 项违规: ${issueSummary}），存在悬空出处引用或归属错误，运行授权无法安全核验`,
      run: run ?? null,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: run?.revision ?? null,
      baseRevision: run?.baseRevision ?? null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run?.runtime ?? null
    };
  }
  checks.projectRelationsValid = true;

  // 1. 恢复视图本身是否处于未选定目标需求或授权状态为 unknown
  if (
    recoveryView.nextSafeAction.actionCode === 'SELECT_TARGET_REQUIREMENT' ||
    recoveryView.authorizations.authorizationState === 'unknown'
  ) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unknown',
      reason: '恢复视图处于未选定目标需求状态 (SELECT_TARGET_REQUIREMENT / unknown)，禁止消费者自行选定运行并宣称有效',
      run: run ?? null,
      targetProjectId: expectedProjectId,
      targetRequirementId: null,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: run?.revision ?? null,
      baseRevision: run?.baseRevision ?? null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run?.runtime ?? null
    };
  }

  // 2. 恢复视图是否缺少目标运行绑定
  if (!expectedRunId) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: recoveryView.authorizations.authorizationState || 'none',
      reason: '恢复视图未绑定目标运行 (targetRunId 为空)，无有效运行授权可供核对',
      run: run ?? null,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: null,
      currentProjectRevision: currentProject.revision,
      runRevision: run?.revision ?? null,
      baseRevision: run?.baseRevision ?? null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run?.runtime ?? null
    };
  }

  // 3. 恢复视图是否缺少活跃目标需求
  if (!expectedReqId) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unknown',
      reason: '恢复视图缺少活跃目标需求定义 (activeRequirement 为空)',
      run: run ?? null,
      targetProjectId: expectedProjectId,
      targetRequirementId: null,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: run?.revision ?? null,
      baseRevision: run?.baseRevision ?? null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run?.runtime ?? null
    };
  }

  // 3.5 校验是否成功读取到运行账本记录
  if (!run) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'none',
      reason: `未读取到目标运行账本内容 (${expectedRunId})`,
      run: null,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: null,
      baseRevision: null,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: null
    };
  }

  // 4. 运行 ID 对应性检查
  if (run.id !== expectedRunId) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unknown',
      reason: `取回的运行 ID (${run.id}) 与恢复视图指定的 targetRunId (${expectedRunId}) 不匹配`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject?.revision ?? recoveryView.projectRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.identityMatch = true;

  // 5. 运行所属项目归属检查（防止跨项目错绑）
  if (run.projectId !== expectedProjectId) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unknown',
      reason: `取回的运行所属项目 (${run.projectId}) 与恢复视图指定的项目 (${expectedProjectId}) 不匹配（跨项目错绑）`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject?.revision ?? recoveryView.projectRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.projectBindingMatch = true;

  // 6. 运行所属需求归属检查（防止跨需求错绑）
  if (run.requirementId !== expectedReqId) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unknown',
      reason: `取回的运行所属需求 (${run.requirementId}) 与恢复视图目标需求 (${expectedReqId}) 不匹配（跨需求错绑）`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject?.revision ?? recoveryView.projectRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.requirementBindingMatch = true;

  // 7. 核验当前项目 ID 是否匹配
  if (currentProject.id !== expectedProjectId) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'unknown',
      reason: `当前重新读取的正式项目 ID (${currentProject.id}) 与恢复视图项目 ID (${expectedProjectId}) 不匹配`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }

  // 8. 核验目标需求在当前项目中依然存在且意图未漂移
  const currentReq = currentProject.records.requirements?.find(r => r.id === expectedReqId);
  if (!currentReq) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'none',
      reason: `目标需求 ${expectedReqId} 在当前正式项目中不存在（可能已被移除）`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  if (currentReq.intentId !== currentProject.records.intent?.id) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'none',
      reason: `目标需求 ${expectedReqId} 的意图归属已发生漂移（${currentReq.intentId} !== ${currentProject.records.intent?.id}）`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentProject.revision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.requirementExistsInCurrentProject = true;
  const currentRevision = currentProject.revision;

  // 9. 检查运行修订是否发生漂移（运行账本在磁盘中被篡改）
  if (
    recoveryView.authorizations.runRevision !== undefined &&
    recoveryView.authorizations.runRevision !== null &&
    run.revision !== recoveryView.authorizations.runRevision
  ) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'stale_revision',
      reason: `运行修订发生漂移（恢复视图抓取时为 r${recoveryView.authorizations.runRevision}，当前账本为 r${run.revision}），需重新获取恢复视图`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.runRevisionCurrent = true;

  // 10. 检查运行基准修订与当前项目最新修订是否一致（项目发生了推进）
  if (run.baseRevision !== currentRevision) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'stale_revision',
      reason: `运行基准修订 (r${run.baseRevision}) 与当前项目最新修订 (r${currentRevision}) 不一致，依据 D18.1 保守策略禁止跨修订继承`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.projectRevisionCurrent = true;

  // 11. 检查授权是否已被主动撤销或取消
  if (!run.authorization?.active || run.state === 'cancelled') {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'revoked',
      reason: `运行 ${run.id} 的授权已被主动撤销或处于非活跃/取消状态`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.runActive = true;

  // 12. 检查授权是否已超时过期
  const expiresAtMs = run.authorization?.expiresAt ? new Date(run.authorization.expiresAt).getTime() : 0;
  if (!expiresAtMs || expiresAtMs <= now) {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'expired',
      reason: `运行 ${run.id} 授权已于 ${run.authorization?.expiresAt} 到期（已过期），不能作为有效授权使用`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.runNotExpired = true;

  // 13. 检查运行生命周期状态（必须处于 running 或 waiting_human）
  if (run.state !== 'running' && run.state !== 'waiting_human') {
    return {
      valid: false,
      runAuthorizationApplicable: false,
      workspaceAccessGranted: false,
      executableNow: false,
      state: 'expired',
      reason: `运行 ${run.id} 已处于终态 (${run.state})，单轮执行已结束`,
      run,
      targetProjectId: expectedProjectId,
      targetRequirementId: expectedReqId,
      targetRunId: expectedRunId,
      currentProjectRevision: currentRevision,
      runRevision: run.revision,
      baseRevision: run.baseRevision,
      observedAt,
      checks,
      activeGrant: null,
      runtimeBinding: run.runtime ?? null
    };
  }
  checks.runStateApplicable = true;

  // 14. 语义细分：运行授权适用 vs 是否获准读取工作区 vs 是否可执行
  const activeGrant = run.authorization?.workspace?.authorized ? run.authorization.workspace : null;
  const workspaceAccessGranted = Boolean(activeGrant);
  const runAuthorizationApplicable = true;
  const valid = true;
  const executableNow = runAuthorizationApplicable && Boolean(recoveryView.nextSafeAction?.executableNow);

  const workspaceNote = workspaceAccessGranted
    ? `，且已获准工作区读取（根目录: \`${activeGrant!.root}\`）`
    : `，但未被授予工作区读取权限（仅限使用正式记录上下文）`;

  return {
    valid,
    runAuthorizationApplicable,
    workspaceAccessGranted,
    executableNow,
    state: 'valid',
    reason: `运行 ${run.id} 授权经核对有效，基准修订严格对齐 (r${currentRevision})${workspaceNote}`,
    run,
    targetProjectId: expectedProjectId,
    targetRequirementId: expectedReqId,
    targetRunId: expectedRunId,
    currentProjectRevision: currentRevision,
    runRevision: run.revision,
    baseRevision: run.baseRevision,
    observedAt,
    checks,
    activeGrant,
    runtimeBinding: run.runtime ?? null,
    retrievalLocator: recoveryView.authorizations.retrievalLocator ?? (expectedRunId ? `${expectedRunId}.json` : null),
    retrievalEndpoint: recoveryView.authorizations.retrievalEndpoint ?? null
  };
}

export function renderVerificationMarkdown(
  v: RetrievedRunAuthorizationVerification,
  options?: { maxBudgetBytes?: number }
): string {
  const budget = options?.maxBudgetBytes ?? DEFAULT_RECOVERY_BUDGET_BYTES;
  const lines: string[] = [];
  lines.push(`# 跨会话冷启动恢复：运行授权核对报告`);
  lines.push(`> 核对时点: ${v.observedAt} · 项目: ${v.targetProjectId} (r${v.currentProjectRevision ?? 'none'}) · 目标需求: ${v.targetRequirementId ?? '未选定'}\n`);

  lines.push(`## 1. 核对结论（Verdict）`);
  lines.push(`- **整体重检结论**：${v.valid ? '✅ 通过' : '❌ 未通过'}`);
  lines.push(`- **授权状态**：\`${v.state}\``);
  lines.push(`- **运行授权是否适用**：${v.runAuthorizationApplicable ? '是' : '否'}`);
  lines.push(`- **是否获准读取工作区**：${v.workspaceAccessGranted ? `是 (根目录: \`${v.activeGrant?.root ?? '已授权'}\`)` : '否 (未授权工作区，仅限使用正式记录上下文)'}`);
  lines.push(`- **恢复动作是否可执行**：${v.executableNow ? '是' : '否'}`);
  if (v.retrievalLocator || v.retrievalEndpoint) {
    lines.push(`- **运行定位**：\`${v.retrievalLocator ?? v.retrievalEndpoint}\``);
  }
  lines.push(`- **结论说明**：${v.reason}`);

  lines.push(`\n## 2. 详细核对清单（Checks）`);
  lines.push(`- [${v.checks.identityMatch ? 'x' : ' '}] 运行标识对齐：\`${v.run?.id ?? v.targetRunId ?? 'none'}\``);
  lines.push(`- [${v.checks.projectBindingMatch ? 'x' : ' '}] 项目归属对齐：\`${v.run?.projectId ?? v.targetProjectId}\``);
  lines.push(`- [${v.checks.requirementBindingMatch ? 'x' : ' '}] 需求归属对齐：\`${v.run?.requirementId ?? v.targetRequirementId ?? 'none'}\``);
  lines.push(`- [${v.checks.requirementExistsInCurrentProject ? 'x' : ' '}] 需求在当前项目中存在且意图一致`);
  lines.push(`- [${v.checks.projectStructureHealthy ? 'x' : ' '}] 当前正式项目结构健康无损坏`);
  lines.push(`- [${v.checks.projectRelationsValid ? 'x' : ' '}] 当前正式项目关系校验完整有效（无悬空引用/无环）`);
  lines.push(`- [${v.checks.projectRevisionCurrent ? 'x' : ' '}] 项目基准修订严格对齐 (r${v.currentProjectRevision ?? 'none'})`);
  lines.push(`- [${v.checks.runRevisionCurrent ? 'x' : ' '}] 运行账本修订未发生漂移 (r${v.run?.revision ?? v.runRevision ?? 'none'})`);
  lines.push(`- [${v.checks.runNotExpired ? 'x' : ' '}] 运行授权在有效期内`);
  lines.push(`- [${v.checks.runActive ? 'x' : ' '}] 运行授权活跃未被撤销`);
  lines.push(`- [${v.checks.runStateApplicable ? 'x' : ' '}] 运行处于活跃生命周期 (running / waiting_human)`);

  if (v.runtimeBinding) {
    lines.push(`\n## 3. 绑定运行时信息`);
    lines.push(`- **运行时**：\`${v.runtimeBinding.id}\` · 模型: \`${v.runtimeBinding.model}\` · 端点: \`${v.runtimeBinding.endpoint}\``);
  }

  // 授权明细：若工作区已授权，且 readScope 较大或已被显式标记省略，展示有界附注，避免无差别回显几百条路径
  if (v.workspaceAccessGranted && v.activeGrant) {
    const isLarge = (v.activeGrant.readScope?.length ?? 0) > 10;
    if (isLarge || v.authorizationDetailsOmitted) {
      lines.push(`\n## 4. 工作区授权详情`);
      lines.push(`- **根目录**：\`${v.activeGrant.root}\``);
      lines.push(`- **读取范围规则数**：${v.activeGrant.readScope?.length ?? 0} 条`);
      lines.push(`> [!NOTE] 授权读取范围清单因报告预算限制未逐条展开（authorizationDetailsOmitted: true），真实有效性已重检，完整清单可回查 \`${v.retrievalLocator ?? (v.targetRunId ? `${v.targetRunId}.json` : 'run.json')}\`。`);
    }
  }

  let text = lines.join('\n');
  if (getUtf8ByteLength(text + '\n') > budget) {
    const truncatedReason = v.reason.length > 80 ? v.reason.slice(0, 77) + '...' : v.reason;
    const compactLines = lines.map(l => l.startsWith('- **结论说明**：') ? `- **结论说明**：${truncatedReason}` : l);
    text = compactLines.join('\n');
  }

  if (getUtf8ByteLength(text + '\n') > budget) {
    throw new HubError(
      413,
      'BUDGET_EXCEEDED',
      `CLI 验证 Markdown 报告无法在设定预算 (${budget} 字节) 内安全容纳必要核对结论与检查清单。`
    );
  }

  return text;
}

export function createVerificationJsonReport(
  v: RetrievedRunAuthorizationVerification,
  options?: { maxBudgetBytes?: number }
): Record<string, unknown> {
  const budget = options?.maxBudgetBytes ?? DEFAULT_RECOVERY_BUDGET_BYTES;

  const fullReport: Record<string, unknown> = {
    valid: v.valid,
    runAuthorizationApplicable: v.runAuthorizationApplicable,
    workspaceAccessGranted: v.workspaceAccessGranted,
    executableNow: v.executableNow,
    state: v.state,
    reason: v.reason,
    targetProjectId: v.targetProjectId,
    targetRequirementId: v.targetRequirementId,
    targetRunId: v.targetRunId,
    currentProjectRevision: v.currentProjectRevision,
    runRevision: v.runRevision,
    baseRevision: v.baseRevision,
    observedAt: v.observedAt,
    checks: v.checks,
    activeGrant: v.activeGrant,
    runtimeBinding: v.runtimeBinding
  };

  const fullJson = JSON.stringify(fullReport, null, 2) + '\n';
  if (getUtf8ByteLength(fullJson) <= budget) {
    return fullReport;
  }

  // 预算超限：安全省略 activeGrant 明细，标注 authorizationDetailsOmitted: true，严禁将截断伪装为完整授权
  const compactReport: Record<string, unknown> = {
    valid: v.valid,
    runAuthorizationApplicable: v.runAuthorizationApplicable,
    workspaceAccessGranted: v.workspaceAccessGranted,
    executableNow: v.executableNow,
    state: v.state,
    reason: v.reason,
    targetProjectId: v.targetProjectId,
    targetRequirementId: v.targetRequirementId,
    targetRunId: v.targetRunId,
    currentProjectRevision: v.currentProjectRevision,
    runRevision: v.runRevision,
    baseRevision: v.baseRevision,
    observedAt: v.observedAt,
    checks: v.checks,
    authorizationDetailsOmitted: true,
    activeGrant: null,
    runtimeBinding: v.runtimeBinding,
    retrievalLocator: v.targetRunId ? `${v.targetRunId}.json` : null,
    retrievalEndpoint: v.targetRunId ? `/api/runs/${v.targetRunId}` : null,
    notes: [
      `工作区授权清单明细因报告预算限制未在此展开（authorizationDetailsOmitted: true）；真实授权有效性已由消费端重检通过，完整账本可通过定位符 \`${v.targetRunId ? `${v.targetRunId}.json` : 'none'}\` 回查。`
    ]
  };

  const compactJson = JSON.stringify(compactReport, null, 2) + '\n';
  if (getUtf8ByteLength(compactJson) <= budget) {
    return compactReport;
  }

  // 若在极限预算（如 4096 字节）下依然偏大，进一步缩短 reason 与 notes
  const ultraCompact: Record<string, unknown> = {
    ...compactReport,
    reason: v.reason.length > 100 ? v.reason.slice(0, 97) + '...' : v.reason,
    notes: [`授权明细因预算已省略（${v.targetRunId ?? 'none'}.json）`]
  };
  const ultraJson = JSON.stringify(ultraCompact, null, 2) + '\n';
  if (getUtf8ByteLength(ultraJson) <= budget) {
    return ultraCompact;
  }

  throw new HubError(
    413,
    'BUDGET_EXCEEDED',
    `CLI 验证 JSON 报告无法在设定预算 (${budget} 字节) 内安全容纳必要核对结论与检查清单。`
  );
}

/**
 * 纯领域投影：复用正式 RecordProject 记录结构与关系校验，
 * 提炼最小可恢复上下文栈（Current State, Intent & Scope, Standards, Evidence Links, Update Protocol），
 * 回答冷启动新会话推导所需的 7 个核心问题，推导具备完整事实依据的下一步安全动作。
 */
export function buildRecoveryProjection(
  project: RecordProject,
  runs: HarnessRun[] = [],
  options?: RecoveryBuildOptions
): ProjectRecoveryView {
  const data = project.records;
  const missingFacts: string[] = [];
  const contradictoryFacts: string[] = [];
  const now = options?.now ?? Date.now();
  const maxBudgetBytes = validateRecoveryBudget(options?.maxBudgetBytes);
  const deliveryFormat: RecoveryDeliveryFormat = options?.deliveryFormat ?? 'compact_json';

  // 0. Fail-Closed 基础结构校验：遇到数据结构损坏，绝不读取损坏字段，不调用关系检查，不抛出未捕获异常
  const structuralHealth = validateBasicStructuralHealth(data);
  const isCorruptedStructure =
    !structuralHealth.valid ||
    Boolean(options?.structureIssues && options.structureIssues.length > 0);

  if (isCorruptedStructure) {
    if (options?.structureIssues && options.structureIssues.length > 0) {
      for (const issue of options.structureIssues) {
        missingFacts.push(`[${issue.code}] ${issue.path}: ${issue.message}`);
      }
    }
    for (const issue of structuralHealth.issues) {
      missingFacts.push(issue);
    }

    const intentData = (data && typeof data === 'object' && data.intent && typeof data.intent === 'object') ? data.intent : null;
    const boundedMissingFacts = missingFacts.slice(0, 25);
    const intentState = typeof intentData?.confirmation?.state === 'string'
      ? intentData.confirmation.state
      : 'unknown';

    const targetRun = Array.isArray(runs) && runs.length > 0 ? runs[runs.length - 1] : undefined;
    const pendingCandidates = Array.isArray(runs) ? runs.filter(r => r.state === 'waiting_human' && r.candidate !== null && r.outcome === null) : [];
    const keptCandidates = Array.isArray(runs) ? runs.filter(r => r.outcome === 'kept' && r.candidate !== null && !r.receipt) : [];

    const authAnalysis = analyzeProjectAuthorizations({
      runs: Array.isArray(runs) ? runs : [],
      projectRevision: typeof project?.revision === 'number' ? project.revision : 0,
      targetRequirementId: options?.targetRequirementId ?? null,
      isProjectCorrupted: true,
      now
    });

    const safeStopView = buildCompactStopView({
      projectId: typeof project?.id === 'string' && project.id ? project.id : 'unknown',
      projectName: typeof project?.name === 'string' ? project.name : '未命名项目',
      projectRevision: typeof project?.revision === 'number' ? project.revision : 0,
      generatedAt: new Date(now).toISOString(),
      schemaVersion: typeof data?.schemaVersion === 'string' ? data.schemaVersion : '1.0.0',
      activeRequirement: null,
      intentTitle: typeof intentData?.title === 'string' ? intentData.title : '损坏意图',
      intentId: typeof intentData?.id === 'string' ? intentData.id : 'INTENT',
      intentState,
      latestRunState: targetRun?.state ?? null,
      pendingCandidateCount: pendingCandidates.length,
      keptCandidateCount: keptCandidates.length,
      authorizationState: authAnalysis.authorizationState,
      activeGrant: authAnalysis.activeGrant,
      runtimeBinding: authAnalysis.runtimeBinding,
      targetRunId: authAnalysis.targetRunId,
      runRevision: authAnalysis.runRevision,
      baseRevision: authAnalysis.baseRevision,
      retrievalEndpoint: authAnalysis.retrievalEndpoint,
      retrievalLocator: authAnalysis.retrievalLocator,
      authorizationNotes: authAnalysis.notes,
      maxBudgetBytes,
      deliveryFormat,
      why: '项目记录中存在底层结构错误、关键集合缺失或合同校验失败，系统拒绝通过猜测继续执行。',
      missingFacts: boundedMissingFacts,
      necessaryOverBudget: false,
      retrievalGuide: `完整记录可通过 GET /api/record-projects/${project?.id ?? 'unknown'} 查看。`
    });

    return safeStopView;
  }

  // 1. 合同版本校验（Standards）
  const supportedSchemaVersion = '1.0.0';
  if (data.schemaVersion !== supportedSchemaVersion) {
    missingFacts.push(`不支持的记录合同版本: "${data.schemaVersion}"，当前仅支持 "${supportedSchemaVersion}"。`);
  }

  // 1.5 结构校验问题并入（若应用层已注入）
  if (options?.structureIssues && options.structureIssues.length > 0) {
    for (const issue of options.structureIssues) {
      missingFacts.push(`[${issue.code}] ${issue.path}: ${issue.message}`);
    }
  }

  // 2. 复用现有完整关系校验（Record Relations Inspection）
  const relationIssues = inspectRecordRelations(data);
  for (const issue of relationIssues) {
    contradictoryFacts.push(`[${issue.code}] ${issue.path}: ${issue.message}`);
  }

  // 深入核对所有需求字段完整性（title, problem, expectedOutcome 非空）
  for (const r of data.requirements) {
    if (!r.title || !r.title.trim()) {
      missingFacts.push(`需求 ${r.id} 缺少有效标题（title 不能为空）。`);
    }
    if (!r.problem || !r.problem.trim()) {
      missingFacts.push(`需求 ${r.id} 缺少有效问题描述（problem 不能为空）。`);
    }
    if (!r.expectedOutcome || !r.expectedOutcome.trim()) {
      missingFacts.push(`需求 ${r.id} 缺少有效预期结果（expectedOutcome 不能为空）。`);
    }
  }

  // 深入核对完成态产物与其核查状态的一致性矛盾
  for (const r of data.requirements) {
    if (r.status === 'done') {
      const unpassed = r.acceptanceCriteria.filter(c => {
        const v = data.verifications.find(item => item.target.id === r.id && item.criterionId === c.id);
        return !v || v.outcome !== 'passed';
      });
      if (unpassed.length > 0) {
        contradictoryFacts.push(`需求 ${r.id} 状态已标记为 done 并整体验收，但其验收条件 (${unpassed.map(c => c.id).join(', ')}) 存在未通过或失效的核查。`);
      }
    }
  }

  // 3. 意图与目标校验（Intent & Scope）
  const intent = data.intent;
  if (!intent || !intent.title?.trim() || !intent.problem?.trim() || !intent.expectedOutcome?.trim()) {
    missingFacts.push('项目缺少完整的意图（Intent）定义或目标描述。');
  }

  // 4. 需求目标选择（Requirement Selection）：同一 Requirement 范围内选定目标与 Run，杜绝无依据跨需求拼接
  const inProgressReqs = data.requirements.filter(r => r.status !== 'done');
  let activeReq: RequirementRecord | null = null;
  let candidateRequirements: Array<{ id: string; title: string; status: RecordStatus }> | undefined;

  if (options?.targetRequirementId) {
    const specified = data.requirements.find(r => r.id === options.targetRequirementId);
    if (!specified) {
      missingFacts.push(`指定的目标需求 "${options.targetRequirementId}" 在项目中不存在。`);
    } else {
      activeReq = specified;
    }
  } else if (data.requirements.length === 0) {
    activeReq = null;
  } else if (inProgressReqs.length === 0) {
    // 全部需求均已完成
    activeReq = null;
  } else if (inProgressReqs.length === 1) {
    activeReq = inProgressReqs[0]!;
  } else {
    // 存在多个未完成需求，不擅自猜测优先级，列出候选项请求人端明确选择
    candidateRequirements = inProgressReqs.map(r => ({ id: r.id, title: r.title, status: r.status }));
    activeReq = null;
  }

  const goal: RecoveryGoal = {
    intent: {
      id: intent.id,
      title: intent.title,
      problem: intent.problem,
      expectedOutcome: intent.expectedOutcome,
      state: intent.confirmation.state,
      scope: intent.scope ? { includes: [...intent.scope.includes], excludes: [...intent.scope.excludes] } : { includes: [], excludes: [] },
      constraints: intent.constraints ? [...intent.constraints] : [],
      sourceRefs: intent.sourceRefs ? [...intent.sourceRefs] : [],
      confirmationSourceRefs: intent.confirmation?.sourceRefs ? [...intent.confirmation.sourceRefs] : []
    },
    activeRequirement: activeReq ? {
      id: activeReq.id,
      title: activeReq.title,
      problem: activeReq.problem,
      expectedOutcome: activeReq.expectedOutcome,
      status: activeReq.status,
      hasAcceptedOutcome: activeReq.acceptance !== null,
      scope: activeReq.scope ? { includes: [...activeReq.scope.includes], excludes: [...activeReq.scope.excludes] } : { includes: [], excludes: [] },
      constraints: activeReq.constraints ? [...activeReq.constraints] : [],
      acceptanceCriteria: activeReq.acceptanceCriteria ? activeReq.acceptanceCriteria.map(c => ({ id: c.id, description: c.description, verification: c.verification })) : [],
      sourceRefs: activeReq.sourceRefs ? [...activeReq.sourceRefs] : []
    } : null,
    candidateRequirements
  };

  // 5. 进度盘点（Current State）
  const reqCounts = countStatus(data.requirements);
  const relevantUnits = activeReq ? data.units.filter(u => u.requirementId === activeReq.id) : [];
  const relevantStories = activeReq ? data.stories.filter(s => s.requirementId === activeReq.id) : [];
  const relevantBoltPlans = activeReq ? data.boltPlans.filter(b => b.requirementId === activeReq.id) : [];

  // 过滤出且仅针对当前目标需求的运行记录，杜绝将其他需求的运行拼接为当前依据
  const targetReqRuns = activeReq ? runs.filter(r => r.requirementId === activeReq.id) : [];
  const targetRun = targetReqRuns.length > 0 ? targetReqRuns[targetReqRuns.length - 1] : undefined;

  // 候选生命周期判定：
  // 待核对：waiting_human 且 candidate 存在且未决定（outcome === null）
  // 已保留：outcome === 'kept' 且 candidate 存在且未合入正式记录（!receipt）
  // 已拒绝（outcome === 'rejected'）或已应用（outcome === 'applied'）均不计入未决候选
  const pendingCandidates = runs.filter(r => r.state === 'waiting_human' && r.candidate !== null && r.outcome === null);
  const keptCandidates = runs.filter(r => r.outcome === 'kept' && r.candidate !== null && !r.receipt);

  const progress: RecoveryProgress = {
    intentState: intent.confirmation.state,
    requirementsCount: reqCounts,
    activeRequirementBreakdown: activeReq ? {
      units: countStatus(relevantUnits),
      stories: countStatus(relevantStories),
      boltPlans: countStatus(relevantBoltPlans)
    } : null,
    latestRunState: targetRun?.state ?? null,
    pendingCandidateCount: pendingCandidates.length,
    keptCandidateCount: keptCandidates.length
  };

  // 6. 证据依据清单（Evidence Links）：基于选定需求构建聚焦上下文，排除非关联需求技术细节
  const activeHierarchyIds = activeReq
    ? new Set([activeReq.id, ...relevantUnits.map(u => u.id), ...relevantStories.map(s => s.id), ...relevantBoltPlans.map(b => b.id)])
    : null;

  const scopedVerifications = activeHierarchyIds
    ? data.verifications.filter(v => activeHierarchyIds.has(v.target.id))
    : data.verifications;

  const scopedContextItems = activeReq
    ? data.contextItems.filter(c => c.requirementId === null || c.requirementId === activeReq.id)
    : data.contextItems;

  const scopedEvidence = activeHierarchyIds
    ? data.evidence.filter(e =>
        e.requirementId === activeReq!.id ||
        e.targets.some(t => activeHierarchyIds.has(t.id)) ||
        (activeReq!.result?.evidenceRefs && activeReq!.result.evidenceRefs.includes(e.id)) ||
        scopedVerifications.some(v => v.evidenceRefs.includes(e.id)) ||
        scopedContextItems.some(c => c.evidenceRefs.includes(e.id))
      )
    : data.evidence;

  const referencedSourceIds = new Set<string>();
  if (intent && intent.confirmation?.sourceRefs) {
    for (const s of intent.confirmation.sourceRefs) referencedSourceIds.add(s);
  }
  if (intent && intent.sourceRefs) {
    for (const s of intent.sourceRefs) referencedSourceIds.add(s);
  }
  if (activeReq) {
    for (const s of activeReq.sourceRefs) referencedSourceIds.add(s);
    for (const u of relevantUnits) for (const s of u.sourceRefs) referencedSourceIds.add(s);
    for (const st of relevantStories) for (const s of st.sourceRefs) referencedSourceIds.add(s);
    for (const bp of relevantBoltPlans) for (const s of bp.sourceRefs) referencedSourceIds.add(s);
    for (const v of scopedVerifications) for (const s of v.sourceRefs) referencedSourceIds.add(s);
    for (const e of scopedEvidence) for (const s of e.sourceRefs) referencedSourceIds.add(s);
  }
  // 出处闭包：纳入适用 contextItems 的 sourceRefs，确保包含的出处不被过滤
  for (const c of scopedContextItems) {
    for (const s of c.sourceRefs) referencedSourceIds.add(s);
  }

  const scopedSources = activeHierarchyIds
    ? data.sources.filter(s => referencedSourceIds.has(s.id))
    : data.sources;

  const evidenceLinks: RecoveryEvidenceLinks = {
    sources: scopedSources.map(s => ({ id: s.id, kind: s.kind, locator: s.locator, excerpt: s.excerpt })),
    verifications: scopedVerifications.map(v => ({ id: v.id, targetId: v.target.id, criterionId: v.criterionId, outcome: v.outcome, method: v.method, explanation: v.explanation, sourceRefs: v.sourceRefs ? [...v.sourceRefs] : [] })),
    evidence: scopedEvidence.map(e => ({ id: e.id, targetIds: e.targets.map(t => t.id), subject: e.subject, observedResult: e.observedResult, environment: e.environment, description: e.description, sourceRefs: e.sourceRefs ? [...e.sourceRefs] : [] }))
  };

  // 7. 未知项、失效核查与待决 Gate（Unknowns & Gates）：聚焦选定需求或全项目级未知项
  const openQuestions = scopedContextItems
    .filter(c => c.category === 'open_question' && c.epistemicStatus === 'unknown')
    .map(c => c.content);
  const assumptions = scopedContextItems
    .filter(c => c.category === 'assumption' && c.epistemicStatus === 'proposed')
    .map(c => c.content);

  const contextItems: RecoveryContextItem[] = scopedContextItems.map(c => ({
    id: c.id,
    requirementId: c.requirementId,
    category: c.category,
    content: c.content,
    epistemicStatus: c.epistemicStatus,
    sourceRefs: [...(c.sourceRefs ?? [])],
    evidenceRefs: [...(c.evidenceRefs ?? [])]
  }));

  const unverifiedCriteria: Array<{ requirementId: string; criterionId: string; description: string }> = [];
  const targetReqsToCheck = activeReq ? [activeReq] : data.requirements;
  for (const req of targetReqsToCheck) {
    const verifiedCriterionIds = new Set(
      data.verifications
        .filter(v => v.target.id === req.id && v.outcome === 'passed' && v.method !== 'model_review' && v.evidenceRefs.length > 0)
        .map(v => v.criterionId)
    );
    for (const c of req.acceptanceCriteria) {
      if (!verifiedCriterionIds.has(c.id)) {
        unverifiedCriteria.push({ requirementId: req.id, criterionId: c.id, description: c.description });
      }
    }
  }

  const invalidatedVerifications: Array<{ id: string; targetId: string; reason: string }> = [];
  for (const v of scopedVerifications) {
    if (v.outcome === 'unknown' && v.explanation && v.explanation.includes('失效')) {
      invalidatedVerifications.push({ id: v.id, targetId: v.target.id, reason: v.explanation });
    }
  }

  const pendingHumanGates: string[] = [];
  if (intent.confirmation.state !== 'human_confirmed') {
    pendingHumanGates.push('意图待人端商讨并正式授权确认（Intent Confirmation Gate）');
  }
  // 严格对齐候选生命周期：
  // 仅未审阅候选 (waiting_human && outcome === null) 挂载 Candidate Decision Gate；
  // 已保留但未合入候选 (outcome === 'kept' && !receipt) 挂载 Candidate Application Gate；
  // 已拒绝候选 (outcome === 'rejected') 绝不再挂载决策 Gate。
  if (targetRun) {
    if (targetRun.state === 'waiting_human' && targetRun.candidate !== null && targetRun.outcome === null) {
      pendingHumanGates.push(`运行 ${targetRun.id} 生成的候选待人工核对决策（Candidate Decision Gate）`);
    } else if (targetRun.outcome === 'kept' && targetRun.candidate !== null && !targetRun.receipt) {
      pendingHumanGates.push(`运行 ${targetRun.id} 已保留候选待人工进一步决定合入（Candidate Application Gate）`);
    }
  }
  if (activeReq && activeReq.status !== 'done') {
    const acceptanceEligibility = checkRequirementAcceptanceEligibility(activeReq, data);
    if (acceptanceEligibility.eligible) {
      pendingHumanGates.push(`需求 ${activeReq.id} 满足整体验收前置条件，待人工最终验收确认（Overall Acceptance Gate）`);
    }
  }

  const unknowns: RecoveryUnknowns = {
    openQuestions,
    assumptions,
    unverifiedCriteria,
    invalidatedVerifications,
    pendingHumanGates
  };

  // 8. 适用修订与授权分析（Authorizations）：复用实际 Harness 的 active, expiresAt, baseRevision 与 targetReq 规则
  const authorizations = analyzeProjectAuthorizations({
    runs,
    projectRevision: project.revision,
    targetRequirementId: activeReq ? activeReq.id : (options?.targetRequirementId ?? null),
    isProjectCorrupted: false,
    now
  });

  const gapReport: RecoveryGapReport = {
    hasGap: missingFacts.length > 0 || contradictoryFacts.length > 0,
    missingFacts,
    contradictoryFacts
  };

  // 9. 下一步安全动作严格推导（Derive Next Safe Action）：逐项检验前置条件，拒绝填入未验证空洞假设
  const nextSafeAction = deriveNextSafeAction({
    project,
    data,
    goal,
    progress,
    authorizations,
    unknowns,
    gapReport,
    activeReq,
    candidateRequirements,
    targetRun,
    relevantUnits,
    relevantStories,
    relevantBoltPlans
  });

  const baseView: ProjectRecoveryView = {
    projectId: project.id,
    projectName: project.name,
    projectRevision: project.revision,
    generatedAt: new Date(now).toISOString(),
    standards: {
      schemaVersion: supportedSchemaVersion,
      rules: [
        '用户确认的 Intent 是目标与预期行为的唯一规范事实源。',
        '一个 Requirement 对应一个最终 PR；Unit/Story/Bolt Plan 按需出现，分别保留验收依据。',
        '模型产出仅为候选，正式记录的写入与整体接受必须由独立人端决策，模型不能自批自结。',
        '依据 D18.1 保守策略，跨项目修订严格禁止直接继承旧步骤观察断点。',
        '模型端点必须显式声明 providerKind 与 endpoint，禁止隐式回退或静默跨源重定向。'
      ],
      updateProtocolEndpoints: [
        'POST /api/record-projects/:id/records (人端正式记录更新)',
        'POST /api/record-projects/:id/runs (发起模型单轮运行)',
        ...(authorizations.targetRunId ? [`GET /api/runs/${authorizations.targetRunId} (回查对应运行账本)`] : []),
        'POST /api/runs/:id/decision (人端决定候选)',
        'POST /api/runs/:id/apply (人端正式应用候选)',
        'POST /api/record-projects/:id/requirements/:reqId/acceptance (人端签署最终整体验收)'
      ]
    },
    goal,
    progress,
    nextSafeAction,
    authorizations,
    evidence: evidenceLinks,
    unknowns,
    gapReport,
    contextItems
  };

  return applyRecoveryBudget(baseView, maxBudgetBytes, project.id, project.revision, deliveryFormat);
}

function deriveNextSafeAction(ctx: {
  project: RecordProject;
  data: RecordProject['records'];
  goal: RecoveryGoal;
  progress: RecoveryProgress;
  authorizations: RecoveryAuthorizations;
  unknowns?: RecoveryUnknowns;
  gapReport: RecoveryGapReport;
  activeReq: RequirementRecord | null;
  candidateRequirements?: Array<{ id: string; title: string; status: RecordStatus }> | undefined;
  targetRun: HarnessRun | undefined;
  relevantUnits: UnitRecord[];
  relevantStories: StoryRecord[];
  relevantBoltPlans: BoltPlanRecord[];
}): RecoveryNextSafeAction {
  const {
    project,
    data,
    goal,
    authorizations,
    gapReport,
    activeReq,
    candidateRequirements,
    targetRun,
    relevantUnits,
    relevantStories,
    relevantBoltPlans
  } = ctx;

  // 1. 致命记录矛盾或关键事实缺失：立即停止并报告缺口 (Fail-Closed)
  if (gapReport.hasGap) {
    return {
      actionCode: 'STOP_AND_REPORT_GAP',
      actor: 'human',
      description: '停止自主执行并向人工明确汇报记录缺口与矛盾事实',
      why: '项目记录中存在逻辑冲突、关系校验失败或关键事实缺失，冷启动原则禁止通过猜测或编造继续执行。',
      executableNow: false,
      waitingFor: 'human',
      prerequisitesMet: [],
      blockingIssues: [...gapReport.missingFacts, ...gapReport.contradictoryFacts]
    };
  }

  // 2. 意图未人工确认
  if (goal.intent.state !== 'human_confirmed') {
    return {
      actionCode: 'REQUIRE_HUMAN_INTENT_CONFIRMATION',
      actor: 'human',
      description: `核对并确认项目意图（Intent ${goal.intent.id}）`,
      why: '意图是项目目标与预期行为的唯一规范事实源；在人端正式授权确认前，严禁开启任何模型执行或需求拆解。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `项目已持久化初始化 (id: ${project.id}, revision: r${project.revision})`,
        `意图已定义 (title: ${goal.intent.title})`
      ],
      blockingIssues: [
        `项目意图当前处于 "${goal.intent.state}" 状态，尚未获得独立人端确认`
      ]
    };
  }

  // 3. 项目尚无需求记录
  if (data.requirements.length === 0) {
    return {
      actionCode: 'AWAIT_HUMAN_REQUIREMENT_CREATION',
      actor: 'human',
      description: '在已确认的意图下创建首个需求（Requirement）草案',
      why: '当前项目尚无任何需求记录；在 AgentHub 中，一个需求对应一个最终 PR，需由人端定义需求边界与业务范围。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `项目意图已确认 (intentId: ${goal.intent.id}, state: ${goal.intent.state})`
      ],
      blockingIssues: [
        '项目尚未创建任何需求（Requirement）记录'
      ]
    };
  }

  // 4. 全项目所有工作已全部完成
  const inProgressReqs = data.requirements.filter(r => r.status !== 'done');
  if (data.requirements.length > 0 && inProgressReqs.length === 0) {
    const allAccepted = data.requirements.every(r => r.acceptance !== null);
    return {
      actionCode: 'ALL_REQUIREMENTS_COMPLETED',
      actor: 'human',
      description: '项目当前规划的所有需求均已完成并通过验收',
      why: '项目现有的全部需求均处于 done 状态且已记录整体验收凭据；当前周期工作全部闭环。',
      executableNow: false,
      waitingFor: 'none',
      prerequisitesMet: [
        `意图已确认 (intentId: ${goal.intent.id})`,
        `全部 ${data.requirements.length} 个需求均处于 done 状态`,
        allAccepted ? '全部需求均已具备正式整体接受（acceptance）记录' : '需求均已标记为完成'
      ],
      blockingIssues: []
    };
  }

  // 5. 存在多个未完成需求，未指定目标需求时请求明确选择
  if (!activeReq && candidateRequirements && candidateRequirements.length > 1) {
    return {
      actionCode: 'SELECT_TARGET_REQUIREMENT',
      actor: 'human',
      description: `从 ${candidateRequirements.length} 个未完成需求中明确选定当前推进目标`,
      why: '项目中存在多个处于推进中（review / draft）的需求；系统禁止随机选择或强行推断优先级，需由人端明确目标后继续。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `意图已确认 (intentId: ${goal.intent.id})`,
        `已识别未完成需求清单: ${candidateRequirements.map(c => `${c.id} [${c.status}]`).join('; ')}`
      ],
      blockingIssues: [
        `存在多个未完成需求 (${candidateRequirements.map(c => c.id).join(', ')})，请在恢复请求中指定 targetRequirementId`
      ],
      alternativeActions: candidateRequirements.map(c => ({
        actionCode: 'SELECT_TARGET_REQUIREMENT',
        actor: 'human',
        description: `选定需求 ${c.id}（${c.title}）作为当前目标`,
        tradeOff: `优先推进 ${c.id}，其余需求保持原状态`
      }))
    };
  }

  // 针对选定的目标需求进行推导
  if (!activeReq) {
    return {
      actionCode: 'AWAIT_HUMAN_REQUIREMENT_CREATION',
      actor: 'human',
      description: '创建或选定需求以开展下一步工作',
      why: '未能在项目中唯一定位活跃需求。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [`意图已确认 (intentId: ${goal.intent.id})`],
      blockingIssues: ['未选定目标需求']
    };
  }

  // 6. 选定需求已处于完成态
  if (activeReq.status === 'done') {
    return {
      actionCode: 'REQUIREMENT_ALREADY_COMPLETED',
      actor: 'human',
      description: `需求 ${activeReq.id} 已完成并验收，无需重复拆解或核查`,
      why: '目标需求已被标记为 done 状态；已完成对象不得擅自重复生成候选或无端发起核查。',
      executableNow: false,
      waitingFor: 'none',
      prerequisitesMet: [
        `需求 ${activeReq.id} 状态为 done`,
        activeReq.acceptance !== null ? '需求已具备正式整体接受结论' : '需求标记为已完成'
      ],
      blockingIssues: []
    };
  }

  // 7. 运行处于等待人工核对状态（waiting_human 且 outcome === null）或保留状态（kept 且 !receipt）
  if (targetRun && ((targetRun.state === 'waiting_human' && targetRun.outcome === null) || (targetRun.outcome === 'kept' && !targetRun.receipt))) {
    if (authorizations.authorizationState === 'stale_revision') {
      return {
        actionCode: 'RECONCILE_STALE_RUN',
        actor: 'human',
        description: `对账过期运行 ${targetRun.id}：项目修订已推进 (r${targetRun.baseRevision} -> r${project.revision})`,
        why: '项目正式记录在运行产生候选后发生了新的变更；依据 D18.1 保守策略，旧步骤观察与候选不得直接合入当前项目，需由人端对账废弃或另起新运行。',
        executableNow: true,
        waitingFor: 'human',
        prerequisitesMet: [
          `运行 ${targetRun.id} 候选已持久化保存 (type: ${targetRun.candidate?.type ?? 'unknown'})`,
          `项目最新修订为 r${project.revision}`
        ],
        blockingIssues: [
          `运行基准修订 r${targetRun.baseRevision} 与当前项目修订 r${project.revision} 不一致`
        ]
      };
    }

    if (authorizations.authorizationState === 'revoked') {
      return {
        actionCode: 'INSPECT_CANCELLED_RUN',
        actor: 'human',
        description: `核对授权已注销运行 ${targetRun.id} 的候选并由人工决定后续处置`,
        why: '运行的执行授权已被主动注销或处于非活跃状态；系统禁止在无授权状态下调用任何下游执行，需人端对账。',
        executableNow: false,
        waitingFor: 'human',
        prerequisitesMet: [
          `运行 ${targetRun.id} 候选已持久化保存`
        ],
        blockingIssues: [
          `运行 ${targetRun.id} 授权已被注销，禁止直接决策或应用候选`
        ]
      };
    }

    const isExpired = authorizations.authorizationState === 'expired';
    const isKept = targetRun.outcome === 'kept';

    return {
      actionCode: 'REVIEW_CANDIDATE_IN_HUMAN_BOARD',
      actor: 'human',
      description: isKept
        ? `在看板中人工核对运行 ${targetRun.id} 的已保留候选（待人工决定或未合入正式记录）`
        : `在看板中人工审阅运行 ${targetRun.id} 产出的 ${targetRun.candidate?.type} 候选`,
      why: '模型仅产出待核对候选，正式记录的写入与状态变更必须由独立人端决策，模型不得越权自批。',
      executableNow: !isExpired,
      waitingFor: 'human',
      prerequisitesMet: [
        `意图已确认 (intentId: ${goal.intent.id})`,
        `需求 ${activeReq.id} 处于待核对状态 (status: ${activeReq.status})`,
        `运行 ${targetRun.id} 基准修订 r${targetRun.baseRevision} 与项目 r${project.revision} 对齐`,
        `运行候选类型为 ${targetRun.candidate?.type}，已持久化于账本`
      ],
      blockingIssues: isExpired
        ? [`运行 ${targetRun.id} 的授权已于 ${targetRun.authorization.expiresAt} 到期；真实预览与应用接口将拒绝执行，需人端在看板中重新确认授权后再行决策。`]
        : [isKept ? '已保留候选待人工进一步决定合入或保留' : '等待人端在看板中做出决定（批准应用、保留或退回修改）']
    };
  }

  // 8. 运行正在执行中（running）
  if (targetRun && targetRun.state === 'running') {
    return {
      actionCode: 'AWAIT_ACTIVE_RUN',
      actor: 'human',
      description: `等待运行 ${targetRun.id} 执行完毕或主动取消`,
      why: '该需求已有活跃的 Harness 运行正在进行中；系统禁止在同一需求上无依据并发启动多个相同工作。',
      executableNow: false,
      waitingFor: 'active_run',
      prerequisitesMet: [
        `运行 ${targetRun.id} 已在执行中 (executionId: ${targetRun.executionId ?? 'active'})`,
        `运行授权有效至 ${targetRun.authorization.expiresAt}`
      ],
      blockingIssues: [
        `已有运行 ${targetRun.id} 正在执行，需等待其完成、中断或主动取消`
      ]
    };
  }

  // 9. 运行可恢复中断（interrupted）
  if (targetRun && targetRun.state === 'interrupted') {
    if (authorizations.authorizationState === 'stale_revision') {
      return {
        actionCode: 'RECONCILE_STALE_RUN',
        actor: 'human',
        description: `对账中断运行 ${targetRun.id}：修订已过时 (r${targetRun.baseRevision} -> r${project.revision})`,
        why: '项目修订在运行中断后发生了更新；依据 D18.1，不得跨修订直接继承旧观察断点，需由人工确认废弃或从第 0 步分叉/重起。',
        executableNow: true,
        waitingFor: 'human',
        prerequisitesMet: [
          `中断运行 ${targetRun.id} 已保留步骤账本 (${targetRun.turns?.length ?? 0} 轮)`
        ],
        blockingIssues: [
          `运行修订 r${targetRun.baseRevision} 落后于当前项目修订 r${project.revision}`
        ]
      };
    }

    if (authorizations.authorizationState === 'revoked') {
      return {
        actionCode: 'INSPECT_CANCELLED_RUN',
        actor: 'human',
        description: `核对已注销中断运行 ${targetRun.id}，按需发起新运行`,
        why: '运行授权已被注销，禁止继续恢复该执行；需人端重新授权后从第 0 步分叉或新建运行。',
        executableNow: false,
        waitingFor: 'human',
        prerequisitesMet: [
          `中断运行 ${targetRun.id} 步骤账本已保留`
        ],
        blockingIssues: [
          `运行 ${targetRun.id} 授权已被主动注销，无法直接恢复`
        ]
      };
    }

    const isMissingFingerprint = !targetRun.runtime?.fingerprint;
    const isBudgetExhausted = (targetRun.calls >= targetRun.limits.maxCalls) ||
      (typeof targetRun.metrics?.outputBytes === 'number' && targetRun.metrics.outputBytes >= targetRun.limits.maxOutputBytes);
    const isExpired = authorizations.authorizationState === 'expired';

    if (isMissingFingerprint || isBudgetExhausted || isExpired) {
      const reasons: string[] = [];
      if (isMissingFingerprint) reasons.push('旧运行缺少配置指纹校验依据，不得隐式沿用未验证配置；请人端在看板中显式重新选择并确认运行时后继续。');
      if (isBudgetExhausted) reasons.push(`运行预算已耗尽 (calls: ${targetRun.calls}/${targetRun.limits.maxCalls}, outputBytes: ${targetRun.metrics?.outputBytes ?? 0}/${targetRun.limits.maxOutputBytes})，需人端追加预算并重新授权。`);
      if (isExpired) reasons.push(`中断运行的授权已于 ${targetRun.authorization.expiresAt} 到期，需人端在看板中重新发放有效授权以恢复。`);

      return {
        actionCode: 'REQUIRE_RUN_AUTHORIZATION',
        actor: 'human',
        description: `为中断运行 ${targetRun.id} 重新配置授权与运行时`,
        why: '中断运行因授权过期、预算耗尽或缺少安全指纹而无法直接恢复执行，必须由人端明确指定配置并确认授权。',
        executableNow: true,
        waitingFor: 'human',
        prerequisitesMet: [
          `中断运行 ${targetRun.id} 步骤账本已完整保留 (${targetRun.turns?.length ?? 0} 轮步骤)`,
          `项目修订 r${project.revision} 保持一致 (baseRevision: r${targetRun.baseRevision})`
        ],
        blockingIssues: reasons
      };
    }

    return {
      actionCode: 'RESUME_INTERRUPTED_RUN',
      actor: 'human',
      description: `从断点恢复运行 ${targetRun.id}（前置步骤账本已保留）`,
      why: '运行因网络波动、超时或服务重启意外中断；系统已保留已执行步骤账本，可执行未决工具对账后继续推进。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `运行 ${targetRun.id} 步骤账本已完整保留 (${targetRun.turns?.length ?? 0} 轮步骤)`,
        `项目修订 r${project.revision} 保持一致 (baseRevision: r${targetRun.baseRevision})`
      ],
      blockingIssues: []
    };
  }

  // 10. 运行失败需核对（failed）
  if (targetRun && targetRun.state === 'failed') {
    return {
      actionCode: 'CHECK_FAILED_RUN',
      actor: 'human',
      description: `核对运行 ${targetRun.id} 的失败原因（${targetRun.stopReason ?? 'failed'}）并调整授权`,
      why: '前置运行已终止于失败状态；失败前已发生的模型与工具消耗已记录，需人端排查原因后决定后续行动。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `运行 ${targetRun.id} 失败记录与已知消耗已保留 (calls: ${targetRun.calls}, inputBytes: ${targetRun.metrics?.inputBytes ?? 0})`
      ],
      blockingIssues: [
        `前置运行失败原因: ${targetRun.stopReason ?? '未知异常'}，需人工核对`
      ]
    };
  }

  // 11. 运行已取消（cancelled）
  if (targetRun && targetRun.state === 'cancelled') {
    return {
      actionCode: 'INSPECT_CANCELLED_RUN',
      actor: 'human',
      description: `核对已取消的运行 ${targetRun.id}，按需发起新运行`,
      why: '运行已被主动取消，所有未决授权已注销；需人端明确新一轮目标与授权后方可继续。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `运行 ${targetRun.id} 已取消，授权已注销`
      ],
      blockingIssues: [
        '原运行已终结，需人端显式发放新运行授权'
      ]
    };
  }

  // 12. 需求已满足整体验收前置条件（复用 checkRequirementAcceptanceEligibility，各可选层级按需出现，现有子产物全部 done，所有验收准则均 passed）
  const acceptanceEligibility = checkRequirementAcceptanceEligibility(activeReq, data);
  const activeUnverified = acceptanceEligibility.activeUnverified;

  if (acceptanceEligibility.eligible) {
    return {
      actionCode: 'REQUEST_HUMAN_OVERALL_ACCEPTANCE',
      actor: 'human',
      description: `对需求 ${activeReq.id} 进行人端最终整体验收（Overall Acceptance）`,
      why: `需求的所有 ${activeReq.acceptanceCriteria.length} 项验收条件均已通过核验，且所有已定义的子产物均处于 done 状态；结构化通过不代表最终交付，整体接受必须由人端执行。`,
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `需求 ${activeReq.id} 验收准则已全部核验通过 (${activeReq.acceptanceCriteria.length}/${activeReq.acceptanceCriteria.length} passed)`,
        relevantUnits.length > 0 ? `所有 ${relevantUnits.length} 个 Unit 均处于 done 状态` : '无需额外 Unit',
        relevantStories.length > 0 ? `所有 ${relevantStories.length} 个 Story 均处于 done 状态` : '无需额外 Story',
        relevantBoltPlans.length > 0 ? `所有 ${relevantBoltPlans.length} 个 BoltPlan 均处于 done 状态` : '无需额外 BoltPlan'
      ],
      blockingIssues: [
        '等待独立人端在看板中签署整体接受决定'
      ]
    };
  }

  // 12.5 仅当需求的所有验收准则均已核验通过且现有拆解子产物全部完成时，
  // 若因缺少 PR、交付结果等交付项导致整体验收前置未通过，方阻断并指示补齐交付项（executableNow: false）
  const allExistingChildrenDone =
    relevantUnits.every(u => u.status === 'done') &&
    relevantStories.every(s => s.status === 'done') &&
    relevantBoltPlans.every(b => b.status === 'done');

  if (allExistingChildrenDone && activeUnverified.length === 0 && activeReq.acceptanceCriteria.length > 0) {
    return {
      actionCode: 'REQUIRE_RUN_AUTHORIZATION',
      actor: 'human',
      description: `补齐需求 ${activeReq.id} 的整体验收前置项（如 Pull Request 或交付结果）`,
      why: `需求的所有验收条件均已通过核验且子产物已全部完成，但尚未关联 Pull Request 或交付结果；在具备合法 PR 与交付结果前，严禁签署整体验收。`,
      executableNow: false,
      waitingFor: 'human',
      prerequisitesMet: [
        `意图已确认 (intentId: ${goal.intent.id})`,
        `需求 ${activeReq.id} 验收准则已全部核验通过 (${activeReq.acceptanceCriteria.length}/${activeReq.acceptanceCriteria.length} passed)`,
        relevantUnits.length > 0 ? `所有 ${relevantUnits.length} 个 Unit 均处于 done 状态` : '无需额外 Unit',
        relevantStories.length > 0 ? `所有 ${relevantStories.length} 个 Story 均处于 done 状态` : '无需额外 Story',
        relevantBoltPlans.length > 0 ? `所有 ${relevantBoltPlans.length} 个 BoltPlan 均处于 done 状态` : '无需额外 BoltPlan'
      ],
      blockingIssues: acceptanceEligibility.reasons
    };
  }

  // 13. 需求缺少验收条件
  if (activeReq.acceptanceCriteria.length === 0) {
    if (authorizations.authorizationState === 'valid') {
      return {
        actionCode: 'EXECUTE_RUN_WITH_VALID_AUTHORIZATION',
        actor: 'model',
        description: `在有效授权内执行运行，为需求 ${activeReq.id} 提炼验收准则草案`,
        why: '需求尚未定义可验证的验收条件，当前存在有效运行授权，可调用模型生成 propose_criteria 候选。',
        executableNow: true,
        waitingFor: 'model',
        prerequisitesMet: [
          `意图已确认 (intentId: ${goal.intent.id})`,
          `需求 ${activeReq.id} 边界已建立`,
          `运行授权有效 (authorizationState: valid)`
        ],
        blockingIssues: []
      };
    }
    return {
      actionCode: 'REQUIRE_RUN_AUTHORIZATION',
      actor: 'human',
      description: `为需求 ${activeReq.id} 提炼验收准则发放单轮运行授权`,
      why: '需求尚未定义验收条件；模型不能自主启动，需人端在看板中明确授权范围与工作区权限。',
      executableNow: true,
      waitingFor: 'human',
      prerequisitesMet: [
        `意图已确认 (intentId: ${goal.intent.id})`,
        `需求 ${activeReq.id} 处于 ${activeReq.status} 状态`
      ],
      blockingIssues: [
        '尚未配置本轮运行的工作区或模型授权'
      ]
    };
  }

  // 14. 正常推进子产物拆解或核查收集
  if (authorizations.authorizationState === 'valid') {
    return {
      actionCode: 'EXECUTE_RUN_WITH_VALID_AUTHORIZATION',
      actor: 'model',
      description: `在有效授权内执行运行，推进需求 ${activeReq.id} 的单元拆解或核查证据收集`,
      why: `需求尚有 ${activeUnverified.length} 项未验证条件或未完成子产物，当前已具备有效运行授权，可继续执行模型。`,
      executableNow: true,
      waitingFor: 'model',
      prerequisitesMet: [
        `意图已确认 (intentId: ${goal.intent.id})`,
        `需求 ${activeReq.id} 验收准则已明确 (${activeReq.acceptanceCriteria.length} 项)`,
        `运行授权有效至 ${targetRun?.authorization.expiresAt ?? 'active'}`
      ],
      blockingIssues: []
    };
  }

  return {
    actionCode: 'REQUIRE_RUN_AUTHORIZATION',
    actor: 'human',
    description: `为推进需求 ${activeReq.id} 的子产物拆解或收集核查证据发放单轮运行授权`,
    why: `需求尚有 ${activeUnverified.length} 项未核验准则或未完成子产物（Unit: ${relevantUnits.filter(u => u.status !== 'done').length} 未完成, Story: ${relevantStories.filter(s => s.status !== 'done').length} 未完成）；动作建议本身不产生授权，需人端授权后方可执行。`,
    executableNow: true,
    waitingFor: 'human',
    prerequisitesMet: [
      `意图已确认 (intentId: ${goal.intent.id})`,
      `需求 ${activeReq.id} 验收准则已明确 (${activeReq.acceptanceCriteria.length} 项)`
    ],
    blockingIssues: [
      '当前未授予有效运行授权；需人端明确指定工作区与模型端点后启动运行',
      ...(acceptanceEligibility.incompleteChildren.length > 0
        ? [`存在未完成拆解产物 (${acceptanceEligibility.incompleteChildren.map(c => `${c.kind} ${c.id}[${c.status}]`).join(', ')})，阻断整体验收，需推进子产物实现`]
        : [])
    ]
  };
}
