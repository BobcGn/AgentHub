import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Board, Issue, Proposal } from '../../src/domain/board.js';
import type { Change, NewChange } from '../../src/domain/changes.js';
import { issueContent } from '../../src/domain/changes.js';
import { projectInput, proposalInput } from '../fixtures.js';
const exec = promisify(execFile);
async function seed(page: Page) {
  await page.goto('/?view=legacy');
  await page.getByLabel('人端密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '进入工作区 →' }).click();
  await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
  const origin = new URL(page.url()).origin;
  const name = 'B3-' + crypto.randomUUID().slice(0, 8);
  const headers = { Origin: origin };
  const response = await page.request.post('/api/projects', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { ...projectInput, name }
  });
  const board = await response.json() as Board;
  const base = '/api/projects/' + board.project.id;
  const issued = await page.request.post(base + '/scopes', { headers, data: { label: '原提案工具' } });
  const { token: oldToken } = await issued.json() as { token: string };
  const proposed = await page.request.post(base + '/proposals', {
    headers: { ...headers, Authorization: 'Bearer ' + oldToken, 'Idempotency-Key': crypto.randomUUID() }, data: proposalInput
  });
  const proposal = await proposed.json() as Proposal;
  const decided = await page.request.post(base + '/proposals/' + proposal.id + '/decisions', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { action: 'approve', proposalVersion: 1, intentVersion: 1, planVersion: 1 }
  });
  expect(decided.status()).toBe(200);
  const { issue } = await decided.json() as { issue: Issue };
  const scope = await page.request.post(base + '/scopes', { headers,
    data: { label: 'B3 受限建议者', changeScope: { intent: true, issueIds: [issue.id] } }
  });
  const { token } = await scope.json() as { token: string };
  await page.getByRole('button', { name: new RegExp(name) }).click();
  const input: NewChange = { targetKind: 'issue', targetId: issue.id, baseVersion: 1, intentVersion: 1, planVersion: 2,
    reason: '补充可重复的验证步骤', impact: '扩大验证次数，保留原功能边界', after: { ...issueContent(issue), verification: '快速切换十次并核对最终条件。' } };
  async function propose(data: NewChange): Promise<Change> {
    const result = await page.request.post(base + '/changes', {
      headers: { ...headers, Authorization: 'Bearer ' + token, 'Idempotency-Key': crypto.randomUUID() }, data
    });
    expect(result.status()).toBe(201); return await result.json() as Change;
  }
  return { board, issue, base, headers, origin, token, input, propose };
}

test('人端明确授予关键变更建议范围；真实 CLI 差异审查、批准和历史追溯', async ({ page }) => {
  const f = await seed(page);
  await page.getByRole('button', { name: '管理工具范围 ↗' }).click();
  await page.getByLabel('工具来源名称', { exact: true }).fill('CLI 修订测试');
  await page.getByLabel('允许提交关键变更建议', { exact: true }).check();
  await expect(page.getByRole('button', { name: '发放工具令牌' })).toBeDisabled();
  await page.getByLabel('变更对象：' + f.issue.title, { exact: true }).check();
  await page.getByRole('button', { name: '发放工具令牌' }).click();
  const token = await page.locator('.credential code').innerText();
  await page.getByRole('button', { name: '已保存，隐藏令牌' }).click();
  await page.getByRole('button', { name: '管理工具范围 ↗' }).click();
  const tabs = page.getByRole('navigation', { name: '工作区视图' });
  await tabs.getByRole('button', { name: /关键变更/ }).click();
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-b3-cli-'));
  try {
    const path = join(dir, 'change.json'); writeFileSync(path, JSON.stringify(f.input));
    await exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'change', '--server', f.origin,
      '--project', f.board.project.id, '--file', path, '--request-id', 'browser-change-001'],
      { env: { ...process.env, AGENTHUB_TOKEN: token } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  await page.getByRole('region', { name: '关键变更列表' }).getByRole('button', { name: /待你决定/ }).click();
  const review = page.getByRole('region', { name: '关键变更审阅' });
  await expect(review.getByRole('region', { name: '修改前后' })).toContainText(proposalInput.verification);
  await expect(review.getByRole('region', { name: '修改前后' })).toContainText(f.input.after.verification);
  const before = (await (await page.request.get('/api/boards')).json() as Board[]).find(item => item.project.id === f.board.project.id);
  expect(before?.issues[0]?.verification).toBe(proposalInput.verification);
  await page.screenshot({ path: 'test-results/b3-issue-diff.png', fullPage: true });
  await review.getByRole('button', { name: '确认应用修订' }).click();
  await expect(review.getByRole('region', { name: '修订决定' })).toContainText('已应用修订');
  await tabs.getByRole('button', { name: /正式 Issue/ }).click();
  const detail = page.getByRole('article', { name: 'Issue 详情' });
  await expect(detail).toContainText('Issue v2');
  await expect(detail).toContainText(f.input.after.verification);
  await detail.getByRole('region', { name: 'Issue 修订历史' }).getByRole('button').click();
  await expect(review.getByRole('region', { name: '修改前后' })).toContainText(proposalInput.verification);
  await page.reload();
  await page.getByRole('button', { name: new RegExp(f.board.project.name) }).click();
  await tabs.getByRole('button', { name: /正式 Issue/ }).click();
  await expect(detail).toContainText(f.input.after.verification);
});

test('Intent 商讨授权与应用分开；窄屏差异清晰，原 Issue 提示重新核对', async ({ page }) => {
  const f = await seed(page);
  const input: NewChange = { targetKind: 'intent', targetId: f.board.intent.id, baseVersion: 1, intentVersion: 1, planVersion: 2,
    reason: '经反向对话澄清预期结果', impact: '原有 Issue 需重新核对，记录权限不变',
    after: { title: f.board.intent.title, problem: f.board.intent.problem, outcome: '最终条件与结果一致并展示加载状态。', verification: f.board.intent.verification } };
  await f.propose(input);
  const tabs = page.getByRole('navigation', { name: '工作区视图' });
  await tabs.getByRole('button', { name: /关键变更/ }).click();
  await page.getByRole('region', { name: '关键变更列表' }).getByRole('button', { name: /Intent 修订/ }).click();
  const review = page.getByRole('region', { name: '关键变更审阅' });
  await expect(review.getByRole('button', { name: '确认应用修订' })).toBeDisabled();
  await review.getByLabel('商讨结论与授权边界（必填）', { exact: true }).fill('本人已理解新增加载状态的影响，授权应用这份修订。');
  await review.getByLabel('商讨来源（必填）', { exact: true }).fill('人工外部对话 #B3');
  await expect(review.getByRole('button', { name: '登记商讨与明确授权' })).toBeDisabled();
  await review.getByLabel('我已完成商讨，明确授权应用本页这份 Intent 修订', { exact: true }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/b3-mobile-intent.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await review.getByRole('button', { name: '登记商讨与明确授权' }).click();
  await expect(review.getByText('本人已登记商讨并明确授权本修订', { exact: true })).toBeVisible();
  const before = (await (await page.request.get('/api/boards')).json() as Board[]).find(item => item.project.id === f.board.project.id);
  expect(before?.intent.version).toBe(1);
  await review.getByRole('button', { name: '核对最新变更并继续' }).click();
  await review.getByRole('button', { name: '确认应用修订' }).click();
  await expect(review.getByRole('region', { name: '修订决定' })).toContainText('已应用修订');
  await tabs.getByRole('button', { name: '意图概览', exact: true }).click();
  await expect(page.getByText(input.after.outcome, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看 Intent 修订历史 ↗' }).click();
  await expect(review.getByRole('region', { name: '修订决定' })).toContainText('已应用修订');
  await tabs.getByRole('button', { name: /正式 Issue/ }).click();
  await expect(page.getByRole('article', { name: 'Issue 详情' })).toContainText('需重新核对本单元与当前意图的对应关系');
});

test('另一窗口应用修订后保留草稿并拦截旧基准，退回理由必填', async ({ page }) => {
  const f = await seed(page);
  const a = await f.propose(f.input);
  const b = await f.propose({ ...f.input, reason: '另一份同基准建议' });
  const tabs = page.getByRole('navigation', { name: '工作区视图' });
  await tabs.getByRole('button', { name: /关键变更/ }).click();
  await page.getByRole('region', { name: '关键变更列表' }).getByRole('button', { name: /另一份同基准建议/ }).click();
  const review = page.getByRole('region', { name: '关键变更审阅' });
  await review.getByLabel('补充说明（选填）', { exact: true }).fill('尚未完成的审阅草稿');
  const other = await page.context().newPage();
  try {
    await other.goto('/?view=legacy');
    await other.getByRole('button', { name: new RegExp(f.board.project.name) }).click();
    await other.getByRole('navigation', { name: '工作区视图' }).getByRole('button', { name: /关键变更/ }).click();
    await other.getByRole('region', { name: '关键变更列表' }).getByRole('button', { name: /补充可重复的验证步骤/ }).click();
    await other.getByRole('button', { name: '确认应用修订' }).click();
    await expect(other.getByRole('region', { name: '修订决定' })).toBeVisible();
    await expect(review.getByRole('button', { name: '确认应用修订' })).toBeDisabled();
    await expect(review.getByLabel('补充说明（选填）', { exact: true })).toHaveValue('尚未完成的审阅草稿');
    await review.getByRole('button', { name: '核对最新变更并继续' }).click();
    await expect(review.getByRole('button', { name: '确认应用修订' })).toBeDisabled();
    await review.getByLabel('退回补充', { exact: true }).check();
    await expect(review.getByRole('button', { name: '确认退回补充' })).toBeDisabled();
    await review.getByLabel('退回原因（必填）', { exact: true }).fill('请基于最新版本重新提交。');
    await review.getByRole('button', { name: '确认退回补充' }).click();
    await expect(review.getByRole('region', { name: '修订决定' })).toContainText('已退回');
    const current = (await (await page.request.get('/api/boards')).json() as Board[]).find(item => item.project.id === f.board.project.id);
    expect(current?.issues[0]?.version).toBe(2);
    expect(current?.changes.find(c => c.id === a.id)?.status).toBe('approved');
    expect(current?.changes.find(c => c.id === b.id)?.status).toBe('returned');
  } finally { await other.close(); }
});
