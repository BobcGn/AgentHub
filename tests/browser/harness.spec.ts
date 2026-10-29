import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { RecordProject } from '../../src/domain/record-project.js';
const headers = () => ({ Origin: 'http://127.0.0.1:4318', 'Idempotency-Key': crypto.randomUUID() });
async function setup(page: Page) {
  await page.goto('/'); await page.getByLabel('人端密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '进入工作区 →' }).click();
  await expect(page.getByRole('button', { name: '新建/导入项目', exact: true })).toBeVisible();
  const name = 'AgentHub 自测试用 ' + crypto.randomUUID().slice(0,8);
  const response = await page.request.post('/api/record-projects', { headers: headers(), data: { name,
    title: 'AgentHub 从记录继承进度', problem: '运行过程和跨会话进度不可见', expectedOutcome: '关键内容经过人端核对后进入长期记录',
    includes: ['脚本化运行与候选'], excludes: ['真实模型与代码执行'], constraints: ['演示不是用户验收'], confirmed: true } });
  expect(response.status()).toBe(201);
  const initial = await response.json() as RecordProject;
  const saved = await page.request.post('/api/record-projects/' + initial.id + '/records', { headers: headers(), data: {
    baseRevision: initial.revision, collection: 'requirements', id: null, reason: '隔离的 AgentHub 自测需求', confirmed: true,
    record: { id: 'REQ-HARNESS', kind: 'requirement', intentId: initial.records.intent.id, title: '跨会话继承 AgentHub 进度',
      problem: '会话重建时不能依赖聊天印象', expectedOutcome: '从正式记录恢复待核对信息', scope: { includes: ['单需求记录'], excludes: ['自动验收'] },
      constraints: [], rationale: '先验证记录和运行闭环', expectedImpact: '减少遗漏', acceptanceCriteria: [], sourceRefs: [],
      status: 'draft', result: null, acceptance: null, pullRequest: null } } });
  expect(saved.status()).toBe(200);
  await page.reload(); await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: '跨会话继承 AgentHub 进度' }) }).click();
  return { id: initial.id, name };
}
async function start(page: Page, instruction = '需要验证跨会话继承行为') {
  const panel = page.getByRole('region', { name: '需求运行' });
  await panel.getByLabel('本轮问题', { exact: true }).fill(instruction);
  await panel.getByLabel('我确认只读取当前意图和本需求的适用记录，生成待核对信息').check();
  await panel.getByRole('button', { name: '开始本轮运行', exact: true }).click();
  await expect(panel.getByRole('heading', { name: '等待你判断', exact: true })).toBeVisible();
  return panel;
}
test('AgentHub 自测 UI：候选可保留、重载后人端应用、新运行继承长期 JSON', async ({ page }) => {
  const project = await setup(page), panel = await start(page);
  await panel.getByRole('button', { name: '保留候选，本轮结束' }).click();
  await expect(panel.getByRole('heading', { name: '本轮已结束' })).toBeVisible();
  await page.reload(); await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: project.name }).click();
  await page.getByRole('button').filter({ has: page.getByRole('heading', { name: '跨会话继承 AgentHub 进度' }) }).click();
  const restored = page.getByRole('region', { name: '需求运行' });
  await expect(restored.getByRole('heading', { name: '本轮已结束' })).toBeVisible();
  await restored.getByRole('button', { name: '预览保存到长期记录' }).click();
  await expect(restored.getByRole('button', { name: '确认保存候选', exact: true })).toBeDisabled();
  await restored.getByLabel('我已核对差异，确认保存这条待核对信息').check();
  await restored.getByRole('button', { name: '确认保存候选', exact: true }).click();
  await expect(restored.getByText(/已保存到项目修订/)).toBeVisible();
  const next = await start(page, '继续检查已经保存的未知');
  await next.getByText('查看输入依据与已继承的记录', { exact: true }).click();
  await expect(next.locator('li').filter({ hasText: '需要验证跨会话继承行为' })).toBeVisible();
  await page.screenshot({ path: 'test-results/harness-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/harness-narrow.png', fullPage: true });
  const data = await (await page.request.get('/api/record-projects/' + project.id)).json() as RecordProject;
  expect(data.records.contextItems).toHaveLength(1); expect(data.records.requirements[0]?.status).toBe('draft');
});
test('UI：项目变化使候选保存预览失效，输入草稿保留', async ({ page }) => {
  const project = await setup(page), panel = await start(page);
  await panel.getByRole('button', { name: '预览保存到长期记录' }).click();
  await panel.getByLabel('我已核对差异，确认保存这条待核对信息').check();
  await panel.getByLabel('本轮问题', { exact: true }).fill('未提交的下一轮草稿');
  const current = await (await page.request.get('/api/record-projects/' + project.id)).json() as RecordProject;
  const requirement = current.records.requirements[0]; if (!requirement) throw new Error('缺少测试需求');
  const result = await page.request.post('/api/record-projects/' + project.id + '/records', { headers: headers(), data: {
    baseRevision: current.revision, collection: 'requirements', id: requirement.id, record: { ...requirement, rationale: '新修订需要重新核对' },
    reason: '测试并发修订', confirmed: true } });
  expect(result.status()).toBe(200);
  await expect(panel.getByText('项目已变化，旧候选不自动适配当前内容。')).toBeVisible();
  await expect(panel.getByRole('button', { name: '确认保存候选', exact: true })).toBeDisabled();
  await expect(panel.getByLabel('本轮问题', { exact: true })).toHaveValue('未提交的下一轮草稿');
});
test('UI：取消撤销运行授权，刷新仍显示取消且不修改正式记录', async ({ page }) => {
  const project = await setup(page), panel = await start(page);
  await panel.getByRole('button', { name: '取消并撤销本次运行授权' }).click();
  await expect(panel.getByRole('heading', { name: '已取消', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: '刷新运行' }).click();
  await expect(panel.getByRole('button', { name: '预览保存到长期记录' })).toHaveCount(0);
  const data = await (await page.request.get('/api/record-projects/' + project.id)).json() as RecordProject;
  expect(data.records.contextItems).toHaveLength(0);
});
