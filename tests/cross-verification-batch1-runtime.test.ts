import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { HubError } from '../src/domain/board.js';
import type { ContextSnapshot, ModelPort } from '../src/domain/harness.js';
import { DeepSeekModel } from '../src/infrastructure/deepseek-model.js';
import { RuntimeRegistry } from '../src/infrastructure/providers/runtime-registry.js';
import { harnessFixture } from './harness-fixtures.js';

const human = { kind: 'human' as const };

function makeTempWorkspace(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-b1-ws-'));
  writeFileSync(join(dir, 'index.ts'), 'export const SECRET_LOGIC = 42;\n', 'utf8');
  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}

test('Batch 1 反例 1：默认注入 DeepSeekModel 云端端口不得被登记为本地端口绕过 local_only 外发限制', async t => {
  const ws = makeTempWorkspace();
  t.after(ws.cleanup);

  // Inject real DeepSeekModel instance (with synthetic test key; network must NEVER be called!)
  const defaultCloudModel = new DeepSeekModel({
    apiKey: 'test-synthetic-key-never-sent',
    model: 'DeepSeek-V4.1-Flash-1017',
    baseUrl: 'https://api.deepseek.invalid'
  });

  const f = harnessFixture(defaultCloudModel);
  t.after(f.cleanup);

  // Start WITHOUT specifying runtimeId/model, with workspace egressScope = 'local_only'
  // Previously, constructor registered DeepSeekModel as local://custom-port (external: false) and bypassed egress!
  assert.throws(
    () => f.harness.start(human, f.project.id, {
      requirementId: 'REQ-HARNESS-1',
      baseRevision: f.project.revision,
      instruction: '测试默认云端 Provider 外发阻断',
      confirmed: true,
      workspace: {
        authorized: true,
        root: ws.dir,
        egressScope: 'local_only'
      }
    }, 'b1-default-cloud-egress'),
    (err: unknown) => err instanceof HubError && err.status === 403 && err.code === 'EGRESS_OUT_OF_SCOPE'
  );
});

test('Batch 1 反例 2：同名模型不得覆盖其他运行时端口或回退到 defaultModel，且模糊模型名拒绝猜测', async t => {
  const ws = makeTempWorkspace();
  t.after(ws.cleanup);

  let defaultCalled = 0;
  let localProxyCalled = 0;
  let cloudProxyCalled = 0;

  const defaultPort: ModelPort = {
    name: 'shared-model-v1',
    providerKind: 'deepseek',
    endpoint: 'https://default-cloud.invalid',
    async propose() {
      defaultCalled += 1;
      throw new Error('不应回退到 defaultPort');
    }
  };

  const localGatewayPort: ModelPort = {
    name: 'shared-model-v1',
    providerKind: 'openai-compatible',
    endpoint: 'http://127.0.0.1:18080/v1',
    async propose(snapshot: ContextSnapshot) {
      localProxyCalled += 1;
      return {
        type: 'append_context',
        requirementId: snapshot.requirementId,
        category: 'assumption',
        epistemicStatus: 'proposed',
        content: '来自本地回环网关运行时 rt-local-gw 的结果',
        sourceRefs: []
      };
    }
  };

  const externalGatewayPort: ModelPort = {
    name: 'shared-model-v1',
    providerKind: 'openai-compatible',
    endpoint: 'https://external-gateway.invalid/v1',
    async propose() {
      cloudProxyCalled += 1;
      throw new Error('外发未授权时绝不能调用外部网关');
    }
  };

  const f = harnessFixture(defaultPort);
  t.after(f.cleanup);

  f.harness.registerModelPort('rt-local-gw', localGatewayPort);
  f.harness.registerModelPort('rt-external-gw', externalGatewayPort);

  // 1) Passing ambiguous model name 'shared-model-v1' without runtimeId must fail closed instead of picking the wrong endpoint
  assert.throws(
    () => f.harness.start(human, f.project.id, {
      requirementId: 'REQ-HARNESS-1',
      baseRevision: f.project.revision,
      instruction: '同名模型未指定 runtimeId',
      confirmed: true,
      model: 'shared-model-v1'
    }, 'b1-ambiguous-model'),
    (err: unknown) => err instanceof HubError && err.code === 'AMBIGUOUS_RUNTIME'
  );

  // 2) Selecting rt-external-gw under local_only must be blocked by egress
  assert.throws(
    () => f.harness.start(human, f.project.id, {
      requirementId: 'REQ-HARNESS-1',
      baseRevision: f.project.revision,
      instruction: '测试同名外部网关阻断',
      confirmed: true,
      runtimeId: 'rt-external-gw',
      workspace: {
        authorized: true,
        root: ws.dir,
        egressScope: 'local_only'
      }
    }, 'b1-same-model-external'),
    (err: unknown) => err instanceof HubError && err.status === 403 && err.code === 'EGRESS_OUT_OF_SCOPE'
  );
  assert.equal(cloudProxyCalled, 0);

  // 3) Selecting rt-local-gw under local_only must use localGatewayPort (NOT overwritten by rt-external-gw and NOT hijacked by defaultPort!)
  const started = f.harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '测试同名本地回环网关正常运行',
    confirmed: true,
    runtimeId: 'rt-local-gw',
    workspace: {
      authorized: true,
      root: ws.dir,
      egressScope: 'local_only'
    }
  }, 'b1-same-model-local');

  await f.harness.settled(started.id);
  const completed = f.harness.get(human, started.id);

  assert.equal(completed.state, 'waiting_human');
  assert.equal(defaultCalled, 0);
  assert.equal(cloudProxyCalled, 0);
  assert.equal(localProxyCalled, 1);
  assert.ok(completed.runtime, 'Run 必须持久化非敏感运行时快照信息');
  assert.equal(completed.runtime.id, 'rt-local-gw');
  assert.equal(completed.runtime.configVersion, 1);
  assert.equal(completed.runtime.provider, 'openai-compatible');
  assert.equal(completed.runtime.model, 'shared-model-v1');
  assert.equal(completed.runtime.endpoint, 'http://127.0.0.1:18080/v1');
  assert.equal(completed.runtime.external, false);
});

test('Batch 1 反例 3：未知运行时与未知/非法协议端点必须默认拒绝（Fail-Closed）', () => {
  const registry = new RuntimeRegistry();

  // Unknown scheme in saveRuntime must be rejected
  assert.throws(
    () => registry.save({
      id: 'bad-scheme-rt',
      name: 'Unknown Scheme',
      provider: 'openai-compatible',
      baseUrl: 'socks5://127.0.0.1:9050',
      model: 'gpt-4o-mini',
      apiKeyEnv: 'OPENAI_API_KEY'
    }),
    (err: unknown) => err instanceof HubError && (err.code === 'INVALID_RUNTIME_URL' || err.code === 'UNKNOWN_ENDPOINT_DENIED')
  );

  // Non-scripted provider claiming local:// scheme must be rejected
  assert.throws(
    () => registry.save({
      id: 'spoofed-local-rt',
      name: 'Spoofed Local Scheme',
      provider: 'deepseek',
      baseUrl: 'local://scripted',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY'
    }),
    (err: unknown) => err instanceof HubError && (err.code === 'INVALID_RUNTIME_URL' || err.code === 'UNKNOWN_ENDPOINT_DENIED')
  );

  // Port with unknown endpoint scheme registered programmatically must fail closed on start
  const badPort: ModelPort = {
    name: 'weird-endpoint-port',
    providerKind: 'openai-compatible',
    endpoint: 'custom-rpc://unknown-host',
    async propose() { return {}; }
  };
  const f = harnessFixture(badPort);
  try {
    assert.throws(
      () => f.start('测试未知协议默认拒绝', 'b1-unknown-scheme'),
      (err: unknown) => err instanceof HubError && err.code === 'UNKNOWN_ENDPOINT_DENIED'
    );
    assert.throws(
      () => f.harness.start(human, f.project.id, {
        requirementId: 'REQ-HARNESS-1',
        baseRevision: f.project.revision,
        instruction: '测试未知运行时 ID 默认拒绝',
        confirmed: true,
        runtimeId: 'does-not-exist'
      }, 'b1-unknown-runtime'),
      (err: unknown) => err instanceof HubError && err.code === 'UNKNOWN_RUNTIME'
    );
  } finally {
    f.cleanup();
  }
});

test('Batch 1 反例 4：运行时配置后续修改会递增版本，且不得静默改变已创建或正在执行 Run 的端点与外发授权', async t => {
  const ws = makeTempWorkspace();
  t.after(ws.cleanup);

  let shouldFailOnce = true;
  const v1Port: ModelPort = {
    name: 'mutable-rt-model',
    providerKind: 'openai-compatible',
    endpoint: 'http://127.0.0.1:19000/v1',
    async propose(snapshot: ContextSnapshot) {
      if (shouldFailOnce) {
        shouldFailOnce = false;
        throw new HubError(502, 'PROVIDER_NETWORK_ERROR', '首次本地连接暂时中断');
      }
      return {
        type: 'append_context',
        requirementId: snapshot.requirementId,
        category: 'assumption',
        epistemicStatus: 'proposed',
        content: 'v1 端口恢复结果',
        sourceRefs: []
      };
    }
  };

  const f = harnessFixture();
  t.after(f.cleanup);
  f.harness.registerModelPort('rt-mutable', v1Port);

  const started = f.harness.start(human, f.project.id, {
    requirementId: 'REQ-HARNESS-1',
    baseRevision: f.project.revision,
    instruction: '测试运行时配置变更隔离',
    confirmed: true,
    runtimeId: 'rt-mutable',
    workspace: {
      authorized: true,
      root: ws.dir,
      egressScope: 'local_only'
    }
  }, 'b1-config-mutation-isolation');

  // Mutate rt-mutable IMMEDIATELY in registry to an external cloud URL while started run is executing on microtask queue!
  const updatedCfg = f.harness.saveRuntime(human, {
    id: 'rt-mutable',
    name: 'Mutated to External Cloud',
    provider: 'openai-compatible',
    baseUrl: 'https://hijacked-cloud.invalid/v1',
    model: 'mutable-rt-model',
    apiKeyEnv: 'HIJACK_API_KEY'
  });
  assert.equal(updatedCfg.version, 2);

  await f.harness.settled(started.id);
  const interrupted = f.harness.get(human, started.id);
  // The in-flight execution used the frozen v1 binding, NOT the mutated v2 config!
  assert.equal(interrupted.state, 'interrupted');
  assert.equal(interrupted.runtime?.id, 'rt-mutable');
  assert.equal(interrupted.runtime?.configVersion, 1);
  assert.equal(interrupted.runtime?.endpoint, 'http://127.0.0.1:19000/v1');
  assert.equal(interrupted.runtime?.external, false);

  // Attempting to resume WITHOUT re-selecting runtime must NOT silently adopt v2 (hijacked-cloud.invalid)!
  assert.throws(
    () => f.harness.resume(human, interrupted.id, {
      revision: interrupted.revision,
      confirmed: true
    }),
    (err: unknown) => err instanceof HubError && err.code === 'RUNTIME_CONFIG_CHANGED'
  );

  // Attempting to explicitly re-bind to rt-mutable (now v2 external) under local_only must be blocked by EGRESS_OUT_OF_SCOPE!
  assert.throws(
    () => f.harness.resume(human, interrupted.id, {
      revision: interrupted.revision,
      confirmed: true,
      runtimeId: 'rt-mutable'
    }),
    (err: unknown) => err instanceof HubError && err.status === 403 && err.code === 'EGRESS_OUT_OF_SCOPE'
  );
});
