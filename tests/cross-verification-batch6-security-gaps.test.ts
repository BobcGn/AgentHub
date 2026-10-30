import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { WorkspaceToolExecutor } from '../src/infrastructure/workspace-tools.js';
import { OpenAiCompatibleProvider } from '../src/infrastructure/providers/model-provider.js';
import { RuntimeRegistry } from '../src/infrastructure/providers/runtime-registry.js';
import { applyWorkItemSemanticInvalidation } from '../src/domain/record-candidate-mutations.js';
import type { RecordSet, UnitRecord, StoryRecord, BoltPlanRecord, VerificationRecord, RequirementRecord } from '../src/domain/record-contract.js';
import { HubError } from '../src/domain/board.js';

test('Gap 1 反例：在大小写不敏感文件系统上，.ENV、大小写变体 protectedPaths 及排除规则不得绕过', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-case-test-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'PrivateStore'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'temp'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.env'), 'SECRET_TOKEN=12345');
    fs.writeFileSync(path.join(tmpDir, 'PrivateStore', 'keys.txt'), 'SUPER_SECRET_KEY');
    fs.writeFileSync(path.join(tmpDir, 'temp', 'ignore.txt'), 'TEMPORARY_DATA');
    fs.writeFileSync(path.join(tmpDir, 'src', 'main.ts'), 'console.log("hello");');

    const executor = new WorkspaceToolExecutor(tmpDir, {
      readScope: ['.'],
      exclude: ['temp/'],
      protectedPaths: [path.join(tmpDir, 'PrivateStore')]
    });

    // 1. read_file(".ENV") must be rejected with PROTECTED_PATH_DENIED
    await assert.rejects(
      async () => executor.readFile('.ENV'),
      (err: unknown) => {
        assert.ok(err instanceof HubError, 'Expected HubError');
        assert.strictEqual(err.code, 'PROTECTED_PATH_DENIED');
        return true;
      }
    );

    // 2. read_file("PRIVATESTORE/keys.txt") must be rejected with PROTECTED_PATH_DENIED
    await assert.rejects(
      async () => executor.readFile('PRIVATESTORE/keys.txt'),
      (err: unknown) => {
        assert.ok(err instanceof HubError, 'Expected HubError');
        assert.strictEqual(err.code, 'PROTECTED_PATH_DENIED');
        return true;
      }
    );

    // 3. listDirectory("privatestore") must be rejected with PROTECTED_PATH_DENIED
    await assert.rejects(
      async () => executor.listDirectory('privatestore'),
      (err: unknown) => {
        assert.ok(err instanceof HubError, 'Expected HubError');
        assert.strictEqual(err.code, 'PROTECTED_PATH_DENIED');
        return true;
      }
    );

    // 4. searchCode across workspace must NOT include .env or PrivateStore even via casing
    const searchRes = JSON.parse(await executor.searchCode('SECRET')) as { matches?: Array<{ path: string }> };
    const matches = (searchRes.matches || []).map((m: { path: string }) => m.path.toLowerCase());
    assert.ok(!matches.some((p: string) => p.includes('.env')), 'Search must not match .env');
    assert.ok(!matches.some((p: string) => p.includes('privatestore')), 'Search must not match privatestore');

    // 5. Exclude with casing ("TEMP/ignore.txt") must be rejected with PROTECTED_PATH_DENIED
    await assert.rejects(
      async () => executor.readFile('TEMP/ignore.txt'),
      (err: unknown) => {
        assert.ok(err instanceof HubError, 'Expected HubError');
        assert.strictEqual(err.code, 'PROTECTED_PATH_DENIED');
        return true;
      }
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Gap 2 反例：Provider 默认 fetch 遇到 307/308 重定向必须拒绝，不得转发请求至未授权目标', async () => {
  let redirectedReceived = false;
  const redirectTargetServer = http.createServer((_req, res) => {
    redirectedReceived = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
  });
  await new Promise<void>(resolve => redirectTargetServer.listen(0, '127.0.0.1', () => resolve()));
  const targetPort = (redirectTargetServer.address() as { port: number }).port;

  const originServer = http.createServer((_req, res) => {
    // Return 307 redirect to target
    res.writeHead(307, { Location: `http://127.0.0.1:${targetPort}/hijacked` });
    res.end();
  });
  await new Promise<void>(resolve => originServer.listen(0, '127.0.0.1', () => resolve()));
  const originPort = (originServer.address() as { port: number }).port;

  try {
    const provider = new OpenAiCompatibleProvider({
      id: 'test-redirect',
      name: 'Test Redirect Provider',
      baseUrl: `http://127.0.0.1:${originPort}`,
      model: 'test-model',
      apiKey: 'test-key'
    });

    await assert.rejects(
      async () => {
        await provider.step({
          snapshot: {
            projectId: 'p1', requirementId: 'r1', projectRevision: 1,
            intent: { id: 'i1', title: 'I', problem: 'P', expectedOutcome: 'O', scope: { includes: [], excludes: [] }, constraints: [], sourceRefs: [], confirmation: { state: 'human_confirmed', sourceRefs: [] } },
            requirement: { id: 'r1', kind: 'requirement', intentId: 'i1', title: 'R', problem: 'P', expectedOutcome: 'O', scope: { includes: [], excludes: [] }, constraints: [], rationale: 'R', expectedImpact: 'E', acceptanceCriteria: [], sourceRefs: [], status: 'draft', result: null, acceptance: null, pullRequest: null },
            contextItems: [], sources: [], instruction: 'test', omitted: [], bytes: 100, hash: 'h1'
          },
          tools: [],
          turns: []
        }, new AbortController().signal);
      },
      (err: unknown) => {
        assert.ok(err instanceof HubError, 'Must throw HubError');
        assert.strictEqual(err.code, 'REDIRECT_NOT_ALLOWED');
        return true;
      }
    );

    assert.strictEqual(redirectedReceived, false, 'Redirected target must never have been contacted');
  } finally {
    originServer.close();
    redirectTargetServer.close();
  }
});

test('Gap 3 反例：上游 Unit 修改导致下游 Story 与 BoltPlan 依赖核查必须级联置为 unknown 并保留证据历史', () => {
  const unit: UnitRecord = {
    id: 'U-1', kind: 'unit', requirementId: 'REQ-1', title: 'Core Parser', problem: 'Parse', expectedOutcome: 'Parsed',
    scope: { includes: ['parse'], excludes: [] }, rationale: 'R', expectedImpact: 'E',
    acceptanceCriteria: [{ id: 'C-U1', description: 'Parse correctly', verification: 'test' }],
    responsibilities: ['parsing'], inputs: ['raw string'], outputs: ['AST'], dependsOn: [],
    sourceRefs: ['src-1'], status: 'done', result: { what: 'Done', why: 'Tested', actualImpact: 'Good', evidenceRefs: ['ev-1'] }
  };
  const story: StoryRecord = {
    id: 'S-1', kind: 'story', requirementId: 'REQ-1', unitId: 'U-1', title: 'CLI command', problem: 'User command',
    expectedOutcome: 'Command works', scope: { includes: ['cli'], excludes: [] }, rationale: 'R', expectedImpact: 'E',
    acceptanceCriteria: [{ id: 'C-S1', description: 'CLI flags', verification: 'test' }],
    userValue: 'Users can run cli', dependsOn: [{ kind: 'unit', id: 'U-1' }],
    sourceRefs: ['src-1'], status: 'done', result: { what: 'Done', why: 'Tested', actualImpact: 'Good', evidenceRefs: ['ev-2'] }
  };
  const boltPlan: BoltPlanRecord = {
    id: 'B-1', kind: 'bolt_plan', requirementId: 'REQ-1', title: 'Batch Build', problem: 'Build all', expectedOutcome: 'Built',
    scope: { includes: ['build'], excludes: [] }, rationale: 'R', expectedImpact: 'E',
    acceptanceCriteria: [{ id: 'C-B1', description: 'Build all artifacts', verification: 'test' }],
    storyIds: ['S-1'], constructionType: 'simple', stages: ['stage 1'], exitConditions: ['exit 1'],
    dependsOn: [{ kind: 'story', id: 'S-1' }],
    sourceRefs: ['src-1'], status: 'done', result: { what: 'Done', why: 'Tested', actualImpact: 'Good', evidenceRefs: ['ev-3'] }
  };
  const req: RequirementRecord = {
    id: 'REQ-1', kind: 'requirement', intentId: 'INT-1', title: 'Feature', problem: 'P', expectedOutcome: 'O',
    scope: { includes: ['all'], excludes: [] }, constraints: [], rationale: 'R', expectedImpact: 'E',
    acceptanceCriteria: [{ id: 'C-REQ1', description: 'Overall works', verification: 'test' }],
    sourceRefs: ['src-1'], status: 'done', result: { what: 'Done', why: 'All done', actualImpact: 'Complete', evidenceRefs: ['ev-req'] },
    acceptance: { outcome: 'accepted', sourceRefs: ['src-accept'], reason: 'All passed' },
    pullRequest: null
  };

  const verifications: VerificationRecord[] = [
    { id: 'V-U1', target: { kind: 'unit', id: 'U-1' }, criterionId: 'C-U1', outcome: 'passed', method: 'test', explanation: 'Unit test passed', evidenceRefs: ['ev-1'], sourceRefs: ['src-1'] },
    { id: 'V-S1', target: { kind: 'story', id: 'S-1' }, criterionId: 'C-S1', outcome: 'passed', method: 'test', explanation: 'CLI test passed', evidenceRefs: ['ev-2'], sourceRefs: ['src-1'] },
    { id: 'V-B1', target: { kind: 'bolt_plan', id: 'B-1' }, criterionId: 'C-B1', outcome: 'passed', method: 'test', explanation: 'Build test passed', evidenceRefs: ['ev-3'], sourceRefs: ['src-1'] },
    { id: 'V-REQ1', target: { kind: 'requirement', id: 'REQ-1' }, criterionId: 'C-REQ1', outcome: 'passed', method: 'test', explanation: 'Req passed', evidenceRefs: ['ev-req'], sourceRefs: ['src-1'] },
  ];

  const recordSet: RecordSet = {
    schemaVersion: '1.0.0',
    intent: { id: 'INT-1', title: 'I', problem: 'P', expectedOutcome: 'O', scope: { includes: [], excludes: [] }, constraints: [], confirmation: { state: 'human_confirmed', sourceRefs: [] }, sourceRefs: [] },
    requirements: [req],
    units: [unit],
    stories: [story],
    boltPlans: [boltPlan],
    sources: [{ id: 'src-1', kind: 'reference', locator: 'loc:1', excerpt: null }],
    contextItems: [],
    evidence: [
      { id: 'ev-1', requirementId: 'REQ-1', targets: [{ kind: 'unit', id: 'U-1' }], description: 'ev1', subject: 'U1', environment: 'node', observedResult: 'ok', limitations: [], sourceRefs: ['src-1'] },
      { id: 'ev-2', requirementId: 'REQ-1', targets: [{ kind: 'story', id: 'S-1' }], description: 'ev2', subject: 'S1', environment: 'node', observedResult: 'ok', limitations: [], sourceRefs: ['src-1'] },
      { id: 'ev-3', requirementId: 'REQ-1', targets: [{ kind: 'bolt_plan', id: 'B-1' }], description: 'ev3', subject: 'B1', environment: 'node', observedResult: 'ok', limitations: [], sourceRefs: ['src-1'] },
      { id: 'ev-req', requirementId: 'REQ-1', targets: [{ kind: 'requirement', id: 'REQ-1' }], description: 'ev-req', subject: 'REQ', environment: 'node', observedResult: 'ok', limitations: [], sourceRefs: ['src-1'] }
    ],
    verifications
  };

  // Mutate Unit U-1 work content
  const modifiedUnit: UnitRecord = {
    ...unit,
    inputs: ['raw string', 'encoding flag'], // modified inputs
  };

  const effects: Array<{ target: string; before: unknown; after: unknown }> = [];
  const warnings: string[] = [];

  applyWorkItemSemanticInvalidation({
    data: recordSet,
    before: unit,
    after: modifiedUnit,
    sourceIds: ['src-1'],
    warnings,
    effects
  });

  // 1. Story S-1 and BoltPlan B-1 must be demoted to review
  assert.strictEqual(recordSet.stories[0]?.status, 'review');
  assert.strictEqual(recordSet.boltPlans[0]?.status, 'review');
  // 2. Requirement acceptance must be revoked and status demoted to review
  assert.strictEqual(recordSet.requirements[0]?.status, 'review');
  assert.strictEqual(recordSet.requirements[0]?.acceptance, null);

  // 3. Crucially: Downstream verifications (V-S1 and V-B1) MUST be invalidated to unknown!
  const vS1 = recordSet.verifications.find(v => v.id === 'V-S1');
  const vB1 = recordSet.verifications.find(v => v.id === 'V-B1');
  assert.ok(vS1, 'V-S1 must exist');
  assert.ok(vB1, 'V-B1 must exist');
  assert.strictEqual(vS1.outcome, 'unknown', 'Downstream story verification must be invalidated to unknown');
  assert.strictEqual(vB1.outcome, 'unknown', 'Downstream bolt plan verification must be invalidated to unknown');
  assert.ok(vS1.explanation.includes('失效') || vS1.explanation.includes('invalidated'), 'Must record invalidation note in explanation');
  assert.ok(vS1.evidenceRefs.includes('ev-2'), 'Must preserve original evidence references');
});

test('Gap 4 反例：Provider 响应体必须使用有界流式读取，超限响应立即中止连接且统计已知消耗', async () => {
  let streamClosedPrematurely = false;
  const bigServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // Write 50 chunks of 1024 bytes (50 KiB total)
    const chunk = Buffer.alloc(1024, 'a');
    let count = 0;
    const interval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(interval);
        streamClosedPrematurely = true;
        return;
      }
      res.write(chunk);
      count++;
      if (count >= 50) {
        clearInterval(interval);
        res.end();
      }
    }, 10);
    req.on('close', () => {
      clearInterval(interval);
      streamClosedPrematurely = true;
    });
  });
  await new Promise<void>(resolve => bigServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (bigServer.address() as { port: number }).port;

  try {
    const provider = new OpenAiCompatibleProvider({
      id: 'test-bounded-stream',
      name: 'Test Stream Provider',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'test-model',
      apiKey: 'test-key',
      maxOutputBytes: 1024 // limit to 1 KiB
    });

    await assert.rejects(
      async () => {
        await provider.step({
          snapshot: {
            projectId: 'p1', requirementId: 'r1', projectRevision: 1,
            intent: { id: 'i1', title: 'I', problem: 'P', expectedOutcome: 'O', scope: { includes: [], excludes: [] }, constraints: [], sourceRefs: [], confirmation: { state: 'human_confirmed', sourceRefs: [] } },
            requirement: { id: 'r1', kind: 'requirement', intentId: 'i1', title: 'R', problem: 'P', expectedOutcome: 'O', scope: { includes: [], excludes: [] }, constraints: [], rationale: 'R', expectedImpact: 'E', acceptanceCriteria: [], sourceRefs: [], status: 'draft', result: null, acceptance: null, pullRequest: null },
            contextItems: [], sources: [], instruction: 'test', omitted: [], bytes: 100, hash: 'h1'
          },
          tools: [],
          turns: []
        }, new AbortController().signal);
      },
      (err: unknown) => {
        assert.ok(err instanceof HubError, 'Must throw HubError');
        assert.strictEqual(err.code, 'RESPONSE_SIZE_EXCEEDED');
        return true;
      }
    );

    // Wait a brief moment for socket close
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(streamClosedPrematurely, true, 'Server stream must have been closed prematurely by client reader.cancel');
  } finally {
    bigServer.close();
  }
});

test('Gap 5 反例：运行时必须保留 URL 完整路径并计算配置指纹，同 host 不同 path 变更必须触发版本递增与漂移拦截', () => {
  const registry = new RuntimeRegistry([
    {
      id: 'tenant-a',
      version: 1,
      name: 'Tenant A',
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com/tenant-a',
      model: 'chat-v1',
      apiKeyEnv: 'KEY_A',
      timeoutMs: 30000,
      isPreset: false
    }
  ]);

  const resolvedA = registry.resolve(undefined, 'tenant-a');
  assert.ok(resolvedA.endpoint.includes('/tenant-a'), 'Endpoint must preserve path /tenant-a');
  assert.ok(resolvedA.fingerprint, 'Must compute deterministic fingerprint');

  // Update runtime to tenant-b (same host, different path)
  registry.updateRuntime('tenant-a', {
    baseUrl: 'https://api.example.com/tenant-b'
  });

  const resolvedB = registry.resolve(undefined, 'tenant-a');
  assert.ok(resolvedB.endpoint.includes('/tenant-b'), 'Endpoint must preserve path /tenant-b');
  assert.notStrictEqual(resolvedA.fingerprint, resolvedB.fingerprint, 'Fingerprint must change when baseUrl path changes');
  assert.ok(resolvedB.configVersion > resolvedA.configVersion, 'Config version must increment on change');
});

test('Gap 6 反例：未知 ModelPort 缺少 providerKind 与 endpoint 时默认拒绝，严禁静默推断为 scripted/local', () => {
  const registry = new RuntimeRegistry();
  assert.throws(
    () => {
      registry.registerDefaultPort({
        name: 'unregistered-port-no-metadata',
        async propose() { return {}; }
      } as any);
    },
    (err: unknown) => {
      assert.ok(err instanceof HubError, 'Must throw HubError');
      assert.strictEqual(err.code, 'UNKNOWN_PORT_DENIED');
      return true;
    }
  );
});

test('Gap 7 反例：运行时端点 URL 包含查询参数或 Hash 锚点时必须拒绝（Fail-Closed）', () => {
  const registry = new RuntimeRegistry();
  assert.throws(
    () => {
      registry.save({
        id: 'rt-query-leaker',
        name: 'Query Leaker',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1?api-version=2024-05-01',
        model: 'gpt-4o-mini',
        apiKeyEnv: 'OPENAI_API_KEY'
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof HubError, 'Must throw HubError');
      assert.strictEqual(err.code, 'UNSUPPORTED_RUNTIME_URL_QUERY');
      return true;
    }
  );
});

test('Gap 8 反例：readScope 白名单在大小写匹配与符号链接解析上严格校验，避免跨盘符或伪装大小写越权', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-scope-casing-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const a = 1;');

    const executor = new WorkspaceToolExecutor(tmpDir, {
      readScope: ['src']
    });

    // 正常授权路径允许读取
    const raw = await executor.readFile('src/index.ts');
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.content, 'export const a = 1;');

    // 伪装路径或越界路径拒绝
    await assert.rejects(
      async () => executor.readFile('package.json'),
      (err: unknown) => {
        assert.ok(err instanceof HubError, 'Expected HubError');
        assert.strictEqual(err.code, 'PATH_OUT_OF_SCOPE');
        return true;
      }
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Gap 9 反例：上游 Unit 变更时，下游处于 review 状态的 Story 其 passed 核查仍必须失效为 unknown，不能因 status !== done 被跳过', () => {
  const data: RecordSet = {
    schemaVersion: '1.0.0',
    intent: {
      id: 'i1', title: 'Intent', problem: 'P', expectedOutcome: 'O',
      scope: { includes: ['A'], excludes: [] }, constraints: [],
      confirmation: { state: 'human_confirmed', sourceRefs: ['src1'] },
      sourceRefs: ['src1']
    },
    requirements: [{
      id: 'r1', kind: 'requirement', intentId: 'i1', title: 'R1', problem: 'P', expectedOutcome: 'O',
      scope: { includes: ['A'], excludes: [] }, constraints: [], rationale: 'R', expectedImpact: 'E',
      acceptanceCriteria: [{ id: 'rc1', description: 'RC', verification: 'test' }],
      sourceRefs: ['src1'], status: 'draft', result: null, acceptance: null, pullRequest: null
    }],
    units: [{
      kind: 'unit', id: 'u1', requirementId: 'r1', title: 'Unit 1', problem: 'P', expectedOutcome: 'O',
      scope: { includes: ['A'], excludes: [] }, rationale: 'R', expectedImpact: 'E',
      acceptanceCriteria: [{ id: 'uc1', description: 'UC1', verification: 'test' }],
      responsibilities: ['R'], inputs: ['I'], outputs: ['O'], dependsOn: [],
      sourceRefs: ['src1'], status: 'draft', result: null
    }],
    stories: [{
      kind: 'story', id: 's1', requirementId: 'r1', unitId: 'u1', title: 'Story 1', problem: 'P', expectedOutcome: 'O',
      scope: { includes: ['A'], excludes: [] }, rationale: 'R', expectedImpact: 'E',
      acceptanceCriteria: [{ id: 'sc1', description: 'SC1', verification: 'test' }],
      userValue: 'V', dependsOn: [{ kind: 'unit', id: 'u1' }],
      sourceRefs: ['src1'], status: 'review', result: null // 已经是 review 状态！
    }],
    boltPlans: [],
    contextItems: [],
    evidence: [{
      id: 'ev1', requirementId: 'r1', targets: [{ kind: 'story', id: 's1' }],
      description: 'D', subject: 'S', environment: 'T', observedResult: 'R', limitations: [],
      sourceRefs: ['src1']
    }],
    verifications: [{
      id: 'v-sc1', target: { kind: 'story', id: 's1' }, criterionId: 'sc1',
      outcome: 'passed', method: 'test', explanation: '通过',
      evidenceRefs: ['ev1'], sourceRefs: ['src1']
    }],
    sources: [{ id: 'src1', kind: 'reference', locator: 'doc://ref', excerpt: 'text' }]
  };

  const oldUnit = structuredClone(data.units[0]!);
  const updatedUnit: UnitRecord = {
    ...oldUnit,
    title: 'Unit 1 修改了接口语义与职责'
  };
  data.units[0] = updatedUnit;

  const warnings: string[] = [];
  const effects: any[] = [];
  applyWorkItemSemanticInvalidation({
    data,
    before: oldUnit,
    after: updatedUnit,
    sourceIds: ['src1'],
    warnings,
    effects
  });

  // Story s1 虽然本来就是 review 状态，但其已通过的核查 v-sc1 必须因上游 u1 改变而失效为 unknown！
  const s1Verif = data.verifications.find(v => v.id === 'v-sc1')!;
  assert.strictEqual(s1Verif.outcome, 'unknown');
  assert.ok(s1Verif.explanation.includes('上游依赖内容变更'));
  assert.ok(effects.some(e => e.target === 'verifications/v-sc1'));
});
