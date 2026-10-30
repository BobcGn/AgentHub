import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HubError } from '../src/domain/board.js';
import { WorkspaceToolExecutor } from '../src/infrastructure/workspace-tools.js';
import { simulateCandidateMutation } from '../src/domain/record-candidate-mutations.js';
import type { RecordSet } from '../src/domain/record-contract.js';

function baseRecordSet(): RecordSet {
  return {
    schemaVersion: '1.0.0',
    intent: {
      id: 'INTENT-1',
      title: '测试意图',
      problem: '测试问题',
      expectedOutcome: '测试目标',
      scope: { includes: ['核心能力'], excludes: [] },
      constraints: [],
      sourceRefs: ['src-1'],
      confirmation: { state: 'human_confirmed', sourceRefs: ['src-1'] }
    },
    requirements: [
      {
        id: 'REQ-1',
        kind: 'requirement',
        intentId: 'INTENT-1',
        title: '测试需求',
        problem: '测试需求问题',
        expectedOutcome: '测试需求结果',
        scope: { includes: ['测试'], excludes: [] },
        rationale: '必要性',
        expectedImpact: '正面影响',
        acceptanceCriteria: [
          { id: 'crit-1', description: '条件 1', verification: '静态检查' }
        ],
        sourceRefs: ['src-1'],
        status: 'draft',
        result: null,
        constraints: [],
        acceptance: null,
        pullRequest: null
      }
    ],
    units: [],
    stories: [],
    boltPlans: [],
    sources: [{ id: 'src-1', kind: 'message', locator: 'test', excerpt: 'test' }],
    contextItems: [],
    evidence: [],
    verifications: []
  };
}

test('候选重复 ID 校验：propose_criteria 拒绝包含重复条件 ID', () => {
  const records = baseRecordSet();
  assert.throws(
    () => simulateCandidateMutation(records, {
      type: 'propose_criteria',
      requirementId: 'REQ-1',
      acceptanceCriteria: [
        { id: 'crit-dup', description: '描述 1', verification: '检查 1' },
        { id: 'crit-dup', description: '描述 2', verification: '检查 2' }
      ],
      sourceRefs: ['src-1']
    }, []),
    (err: unknown) => err instanceof HubError && err.code === 'DUPLICATE_CRITERIA_ID'
  );
});

test('候选重复 ID 校验：propose_decomposition 拒绝包含重复 Unit ID 或 Story ID', () => {
  const records = baseRecordSet();
  assert.throws(
    () => simulateCandidateMutation(records, {
      type: 'propose_decomposition',
      requirementId: 'REQ-1',
      units: [
        {
          id: 'unit-dup',
          kind: 'unit',
          requirementId: 'REQ-1',
          title: 'Unit 1',
          problem: 'P',
          expectedOutcome: 'O',
          scope: { includes: [], excludes: [] },
          rationale: 'R',
          expectedImpact: 'I',
          acceptanceCriteria: [],
          sourceRefs: [],
          status: 'draft',
          result: null,
          dependsOn: [],
          responsibilities: [],
          inputs: [],
          outputs: []
        },
        {
          id: 'unit-dup',
          kind: 'unit',
          requirementId: 'REQ-1',
          title: 'Unit 2',
          problem: 'P',
          expectedOutcome: 'O',
          scope: { includes: [], excludes: [] },
          rationale: 'R',
          expectedImpact: 'I',
          acceptanceCriteria: [],
          sourceRefs: [],
          status: 'draft',
          result: null,
          dependsOn: [],
          responsibilities: [],
          inputs: [],
          outputs: []
        }
      ],
      stories: [],
      sourceRefs: ['src-1']
    }, []),
    (err: unknown) => err instanceof HubError && err.code === 'DUPLICATE_UNIT_ID'
  );

  assert.throws(
    () => simulateCandidateMutation(records, {
      type: 'propose_decomposition',
      requirementId: 'REQ-1',
      stories: [
        {
          id: 'story-dup',
          kind: 'story',
          requirementId: 'REQ-1',
          unitId: null,
          userValue: 'V',
          title: 'Story 1',
          problem: 'P',
          expectedOutcome: 'O',
          scope: { includes: [], excludes: [] },
          rationale: 'R',
          expectedImpact: 'I',
          acceptanceCriteria: [],
          sourceRefs: [],
          status: 'draft',
          result: null,
          dependsOn: []
        },
        {
          id: 'story-dup',
          kind: 'story',
          requirementId: 'REQ-1',
          unitId: null,
          userValue: 'V',
          title: 'Story 2',
          problem: 'P',
          expectedOutcome: 'O',
          scope: { includes: [], excludes: [] },
          rationale: 'R',
          expectedImpact: 'I',
          acceptanceCriteria: [],
          sourceRefs: [],
          status: 'draft',
          result: null,
          dependsOn: []
        }
      ],
      sourceRefs: ['src-1']
    }, []),
    (err: unknown) => err instanceof HubError && err.code === 'DUPLICATE_STORY_ID'
  );
});

test('WorkspaceToolExecutor: readScope 明确清单与越界拦截', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-scope-'));
  try {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'src', 'app.ts'), 'export const a = 1;');
    writeFileSync(join(dir, 'docs', 'readme.md'), '# Documentation');

    // 只授权 readScope 为 ['src']
    const executor = new WorkspaceToolExecutor(dir, {
      readScope: ['src'],
      exclude: []
    });

    // 授权范围内的文件正常读取
    const inScope = JSON.parse(executor.readFile('src/app.ts')) as { content: string };
    assert.ok(inScope.content.includes('export const a = 1;'));

    // 超出 readScope 的文件被严格拒绝
    assert.throws(
      () => executor.readFile('docs/readme.md'),
      (err: unknown) => err instanceof HubError && err.code === 'PATH_OUT_OF_SCOPE'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: exclude 规则优先拦截', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-exclude-'));
  try {
    mkdirSync(join(dir, 'src'));
    mkdirSync(join(dir, 'src', 'fixtures'));
    writeFileSync(join(dir, 'src', 'app.ts'), 'export const a = 1;');
    writeFileSync(join(dir, 'src', 'fixtures', 'mock.json'), '{"mock": true}');

    // 授权 readScope 为 ['src']，但 exclude 包含 'fixtures'
    const executor = new WorkspaceToolExecutor(dir, {
      readScope: ['src'],
      exclude: ['fixtures']
    });

    // 排除项目即使在 readScope 内也必须被阻断
    assert.throws(
      () => executor.readFile('src/fixtures/mock.json'),
      (err: unknown) => err instanceof HubError && err.code === 'PROTECTED_PATH_DENIED'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: searchCode 在平铺大目录中严格遵守 MAX_FILES 预算并及时停止', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-flat-dir-'));
  try {
    mkdirSync(join(dir, 'flat'));
    // 创建 250 个文件放置于单一平铺目录中，内容不匹配查询
    for (let i = 0; i < 250; i++) {
      writeFileSync(join(dir, 'flat', `file_${String(i).padStart(3, '0')}.txt`), `Different text ${i}`);
    }

    const executor = new WorkspaceToolExecutor(dir);
    const result = JSON.parse(executor.searchCode('NonExistentKeyword', 'flat')) as {
      count: number;
      truncated: boolean;
      truncationReason?: string;
      scannedFiles: number;
    };

    // 必须在到达 MAX_FILES（200）时立即中止，不能把 250 个文件全扫完
    assert.equal(result.truncated, true);
    assert.equal(result.truncationReason, 'max_files');
    assert.ok(result.scannedFiles <= 200, `扫描文件数 (${result.scannedFiles}) 不能超过 200`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: 非法参数严格校验拒绝，不静默改义', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-invalid-args-'));
  try {
    writeFileSync(join(dir, 'test.txt'), 'line 1\nline 2\nline 3');
    const executor = new WorkspaceToolExecutor(dir);

    // 负数起始行
    assert.throws(
      () => executor.readFile('test.txt', -1),
      (err: unknown) => err instanceof HubError && err.code === 'INVALID_ARGUMENT'
    );

    // endLine < startLine
    assert.throws(
      () => executor.readFile('test.txt', 3, 1),
      (err: unknown) => err instanceof HubError && err.code === 'INVALID_ARGUMENT'
    );

    // query 过短
    assert.throws(
      () => executor.searchCode('a'),
      (err: unknown) => err instanceof HubError && err.code === 'INVALID_QUERY'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('WorkspaceToolExecutor: 16 KiB 上限截断后依然保持为合法 JSON 对象', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-valid-json-'));
  try {
    // 构造超大文本
    const largeText = 'A'.repeat(30000);
    writeFileSync(join(dir, 'large.txt'), largeText);

    const executor = new WorkspaceToolExecutor(dir);
    const res = await executor.execute({
      id: 'tc-valid-json',
      name: 'read_file',
      arguments: { path: 'large.txt' }
    });

    // execute 返回的 output 必须始终能被 JSON.parse 解析！绝不能因盲切导致语法损坏！
    assert.doesNotThrow(() => JSON.parse(res.output), '输出必须是合法的 JSON 字符串');
    const parsed = JSON.parse(res.output) as { content: string; truncated: boolean };
    assert.equal(parsed.truncated, true);
    assert.ok(Buffer.byteLength(res.output, 'utf8') <= 16384);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
