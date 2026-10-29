import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { RecordProject } from '../../src/domain/record-project.js';
import type { Board, Proposal } from '../../src/domain/board.js';
import { projectInput, proposalInput } from '../fixtures.js';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('人端密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '进入工作区 →' }).click();
  await expect(page.getByRole('button', { name: '新建/导入项目', exact: true })).toBeVisible();
}
const headers = () => ({ Origin: 'http://127.0.0.1:4318', 'Idempotency-Key': crypto.randomUUID() });
async function create(page: Page, name: string): Promise<RecordProject> {
  const response = await page.request.post('/api/record-projects', { headers: headers(), data: {
    name, title: '记录与实际产出保持一致', problem: '拆解与证据缺少对应关系。', expectedOutcome: '每项拆解都有边界与可核对的证据。',
    includes: ['本地记录与看板'], excludes: ['执行模型'], constraints: [], confirmed: true
  } });
  expect(response.status()).toBe(201);
  const project = await response.json() as RecordProject;
  await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name }).click();
  return project;
}
async function common(page: Page, title: string) {
  const editor = page.locator('dialog[open]').last();
  await editor.getByRole('textbox', { name: '标题', exact: true }).fill(title);
  await editor.getByRole('textbox', { name: '要解决的问题', exact: true }).fill('长时上下文与交付结果没有统一的结构。');
  await editor.getByRole('textbox', { name: '预期结果', exact: true }).fill('拆解、理由、影响与验收条件可以逐项核对。');
  await editor.getByRole('textbox', { name: '为什么这样做', exact: true }).fill('通过合同减少表达歧义。');
  await editor.getByRole('textbox', { name: '预期影响', exact: true }).fill('减少遗漏和误读。');
  await editor.getByRole('textbox', { name: '包含范围（每行一项）', exact: true }).fill('本地记录\n状态看板');
  await editor.getByRole('textbox', { name: '为什么进行这次变更', exact: true }).fill('已讨论对应的记录边界，现在明确记录。');
}
async function save(page: Page) {
  const editor = page.locator('dialog[open]').last();
  const label = await editor.getAttribute('aria-label');
  if (!label) throw new Error('编辑器缺少名称');
  await editor.getByRole('button', { name: '检查并预览差异' }).click();
  await expect(editor.getByRole('heading', { name: '核对本次变更' })).toBeVisible();
  await expect(editor.getByRole('button', { name: '确认保存到项目' })).toBeDisabled();
  await editor.getByLabel('我已核对内容、影响和变更理由，确认保存').check();
  await expect(editor.getByRole('button', { name: '确认保存到项目' })).toBeEnabled();
  await editor.getByRole('button', { name: '确认保存到项目' }).click();
  await expect(page.getByRole('dialog', { name: label, exact: true })).toBeHidden();
}

async function saveIntentDraft(page: Page) {
  const dialog = page.getByRole('dialog', { name: '完善意图草稿', exact: true });
  await dialog.getByRole('button', { name: '检查并预览草稿', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '核对意图草稿变更' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '保存意图草稿', exact: true })).toBeDisabled();
  await dialog.getByLabel('我已核对差异，保存为未确认草稿').check();
  await dialog.getByRole('button', { name: '保存意图草稿', exact: true }).click();
  await expect(dialog).toBeHidden();
}
async function confirmIntent(page: Page) {
  await page.getByRole('button', { name: '核对并确认意图', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '核对并确认意图', exact: true });
  await dialog.getByLabel('已完成的商讨与核对结论', { exact: true }).fill('测试人端已核对目标、范围与约束。');
  await dialog.getByLabel('商讨出处', { exact: true }).fill('test:browser-discussion');
  await dialog.getByLabel('我已商讨并核对当前意图表示，明确确认').check();
  await dialog.getByRole('button', { name: '确认当前意图表示', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('正式首页：建立意图、Requirement 状态看板与按需分层编辑，刷新后保存一致', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.getByRole('button', { name: '新建/导入项目', exact: true }).click();
  const creation = page.getByRole('dialog', { name: '新建/导入项目', exact: true });
  const name = 'JSON 合同试用-' + crypto.randomUUID().slice(0, 6);
  await creation.getByLabel('项目名称', { exact: true }).fill(name);
  await creation.getByLabel('项目标记（选填）', { exact: true }).fill('AGENTHUB');
  await expect(creation.getByRole('status', { name: '需求标识预览' })).toHaveText('需求标识预览：AGENTHUB-1');
  await creation.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(creation).toBeHidden();
  await expect(page.getByRole('button', { name: '核对并确认意图', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '完善意图', exact: true }).click();
  const draft = page.getByRole('dialog', { name: '完善意图草稿', exact: true });
  for (const [label,value] of [['意图标题','建立可信赖的结构化记录'],['源头问题','记录和实际交付缺少对应关系。'],
    ['意图预期结果','按需求核对拆解与证据。'],['意图包含范围（每行一项）','记录合同\n本地看板']] as const) {
    await draft.getByLabel(label, { exact: true }).fill(value);
  }
  await saveIntentDraft(page);
  await confirmIntent(page);
  await page.getByRole('button', { name: '新增 Requirement', exact: true }).click();
  await common(page, '让 JSON 合同在看板中可见');
  let editor = page.getByRole('dialog', { name: '新增Requirement', exact: true });
  await editor.getByRole('button', { name: '添加验收条件' }).click();
  await editor.getByLabel('条件 1', { exact: true }).fill('只展示 Requirement 卡片。');
  await editor.getByLabel('验证方式 1', { exact: true }).fill('检查卡片与详情对应的数据。');
  await editor.getByLabel('工作状态').selectOption('planned');
  const listBefore = await (await page.request.get('/api/record-projects')).json() as RecordProject[];
  const before = listBefore.find(p => p.name === name);
  expect(before?.records.requirements).toHaveLength(0);
  await save(page);
  const card = page.locator('.record-card').filter({ hasText: '让 JSON 合同在看板中可见' });
  await expect(page.getByRole('region', { name: '待开始', exact: true }).locator('.record-card')).toHaveCount(1);
  await card.click();
  const details = page.getByRole('dialog', { name: 'Requirement 详情', exact: true });
  await expect(details.getByText('本地记录', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: '新增 Unit', exact: true }).click();
  await common(page, '合同存储职责');
  await page.locator('dialog[open]').last().getByLabel('职责（每行一项）').fill('保存正式记录\n校验引用关系');
  await page.locator('dialog[open]').last().getByLabel('输出（每行一项）').fill('已校验的正式 JSON 快照');
  await save(page);
  await details.getByRole('button', { name: '新增 Story', exact: true }).click();
  await common(page, '用户能查看结构化内容');
  await page.locator('dialog[open]').last().getByLabel('用户价值').fill('理解每项修改的依据。');
  await page.locator('dialog[open]').last().getByLabel('所属 Unit（可不选）').selectOption({ label: '合同存储职责' });
  await save(page);
  await details.getByRole('button', { name: '新增 Bolt Plan', exact: true }).click();
  await common(page, '结构化看板交付计划');
  await page.locator('dialog[open]').last().getByLabel('安排的 Stories').selectOption({ label: '用户能查看结构化内容' });
  await page.locator('dialog[open]').last().getByLabel('退出条件（每行一项）').fill('记录持久化并通过合同校验。');
  await save(page);
  await expect(details.locator('.record-artifact')).toHaveCount(3);
  await details.locator('.record-artifact').first().locator('summary').click();
  await details.getByRole('button', { name: '编辑 Unit', exact: true }).click();
  const unitEditor = page.locator('dialog[open]').last();
  await unitEditor.getByRole('textbox', { name: '标题', exact: true }).fill('合同存储与引用校验');
  await unitEditor.getByRole('textbox', { name: '为什么进行这次变更', exact: true }).fill('明确职责包括引用校验，便于核对边界。');
  await save(page);
  await expect(details.locator('.record-artifact > summary').getByText('合同存储与引用校验', { exact: true })).toBeVisible();
  await details.screenshot({ path: 'test-results/record-unit-detail.png' });
  await details.evaluate(element => { element.scrollTop = 0; });
  await details.screenshot({ path: 'test-results/record-requirement-detail.png' });
  await details.getByRole('button', { name: '关闭Requirement 详情' }).click();
  await page.screenshot({ path: 'test-results/record-project-board.png', fullPage: true });
  await page.reload();
  await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name }).click();
  await expect(card).toBeVisible();
  await card.click();
  await expect(details.locator('.record-artifact')).toHaveCount(3);
  const saved = (await (await page.request.get('/api/record-projects')).json() as RecordProject[]).find(p => p.name === name);
  expect(saved?.records.stories[0]?.unitId).toBe(saved?.records.units[0]?.id);
  expect(saved?.records.boltPlans[0]?.storyIds).toEqual([saved?.records.stories[0]?.id]);
  expect(saved?.records.requirements[0]?.pullRequest).toBeNull();
  await details.getByRole('button', { name: '关闭Requirement 详情' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/record-project-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test('失败与自动同步：新内容自动显示，旧编辑草稿保留并要求重新核对', async ({ page }) => {
  await login(page);
  const name = '同步与冲突-' + crypto.randomUUID().slice(0,6);
  const project = await create(page, name);
  await expect(page.getByRole('status', { name: '自动同步状态' })).toHaveText('自动同步已连接');
  await page.getByRole('button', { name: '新增 Requirement', exact: true }).click();
  await common(page, '浏览器中尚未保存的草稿');
  const editor = page.locator('dialog[open]').last();
  const req = { id: crypto.randomUUID(), kind: 'requirement', intentId: project.records.intent.id, title: '另一入口保存的需求', problem: '外部写入需要同步。',
    expectedOutcome: '自动显示。', scope: { includes: ['同步'], excludes: [] }, rationale: '避免页面过期。', expectedImpact: '减少误判。',
    acceptanceCriteria: [], sourceRefs: [], status: 'draft', result: null, constraints: [], acceptance: null, pullRequest: null };
  const response = await page.request.post('/api/record-projects/' + project.id + '/records', { headers: headers(), data: {
    baseRevision: project.revision, collection: 'requirements', id: null, record: req, reason: '另一入口已核对。', confirmed: true
  } });
  expect(response.status()).toBe(200);
  await expect(editor.getByText('项目已更新，草稿已保留。请核对最新内容后再提交。', { exact: false })).toBeVisible();
  await expect(editor.getByRole('textbox', { name: '标题', exact: true })).toHaveValue('浏览器中尚未保存的草稿');
  await expect(editor.getByRole('button', { name: '检查并预览差异' })).toBeDisabled();
  await editor.getByRole('button', { name: '核对最新内容并保留草稿' }).click();
  await page.route('**/api/record-projects/*/records', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: '模拟写入失败' } }) }));
  await editor.getByRole('button', { name: '检查并预览差异' }).click();
  await editor.getByLabel('我已核对内容、影响和变更理由，确认保存').check();
  await editor.getByRole('button', { name: '确认保存到项目' }).click();
  await expect(editor.getByRole('alert')).toContainText('模拟写入失败');
  await editor.getByRole('button', { name: '返回修改' }).click();
  await expect(editor.getByRole('textbox', { name: '标题', exact: true })).toHaveValue('浏览器中尚未保存的草稿');
  await page.unroute('**/api/record-projects/*/records');
  await save(page);
  await expect(page.locator('.record-card')).toHaveCount(2);
  let reads = 0;
  await page.route('**/api/record-projects', route => {
    reads += 1;
    return reads === 1 ? route.fulfill({ status: 500, contentType: 'application/json',
      body: JSON.stringify({ error: { message: '模拟暂时读失败' } }) }) : route.continue();
  });
  await page.getByRole('button', { name: '刷新记录', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('模拟暂时读失败');
  await expect(page.locator('.record-card')).toHaveCount(2);
  await expect(page.getByRole('alert')).toBeHidden({ timeout: 7000 });
  expect(reads).toBeGreaterThan(1);

});

test('不完整需求不能凭按钮完成，合同错误可见且草稿仍可修改', async ({ page }) => {
  await login(page);
  await create(page, '完成条件-' + crypto.randomUUID().slice(0,6));
  await page.getByRole('button', { name: '新增 Requirement', exact: true }).click();
  await common(page, '尚无证据的需求');
  let editor = page.locator('dialog[open]').last();
  await editor.getByLabel('工作状态').selectOption('planned');
  await editor.getByRole('button', { name: '检查并预览差异' }).click();
  await expect(editor.getByRole('list', { name: '合同校验问题' })).toBeVisible();
  await expect(editor.getByRole('button', { name: '确认保存到项目' })).toBeDisabled();
  await editor.getByRole('button', { name: '返回修改' }).click();
  await editor.getByLabel('工作状态').selectOption('draft');
  await save(page);
  await page.locator('.record-card').click();
  await page.getByRole('button', { name: '确认整体接受', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Requirement 整体接受', exact: true });
  await editor.getByLabel('我已实际核对本需求的结果与证据，确认整体接受').check();
  await editor.getByRole('button', { name: '本人确认整体接受并标记完成' }).click();
  await expect(editor.getByRole('list', { name: '合同校验问题' })).toBeVisible();
  await editor.getByRole('button', { name: '返回核对', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Requirement 详情' }).getByText('尚无整体接受', { exact: true })).toBeVisible();
});

test('旧数据迁移预览不自动保存，确认后另存草案并保留旧批准与只读来源', async ({ page }) => {
  await login(page);
  const name = '迁移试用-' + crypto.randomUUID().slice(0,6);
  const created = await page.request.post('/api/projects', { headers: headers(), data: { ...projectInput, name } });
  const board = await created.json() as Board;
  const issued = await page.request.post('/api/projects/' + board.project.id + '/scopes', { headers: headers(), data: { label: '迁移测试工具' } });
  const token = (await issued.json() as { token: string }).token;
  const proposed = await page.request.post('/api/projects/' + board.project.id + '/proposals', { headers: { ...headers(), Authorization: 'Bearer ' + token }, data: proposalInput });
  const proposal = await proposed.json() as Proposal;
  const decided = await page.request.post('/api/projects/' + board.project.id + '/proposals/' + proposal.id + '/decisions', { headers: headers(),
    data: { intentVersion: board.intent.version, proposalVersion: proposal.version, planVersion: board.planVersion, action: 'approve', reason: null } });
  expect(decided.status()).toBe(200);
  await page.getByRole('button', { name: '查看迁移预览：' + name, exact: true }).click();
  const preview = page.getByRole('dialog', { name: '旧项目迁移预览', exact: true });
  await expect(preview).toContainText('将生成 1 个 Requirement 草案');
  expect((await (await page.request.get('/api/record-projects')).json() as RecordProject[]).some(p => p.id === board.project.id)).toBe(false);
  await expect(preview.getByRole('button', { name: '确认预览并迁移' })).toBeDisabled();
  await preview.getByLabel('已核对迁移预览，同意导入项目并保留旧记录').check();
  await preview.getByRole('button', { name: '确认预览并迁移' }).click();
  await expect(preview).toBeHidden();
  await expect(page.getByText('迁移后待核对', { exact: true })).toBeVisible();
  await page.locator('.record-card').filter({ hasText: proposalInput.title }).click();
  const details = page.getByRole('dialog', { name: 'Requirement 详情', exact: true });
  await expect(details.locator('.record-artifact')).toHaveCount(0);
  await expect(details.getByText('尚无整体接受', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: '查看迁移来源的原始记录（只读）' }).click();
  const original = page.getByRole('dialog', { name: '旧项目原始记录（只读）', exact: true });
  await expect(original).toContainText('"action": "approve"');
  const old = (await (await page.request.get('/api/boards')).json() as Board[]).find(b => b.project.id === board.project.id);
  expect(old?.issues).toHaveLength(1); expect(old?.decisions).toHaveLength(1);
  const frozen = await page.request.post('/api/projects/' + board.project.id + '/proposals', { headers: { ...headers(), Authorization: 'Bearer ' + token }, data: proposalInput });
  expect(frozen.status()).toBe(409);
  await original.getByRole('button', { name: '撤销旧令牌：迁移测试工具', exact: true }).click();
  await expect(original.getByText('已撤销', { exact: true })).toBeVisible();
  const revoked = await page.request.get('/api/boards', { headers: { Authorization: 'Bearer ' + token } });
  expect(revoked.status()).toBe(401);
});

test('仅名称创建：拼音标记、部分意图草稿跨刷新保留，未确认意图不能运行', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: '新建/导入项目', exact: true }).click();
  const creation = page.getByRole('dialog', { name: '新建/导入项目', exact: true });
  await expect(creation.getByRole('button', { name: '创建项目', exact: true })).toBeDisabled();
  await creation.getByLabel('项目名称', { exact: true }).fill('AgentHub');
  await expect(creation.getByRole('status', { name: '需求标识预览' })).toHaveText('需求标识预览：AGE-1');
  const name = '项目管理-' + crypto.randomUUID().slice(0,6);
  await creation.getByLabel('项目名称', { exact: true }).fill(name);
  await expect(creation.getByRole('status', { name: '需求标识预览' })).toHaveText('需求标识预览：XMG-1');
  await expect(creation.getByLabel('意图标题', { exact: true })).toHaveCount(0);
  await creation.screenshot({ path: 'test-results/project-creation-prefix.png' });
  await creation.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(creation).toBeHidden();
  await expect(page.getByText('意图草稿 · 尚未确认', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '核对并确认意图', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '完善意图', exact: true }).click();
  const draft = page.getByRole('dialog', { name: '完善意图草稿', exact: true });
  await draft.getByLabel('意图标题', { exact: true }).fill('当前仅明确目标，稍后继续讨论');
  await saveIntentDraft(page);
  await page.reload();
  await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.record-intent')).toContainText('当前仅明确目标，稍后继续讨论');
  await expect(page.getByRole('button', { name: '核对并确认意图', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '完善意图', exact: true }).click();
  await expect(draft.getByLabel('意图标题', { exact: true })).toHaveValue('当前仅明确目标，稍后继续讨论');
  await expect(draft.getByLabel('源头问题', { exact: true })).toHaveValue('');
  await draft.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '新增 Requirement', exact: true }).click();
  await common(page, '尚在澄清的需求草案');
  await save(page);
  const card = page.locator('.record-card').filter({ hasText: '尚在澄清的需求草案' });
  await expect(card.locator('.record-card-kind')).toContainText('XMG-1');
  await page.screenshot({ path: 'test-results/project-intent-draft-board.png', fullPage: true });
  await card.click();
  const panel = page.getByRole('region', { name: '需求运行', exact: true });
  await panel.getByLabel('本轮问题', { exact: true }).fill('此时不应运行');
  await panel.getByLabel('我确认只读取当前意图和本需求的适用记录，生成待核对信息').check();
  await expect(panel.getByRole('button', { name: '开始本轮运行', exact: true })).toBeDisabled();
  await expect(panel.getByText('请先完善并确认项目意图，再开始需求运行。', { exact: true })).toBeVisible();
});

test('意图草稿同步冲突保留输入；确认页面更新后必须重新核对', async ({ page }) => {
  await login(page);
  const response = await page.request.post('/api/record-projects', { headers: headers(), data: { name: '意图冲突-' + crypto.randomUUID().slice(0,6) } });
  expect(response.status()).toBe(201);
  const project = await response.json() as RecordProject;
  await page.getByRole('navigation', { name: '项目列表' }).getByRole('button', { name: project.name, exact: true }).click();
  await page.getByRole('button', { name: '完善意图', exact: true }).click();
  const draft = page.getByRole('dialog', { name: '完善意图草稿', exact: true });
  await draft.getByLabel('意图标题', { exact: true }).fill('保留本窗口的草稿');
  const base = '/api/record-projects/' + project.id;
  const external = await page.request.post(base + '/intent-draft', { headers: headers(), data: {
    baseRevision: project.revision, title: '另一窗口的草稿', problem: '上下文不透明', expectedOutcome: '可核对进度', includes: ['记录'], confirmed: true
  } });
  expect(external.status()).toBe(200);
  const saved = await external.json() as RecordProject;
  await expect(draft.getByText('项目已更新，草稿已保留。请核对最新意图后重新预览。', { exact: true })).toBeVisible();
  await expect(draft.getByLabel('意图标题', { exact: true })).toHaveValue('保留本窗口的草稿');
  await expect(draft.getByRole('button', { name: '检查并预览草稿', exact: true })).toBeDisabled();
  await draft.getByRole('button', { name: '核对最新意图并保留草稿', exact: true }).click();
  await expect(draft.getByRole('button', { name: '检查并预览草稿', exact: true })).toBeEnabled();
  await draft.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '核对并确认意图', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '核对并确认意图', exact: true });
  await confirmation.getByLabel('已完成的商讨与核对结论', { exact: true }).fill('本次核对只适用于已打开的版本。');
  await confirmation.getByLabel('商讨出处', { exact: true }).fill('test:stale-dialog');
  await confirmation.getByLabel('我已商讨并核对当前意图表示，明确确认').check();
  await expect(confirmation.getByRole('button', { name: '确认当前意图表示', exact: true })).toBeEnabled();
  const updated = await page.request.post(base + '/intent-draft', { headers: headers(), data: {
    baseRevision: saved.revision, title: '意图已更新，需重新核对', confirmed: true
  } });
  expect(updated.status()).toBe(200);
  await expect(confirmation.getByRole('alert')).toContainText('项目已更新，请关闭并重新核对当前意图');
  await expect(confirmation.getByRole('button', { name: '确认当前意图表示', exact: true })).toBeDisabled();
  expect((await (await page.request.get(base)).json() as RecordProject).records.intent.confirmation.state).toBe('proposed');
});
