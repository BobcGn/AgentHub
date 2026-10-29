import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { HubError } from '../src/domain/board.js';
import { OpenAiCompatibleProvider } from '../src/infrastructure/providers/model-provider.js';
import { DeepSeekProvider } from '../src/infrastructure/providers/deepseek-provider.js';
import type { ContextSnapshot, ToolDefinition } from '../src/domain/harness.js';

const sampleSnapshot: ContextSnapshot = {
  projectId: 'PROJ-TEST',
  requirementId: 'REQ-1',
  projectRevision: 1,
  intent: {
    id: 'INT-1',
    title: '测试提供商',
    problem: '需要统一抽象',
    expectedOutcome: '复用通信与容错逻辑',
    scope: { includes: ['抽象基类'], excludes: [] },
    constraints: [],
    sourceRefs: [],
    confirmation: { state: 'human_confirmed', sourceRefs: [] }
  },
  requirement: {
    id: 'REQ-1',
    kind: 'requirement',
    intentId: 'INT-1',
    title: '重构 Provider',
    problem: '避免重复造轮子',
    expectedOutcome: '支持多厂商即插即用',
    scope: { includes: ['基类'], excludes: [] },
    constraints: [],
    rationale: '提高可扩展性',
    expectedImpact: '加速后续模型接入',
    acceptanceCriteria: [],
    sourceRefs: ['SRC-1'],
    status: 'draft',
    result: null,
    acceptance: null,
    pullRequest: null
  },
  contextItems: [],
  sources: [{ id: 'SRC-1', kind: 'reference', locator: 'docs/test.md', excerpt: '测试摘录' }],
  instruction: '分析是否需要增加新提供商',
  omitted: [],
  bytes: 500,
  hash: 'h1'
};

const sampleTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: '读取文件',
    parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }
  }
];

function createMockServer(handler: (req: import('node:http').IncomingMessage, body: string, res: import('node:http').ServerResponse) => void): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
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

class TestGenericProvider extends OpenAiCompatibleProvider {
  constructor(apiKey: string, baseUrl: string) {
    super({ apiKey, baseUrl, model: 'generic-v1' }, 'generic-v1', 'https://api.generic.ai');
  }
}

test('OpenAiCompatibleProvider: 校验空 Key 并正确设置属性', () => {
  assert.throws(() => new TestGenericProvider('', 'http://localhost'), (err: unknown) => err instanceof HubError && err.code === 'INVALID_API_KEY');
  const p = new TestGenericProvider('sk-test', 'http://localhost:8000/');
  assert.equal(p.name, 'generic-v1');
});

test('OpenAiCompatibleProvider: step 解析 tool_calls 响应', async t => {
  const mock = await createMockServer((_req, body, res) => {
    const parsed = JSON.parse(body) as { tools?: unknown[] };
    assert.ok(parsed.tools && parsed.tools.length > 0);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path: 'src/index.ts' })
            }
          }]
        }
      }]
    }));
  });
  t.after(mock.close);

  const provider = new TestGenericProvider('sk-test', mock.url);
  const stepRes = await provider.step({
    snapshot: sampleSnapshot,
    tools: sampleTools,
    turns: []
  }, new AbortController().signal);

  assert.equal(stepRes.kind, 'tool_calls');
  if (stepRes.kind === 'tool_calls') {
    assert.equal(stepRes.toolCalls.length, 1);
    assert.equal(stepRes.toolCalls[0]?.id, 'call_123');
    assert.equal(stepRes.toolCalls[0]?.name, 'read_file');
    assert.deepEqual(stepRes.toolCalls[0]?.arguments, { path: 'src/index.ts' });
  }
});

test('DeepSeekProvider: 继承基类并正确映射模型名称', () => {
  const p1 = new DeepSeekProvider({ apiKey: 'sk-ds', model: 'DeepSeek-V4.1-Flash-1017' });
  assert.equal(p1.name, 'DeepSeek-V4.1-Flash-1017');

  const p2 = new DeepSeekProvider({ apiKey: 'sk-ds', model: 'deepseek-v4-pro' });
  assert.equal(p2.name, 'deepseek-v4-pro');
});
