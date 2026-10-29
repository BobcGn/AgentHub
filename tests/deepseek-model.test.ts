import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { HubError } from '../src/domain/board.js';
import { DeepSeekModel } from '../src/infrastructure/deepseek-model.js';
import type { ContextSnapshot } from '../src/domain/harness.js';
import { harnessFixture } from './harness-fixtures.js';
import { human } from './fixtures.js';

const sampleSnapshot: ContextSnapshot = {
  projectId: 'PROJ-TEST',
  requirementId: 'REQ-HARNESS-1',
  projectRevision: 1,
  intent: {
    id: 'INTENT-TEST',
    title: '测试意图',
    problem: '测试问题',
    expectedOutcome: '测试预期',
    scope: { includes: ['范围内'], excludes: ['范围外'] },
    constraints: ['约束1'],
    sourceRefs: [],
    confirmation: { state: 'human_confirmed', sourceRefs: [] }
  },
  requirement: {
    id: 'REQ-HARNESS-1',
    kind: 'requirement',
    intentId: 'INTENT-TEST',
    title: '接入 DeepSeek 模型',
    problem: '需要通过真实云端模型生成候选。',
    expectedOutcome: '返回结构化待核对假设或问题。',
    scope: { includes: ['模型适配'], excludes: ['自动执行代码'] },
    constraints: ['人端核对确认'],
    rationale: '为 Harness 提供真实理解能力。',
    expectedImpact: '提升上下文分析质量。',
    acceptanceCriteria: [],
    sourceRefs: ['SRC-1'],
    status: 'draft',
    result: null,
    acceptance: null,
    pullRequest: null
  },
  contextItems: [],
  sources: [
    { id: 'SRC-1', kind: 'reference', locator: 'docs/test.md', excerpt: '测试来源摘录' }
  ],
  instruction: '分析本需求是否存在未决问题',
  omitted: [],
  bytes: 1200,
  hash: 'snapshot-hash'
};

function createMockDeepSeekServer(handler: (req: import('node:http').IncomingMessage, body: string, res: import('node:http').ServerResponse) => void): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => handler(req, body, res));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>(resClose => server.close(() => resClose()))
      });
    });
  });
}

test('DeepSeekModel: 校验必填 apiKey', () => {
  assert.throws(() => new DeepSeekModel({ apiKey: '' }), (err: unknown) => err instanceof HubError && err.code === 'INVALID_API_KEY');
  assert.throws(() => new DeepSeekModel({ apiKey: '   ' }), (err: unknown) => err instanceof HubError && err.code === 'INVALID_API_KEY');
  const model = new DeepSeekModel({ apiKey: 'sk-test-123' });
  assert.equal(model.name, 'DeepSeek-V4.1-Flash-1017');
});

test('DeepSeekModel: 成功发送并解析标准 JSON 候选', async t => {
  let receivedAuth = '';
  let receivedModel = '';
  let receivedFormat: unknown = null;

  const mock = await createMockDeepSeekServer((req, body, res) => {
    receivedAuth = req.headers['authorization'] ?? '';
    const parsed = JSON.parse(body) as { model: string; response_format: unknown };
    receivedModel = parsed.model;
    receivedFormat = parsed.response_format;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-test',
      choices: [{
        message: {
          content: JSON.stringify({
            type: 'append_context',
            requirementId: 'REQ-HARNESS-1',
            category: 'open_question',
            epistemicStatus: 'unknown',
            content: '待核对：模型调用在弱网环境下是否有重试退避机制？',
            sourceRefs: ['SRC-1']
          })
        }
      }]
    }));
  });
  t.after(mock.close);

  const model = new DeepSeekModel({
    apiKey: 'sk-secret-token',
    baseUrl: mock.url,
    model: 'DeepSeek-V4.1-Flash-1017'
  });

  const controller = new AbortController();
  const result = await model.propose(sampleSnapshot, controller.signal) as {
    type: string;
    requirementId: string;
    category: string;
    epistemicStatus: string;
    content: string;
    sourceRefs: string[];
  };

  assert.equal(receivedAuth, 'Bearer sk-secret-token');
  assert.equal(model.name, 'DeepSeek-V4.1-Flash-1017');
  assert.equal(receivedModel, 'deepseek-flash');
  assert.deepEqual(receivedFormat, { type: 'json_object' });
  assert.equal(result.type, 'append_context');
  assert.equal(result.requirementId, 'REQ-HARNESS-1');
  assert.equal(result.category, 'open_question');
  assert.equal(result.epistemicStatus, 'unknown');
  assert.equal(result.sourceRefs[0], 'SRC-1');
});

test('DeepSeekModel: 容错处理被 markdown 代码块包裹的返回', async t => {
  const mock = await createMockDeepSeekServer((_req, _body, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{
        message: {
          content: '```json\n{\n  "type": "append_context",\n  "requirementId": "REQ-HARNESS-1",\n  "category": "assumption",\n  "epistemicStatus": "proposed",\n  "content": "假设测试网络稳定",\n  "sourceRefs": []\n}\n```'
        }
      }]
    }));
  });
  t.after(mock.close);

  const model = new DeepSeekModel({
    apiKey: 'sk-test',
    baseUrl: mock.url
  });

  const result = await model.propose(sampleSnapshot, new AbortController().signal) as {
    type: string;
    content: string;
    epistemicStatus: string;
  };
  assert.equal(result.type, 'append_context');
  assert.equal(result.content, '假设测试网络稳定');
  assert.equal(result.epistemicStatus, 'proposed');
});

test('DeepSeekModel: 错误码映射 (401 凭据失效, 429 限流, 500 服务错误)', async t => {
  for (const [status, expectedCode] of [
    [401, 'DEEPSEEK_AUTH_ERROR'],
    [429, 'DEEPSEEK_RATE_LIMIT'],
    [500, 'DEEPSEEK_API_ERROR']
  ] as const) {
    const mock = await createMockDeepSeekServer((_req, _body, res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: '模拟错误 ' + status } }));
    });
    t.after(mock.close);

    const model = new DeepSeekModel({ apiKey: 'sk-test', baseUrl: mock.url });
    await assert.rejects(
      () => model.propose(sampleSnapshot, new AbortController().signal),
      (err: unknown) => err instanceof HubError && err.code === expectedCode
    );
  }
});

test('DeepSeekModel: 能够正常响应 AbortSignal 取消', async t => {
  const mock = await createMockDeepSeekServer((_req, _body, res) => {
    // 故意挂起请求不返回，等待客户端取消
    setTimeout(() => {
      res.writeHead(200);
      res.end('{}');
    }, 2000);
  });
  t.after(mock.close);

  const model = new DeepSeekModel({ apiKey: 'sk-test', baseUrl: mock.url });
  const controller = new AbortController();
  const promise = model.propose(sampleSnapshot, controller.signal);
  controller.abort();

  await assert.rejects(
    promise,
    (err: unknown) => err instanceof HubError && err.code === 'RUN_CANCELLED'
  );
});

test('DeepSeekModel 整合 HarnessService: 真实闭环产生候选项并由人端保存', async t => {
  const mock = await createMockDeepSeekServer((_req, _body, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            type: 'append_context',
            requirementId: 'REQ-HARNESS-1',
            category: 'open_question',
            epistemicStatus: 'unknown',
            content: 'DeepSeek 生成的真实待核对问题：是否支持动态切换模型版本？',
            sourceRefs: []
          })
        }
      }]
    }));
  });
  t.after(mock.close);

  const model = new DeepSeekModel({
    apiKey: 'sk-live-test',
    baseUrl: mock.url,
    model: 'DeepSeek-V4.1-Flash-1017'
  });

  const f = harnessFixture(model);
  t.after(f.cleanup);

  const started = f.start('测试 DeepSeek 真实输出写入');
  await f.harness.settled(started.id);

  const run = f.harness.get(human, started.id);
  assert.equal(run.state, 'waiting_human');
  assert.equal(run.model, 'DeepSeek-V4.1-Flash-1017');
  assert.ok(run.candidate);
  assert.equal(run.candidate.type, 'append_context');
  if (run.candidate.type === 'append_context') {
    assert.equal(run.candidate.content, 'DeepSeek 生成的真实待核对问题：是否支持动态切换模型版本？');
  }

  // 人工核对并应用入库
  const applied = f.harness.apply(human, run.id, { revision: run.revision, confirmed: true });
  assert.equal(applied.outcome, 'applied');

  const project = f.records.get(human, f.project.id);
  assert.equal(project.records.contextItems.length, 1);
  assert.equal(project.records.contextItems[0]?.content, 'DeepSeek 生成的真实待核对问题：是否支持动态切换模型版本？');
  assert.equal(project.records.contextItems[0]?.category, 'open_question');
  assert.equal(project.records.contextItems[0]?.epistemicStatus, 'unknown');
});
