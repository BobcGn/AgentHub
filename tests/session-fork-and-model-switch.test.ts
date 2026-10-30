import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HubError } from '../src/domain/board.js';
import type { ModelPort, ModelStepInput, ModelStepOutput, ToolCallRequest } from '../src/domain/harness.js';
import { WorkspaceToolExecutor, WORKSPACE_TOOLS_DEFINITIONS } from '../src/infrastructure/workspace-tools.js';
import { harnessFixture } from './harness-fixtures.js';

const human = { kind: 'human' as const };

function createWorkspaceTree(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-fork-switch-'));
  mkdirSync(join(dir, 'src', 'core'), { recursive: true });
  mkdirSync(join(dir, 'packages', 'sub'), { recursive: true });
  mkdirSync(join(dir, '.git'), { recursive: true });
  writeFileSync(join(dir, 'src', 'core', 'engine.ts'), 'export const ENGINE_VERSION = "2.5.0";\n', 'utf8');
  writeFileSync(join(dir, 'packages', 'sub', 'helper.ts'), 'export const HELPER_FLAG = true;\n', 'utf8');
  writeFileSync(join(dir, '.env'), 'SECRET_KEY=never_expose\n', 'utf8');
  writeFileSync(join(dir, '.git', 'config'), '[core]\n', 'utf8');
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

test('1. 默认工作区范围：授权工作区后默认递归覆盖整树（无需手填子目录），且敏感路径黑名单依然强制拦截', async t => {
  const ws = createWorkspaceTree();
  t.after(ws.cleanup);

  let observedEngine = '';
  let observedHelper = '';
  let blockedEnvError = '';

  const model: ModelPort = {
    name: 'workspace-tree-inspector',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('Unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [
            { id: 'c_engine', name: 'read_file', arguments: { path: 'src/core/engine.ts' } },
            { id: 'c_helper', name: 'read_file', arguments: { path: 'packages/sub/helper.ts' } },
            { id: 'c_env', name: 'read_file', arguments: { path: '.env' } }
          ]
        };
      }
      for (const turn of input.turns) {
        if (turn.toolCallId === 'c_engine') observedEngine = turn.content ?? '';
        if (turn.toolCallId === 'c_helper') observedHelper = turn.content ?? '';
        if (turn.toolCallId === 'c_env') blockedEnvError = turn.content ?? '';
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '已读取嵌套子目录并确认敏感文件拦截。',
          sourceRefs: []
        }
      };
    }
  };

  const f = harnessFixture(model);
  t.after(f.cleanup);
  const harness = f.open();

  // Start WITHOUT specifying readScope -> defaults to ['.'] covering the entire workspace tree
  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '读取任意深度子目录文件并验证黑名单',
    confirmed: true,
    workspace: {
      authorized: true,
      root: ws.dir
    }
  }, 'start-default-scope');

  await harness.settled(started.id);
  const run = harness.get(human, started.id);

  assert.equal(run.state, 'waiting_human');
  assert.deepEqual(run.authorization.workspace?.readScope, ['.']);
  assert.match(observedEngine, /ENGINE_VERSION/);
  assert.match(observedEngine, /2\.5\.0/);
  assert.match(observedHelper, /HELPER_FLAG = true/);
  assert.match(blockedEnvError, /受保护.*路径: \.env/);
});

test('2. Multica 风格运行时管理：支持列出预设运行时、自定义修改与新增运行时，并阻断明文密钥写入 apiKeyEnv', async t => {
  const f = harnessFixture();
  t.after(f.cleanup);
  const harness = f.open();

  const presets = harness.listRuntimes(human);
  assert.ok(presets.some(r => r.id === 'scripted-v1' && r.isPreset));
  assert.ok(presets.some(r => r.id === 'deepseek-chat' && r.isPreset));
  assert.ok(presets.some(r => r.id === 'deepseek-reasoner' && r.isPreset));

  // Add a custom runtime
  const saved = harness.saveRuntime(human, {
    id: 'custom-qwen-coder',
    name: 'Qwen Coder Plus (OpenAI 兼容)',
    provider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-coder-plus',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    timeoutMs: 20000
  });
  assert.equal(saved.id, 'custom-qwen-coder');
  assert.equal(saved.isPreset, false);
  assert.equal(saved.model, 'qwen-coder-plus');
  assert.equal(saved.apiKeyEnv, 'DASHSCOPE_API_KEY');
  assert.ok(harness.listRuntimes(human).some(r => r.id === 'custom-qwen-coder'));

  // Attempt to pass a raw secret key starting with sk- into apiKeyEnv must be rejected
  assert.throws(() => {
    harness.saveRuntime(human, {
      id: 'bad-runtime',
      name: '错误配置明文密钥',
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1/chat/completions',
      model: 'gpt-4o',
      apiKeyEnv: 'sk-1234567890abcdef'
    });
  }, /禁止直接传入明文密钥/);
});

test('3. 同一会话内切换模型/供应商：中途打断或等待确认时切换至新模型，稳定继承已完成工具账本并补偿未决调用', async t => {
  const ws = createWorkspaceTree();
  t.after(ws.cleanup);

  let modelACalls = 0;
  let modelBCalls = 0;
  let modelCObservedOutline: string[] = [];
  let shouldInterruptSecondTool = true;

  // Model A (fast exploration model): requests 2 tools; second tool is interrupted before completion
  const modelAFast: ModelPort = {
    name: 'model-a-fast',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('Unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      modelACalls += 1;
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [
            { id: 'call_engine', name: 'read_file', arguments: { path: 'src/core/engine.ts' } },
            { id: 'call_helper', name: 'read_file', arguments: { path: 'packages/sub/helper.ts' } }
          ]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'open_question',
          epistemicStatus: 'unknown',
          content: 'Model A 候选输出',
          sourceRefs: []
        }
      };
    }
  };

  // Model B (reasoning step model): switched into the SAME session after interruption!
  // Expects both call_engine (already completed before interrupt) and call_helper (reconciled on resume) in input.turns!
  const modelBReasoner: ModelPort = {
    name: 'model-b-reasoner',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('Unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      modelBCalls += 1;
      const toolResults = input.turns.filter(turn => turn.role === 'tool');
      assert.equal(toolResults.length, 2, 'Model B 必须完整继承已执行的 call_engine 与补偿完成的 call_helper');
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: `由 Model B 继承 ${toolResults.length} 条工具结果生成的推理候选`,
          sourceRefs: []
        }
      };
    }
  };

  // Model C (propose-only provider without step()): switched into the SAME session while waiting_human!
  const modelCProposeOnly: ModelPort = {
    name: 'model-c-propose-only',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose(snapshot) {
      modelCObservedOutline = snapshot.focusOutline ?? [];
      return {
        type: 'append_context',
        requirementId: snapshot.requirementId,
        category: 'assumption',
        epistemicStatus: 'proposed',
        content: '由仅支持 propose 的 Model C 继承历史工具观测后生成的候选',
        sourceRefs: []
      };
    }
  };

  const f = harnessFixture(modelAFast);
  t.after(f.cleanup);
  const harness = f.open();
  const realExecutor = new WorkspaceToolExecutor(ws.dir, { readScope: ['.'], exclude: ['node_modules', 'dist', '.git'] });
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: (call: ToolCallRequest) => Promise<unknown> } }).dependencies.tools = WORKSPACE_TOOLS_DEFINITIONS;
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: (call: ToolCallRequest) => Promise<unknown> } }).dependencies.toolExecutor = async (call: ToolCallRequest) => {
    if (call.id === 'call_helper' && shouldInterruptSecondTool) {
      throw new HubError(502, 'PROVIDER_NETWORK_ERROR', '模拟第 2 个工具调用期间进程中断');
    }
    return realExecutor.execute(call);
  };

  harness.registerModelPort('model-a-fast', modelAFast);
  harness.registerModelPort('model-b-reasoner', modelBReasoner);
  harness.registerModelPort('model-c-propose-only', modelCProposeOnly);

  // 1. Start session with Model A -> interrupted during call_helper
  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '先探索代码，再切换推理模型总结',
    confirmed: true,
    model: 'model-a-fast'
  }, 'start-model-a');

  await harness.settled(started.id);
  const interruptedRun = harness.get(human, started.id);

  assert.equal(interruptedRun.state, 'interrupted');
  assert.equal(interruptedRun.model, 'model-a-fast');
  assert.equal(modelACalls, 1);
  assert.equal(interruptedRun.turns?.length, 2); // Step 1 (assistant tool_calls) + Step 2 (tool call_engine)

  // 2. Switch to Model B in the SAME session and resume!
  shouldInterruptSecondTool = false;
  const resumedB = harness.resume(human, interruptedRun.id, {
    revision: interruptedRun.revision,
    confirmed: true,
    model: 'model-b-reasoner'
  });
  await harness.settled(resumedB.id);
  const switchedToB = harness.get(human, resumedB.id);

  assert.equal(switchedToB.id, interruptedRun.id, '必须在同一会话（相同 Run ID）内完成切换');
  assert.equal(switchedToB.state, 'waiting_human');
  assert.equal(switchedToB.model, 'model-b-reasoner');
  assert.equal(modelACalls, 1, '切换后不再调用旧模型 A');
  assert.equal(modelBCalls, 1, '新模型 B 仅需 1 次调用即可基于继承的账本生成候选');
  assert.equal(switchedToB.candidate?.type, 'append_context');
  if (switchedToB.candidate?.type === 'append_context') {
    assert.match(switchedToB.candidate.content, /由 Model B 继承 2 条工具结果生成的推理候选/);
  }
  assert.ok(switchedToB.events.some(e =>
    e.type === 'model_switched' &&
    e.details?.['fromModel'] === 'model-a-fast' &&
    e.details?.['toModel'] === 'model-b-reasoner'
  ));

  // 3. While in waiting_human, user switches again in the SAME session to Model C (propose-only)
  const resumedC = harness.resume(human, switchedToB.id, {
    revision: switchedToB.revision,
    confirmed: true,
    model: 'model-c-propose-only'
  });
  await harness.settled(resumedC.id);
  const switchedToC = harness.get(human, resumedC.id);

  assert.equal(switchedToC.id, interruptedRun.id);
  assert.equal(switchedToC.state, 'waiting_human');
  assert.equal(switchedToC.model, 'model-c-propose-only');
  assert.ok(modelCObservedOutline.some(line => line.includes('[INHERITED TOOL RESULT')));
  assert.ok(modelCObservedOutline.some(line => line.includes('ENGINE_VERSION')));
  assert.equal(switchedToC.turns?.filter(turn => turn.role === 'tool').length, 2, '切换至 propose-only 模型也不得丢失历史工具账本');
});

test('4. 会话分叉（Codex 风格 · 粒度 2）：从任意步骤分叉出新会话，继承前置 JSON 账本且不污染父会话', async t => {
  const ws = createWorkspaceTree();
  t.after(ws.cleanup);

  let toolExecutions = 0;

  const baseModel: ModelPort = {
    name: 'scripted-v1',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('Unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'call_read_1', name: 'read_file', arguments: { path: 'src/core/engine.ts' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '父会话在步骤 3 生成的初始候选',
          sourceRefs: []
        }
      };
    }
  };

  const branchModel: ModelPort = {
    name: 'branch-reasoner',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('Unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      // Forked at step 2: must already have step 1 (assistant tool_calls) and step 2 (tool result)
      assert.equal(input.turns.length, 2);
      assert.equal(input.turns[1]?.role, 'tool');
      assert.match(input.turns[1]?.content ?? '', /ENGINE_VERSION/);
      return {
        kind: 'candidate',
        candidate: {
          type: 'propose_criteria',
          requirementId: input.snapshot.requirementId,
          acceptanceCriteria: [{ id: 'AC-FORK-1', description: '分叉会话基于已读取的 ENGINE_VERSION 生成新验收条件', verification: '检查版本号' }],
          sourceRefs: []
        }
      };
    }
  };

  const f = harnessFixture(baseModel);
  t.after(f.cleanup);
  const harness = f.open();
  const realExecutor = new WorkspaceToolExecutor(ws.dir, { readScope: ['.'], exclude: ['node_modules', 'dist', '.git'] });
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: (call: ToolCallRequest) => Promise<unknown> } }).dependencies.tools = WORKSPACE_TOOLS_DEFINITIONS;
  (harness as unknown as { dependencies: { tools: unknown; toolExecutor: (call: ToolCallRequest) => Promise<unknown> } }).dependencies.toolExecutor = async (call: ToolCallRequest) => {
    toolExecutions += 1;
    return realExecutor.execute(call);
  };
  harness.registerModelPort('branch-reasoner', branchModel);

  // 1. Run parent session to completion (3 steps: 1=tool_calls, 2=tool result, 3=candidate)
  const startedParent = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '读取引擎版本并给出假设',
    confirmed: true
  }, 'start-parent');
  await harness.settled(startedParent.id);
  const parentRun = harness.get(human, startedParent.id);

  assert.equal(parentRun.state, 'waiting_human');
  assert.equal(parentRun.turns?.length, 3);
  assert.equal(toolExecutions, 1);

  // 2. Fork from Step 2 (right after tool execution, before Step 3 candidate) with branch-reasoner
  const startedFork = harness.fork(human, parentRun.id, {
    forkPointStep: 2,
    confirmed: true,
    model: 'branch-reasoner',
    instruction: '分叉探索：改为提出可核验的验收条件'
  }, 'fork-step-2');
  await harness.settled(startedFork.id);
  const forkedRun = harness.get(human, startedFork.id);

  assert.notEqual(forkedRun.id, parentRun.id);
  assert.deepEqual(forkedRun.fork, {
    parentRunId: parentRun.id,
    parentRevision: parentRun.revision,
    forkPointStep: 2
  });
  assert.equal(forkedRun.model, 'branch-reasoner');
  assert.equal(forkedRun.state, 'waiting_human');
  assert.equal(toolExecutions, 1, '分叉会话继承了第 1-2 步的工具结果，绝不重复执行已完成工具');
  assert.equal(forkedRun.turns?.length, 3);
  assert.equal(forkedRun.candidate?.type, 'propose_criteria');

  // Verify parent run is completely untouched
  const reloadedParent = harness.get(human, parentRun.id);
  assert.equal(reloadedParent.candidate?.type, 'append_context');
  assert.equal(reloadedParent.model, 'scripted-v1');
  assert.equal(reloadedParent.fork ?? null, null);
});

test('5. 外发边界强约束（egressScope）：local_only 运行在同会话切换至公网运行时时立即阻断工作区外泄，不发起真实网络请求', async t => {
  const ws = createWorkspaceTree();
  t.after(ws.cleanup);

  const localExplorer: ModelPort = {
    name: 'local-explorer',
    providerKind: 'scripted',
    endpoint: 'local://in-memory',
    async propose() { throw new Error('Unused'); },
    async step(input: ModelStepInput): Promise<ModelStepOutput> {
      if (input.turns.length === 0) {
        return {
          kind: 'tool_calls',
          toolCalls: [{ id: 'c_local_read', name: 'read_file', arguments: { path: 'src/core/engine.ts' } }]
        };
      }
      return {
        kind: 'candidate',
        candidate: {
          type: 'append_context',
          requirementId: input.snapshot.requirementId,
          category: 'assumption',
          epistemicStatus: 'proposed',
          content: '本地模型初步候选',
          sourceRefs: []
        }
      };
    }
  };

  const f = harnessFixture(localExplorer);
  t.after(f.cleanup);
  const harness = f.open();

  // Register a cloud runtime with external HTTPS endpoint (never called if blocked before network!)
  harness.saveRuntime(human, {
    id: 'external-cloud-llm',
    name: 'External Cloud LLM',
    provider: 'openai-compatible',
    baseUrl: 'https://api.external-llm.invalid/v1',
    model: 'cloud-pro-v1',
    apiKeyEnv: 'EXTERNAL_API_KEY'
  });

  // Start run with egressScope: 'local_only'
  const started = harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '仅限本地探索代码',
    confirmed: true,
    workspace: {
      authorized: true,
      root: ws.dir,
      egressScope: 'local_only'
    }
  }, 'start-egress-local');
  await harness.settled(started.id);
  const completedLocal = harness.get(human, started.id);
  assert.equal(completedLocal.state, 'waiting_human');

  // Attempt in-session switch to external-cloud-llm while egressScope is 'local_only' -> MUST synchronously fail with 403 EGRESS_OUT_OF_SCOPE before reading API Key or touching network!
  assert.throws(
    () => harness.resume(human, completedLocal.id, {
      revision: completedLocal.revision,
      confirmed: true,
      runtimeId: 'external-cloud-llm'
    }),
    (err: unknown) => err instanceof HubError && err.status === 403 && err.code === 'EGRESS_OUT_OF_SCOPE'
  );
  // Original session remains intact in waiting_human
  assert.equal(harness.get(human, completedLocal.id).state, 'waiting_human');
  assert.equal(harness.get(human, completedLocal.id).model, 'local-explorer');
});

test('6. 受保护实际配置目录、范围外软链接逃逸、异步扫描与严格参数校验拦截', async t => {
  const ws = createWorkspaceTree();
  t.after(ws.cleanup);

  // Create custom Hub storage directory inside workspace and an unscoped sibling directory
  const customHubDir = join(ws.dir, 'my-custom-hub-data');
  mkdirSync(customHubDir, { recursive: true });
  writeFileSync(join(customHubDir, 'project-1.json'), '{"secret":"hub_record"}', 'utf8');

  mkdirSync(join(ws.dir, 'unscoped'), { recursive: true });
  writeFileSync(join(ws.dir, 'unscoped', 'private.ts'), 'export const PRIVATE = 1;\n', 'utf8');
  symlinkSync('../../unscoped/private.ts', join(ws.dir, 'src', 'core', 'link-to-unscoped.ts'));

  const executor = new WorkspaceToolExecutor(ws.dir, {
    readScope: ['src'],
    protectedPaths: [customHubDir]
  });

  // 1) Custom configured protected directory is blocked even if readScope were '.'
  const wideExecutor = new WorkspaceToolExecutor(ws.dir, {
    readScope: ['.'],
    protectedPaths: [customHubDir]
  });
  const protRes = await wideExecutor.execute({
    id: 'tc_prot',
    name: 'read_file',
    arguments: { path: 'my-custom-hub-data/project-1.json' }
  });
  assert.ok(protRes.error && /受保护/.test(protRes.error));

  // 2) Symlink inside readScope ('src') pointing to file outside readScope ('unscoped/private.ts') is blocked
  const linkRes = await executor.execute({
    id: 'tc_link_scope',
    name: 'read_file',
    arguments: { path: 'src/core/link-to-unscoped.ts' }
  });
  assert.ok(linkRes.error && /超出授权的读取范围/.test(linkRes.error));

  // 3) search_code('.', ...) asynchronously filters out unscoped files and custom protected dirs
  const searchRes = await executor.execute({
    id: 'tc_search_scoped',
    name: 'search_code',
    arguments: { query: 'PRIVATE', path: '.' }
  });
  assert.equal(searchRes.error, undefined);
  const parsedSearch = JSON.parse(searchRes.output) as { count: number };
  assert.equal(parsedSearch.count, 0, '异步 search_code 从根目录检索时严禁越过 readScope 扫描 unscoped 目录');

  // 4) Non-string path or unknown extra argument is rejected without silent coercion
  const badArgRes = await executor.execute({
    id: 'tc_bad_arg',
    name: 'list_directory',
    arguments: { path: 123 as unknown as string }
  });
  assert.ok(badArgRes.error && /必须为字符串/.test(badArgRes.error));

  const unknownKeyRes = await executor.execute({
    id: 'tc_extra_key',
    name: 'list_directory',
    arguments: { path: '.', unexpectedFlag: true }
  });
  assert.ok(unknownKeyRes.error && /不支持的工具参数/.test(unknownKeyRes.error));
});
