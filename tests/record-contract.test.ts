import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import type { RecordSet, RequirementRecord, UnitRecord } from '../src/domain/record-contract.js';
import { validateRecordSet } from '../src/application/record-validation.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';

const structure = createRecordStructureValidator();
function fixture(name = 'planned.json'): RecordSet {
  // Owned fixture; runtime validation below checks it independently against the schemas.
  return JSON.parse(readFileSync(new URL('../examples/records/' + name, import.meta.url), 'utf8')) as RecordSet;
}
function inspect(value: unknown) { return validateRecordSet(value, structure); }
function has(value: unknown, code: string): void {
  const report = inspect(value);
  assert.equal(report.valid, false, JSON.stringify(report));
  assert.ok(report.issues.some(issue => issue.code === code), JSON.stringify(report));
}
function requirement(data: RecordSet): RequirementRecord {
  const value = data.requirements[0]; assert.ok(value); return value;
}
function unit(data: RecordSet): UnitRecord {
  const value = data.units[0]; assert.ok(value); return value;
}

test('Schema：合法分层计划与合成完成记录通过，只报告结构 / 关系结果且不修改输入', () => {
  for (const name of ['planned.json', 'completed.synthetic.json']) {
    const data = fixture(name);
    const before = structuredClone(data);
    assert.deepEqual(inspect(data), { valid: true, scope: 'structure-and-relations', issues: [] });
    assert.deepEqual(data, before);
  }
});

test('Schema：层级可按需省略，Story 可直接归属 Requirement；Bolt 仍须关联 Story', () => {
  const data = fixture();
  data.units = [];
  const story = data.stories[0]; assert.ok(story);
  story.unitId = null;
  assert.equal(inspect(data).valid, true);
  data.stories = []; data.boltPlans = [];
  assert.equal(inspect(data).valid, true);
  data.requirements = [];
  data.contextItems = [];
  assert.equal(inspect(data).valid, true);
  const missing = fixture();
  const bolt = missing.boltPlans[0]; assert.ok(bolt);
  bolt.storyIds = [];
  has(missing, 'SCHEMA_MINITEMS');
});

test('Schema：不做类型强转、默认填值或移除非法字段', () => {
  const data = fixture();
  const bad: unknown = { ...data, approved: true };
  has(bad, 'SCHEMA_ADDITIONALPROPERTIES');
  has({ ...data, schemaVersion: 1 }, 'SCHEMA_CONST');
  has({ ...data, schemaVersion: '2.0.0' }, 'SCHEMA_CONST');
  const { evidence: ignored, ...missing } = data;
  assert.equal(ignored.length, 0);
  has(missing, 'SCHEMA_REQUIRED');
});

test('长期上下文：保留最小出处，拒绝完整对话字段、过长摘录与无出处内容', () => {
  const data = fixture();
  const source = data.sources[0]; assert.ok(source);
  source.excerpt = 'x'.repeat(601);
  has(data, 'SCHEMA_MAXLENGTH');
  source.excerpt = null;
  const context = data.contextItems[0]; assert.ok(context);
  context.sourceRefs = [];
  has(data, 'SCHEMA_MINITEMS');
  has({ ...fixture(), transcript: '# 完整原始对话' }, 'SCHEMA_ADDITIONALPROPERTIES');
});

test('长期上下文：未决问题保持未知，观察必须引用证据；不能附加审批或可信标记', () => {
  const data = fixture();
  const item = data.contextItems[1]; assert.ok(item);
  item.epistemicStatus = 'confirmed';
  has(data, 'SCHEMA_CONST');
  item.category = 'fact'; item.epistemicStatus = 'observed';
  has(data, 'SCHEMA_MINITEMS');
  const original = fixture();
  const entry = original.contextItems[0]; assert.ok(entry);
  has({ ...original, contextItems: [{ ...entry, trusted: true, approved: true }] }, 'SCHEMA_ADDITIONALPROPERTIES');
});

test('来源与身份：确认记录必须有出处，但离线合同校验不声称鉴定人工身份', () => {
  const data = fixture();
  data.intent.confirmation.sourceRefs = [];
  has(data, 'SCHEMA_MINITEMS');
  data.intent.confirmation.state = 'proposed';
  has(data, 'INTENT_NOT_CONFIRMED');
  requirement(data).status = 'draft';
  assert.equal(inspect(data).valid, true);
});

test('关系：ID 唯一且全部来源引用须存在', () => {
  const data = fixture();
  unit(data).id = requirement(data).id;
  has(data, 'DUPLICATE_ID');
  has(fixture('invalid/unknown-source.json'), 'UNKNOWN_REFERENCE');
});

test('归属：子产物必须归属一个已知 Requirement，不能分享 Unit 或跨需求依赖', () => {
  has(fixture('invalid/cross-requirement.json'), 'INVALID_UNIT');
  const data = fixture();
  unit(data).requirementId = 'UNKNOWN';
  has(data, 'UNKNOWN_REQUIREMENT');
  const shared = fixture();
  const other = { ...structuredClone(requirement(shared)), id: 'OTHER-REQ' };
  shared.requirements.push(other);
  const otherUnit = { ...structuredClone(unit(shared)), id: 'OTHER-UNIT', requirementId: other.id };
  shared.units.push(otherUnit);
  unit(shared).dependsOn = [{ kind: 'unit', id: otherUnit.id }];
  has(shared, 'CROSS_REQUIREMENT_DEPENDENCY');
});

test('归属：Bolt 只能关联本需求的 Stories，类型错误或未知引用被拒绝', () => {
  const data = fixture();
  const bolt = data.boltPlans[0]; assert.ok(bolt);
  bolt.storyIds = [unit(data).id];
  has(data, 'INVALID_STORY');
  bolt.storyIds = ['MISSING-STORY'];
  has(data, 'INVALID_STORY');
});

test('依赖：自引用、错误类型及循环被拒绝，合法菱形依赖通过', () => {
  const data = fixture();
  const a = unit(data);
  a.dependsOn = [{ kind: 'unit', id: a.id }];
  has(data, 'SELF_DEPENDENCY');
  a.dependsOn = [{ kind: 'story', id: a.id }];
  has(data, 'UNKNOWN_TARGET');
  const b = { ...structuredClone(a), id: 'UNIT-B', dependsOn: [{ kind: 'unit' as const, id: a.id }] };
  data.units.push(b);
  a.dependsOn = [{ kind: 'unit', id: b.id }];
  has(data, 'DEPENDENCY_CYCLE');
  b.dependsOn = [];
  const c = { ...structuredClone(b), id: 'UNIT-C', dependsOn: [{ kind: 'unit' as const, id: b.id }] };
  data.units.push(c);
  a.dependsOn = [{ kind: 'unit', id: b.id }, { kind: 'unit', id: c.id }];
  assert.equal(inspect(data).valid, true);
});

test('一需求一 PR：Requirement 只能有单个最终 PR，子产物不能另挂 PR，也不能跨需求共用', () => {
  const data = fixture('completed.synthetic.json');
  const r = requirement(data);
  assert.ok(r.pullRequest);
  const extra = { ...structuredClone(r), id: 'OTHER-REQ', status: 'planned' as const, result: null, acceptance: null };
  data.requirements.push(extra);
  has(data, 'SHARED_PULL_REQUEST');
  const planned = fixture();
  has({ ...planned, units: [{ ...unit(planned), pullRequest: r.pullRequest }] }, 'SCHEMA_ADDITIONALPROPERTIES');
  has({ ...planned, requirements: [{ ...requirement(planned), pullRequest: [r.pullRequest] }] }, 'SCHEMA_TYPE');
});

test('证据：完成子产物须有对应验收通过记录，未知、失败和模型意见均不能替代', () => {
  has(fixture('invalid/missing-verification.json'), 'MISSING_PASSING_EVIDENCE');
  for (const outcome of ['unknown', 'failed'] as const) {
    const data = fixture('completed.synthetic.json');
    const check = data.verifications[1]; assert.ok(check);
    check.outcome = outcome;
    has(data, 'MISSING_PASSING_EVIDENCE');
  }
  const data = fixture('completed.synthetic.json');
  const check = data.verifications[1]; assert.ok(check);
  check.method = 'model_review';
  has(data, 'MISSING_PASSING_EVIDENCE');
});

test('证据：必须适用于目标；核查不能引用未知验收条件，快照不混用多份当前结果', () => {
  const data = fixture('completed.synthetic.json');
  const ev = data.evidence[0]; assert.ok(ev);
  ev.targets = [{ kind: 'requirement', id: requirement(data).id }];
  has(data, 'INAPPLICABLE_EVIDENCE');
  const missing = fixture('completed.synthetic.json');
  const check = missing.verifications[0]; assert.ok(check);
  check.criterionId = 'UNKNOWN';
  has(missing, 'UNKNOWN_CRITERION');
  const duplicated = fixture('completed.synthetic.json');
  const first = duplicated.verifications[0]; assert.ok(first);
  duplicated.verifications.push({ ...first, id: 'NEW-CHECK', outcome: 'failed' });
  has(duplicated, 'DUPLICATE_VERIFICATION');
});

test('完成：子单元通过不能替代整体核对、最终人端接受和唯一 PR', () => {
  const data = fixture('completed.synthetic.json');
  const story = data.stories[0]; assert.ok(story);
  story.status = 'review';
  has(data, 'INCOMPLETE_DECOMPOSITION');
  const accepted = fixture('completed.synthetic.json');
  requirement(accepted).acceptance = null;
  assert.equal(inspect(accepted).valid, false);
  const noPr = fixture('completed.synthetic.json');
  requirement(noPr).pullRequest = null;
  assert.equal(inspect(noPr).valid, false);
  const failedOverall = fixture('completed.synthetic.json');
  const overall = failedOverall.verifications[0]; assert.ok(overall);
  overall.outcome = 'failed';
  has(failedOverall, 'MISSING_PASSING_EVIDENCE');
});

test('阶段：草案允许验收条件未齐，正式计划和完成报告须逐步补足', () => {
  const data = fixture();
  const r = requirement(data);
  r.status = 'draft'; r.acceptanceCriteria = [];
  assert.equal(inspect(data).valid, true);
  r.status = 'planned';
  has(data, 'SCHEMA_MINITEMS');
  r.status = 'review'; r.acceptanceCriteria = [fixture().requirements[0]?.acceptanceCriteria[0]].filter(
    (value): value is NonNullable<typeof value> => value !== undefined);
  assert.equal(inspect(data).valid, false);
});

test('CLI：源码及编译入口只读校验，合法 / 非法输入使用不同退出码，错误不输出原始记录', () => {
  const sourceArgs = ['--import', 'tsx', 'src/presentation/validate-records.ts'];
  const run = (file: string) => spawnSync(process.execPath, [...sourceArgs, file], { cwd: process.cwd(), encoding: 'utf8' });
  const good = run('examples/records/planned.json');
  assert.equal(good.status, 0, good.stderr);
  assert.equal((JSON.parse(good.stdout) as { valid: boolean }).valid, true);
  const bad = run('examples/records/invalid/unknown-source.json');
  assert.equal(bad.status, 1, bad.stderr);
  assert.equal((JSON.parse(bad.stdout) as { valid: boolean }).valid, false);
  const missing = run('examples/records/does-not-exist.json');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /RECORD_VALIDATION_ERROR/);
});

test('失败边界：结构验证器返回失败但缺少诊断时，不能静默变为通过', () => {
  const report = validateRecordSet(null, { check: () => ({ valid: false, issues: [] }) });
  assert.equal(report.valid, false);
  assert.equal(report.issues[0]?.code, 'STRUCTURE_VALIDATION_FAILED');
});
