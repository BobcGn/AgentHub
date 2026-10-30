import { fail } from './board.js';
import type {
  AcceptanceCriterion,
  BoltPlanRecord,
  ContextItemRecord,
  RecordSet,
  SourceRecord,
  StoryRecord,
  TargetRef,
  UnitRecord,
  VerificationRecord,
  WorkRecord
} from './record-contract.js';
import type { ContextCandidate } from './harness.js';
import type { RecordAudit } from './record-project.js';

export interface CandidateMutationResult {
  records: RecordSet;
  before: unknown;
  after: unknown;
  target: string;
  contextId: string;
  reason: string;
  warnings: string[];
  effects: RecordAudit['effects'];
}

const UNORDERED_STRING_SET_FIELDS = new Set([
  'includes',
  'excludes',
  'constraints',
  'storyIds',
  'exitConditions',
  'responsibilities',
  'inputs',
  'outputs',
  'evidenceRefs',
  'sourceRefs',
  'limitations'
]);

const WORK_META_EXCLUDED_FIELDS = new Set([
  'acceptanceCriteria',
  'status',
  'result',
  'sourceRefs',
  'acceptance',
  'pullRequest'
]);

export function normalizeCriterion(c: AcceptanceCriterion): { id: string; description: string; verification: string } {
  return {
    id: typeof c?.id === 'string' ? c.id.trim() : '',
    description: typeof c?.description === 'string' ? c.description.trim() : '',
    verification: typeof c?.verification === 'string' ? c.verification.trim() : ''
  };
}

export function canonicalizeSemanticValue(value: unknown, fieldKey?: string): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    if (fieldKey === 'acceptanceCriteria') {
      return [...(value as AcceptanceCriterion[])]
        .map(c => {
          const norm = normalizeCriterion(c);
          return { description: norm.description, id: norm.id, verification: norm.verification };
        })
        .sort((x, y) => x.id.localeCompare(y.id));
    }
    if (fieldKey === 'dependsOn' || fieldKey === 'targets') {
      return [...(value as TargetRef[])]
        .map(ref => ({ id: String(ref.id ?? '').trim(), kind: String(ref.kind ?? '').trim() }))
        .sort((x, y) => `${x.kind}:${x.id}`.localeCompare(`${y.kind}:${y.id}`));
    }
    if (fieldKey && UNORDERED_STRING_SET_FIELDS.has(fieldKey)) {
      return [...value]
        .map(item => (typeof item === 'string' ? item.trim() : canonicalizeSemanticValue(item)))
        .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    }
    // 有序数组（例如 BoltPlanRecord.stages 执行阶段顺序）：保留元素次序，仅对内部元素做语义规范化
    return value.map(item => canonicalizeSemanticValue(item));
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    out[key] = canonicalizeSemanticValue(obj[key], key);
  }
  return out;
}

export function areCriteriaEqual(a: AcceptanceCriterion[], b: AcceptanceCriterion[]): boolean {
  return (
    JSON.stringify(canonicalizeSemanticValue(a, 'acceptanceCriteria')) ===
    JSON.stringify(canonicalizeSemanticValue(b, 'acceptanceCriteria'))
  );
}

export interface WorkSemanticDiff {
  coreSpecChanged: boolean;
  invalidatedCriterionIds: Set<string>;
  criteriaChanged: boolean;
  workContentChanged: boolean;
  completionFactsChanged: boolean;
}

export function analyzeWorkContentDiff(before: WorkRecord, after: WorkRecord): WorkSemanticDiff {
  const beforeRec = before as unknown as Record<string, unknown>;
  const afterRec = after as unknown as Record<string, unknown>;

  const coreBefore: Record<string, unknown> = {};
  const coreAfter: Record<string, unknown> = {};
  for (const key of Object.keys(beforeRec)) {
    if (!WORK_META_EXCLUDED_FIELDS.has(key)) coreBefore[key] = beforeRec[key];
  }
  for (const key of Object.keys(afterRec)) {
    if (!WORK_META_EXCLUDED_FIELDS.has(key)) coreAfter[key] = afterRec[key];
  }
  const coreSpecChanged =
    JSON.stringify(canonicalizeSemanticValue(coreBefore)) !==
    JSON.stringify(canonicalizeSemanticValue(coreAfter));

  const beforeCriteria = Array.isArray(before.acceptanceCriteria) ? before.acceptanceCriteria : [];
  const afterCriteria = Array.isArray(after.acceptanceCriteria) ? after.acceptanceCriteria : [];
  const criteriaTypeMismatch = Array.isArray(before.acceptanceCriteria) !== Array.isArray(after.acceptanceCriteria);
  const oldMap = new Map(beforeCriteria.map(c => [typeof c?.id === 'string' ? c.id.trim() : '', normalizeCriterion(c)]));
  const newMap = new Map(afterCriteria.map(c => [typeof c?.id === 'string' ? c.id.trim() : '', normalizeCriterion(c)]));
  const invalidatedCriterionIds = new Set<string>();
  for (const [id, normNew] of newMap) {
    const normOld = oldMap.get(id);
    if (!normOld || JSON.stringify(normOld) !== JSON.stringify(normNew)) {
      invalidatedCriterionIds.add(id);
    }
  }
  for (const id of oldMap.keys()) {
    if (!newMap.has(id)) {
      invalidatedCriterionIds.add(id);
    }
  }
  const criteriaChanged = criteriaTypeMismatch || invalidatedCriterionIds.size > 0;
  const workContentChanged = coreSpecChanged || criteriaChanged;

  let completionFactsChanged = false;
  if (before.kind === 'requirement' && after.kind === 'requirement') {
    const resultChanged =
      JSON.stringify(canonicalizeSemanticValue(before.result)) !==
      JSON.stringify(canonicalizeSemanticValue(after.result));
    const prChanged =
      JSON.stringify(canonicalizeSemanticValue(before.pullRequest)) !==
      JSON.stringify(canonicalizeSemanticValue(after.pullRequest));
    completionFactsChanged = resultChanged || prChanged;
  } else {
    const demotedFromDone = before.status === 'done' && after.status !== 'done';
    const doneResultChanged =
      before.status === 'done' &&
      JSON.stringify(canonicalizeSemanticValue(before.result)) !==
        JSON.stringify(canonicalizeSemanticValue(after.result));
    completionFactsChanged = demotedFromDone || doneResultChanged;
  }

  return {
    coreSpecChanged,
    invalidatedCriterionIds,
    criteriaChanged,
    workContentChanged,
    completionFactsChanged
  };
}

export function isWorkContentChanged(before: WorkRecord, after: WorkRecord): boolean {
  return analyzeWorkContentDiff(before, after).workContentChanged;
}

export function isVerificationSemanticallyChanged(before: VerificationRecord, after: VerificationRecord): boolean {
  const pick = (v: VerificationRecord) => ({
    target: v.target,
    criterionId: v.criterionId,
    outcome: v.outcome,
    method: v.method,
    explanation: v.explanation,
    evidenceRefs: v.evidenceRefs
  });
  return (
    JSON.stringify(canonicalizeSemanticValue(pick(before))) !==
    JSON.stringify(canonicalizeSemanticValue(pick(after)))
  );
}

function kindDisplayName(kind: WorkRecord['kind']): string {
  if (kind === 'requirement') return 'Requirement';
  if (kind === 'unit') return 'Unit';
  if (kind === 'story') return 'Story';
  return 'Bolt Plan';
}

function allWorkItems(data: RecordSet): WorkRecord[] {
  return [...data.requirements, ...data.units, ...data.stories, ...data.boltPlans];
}

export function cascadeDependentDemotionsAndParentInvalidation(
  data: RecordSet,
  requirementId: string,
  reasonLabel: string,
  forceParentInvalidate: boolean,
  warnings: string[],
  effects?: RecordAudit['effects'],
  skipEffectTargets?: Set<string>,
  changedContentItemIds?: string[]
): void {
  // 分开计算：1) 上游内容变更向全部下游传播核查失效；2) 依赖未完成向全部下游传播完成态回退
  const invalidatedVerificationIds = new Set<string>();

  // 1. 上游内容变更影响传播：沿直接与间接依赖图遍历所有下游对象，将其 passed 核查标为 unknown
  if (changedContentItemIds && changedContentItemIds.length > 0) {
    const affectedDownstreamIds = new Set<string>();
    const queue = [...changedContentItemIds];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const item of [...data.units, ...data.stories, ...data.boltPlans]) {
        if (item.requirementId !== requirementId) continue;
        const deps = Array.isArray(item.dependsOn) ? item.dependsOn : [];
        const hasDep = deps.some(dep => dep && dep.id === currentId);
        const hasUnitDep = item.kind === 'story' && item.unitId === currentId;
        if ((hasDep || hasUnitDep) && !affectedDownstreamIds.has(item.id)) {
          affectedDownstreamIds.add(item.id);
          queue.push(item.id);
        }
      }
    }

    for (const v of data.verifications) {
      if (affectedDownstreamIds.has(v.target.id) && v.outcome === 'passed' && !invalidatedVerificationIds.has(v.id)) {
        invalidatedVerificationIds.add(v.id);
        const oldV = structuredClone(v);
        v.outcome = 'unknown';
        v.explanation = `${v.explanation ? v.explanation + '；' : ''}[上游依赖内容变更，该核查已失效需重新核对]`;
        const vTarget = `verifications/${v.id}`;
        warnings.push(`因上游依赖变更，${v.target.kind} ${v.target.id} 的核查 ${v.id} 已失效标为未知（unknown）。`);
        if (effects && !skipEffectTargets?.has(vTarget)) {
          effects.push({ target: vTarget, before: oldV, after: structuredClone(v) });
        }
      }
    }
  }

  // 2. 完成态级联回退：若上游依赖未完成（非 done），则下游处于 done 状态的对象必须回退至 review
  let progressed = true;
  while (progressed) {
    progressed = false;
    const statusById = new Map<string, WorkRecord['status']>();
    for (const item of allWorkItems(data)) statusById.set(item.id, item.status);

    for (const [colName, rows] of [
      ['units', data.units],
      ['stories', data.stories],
      ['boltPlans', data.boltPlans]
    ] as const) {
      for (const item of rows) {
        if (item.requirementId !== requirementId) continue;
        const deps = Array.isArray(item.dependsOn) ? item.dependsOn : [];
        const hasIncompleteDep = deps.some(dep => {
          const st = dep && typeof dep.id === 'string' ? statusById.get(dep.id) : undefined;
          return st !== undefined && st !== 'done';
        });
        const hasIncompleteUnit =
          item.kind === 'story' && item.unitId ? statusById.get(item.unitId) !== 'done' : false;
        const hasUnpassedCriteria = item.acceptanceCriteria.some(criterion => {
          const v = data.verifications.find(
            ver => ver.target.kind === item.kind && ver.target.id === item.id && ver.criterionId === criterion.id
          );
          return !v || v.outcome !== 'passed';
        });

        if ((hasIncompleteDep || hasIncompleteUnit || hasUnpassedCriteria) && item.status === 'done') {
          const oldItem = structuredClone(item);
          item.status = 'review';
          progressed = true;
          statusById.set(item.id, 'review');
          const effectTarget = `${colName}/${item.id}`;
          warnings.push(`依赖对象未处于完成态或核查已失效，${kindDisplayName(item.kind)} ${item.id} 已同步退回待核对状态（review）。`);
          if (effects && !skipEffectTargets?.has(effectTarget)) {
            effects.push({ target: effectTarget, before: oldItem, after: structuredClone(item) });
          }
        }
      }
    }
  }

  // 3. 检查所属 Requirement 的整体接受与完成态是否须失效回退
  const parentReq = data.requirements.find(r => r.id === requirementId);
  if (!parentReq) return;
  const hasIncompleteChild = [...data.units, ...data.stories, ...data.boltPlans].some(
    child => child.requirementId === requirementId && child.status !== 'done'
  );
  if (!forceParentInvalidate && !hasIncompleteChild) return;

  const effectTarget = `requirements/${parentReq.id}`;
  if (parentReq.acceptance !== null) {
    const oldReq = structuredClone(parentReq);
    parentReq.acceptance = null;
    if (parentReq.status === 'done') parentReq.status = 'review';
    warnings.push(`关联 Requirement ${parentReq.id} 的整体接受已失效（${reasonLabel}），需重新核对。`);
    if (effects && !skipEffectTargets?.has(effectTarget)) {
      effects.push({ target: effectTarget, before: oldReq, after: structuredClone(parentReq) });
    }
  } else if (parentReq.status === 'done') {
    const oldReq = structuredClone(parentReq);
    parentReq.status = 'review';
    warnings.push(`关联 Requirement ${parentReq.id} 已退回待核对状态（${reasonLabel}）。`);
    if (effects && !skipEffectTargets?.has(effectTarget)) {
      effects.push({ target: effectTarget, before: oldReq, after: structuredClone(parentReq) });
    }
  }
}

export function applyWorkItemSemanticInvalidation(params: {
  data: RecordSet;
  before: WorkRecord;
  after: WorkRecord;
  sourceIds: string[];
  warnings: string[];
  effects?: RecordAudit['effects'];
  skipEffectTargets?: Set<string>;
  overwriteLabel?: string;
}): WorkSemanticDiff {
  const { data, before, after, sourceIds, warnings, effects, skipEffectTargets, overwriteLabel } = params;
  const diff = analyzeWorkContentDiff(before, after);
  const label = kindDisplayName(after.kind);

  // 同步更新 data 内部对应对象的最新状态与引用
  for (const rows of [data.units, data.stories, data.boltPlans, data.requirements] as WorkRecord[][]) {
    const idx = rows.findIndex(r => r.id === after.id);
    if (idx >= 0) {
      rows[idx] = after;
      break;
    }
  }

  if (diff.workContentChanged) {
    let invalidatedAnyVerification = false;
    for (const verification of data.verifications) {
      if (verification.target.id !== after.id) continue;
      const shouldInvalidate = diff.coreSpecChanged || diff.invalidatedCriterionIds.has(verification.criterionId);
      if (!shouldInvalidate) continue;

      const oldV = structuredClone(verification);
      verification.outcome = 'unknown';
      verification.explanation = diff.coreSpecChanged
        ? `${label} 内容已修改，原核查须重新核对。`
        : '验收条件内容已修改，原核查须重新核对。';
      verification.sourceRefs = [...new Set([...verification.sourceRefs, ...sourceIds])];
      invalidatedAnyVerification = true;
      const vTarget = `verifications/${verification.id}`;
      if (effects && !skipEffectTargets?.has(vTarget)) {
        effects.push({ target: vTarget, before: oldV, after: structuredClone(verification) });
      }
    }

    if (after.status === 'done') {
      after.status = 'review';
    }
    if (after.kind === 'requirement' && after.acceptance !== null) {
      after.acceptance = null;
      warnings.push('Requirement 内容或验收条件已修改，原整体接受保留在历史中，当前接受已失效。');
    } else if (overwriteLabel) {
      warnings.push(
        invalidatedAnyVerification
          ? `${overwriteLabel}；相关核查已标为未知，需重新核对。`
          : `${overwriteLabel}；工作内容已更新，需重新核对。`
      );
    } else if (invalidatedAnyVerification) {
      warnings.push('对象内容或验收条件变化，相关核查已标为未知；需要重新核对，不能沿用旧通过。');
    }
  } else if (after.kind === 'requirement' && diff.completionFactsChanged && after.acceptance !== null) {
    after.acceptance = null;
    if (after.status === 'done') after.status = 'review';
    warnings.push('Requirement 结果或 PR 记录已修改，原整体接受保留在历史中，当前接受已失效。');
  }

  const reqId = after.kind === 'requirement' ? after.id : after.requirementId;
  const forceParent =
    after.kind === 'requirement'
      ? false
      : (diff.workContentChanged || diff.completionFactsChanged);
  const changedContentItemIds = diff.workContentChanged ? [after.id] : [];
  cascadeDependentDemotionsAndParentInvalidation(
    data,
    reqId,
    `因 ${label} ${after.id} 变更`,
    forceParent,
    warnings,
    effects,
    skipEffectTargets,
    changedContentItemIds
  );

  return diff;
}

export function simulateCandidateMutation(
  projectRecords: RecordSet,
  candidate: ContextCandidate,
  newSources: SourceRecord[],
  runId = 'run'
): CandidateMutationResult {
  const data = structuredClone(projectRecords);
  data.sources.push(...structuredClone(newSources));
  const sourceIds = newSources.map(s => s.id);

  let target = '';
  let before: unknown = null;
  let after: unknown = null;
  let contextId = '';
  let reason = '';
  const warnings: string[] = [];
  const effects: RecordAudit['effects'] = [];

  if (candidate.type === 'append_context') {
    const item: ContextItemRecord = {
      id: 'run-context-' + runId,
      requirementId: candidate.requirementId || null,
      category: candidate.category,
      epistemicStatus: candidate.epistemicStatus,
      content: candidate.content,
      sourceRefs: [...new Set([...candidate.sourceRefs, ...sourceIds])],
      evidenceRefs: []
    };
    data.contextItems.push(item);
    target = 'contextItems/' + item.id;
    before = null;
    after = item;
    contextId = item.id;
    reason = '本人核对差异后保存运行候选；其内容仍为待核对信息。';
  } else if (candidate.type === 'propose_criteria') {
    const req = data.requirements.find(r => r.id === candidate.requirementId)
      ?? fail(404, 'REQUIREMENT_NOT_FOUND', '需求不存在。');
    const criteriaIds = new Set<string>();
    for (const c of candidate.acceptanceCriteria) {
      if (criteriaIds.has(c.id)) {
        fail(400, 'DUPLICATE_CRITERIA_ID', `候选验收标准包含重复 ID: ${c.id}`);
      }
      criteriaIds.add(c.id);
    }
    const oldReqSnapshot = structuredClone(req);
    before = structuredClone(req.acceptanceCriteria);
    const newMap = new Map(candidate.acceptanceCriteria.map(c => [c.id, c]));
    const merged = req.acceptanceCriteria.map(c => (newMap.has(c.id) ? newMap.get(c.id)! : c));
    for (const c of candidate.acceptanceCriteria) {
      if (!merged.some(m => m.id === c.id)) {
        merged.push(c);
      }
    }
    req.acceptanceCriteria = merged;
    req.sourceRefs = [...new Set([...req.sourceRefs, ...sourceIds])];
    target = 'requirements/' + req.id + '/acceptanceCriteria';
    after = req.acceptanceCriteria;
    contextId = 'req-criteria-' + req.id;
    reason = '本人核对差异后采纳验收标准候选。';

    const wasAcceptedOrDone = oldReqSnapshot.acceptance !== null || oldReqSnapshot.status === 'done';
    const diff = applyWorkItemSemanticInvalidation({
      data,
      before: oldReqSnapshot,
      after: req,
      sourceIds,
      warnings,
      effects
    });
    if (diff.workContentChanged && wasAcceptedOrDone) {
      effects.push({ target: 'requirements/' + req.id, before: oldReqSnapshot, after: structuredClone(req) });
    }
  } else if (candidate.type === 'propose_decomposition') {
    const existingUnits: UnitRecord[] = [];
    const existingStories: StoryRecord[] = [];
    const skipEffectTargets = new Set<string>();
    let addedNewChild = false;

    const appliedUnits: UnitRecord[] = [];
    if (candidate.units) {
      const unitIds = new Set<string>();
      for (const u of candidate.units) {
        if (unitIds.has(u.id)) {
          fail(400, 'DUPLICATE_UNIT_ID', `候选 Unit 包含重复 ID: ${u.id}`);
        }
        unitIds.add(u.id);
        if (u.requirementId !== candidate.requirementId || u.status !== 'draft' || u.result !== null) {
          fail(403, 'INVALID_DECOMPOSITION', 'Unit 必须属于本需求且为 draft 状态。');
        }
        skipEffectTargets.add(`units/${u.id}`);
        const existing = data.units.find(item => item.id === u.id);
        if (existing) {
          if (existing.requirementId !== candidate.requirementId) {
            fail(403, 'UNIT_ID_CONFLICT', '不能跨需求接管或覆盖已有 Unit。');
          }
          if (existing.status === 'done') {
            fail(403, 'CANNOT_OVERWRITE_DONE', '不能覆盖已完成的 Unit。');
          }
          const oldUnit = structuredClone(existing);
          existingUnits.push(oldUnit);
          const mergedSources = [...new Set([...existing.sourceRefs, ...u.sourceRefs, ...sourceIds])];
          const semanticChanged = isWorkContentChanged(existing, u);
          const unit: UnitRecord = semanticChanged
            ? { ...u, sourceRefs: mergedSources }
            : { ...u, status: existing.status, result: structuredClone(existing.result), sourceRefs: mergedSources };
          const idx = data.units.findIndex(item => item.id === u.id);
          data.units[idx] = unit;
          appliedUnits.push(unit);
          applyWorkItemSemanticInvalidation({
            data,
            before: oldUnit,
            after: unit,
            sourceIds,
            warnings,
            effects,
            skipEffectTargets,
            overwriteLabel: `覆盖已有 Unit ${u.id}`
          });
        } else {
          const unit: UnitRecord = { ...u, sourceRefs: [...new Set([...u.sourceRefs, ...sourceIds])] };
          data.units.push(unit);
          appliedUnits.push(unit);
          addedNewChild = true;
        }
      }
    }

    const appliedStories: StoryRecord[] = [];
    const storyIds = new Set<string>();
    for (const s of candidate.stories) {
      if (storyIds.has(s.id)) {
        fail(400, 'DUPLICATE_STORY_ID', `候选 Story 包含重复 ID: ${s.id}`);
      }
      storyIds.add(s.id);
      if (s.requirementId !== candidate.requirementId || s.status !== 'draft' || s.result !== null) {
        fail(403, 'INVALID_DECOMPOSITION', 'Story 必须属于本需求且为 draft 状态。');
      }
      skipEffectTargets.add(`stories/${s.id}`);
      const existing = data.stories.find(item => item.id === s.id);
      if (existing) {
        if (existing.requirementId !== candidate.requirementId) {
          fail(403, 'STORY_ID_CONFLICT', '不能跨需求接管或覆盖已有 Story。');
        }
        if (existing.status === 'done') {
          fail(403, 'CANNOT_OVERWRITE_DONE', '不能覆盖已完成的 Story。');
        }
        const oldStory = structuredClone(existing);
        existingStories.push(oldStory);
        const mergedSources = [...new Set([...existing.sourceRefs, ...s.sourceRefs, ...sourceIds])];
        const semanticChanged = isWorkContentChanged(existing, s);
        const story: StoryRecord = semanticChanged
          ? { ...s, sourceRefs: mergedSources }
          : { ...s, status: existing.status, result: structuredClone(existing.result), sourceRefs: mergedSources };
        const idx = data.stories.findIndex(item => item.id === s.id);
        data.stories[idx] = story;
        appliedStories.push(story);
        applyWorkItemSemanticInvalidation({
          data,
          before: oldStory,
          after: story,
          sourceIds,
          warnings,
          effects,
          skipEffectTargets,
          overwriteLabel: `覆盖已有 Story ${s.id}`
        });
      } else {
        const story: StoryRecord = { ...s, sourceRefs: [...new Set([...s.sourceRefs, ...sourceIds])] };
        data.stories.push(story);
        appliedStories.push(story);
        addedNewChild = true;
      }
    }

    if (addedNewChild) {
      cascadeDependentDemotionsAndParentInvalidation(
        data,
        candidate.requirementId,
        '因新增未完成拆解子产物',
        false,
        warnings,
        effects,
        skipEffectTargets
      );
    }

    target = 'requirements/' + candidate.requirementId + '/decomposition';
    before = { units: existingUnits, stories: existingStories };
    after = { units: appliedUnits, stories: appliedStories };
    contextId = 'decomp-' + candidate.requirementId;
    reason = '本人核对差异后采纳 Unit 与 Story 拆解草案。';
  } else if (candidate.type === 'propose_bolt_plan') {
    const bolt = candidate.boltPlan;
    if (bolt.requirementId !== candidate.requirementId || bolt.status !== 'draft' || bolt.result !== null) {
      fail(403, 'INVALID_BOLT_PLAN', 'Bolt Plan 必须属于本需求且为 draft 状态。');
    }
    if (new Set(bolt.storyIds).size !== bolt.storyIds.length) {
      fail(400, 'DUPLICATE_STORY_REF', 'Bolt Plan 关联的 Story ID 存在重复。');
    }
    const skipEffectTargets = new Set<string>([`boltPlans/${bolt.id}`]);
    const existing = data.boltPlans.find(b => b.id === bolt.id);
    if (existing) {
      if (existing.requirementId !== candidate.requirementId) {
        fail(403, 'BOLT_ID_CONFLICT', '不能跨需求接管或覆盖已有 Bolt Plan。');
      }
      if (existing.status === 'done') {
        fail(403, 'CANNOT_OVERWRITE_DONE', '不能覆盖已完成的 Bolt Plan。');
      }
    }
    const oldBolt = existing ? structuredClone(existing) : null;
    before = oldBolt;
    let updatedBolt: BoltPlanRecord;
    if (existing && oldBolt) {
      const mergedSources = [...new Set([...existing.sourceRefs, ...bolt.sourceRefs, ...sourceIds])];
      const semanticChanged = isWorkContentChanged(existing, bolt);
      updatedBolt = semanticChanged
        ? { ...bolt, sourceRefs: mergedSources }
        : { ...bolt, status: existing.status, result: structuredClone(existing.result), sourceRefs: mergedSources };
      const idx = data.boltPlans.findIndex(b => b.id === bolt.id);
      data.boltPlans[idx] = updatedBolt;
      applyWorkItemSemanticInvalidation({
        data,
        before: oldBolt,
        after: updatedBolt,
        sourceIds,
        warnings,
        effects,
        skipEffectTargets,
        overwriteLabel: `覆盖已有 Bolt Plan ${bolt.id}`
      });
    } else {
      updatedBolt = { ...bolt, sourceRefs: [...new Set([...bolt.sourceRefs, ...sourceIds])] };
      data.boltPlans.push(updatedBolt);
      cascadeDependentDemotionsAndParentInvalidation(
        data,
        candidate.requirementId,
        `因新增未完成 Bolt Plan ${bolt.id}`,
        false,
        warnings,
        effects,
        skipEffectTargets
      );
    }
    target = 'boltPlans/' + bolt.id;
    after = updatedBolt;
    contextId = bolt.id;
    reason = '本人核对差异后采纳 Bolt Plan 构建计划草案。';
  }

  return { records: data, before, after, target, contextId, reason, warnings, effects };
}
