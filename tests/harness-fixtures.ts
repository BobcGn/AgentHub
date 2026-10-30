import { join } from 'node:path';
import { fixture as baseFixture, human } from './fixtures.js';
import { RecordProjectService } from '../src/application/record-project-service.js';
import { HarnessService } from '../src/application/harness-service.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { createCandidateValidator } from '../src/infrastructure/harness-validator.js';
import { JsonRunStore } from '../src/infrastructure/run-store.js';
import { scriptedModel } from '../src/infrastructure/scripted-model.js';
import type { ModelPort, RunLimits, RunRepository } from '../src/domain/harness.js';
export function harnessFixture(model: ModelPort = scriptedModel, limits?: Partial<RunLimits>) {
  const f = baseFixture(), validator = createRecordStructureValidator();
  const records = new RecordProjectService(f.recordStore, f.service, validator);
  const initial = records.create(human, { name: 'AgentHub · 隔离自测', title: 'AgentHub 先理解再推进（测试表示）',
    problem: '跨会话丢失进度，运行过程不透明。', expectedOutcome: '从正式记录继承需求与待核对信息。',
    includes: ['记录与脚本化候选'], excludes: ['真实模型、Shell、Git'], constraints: ['不得把替身输出当真实验收。'], confirmed: true }, 'harness-test-create');
  const project = records.saveRecord(human, initial.id, { baseRevision: initial.revision, collection: 'requirements', id: null,
    record: { id: 'REQ-HARNESS-1', kind: 'requirement', intentId: initial.records.intent.id,
      title: '建设 AgentHub 的最小 Harness', problem: '需要观察候选和停止过程。', expectedOutcome: '长期 JSON 可恢复当前进度。',
      scope: { includes: ['单需求候选'], excludes: ['自动接受'] }, rationale: '在接入真实模型前验证边界。',
      expectedImpact: '降低跨会话理解成本。', acceptanceCriteria: [], sourceRefs: [], status: 'draft', result: null,
      constraints: ['人端确认才保存长期信息'], acceptance: null, pullRequest: null },
    reason: '测试夹具：不代表实际用户数据或验收。', confirmed: true }, 'harness-test-requirement');
  const runs = new JsonRunStore(join(f.dir, 'runs'));
  const open = (runStore: RunRepository = runs) => new HarnessService({ runs: runStore, projects: f.recordStore, records,
    validator, candidates: createCandidateValidator(), model, ...(limits ? { limits } : {}) });
  const harness = open();
  return { ...f, records, project, runs, harness, open, start(instruction = '核对跨会话是否继承当前进度', key = 'harness-start-001') {
    return harness.start(human, project.id, { requirementId: 'REQ-HARNESS-1', baseRevision: records.get(human, project.id).revision, instruction, confirmed: true }, key);
  } };
}
export function deferred<T>() {
  let deliver: (value: T) => void = () => { throw new Error('尚未创建等待器'); };
  const promise = new Promise<T>(resolve => { deliver = resolve; });
  return { promise, resolve(value: T) { deliver(value); } };
}
