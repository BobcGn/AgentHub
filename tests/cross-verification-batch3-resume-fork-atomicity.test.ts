import assert from 'node:assert/strict';
import test from 'node:test';
import { HubError } from '../src/domain/board.js';
import type { ContextSnapshot, ModelPort, ModelStepInput, ModelStepOutput } from '../src/domain/harness.js';
import { harnessFixture } from './harness-fixtures.js';

const human = { kind: 'human' as const };

function makeTwoStepModel(name: string, toolOutputMarker = 'OBSERVED_DATA'): ModelPort {
  return {
    name,
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() {
      throw new Error('Unused');
    },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-1', name: 'read_file', arguments: { path: 'src/target.ts' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: `由 ${name} 生成的原始候选 (${toolOutputMarker})`,
          sourceRefs: []
        }
      };
    }
  };
}

test('Batch 3 反例 1：恢复或切换模型时若项目修订过期或调用/输入预算不足，必须零副作用拒绝，严禁提前清空原候选或改写原账本', async t => {
  const modelA = makeTwoStepModel('model-alpha');
  const modelB = makeTwoStepModel('model-beta');

  // 子场景 A：项目修订过期 (STALE_RUN_CONTEXT) 时调用 resume + model 切换
  const f1 = harnessFixture(modelA);
  t.after(f1.cleanup);
  const harness1 = f1.open();
  harness1.registerModelPort('model-alpha', modelA);
  harness1.registerModelPort('model-beta', modelB);
  (harness1 as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.tools = [
    { name: 'read_file', description: 'read', parameters: { type: 'object' } }
  ];
  (harness1 as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.toolExecutor = async () => ({
    callId: 'tc-1',
    toolName: 'read_file',
    output: 'export const X = 1;\n'
  });

  const started1 = harness1.start(human, f1.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f1.project.revision,
    instruction: '测试修订过期恢复无副作用',
    confirmed: true,
    model: 'model-alpha'
  }, 'req-b3-stale-resume');
  await harness1.settled(started1.id);
  const beforeStaleResume = structuredClone(harness1.get(human, started1.id));
  assert.equal(beforeStaleResume.state, 'waiting_human');
  assert.ok(beforeStaleResume.candidate !== null);
  assert.equal(beforeStaleResume.turns?.length, 3);

  // 推进正式项目修订，使 beforeStaleResume.baseRevision 过期
  f1.records.saveRecord(human, f1.project.id, {
    baseRevision: f1.project.revision,
    collection: 'sources',
    id: null,
    reason: '新增正式来源以推进项目修订',
    confirmed: true,
    record: {
      id: 'SRC-B3-NEW',
      kind: 'message',
      locator: 'human:test/b3-advance-1',
      excerpt: '人端新增来源使项目修订前进'
    }
  }, 'req-save-b3-1');

  assert.throws(
    () => harness1.resume(human, beforeStaleResume.id, {
      revision: beforeStaleResume.revision,
      confirmed: true,
      model: 'model-beta'
    }),
    (err: unknown) => err instanceof HubError && err.status === 409 && err.code === 'STALE_RUN_CONTEXT'
  );

  const afterStaleResume = harness1.get(human, beforeStaleResume.id);
  assert.equal(afterStaleResume.revision, beforeStaleResume.revision, '失败恢复不得递增 Run 修订号');
  assert.equal(afterStaleResume.state, 'waiting_human', '失败恢复必须保留原状态');
  assert.equal(afterStaleResume.model, 'model-alpha', '失败恢复不得提前改写 model');
  assert.deepEqual(afterStaleResume.runtime, beforeStaleResume.runtime, '失败恢复不得提前改写 runtime');
  assert.deepEqual(afterStaleResume.candidate, beforeStaleResume.candidate, '失败恢复必须完整保留原候选');
  assert.deepEqual(afterStaleResume.turns, beforeStaleResume.turns, '失败恢复必须完整保留原步骤账本');
  assert.equal(afterStaleResume.events.length, beforeStaleResume.events.length, '失败恢复不得写入半截 model_switched 事件');

  // 子场景 B：调用预算已耗尽 (maxCalls === 2 且已完成 2 次调用) 时切换模型恢复，必须同步拒绝且保留原候选与账本
  const f2 = harnessFixture(modelA, { maxCalls: 2 });
  t.after(f2.cleanup);
  const harness2 = f2.open();
  harness2.registerModelPort('model-alpha', modelA);
  harness2.registerModelPort('model-beta', modelB);
  (harness2 as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.tools = [
    { name: 'read_file', description: 'read', parameters: { type: 'object' } }
  ];
  (harness2 as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.toolExecutor = async () => ({
    callId: 'tc-1',
    toolName: 'read_file',
    output: 'export const Y = 2;\n'
  });

  const started2 = harness2.start(human, f2.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f2.project.revision,
    instruction: '测试调用预算耗尽时切换模型恢复无副作用',
    confirmed: true,
    model: 'model-alpha'
  }, 'req-b3-call-budget-resume');
  await harness2.settled(started2.id);
  const beforeBudgetResume = structuredClone(harness2.get(human, started2.id));
  assert.equal(beforeBudgetResume.state, 'waiting_human');
  assert.equal(beforeBudgetResume.calls, 2);
  assert.ok(beforeBudgetResume.candidate !== null);

  assert.throws(
    () => harness2.resume(human, beforeBudgetResume.id, {
      revision: beforeBudgetResume.revision,
      confirmed: true,
      model: 'model-beta'
    }),
    (err: unknown) => err instanceof HubError && err.status === 409 && err.code === 'CALL_BUDGET'
  );

  const afterBudgetResume = harness2.get(human, beforeBudgetResume.id);
  assert.equal(afterBudgetResume.revision, beforeBudgetResume.revision, '预算不足时不得修改 Run 修订号');
  assert.equal(afterBudgetResume.state, 'waiting_human', '预算不足时不得把已产出候选的 Run 破坏为 failed');
  assert.equal(afterBudgetResume.model, 'model-alpha');
  assert.deepEqual(afterBudgetResume.candidate, beforeBudgetResume.candidate, '预算不足时必须保留原候选');
  assert.deepEqual(afterBudgetResume.turns, beforeBudgetResume.turns, '预算不足时必须保留原账本');
});

test('Batch 3 反例 2：项目修订变化后分叉会话不得将旧修订观察静默继承为当前依据，仅允许零步干净分叉或新运行', async t => {
  const model = makeTwoStepModel('fork-parent-model');
  const f = harnessFixture(model);
  t.after(f.cleanup);
  const harness = f.open();
  harness.registerModelPort('fork-parent-model', model);
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.tools = [
    { name: 'read_file', description: 'read', parameters: { type: 'object' } }
  ];
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.toolExecutor = async () => ({
    callId: 'tc-1',
    toolName: 'read_file',
    output: 'export const OLD_OBS = true;\n'
  });

  const startedParent = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '基于旧修订采集观察',
    confirmed: true,
    model: 'fork-parent-model'
  }, 'req-b3-fork-parent');
  await harness.settled(startedParent.id);
  const parentBefore = structuredClone(harness.get(human, startedParent.id));
  assert.equal(parentBefore.state, 'waiting_human');
  assert.equal(parentBefore.turns?.length, 3);

  // 推进项目修订
  const saved = f.records.saveRecord(human, f.project.id, {
    baseRevision: f.project.revision,
    collection: 'sources',
    id: null,
    reason: '新增正式来源以推进项目修订',
    confirmed: true,
    record: {
      id: 'SRC-B3-FORK-ADVANCE',
      kind: 'message',
      locator: 'human:test/b3-advance-2',
      excerpt: '人端更新正式记录，旧运行观察对应的基准修订已变化'
    }
  }, 'req-save-b3-2');
  assert.notEqual(saved.revision, parentBefore.baseRevision);

  const runCountBefore = harness.list(human, f.project.id).length;

  // 试图继承第 2 步旧观察直接分叉到新项目修订 -> 必须保守拒绝！
  assert.throws(
    () => harness.fork(human, parentBefore.id, {
      forkPointStep: 2,
      confirmed: true,
      instruction: '试图在新修订下直接继承旧观察'
    }, 'req-b3-fork-stale-step2'),
    (err: unknown) => err instanceof HubError && err.status === 409 && err.code === 'STALE_OBSERVATIONS_NOT_INHERITABLE'
  );

  // 失败分叉不得创建半成品 Run，也不得污染父 Run
  assert.equal(harness.list(human, f.project.id).length, runCountBefore);
  assert.deepEqual(harness.get(human, parentBefore.id), parentBefore);

  // 若显式指定 forkPointStep: 0（不继承任何旧观察，干净重跑），允许在新修订下创建新分支
  const cleanFork = harness.fork(human, parentBefore.id, {
    forkPointStep: 0,
    confirmed: true,
    instruction: '在新修订下从零步干净重跑'
  }, 'req-b3-fork-clean-step0');
  await harness.settled(cleanFork.id);
  const cleanForkDone = harness.get(human, cleanFork.id);
  assert.equal(cleanForkDone.baseRevision, saved.revision);
  assert.equal(cleanForkDone.state, 'waiting_human');
  assert.equal(cleanForkDone.fork?.forkPointStep, 0);
});

test('Batch 3 反例 3：切换至仅支持 propose 的模型时不得静默截断 >200 字符工具输出，且超输入预算时原子拒绝并保留原候选', async t => {
  const longToolOutput = `${'A'.repeat(950)}::CRITICAL_TAIL_MARKER_AT_END_999::${'Z'.repeat(180)}`;
  assert.ok(longToolOutput.length > 1100);

  const stepExplorer: ModelPort = {
    name: 'step-explorer-long',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() {
      throw new Error('Unused');
    },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'tc-long', name: 'read_file', arguments: { path: 'src/large-module.ts' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '探索模型初始候选',
          sourceRefs: []
        }
      };
    }
  };

  let receivedSnapshot: ContextSnapshot | null = null;
  const proposeSummarizer: ModelPort = {
    name: 'propose-summarizer-full',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose(snapshot: ContextSnapshot) {
      receivedSnapshot = snapshot;
      return {
        type: 'append_context',
        requirementId: snapshot.requirementId,
        category: 'assumption',
        epistemicStatus: 'proposed',
        content: 'Propose 模型基于完整长工具输出生成的候选',
        sourceRefs: []
      };
    }
  };

  const f = harnessFixture(stepExplorer, { maxInputBytes: 32000 });
  t.after(f.cleanup);
  const harness = f.open();
  harness.registerModelPort('step-explorer-long', stepExplorer);
  harness.registerModelPort('propose-summarizer-full', proposeSummarizer);
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.tools = [
    { name: 'read_file', description: 'read', parameters: { type: 'object' } }
  ];
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.toolExecutor = async () => ({
    callId: 'tc-long',
    toolName: 'read_file',
    output: longToolOutput
  });

  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '读取长模块并切换至 propose 模型',
    confirmed: true,
    model: 'step-explorer-long'
  }, 'req-b3-long-tool');
  await harness.settled(started.id);
  const afterStep = harness.get(human, started.id);
  assert.equal(afterStep.state, 'waiting_human');

  // 切换至 propose-only 模型：必须收到完整的 >1100 字符工具输出（含末尾 CRITICAL_TAIL_MARKER_AT_END_999 与工具调用标识 src/large-module.ts）
  const resumed = harness.resume(human, afterStep.id, {
    revision: afterStep.revision,
    confirmed: true,
    model: 'propose-summarizer-full'
  });
  await harness.settled(resumed.id);
  const afterPropose = harness.get(human, resumed.id);
  assert.equal(afterPropose.state, 'waiting_human');
  assert.ok(receivedSnapshot !== null);
  const joinedOutline = (receivedSnapshot as ContextSnapshot).focusOutline?.join('\n') ?? '';
  assert.ok(joinedOutline.includes('CRITICAL_TAIL_MARKER_AT_END_999'), '工具输出超过 200 字符的尾部关键信息不得被静默截断');
  assert.ok(joinedOutline.includes('src/large-module.ts'), '继承给 propose 模型的条目应保留工具调用来源标识');

  // 再验证当剩余输入字节预算不足以容纳完整长工具结果时，切换模型恢复必须原子拒绝并保留原候选
  const stepInputUsed = afterStep.metrics?.inputBytes ?? 0;
  const fTight = harnessFixture(stepExplorer, { maxInputBytes: stepInputUsed + 400 });
  t.after(fTight.cleanup);
  const harnessTight = fTight.open();
  harnessTight.registerModelPort('step-explorer-long', stepExplorer);
  harnessTight.registerModelPort('propose-summarizer-full', proposeSummarizer);
  (harnessTight as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.tools = [
    { name: 'read_file', description: 'read', parameters: { type: 'object' } }
  ];
  (harnessTight as unknown as { dependencies: { tools: unknown; toolExecutor: unknown } }).dependencies.toolExecutor = async () => ({
    callId: 'tc-long',
    toolName: 'read_file',
    output: longToolOutput
  });

  const startedTight = harnessTight.start(human, fTight.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: fTight.project.revision,
    instruction: '读取长模块并切换至 propose 模型',
    confirmed: true,
    model: 'step-explorer-long'
  }, 'req-b3-long-tool-tight');
  await harnessTight.settled(startedTight.id);
  const beforeTightSwitch = structuredClone(harnessTight.get(human, startedTight.id));
  assert.equal(beforeTightSwitch.state, 'waiting_human');
  assert.ok(beforeTightSwitch.candidate !== null);

  assert.throws(
    () => harnessTight.resume(human, beforeTightSwitch.id, {
      revision: beforeTightSwitch.revision,
      confirmed: true,
      model: 'propose-summarizer-full'
    }),
    (err: unknown) => err instanceof HubError && err.status === 413 && err.code === 'INPUT_BUDGET'
  );
  const afterTightSwitch = harnessTight.get(human, beforeTightSwitch.id);
  assert.equal(afterTightSwitch.revision, beforeTightSwitch.revision);
  assert.equal(afterTightSwitch.state, 'waiting_human');
  assert.deepEqual(afterTightSwitch.candidate, beforeTightSwitch.candidate);
  assert.deepEqual(afterTightSwitch.turns, beforeTightSwitch.turns);
});
