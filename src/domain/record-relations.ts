import type { ContractIssue, RecordSet, TargetRef, WorkRecord } from './record-contract.js';

export function inspectRecordRelations(data: RecordSet): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const add = (code: string, path: string, message: string): void => { issues.push({ code, path, message }); };
  const allIds = new Set<string>();
  const groups = [
    ['intent', [data.intent]], ['requirements', data.requirements], ['units', data.units],
    ['stories', data.stories], ['boltPlans', data.boltPlans], ['sources', data.sources],
    ['contextItems', data.contextItems], ['evidence', data.evidence], ['verifications', data.verifications]
  ] as const;
  for (const [name, records] of groups) records.forEach((record, i) => {
    const path = name === 'intent' ? '/intent' : '/' + name + '/' + i;
    if (allIds.has(record.id)) add('DUPLICATE_ID', path + '/id', '记录 ID 必须在集合内唯一。');
    allIds.add(record.id);
  });
  if (issues.length) return issues;

  const requirements = new Map(data.requirements.map(record => [record.id, record]));
  const sources = new Map(data.sources.map(record => [record.id, record]));
  const evidence = new Map(data.evidence.map(record => [record.id, record]));
  const work = new Map<string, { record: WorkRecord; path: string }>();
  const workGroups = [['requirements', data.requirements], ['units', data.units],
    ['stories', data.stories], ['boltPlans', data.boltPlans]] as const;
  for (const [name, records] of workGroups) records.forEach((record, i) => {
    work.set(record.id, { record, path: '/' + name + '/' + i });
  });
  const owner = (record: WorkRecord): string => record.kind === 'requirement' ? record.id : record.requirementId;
  function target(ref: TargetRef, path: string): WorkRecord | undefined {
    const found = work.get(ref.id)?.record;
    if (!found || found.kind !== ref.kind) {
      add('UNKNOWN_TARGET', path, '对象不存在或类型不匹配。');
      return undefined;
    }
    return found;
  }
  function references(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((item: unknown, i) => references(item, path + '/' + i));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const at = path + '/' + key;
        if ((key === 'sourceRefs' || key === 'evidenceRefs') && Array.isArray(item)) {
          const lookup = key === 'sourceRefs' ? sources : evidence;
          item.forEach((id: unknown, i) => {
            if (typeof id === 'string' && !lookup.has(id)) add('UNKNOWN_REFERENCE', at + '/' + i, '引用的来源或证据不存在。');
          });
        } else references(item, at);
      }
    }
  }
  references(data, '');
  function applicable(refs: string[], record: WorkRecord, path: string): void {
    refs.forEach((id, i) => {
      const found = evidence.get(id);
      if (found && (found.requirementId !== owner(record) ||
          !found.targets.some(ref => ref.kind === record.kind && ref.id === record.id))) {
        add('INAPPLICABLE_EVIDENCE', path + '/' + i, '证据不适用于当前 Requirement / 对象。');
      }
    });
  }

  const urls = new Set<string>();
  const identifiers = new Set<string>();
  for (const requirement of data.requirements) {
    const path = work.get(requirement.id)?.path ?? '/requirements';
    if (requirement.identifier) {
      if (identifiers.has(requirement.identifier)) add('DUPLICATE_IDENTIFIER', path + '/identifier', '需求标识须在项目内唯一。');
      identifiers.add(requirement.identifier);
    }
    if (requirement.intentId !== data.intent.id) add('UNKNOWN_INTENT', path + '/intentId', 'Requirement 必须关联集合中的 Intent。');
    if (requirement.status !== 'draft' && data.intent.confirmation.state !== 'human_confirmed') {
      add('INTENT_NOT_CONFIRMED', path + '/status', '正式计划须记录适用 Intent 的人端确认出处；校验不鉴定出处真实性。');
    }
    if (requirement.pullRequest) {
      if (urls.has(requirement.pullRequest.url)) add('SHARED_PULL_REQUEST', path + '/pullRequest', '不同 Requirement 不得共用同一个最终 PR。');
      urls.add(requirement.pullRequest.url);
    }
  }
  for (const { record, path } of work.values()) {
    if (record.kind !== 'requirement' && !requirements.has(record.requirementId)) {
      add('UNKNOWN_REQUIREMENT', path + '/requirementId', '拆解产物必须唯一归属本集合中的一个 Requirement。');
    }
    const criteria = new Set<string>();
    record.acceptanceCriteria.forEach((criterion, i) => {
      if (criteria.has(criterion.id)) add('DUPLICATE_CRITERION', path + '/acceptanceCriteria/' + i, '同一对象的验收条件 ID 不得重复。');
      criteria.add(criterion.id);
    });
    if (record.result) applicable(record.result.evidenceRefs, record, path + '/result/evidenceRefs');
    if (record.kind === 'requirement') continue;
    record.dependsOn.forEach((ref, i) => {
      const at = path + '/dependsOn/' + i;
      const dependency = target(ref, at);
      if (dependency && (dependency.kind === 'requirement' || owner(dependency) !== owner(record))) {
        add('CROSS_REQUIREMENT_DEPENDENCY', at, '拆解依赖必须是同一 Requirement 内的拆解产物。');
      }
      if (dependency?.id === record.id) add('SELF_DEPENDENCY', at, '对象不能依赖自身。');
      if (dependency && record.status === 'done' && dependency.status !== 'done') add('DEPENDENCY_NOT_DONE', at, '完成产物仍有未完成的依赖。');
    });
    if (record.kind === 'story' && record.unitId !== null) {
      const unit = work.get(record.unitId)?.record;
      if (!unit || unit.kind !== 'unit' || owner(unit) !== owner(record)) {
        add('INVALID_UNIT', path + '/unitId', 'Story 的 Unit 必须属于同一 Requirement；不需要 Unit 时可为 null。');
      }
    }
    if (record.kind === 'bolt_plan') record.storyIds.forEach((id, i) => {
      const story = work.get(id)?.record;
      if (!story || story.kind !== 'story' || owner(story) !== owner(record)) {
        add('INVALID_STORY', path + '/storyIds/' + i, 'Bolt Plan 只能安排同一 Requirement 的已存在 Stories。');
      }
    });
  }

  // Iterative traversal avoids a call stack proportional to the dependency chain.
  const colors = new Map<string, number>();
  for (const [id] of work) {
    if (colors.has(id)) continue;
    const stack: Array<{ id: string; leaving: boolean }> = [{ id, leaving: false }];
    while (stack.length) {
      const step = stack.pop();
      if (!step) break;
      if (step.leaving) { colors.set(step.id, 2); continue; }
      if (colors.get(step.id) === 1) {
        add('DEPENDENCY_CYCLE', work.get(step.id)?.path ?? '', '拆解依赖存在循环。');
        continue;
      }
      if (colors.get(step.id) === 2) continue;
      colors.set(step.id, 1);
      stack.push({ id: step.id, leaving: true });
      const record = work.get(step.id)?.record;
      if (!record || record.kind === 'requirement') continue;
      for (const ref of [...record.dependsOn].reverse()) {
        if (work.get(ref.id)?.record.kind === ref.kind) stack.push({ id: ref.id, leaving: false });
      }
    }
  }

  data.evidence.forEach((entry, i) => {
    if (!requirements.has(entry.requirementId)) add('UNKNOWN_REQUIREMENT', '/evidence/' + i + '/requirementId', '证据关联的 Requirement 不存在。');
    entry.targets.forEach((ref, j) => {
      const record = target(ref, '/evidence/' + i + '/targets/' + j);
      if (record && owner(record) !== entry.requirementId) add('CROSS_REQUIREMENT_EVIDENCE', '/evidence/' + i, '证据目标必须属于其声明的 Requirement。');
    });
  });
  data.contextItems.forEach((item, i) => {
    if (item.requirementId !== null && !requirements.has(item.requirementId)) add('UNKNOWN_REQUIREMENT', '/contextItems/' + i, '上下文关联的 Requirement 不存在。');
    if (item.requirementId !== null && item.evidenceRefs.some(id => {
      const found = evidence.get(id); return found && found.requirementId !== item.requirementId;
    })) add('CROSS_REQUIREMENT_EVIDENCE', '/contextItems/' + i, '需求上下文不能引用其他需求的证据。');
  });

  const checks = new Map<string, typeof data.verifications[number]>();
  data.verifications.forEach((verification, i) => {
    const path = '/verifications/' + i;
    const record = target(verification.target, path + '/target');
    const key = verification.target.kind + ':' + verification.target.id + ':' + verification.criterionId;
    if (checks.has(key)) add('DUPLICATE_VERIFICATION', path, '快照内同一条件只保留一个当前核查结果，不能用旧通过覆盖新失败。');
    checks.set(key, verification);
    if (record) {
      if (!record.acceptanceCriteria.some(item => item.id === verification.criterionId)) add('UNKNOWN_CRITERION', path + '/criterionId', '验收条件不属于目标对象。');
      applicable(verification.evidenceRefs, record, path + '/evidenceRefs');
    }
  });

  for (const { record, path } of work.values()) {
    if (record.status !== 'done') continue;
    if (!record.acceptanceCriteria.length) add('MISSING_ACCEPTANCE', path, '完成对象必须有验收条件。');
    for (const criterion of record.acceptanceCriteria) {
      const verification = checks.get(record.kind + ':' + record.id + ':' + criterion.id);
      if (!verification || verification.outcome !== 'passed' || verification.method === 'model_review' || !verification.evidenceRefs.length) {
        add('MISSING_PASSING_EVIDENCE', path + '/acceptanceCriteria', '每个完成条件须有适用证据支持的当前通过记录，模型审查不能单独满足。');
      }
    }
    if (record.kind === 'requirement' && [...work.values()].some(item =>
      item.record.kind !== 'requirement' && owner(item.record) === record.id && item.record.status !== 'done')) {
      add('INCOMPLETE_DECOMPOSITION', path, 'Requirement 完成前，其现有拆解产物均须完成并提供对应证据。');
    }
  }
  return issues;
}
