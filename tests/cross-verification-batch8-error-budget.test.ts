import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenAiCompatibleProvider } from '../src/infrastructure/providers/model-provider.js';
import { RuntimeRegistry } from '../src/infrastructure/providers/runtime-registry.js';
import { JsonRunStore } from '../src/infrastructure/run-store.js';
import { JsonRecordProjectStore } from '../src/infrastructure/record-project-store.js';
import { RecordProjectService } from '../src/application/record-project-service.js';
import { BoardService } from '../src/application/board-service.js';
import { SqliteStore } from '../src/infrastructure/sqlite-store.js';
import { initializeAdmin, toolCredentials } from '../src/infrastructure/auth.js';
import { createRecordStructureValidator } from '../src/infrastructure/record-validator.js';
import { createCandidateValidator } from '../src/infrastructure/harness-validator.js';
import { HarnessService } from '../src/application/harness-service.js';
import { scriptedModel } from '../src/infrastructure/scripted-model.js';
import { HubError } from '../src/domain/board.js';
import type { ContextSnapshot, HarnessRun } from '../src/domain/harness.js';
import type { IntentRecord, RequirementRecord } from '../src/domain/record-contract.js';

const human = { kind: 'human' as const };

function startMockHttpServer(handler: (req: any, res: any) => void): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        server,
        url,
        close: () => new Promise<void>((r) => server.close(() => r()))
      });
    });
  });
}

test('Error Budget: 429/500 非 200 响应的有界流式读取与已知消耗计量', async () => {
  // Case A: 错误体在预算范围内（200 字节 < 256 字节），必须正确抛出 PROVIDER_RATE_LIMIT 并附带 bytesRead: 200
  const mockServerA = await startMockHttpServer((_req, res) => {
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end('A'.repeat(200));
  });

  const intent: IntentRecord = {
    id: 'INT-1',
    title: '测试意图',
    problem: '测试痛点',
    expectedOutcome: '测试成果',
    scope: { includes: ['测试'], excludes: [] },
    constraints: ['约束'],
    confirmation: {
      state: 'human_confirmed',
      sourceRefs: ['SRC-1']
    },
    sourceRefs: ['SRC-1']
  };

  const requirement: RequirementRecord = {
    id: 'REQ-1',
    kind: 'requirement',
    intentId: 'INT-1',
    title: '测试需求',
    problem: '测试问题',
    expectedOutcome: '测试期望',
    scope: { includes: ['测试'], excludes: [] },
    constraints: ['约束'],
    rationale: '理由',
    expectedImpact: '影响',
    acceptanceCriteria: [{ id: 'C-1', description: '验收准则', verification: 'test' }],
    sourceRefs: ['SRC-1'],
    status: 'draft',
    result: null,
    acceptance: null,
    pullRequest: null
  };

  const snapshot: ContextSnapshot = {
    projectId: 'proj-1',
    requirementId: 'REQ-1',
    projectRevision: 1,
    intent,
    requirement,
    contextItems: [],
    sources: [{ id: 'SRC-1', kind: 'reference', locator: 'doc.md', excerpt: 'doc' }],
    instruction: '分析需求',
    omitted: [],
    bytes: 100,
    hash: 'hash-test'
  };

  try {
    const providerA = new OpenAiCompatibleProvider({
      name: 'provider-a',
      baseUrl: mockServerA.url,
      apiKey: 'test-key',
      model: 'test-model',
      maxOutputBytes: 512
    });

    let caughtA: unknown;
    try {
      await providerA.step({ snapshot, tools: [], turns: [], maxOutputBytes: 256 }, new AbortController().signal);
    } catch (err: unknown) {
      caughtA = err;
    }

    assert.ok(caughtA instanceof HubError);
    assert.strictEqual((caughtA as HubError).code, 'PROVIDER_RATE_LIMIT');
    const bytesA = (caughtA as unknown as { bytesRead: number }).bytesRead;
    assert.strictEqual(bytesA, 200, `预算充足时应完整读取 200 字节错误体，实际为: ${bytesA}`);
  } finally {
    await mockServerA.close();
  }

  // Case B: 错误体超限（2048 字节 > 256 字节），必须抛出 RESPONSE_SIZE_EXCEEDED 并附带截断读取的 bytesRead
  const mockServerB = await startMockHttpServer((_req, res) => {
    res.writeHead(429, { 'Content-Type': 'text/plain' });
    res.end('B'.repeat(2048));
  });

  try {
    const providerB = new OpenAiCompatibleProvider({
      name: 'provider-b',
      baseUrl: mockServerB.url,
      apiKey: 'test-key',
      model: 'test-model',
      maxOutputBytes: 512
    });

    let caughtB: unknown;
    try {
      await providerB.step({ snapshot, tools: [], turns: [], maxOutputBytes: 256 }, new AbortController().signal);
    } catch (err: unknown) {
      caughtB = err;
    }

    assert.ok(caughtB instanceof HubError);
    assert.strictEqual((caughtB as HubError).code, 'RESPONSE_SIZE_EXCEEDED');
    const bytesB = (caughtB as unknown as { bytesRead: number }).bytesRead;
    assert.ok(bytesB >= 256, `超限读取应记录截断点字节数，实际为: ${bytesB}`);
  } finally {
    await mockServerB.close();
  }
});

test('Error Budget: 端到端 Harness 中失败/超限响应诚实记录 metrics.outputBytes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-budget-test-'));
  const dbPath = join(dir, 'board.sqlite');
  const store = new SqliteStore(dbPath);
  initializeAdmin(store, 'test-admin-password');
  const projectStore = new JsonRecordProjectStore(join(dir, 'record-projects'));
  const runStore = new JsonRunStore(join(dir, 'runs'));
  const service = new BoardService(store, toolCredentials, id => projectStore.get(id) !== undefined);
  const validator = createRecordStructureValidator();
  const recordService = new RecordProjectService(projectStore, service, validator);

  // Mock server 返回 800 字节的 429 响应
  const mockServer = await startMockHttpServer((_req, res) => {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'rate limit', details: 'x'.repeat(700) }));
  });

  try {
    const provider = new OpenAiCompatibleProvider({
      name: 'budget-harness-provider',
      baseUrl: mockServer.url,
      apiKey: 'test-key',
      model: 'test-model'
    });

    const harness = new HarnessService({
      runs: runStore,
      projects: projectStore,
      records: recordService,
      validator,
      candidates: createCandidateValidator(),
      model: provider,
      limits: { timeoutMs: 5000 }
    });

    // 创建项目与需求
    const proj = recordService.create(human, {
      name: '预算计量项目',
      title: '意图',
      problem: '痛点',
      expectedOutcome: '成果',
      includes: ['预算测试'],
      excludes: [],
      constraints: ['约束'],
      confirmed: true
    }, 'req-proj-init');

    recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-BUDGET-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '测试预算需求',
        problem: '问题',
        expectedOutcome: '期望',
        scope: { includes: ['预算测试'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C1', description: '条件1', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求',
      confirmed: true
    }, 'req-add-1');

    // 启动 run
    const latestProj = projectStore.get(proj.id)!;
    const startResult = harness.start(human, proj.id, {
      requirementId: 'REQ-BUDGET-1',
      baseRevision: latestProj.revision,
      instruction: '测试预算流式计量',
      confirmed: true,
      workspace: {
        root: dir,
        readScope: ['*'],
        exclude: [],
        egressScope: 'allow_all',
        networkAllowed: true
      }
    }, 'req-run-start-001');

    // 等待后台运行进入中断终态
    let run = runStore.get(startResult.id);
    for (let i = 0; i < 40 && run && run.state === 'running'; i++) {
      await new Promise(r => setTimeout(r, 50));
      run = runStore.get(startResult.id);
    }

    assert.ok(run);
    assert.strictEqual(run.state, 'interrupted');
    assert.strictEqual(run.stopReason, 'PROVIDER_RATE_LIMIT');
    // run.metrics.outputBytes 必须诚实记录实际从网络流读取的错误字节数
    assert.ok(run.metrics);
    assert.ok(run.metrics.outputBytes > 0, `outputBytes 必须大于 0，实际为 ${run.metrics.outputBytes}`);
  } finally {
    await mockServer.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Fingerprint Policy: 旧运行缺少配置指纹校验依据时禁止恢复并报 409 MISSING_RUNTIME_FINGERPRINT', () => {
  const registry = new RuntimeRegistry([
    {
      id: 'deepseek-main',
      version: 1,
      name: 'DeepSeek Main',
      provider: 'deepseek',
      baseUrl: 'http://127.0.0.1:9999',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      timeoutMs: 30000,
      isPreset: false
    }
  ]);

  // 模拟一个旧运行绑定：缺少 fingerprint
  const legacyBinding = {
    id: 'deepseek-main',
    configVersion: 1,
    provider: 'deepseek' as const,
    model: 'deepseek-chat',
    endpoint: 'http://127.0.0.1:9999',
    external: true
    // fingerprint: undefined
  };

  assert.throws(
    () => registry.resolveBoundRuntime(legacyBinding as any),
    (err: unknown) => {
      assert.ok(err instanceof HubError);
      assert.strictEqual(err.code, 'MISSING_RUNTIME_FINGERPRINT');
      assert.strictEqual(err.status, 409);
      assert.ok(err.message.includes('旧运行绑定缺少配置指纹校验依据'));
      return true;
    }
  );
});

test('Fingerprint Policy: resume / fork 传入无指纹旧运行且仅提供 model 字符串时必须阻断', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-fp-test-'));
  const dbPath = join(dir, 'board.sqlite');
  const store = new SqliteStore(dbPath);
  initializeAdmin(store, 'test-admin-password');
  const projectStore = new JsonRecordProjectStore(join(dir, 'record-projects'));
  const runStore = new JsonRunStore(join(dir, 'runs'));
  const service = new BoardService(store, toolCredentials, id => projectStore.get(id) !== undefined);
  const validator = createRecordStructureValidator();
  const recordService = new RecordProjectService(projectStore, service, validator);

  try {
    const harness = new HarnessService({
      runs: runStore,
      projects: projectStore,
      records: recordService,
      validator,
      candidates: createCandidateValidator(),
      model: scriptedModel
    });

    const proj = recordService.create(human, {
      name: '指纹测试项目',
      title: '意图',
      problem: '痛点',
      expectedOutcome: '成果',
      includes: ['指纹测试'],
      excludes: [],
      constraints: ['约束'],
      confirmed: true
    }, 'fp-proj-init');

    recordService.saveRecord(human, proj.id, {
      baseRevision: proj.revision,
      collection: 'requirements',
      id: null,
      record: {
        id: 'REQ-1',
        kind: 'requirement',
        intentId: proj.records.intent.id,
        title: '测试需求 1',
        problem: '问题',
        expectedOutcome: '期望',
        scope: { includes: ['测试'], excludes: [] },
        constraints: [],
        rationale: '理由',
        expectedImpact: '影响',
        acceptanceCriteria: [{ id: 'C1', description: '条件1', verification: 'test' }],
        sourceRefs: [proj.records.sources[0]!.id],
        status: 'draft',
        result: null,
        acceptance: null,
        pullRequest: null
      },
      reason: '创建需求',
      confirmed: true
    }, 'req-add-fp-1');

    const latestProj = projectStore.get(proj.id)!;

    // 直接在 runStore 写入一个符合 run.schema.json 但缺少 fingerprint 的历史 run
    const legacyRun: HarnessRun = {
      schemaVersion: '1.0.0',
      id: 'RUN-LEGACY-001',
      revision: 1,
      projectId: proj.id,
      requirementId: 'REQ-1',
      createdAt: '2026-10-27T00:00:00Z',
      requestId: 'req-legacy-001',
      requestHash: '0'.repeat(64),
      baseRevision: latestProj.revision,
      state: 'interrupted',
      stopReason: 'PROVIDER_RATE_LIMIT',
      authorization: {
        active: true,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        operation: 'propose_context',
        workspace: {
          authorized: true,
          root: '/tmp',
          readScope: ['*'],
          exclude: [],
          egressScope: 'allow_all'
        }
      },
      limits: { maxInputBytes: 10000, maxOutputBytes: 10000, timeoutMs: 30000, maxCalls: 3, maxToolCalls: 5 },
      model: 'scripted-v1',
      runtime: {
        id: 'default',
        configVersion: 1,
        provider: 'scripted',
        model: 'scripted-v1',
        endpoint: 'local://scripted',
        external: false
        // 缺少 fingerprint
      },
      executionId: null,
      calls: 1,
      snapshot: null,
      candidate: null,
      issues: [],
      outcome: null,
      receipt: null,
      events: [{ sequence: 1, at: '2026-10-27T00:00:00Z', type: 'started', details: {} }]
    };
    runStore.create(legacyRun);

    // 仅通过 model 尝试 resume，必须被阻断并抛出 MISSING_RUNTIME_FINGERPRINT
    assert.throws(
      () => {
        harness.resume(human, 'RUN-LEGACY-001', {
          revision: legacyRun.revision,
          confirmed: true,
          model: 'scripted-v1' // 未提供 explicit runtimeId
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof HubError);
        assert.strictEqual(err.code, 'MISSING_RUNTIME_FINGERPRINT');
        assert.strictEqual(err.status, 409);
        return true;
      }
    );

    // 仅通过 model 尝试 fork，也必须被阻断并抛出 MISSING_RUNTIME_FINGERPRINT
    assert.throws(
      () => {
        harness.fork(human, 'RUN-LEGACY-001', {
          forkPointStep: 0,
          confirmed: true,
          model: 'scripted-v1' // 未提供 explicit runtimeId
        }, 'fork-req-1');
      },
      (err: unknown) => {
        assert.ok(err instanceof HubError);
        assert.strictEqual(err.code, 'MISSING_RUNTIME_FINGERPRINT');
        assert.strictEqual(err.status, 409);
        return true;
      }
    );
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
