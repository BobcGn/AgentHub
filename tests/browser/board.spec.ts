import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectInput, proposalInput } from '../fixtures.js';
import type { Board } from '../../src/domain/board.js';
const exec = promisify(execFile);

test('浏览器创建 Intent → 发放范围 → 真实 CLI 提案 → 人工批准 → 正式清单', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?view=legacy');
  await page.getByLabel('人端密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '进入工作区 →' }).click();
  await page.getByRole('button', { name: '建立第一个项目 →' }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('筛选体验演示');
  await page.getByLabel('Intent 标题', { exact: true }).fill('让筛选结果符合用户预期');
  await page.getByLabel('要解决的源头问题', { exact: true }).fill('切换条件后结果没有更新，用户无法确认当前筛选生效。');
  await page.getByLabel('预期结果', { exact: true }).fill('筛选条件与展示结果始终一致。');
  await page.getByLabel('如何验证与原意图相符', { exact: true }).fill('实际切换条件并核对结果与条件一致。');
  await page.getByRole('button', { name: '确认初始意图并建立' }).click();
  await expect(page.getByRole('heading', { name: '让筛选结果符合用户预期' })).toBeVisible();
  await page.getByRole('button', { name: '管理工具范围 ↗' }).click();
  await page.getByLabel('工具来源名称', { exact: true }).fill('外部 Codex 演示');
  await page.getByRole('button', { name: '发放工具令牌' }).click();
  const token = await page.locator('.credential code').innerText();
  const boards = await (await page.request.get('/api/boards')).json() as Board[];
  const board = boards[0]; expect(board).toBeTruthy();
  if (!board) throw new Error('项目未创建');
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-e2e-'));
  try {
    const file = join(dir, 'proposal.json'); writeFileSync(file, JSON.stringify(proposalInput));
    await exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'propose', '--server', 'http://127.0.0.1:4318',
      '--project', board.project.id, '--file', file, '--request-id', 'browser-proposal-1'],
      { env: { ...process.env, AGENTHUB_TOKEN: token } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  await page.getByRole('button', { name: '已保存，隐藏令牌' }).click();
  await page.getByRole('button', { name: '管理工具范围 ↗' }).click();
  await expect(page.getByRole('status', { name: '自动同步状态' })).toHaveText('自动同步已连接');
  await page.getByRole('button', { name: /正式 Issue/ }).click();
  await expect(page.getByText('还没有正式 Issue。')).toBeVisible();
  await page.getByRole('navigation', { name: '工作区视图' }).getByRole('button', { name: /提案与决定/ }).click();
  await page.getByRole('button', { name: /待你决定.*修复筛选条件/ }).click();
  await expect(page.getByRole('region', { name: '提案审阅' }).getByText('这是保持筛选语义一致的最小独立交付单元。', { exact: true })).toBeVisible();
  await expect(page.getByText(proposalInput.risks, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '确认批准纳入' })).toBeEnabled();
  await page.getByLabel('补充说明（选填）', { exact: true }).fill('已理解收益与竞态风险，验证方式可追溯到 Intent，同意纳入计划。');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/b1-review.png', fullPage: true });
  await page.getByRole('button', { name: '确认批准纳入' }).click();
  await expect(page.getByText('已批准并纳入正式清单。尚未执行或验收。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /正式 Issue/ }).click();
  await expect(page.getByRole('heading', { name: proposalInput.title })).toBeVisible();
  await expect(page.getByText('已计划 · 尚未执行', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '让筛选结果符合用户预期' })).toBeVisible();
  await page.screenshot({ path: 'test-results/b1-overview.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/b1-mobile.png', fullPage: true });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(horizontalOverflow).toBe(false);
  expect(errors).toEqual([]);
});

test('保存失败保留输入；读取失败有明确提示', async ({ page }) => {
  await page.goto('/?view=legacy');
  await page.getByLabel('人端密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '进入工作区 →' }).click();
  await page.getByRole('button', { name: '新建项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('失败后保留');
  await page.getByLabel('Intent 标题', { exact: true }).fill('保存草稿');
  await page.getByLabel('要解决的源头问题', { exact: true }).fill('保存失败不能丢失输入。');
  await page.getByLabel('预期结果', { exact: true }).fill('保留输入。');
  await page.getByLabel('如何验证与原意图相符', { exact: true }).fill('模拟服务失败后检查文本。');
  await page.route('**/api/projects', route => route.fulfill({ status: 500, contentType: 'application/json',
    body: JSON.stringify({ error: { message: '模拟保存失败' } }) }));
  await page.getByRole('button', { name: '确认初始意图并建立' }).click();
  await expect(page.getByRole('dialog').getByText('模拟保存失败')).toBeVisible();
  await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('失败后保留');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.route('**/api/boards', route => route.fulfill({ status: 500, contentType: 'application/json',
    body: JSON.stringify({ error: { message: '模拟读取失败' } }) }));
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('模拟读取失败');
});

async function openPendingProposal(page: Page): Promise<Board> {
  await page.goto('/?view=legacy');
  await page.getByLabel('人端密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '进入工作区 →' }).click();
  await expect(page.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
  const origin = new URL(page.url()).origin;
  const name = '决定说明-' + crypto.randomUUID().slice(0, 8);
  const created = await page.request.post('/api/projects', { headers: { Origin: origin, 'Idempotency-Key': crypto.randomUUID() },
    data: { ...projectInput, name } });
  expect(created.status()).toBe(201);
  const board = await created.json() as Board;
  const issued = await page.request.post('/api/projects/' + board.project.id + '/scopes', {
    headers: { Origin: origin }, data: { label: '决定说明演示' } });
  expect(issued.status()).toBe(201);
  const credential = await issued.json() as { token: string };
  const proposed = await page.request.post('/api/projects/' + board.project.id + '/proposals', {
    headers: { Origin: origin, Authorization: 'Bearer ' + credential.token, 'Idempotency-Key': crypto.randomUUID() },
    data: proposalInput });
  expect(proposed.status()).toBe(201);
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByRole('navigation', { name: '工作区视图' }).getByRole('button', { name: /提案与决定/ }).click();
  await page.getByRole('button', { name: /待你决定.*修复筛选条件/ }).click();
  return board;
}

test('批准无需填写补充说明，决定记录明确未补充且正式清单纳入', async ({ page }) => {
  const board = await openPendingProposal(page);
  await expect(page.getByLabel('补充说明（选填）', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '确认批准纳入' })).toBeEnabled();
  await page.getByLabel('退回补充', { exact: true }).check();
  await expect(page.getByRole('button', { name: '确认退回补充' })).toBeDisabled();
  await page.getByLabel('批准纳入', { exact: true }).check();
  await page.getByLabel('补充说明（选填）', { exact: true }).fill('   ');
  await expect(page.getByRole('button', { name: '确认批准纳入' })).toBeEnabled();
  await page.getByRole('button', { name: '确认批准纳入' }).click();
  await expect(page.getByText('未补充说明', { exact: true })).toBeVisible();
  const boards = await (await page.request.get('/api/boards')).json() as Board[];
  const saved = boards.find(b => b.project.id === board.project.id);
  expect(saved?.decisions[0]?.reason).toBeNull();
  expect(saved?.issues).toHaveLength(1);
  await page.locator('.decision-record').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/b1-approve-without-note.png', fullPage: true });
});

for (const action of ['return', 'reject'] as const) {
  const label = action === 'return' ? '退回补充' : '拒绝';
  const reasonLabel = action === 'return' ? '退回原因（必填）' : '拒绝原因（必填）';
  test(label + '必须填写理由，切换决定保留各自草稿，保存后不纳入计划', async ({ page }) => {
    const board = await openPendingProposal(page);
    await page.getByLabel('补充说明（选填）', { exact: true }).fill('批准补充说明草稿');
    await page.getByLabel(label, { exact: true }).check();
    await expect(page.getByLabel(reasonLabel, { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: '确认' + label })).toBeDisabled();
    await page.getByLabel(reasonLabel, { exact: true }).fill('   ');
    await expect(page.getByRole('button', { name: '确认' + label })).toBeDisabled();
    const reason = action === 'return' ? '请补充竞态处理方案和可执行的验证步骤。' : '本单元不符合本次交付边界。';
    await page.getByLabel(reasonLabel, { exact: true }).fill(reason);
    await page.getByLabel('批准纳入', { exact: true }).check();
    await expect(page.getByLabel('补充说明（选填）', { exact: true })).toHaveValue('批准补充说明草稿');
    await page.getByLabel(label, { exact: true }).check();
    await expect(page.getByLabel(reasonLabel, { exact: true })).toHaveValue(reason);
    if (action === 'return') {
      await page.getByLabel(reasonLabel, { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'test-results/b1-return-reason-required.png', fullPage: true });
    }
    await page.getByRole('button', { name: '确认' + label }).click();
    await expect(page.locator('.decision-record')).toContainText(reason);
    const boards = await (await page.request.get('/api/boards')).json() as Board[];
    const saved = boards.find(b => b.project.id === board.project.id);
    expect(saved?.issues).toHaveLength(0);
    expect(saved?.decisions[0]?.action).toBe(action);
    expect(saved?.decisions[0]?.reason).toBe(reason);
  });
}

test('CLI 新增提案自动更新概览和清单，保留当前审阅草稿', async ({ page }) => {
  const board = await openPendingProposal(page);
  await expect(page.getByRole('status', { name: '自动同步状态' })).toHaveText('自动同步已连接');
  const draft = '正在核对方案，尚未提交的补充说明。';
  await page.getByLabel('补充说明（选填）', { exact: true }).fill(draft);
  const origin = new URL(page.url()).origin;
  const issued = await page.request.post('/api/projects/' + board.project.id + '/scopes', {
    headers: { Origin: origin }, data: { label: '自动同步 CLI' } });
  const { token } = await issued.json() as { token: string };
  const dir = mkdtempSync(join(tmpdir(), 'agenthub-sync-'));
  const title = '外部 CLI 新增的交付单元';
  try {
    const file = join(dir, 'proposal.json'); writeFileSync(file, JSON.stringify({ ...proposalInput, title }));
    await exec(process.execPath, ['--import', 'tsx', 'src/presentation/cli.ts', 'propose', '--server', origin,
      '--project', board.project.id, '--file', file, '--request-id', crypto.randomUUID()],
      { env: { ...process.env, AGENTHUB_TOKEN: token } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // No refresh click or page reload after the external CLI write.
  await expect(page.getByRole('button', { name: new RegExp('待你决定.*' + title) })).toBeVisible();
  await expect(page.getByLabel('补充说明（选填）', { exact: true })).toHaveValue(draft);
  await expect(page.getByRole('button', { name: '确认批准纳入' })).toBeEnabled();
  const tabs = page.getByRole('navigation', { name: '工作区视图' });
  await expect(tabs.getByRole('button', { name: /提案与决定/ })).toContainText('2');
  await tabs.getByRole('button', { name: '意图概览', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2 个建议等待审阅' })).toBeVisible();
});

test('另一窗口改变计划后自动更新且保留草稿，旧审阅须重新核对才能提交', async ({ page }) => {
  const board = await openPendingProposal(page);
  await page.getByLabel('补充说明（选填）', { exact: true }).fill('这个窗口尚未完成的审阅说明。');
  const origin = new URL(page.url()).origin;
  const issued = await page.request.post('/api/projects/' + board.project.id + '/scopes', {
    headers: { Origin: origin }, data: { label: '另一窗口' } });
  const { token } = await issued.json() as { token: string };
  const proposed = await page.request.post('/api/projects/' + board.project.id + '/proposals', {
    headers: { Origin: origin, Authorization: 'Bearer ' + token, 'Idempotency-Key': crypto.randomUUID() },
    data: { ...proposalInput, title: '另一窗口批准的提案' } });
  const proposal = await proposed.json() as { id: string };
  const other = await page.context().newPage();
  try {
    await other.goto('/?view=legacy');
    await expect(other.getByRole('button', { name: '新建项目', exact: true })).toBeVisible();
    await other.getByRole('button', { name: new RegExp(board.project.name) }).click();
    await other.getByRole('navigation', { name: '工作区视图' }).getByRole('button', { name: /提案与决定/ }).click();
    await other.getByRole('button', { name: /待你决定.*另一窗口批准的提案/ }).click();
    await other.getByRole('button', { name: '确认批准纳入' }).click();
    await expect(other.getByText('已批准并纳入正式清单。尚未执行或验收。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '核对最新内容并继续' })).toBeVisible();
    await expect(page.getByRole('button', { name: '确认批准纳入' })).toBeDisabled();
    await expect(page.getByLabel('补充说明（选填）', { exact: true })).toHaveValue('这个窗口尚未完成的审阅说明。');
    const boards = await (await page.request.get('/api/boards')).json() as Board[];
    expect(boards.find(b => b.project.id === board.project.id)?.issues[0]?.sourceProposalId).toBe(proposal.id);
    await page.getByRole('button', { name: '核对最新内容并继续' }).click();
    await page.getByRole('button', { name: '确认批准纳入' }).click();
    await expect(page.getByText('已批准并纳入正式清单。尚未执行或验收。', { exact: true })).toBeVisible();
    const saved = await (await page.request.get('/api/boards')).json() as Board[];
    expect(saved.find(b => b.project.id === board.project.id)?.issues).toHaveLength(2);
  } finally { await other.close(); }
});

test('连接中断明确提示，恢复后自动补读断线期间的新内容', async ({ page, context }) => {
  const board = await openPendingProposal(page);
  await expect(page.getByRole('status', { name: '自动同步状态' })).toHaveText('自动同步已连接');
  const origin = new URL(page.url()).origin;
  const issued = await page.request.post('/api/projects/' + board.project.id + '/scopes', {
    headers: { Origin: origin }, data: { label: '断线补读' } });
  const { token } = await issued.json() as { token: string };
  await context.setOffline(true);
  try {
    await expect(page.getByRole('status', { name: '自动同步状态' })).toContainText('自动同步已断开');
    // Node-side request remains online while the browser network is offline.
    const response = await fetch(origin + '/api/projects/' + board.project.id + '/proposals', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ ...proposalInput, title: '断线期间的新建议' }) });
    expect(response.status).toBe(201);
  } finally { await context.setOffline(false); }
  await expect(page.getByRole('status', { name: '自动同步状态' })).toHaveText('自动同步已连接', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /待你决定.*断线期间的新建议/ })).toBeVisible();
});

test('自动读取暂时失败保留旧内容并显示错误，恢复后无需新通知即可重试更新', async ({ page }) => {
  const board = await openPendingProposal(page);
  await page.getByLabel('补充说明（选填）', { exact: true }).fill('读取失败也必须保留的说明。');
  const origin = new URL(page.url()).origin;
  const issued = await page.request.post('/api/projects/' + board.project.id + '/scopes', {
    headers: { Origin: origin }, data: { label: '自动读取恢复' } });
  const { token } = await issued.json() as { token: string };
  let unavailable = true;
  await page.route('**/api/boards', route => unavailable
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: '临时读取不可用' } }) })
    : route.continue());
  const response = await page.request.post('/api/projects/' + board.project.id + '/proposals', {
    headers: { Origin: origin, Authorization: 'Bearer ' + token, 'Idempotency-Key': crypto.randomUUID() },
    data: { ...proposalInput, title: '读取恢复后出现的新建议' } });
  expect(response.status()).toBe(201);
  await expect(page.getByRole('alert')).toContainText('临时读取不可用');
  await expect(page.getByLabel('补充说明（选填）', { exact: true })).toHaveValue('读取失败也必须保留的说明。');
  unavailable = false;
  await expect(page.getByRole('button', { name: /待你决定.*读取恢复后出现的新建议/ })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
