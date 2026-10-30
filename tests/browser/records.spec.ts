import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Board, Proposal, Issue } from '../../src/domain/board.js';
import { projectInput, proposalInput } from '../fixtures.js';
const exec = promisify(execFile);

async function seed(page: Page) {
  await page.goto('/?view=legacy');
  await page.getByLabel('人端密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '进入工作区 →' }).click();
  await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
  const origin = new URL(page.url()).origin;
  const name = 'B2-' + crypto.randomUUID().slice(0, 8);
  const headers = { Origin: origin };
  const created = await page.request.post('/api/projects', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { ...projectInput, name }
  });
  expect(created.status()).toBe(201);
  const board = await created.json() as Board;
  const base = '/api/projects/' + board.project.id;
  const issued = await page.request.post(base + '/scopes', { headers, data: { label: '提案工具' } });
  const { token } = await issued.json() as { token: string };
  async function add(title: string, parentIssueId: string | null, planVersion: number): Promise<Issue> {
    const response = await page.request.post(base + '/proposals', {
      headers: { ...headers, Authorization: 'Bearer ' + token, 'Idempotency-Key': crypto.randomUUID() },
      data: { ...proposalInput, title, parentIssueId }
    });
    expect(response.status()).toBe(201);
    const proposal = await response.json() as Proposal;
    const decided = await page.request.post(base + '/proposals/' + proposal.id + '/decisions', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: { action: 'approve', reason: '已核对边界与验证方式。', proposalVersion: 1, intentVersion: 1, planVersion }
    });
    expect(decided.status()).toBe(200);
    return (await decided.json() as { issue: Issue }).issue;
  }
  const parent = await add('父单元：筛选结果更新', null, 1);
  const child = await add('子单元：快速切换竞态', parent.id, 2);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  return { board, parent, child, origin };
}

test('明确发放记录范围；真实 CLI 报告自动同步且保留人端草稿', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const f = await seed(page);
  await page.getByRole('button', { name: '管理工具范围 ↗' }).click();
  await page.getByLabel('工具来源名称', { exact: true }).fill('B2 限定报告者');
  await page.getByLabel('允许追加普通记录', { exact: true }).check();
  await expect(page.getByRole('button', { name: '发放工具令牌' })).toBeDisabled();
  await page.getByLabel('Issue：' + f.parent.title, { exact: true }).check();
  await page.getByLabel('Agent 报告', { exact: true }).check();
  await page.getByRole('button', { name: '发放工具令牌' }).click();
  const token = await page.locator('.credential code').innerText();
  await page.getByRole('button', { name: '已保存，隐藏令牌' }).click();
  await page.getByRole('button', { name: '管理工具范围 ↗' }).click();
  const tabs = page.getByRole('navigation', { name: '工作区视图' });
  await tabs.getByRole('button', { name: /正式 Issue/ }).click();
  await page.getByRole('region', { name: '正式交付清单' }).getByRole('button', { name: new RegExp('^' + f.parent.title) }).click();
  const panel = page.getByRole('region', { name: 'Issue 记录' });
  await panel.getByLabel('记录内容', { exact: true }).fill('尚未保存的人端判断。');
  await expect(page.getByRole('status', { name: '自动同步状态' })).toHaveText('自动同步已连接');
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-b2-browser-'));
  try {
    const env = { ...process.env, AGENTHUB_TOKEN: token };
    const access = JSON.parse((await exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'scope', '--server', f.origin], { env })).stdout) as { scope: { recordScope: unknown } };
    expect(access.scope.recordScope).toEqual({ intent: false, issueIds: [f.parent.id], kinds: ['agent_report'] });
    const path = join(dir, 'record.json');
    writeFileSync(path, JSON.stringify({ kind: 'agent_report', body: '外部 Agent 声称已检查竞态，仍需实际运行核验。',
      issueId: f.parent.id, intentVersion: 1, sourceRef: 'Codex 外部对话 #B2' }));
    await exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'record', '--server', f.origin,
      '--project', f.board.project.id, '--file', path, '--request-id', crypto.randomUUID()], { env });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  await expect(panel.locator('.record-body')).toHaveText('外部 Agent 声称已检查竞态，仍需实际运行核验。');
  await expect(panel.getByLabel('记录内容', { exact: true })).toHaveValue('尚未保存的人端判断。');
  await expect(panel).toContainText('工具写入 · B2 限定报告者');
  await expect(panel).toContainText('Agent 报告 · 未经实际运行核验');
  await expect(panel).toContainText('Codex 外部对话 #B2');
  const current = (await (await page.request.get('/api/boards')).json() as Board[]).find(b => b.project.id === f.board.project.id);
  expect(current?.planVersion).toBe(3);
  expect(current?.issues).toHaveLength(2);
  await page.screenshot({ path: 'test-results/b2-issue-records.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('记录失败保留草稿，切换对象分别保存；人端来源与原文重载可查', async ({ page }) => {
  const f = await seed(page);
  const tabs = page.getByRole('navigation', { name: '工作区视图' });
  await tabs.getByRole('button', { name: /讨论与记录/ }).click();
  await page.getByLabel('记录对象', { exact: true }).selectOption('');
  const panel = page.getByRole('region', { name: 'Intent 记录' });
  await panel.getByLabel('记录类型', { exact: true }).selectOption('note');
  await panel.getByLabel('记录内容', { exact: true }).fill('先记录理解，再决定后续方案。');
  await panel.getByLabel('外部来源（选填）', { exact: true }).fill('手动讨论 #B2');
  await page.route('**/api/projects/*/records', route => route.fulfill({ status: 500, contentType: 'application/json',
    body: JSON.stringify({ error: { message: '模拟记录失败' } }) }));
  await panel.getByRole('button', { name: '追加记录' }).click();
  await expect(page.getByRole('alert')).toContainText('模拟记录失败');
  await expect(panel.getByLabel('记录内容', { exact: true })).toHaveValue('先记录理解，再决定后续方案。');
  await page.getByLabel('记录对象', { exact: true }).selectOption(f.child.id);
  await page.getByRole('region', { name: 'Issue 记录' }).getByLabel('记录内容', { exact: true }).fill('子单元草稿');
  await tabs.getByRole('button', { name: '意图概览', exact: true }).click();
  await tabs.getByRole('button', { name: /讨论与记录/ }).click();
  await page.getByLabel('记录对象', { exact: true }).selectOption('');
  await expect(panel.getByLabel('记录内容', { exact: true })).toHaveValue('先记录理解，再决定后续方案。');
  await page.unroute('**/api/projects/*/records');
  await panel.getByRole('button', { name: '追加记录' }).click();
  await expect(panel.locator('.record-body')).toHaveText('先记录理解，再决定后续方案。');
  await expect(panel).toContainText('人端记录 · 人端');
  await expect(panel).toContainText('普通备注 · 不改变正式计划');
  await expect(panel.getByLabel('记录内容', { exact: true })).toHaveValue('');
  await page.reload();
  await page.getByRole('button', { name: new RegExp(f.board.project.name) }).click();
  await tabs.getByRole('button', { name: /讨论与记录/ }).click();
  await expect(page.locator('.records-feed')).toContainText('先记录理解，再决定后续方案。');
});

test('父子单元追溯原意图、方案和决定；窄屏详情无横向溢出', async ({ page }) => {
  const f = await seed(page);
  const tabs = page.getByRole('navigation', { name: '工作区视图' });
  await tabs.getByRole('button', { name: /正式 Issue/ }).click();
  const nav = page.getByRole('region', { name: '正式交付清单' });
  await nav.getByRole('button', { name: new RegExp(f.child.title) }).click();
  const detail = page.getByRole('article', { name: 'Issue 详情' });
  await expect(detail.getByRole('heading', { name: f.child.title })).toBeVisible();
  await expect(detail).toContainText(proposalInput.verification);
  await expect(detail).toContainText(proposalInput.risks);
  await expect(detail).toContainText('已批准方案');
  await expect(detail.getByRole('region', { name: '方案决定' })).toContainText('已核对边界与验证方式。');
  await detail.getByRole('button', { name: new RegExp('父 Issue：' + f.parent.title) }).click();
  await expect(detail.getByRole('heading', { name: f.parent.title })).toBeVisible();
  await detail.getByRole('button', { name: f.child.title + ' ↗', exact: true }).click();
  await detail.getByRole('button', { name: '查看原始提案与决定 ↗' }).click();
  await expect(page.getByRole('region', { name: '提案审阅' }).getByRole('heading', { name: f.child.title })).toBeVisible();
  await tabs.getByRole('button', { name: /正式 Issue/ }).click();
  await detail.getByRole('button', { name: new RegExp('关联 Intent：') }).click();
  await expect(page.getByRole('heading', { name: projectInput.title })).toBeVisible();
  await tabs.getByRole('button', { name: /正式 Issue/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(detail.getByRole('heading', { name: f.child.title })).toBeVisible();
  await page.screenshot({ path: 'test-results/b2-mobile-issue.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
