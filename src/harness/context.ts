import type { RecordProject } from '../domain/record-project.js';
import type { ContextSnapshot } from '../domain/harness.js';
import { fail } from '../domain/board.js';

export function buildContext(project: RecordProject, requirementId: string, instruction: string,
  maximum: number, hash: (value: unknown) => string): ContextSnapshot {
  const requirement = project.records.requirements.find(item => item.id === requirementId)
    ?? fail(404, 'REQUIREMENT_NOT_FOUND', '需求不存在。');
  if (project.records.intent.confirmation.state !== 'human_confirmed') fail(409, 'INTENT_NOT_CONFIRMED', '请先由本人核对并确认意图。');

  const focusOutline: string[] = [];
  focusOutline.push(`[ACTIVE TARGET] Requirement ${requirement.id}: ${requirement.title} (status: ${requirement.status})`);
  for (const c of requirement.acceptanceCriteria) {
    focusOutline.push(`  - [CRITERIA] ${c.id}: ${c.description} (verification: ${c.verification})`);
  }
  const units = project.records.units.filter(u => u.requirementId === requirement.id);
  for (const u of units) {
    focusOutline.push(`  - [${u.status.toUpperCase()}] Unit ${u.id}: ${u.title}`);
    if (u.responsibilities.length > 0) {
      focusOutline.push(`    responsibilities: ${u.responsibilities.join('; ')}`);
    }
    if (u.inputs.length > 0 || u.outputs.length > 0) {
      focusOutline.push(`    interfaces: inputs=[${u.inputs.join(', ')}], outputs=[${u.outputs.join(', ')}]`);
    }
    for (const c of u.acceptanceCriteria) {
      focusOutline.push(`    criteria: ${c.id}: ${c.description}`);
    }
  }
  const stories = project.records.stories.filter(s => s.requirementId === requirement.id);
  for (const s of stories) {
    focusOutline.push(`  - [${s.status.toUpperCase()}] Story ${s.id}: ${s.title}`);
    if (s.userValue) {
      focusOutline.push(`    value: ${s.userValue}`);
    }
    if (s.dependsOn.length > 0) {
      focusOutline.push(`    dependsOn: ${s.dependsOn.map(d => `${d.kind}:${d.id}`).join(', ')}`);
    }
    for (const c of s.acceptanceCriteria) {
      focusOutline.push(`    criteria: ${c.id}: ${c.description}`);
    }
  }
  const boltPlans = project.records.boltPlans.filter(b => b.requirementId === requirement.id);
  for (const b of boltPlans) {
    focusOutline.push(`  - [${b.status.toUpperCase()}] BoltPlan ${b.id}: ${b.title}`);
    if (b.stages.length > 0) {
      focusOutline.push(`    stages: ${b.stages.join(' -> ')}`);
    }
    if (b.exitConditions.length > 0) {
      focusOutline.push(`    exitConditions: ${b.exitConditions.join('; ')}`);
    }
  }

  const core = { projectId: project.id, requirementId, projectRevision: project.revision,
    intent: structuredClone(project.records.intent), requirement: structuredClone(requirement),
    contextItems: [] as ContextSnapshot['contextItems'], sources: [] as ContextSnapshot['sources'],
    instruction, omitted: [] as string[], focusOutline };
  const items = project.records.contextItems.filter(item => item.requirementId === requirementId ||
    item.requirementId === null);
  const mandatory = (item: ContextSnapshot['contextItems'][number]) => item.category === 'constraint' ||
    (item.category === 'decision' && item.epistemicStatus === 'confirmed');
  const constraints = items.filter(mandatory);
  core.contextItems = structuredClone(constraints);
  const sourcesFor = () => {
    const ids = new Set([...core.intent.sourceRefs, ...core.intent.confirmation.sourceRefs,
      ...core.requirement.sourceRefs, ...core.contextItems.flatMap(item => item.sourceRefs)]);
    core.sources = project.records.sources.filter(item => ids.has(item.id)).map(item => structuredClone(item));
  };
  sourcesFor();
  const size = () => Buffer.byteLength(JSON.stringify(core), 'utf8');
  if (size() + 256 > maximum) fail(413, 'CONTEXT_BUDGET', '必要意图、范围、约束或验收内容超过预算；本轮未调用模型。');
  const priority: Record<string, number> = { decision: 0, open_question: 1, progress: 2, assumption: 3, fact: 4 };
  const optional = items.filter(item => !mandatory(item)).reverse().sort((a,b) =>
    (priority[a.category] ?? 5) - (priority[b.category] ?? 5));
  for (const item of optional) {
    core.contextItems.push(structuredClone(item)); sourcesFor();
    if (size() + 256 > maximum) {
      core.contextItems.pop(); sourcesFor(); core.omitted.push(item.id);
    }
  }
  // The omission manifest also consumes space. Give optional items back before refusing core content.
  while (size() + 256 > maximum && core.contextItems.length > constraints.length) {
    const removed = core.contextItems.pop();
    if (removed) core.omitted.push(removed.id);
    sourcesFor();
  }
  if (size() + 256 > maximum) fail(413, 'CONTEXT_BUDGET', '必要内容及省略清单超过预算，请减少相关材料后重试。');
  const result = { ...core, bytes: size(), hash: hash(core) };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > maximum) fail(413, 'CONTEXT_BUDGET', '上下文超过预算。');
  return result;
}
