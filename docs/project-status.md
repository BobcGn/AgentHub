# 当前工程状态

状态日期：**2026-10-30**。本文件记录产品意图、阶段设计和工程事实。最新 JSON Schema 完善基线、合同总图与验收矩阵见[P01：JSON Schema 决策基线、合同总图与验收矩阵](#p01json-schema-决策基线合同总图与验收矩阵2026-10-30独立收尾复核通过)，历史恢复消费者边界加固、正式记录关系完整核验、默认预算强制与账本物理读取约束见[第十五批恢复消费者边界加固、正式记录关系完整核验、默认预算强制与账本物理读取约束](#第十五批恢复消费者边界加固正式记录关系完整核验默认预算强制与账本物理读取约束2026-10-29已实现作者自测通过待独立交叉验证)，历史恢复包驱动的真实只读消费闭环见[第十四批恢复包驱动的真实只读消费闭环、目标绑定与事实重检](#第十四批恢复包驱动的真实只读消费闭环目标绑定与事实重检2026-10-29已实现作者自测通过待独立交叉验证)，历史授权恢复路径闭环见[第十三批授权恢复路径闭环、未知授权状态如实表达与消费端安全重检落地](#第十三批授权恢复路径闭环未知授权状态如实表达与消费端安全重检落地2026-10-29)，历史终极预算守卫、授权明细安全省略与停止诊断事实真实性落地见[第十二批终极预算守卫、授权明细安全省略与停止诊断事实真实性落地](#第十二批终极预算守卫授权明细安全省略与停止诊断事实真实性落地2026-10-29)，历史全出处闭包保护与停止诊断渐进压缩见[第十一批恢复包全出处闭包保护、停止诊断确定性渐进压缩与事实真实性保障](#第十一批恢复包全出处闭包保护停止诊断确定性渐进压缩与事实真实性保障2026-10-28)，历史可配置 32 KiB 预算、出处传递闭包与损坏数据安全停止落实见[第十批可配置 32 KiB 预算、出处传递闭包与损坏数据安全停止落地](#第十批可配置-32-kib-预算出处传递闭包与损坏数据安全停止落地2026-10-28)，历史整体验收门禁无副作用校验与聚焦恢复上下文落实见[第九批整体验收门禁无副作用校验、Fail-Closed 结构安全与聚焦恢复上下文落地](#第九批整体验收门禁无副作用校验fail-closed-结构安全与聚焦恢复上下文落地2026-10-28)，历史多进程冷启动验收与闭门策略落实见[第八批独立多进程冷启动验收、非200响应有界预算与旧运行闭门策略落地](#第八批独立多进程冷启动验收非200响应有界预算与旧运行闭门策略落地2026-10-28)，历史执行约束链贯通与冷启动恢复见[第七批执行与约束链贯通失效与回退解耦与跨会话冷启动恢复落地](#第七批执行与约束链贯通失效与回退解耦与跨会话冷启动恢复落地2026-10-27)，历史安全缺口修复与跨会话冷启动恢复见[第六批安全与一致性缺口修复与跨会话冷启动恢复](#第六批安全与一致性缺口修复与跨会话冷启动恢复2026-10-27)，历史独立交叉验证修复见[独立交叉验证五批修复](#独立交叉验证五批修复2026-10-26)，基建正确性与运行预算实现见[基建正确性与运行预算账本](#基建正确性运行预算与对账恢复2026-10-26)，架构审查修复见[Harness 架构审查修复](#harness-架构审查修复第一批与第二批记录一致性与工作区外发边界2026-10-26)，最新 AIDLC 候选动作与聚焦投影实现见[AIDLC 候选动作扩展](#aidlc-候选动作扩展与低开销聚焦投影2026-10-26)，Agent 基建实现见[Agent 基建第一切片](#agent-基建第一切片provider-高层抽象沙箱工具与恢复检查点2026-10-26)，云端模型实现见[DeepSeek 接入](#接入-deepseek-云端模型2026-10-26)，最小 Harness 实现见[最小 Harness](#最小-harness-与跨会话继承2026-10-26)，正式记录见[正式 JSON 项目看板](#正式-json-项目看板与迁移2026-10-25)；B1–B3 历史实现见[B3 关键变更](#b3-关键变更与差异审查2026-10-25)，B2 历史实现见[B2 概览与边界内记录](#b2-概览与边界内记录2026-10-24)，B1 历史验证见[B1 自动同步修复](#b1-自动同步修复2026-10-23)、[B1 决定说明细化](#b1-决定说明细化2026-10-23)与[B1 实现](#b1-最小提案审批闭环实现2026-10-23)；早期轮次保留当时范围和结果，不将其限制误当作当前授权。

## P01：JSON Schema 决策基线、合同总图与验收矩阵（2026-10-30，独立收尾复核通过）

> [!IMPORTANT]
> **收尾结论与证据边界**：P01 经首轮及 P01-R1、P01-R2 修订后，由 P01-R3 闭合剩余图示、归因范围与证据措辞问题，Codex 于本轮独立收尾复核通过。此结论覆盖决策基线、合同总图和验收规划，不代表 P02—P13 功能已经实现，也不替代用户的实际使用验收。历史未通过结论和实现缺口保留其适用范围。

本阶段严格执行 P01 定点修订任务范围，为主项目建立经本地书籍与真实源码核验的 JSON Schema 决策基线与验收矩阵，不提前实现 P02—P13 功能，不修改任何业务源码、Schema、测试用例或构建配置：

1. **确立并校准主交付物《JSON Schema 完善路线图与验收矩阵》**：
   - 维护 [docs/json-schema-roadmap.md](json-schema-roadmap.md)，确立目标、边界、核心术语与认识论四分法；
   - 固化 **SC-001 至 SC-024** 稳定决策索引，严格对照本地书籍镜像（`references/aidlc-book-reference/aidlc-book-baojun/`，commit `9ae1075d3c87f6c6ea626dbfc8b3d3a0132ae64e`）校准章节标题与归因强度；
   - 明确废除并替代 D12.2 旧版“一个 Requirement 对应一个最终 PR”的强制规则，由 **SC-005（PR 可选及多 PR）** 确立 PR 为可选交付关联（0..N），无 PR 时仍可通过客观证据完成验收；
   - 绘制核心实体关系拓扑与职责表，补充唯一归属、执行依赖、跨需求影响、证据绑定、检查点精准归因与独立修改隔离等六大关系；
   - 规划 **P01 至 P13** 完整演进路线与正交依赖拓扑，为后续分期建设提供清晰输入。
2. **六大缺口线索的分项证据状态客观表达（杜绝“全部证实缺陷”的总括）**：
   - **线索 1（未确认空白意图草稿与基础健康检查规则不一致）**：【已证实规则不一致】。`schemas/records/intent.schema.json` 允许 proposed 状态下 title 为空，但 `validateBasicStructuralHealth` 无条件断言 `!intent.title.trim()` 判定不健康；
   - **线索 2（外层元数据缺少校验与 TypeError 穿透）**：【已证实校验缺失与应用层 TypeError 穿透；未实测 HTTP 响应或服务进程存活】。`JsonRecordProjectStore.get` 仅浅层判断 `Array.isArray(audit)`，传入 `audit: [null]` 时读取放行，合法 `saveRecord` 请求进入 replay 读取 `requestId` 时抛出 `TypeError`；依据 HTTP 异常处理代码，可推导其被捕获并返回错误响应；本轮未实测 HTTP 响应或服务进程存活；
   - **线索 3（PR URL 正则匹配非 PR 路径）**：【已证实正则匹配缺陷】。`requirement.schema.json` 的 `[^/\s]+` 正则允许 `?` 与 `=`，导致真实 pathname 为 `/search` 的 URL（如 `https://github.com/search?q=owner/repo/pull/42`）被当前合同放行；
   - **线索 4（离线快照校验缺少版本适用性绑定）**：【已证实离线快照校验能力边界】。修改合成完成快照的预期结果并保留原通过证据，离线快照校验仍通过；这证明离线校验缺乏内容/版本强绑定，但不代表在线编辑入口无级联失效；
   - **线索 5（Schema、代码与文档规则不一致）**：【已证实已知规则差距】。当前 Schema 与恢复代码强制 `status: done` 必须有关联 PR 对象，与已确认的 SC-005 冲突，已排期在 P06 实施；
   - **线索 6（长期保存策略与单次加载预算混淆）**：【已证实概念混淆已厘清，未观察到运行时持久化数据丢失】。当前存储写入存在 16 MiB 硬性拒绝上限，单次恢复加载预算默认 32 KiB（支持 4 KiB 至 1 MiB 配置），两者物理机制独立，未观察到恢复预算导致持久化截断的执行证据。
3. **完成必要文档同步**：
   - 同步更新 [docs/json-schema-contract.md](json-schema-contract.md)、[docs/decisions.md](decisions.md)、[docs/records-and-harness-plan.md](records-and-harness-plan.md)、[AGENTS.md](../AGENTS.md) 与本文档，明确记录替代关系与当前差距。
4. **作者自测数据与命令记录**：
   - **自动化测试**：本轮未机械重跑完整测试套件（上轮 Codex 运行合同测试 17/17 通过，更早轮次运行 `npm run check` 226/226 通过）；
   - **隔离内存反例**：在 `docs/json-schema-roadmap.md` 附录 9 给出 Clue 1–4 经本地实测验证的 Node.js 源码级复现脚本，采用 `node:assert/strict` 严格断言且退出码均为 0；
   - **文件基线指纹**：对受保护的 126 个工程文件计算 SHA-256 清单哈希，在 P01-R1 起始与 P01-R3 结束时测得完全一致的快照指纹（`9fa39a268f50f9c31d5834799b3ae19f6230071b67078e9d10226d67818adad4`），证明快照匹配；本轮未接触、未读取任何实际用户数据。

5. **独立复核与交付范围**：
   - Codex 确认 P01-R3 三项定点修订与实际源码边界一致，决策表和矩阵覆盖 SC-001—SC-024；复核 126 个受保护工程文件快照及 349 个相对文件链接目标，并核对工程状态的 P01 小节锚点；
   - 四段源码级附录命令已在 P01-R2 独立执行通过；P01-R3 未重复执行未变动命令。此前独立合同测试 17/17、完整检查 226/226 的结果均保留为对应轮次证据，不冒充本轮运行；
   - 用户于本轮明确要求 P01 收尾并提交推送所有待交付变更。此次提交为文档交付，未进入 P02，无业务源码、Schema、测试或实际用户数据变更；提交和推送结果以实际 Git 输出为准。

## 第十五批：恢复消费者边界加固、正式记录关系完整核验、默认预算强制与账本物理读取约束（2026-10-29，已实现，作者自测通过，待独立交叉验证）

> [!IMPORTANT]
> **认识论与证据状态声明**：本批次所有实现与修复在通过 Codex 的独立交叉验证前，统一标记为“**已实现，作者自测通过，待独立交叉验证**”；不标为“已验证”、“独立验证通过”、“技术 Pass”、“验收通过”或“漏洞已彻底关闭”。本文档记录的命令、退出码、测试数量与断言观察均为作者自测证据，不等于独立交叉验证，亦不等于用户最终验收。

针对第十五轮独立交叉审查确认的四大恢复消费者边界缺口，完成全链路修复与端到端闭环自测：

### 第一批：移除缺少当前项目时的兼容放行（Gap 1 修复）
1. **彻底移除修订单字段放行分支**：
   - 在 `verifyRetrievedRunAuthorization` 中移除此前为了兼容老测试而保留的“若只传 `currentProjectRevision` 不传 `currentProject` 仍可能返回 `valid: true`”的兼容放行路径；
   - 确立强制原则：运行授权适用性推导必须同时具备重新读取的当前正式项目（`currentProject`）与目标运行账本（`run`）；若缺少当前项目读取依据（未提供或读取失败），无条件返回 `valid: false, state: 'unverified_due_to_corruption'`，并将 `checks.projectStructureHealthy`、`checks.projectRelationsValid` 与 `checks.requirementExistsInCurrentProject` 均置为 `false`，原因明确说明缺少当前正式项目读取依据，禁止推断；
2. **缺失事实与状态如实表达，杜绝假装撤销或捏造事实**：
   - 目标运行账本未读取到时，返回 `valid: false, state: 'none', run: null`，原因指出“未读取到目标运行账本内容”，彻底废除在应用层或 CLI 生成虚假备用运行（`fallbackRun`）以迎合下游的错误做法；
   - 目标需求在当前项目中已被删除或脱离 Intent 时，返回 `valid: false, state: 'none', checks.requirementExistsInCurrentProject: false`，如实指出需求在当前项目中不存在，不与撤销或过期混淆。

### 第二批：复用正式记录完整关系校验（Gap 2 修复）
1. **Schema 校验不足以发现语义断裂**：
   - 实验反例证明：清空项目 `records.sources` 但保留 `intent.sourceRefs` 或需求引用的场景下，Ajv Schema 语法校验完全通过（空数组依然是合法数组）；但该项目在语义层面存在致命的断裂引用（`UNKNOWN_REFERENCE`）；
2. **重检前置执行 inspectRecordRelations**：
   - `verifyRetrievedRunAuthorization` 在通过基础结构与 Schema 语法检查后，强制调用统一的完整关系校验函数 `inspectRecordRelations(records as RecordSet)`；
   - 彻底拦截断裂引用（`UNKNOWN_REFERENCE`）、未知 Intent 归属（`UNKNOWN_INTENT`）、不适用证据（`INAPPLICABLE_EVIDENCE`）、未知目标（`UNKNOWN_TARGET`）与循环依赖；
   - 一旦发现语义关系问题，立即将 `checks.projectRelationsValid` 标记为 `false`，返回 `valid: false, state: 'unverified_due_to_corruption'`，并将具体问题代码与路径列入 `reason` 中；
   - CLI 消费端 `--verifyRecovery` 读取关系断裂项目时，准确输出 `checks.projectRelationsValid: false` 与 `unverified_due_to_corruption`，拒绝执行。

### 第三批：落实验证报告的默认预算 32768 字节与真实交付边界（Gap 3 修复）
1. **统一预算解析与默认 32768 字节**：
   - CLI 消费入口对 `--budgetBytes` 统一调用 `validateRecoveryBudget(budgetBytes)`；未提供参数时无条件默认生效 `DEFAULT_RECOVERY_BUDGET_BYTES`（32768 字节），范围强制限制在 4096 至 1048576 字节；
2. **海量授权范围时的安全省略与确定性渐进压缩**：
   - 当工作区授权包含海量读取范围（如 500 条超长路径，体积 > 50 KiB）导致重检报告溢出时，`createVerificationJsonReport` 与 `renderVerificationMarkdown` 安全省略授权明细（`activeGrant: null, authorizationDetailsOmitted: true`），优先保留重检结论（`valid`）、各项检查清单（`checks`）、修订基准号、停止理由与稳定的定位字段（`retrievalLocator` / `retrievalEndpoint`）；
   - 在 4096 字节极限预算下执行渐进压缩，若即使超紧凑报告仍无法容纳则抛出 413 `BUDGET_EXCEEDED`；
   - CLI stdout JSON 与 Markdown 均通过 `getUtf8ByteLength` 严格计量实际 UTF-8 输出，杜绝缩进与换行超限；CLI 遇到错误时向 stderr 输出有界错误对象并退出码 1 拦截。

### 第四批：约束账本文件的物理读取范围与禁止符号链接（Gap 4 修复）
1. **禁止账本符号链接与非普通文件**：
   - 在 `resolveRunLocatorPath`、`readSafeRunFile` 与 `JsonRunStore.get` 中强制使用 `lstatSync` 检查目标文件：
     - 若 `lstat.isSymbolicLink()` 为真，立即抛出 400 `UNSAFE_RUN_FILE`（运行账本禁止使用符号链接）；
     - 若 `!lstat.isFile()` 为真，立即抛出 400 `UNSAFE_RUN_FILE`（运行账本必须为普通文件）；
2. **物理防逃逸与 2 MiB 体积上限**：
   - 目标文件必须严格落在物理已解析的 `runDir` 内：比较 `dirname(realpathSync(targetPath)) === realpathSync(resolve(runDir))`，拦截利用内部符号链接逃逸至外部私密目录（如 `outside-secret.json`）的攻击；
   - 账本文件大小上限严格限制为 2 MiB（`lstat.size > 2 * 1024 * 1024` 时抛出 413 `RUN_TOO_LARGE`）；
   - CLI 消费端遇到 `INVALID_LOCATOR`、`UNSAFE_RUN_FILE` 与 `RUN_TOO_LARGE` 等参数/安全攻击时，重新抛出错误，CLI 以非零退出码 1 失败拦截并输出有界 stderr。

### 本轮作者自测数据与命令记录
1. **全端类型检查**：`tsc --noEmit`（`tsconfig.json`、`tsconfig.web.json`、`tsconfig.tests.json` 3 份配置）全部 **0 错误**通过；
2. **单元与行为测试**：`node --import tsx --test tests/*.test.ts` 全部 **226 / 226 项通过**（包含 [recovery-packet-budget-and-closures.test.ts](../tests/recovery-packet-budget-and-closures.test.ts) 中的 28 组全量反例与恢复验证测试）；
3. **浏览器端到端测试**：`npm run test:e2e` Playwright 浏览器测试全部 **24 / 24 项通过**；
4. **编译构建**：`npm run build`（tsc + Vite）顺利通过，产物生成正常；
5. **服务启动烟雾自测**：`node --import tsx tests/harness-start-smoke.ts` 顺利通过；
6. **代码格式与差异检查**：`git diff --check` **0 告警**。

## 第十四批：恢复包驱动的真实只读消费闭环、目标绑定与事实重检（2026-10-29，已实现，作者自测通过，待独立交叉验证）

> [!IMPORTANT]
> **认识论与证据状态声明**：本批次所有实现与修复在通过 Codex 的独立交叉验证前，统一标记为“**已实现，作者自测通过，待独立交叉验证**”；不标为“已验证”、“独立验证通过”、“技术 Pass”、“验收通过”或“漏洞已彻底关闭”。本文档记录的命令、退出码、测试数量与断言观察均为作者自测证据，不等于独立交叉验证，亦不等于用户最终验收。

针对第十四轮独立交叉审查确认的目标绑定缺失、事实重检缺失及离线定位合同不一致三大缺口，完成全链路修复与端到端闭环自测：

### 第一批：目标绑定与归属全校验（Gap 1 修复）

1. **未决目标与未知状态严格阻断**：
   - 在 `verifyRetrievedRunAuthorization` 入口强制前置校验目标绑定；
   - 若 `recoveryView.authorizations.targetRunId` 为空、或恢复视图为 `SELECT_TARGET_REQUIREMENT`、或授权状态处于 `unknown`，立即拒绝通过，返回 `valid: false, state: 'unknown'`，彻底杜绝多需求未定时外部消费者自行塞入任意 Run 伪造通过。
2. **多重归属一致性与悬空需求拦截**：
   - 严格核验取回的 Run 标识：`run.id === targetRunId`；
   - 严格核验项目归属：`run.projectId === targetProjectId`，拦截跨项目运行记录；
   - 严格核验需求归属：`run.requirementId === targetRequirementId`，拦截跨需求运行记录；
   - 校验目标需求在当前项目记录中真实存在且归属于当前 Intent（`req.intentId === currentProject.records.intent.id`），若需求已被删除或脱离 Intent，立即返回 `valid: false, state: 'none'`，严防在已失效需求上执行操作。

### 第二批：真实重检当前事实与结构校验（Gap 2 修复）

1. **强制重读当前事实，杜绝依赖旧快照猜测**：
   - 消费端重检必须重新读取当前项目与 Run 账本；若读取失败或当前事实缺失，返回未验证（`unverified_due_to_corruption`），严禁降级使用旧快照猜测；
   - 执行前置无副作用结构健康度校验（`validateBasicStructuralHealth`），若底层记录损坏（如 `intent.title = 42`），立即返回 `unverified_due_to_corruption`，拒绝执行。
2. **生命周期与修订漂移严格覆盖**：
   - 项目修订前进漂移检测：当前项目修订 `currentProject.revision > recoveryView.projectRevision` 时阻断；
   - 运行基准漂移检测：`run.baseRevision !== currentProject.revision` 时判定为 `stale_revision`；
   - 运行修订漂移检测：磁盘 Run 修订与恢复包快照不符时判定为 `stale_revision`；
   - 运行生命周期检测：已取消/撤销判定为 `revoked`，已超时（>24h）判定为 `expired`，处于终止态（如 `completed`、`failed`、`cancelled`）判定为 `expired`。
3. **正交执行语义精确解耦**：
   - 解耦并分别推导输出：`runAuthorizationApplicable: boolean`、`workspaceAccessGranted: boolean`、`executableNow: boolean`；
   - 纯上下文分析运行（`workspace.authorized: false`）是合法 Harness 运行，其授权合法有效（`runAuthorizationApplicable = true, valid = true`），但无工作区本地读写权限（`workspaceAccessGranted = false`），彻底修复将此类合法运行误报为 `valid: false` 的缺陷。

### 第三批：离线定位合同一致性与安全防穿越解析（Gap 3 修复）

1. **统一定位符合同（`retrievalLocator`）**：
   - 规范化 `retrievalLocator` 语义，明确其为相对于 `runDir` 的标准相对路径：`${targetRunId}.json`；
   - 消除此前拼接 `runDir` 导致的 `runs/runs/:id.json` 双重目录嵌套 Bug；
   - Markdown 与 JSON 报告均呈现标准 `${targetRunId}.json` 定位符。
2. **安全路径解析器（`resolveRunLocatorPath`）**：
   - 实现防穿越安全解析函数，在任何文件读取前执行强防御：
     - 拒绝绝对路径（`isAbsolute` 与 Windows 盘符路径）；
     - 拒绝包含空字节（`\0`）攻击；
     - 严格阻断目录穿越（`..`）；
     - 仅允许合法文件名格式（`^[A-Za-z0-9-]+\.json$`）；
     - 安全平滑兼容历史遗留快照中生成的 `runs/:id.json`（单层且名为 runs 时安全剔除前缀，不猜测不漫游）。
3. **独立进程级只读消费闭环与 CLI 验证**：
   - `src/presentation/recovery-cli-consumer.ts` 扩展 `--verifyRecovery <path>` 与 `--recoveryFile <path>` 支持；
   - 支持独立操作系统进程 A 提取并持久化恢复包后退出，独立操作系统进程 B 纯粹依据恢复包与 `--projectDir` / `--runDir` 完成取回、校验与重检，零带外信息闭环；
   - CLI 输出重检报告（JSON 或 Markdown），严格受 `--budgetBytes` 约束。

### 本轮作者自测数据与命令记录

1. **全端类型检查**：`tsc --noEmit`（`tsconfig.json`、`tsconfig.web.json`、`tsconfig.tests.json` 3 份配置）全部 **0 错误**通过；
2. **单元与行为测试**：`node --import tsx --test tests/*.test.ts` 全部 **222 / 222 项通过**（包含 [recovery-packet-budget-and-closures.test.ts](../tests/recovery-packet-budget-and-closures.test.ts) 中的 24 组全量反例与恢复验证测试）；
3. **浏览器端到端测试**：`npm run test:e2e` Playwright 浏览器测试全部 **24 / 24 项通过**；
4. **编译构建**：`npm run build`（tsc + Vite）顺利通过，产物生成正常；
5. **服务独立启动与烟雾验证**：`node --import tsx tests/harness-start-smoke.ts` 退出码 `0`，顺利启动；
6. **代码格式与工作区检查**：`git diff --check` 退出码 `0`，工作区整洁；
7. **自动化测试总数**：**246 / 246 项全部自测通过**；
8. **边界与事实声明**：本轮自测在隔离本地环境与纯 Node.js / Playwright 测试套件中运行，未连接外部公网 LLM，未修改正式用户数据，未伪造人工验收，未执行 Git commit / push / PR。当前状态为**作者自测通过，待 Codex 独立交叉验证**。

## 第十三批：授权恢复路径闭环、未知授权状态如实表达与消费端安全重检落地（2026-10-29）

针对第十三轮独立交叉审查发现的授权恢复路径断裂与未知授权状态失真缺口，完成全链路通用修复与严格验证：

### 第一批：授权恢复路径闭环与消费端安全重检（Gap 1 修复）

1. **授权详情省略时的定位元数据强制保留**：
   - 领域层 `RecoveryAuthorizations` 显式扩展 `targetRunId`、`runRevision`、`baseRevision`、`retrievalEndpoint` (`/api/runs/:id`)、`retrievalLocator` (`runs/:id.json`)；
   - 彻底解决 `buildCompactStopView` 省略 `activeGrant` 与 `runtimeBinding` 后错误引导消费者请求仅含正式记录的 `/api/record-projects/:id` 导致无法取得授权的死胡同；
   - 无论在正常预算压缩还是极限预算（4096 字节）5 阶段收敛中，均强制保留目标 Run 定位信息，Markdown 与 JSON 明确指引回查完整 Run 账本。
2. **在线鉴权与离线免鉴权双通路读取闭环**：
   - 在线 HTTP 路由：`GET /api/runs/:id` 严格执行 `requireHuman`，未登录访问返回 401，工具令牌访问返回 403，仅人端凭据返回 200；
   - 离线 CLI 消费者：无需网络或鉴权，依据 `retrievalLocator` 直接从本地 `runDir` 定位并反序列化 `runs/:id.json`，实现零外部带外信息自洽闭环。
3. **消费端纯领域安全重检（`verifyRetrievedRunAuthorization`）**：
   - 针对冷启动消费者可能盲目信任快照中 `valid` 状态的安全隐患，实现纯领域防漂移重检函数；
   - 严格核验：Run 版本是否漂移（`run.revision !== snapshot.runRevision`）、项目基准是否推进（`project.revision !== run.authorization.baseRevision`）、授权是否已超时过期、运行是否已被人工撤销/取消、项目记录结构是否健康；
   - 任一条件不满足时，明确拒绝推进并提示重新核对，彻底消除“基于过期快照盲目执行”的风险。

### 第二批：未知与未验证授权状态如实推导（Gap 2 修复）

1. **项目结构健康度与运行授权生命周期解耦**：
   - 彻底修复数据损坏分支未传递运行授权分析结果导致 `authorizationState` 错误默认填为 `'none'` 的事实失真漏洞；
   - 当项目底层结构损坏（如 `intent.title = 42`）但磁盘存在有效授权的 Run 时，状态机如实推导为 `'unverified_due_to_corruption'`，绝不将存在授权误报为不存在，也绝不因有授权就允许在损坏结构上盲目推进。
2. **正交完备的 7 态语义体系**：
   - 统一由 `analyzeProjectAuthorizations` 判定：`'none'`（目标需求无运行）、`'unknown'`（多需求未选定且存在跨需求运行）、`'unverified_due_to_corruption'`（存在有效运行但项目结构损坏无法核验适用性）、`'valid'`（授权有效且基准一致）、`'expired'`（授权已过 24h）、`'revoked'`（人工取消）、`'stale_revision'`（项目修订已前进）；
   - Markdown 与 JSON 保持完全一致的真实事实表达。

### 本轮验证结果与数据指标

1. **全端类型检查**：`tsc --noEmit`（`tsconfig.json`、`tsconfig.web.json`、`tsconfig.tests.json` 3 份配置）全部 **0 错误**通过；
2. **单元与行为测试**：`node --import tsx --test tests/*.test.ts` 全部 **219 / 219 项通过**（包含 [recovery-packet-budget-and-closures.test.ts](../tests/recovery-packet-budget-and-closures.test.ts) 中的 21 组全量反例与恢复验证测试）；
3. **浏览器端到端测试**：`npm run test:e2e` Playwright 浏览器测试全部 **24 / 24 项通过**；
4. **编译构建**：`npm run build`（tsc + Vite）顺利通过，产物生成正常；
5. **服务独立启动与烟雾验证**：`node --import tsx tests/harness-start-smoke.ts` 退出码 `0`，顺利启动；
6. **代码格式与工作区检查**：`git diff --check` 退出码 `0`，工作区整洁；
7. **自动化测试总数**：**243 / 243 项全部通过**。
8. **事实与边界声明**：恢复包测试在模拟/脚本环境下完成确定性结构断言，不调用外部云端模型，不接触真实凭据，不修改用户数据，不执行 Git 操作；真实 LLM 对恢复包的语义理解仍属未验证假设（Unverified Hypothesis）。

## 第十二批：终极预算守卫、授权明细安全省略与停止诊断事实真实性落地（2026-10-29）

针对最新独立交叉审查发现的恢复包终极预算越界与停止诊断事实失真缺口，完成全链路通用修复与严格验证：

### 第一批：海量授权明细安全省略与终极预算守卫（Gap 1 修复）

1. **授权详情安全省略（Authorization Details Omission）**：
   - 领域层 `RecoveryAuthorizations` 扩展可选标记 `authorizationDetailsOmitted?: boolean;`；
   - 彻底解决 `buildCompactStopView` 保留完整 `activeGrant`（如工作区授权包含 60 条每条 120 字符的 `readScope`）及 `runtimeBinding` 导致在 4096 字节极限预算下输出 10.7 KB 严重超限内容的漏洞；
   - 停止诊断在阶段 2/3 渐进式省略工作区与运行时内部明细（`activeGrant = null, runtimeBinding = null, authorizationDetailsOmitted = true`），但**绝不修改真实授权状态**（`authorizationState: 'valid'` 保持 `valid`，绝不降级为 `none` / `revoked`，绝不捏造伪造的截断范围）；
   - 在授权附注与 Markdown 中如实输出“- **有效授权范围**：授权详情未包含，需取回重新核对”以及 `GET /api/record-projects/:id` 真实回查入口。
2. **终极预算守卫与多层闭门兜底**：
   - `buildCompactStopView` 阶段 5 增加终极断言：若经 5 阶段渐进压缩后体积仍超出 `maxBudgetBytes`，抛出类型化 `HubError(413, 'BUDGET_EXCEEDED')`；
   - HTTP 路由服务层自动将 413 错误转换为标准 JSON `{ error: { code: 'BUDGET_EXCEEDED', message: ... } }`；
   - CLI 消费端（[recovery-cli-consumer.ts](../src/presentation/recovery-cli-consumer.ts)）在将输出写入 stdout 前执行真实 UTF-8 字节数校验，超限时写入 stderr 结构化错误并以退出码 1 终止，绝不以退出码 0 输出超限内容。

### 第二批：停止诊断运行态与候选生命周期事实零失真（Gap 2 修复）

1. **运行状态与未决候选计数真实透传**：
   - 彻底修复 `buildCompactStopView` 将 `pendingCandidateCount: 0`、`keptCandidateCount: 0` 硬编码以及丢弃 `latestRunState` 导致 Markdown 渲染为“最新运行 无 · 待审核候选 0 条”（而授权状态却显示为 valid）的事实失真漏洞；
   - `buildCompactStopView` 显式支持并透传 `latestRunState`、`pendingCandidateCount` 与 `keptCandidateCount`，`applyRecoveryBudget` 步骤 7 完整保留并传递运行态事实；
   - 结构损坏 Fail-Closed 停止视图（`safeStopView`）同样基于实际 `runs` 真实计算运行状态与候选计数，杜绝伪造 0 候选或无运行。
2. **Markdown 渲染层运行态对齐**：
   - 建立 `runStateDisplay` 归一化逻辑，真实反映 `latestRunState`（如 `waiting_human`、`running`、`interrupted`），如实输出候选数量；
   - Markdown 规范输出 `- **运行账本状态**：最新运行 waiting_human · 待审核候选 1 条 · 已保留候选（待人工决定或未合入正式记录） 0 条`，彻底消除事实矛盾。

### 第三批：停机原因严格分类与无偏见诊断

1. **结构损坏 vs 预算超限严格隔离**：
   - 严格区分“必要恢复上下文超出预算上限”与“记录底层结构错误/合同校验失败”；
   - 结构损坏场景下保留底层结构错误事实诊断（`necessaryOverBudget: false`），绝不将 why 改写为“必要恢复上下文超出预算上限”，绝不将 `missingFacts` 覆盖为“上下文超限”，`pendingHumanGates` 绝不提示用户调大 `--budgetBytes`。

### 本轮验证结果与数据指标

1. **全端类型检查**：`tsc --noEmit`（`tsconfig.json`、`tsconfig.web.json`、`tsconfig.tests.json` 3 份配置）全部 **0 错误**通过；
2. **单元与行为测试**：`node --import tsx --test tests/*.test.ts` 全部 **217 / 217 项通过**（包含 [recovery-packet-budget-and-closures.test.ts](../tests/recovery-packet-budget-and-closures.test.ts) 中的 19 组全量反例与恢复验证测试）；
3. **浏览器端到端测试**：`npm run test:e2e` Playwright 浏览器测试全部 **24 / 24 项通过**；
4. **编译构建**：`npm run build`（tsc + Vite）顺利通过，产物生成正常；
5. **服务独立启动与烟雾验证**：`node --import tsx tests/harness-start-smoke.ts` 退出码 `0`，顺利启动；
6. **代码格式与工作区检查**：`git diff --check` 退出码 `0`，工作区整洁；
7. **自动化测试总数**：**241 / 241 项全部通过**。
8. **事实与边界声明**：恢复包测试在模拟/脚本环境下完成确定性结构断言，不调用外部云端模型，不接触真实凭据，不修改用户数据，不执行 Git 操作；真实 LLM 对恢复包的语义理解仍属未验证假设（Unverified Hypothesis）。

## 第十批：可配置 32 KiB 预算、出处传递闭包与损坏数据安全停止落地（2026-10-28）

针对第九轮独立交叉审查发现的问题，完成“内容完整、出处可查、遇错会停、体积受控”的冷启动恢复包全链路落地：

### 第一批：统一必要内容继承、出处闭包与三层事实对齐

1. **项目级与需求级必要内容继承**：
   - 在 [recovery.ts](../src/domain/recovery.ts) 中，将正式项目记录中的项目级 `confirmed` 决定（`requirementId === null`）与指定需求级约束（`constraint`）统一结构化抽取至 `contextItems`，并在 Markdown 视图的 `## 5.1 正式记录事实` 段落以规范条目呈现；
   - 彻底解决过往恢复包仅提取需求准则而丢弃顶层确认决定的漏洞。
2. **出处传递闭包（Provenance Closure）修复**：
   - 恢复投影在计算关联来源（`scopedSources`）与关联证据（`scopedEvidence`）时，强制将 `scopedContextItems.flatMap(c => c.sourceRefs)` 和 `c.evidenceRefs` 纳入引用传递闭包；
   - 修复了“决定/约束进入恢复包但其引用的唯一 source 记录被过滤”的孤儿引用反例。
3. **认识论状态真实性防篡改**：
   - `proposed` 候选决定在恢复视图中严格保留 `epistemicStatus: 'proposed'`，绝不升级为 `confirmed`；
   - 彻底排除外层非目标需求的决定与约束；
   - 规范修正 Markdown 与 JSON 中的事实描述，消除“已核验记录”、“verified证据状态”等夸大表述，准确标注为“已登记证据”。

### 第二批：数据结构损坏 Fail-Closed 安全停止

1. **前置结构健康检查（validateBasicStructuralHealth）**：
   - 在 [recovery.ts](../src/domain/recovery.ts) 中增加纯安全前置校验，覆盖顶层集合错类型、`schemaVersion` 不支持、`intent` 字段缺失、`requirements[0].title` 为非字符串、数组内包含 `null` 元素等损坏场景；
   - 捕获前 25 条结构问题（有界防二次崩溃），在所有入口（HTTP、CLI、JSON、Markdown）统一返回最小安全停止视图（`STOP_AND_REPORT_GAP`，`executableNow: false`），绝不执行属性方法调用（如 `r.title.trim()`）从而杜绝 `TypeError` 崩溃。
2. **HTTP 路由与服务健康保障**：
   - 结构损坏请求在 HTTP 入口返回干净的结构化错误或安全停止响应，服务不发生 `unhandledRejection`，后续合法请求正常服务。

### 第三批：可配置 32 KiB 预算控制与渐进式截断

1. **预算参数控制与严格校验**：
   - 增加 `--budgetBytes` / `budgetBytes` 参数，默认 `32768`（32 KiB），有效范围 `4096` 至 `1048576` 字节；
   - 严格类型与界限校验，杜绝 NaN、Infinity、负数、浮点与字符串注入。
2. **必要内容底线防裁剪与超限安全停止**：
   - Intent 意图、当前需求、已确认决定、约束及出处作为不可裁剪底线；
   - 若必要内容本身超出预算，状态机立即输出 `STOP_AND_REPORT_GAP`（`necessaryOverBudget: true`），附带超限字节数与调优建议，绝不为适应预算吞噬核心事实。
3. **渐进式剪裁与省略清单（omittedSummary）**：
   - 可选内容超限时自底向上按序裁剪（长摘要 -> 证据观测细节 -> 次要假设 -> 非通过态核查 -> 次要出处）；
   - 附带结构化 `omittedSummary`（上限 10 条，标明类型、ID、原因与 `GET /api/record-projects/:id` 取回入口）。
4. **精确字节计量自洽**：
   - 采用标准 `TextEncoder` 进行纯领域 UTF-8 真实字节计量（消除 Node.js Buffer 耦合）；
   - 通过自引用不动点迭代循环，确保 `contextBudget.actualBytes` 严格等于最终 JSON 序列化的真实 UTF-8 字节数。

### 本轮验证结果与数据指标

1. **类型检查**：`tsc --noEmit`（`tsconfig.json`、`tsconfig.web.json`、`tsconfig.tests.json` 3 份配置）全部 `0` 错误通过；
2. **单元与行为测试**：`node --import tsx --test tests/*.test.ts` 全部 **214 / 214 项通过**（包含 [recovery-packet-budget-and-closures.test.ts](../tests/recovery-packet-budget-and-closures.test.ts) 中的 16 组全量反例测试）；
3. **端到端测试**：`npm run test:e2e` Playwright 浏览器测试全部 **24 / 24 项通过**；
4. **编译构建**：`npm run build`（tsc + Vite）顺利通过，生产包体积与资源一致；
5. **工作区检查**：`git diff --check` 退出码 `0`，无多余空格与格式污染。
6. **自动化测试总数**：**238 / 238 项全部通过**。
7. **事实与边界声明**：恢复包测试在模拟/脚本环境下完成确定性结构断言，不调用外部云端模型，不接触真实凭据，不修改用户数据，不执行 Git 操作；真实 LLM 对恢复包的语义理解仍属未验证假设（Unverified Hypothesis）。

## 第十一批：恢复包全出处闭包保护、停止诊断确定性渐进压缩与事实真实性保障（2026-10-28）

针对第十一轮独立交叉审查发现的问题，落实三项核心修复与不变式约束：

1. **出处闭包范围补全（Provenance Closure Protection）**：
   - 领域层 `RecoveryGoal.intent` 增加 `sourceRefs` 与 `confirmationSourceRefs`，`activeRequirement` 增加 `sourceRefs`，`evidenceLinks.verifications` 与 `evidence` 增加 `sourceRefs`；
   - 统一出处收集辅助函数 `computeRetainedRequiredSources`，彻底解决步骤 6 仅遍历 `contextItems` 导致意图长 locator 来源被误清空、输出 0 个来源却仍给出授权的漏洞；
   - 增加后置出处完整性门禁（`hasCompleteRequiredSources`），当必要事实所依赖的出处无法在预算内完整容纳时，立即以 `STOP_AND_REPORT_GAP`（`necessaryOverBudget: true`, `executableNow: false`）安全停止，严禁在出处断裂下输出可执行动作。
2. **停止诊断确定性渐进压缩与预算强制断言（Deterministic Progressive Shrinking & Budget Assertion）**：
   - 彻底修复 `buildCompactStopView` 仅单次缩短 `why` 导致 Markdown 格式下因框架标题与模板超出 4096 字节预算（实际 4405 字节超限退出）的缺陷；
   - 建立 5 阶段渐进式确定性压缩链路（阶段 1：清空省略条目与压缩 missingFacts；阶段 2：缩短 why、精简规则与端点；阶段 3：按比例截断项目、意图与需求名称；阶段 4：剥离非核心元数据；阶段 5：极简安全骨架），严格断言实际 UTF-8 输出在 CLI 格式化 JSON 与 Markdown 下均严格 `<= maxBudgetBytes`。
3. **消除事实虚构与真实状态传递（Zero Business Fact Fabrication）**：
   - 废除停止视图对 `goal.intent.state` 与 `progress.intentState` 硬编码 `'human_confirmed'` 的行为；
   - 停止视图严格透传真实的确认状态（如 `'proposed'`）与进度状态，底层结构损坏时如实降级为 `'unknown'`，绝不伪造已获得人工确认的业务事实。

## 第九批：整体验收门禁无副作用校验、Fail-Closed 结构安全与聚焦恢复上下文落地（2026-10-28）

针对第八轮独立交叉审查发现的问题，落实三批深度修复与严格前置核验：

### 第一批：整体验收门禁无副作用校验与数据结构损坏 Fail-Closed 安全

1. **整体验收前置检查严格一致性（Acceptance Preflight Gate Parity）**：
   - 在 [recovery.ts](../src/domain/recovery.ts) 中升级统一的无副作用校验函数 `checkRequirementAcceptanceEligibility`，严格覆盖真实完成态所需的全部结构与关系约束：
     1. 状态必须为未完成（`req.status !== 'done'`）；
     2. 验收准则非空（`req.acceptanceCriteria.length > 0`）；
     3. 所有已存在的拆解子产物（Units/Stories/BoltPlans）均处于 `done` 完成态且无悬空引用；
     4. 关联交付物完整：交付结果（`req.result !== null`）字段非空且引用的依据存在且有效；最终 Pull Request（`req.pullRequest !== null`）字段非空（`url`、`what`、`why`、`verification`、`result`）；
     5. 每一项验收准则均具备 `outcome === 'passed'` 且 `method !== 'model_review'` 的有效非模型核查，且核查引用的依据存在且状态为已核验（`verified`）；
   - 在 [record-project-service.ts](../src/application/record-project-service.ts) 的 `acceptRequirement` 入口，修改状态前直接调用此校验；若不满足则抛出 `RecordProjectValidationError(ACCEPTANCE_PREFLIGHT_FAILED)`，并在错误报告中详尽列出未满足原因，使前端 `<IssuesList />` 规范渲染合同校验问题，彻底杜绝“恢复视图建议整体验收但实际 API 报错拒绝”的不一致；
   - 在 `deriveNextSafeAction` 中，当需求子产物与准则通过但缺失交付物（PR/Result）时，安全返回 `REQUIRE_RUN_AUTHORIZATION`（`executableNow: false`）并列出阻塞原因，绝不虚假推导 `REQUEST_HUMAN_OVERALL_ACCEPTANCE` 或 `executableNow: true`。
2. **数据结构损坏 Fail-Closed 最小安全视图（Fail-Closed Structural Safety）**：
   - 在 [recovery.ts](../src/domain/recovery.ts) 的 `buildRecoveryProjection` 入口设置前置防御性检查；
   - 当 `data.requirements === null`、`data.intent === null` 或存在底层结构校验问题（`options.structureIssues`）时，立即返回最小安全恢复视图（`actionCode: 'STOP_AND_REPORT_GAP', executableNow: false`），绝不调用 [record-relations.ts](../src/domain/record-relations.ts) 的 `inspectRecordRelations`，彻底消除了未定义集合遍历引发的 `TypeError: Cannot read properties of null (reading 'forEach')`。
3. **候选生命周期与人工 Gate 状态严格对齐**：
   - 严格对齐候选计数与 Gate 触发条件：
     - 未审阅候选（`waiting_human && candidate !== null && outcome === null`）计入 `pendingCandidateCount` 并触发 Candidate Decision Gate；
     - 已保留未应用候选（`kept && candidate !== null && !receipt`）计入 `keptCandidateCount` 并触发 Candidate Application Gate；
     - 已拒绝候选（`rejected`）绝不触发任何人工决定 Gate。

### 第二批：聚焦恢复上下文（Focused Context）与三级事实分层

1. **上下文严格聚焦与信息隔离（Focused Recovery Context）**：
   - 当指定 `targetRequirementId` 时，恢复上下文严格过滤，仅包含该需求、其所属直接子产物（Units/Stories/BoltPlans）、直接关联的核查（`verifications`）、证据（`evidence`）与来源（`sources`），以及项目全局或明确归属于该需求的问题与假设；
   - 彻底排除其他无关需求的技术细节、子产物和验证，防止无谓开销与上下文污染。
2. **三级事实明确分层呈现**：
   - 在 [recovery-service.ts](../src/application/recovery-service.ts) 格式化 Markdown 恢复视图与 JSON 上下文栈中，显式划分三层事实：
     - **5.1 正式记录事实（Formal Record Facts）**：已确认的 Intent 边界、约束、验收准则、已完成子产物与已核验证据，具有不可违背的规范权威；
     - **5.2 前置运行观察（Prior Run Observations）**：运行账本中的历史步骤与工具观察，属客观历史记录，不代表正式记录已变更；
     - **5.3 未知事项与待验证假设（Unknowns, Hypotheses & Gates）**：待核查的问题、假设与等待人工批准的 Gate，仍需人工裁决。
3. **上下文预算设计提案（32 KiB Context Budget Proposal）**：
   - 提出明确的 32 KiB 预算阈值、截断优先级次序与结构化省略元数据（`omittedSummary`）设计，提交用户决策。

### 第三批：独立只读消费端解耦与冷启动简报对齐

1. **只读消费端与人端会话解耦（Offline Consumer Decoupling）**：
   - 在 [recovery-service.ts](../src/application/recovery-service.ts) 中增加纯只读投影方法 `getProjectRecovery(projectId, options)` 与 `formatProjectRecoveryMarkdown(projectId, options)`，供离线脚本、自动化消费者与 CLI 直接调用，无需伪造人端凭证（`cli-user`）；
   - HTTP 接口维持 `getRecoveryView(actor, projectId, options)`，保留人类交互会话的安全门禁。
2. **CLI 消费者单项目自动选择**：
   - 在 [recovery-cli-consumer.ts](../src/presentation/recovery-cli-consumer.ts) 中，当命令行省略 `--projectId` 且持久化工作区内恰好存在 1 个项目时，自动选择该项目；存在多个项目时报错 `MULTIPLE_PROJECTS_FOUND`，无项目时报错 `MISSING_ARGUMENTS`。
3. **冷启动验收简报（docs/templates/cold-start-acceptance-brief.md）校准**：
   - Node 引擎版本与 `package.json` 保持严格对齐（`>=24.16.0 <25`）；
   - 纠正 Run 账本路径规范为 `runs/${targetRunId}.json`；
   - 纠正构建与启动命令为 `npm run build && npm start`（构建产物入口为 `dist/index.js`，而非 `dist/src/index.js`）；
   - 明确标注 `--projectId` 缺省时的自动选择行为。
4. **本轮实际执行的验证命令与结果**：
   - `npm run check`（全端 3 份 `tsconfig` 类型检查 + 198 项单元与集成行为测试）：退出码 `0`，**0 类型错误，198 / 198 全部通过**（新增 [recovery-acceptance-gates.test.ts](../tests/recovery-acceptance-gates.test.ts) 等 6 项反例与聚焦验证）；
   - `npm run build`（后端 `tsc` 编译 + 前端 Vite 生产构建）：退出码 `0`，编译成功；
   - `npm run test:e2e`（Playwright 浏览器测试）：退出码 `0`，**24 / 24 项全部通过**；
   - `git diff --check`：退出码 `0`，工作区整洁。
   - **自动化测试总数**：**222 / 222 项全部通过**（198 单元/集成测试 + 24 Playwright 浏览器端到端测试）。
   - **事实声明**：本轮不含真实云端模型调用、不修改实际用户项目数据、不读取或输出真实凭据、不执行 Git Commit/Push/PR，应用层防护不声称具备 OS 级沙箱隔离。

## 第八批：独立多进程冷启动验收、非200响应有界预算与旧运行闭门策略落地（2026-10-28）

针对第七轮独立交叉验证发现的问题，落实三批深度修复与独立子进程验证：

### 第一批：恢复接口、整体验收门禁与真实授权状态一致性

1. **Markdown 恢复路由异常防御**：
   - 在 [http-server.ts](../src/infrastructure/http-server.ts) 路由处理中，严格在执行 `recoveryService.formatRecoveryMarkdown` 计算完成之后才调用 `res.writeHead(200)` 发送响应头；
   - 在路由 `catch` 块中加入 `if (res.headersSent) { res.end(); return; }` 安全拦截，彻底消除因不存在项目、权限拒绝、损坏记录或渲染失败引发的 `ERR_HTTP_HEADERS_SENT` 崩溃与未处理 Promise 拒绝。
2. **可选层级与整体验收门禁解耦（按需出现）**：
   - 彻底废除对空数组 `relevantUnits.length > 0 && relevantStories.length > 0` 的机械强制要求；在 [recovery.ts](../src/domain/recovery.ts) 中建立统一人端整体验收前置核验函数 `checkRequirementAcceptanceEligibility`；
   - 仅当需求自身验收准则全部核验通过，且所有**已存在的拆解子产物**（Units/Stories/BoltPlans）均达到 `done` 状态时即可推导 `REQUEST_HUMAN_OVERALL_ACCEPTANCE`（`executableNow: true`）；
   - 同步复用于 `pendingHumanGates` 判定与人端实际整体验收 API 入口（`acceptRequirement`），确保门禁展示与实际 API 规则严格一致。
3. **已过期/已撤销运行的下一安全动作准确对齐**：
   - 当 Run 处于 `waiting_human` 但工作区授权已超时过期时，在 [recovery.ts](../src/domain/recovery.ts) 中推导 `REVIEW_CANDIDATE_IN_HUMAN_BOARD` 并严格将 `executableNow` 标为 `false`，在 `blockingIssues` 中明确注明授权已失效，禁止直接应用，需在人端看板重新核对；
   - 当 Run 处于 `interrupted` 但缺少指纹或授权已过期时，推导 `REQUIRE_RUN_AUTHORIZATION` 阻断盲目恢复。
4. **底层结构校验器（RecordStructureValidator）注入恢复链路**：
   - 在 [recovery-service.ts](../src/application/recovery-service.ts) 中注入 `RecordStructureValidator`，并在 `getRecoveryView` 实时执行 Ajv 结构校验；
   - 发现结构缺口或格式错误时注入 `RecoveryBuildOptions.structureIssues`，使冷启动推导立即产出 `STOP_AND_REPORT_GAP` 并阻止后续模型调用。

### 第二批：底层非200流式读取、真实字节预算与无指纹旧运行闭门策略

1. **429/500 等异常 HTTP 状态码有界流式读取与已知消耗准确计量**：
   - 在 [model-provider.ts](../src/infrastructure/providers/model-provider.ts) 中，将非 200 错误响应体的最大读取上限严格绑定 `Math.min(4096, maxBytes)`（其中 `maxBytes` 取本次单步剩余输出预算 `stepRemainingBudget`）；
   - 在底层 reader 抛出错误时保留已读取字节数 `bytesRead`；
   - 在 [loop.ts](../src/harness/loop.ts) 的统一异常处理中捕获 `bytesRead` 并累加至 `run.metrics.outputBytes`，杜绝因失败导致已知消耗丢失或超限大错误体耗尽内存。
2. **缺失指纹旧运行严格闭门阻断（Fail-Closed Policy）**：
   - 在 [runtime-registry.ts](../src/infrastructure/providers/runtime-registry.ts) 中，`resolveBoundRuntime` 遇到 `!binding.fingerprint` 时抛出 `409 MISSING_RUNTIME_FINGERPRINT`；
   - 在 [harness-service.ts](../src/application/harness-service.ts) 中，`resume` 与 `fork` 在旧运行缺失指纹且调用方未显式提供合规 `runtimeId` 时严格阻断，禁止仅凭模型名称字符串绕过指纹校验。

### 第三批：冷启动上下文栈丰富性与多进程独立子进程验收套件

1. **最小可恢复上下文栈与丰富事实呈现**：
   - 在 [recovery.ts](../src/domain/recovery.ts) 与 [recovery-service.ts](../src/application/recovery-service.ts) 中，为 JSON 视图与 Markdown 视图完整补充 Intent 与 Requirement 的 `scope`（includes/excludes）、`constraints`、`acceptanceCriteria`；
   - 补充 `sources` 详细定位（`locator`、`excerpt`）与 `evidence` 详细事实（`subject`、`environment`、`observedResult`、`description`）；
   - 补充全部未知问题（`openQuestions`）与假设（`assumptions`），纠正“已采纳候选”为“已保留候选（待人工决定或未合入正式记录）”，并将账本路径规范纠正为 `runs/${targetRunId}.json`；
   - 在 `standards` 中详尽列出 5 大受控更新协议端点（POST records / POST runs / POST decision / POST apply / POST acceptance）。
2. **多进程原生子进程冷启动消费者套件**：
   - 建立 [recovery-cli-consumer.ts](../src/presentation/recovery-cli-consumer.ts)，支持独立命令行运行；
   - 在 [recovery-cold-start.test.ts](../tests/recovery-cold-start.test.ts) 中通过 `child_process.spawnSync` 原生子进程启动消费者，全面断言 14 种冷启动场景并全部通过；
   - 提供新会话独立验收简报：[cold-start-acceptance-brief.md](templates/cold-start-acceptance-brief.md)。
3. **本轮实际执行的验证命令与结果**：
   - `npm run check`（全端 3 份 `tsconfig` 类型检查 + 192 项单元与集成行为测试）：退出码 `0`，**0 类型错误，192 / 192 全部通过**；
   - `npm run build`（后端 `tsc` 编译 + 前端 Vite 生产构建）：退出码 `0`，编译成功；
   - `node --import tsx tests/harness-start-smoke.ts`（启动与重启持久化烟雾检查）：退出码 `0`，通过；
   - `npm run test:e2e`（Playwright 浏览器测试）：退出码 `0`，**24 / 24 项全部通过**；
   - `git diff --check`：退出码 `0`，工作区整洁。
   - **自动化测试总数**：**216 / 216 项全部通过**（192 单元/集成测试 + 24 Playwright 浏览器端到端测试）。
   - **事实声明**：本轮不含真实云端模型调用、不修改实际用户项目数据、不读取或输出真实凭据、不执行 Git Commit/Push/PR，应用层防护不声称具备 OS 级沙箱隔离。


## 第七批：执行与约束链贯通、失效与回退解耦与跨会话冷启动恢复落地（2026-10-27）

针对上一轮独立交叉审查意见，落实三批加固与能力建设：

### 第一批：执行与正式记录约束链贯通

1. **Run 剩余输出预算与 Provider 有界流式读取打通**：
   - 彻底解决 Provider 默认 10 MiB 上限与 Run `maxOutputBytes` 脱节的问题。在 [loop.ts](../src/harness/loop.ts) 计算单步剩余输出预算 `stepRemainingBudget = Math.max(0, maxOutputBytes - deltaOutputBytes)` 并传递给模型提供商；
   - 在 [model-provider.ts](../src/infrastructure/providers/model-provider.ts) 中，单次流式读取上限严格取 `Math.min(provider.maxOutputBytes, input.maxOutputBytes)`，流式 reader 实时累计并一旦超限立即中断连接抛出 `RESPONSE_SIZE_EXCEEDED`；
   - 明确区分原始网络响应字节（`rawResponseBytes`）与候选序列化字节，避免重复累计；在请求超限、超时、中断、无效 JSON 或流取消时，捕获失败前已读取字节并在 Run 账本中如实保留已知消耗（`outputBytes` 与 `deltaOutputBytes`）。
2. **依赖影响传播、核查失效与完成态回退分开解耦**：
   - 在 [record-candidate-mutations.ts](../src/domain/record-candidate-mutations.ts) 中彻底分开两类计算：
     1. **内容变更核查失效**：上游 Unit 内容修改时，沿直接与间接依赖图遍历所有下游对象（包含处于 `review`、`draft` 或 `done` 状态的 Story 与 BoltPlan），将其既有 `passed` 核查统一失效为 `unknown` 并追加失效说明注记，不能因 `status !== done` 被跳过；
     2. **完成态级联回退**：若下游处于 `done` 状态，当其直接上游依赖（`dependsOn` 或 Story 归属的 `unitId`）未处于完成态，或者其自身任何一条验收准则因核查失效不再具备 `passed` 核查时，自动回退至 `review` 待核对状态；
     3. 纠正 `BoltPlan.storyIds` 的语义为构建范围，解耦于上游前置依赖。
3. **彻底移除未知 ModelPort 伪造本地推断（Fail-Closed）**：
   - 彻底删除在缺少 `providerKind` 或 `endpoint` 时将未知 `ModelPort` 默认推断为 `scripted`、`local://in-memory` 的隐式兼容代码；未知能力统一抛出 `403 UNKNOWN_PORT_DENIED`，单元测试中的进程内测试替身显式声明 `providerKind: 'scripted', endpoint: 'local://in-memory'`。
4. **运行时配置身份与指纹持久化绑定**：
   - 在 [runtime-registry.ts](../src/infrastructure/providers/runtime-registry.ts) 中，`classifyRuntimeEndpoint` 严格拒绝 URL 查询参数和锚点（`400 UNSUPPORTED_RUNTIME_URL_QUERY`）；
   - `computeRuntimeFingerprint` 精确保留 URL 路径、模型标识和环境变量名的大小写（大小写敏感）；
   - 在 [run.schema.json](../schemas/harness/run.schema.json) 与 [harness.ts](../src/domain/harness.ts) 的 `ModelRuntimeBinding` 中持久化 `fingerprint`（最多 64 字符）；
   - 在 `resolveBoundRuntime` 中增加指纹一致性校验，防范重启后或运行时配置修改后的静默改道（`409 RUNTIME_CONFIG_CHANGED`）或缺失绑定（`409 MISSING_RUNTIME_BINDING`）；
   - 在 [workspace-tools.ts](../src/infrastructure/workspace-tools.ts) 中，严格核对文件大小写匹配，仅在物理磁盘路径确为同一文件时允许安全源码访问。

### 第二批：恢复模块纯函数派生与全生命周期状态机

1. **纯领域函数聚焦投影（方案 A）**：
   - 在 [recovery.ts](../src/domain/recovery.ts) 中实现 `buildRecoveryProjection` 与 `deriveNextSafeAction`，复用正式关系校验 `inspectRecordRelations` 并检查合同版本 `schemaVersion === '1.0.0'`；
   - 动态构建经过验证的 `prerequisitesMet`，杜绝任何静态空洞占位；
   - 全面覆盖 14 种生命周期状态推导：`NO_REQUIREMENTS`、`INTENT_UNCONFIRMED`、`ALL_COMPLETED`、`SELECT_TARGET_REQUIREMENT`、`REQUIREMENT_ALREADY_COMPLETED`、`AWAIT_ACTIVE_RUN`、`REVIEW_CANDIDATE_IN_HUMAN_BOARD`、`RECONCILE_STALE_RUN`、`RESUME_INTERRUPTED_RUN`、`CHECK_FAILED_RUN`、`INSPECT_CANCELLED_RUN`、`REQUEST_HUMAN_OVERALL_ACCEPTANCE`、`REQUIRE_RUN_AUTHORIZATION`、`EXECUTE_RUN_WITH_VALID_AUTHORIZATION`；
   - 严格在同一 Requirement 范围内关联 Run，存在多个未完成需求时返回 `SELECT_TARGET_REQUIREMENT` 由人端裁决，不擅自猜测。

### 第三批：冷启动验收测试套件与端到端验证

1. **完整的 10 大冷启动验收场景测试（`tests/recovery-cold-start-acceptance.test.ts`）**：
   - 场景 1：干净重启无内存泄露，回答 7 个核心问题；
   - 场景 2：存在多个未完成需求时请求人端明确选择；
   - 场景 3：全部需求完成时推导 `ALL_REQUIREMENTS_COMPLETED`；
   - 场景 4：子产物未完成时阻断整体验收；
   - 场景 5：正在运行的 Run 正确识别为 `AWAIT_ACTIVE_RUN`；
   - 场景 6：授权过期推导 `REQUIRE_RUN_AUTHORIZATION`；
   - 场景 7：取消运行推导 `INSPECT_CANCELLED_RUN`；
   - 场景 8：运行基准滞后于项目修订推导 `RECONCILE_STALE_RUN`；
   - 场景 9：关系完整性破坏推导 `STOP_AND_REPORT_GAP`；
   - 场景 10：不支持合同版本推导 `STOP_AND_REPORT_GAP`。
2. **本轮实际执行的验证命令与结果**：
   - `npm run check`（全端 3 份 `tsconfig` 类型检查 + 181 项单元与集成行为测试）：退出码 `0`，**0 类型错误，181 / 181 全部通过**；
   - `npm run build`（后端 `tsc` 编译 + 前端 Vite 生产构建）：退出码 `0`，编译成功；
   - `node --import tsx tests/harness-start-smoke.ts`（当前 `dist/index.js` 独立临时进程与重启恢复烟雾检查）：退出码 `0`，通过；
   - `npm run test:e2e`（Playwright 浏览器测试，指向本机 Google Chrome `channel: 'chrome'`）：退出码 `0`，**24 / 24 项全部通过**；
   - `git diff --check`：退出码 `0`，工作区整洁无空白或冲突标记。
   - **事实声明**：本轮不含真实云端模型调用、不修改实际用户项目数据、不读取或输出真实凭据、不执行 Git Commit/Push/PR，应用层防护不声称具备 OS 级沙箱隔离。

## 第六批安全与一致性缺口修复与跨会话冷启动恢复（2026-10-27）

针对上一轮独立审查指出的 6 项安全/一致性缺口以及用户最新确认的冷启动恢复标准（引用《深入理解 AI-DLC》`references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch04-memory-bank-standards.md`），完成两批交付：

### 第一批：六项安全与一致性缺口修复

1. **大小写不敏感文件系统路径别名防御**：
   - 在 macOS 等大小写不敏感文件系统上，`read_file(".ENV")`、`protectedPaths: ['PrivateStore']` 曾可通过 `.ENV` 或 `PRIVATESTORE` 字符串大小写差异绕过检查；
   - 在 [WorkspaceToolExecutor](../src/infrastructure/workspace-tools.ts) 引入大小写折叠（case-folding）校验，并结合 `fs.realpathSync.native` 规范化物理磁盘大小写，确保黑名单、`protectedPaths`、`exclude`、`readScope` 及符号链接解析在任何大小写语义下均严格拦截。
2. **Provider 拒绝 HTTP 重定向（Anti-Redirect Hijacking）**：
   - 修复 Provider 底层 fetch 默认跟随 307/308 重定向导致请求正文与凭据转发至未授权目标的风险；
   - 在 [model-provider.ts](../src/infrastructure/providers/model-provider.ts) 配置 `redirect: 'manual'`，捕获 3xx 响应直接抛出 `403 REDIRECT_NOT_ALLOWED`，并记录目标 URL，严禁静默跨源重定向。
3. **上游 Unit 变更级联使下游核查失效（Cascade Downstream Verification Invalidation）**：
   - 修复此前仅回退下游 Story/BoltPlan 状态至 `review` 却残留下游 `passed` 核查记录的问题；
   - 在 [record-candidate-mutations.ts](../src/domain/record-candidate-mutations.ts) 中，当上游 Unit 内容修改时，级联将其所有直接或间接下游依赖的 `passed` 核查统一置为 `unknown` 并追加失效说明注记，完整保留原判断、`evidenceRefs` 与 `sourceRefs`，普通人端编辑与模型候选逻辑完全一致。
4. **Provider 有界流式读取与超限中断（Bounded Stream Reading）**：
   - 废除原先将整个响应体一次性读入内存后再校验候选大小的做法；
   - 在 [model-provider.ts](../src/infrastructure/providers/model-provider.ts) 实现 `readStreamBounded` 流式读取，一旦累积字节超过 `maxOutputBytes`，立即调用 `reader.cancel()` 中断网络连接并抛出 `413 RESPONSE_SIZE_EXCEEDED`；错误响应同样施加 4096 字节有界截断，并记录失败前已消耗字节。
5. **运行时配置指纹与完整路径绑定**：
   - 修复此前仅提取主机名而丢弃 `/tenant-a` vs `/tenant-b` 路径以及配置版本固定为 1 的缺陷；
   - 在 [runtime-registry.ts](../src/infrastructure/providers/runtime-registry.ts) 保留完整 URL pathname，计算非敏感配置 SHA-256 确定性指纹，配置变更时自增版本号，并严格拒绝缺少 `providerKind` 或 `endpoint` 的未知外部端口（Fail-Closed）。
6. **看板 UI 权限与范围真实展示**：
   - 在 [run-panel.tsx](../src/presentation/web/run-panel.tsx) 移除写死文案；根据运行时动态展示提供商与模型名称，显式区分 `整树只读` 与 `子集只读 [readScope]`，显式区分 `local_only` 与 `none`（未获准外发），并在候选保存预览中展示真实 `effects` 与 `warnings`。

### 第二批：跨会话冷启动恢复标准与纯聚焦投影（方案 A）

用户明确确认**方案 A（纯聚焦恢复投影，零 Schema 扩张）**，落地 AIDLC 第 4 章《内存库标准》：

1. **7 个核心问题确定性回答**：
   - 新会话或新 Agent 不依赖任何上一轮会话内存或对话历史，仅读取持久化入口（`RecordProject` 与 `HarnessRun`），通过纯领域函数 [recovery.ts](../src/domain/recovery.ts) 的 `buildRecoveryProjection` 与 `deriveNextSafeAction`，准确回答：①当前目标；②当前推进到哪里；③下一步安全动作；④为什么可以做；⑤适用哪些修订和授权；⑥依据与证据在哪里；⑦哪些事项仍未知或必须等待人工判断。
2. **确定性状态机与缺口停止机制（STOP_AND_REPORT_GAP）**：
   - 发现记录矛盾（如需求标记为 `done` 但缺少 passing 证据或核查为 `unknown`）、意图未确认（`proposed` 状态）或运行基准落后于项目修订时，绝不猜测推进，坚决输出 `STOP_AND_REPORT_GAP`、`REQUIRE_HUMAN_INTENT_CONFIRMATION` 或 `RECONCILE_STALE_RUN` 门禁，阻止自动或盲目执行。
3. **未决候选与正式业务事实严格隔离**：
   - 未应用的候选仅作为未决建议展示在恢复投影的 `pendingCandidate` 中，绝对不混淆为正式业务事实，正式进度仅由正式 JSON 记录决定。
4. **只读恢复接口与 Markdown 导出**：
   - [RecoveryService](../src/application/recovery-service.ts) 提供 `getRecoveryView` 与 `formatRecoveryMarkdown`，暴露只读 HTTP 接口 `GET /api/record-projects/:id/recovery`（支持 JSON 与 `?format=markdown`）。

### 本轮实际执行的验证命令与结果

- `npm run check`（全端 3 份 `tsconfig` 类型检查 + 167 项单元与集成行为测试，含 `tests/cross-verification-batch6-security-gaps.test.ts` 5 项安全测试与 `tests/recovery-cold-start.test.ts` 7 项冷启动恢复场景）：退出码 `0`，**0 类型错误，167 / 167 全部通过**；
- `npm run build`（后端 `tsc` 编译 + 前端 Vite 生产构建）：退出码 `0`，编译成功；
- `node --import tsx tests/harness-start-smoke.ts`（当前 `dist/index.js` 独立临时进程与重启恢复烟雾检查）：退出码 `0`，通过；
- `npm run test:e2e`（Playwright 浏览器测试，指向本机 Google Chrome `channel: 'chrome'`）：退出码 `0`，**24 / 24 项全部通过**；
- `git diff --check`：退出码 `0`，工作区整洁无空白或冲突标记。
- **事实声明**：本轮不含真实云端模型调用、不修改实际用户项目数据、不读取或输出真实凭据、不执行 Git Commit/Push/PR，应用层防护不声称具备 OS 级沙箱隔离。

## 独立交叉验证五批修复（2026-10-26）

针对上一轮独立交叉验证指出的可复现缺陷，按“先补反例行为测试、观察失败、再实施修复”的顺序分五批完成加固：

1. **第一批：运行时身份、授权检查与实际调用统一**：
   - 废除将自定义或默认 `ModelPort`（如 `DeepSeekModel`）登记为 `provider: 'scripted'`、`baseUrl: 'local://custom-port'` 的伪本地包装；`ModelPort` 新增 `providerKind` 与 `endpoint` 显式声明真实供应商与端点，未知端点或未声明端点的端口默认拒绝（`UNKNOWN_ENDPOINT_DENIED`），仅显式 `local://in-memory` 视为进程内非外发端口。
   - 修复同名 `model` 静默覆盖及 `default` 端口遮蔽问题，多个不同运行时命中同一模型名且未指定运行时 ID 时拒绝模糊解析（`AMBIGUOUS_RUNTIME`）。
   - [run.schema.json](../schemas/harness/run.schema.json) 与 [HarnessRun](../src/domain/harness.ts) 持久化非敏感运行时快照 `runtime: { id, configVersion, provider, model, endpoint, external }`；`start`、`resume`、`fork` 与 `execute` 共享同一份 `ResolvedRuntime`。运行时配置更新递增 `version`，未显式切换模型前检测到配置版本变化即以 `409 RUNTIME_CONFIG_CHANGED` 阻断静默改道或外发扩权。
2. **第二批：逐次模型请求字节计量、工具去重、失败消耗保留与 `executionId` 隔离**：
   - 将模型调用与输入字节预算从“每次 `execute()` 固定记 1 次、仅算初始快照字节”改为在 `executeLoop` 每一次真实模型请求（`step` 或 `propose`）前检查、请求后累计，计量范围覆盖实际发送负载（快照 + 历史步骤与工具输出 + 工具 Schema / 提示词开销），并在代码与 UI 中明确区分 **UTF-8 负载字节预算**与 **LLM 分词器 Token 估算**；同步修正旧测试中固化的错误调用计数。
   - 修复恢复（`resume`）时将历史已完成的 `tool` 步骤重复累加到 `metrics.toolCallsCount` 的缺陷，仅累计对账阶段与新循环中新执行的工具调用；循环中途报错或超预算失败时完整保留已发生的 `calls`、`inputBytes`、`outputBytes` 与 `toolCallsCount`。
   - 为每次执行尝试分配独立 `executionId`，超时、取消或中断后的旧请求在检查点、指标、候选及完成/失败回调处全部核对当前活跃 `executionId`，杜绝迟到响应写入新一次执行。
3. **第三批：恢复 / 模型切换 / 分叉前置检查原子性、跨修订分叉守卫与完整工具继承**：
   - 重排 `resume()`（含会话内模型切换）与 `fork()` 的检查与写入次序：所有修订号（`run.revision` 及 `project.revision === run.baseRevision`）、授权有效期、运行时解析、外发边界（`egressScope`）与剩余请求/字节预算检查全部通过后才原子更新或创建 Run；任一前置检查失败均完整保留原 `candidate`、`state`、`model`、`runtime`、`turns` 与 `revision`。
   - 项目修订推进后（`project.revision !== parentRun.baseRevision`），携带旧步骤观察的分叉（`forkPointStep > 0`）默认以 `409 STALE_OBSERVATIONS_NOT_INHERITABLE` 保守拒绝直接继承旧观察，允许从第 0 步重新分叉或另起新 Run；跨修订继承的备选机制与取舍留待用户裁决，未擅自拍板。
   - 切换至仅支持 `propose` 的模型时，`buildProposeFallbackSnapshot` 完整保留历史工具调用名称、参数与完整输出（移除原先无提示截成 200 字符的逻辑），并按完整负载受 `maxInputBytes` 约束。
4. **第四批：完整符号链接解析链逐跳保护（`alias -> 受保护目录链接 -> 普通源码`）**：
   - 在 [WorkspaceToolExecutor](../src/infrastructure/workspace-tools.ts) 实现逐段 `lstatSync` + `readlinkSync` 符号链接解析链状态机，在每一跳验证逻辑相对路径与解析后物理路径是否处于工作区根内、是否在 `readScope` 内且未命中 `exclude`、是否触及内置敏感黑名单（`.git`、`node_modules`、`.agenthub`、`.env*`、SQLite 库、`runs`、`record-projects`、私钥）或实际配置的 `protectedPaths`。
   - 静态反例验证：工作区内 `alias` 指向 `.git` / `protectedPaths` / 工作区外 / `readScope` 外目录中的二级链接、再指回合法 `src/` 文件或目录时，`read_file`、`list_directory`、`search_code` 与异步搜索均拒绝或过滤；工作区内安全源码链接保持可用。仍明确不声称具备 OS 级隔离或抵御同一 OS 用户并发恶意 TOCTOU 替换的能力。
5. **第五批：普通编辑与候选初检 / 预览 / 应用共享语义差异与级联失效**：
   - 在 [record-candidate-mutations.ts](../src/domain/record-candidate-mutations.ts) 统一规范化语义比较与沿 `dependsOn` 依赖图的级联失效计算，供 `RecordProjectService` 普通人端编辑与 `HarnessService` 候选初检、预览、正式应用复用，同时保持人端与模型各自的权限门禁分离（不合并身份或权限通路）。
   - 纯键顺序或无序集合顺序重排不误撤销 `passed` 核查与 `Requirement.acceptance`；真实工作内容或验收条件修改（含单条准则改动、`BoltPlan.stages` 阶段顺序变化、向已完成需求新增未完成子产物）准确将受影响核查置为 `unknown`、级联回退依赖链下游已完成对象、撤销父需求整体接受并回退至 `review`，完整保留原证据、既有 `sourceRefs` 与审计前值；`HarnessService.preview` 与看板 `RunPanel` 真实展示 `effects` 与 `warnings`。
6. **本轮实际执行的验证命令与结果**：
   - `npm run check`（全端 3 份 `tsconfig` 类型检查 + 155 项单元与集成行为测试，含新增 `tests/cross-verification-batch1..5-*.test.ts` 共 16 项反例行为测试）：退出码 `0`，**0 类型错误，155 / 155 通过**；
   - `npm run build`（后端 `tsc` 编译 + 前端 Vite 生产构建）：退出码 `0`；
   - `node --import tsx tests/harness-start-smoke.ts`（当前 `dist/index.js` 独立临时进程与重启恢复烟雾检查）：退出码 `0`；
   - 浏览器 E2E 检查：直接执行 `npm run test:e2e` 时，因本机 `/Users/bobcgn/Library/Caches/ms-playwright` 缓存目录当前不存在而报错缺少 `chrome-headless-shell` 可执行文件（遵守规则未联网执行 `npx playwright install`）；改用临时配置指向本机已安装的 Google Chrome（`channel: 'chrome'`）运行同一套 `tests/browser/*.spec.ts`，**24 / 24 项全部通过**。模拟替身与自动化测试结果不代表真实云端模型表现或用户最终实际验收。

## 基建正确性、运行预算与对账恢复（2026-10-26）

- **切片 1：基建正确性与权限加固（Slice 1）**：
  1. **候选内部重复 ID 彻底拒绝**：初检、预览与保存统一对候选进行重合键校验，拒绝包含重复 criteria ID（`DUPLICATE_CRITERIA_ID`）、重复 unit ID（`DUPLICATE_UNIT_ID`）、重复 story ID（`DUPLICATE_STORY_ID`）以及重复 storyRef。杜绝候选内部出现伪造覆盖或双重判定。
  2. **`readScope` 与 `exclude` 真实生效**：支持明确的目录/文件清单，授权目录递归包含子目录，`exclude` 规则具备最高优先级；禁止任何未授权 glob 猜测；对逻辑路径与 realpath 同步校验，并在 Harness 执行时严格下发给 `WorkspaceToolExecutor`。
  3. **平铺目录搜索预算加固**：修复 `searchCode` 在平铺目录中遍历 entries 时未及时检查 `scannedFiles >= MAX_FILES` 的漏洞；单目录超过 200 文件时立即终止并如实标明截断原因 `max_files`。
  4. **非法参数严格校验与合法 JSON 截断**：
     - `readFile` 与 `searchCode` 收到非法类型、负数行号或越界参数时，直接抛出 `INVALID_ARGUMENT` / `INVALID_QUERY`，不静默改义或做宽容假设；
     - 16 KiB 截断由原先盲目字符串切片重构为结构感知裁剪（Pruning），序列化前按条目安全精简，保证返回的 `output` 永远是 100% 语法合法的 JSON 字符串。
  5. **预启动工作区授权交互与供应商展示**：看板 RunPanel 新增显式的工作区只读授权配置区（根目录、readScope、exclude），未勾选时严格传递 `tools: []`；真实展示模型供应商（本地替身 vs 云端 HTTPS）与外发范围。

- **切片 2：运行预算、可核验步骤账本与断点恢复对账（Slice 2）**：
  1. **诚实运行预算计量**：彻底废除断点恢复时的 `calls - 1` 退还作弊逻辑，断点恢复如实累计已有尝试；在 [run.schema.json](../schemas/harness/run.schema.json) 与 [HarnessRun](../src/domain/harness.ts) 增加 `metrics` 字段，精确追踪 `inputBytes`、`outputBytes`、`toolCallsCount` 与 `durationMs`，并在超限时立即熔断退出。
  2. **步骤账本与未完成工具轮次对账**：
     - 循环多步 ReAct 记录每一步的 `toolCallId`；
     - 中断恢复时，在发起 `model.step` 前先执行 `reconcilePendingToolTurns`，对比 assistant 的 `tool_calls` 与已记录的 tool turns，补齐并执行未完成的工具调用；
     - 界面直观呈现公开步骤账本（调用名称、参数、路径、结果），绝不伪造或展示任何隐式 CoT。
  3. **丰富聚焦大纲与跨会话事实继承**：
     - `buildContext` 聚焦大纲增强提炼当前需求准则、Unit 职责与输入输出接口、Story 价值与同需求依赖、Bolt Plan 阶段与退出条件；
     - 上下文严格从正式 JSON 记录继承，排除未应用的运行候选，保持事实源纯净。
  4. **默认整树工作区范围、外发强约束、Multica 风格运行时管理、同一会话模型切换与粒度 2 会话分叉**：
     - **默认整树范围与实际受保护目录拦截**：授权工作区后默认 `readScope: ['.']` 递归覆盖全部子目录，无需手工列举子目录，禁止缺省回退 `process.cwd()`；逐级核查逻辑路径、中间软链接解析路径与最终 `realpath`，同时拦截内置敏感黑名单（`.git`、`.env*`、`record-projects`、`runs`、`.agenthub`、SQLite 库、私钥等）与实际配置的存储目录（`protectedPaths`）；`search_code` 采用异步分批扫描并定期 `setImmediate` 让出事件循环；
     - **外发边界实际生效（`egressScope`）**：在 `start`、`resume`、`fork` 与 `execute` 全链路核查目标运行时的端点属性，当包含工作区授权或历史工具账本而 `egressScope` 为 `local_only` / `none` 时，立即以 `403 EGRESS_OUT_OF_SCOPE` 阻断向外部公网模型端点发送数据（且不读取对应 API Key 环境变量）；获准公网外发时记录 `egress_authorized` 事件；
     - **Multica 风格运行时注册表**（[runtime-registry.ts](../src/infrastructure/providers/runtime-registry.ts)）：提供 `scripted-v1`、`deepseek-chat`、`deepseek-reasoner`、`openai-compatible` 预设运行时，支持自定义修改或新增运行时，强制校验 `apiKeyEnv` 仅存环境变量名、拒绝明文密钥；
     - **同一会话内模型/供应商切换**：`resume()` 支持在同一 `HarnessRun` 内切换至新模型/运行时，自动执行未决工具对账（`reconcilePendingToolTurns`）、保留客观工具账本 `turns`、自适应转换 `step`/`propose` 协议并记录 `model_switched` 事件；
     - **Codex 风格粒度 2 会话分叉**：`fork()` 与 `POST /api/runs/:id/fork` 支持从任意步骤 `forkPointStep` 分叉出新会话，记录 `fork: { parentRunId, parentRevision, forkPointStep }` 血缘并继承前置步骤账本，不重复执行已完成工具且不污染父会话。

- **全套工程验证指标**：
  - TypeScript 类型检查：`tsc` 全端（3 个 tsconfig）**0 错误**通过；
  - 自动化单元与集成测试：**139 / 139** 项全部通过（含新增 `tests/session-fork-and-model-switch.test.ts` 6 项专项验证）；
  - 浏览器端到端测试：`npm run test:e2e` **24 / 24** 项 Playwright 测试全绿通过；
  - 生产构建：`npm run build` 成功。

## Harness 架构审查修复第一批与第二批：记录一致性与工作区外发边界（2026-10-26）

- **第一批遗留问题修复（记录一致性与范围漏洞）**：
  1. **纯变更计算与领域统一**：抽取纯领域函数 `simulateCandidateMutation`，统一人端普通编辑、候选初检（`checkedCandidate`）、预览（`preview`）与正式保存（`applyRunCandidate`）四处通路的失效与状态迁移计算，彻底消除多套分叉语义。
  2. **覆盖失效与审计回填**：Story/Unit 覆盖修改工作内容时，严格使关联核查置为 `unknown` 并撤销父需求整体接受；`preview.before` 与 `audit.before` 如实回填被覆盖的原对象完整清单与 `effects` 影响，杜绝将覆盖错误审计为新增。
  3. **已完成需求新增条件初检放行**：初检与保存统一采用模拟状态（先回退为 `review`、撤销接受），顺利放行至 `waiting_human`，不再报 `MISSING_PASSING_EVIDENCE` 虚假拒绝。
  4. **键顺序与空白规范化**：建立稳定业务字段归一化比较（`normalizeCriterion` / `areCriteriaEqual`），纯键顺序差异或首尾空白不误触发状态回退或接受失效。
- **第二批确认决策实施（工作区读取与外发边界收紧）**：
  1. **链接策略 B（Symlink Policy B）**：在 `WorkspaceToolExecutor` 严格核对逻辑路径、中间目录解析与最终真实物理路径（`realpathSync`）。允许工作区内部普通源码符号链接；阻断指向工作区外部的符号链接（`PATH_TRAVERSAL_DENIED`）、指向受保护敏感文件（`.git`、`node_modules`、`.agenthub`、`.env*`、SQLite 库、`runs`、`records`、私钥）的链接（`PROTECTED_PATH_DENIED`）以及循环链接（`SYMLINK_LOOP_DENIED`）。
  2. **工作区授权与缺省边界**：项目创建不强制绑定工作区；未配置或未显式授权工作区的 Run，模型可调用的 `tools` 严格为 `[]`，不回退到当前目录或环境变量；仅提供结构化快照，模型不能发起工作区读取。显式授权的根目录、读范围与外发边界持久化在 Run 记录中。
  3. **资源消耗与工具边界收紧**：
     - 工具输出执行严格的 16 KiB (16384 bytes) UTF-8 字节上限，采用 `StringDecoder` 安全截断，不破坏多字节 UTF-8 字符序列，杜绝乱码。
     - `readFile` 使用文件描述符流式按行扫描，单行最大 4096 字符，单文件扫描预算 512 KiB，大 `startLine` 无法绕过扫描预算。
     - `searchCode` 限制目录深度 (<= 8)、文件总数 (<= 200)、扫描字节 (<= 1 MB) 与匹配数量 (<= 25)，明确区分未找到（`count: 0, truncated: false`）与扫描受限截断（`truncated: true`）。
  4. **真实 UI 呈现与客观威胁模型**：UI 真实展示模型服务商（本地替身 vs 云端 DeepSeek）、网络外发范围与工作区工具范围；安全文档明确声明应用层检查不是完整 OS 沙箱，无法抵御同 OS 用户下的并发恶意 TOCTOU。
- **全套验证指标**：
  - 类型检查：`tsc` 全端（根项目、web 端、测试端）0 错误通过；
  - 自动化单元与集成测试：**122 / 122** 项全部通过；
  - 浏览器端到端测试：`npm run test:e2e` **24 / 24** 项 Playwright 测试全绿通过；
  - 构建产物：`npm run build` 成功。

## AIDLC 候选动作扩展与低开销聚焦投影（2026-10-26）

- 用户明确要求确保 AIDLC 开发周期主要对推进形成约束，而不是造成巨大的 Token 与认知开销。已完成候选动作对接 `schemas/records/` 体系与聚焦投影：
  1. **契约扩展**：升级 [candidate.schema.json](../schemas/harness/candidate.schema.json)，支持 4 类精准的 AIDLC 候选动作（`append_context`、`propose_criteria`、`propose_decomposition`、`propose_bolt_plan`），通过 Ajv 与 `createRecordSchemaRegistry` 复用已有的记录合同 Schema。严格约束模型提议的子产物必须为 `status: "draft"` 且 `result: null`，决策候选必须为 `epistemicStatus: "proposed"`，从 Schema 层面杜绝模型自封完成或伪造确认。
  2. **原子应用与审计留痕**：在 [RecordProjectService](../src/application/record-project-service.ts) 与 [HarnessService](../src/application/harness-service.ts) 实现 `applyRunCandidate` 与全类型 `preview`。人端可在看板核对精准差异（Before / After），显式勾选确认后原子写入项目 JSON，提交前经 `validateRecordSet` 进行完整的领域关系检查，并记录不可篡改的 `RecordAudit`。
  3. **低开销聚焦投影（Focus Projection）**：在 [buildContext](../src/harness/context.ts) 实现聚焦大纲（`focusOutline`），将当前需求标记为 `[ACTIVE TARGET]` 并展开细节，同需求的子产物按状态压缩为单行元数据，严格杜绝向模型泄漏无关其他需求的私有内容，实现低 Token 与强锚定。
  4. **工程质量验证**：测试套件新增针对多类候选动作生成、结构拦截、安全防御及原子应用的单测，全端测试增至 **109 / 109** 项全部通过；`npm run build` 成功；`tests/harness-start-smoke.ts` 离线烟雾通过；`npm run test:e2e` **24 / 24** Playwright 浏览器端到端测试全绿通过。

## Agent 基建第一切片：Provider 高层抽象、沙箱工具与恢复检查点（2026-10-26）

- 用户明确要求完善 Agent 基建，为接入 LLM 后推进与已有的 JSON Schema 体系结合完成 AIDLC 开发做准备；并在切片规划中明确两项核心要求：
  1. **模型供应商高层抽象**：建立通用供应商层次与顶层抽象，支持后续低成本横向扩展其他 API（如 OpenAI、Claude、Qwen 等），杜绝重复造轮子。
  2. **意外中断与断点恢复机制**：完善对话因网络波动、超时或人端干预意外终止时的完整恢复机制。
- 已建立 `src/infrastructure/providers/`：
  - [OpenAiCompatibleProvider](../src/infrastructure/providers/model-provider.ts)：高层抽象基类，规范 OpenAI 兼容协议下的 `tools` / `tool_calls` 双向映射、Prompt 组装、流式/阻塞解析、JSON 候选清洗及统一 HTTP 错误码映射。
  - [DeepSeekProvider](../src/infrastructure/providers/deepseek-provider.ts)：DeepSeek 专用实现，内置 `DeepSeek-V4.1-Flash-1017` ↔ `deepseek-flash` 别名映射，以及 `DEEPSEEK_AUTH_ERROR`、`DEEPSEEK_RATE_LIMIT`、`DEEPSEEK_API_ERROR` 专有错误归一化。
- 已实现只读工作区沙箱工具 [WorkspaceToolExecutor](../src/infrastructure/workspace-tools.ts)：
  - 支持 `list_directory`、`read_file`、`search_code` 三项只读能力，提供原生 JSON Schema 工具契约定义。
  - 防御机制：严格的 Path-Jail 防逃逸检查（拦截 `../` 及越界绝对路径）、敏感目录/文件屏蔽（`.git`、`node_modules`、`.agenthub`、`.env*`）、输出大小截断（最大 16 KiB）与按行切片支持。
- 已实现带检查点的多步 ReAct 循环与恢复机制：
  - [executeLoop](../src/harness/loop.ts)：Bounded ReAct 工具循环，支持上限 `maxToolCalls: 5` 预算熔断、单步执行回调 `onTurnCheckpoint`、AbortSignal 取消。
  - [HarnessService](../src/application/harness-service.ts)：将工具循环接入运行，网络异常/超时时状态转为 `interrupted` 并持久化当前已产生的 `turns`；在 `resume()` 时重查授权与项目修订，支持从断点 `turns` 继续发起后续调用，并补回中断时的调用计数（`calls - 1`）。
- 验证结果：全套代码及单测增至 **105 / 105** 项全部通过，`npm run build` 通过，`tests/harness-start-smoke.ts` 离线烟雾通过，`npm run test:e2e` **24 / 24** Playwright 浏览器端到端测试全绿通过。

## 接入 DeepSeek 云端模型（2026-10-26）

- 用户明确初版仅接入 DeepSeek，指定模型名称为 `DeepSeek-V4.1-Flash-1017`，并允许调用超时提升至 45 秒。
- 已实现原生 Node.js `fetch` 零第三方依赖的 [DeepSeekModel](../src/infrastructure/deepseek-model.ts)，支持环境变量 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）、`DEEPSEEK_MODEL` 与 `HARNESS_TIMEOUT_MS`。未配置 Key 时平滑回退至本地 `scripted-v1`。
- 模型调用开启 `response_format: { type: "json_object" }`，并在 System Prompt 中注入 AI-DLC 角色定位与 Draft 2020-12 候选 Schema 规范；实现防御性 Markdown 代码块剥离，严格经候选校验器验证。
- 经真实 API Key 调试验证：DeepSeek 云端端点在模型参数传入 `deepseek-flash` 时成功返回状态 200 与符合 Schema 的待核对问题 JSON 候选；测试套件新增 6 项针对 DeepSeek 适配器（含鉴权失败、限流、服务错误、代码块容错、取消响应及真实 Harness 事务入库）的单测。
- 本轮 `npm run check` 全端类型与 **93 / 93** 行为测试通过；`npm run build` 通过；`npm run test:e2e` **24 / 24** Playwright Chromium 场景全绿通过。已验证离线启动烟雾测试正常退出。

## 最小 Harness 与跨会话继承（2026-10-26）

- 用户确认首个候选范围为当前 Requirement 的未知问题 / 假设；同时需要保留候选与人端确认应用两条路径，使用 AgentHub 项目作为测试版本中的隔离自测项目。核心要求是 Harness 消费并维护适用 JSON 信息，跨会话读取正式进度，而非依赖完整对话。最终应用形态为 Desktop App，图标采用用户图片；用户随后明确先完成 Harness，再决定桌面容器。
- 已实现模型端口、单次有预算步骤、带来源 / 修订的上下文快照、候选 Schema、范围 / 关系 / 修订检查、等待人工、取消和中断恢复。默认模型是 scripted-v1，不进行云端调用或真实语义提炼。必要约束与已确认决定不截断，可选内容按优先级省略并记录清单，不发送其他需求、全部审计或迁移历史。
- 新增独立 Run JSON 合同与持久化。Run 状态、停止原因、人工决定和应用回执独立于需求状态 / 核查 / 整体接受；运行数据保留受限输入和过程，不是可自由修改正式内容的第二事实源。单进程、本地文件与同 OS 用户边界未改变。
- 正式项目接口新增人端运行入口；旧工具令牌不扩权。Harness 只保存候选和实际过程；人端核对预览并确认后，RecordProjectService 追加未知 / 假设及最小出处，仍为 unknown / proposed，不改 Intent、工作状态或验收。正式项目保存后若 Run 回执中断，恢复根据已有审计回执核对，不重复追加。
- 需求详情新增“需求运行”，可提交短问题、查看输入依据与继承信息、过程、候选、保留 / 退回、预览 / 确认保存及取消。重启保留历史，未结束调用标为中断，不自动重发；继续判断前重查范围、修订和授权。运行授权 24 小时，到期后须本人核对，取消会撤销。
- 已复用 v1 Schema / 关系校验、正式保存、身份 / Origin、修订、幂等和空 SSE 通知；未引入依赖或更换记录体系。用户图标原样复制到前端静态资产并用作页面图标，未编辑图片、未打包 Desktop。
- 本轮 npm run check 全端类型及 **80 / 80 行为测试**通过；npm run build 通过；npm run test:e2e **22 / 22 Chromium 场景**通过。新增 19 项行为边界和 3 项浏览器场景，覆盖 AgentHub 隔离自测、保留 / 应用、继承、越界、过期、取消、预算、恢复与回执中断；未以替身测试声称真实 LLM 表现。
- 当前 dist/index.js 的独立临时进程检查验证页面 200、未登录 401、正式保存、停止重启后的候选 / 长期信息保留，以及新运行读取该 JSON；结束清理。桌面及窄屏截图已查看。未读取真实凭据、修改实际项目或执行 Git 写操作；试用及限制见[指南](harness-quickstart.md)。
- 另以真实 npm start 启动隔离空库，确认页面 200、未登录正式记录接口 401，停止后确认端口关闭并清理临时数据。21 份项目 / 样例 Markdown 的 395 个本地链接及锚点、91 个相关文本文件的 UTF-8 / LF、JSON 语法及行尾空白检查通过；git diff --check 无问题。图标与用户原图逐字节一致，尺寸 1254 × 1254。
- 真实模型、自动对话提炼、完整聊天、Unit / Story / Bolt 自动规划、Shell / 代码执行、Git / CI、OS 强制隔离与桌面容器仍未实现或未准入；用户最终人工验收保留。历史检查只适用于其原覆盖范围。

## 客户端业务文案调整（2026-10-26）

- 用户试用确认新 UI 符合预期，并要求“建立 JSON 项目”改为“新建/导入项目”，JSON Schema 属于底层实现，不适合作为客户端操作名称。此反馈确认本轮界面方向，不代表完整产品或真实执行验收。
- 已更新弹窗标题、侧栏与空状态入口，移除侧栏 JSON 标识；保存 / 导入提示、导航及同步的可访问名称改用项目和记录等业务术语。原高级编辑及完整记录查看能力保留，以业务名称呈现。当前导入仍为既有旧项目核对预览流程，本轮未新增通用文件导入、修改底层合同、权限或实际数据。
- 已同步项目规则、决策说明、试用指南及现有浏览器测试定位；未新增低影响文案专用测试。npm run check 全端类型和 61 / 61 项行为测试、npm run build、npm run test:e2e 的 19 / 19 项浏览器回归均通过。

## 正式 JSON 项目看板与迁移（2026-10-25）

- 用户在反向对话中选择直接替换正式项目看板，同时确定保存方式与旧数据适配；随后选择迁移预览，每个旧正式 Issue 生成 Requirement 草案，父子与批准历史保留来源，本人确认后另存 JSON，旧库保留。它扩展上一轮独立合同的范围，见[D13](decisions.md#正式-json-项目看板与迁移确认2026-10-25)，仍不含 Harness、模型或 Git 写操作。
- 默认首页为正式五状态 Requirement 看板；详情按合同展示问题、边界、理由、影响、验收条件，以及按需出现的 Unit / Story / Bolt Plan。支持分块表单 / 高级 JSON 手动编辑、长期信息、出处、证据、逐条件核查及一个最终 PR（注：历史单 PR 规则已于 2026-10-30 由 SC-005 明确废除并升级为可选 0..N 个 PR，见[路线图](json-schema-roadmap.md)）。拖动需预览并确认，整体接受走独立人端入口，不直接据状态宣称执行成功。
- 新 RecordProjectService 复用 Schema / 关系校验与现有鉴权、Origin、通知基础；保存前展示差异和关联影响，显式确认、幂等与修订号检查阻止重复及覆盖。内容变化使相应旧通过回到 unknown，已接受需求或子产物变化会撤销当前整体接受；历史保留旧值及变更理由。来源与观察证据采用追加更正。
- 正式 JSON 项目外层保存项目名、revision、迁移映射与审计，records 保存 v1 业务合同。默认与旧库同级 record-projects，每个项目一个 JSON；临时写入、fsync、原子替换，当前单进程冲突检查。不提供团队、目录管理或 Git 版本管理，不声称多进程锁或同 OS 用户防篡改。
- 迁移只在明确确认后落盘。旧 B1 批准、B3 修订 / 批准、普通记录和父子关系保留出处，旧关键历史完整内容可只读查看；不推断分层或新验收。迁移后旧项目业务用例拒绝写入，仍可从只读来源视图撤销旧令牌，账户和原业务内容不删除。预览后原内容变化会拒绝旧预览。
- 迁移后的 Intent 新表示为 proposed，原问题 / 结果保留，缺失边界明确待核对；原验证说明在 Intent 关键上下文中可见。迁移确认不等于确认新表示，后者须另登记商讨并明确确认。已确认 Intent 正文不允许通用编辑，新界面尚无完整 Intent 修订流程；不得以占位边界扩大权限。
- 新 JSON 接口只供已登录人端，旧工具令牌不自动扩权；原 CLI 继续供未迁移项目使用。LLM 自动提炼、外部工具的新结构提议 / 审批、Harness、真实运行、Git / CI 与真实项目有效性仍未实现或验证。
- 本轮 npm run check 退出 0：全端类型和 **61 / 61** 行为测试通过，新增 10 项正式 JSON 用例 / 真实 HTTP、持久化、迁移与失败边界测试。npm run build 退出 0；没有新增依赖或更改上游参考。
- 本轮 npm run test:e2e 退出 0：**19 / 19** Chromium 场景通过，包含保留旧版入口的 15 项回归及新首页 4 项。新场景覆盖初始意图、Requirement 状态列、三层新增 / 关联、已有子产物编辑及重载、自动同步、草稿与修订冲突、写入失败、读取重试、不完整验收拒绝、迁移预览 / 确认 / 只读来源及旧令牌撤销。截图位于忽略的 test-results，已实际查看桌面看板、详情与窄屏布局。
- 真实 npm start 使用一次性临时库 / JSON 目录及动态端口验证：页面 HTTP 200，未登录新 API 401，人端创建 201，停止重启重新登录后读取 200、内容一致；结束清理。不读取或迁移实际用户数据，测试中的确认 / 接受为演示，不代表用户对新看板实际验收。
- 本轮文档检查通过：20 份 Markdown 的 377 个本地链接 / 项目内锚点可解析，57 个相关文件的 UTF-8 / LF、JSON 语法及行尾空白均通过。
- 代码、合同、规则、治理、架构、安全、决策与操作指南已同步；使用及限制见[正式看板指南](record-board-quickstart.md)。当前技术检查支持评阅与试用，语义正确性、真实证据与实际接受仍由用户判断。

## JSON Schema 记录合同首版（2026-10-25）

- 独立合同轮次中，用户明确仅聚焦 JSON Schema 这一 Requirement，并要求开始规划与实现，未决点必须反向对话。已复用仍适用的 Intent 和边界，不再等待 Harness 或成熟 UI。
- 新确认包括：长期 JSON 提炼关键上下文，完整对话不作为长期 Markdown 必备档案；Requirement 是 Intent 的拆解结果 / 看板 Issue，一个 Requirement 对应一个 PR；子产物分别验收。本轮追问后，用户选择保留可选 Unit / Story / Bolt Plan 分层，并保留最小出处。见[D12](decisions.md#json-schema-requirement-确认与实现2026-10-25)。
- 已新增 schemas/records/ 下 11 份 Draft 2020-12 Schema、类型、纯领域关系检查、应用层组合与 Ajv 基础设施适配；独立命令 records:validate 只读 JSON 快照并报告结构 / 关系问题。数据合同版本为 1.0.0，不涉及生产记录目录或 Git 管理方案。
- 精确新增 ajv 8.20.0 并同步 package-lock.json；安装忽略生命周期脚本。未改动现有模型、服务 / HTTP / CLI、数据库、界面或用户实际记录。独立命令不接正式写入、不能鉴定人端决定或证据真实性；模型提炼、存储迁移、Harness、模型调用和 Git 操作均未实现或执行。
- 计划样例与合成完成样例，以及未知来源 / 跨需求 / 缺少核查的失败样例已建立。所有演示来源、接受及 PR 都明确为合成内容，不能算作实际用户验收。
- 本轮 npm run check 退出 0：全端类型及 51 / 51 行为测试通过，新增 17 项记录合同测试。npm run build 退出 0；编译后的校验命令接受两份合法样例，以退出码 1 拒绝跨需求样例并给出 INVALID_UNIT 路径。
- 真实 npm start 使用一次性临时库 / 动态端口验证：页面 HTTP 200、未登录 API HTTP 401，结束清理；未读取实际账户或库。没有改动看板交互，本轮未重跑浏览器 E2E，历史 15 项结果不作为本轮新验证。
- 本轮另检查 19 份项目 / 样例 Markdown 的 351 个本地链接和项目内锚点，以及 36 个本轮修改文件的 UTF-8 / LF、JSON 语法与行尾空白，均通过。
- 字段与映射、失败边界、只读命令和效力限制见[合同说明](json-schema-contract.md)。当前工程实现具备评阅条件，用户对合同字段、语义与实际效果的最终接受仍待确认，不因上述技术检查宣称已完成整个 Requirement 的人工验收。

## 当前目标调整：记录体系与 Harness 优先（2026-10-25）

- 用户明确当前先建设 AgentHub 专属 Markdown + JSON Schema 记录体系和自有 Harness；结构化实例后续投影为类似 Multica 的分状态 Issue 看板，详情分块对应合同。最新设计建议见[建设计划](records-and-harness-plan.md)，确认范围见[D11](decisions.md#记录体系与-harness-优先2026-10-25)。
- 此前先做具体决策走读 / 审阅 UI 再推进模型与 Harness 的建议次序已被替代；LLM 参与的解释、审查和语义验证后置到模型接入，确定性合同、状态及权限检查仍随建设完成。先理解再推进及人工最终验收责任保留。
- 本轮核对 src/harness 仍仅有 .gitkeep；当前 package.json 没有模型客户端依赖。B1–B3 记录 / 审批基础保留，尚未实现专属 Schema、最小 Harness 或分状态结构化看板。本轮只同步计划与规范，没有修改源码、数据库、实际 Intent、安装依赖或调用模型。
- 本轮新增建设计划并同步共 12 份 Markdown；17 份项目文档的 322 个本地链接 / 项目内锚点、代码围栏、UTF-8 / LF 与修改行尾空白检查通过。未重跑源码 / 浏览器测试，不以计划或文档检查代替基础实现。

## 理解与决策意图再次确认（2026-10-25）

- 用户在多轮反向对话后明确确认完整意图复述，并要求文档纠偏。目标是从源头问题理解改动意义、核心业务逻辑与关键技术机制，并通过对应验收证据客观核对实际结果；理解与推进冲突时先理解再推进。
- 决策材料需要说明影响范围、备选方案的收益风险，提供对应参考资料；必要时按明确范围和适用授权实验验证。是否理解充分由用户判断，不能把材料保存、点击批准或模型解释当作理解已完成。
- 第一版先支持外部 Agent 材料进入 Hub 后的审阅、追问记录、补充、决定与追溯，Runtime 后续接入。现有 B1–B3 是记录和审批能力的部分实现，没有完整方案比较、核心机制解释或理解状态的工程证明，也不能实际约束外部 Agent 停止。
- 本轮已更新规则、治理、架构、验证、决策、README、相关阶段计划与决策材料模板。规范语义见[治理](governance.md#先理解再推进)，已确认决定见[D10](decisions.md#理解与决策意图再次确认2026-10-25)，后续建议见[计划](reference-correction-plan.md#纠偏后的推进次序)。
- 本轮只调整项目 Markdown；未修改源码、Schema、数据库或实际项目 Intent / 人工记录，未安装依赖、执行实验、启动 Runtime 或进行 Git 写操作。历史工程检查与人工反馈保留原适用范围，新要求尚待设计、实现与实际试用。
- 本轮修改 12 份项目 Markdown；检查全部 16 份项目文档的 303 个本地链接及项目内锚点、UTF-8 / LF、代码围栏与修改行尾空白，均通过。引用的上游 ADR 模板块保持原样。未重跑 npm / 浏览器测试，不以文档检查代替产品验收。

## 书籍参考纠偏（2026-10-25）

- 用户明确原参考错误，重新克隆 mancbj/aidlc-book-baojun《深入理解 AI-DLC》；当前路径为 references/aidlc-book-reference/aidlc-book-baojun/。本地与本轮核实的远程 main 同为 9ae1075d3c87f6c6ea626dbfc8b3d3a0132ae64e，最新 Release v0.9.007；仓库更新后须重新核查。
- 已纠正规则、对话前置章节归因、决策索引与下一步计划；旧 bojieli/ai-agent-book 的章节和 PDF 构建建议不再适用于本项目所指的书。具体事实见[纠偏记录](reference-correction-plan.md)。
- 新书的 Inception 工件、Standards、Bolt 与验证分层已定位；当前代码没有完整 Requirement / System Context / Unit / Story / Bolt / Standard 模型或正式 JSON Schema。现有 Intent、Issue、普通记录和关键修订不能据此被称为完整 AI-DLC 实现。
- 本轮只维护 Markdown；没有修改业务代码、Schema、数据库或项目实际 Intent，没有安装依赖、构建书籍、运行上游实验或进行 Git 写操作。B1–B3 的历史测试与人工反馈仍只适用于原覆盖范围。
- 本轮检查了 16 份项目 Markdown 中的 276 个本地链接及项目内标题锚点，目标和锚点均可解析；上游引用仅检查目标文件存在。修改文件未发现行尾空白。本轮未重跑 npm / 浏览器测试，未构建或验收新书 PDF。
- 本节保留参考纠偏当时的来源事实；其后曾提出先决策走读的建议，现已由用户最新的记录体系与 Harness 优先目标替代。现行次序见[建设计划](records-and-harness-plan.md)，不据此推定具体实现已完成。

## 初始文档轮次的事实与证据边界

- 初始文档轮次的用户输入说明当时目录为空；该轮创建前检查也观察到目录为空。
- 初始化后仅创建 README.md、AGENTS.md 和 docs/ 下六份指定 Markdown 文档；“初始化前为空”是有时间边界的事实，不表示文档创建后仍为空。
- 该轮输入是已确认架构决策摘要，不是源码、运行日志、技术实验或安全能力证明。
- 该轮仅做文档创建、读取与一致性检查，没有进行代码开发、构建、测试、安全实验、软件安装、服务启动、Sandbox / VM 配置、外部 Runtime 接入或 Git 写操作。
- 并行对话可能产生的其他文件不属于该轮验证范围，其存在不构成该轮已验证实现。

## 产品意图回顾轮次

- 用户曾授权通过反向对话重新理解产品意图，并在必要时修改项目文档；该轮仅调整 Markdown，没有启动代码开发、实验、服务或 Git 写操作。后续 TypeScript 初始化按下节新增授权单独记录。
- 已明确核心问题：理解速度跟不上 Agent 推进，以及规范记录与实际实现 / 验收发生语义偏移；目标是让人理解 What、Why 与有证据的 Result，并改善推进稳定性。
- 已明确大 Intent / 父 Issue、按源头问题边界划分子 Issue，以及推进前理解方案收益和风险。
- 已明确 Intent 通过对话前置形成：参考经更正书籍第 2 章“人的判断”，提前明确意图、边界、责任与验证方式，呈现方案取舍，由用户确认后进入正式交付拆分及授权执行；这是产品决策，不是已实现能力。
- 已明确优先云端模型 + 自有 Harness；本地小模型后续可辅助 Review / 总结，已有 Agent 接入后置并验证绕过风险。
- 已明确 Hub 承担提交前检查、本地测试通过后的获准提交推送和流水线反馈；用户介入最终实际运行验收，核对实际结果与 Issue / PR 所述影响。
- 已明确 Intent 是目标与预期行为的唯一规范事实源；修改须先商讨并获用户明确授权，不能通过改写派生记录掩盖语义偏移。
- 推送后的 CI/CD 与人工实际运行验收是两道交付门禁。原本地缺陷修复链路保留为技术验证切片，完整产品 MVP 边界待重新冻结。
- 当前目录另有 references/ 下两个上游参考仓库；其中代码、历史实验或发行物不构成 AgentHub 自有实现和验证证据。

## 阶段一设计推进（2026-10-23）

- 用户明确可以依据已有意图直接开始，真实项目后续导入验证，不将实际任务样本作为阶段一设计的前置条件。
- 已在架构文档形成首版闭环及六类功能区域的交互草案，在验证文档形成设计检查场景与后续真实项目验证边界。
- 功能区域、页面组织和首版具体范围属于待评阅建议，尚未获最终范围确认；阶段一不能据此宣称已完成验收或 MVP 已重新冻结。
- 该设计轮次没有导入真实项目、运行案例、开发源码或执行 X1–X5。草案和场景走读均不是技术或产品有效性证据。

## TypeScript 工程初始化（2026-10-23）

- 用户要求初始化 TypeScript 项目、创建对应目录并完善规则文档。当前任务只建立开发骨架，复用既有产品意图；未加入业务功能、云端模型、Agent 执行器、数据库或界面框架。
- 已建立 package.json、package-lock.json、TypeScript 开发 / 编译配置、.nvmrc、.editorconfig、.gitignore 和 src/index.ts。domain、application、harness、infrastructure、presentation 及 tests 目录通过 .gitkeep 预留。
- 工程采用单包 Node.js + TypeScript / ESM，无产品运行依赖。TypeScript 固定为 6.0.3，@types/node 固定为 24.19.2；版本是本次工程基线，不代表最终模型或平台选型。
- 当前入口只打印骨架说明。目录不是实现能力、运行时隔离、受保护记录或正式权限检查；references 未改动，不参与项目编译。
- 本次实际环境为 macOS、Node.js v24.16.0、npm 11.13.0。初次安装生成锁文件后，使用 `npm ci --ignore-scripts --no-audit --no-fund` 重建依赖成功；共安装两个直接开发依赖和一个传递类型依赖，未执行依赖生命周期脚本或安全审计。

| 实际检查 | 2026-10-23 结果与适用范围 |
| --- | --- |
| npm run check | 退出码 0，当前源码类型检查通过 |
| npm run build | 退出码 0，生成 dist/index.js 及 source map |
| npm start | 退出码 0，编译入口输出骨架说明 |
| node src/index.ts | 退出码 0，当前 Node.js 可直接运行入口 |
| npm run dev | 默认受限环境返回 EMFILE；在本次获准的本地执行环境中启动并进入等待文件变化状态，随后 Ctrl-C 停止，退出码 0；未验证修改文件后的自动重启 |
| 文档检查 | 8 份 Markdown 的 114 个本地链接与锚点可解析 |

这些结果只覆盖依赖恢复、静态检查、编译和入口启动；没有执行单元测试、云端模型、工具控制、CI、真实项目验收或 X1–X5。监听在受限环境下可能不可用，可用 `node src/index.ts` 单次运行；本次未通过更改系统文件限制或配置来绕过环境问题。

## Git 仓库初始化与首次推送范围（2026-10-23）

- 用户明确指定 [BobcGn/AgentHub](https://github.com/BobcGn/AgentHub)，并要求执行初始化推送。本轮据此获准 Git 初始化、远程配置、首次提交与推送，不扩展为 PR、Merge、Release 或产品运行验收。
- 初始化前本地根目录没有 Git 仓库；通过 SSH 检查目标仓库全部远程引用，返回成功且为空。本地已初始化 main，origin 的获取与推送地址均为 git@github.com:BobcGn/AgentHub.git。
- HTTPS 访问返回 403，已有 SSH 身份可访问同一仓库；未更改全局凭据、Git 身份或主机信任配置。
- 提交内容为项目规则、设计文档与 TypeScript 骨架；node_modules、dist、references 和本地 .env 已由忽略规则排除。提交前复跑类型检查、编译和入口启动均通过，暂存差异检查通过；本轮 8 份 Markdown 的 115 个本地链接与锚点检查通过。
- 远程投递与分支跟踪结果以实际 Git 引用和推送回执为准；本轮 Git 授权不代表技术实验 Pass、可信组件晋升或 MVP 验收。

## 阶段一分支与执行规划（2026-10-23）

- 用户此前要求开始阶段一，先签出对应分支并规划执行。该轮范围为分支创建、执行计划和相关文档同步，没有扩展为源码实现、新的 Commit / Push、远程 Issue 或技术实验。
- 操作前 main 工作区干净，基线为首次提交 f807bb6845f6988a131636db5749f55d4e89d2fb；已从该基线创建并切换到 phase/1-scope-and-interaction。本分支尚未推送，也未配置远程跟踪分支。
- 已形成[阶段一执行计划](phase-1-plan.md)：按首版范围与责任、最小交互、验收对应关系与评阅三个交付单元组织；这些是待执行计划，不是已完成的功能或已创建的 Issue。
- 阶段一仍沿用既有范围与交互设计定义，真实项目后续导入。已有六类信息区域仍是草案，尚未因分支或计划创建而获用户确认。
- 该规划轮次将 P1-1 的首版范围候选与责任表列为下一项；后续实际产出见下节。阶段验收、正式产品实现和技术准入不能由计划存在推导。
- 本轮文档检查通过：9 份 Markdown 的 141 个本地链接与锚点可解析，Git 差异检查通过。源码、依赖和编译配置与基线一致，因此没有重复运行构建、类型检查或产品测试。

## 阶段一设计执行与材料交付（2026-10-23）

- 用户随后明确允许对适用上游内容直接参考或使用，并要求开始阶段一。本轮据此完成 P1-1 至 P1-3 的设计材料，版本 P1-draft-1，见[集中评阅入口](phase-1-review.md)；不是产品源码实现。
- P1-1 已形成 C01–C08 范围候选、用户 / Hub / Agent 责任表与重要方案比较；P1-2 已形成工作区线框、核心衔接和虚构筛选修复示例；P1-3 已形成验收对应关系、V01–V11、作者设计走读和下一阶段事实缺口。
- 已直接提取上游固定提交的 ADR 与 Given / When / Then 模板块到 docs/templates；实际来源、许可和适配边界见[复用记录](phase-1-review.md#上游复用记录)。没有复制上游 Engine、Hooks / Sensors 或修改 references。
- 该设计轮次的 P1-draft-1 将 P1-A / B / C 列为 Proposed；后续用户确认与修订见下节。该稿产出本身不构成阶段验收或完整 MVP 冻结，X1–X5、技术 Pass 和可信晋升状态不变。
- 本轮仅做本地文档工作，没有新 Commit / Push、远程 Issue、模型调用、依赖安装、业务运行或安全实验。已有上轮未提交的文档工作保留并继续完善。
- 本轮检查通过：12 份 Markdown 的 173 个本地链接与锚点可解析；C01–C08 均有验收映射，V01–V11 定义完整且无重复，两个模板块与上游原文一致，Git 差异检查通过。作者走读还修正了将能力验证与人工批准混写的一处措辞。
- 已核对 src、tests、package.json、锁文件及 TypeScript 配置与 f807bb6 一致；本轮仅修改文档，因此未重复运行类型检查、编译或入口启动。这些静态检查不覆盖产品行为、受保护审批或安全机制。

## 反向对话后的交付顺序与责任确认（2026-10-23）

- 用户明确先做项目 Intent / Issue 看板与概览，Agent 设施完善后再接入实际 Runtime；云端优先与完整闭环目标保留。当前设计稿为 P1-draft-2，规范确认见[决策索引](decisions.md#阶段一反向对话确认2026-10-23)。
- 用户明确三项信息重点：当前做什么 / 解决什么问题；方案选择的收益风险，经 Agent 反向对话后由用户最终决定；如何验证产出与最初意图一致。
- 用户确认先在 Codex 等外部 Agent 中对话，在 Hub 记录方案、取舍与用户决定；看板不要求内置模型，也未建立正式外部 Runtime 适配。
- PR 四段式及用户补充截图等证据已明确，已建立[PR 模板](templates/pr-description.md)。谁创建、何时创建、上传入口未被回答，不扩展为自动 PR 权限。
- 已将先行看板与后续 Runtime 的设计和验收分开，新增 V12–V14；具体布局、看板输入来源 / 录入流程及阶段整体验收仍待收敛。产品源码仍只有工程骨架，没有新增看板实现或 Git 写操作。
- 本轮检查通过：13 份 Markdown 的 184 个本地链接与锚点可解析，14 个场景定义完整且无重复，原有两个上游模板块仍与来源一致，Git 差异检查通过。源码、依赖和配置未改动，没有重复运行构建或产品测试；技术能力与实验状态不变。

## 工具写入与人工审批方向确认（2026-10-23）

- 用户进一步确认类似 Multica 的交互方向：提供 CLI 或其他形式工具完成写入，并由用户检查与审批；已记录 D8.5 并同步治理、架构和评阅材料。
- 没有把工具写入成功当作人工批准，也没有把“其他工具形式”升级为已选定 MCP、HTTP 或特定命令协议。后续用户已选择关键内容审批、普通记录可在划定边界内直接保存；具体边界的对象、操作和调整方式仍待澄清。
- 增加 V15 设计场景，验证预期为工具提交不伪造正式确认；当前尚无实际 CLI、看板、审批机制或安全验证。
- 本轮只同步文档：13 份 Markdown 的 186 个本地链接与锚点检查通过，15 个场景定义完整且无重复，两个复用模板块保持与上游一致，Git 差异检查通过；源码、依赖和配置未改动，没有构建、产品测试或 Git 写操作。

## 边界内自动记录与关键审批原则（2026-10-23）

- 用户选择关键内容审批、普通记录可直接保存，前提是严格处于划定的边界内；已记录 D8.6，并同步治理、架构、评阅及 V15。
- 已区分两项判断：普通记录是否处于允许边界，以及关键内容是否获得用户决定。任一条件不足都不能被“有工具可写”代替。
- 具体写入边界覆盖的项目 / Intent / Issue 与允许操作仍待设计；后续对话已明确清单外新增单元须先待审；没有自行增加默认全项目权限或批准工具、代码 / Git 执行。
- 本轮文档检查通过：13 份 Markdown 的 187 个本地链接与锚点可解析，15 个设计场景定义完整、两个复用模板块与来源一致，Git 差异检查通过；源码、依赖和配置未改动。CLI、审批保护与运行时能力仍未实现，没有新增 Git 写操作。

## 新增工作先审后纳入（2026-10-23）

- 用户明确选择清单外新增子 Issue 先形成待审建议，必须知道变动内容与理由；确认后才能纳入正式交付计划和获准范围，已记录 D8.7。
- 已同步治理、看板交互与评阅材料，新增 V16 设计场景，区分建议已提交、用户已确认、正式计划已更新与可实际执行。
- 当前审批核心原则已明确，下一步可按此收敛具体交互；不继续将新增工作能否自行纳入列为未决，也不将本轮回答扩大为整份交互接受或源码 / Git 执行授权。
- 已补充待审建议文字线框；本轮文档检查通过：13 份 Markdown 的 189 个本地链接与锚点可解析，16 个场景定义完整且无重复，两个复用模板块与来源一致，Git 差异检查通过。没有新增产品实现、构建、业务测试或 Git 写操作。

## 第一轮检查与编码规划（2026-10-23）

- 用户要求检查第一轮是否遗漏关键问题，若无则开始规划编写代码。已复核 D8.1–D8.7 与实际源码状态，业务目标、交付顺序、工具写入及人工审批原则足以支持编码规划。
- 已形成[看板编码计划](board-implementation-plan.md)：B1 最小提案审批闭环，B2 项目 / Intent / Issue 看板与边界内记录，B3 关键变更与范围审查，B4 故障、端到端与试用交付验证。
- React / Vite、本地 Node.js 服务和 SQLite / 驱动是可评阅技术建议，尚未作为已确认选型；依赖兼容、人端与工具身份区别、事务和版本冲突等工程问题在计划中明确列出，未用假设补成实现。
- 上游事务工具已只读检查，存在引擎依赖与 Bun 调用，暂不直接复制；已复用模板继续保留，数据库、CLI 解析和前端构建优先采用适用现有能力。
- 本轮仅做规划及文档同步，不创建源码 / Schema、安装依赖、启动服务、运行实验或 Git 写操作；源代码仍为 f807bb6 的工程骨架。阶段整体接受、正式 MVP Implementation Go、技术 Pass 和可信晋升均未由编码计划自动产生。
- 本轮检查通过：14 份 Markdown 的 198 个本地链接与锚点可解析，原有 16 个设计场景及 C01–C08 对应关系保持完整，两个提取模板块与上游一致，Git 差异检查通过。已核对源码、测试占位、依赖和编译配置与 f807bb6 一致；本轮没有重新构建或运行产品测试。

## B1 最小提案审批闭环实现（2026-10-23）

- 用户在 B1–B4 计划后明确要求开始代码编写；当前任务据此授权 B1 源码、Schema、必要依赖、对应检查和本地启动验证。没有推定新的 Commit / Push / PR、安全实验或模型 Runtime 接入。
- 已实现单包本地 Web：React 19.3.1、Vite 8.3.5、Node HTTP、better-sqlite3 13.0.3 / SQLite；TypeScript 6.0.3 保留严格与可擦除语法，tsx 4.23.15 仅作开发 / CLI / 测试运行器。版本由 package-lock.json 固定，不修改 references。
- 用户通过界面建立项目和初始 Intent，发放绑定该项目 / Intent 的工具令牌；CLI 仅查询和提交新增 Issue 建议。提案包含变动、理由、问题、边界、方案、收益、风险及验证；未批准不改变正式清单。
- 人端独立会话才能批准 / 退回 / 拒绝；批准将正式 Issue、提案状态、决定及计划版本在同一 SQLite 事务中保存，并持久化幂等结果。旧版本拒绝，重复请求返回同一结果；撤销令牌后直接请求失效。
- 人端账户由本人交互终端 setup 建立，无默认密码或 HTTP 自举；会话重启失效。接口来源 / Host / 正文限制、密码哈希和独立令牌支持本轮应用层测试，不证明同一 OS 用户下的隔离、可信审批或 Hub Protected Records。
- 界面提供 Intent 概览、提案列表及差异审阅、正式 Issue、范围发放 / 撤销；正式 Issue 明确标为尚未执行。当前布局可试用，尚未由用户接受；B2 普通记录与更完整概览、B3 关键修订及完整 B4 范围仍后续推进。
- 使用方式见[试用指南](board-quickstart.md)，示例为[虚构筛选提案](../examples/new-issue.json)。本轮没有导入真实项目、实际模型、工具执行、CI、Git 交付或真实人工验收。

| 实际检查 | 本轮结果与适用边界 |
| --- | --- |
| npm ci --ignore-scripts --no-audit --no-fund | 从锁文件干净恢复 34 个包，退出 0；没有执行生命周期脚本 |
| npm run check | 服务、前端、测试类型检查通过；11 / 11 行为测试通过 |
| SQLite / 用例 | 待审不改变计划；批准 / 退回 / 拒绝、范围、版本、幂等、重开读取通过；事务末尾注入写入失败，Issue / 提案 / 决定 / 计划版本完整回滚 |
| HTTP / 真实 CLI | 真实子进程调用服务；工具直接审批及伪造人工字段被拒；撤销、未登录、来源 / Host、正文 / JSON、登录限流及退出检查通过 |
| npm run build | Node ESM 与 Vite 前端构建成功，退出 0 |
| npm run test:e2e | Chromium 2 / 2 通过：UI 建项 / 初始 Intent → 范围 → 真实 CLI → UI 审阅批准 → 正式清单；保存失败保留输入、读取失败提示及 390px 无横向溢出 |
| 交互终端 setup | 临时演示库输入两次密码不回显；含首尾空格密码在正式服务可登录 |
| npm start 与进程重启 | 4319 临时实例提供构建页面；建项、工具提案、批准落库，退出后重新 npm start，项目 / Intent / Issue / 提案 / 决定 / 计划版本一致；旧会话 401，重新登录成功 |
| 视觉检查 | 已查看 test-results/b1-review.png 与 b1-mobile.png；截图为演示流程材料，不是用户实际验收 |

依赖评估中，一次不必要的 npm rebuild better-sqlite3 因用户全局 cafile 指向不存在文件而失败；未修改全局配置或关闭 TLS。该驱动自带 macOS arm64 模块，直接查询成功，之后已用干净 npm ci 及全套检查证明无需重编译。开发运行曾发现 .js 导入无法由 Node 直接映射到 .ts，现用 tsx 解决；检查未通过修改 strict 或 erasableSyntaxOnly 绕过。

正式启动验证的临时库、账户和 4319 服务已清理；浏览器测试服务使用临时库并正常停止。默认 .agenthub 真实账户未由 Agent 建立。工作仍在 phase/1-scope-and-interaction，保留此前文档改动；本轮源码及文档未提交 / 推送，未运行远程 CI。本轮 15 份 Markdown 的本地链接 / 锚点检查与 Git 差异检查通过；检查不包含远程页面可用性。

## B1 决定说明细化（2026-10-23）

- 用户提供试用截图，显示演示提案已批准纳入计划，并反馈按不同决定区分理由要求；随后明确沿用批准 / 退回 / 拒绝，后两者理由必填。已记录 D8.8，规范见[决定说明](governance.md#决定说明与处理结果)。截图支持该次界面操作结果，不推定整阶段或真实项目语义验收。
- 已同步领域与界面规则：批准说明可省略、为 null 或纯空白，统一保存为 null；退回 / 拒绝缺失或纯空白返回 DECISION_REASON_REQUIRED。非文本或超过 4000 字符仍拒绝，提案本身的理由要求保留。
- 界面随决定切换为补充说明（选填）、退回原因（必填）、拒绝原因（必填）；批准可直接提交，后两者空白时禁用提交；各动作草稿独立保留。无说明批准的历史展示为“未补充说明”，不代填理由；原有文本记录继续读取。
- 数据仍使用原有 SQLite JSON 记录，无需迁移或清空现有库；真实临时数据库检查了无说明 / 有说明并存、重开及幂等重放。没有访问或修改用户正在试用的数据库、决定和令牌，也未停止用户运行的服务。
- 本轮没有安装依赖、新建决定状态、接入 Runtime 或进行 Commit / Push。原有 B1 自动化材料与本轮结果应按各自轮次理解。

| 本轮检查 | 实际结果 |
| --- | --- |
| npm run check | 全端及测试类型检查通过；14 / 14 行为测试通过 |
| npm run build | 正式 Node ESM 与前端构建通过 |
| npm run test:e2e | Chromium 5 / 5 通过：原流程、失败输入保留、无说明批准、退回 / 拒绝必填及各自草稿 |
| 持久化与接口 | 空说明存 null，历史文字保留；同号空白 / 省略说明重放一致；工具仍不能批准；无理由退回 / 拒绝不改变待审提案或正式清单 |

本轮产物已重新构建；用户若仍运行此前的 npm start，需要自行停止后重新 npm start 并刷新 / 重新登录，以加载新后端规则。不需要重新 setup，也不需要删除数据库。已批准提案保留原决定，验证新交互需另提一条演示建议，使用新的 request-id。

## B1 自动同步修复（2026-10-23）

- 用户明确验收“决定说明按动作区分”这项修改通过；随后指出 CLI 新增内容后页面不会主动更新。验收记录限定于该项交互，不扩展为完整阶段或真实项目有效性验收。
- 原因是页面只在首次进入、手动刷新和本页操作后读取快照。现已用原生 SSE 接收服务端提示，写入事务成功后发布，再经原有鉴权接口读取数据；概览 / 列表 / 计数自动更新。已记录 D8.9，规则见[看板同步](governance.md#看板同步与审阅版本)。
- 保留当前项目、视图与说明草稿，新增待审内容不会自动获批。审阅保留最初所审版本；若另一窗口改变正式计划，提示重新核对并暂停提交，核对后再绑定新版本。后端原版本冲突保护保留。
- 自动同步明确显示连接状态；离线保留旧内容，上线 / 重连 / 返回页面后补读。读取暂时失败显示错误并在 2 秒后重试；会话失效提示重新登录。连续通知合并读取，退出后的旧响应不重新登入界面。
- 仅已登录人端可订阅，事件没有记录或凭据内容，工具身份被拒；会话在发布和 15 秒心跳检查，关闭服务时终止流并清理计时器。通知覆盖经本服务写入，直接改库、跨服务进程通知未实现；宿主隔离状态未改变。
- 本轮没有新增依赖 / Schema，没有接入模型、操作用户数据库或停止用户当前服务，没有 Commit / Push。已重新 build，使用中的旧 npm start 需重启并刷新 / 登录后加载新机制。

| 本轮验证 | 实际结果 |
| --- | --- |
| npm run check | 全端 / 测试类型检查通过，16 / 16 行为测试通过 |
| 通知接口 | 未登录 401、工具 403；失败写入不通知，成功后空事件；退出失效，重订阅与关闭流正常 |
| npm run build | 正式 Node ESM 与前端构建通过 |
| npm run test:e2e | Chromium 9 / 9 通过；真实 CLI 写入无需刷新即更新，草稿保留；双窗口旧审阅拦截；离线补读及临时读取错误自动恢复 |
| npm start | 独立临时库 / 动态端口启动真实 npm start，登录与 SSE 订阅成功；终止本轮自有测试进程后流正常结束，临时库清理 |

自动化使用虚构项目。随后用户回复“验证成果，结果符合预期”，据此记录本次 CLI 写入后页面自动更新的人工试用通过；结合上一轮确认，决定说明细化与自动同步两项反馈均已获得用户确认。用户未逐项描述全部故障场景，不将其确认扩大为所有自动化用例的人工复验、完整阶段验收、真实项目有效性、Runtime 准入或 X1–X5 技术 Pass。

本次仅同步验收事实与计划状态，没有修改源码、用户试用数据或 Git 引用，也没有重新运行构建 / 行为测试；已有自动化结果仍对应上表的实现轮次。


## B2 概览与边界内记录（2026-10-24）

用户在 B1 两项交互反馈确认后要求继续，本轮按既定 B2 交付推进，复用已确认 Intent 与 D8.6 的边界，不重新定义目标或验收。分支仍为 phase/1-scope-and-interaction，保留既有未提交改动。

- 概览新增正式交付单元和近期记录入口；Issue 详情展示原 Intent、父子关系、为什么纳入、批准方案、收益风险、验证计划及原提案 / 人端决定。计划状态明确尚未执行。
- 普通记录分为讨论摘要、备注、Agent 报告，可关联当前 Intent 或已有正式 Issue。人端可追加；工具必须由人端明确选择对象与类型后才能追加。历史令牌保持原权限，新子 Issue 不自动继承父对象的记录范围。
- CLI 新增 scope 与 record，overview 读取同一已保存内容。服务生成来源身份、范围 ID 与时间，拒绝伪造人工 / 验收字段；外部来源只是记录者文本。讨论不成为用户决定，Agent 报告标为未经实际运行核验。
- 写入检查 Intent 版本及关联归属；记录与幂等回执在同一事务内保存，失败回滚、同号同内容重放、同号不同内容冲突。普通记录不更新计划版本或覆盖关键内容。
- 新记录沿用 B1 SSE 自动同步，按对象保留当前登录页面的草稿；保存失败及切换视图不清除，刷新 / 退出清空未保存内容，已保存记录可重载。
- SQLite v1 → v2 以事务增加记录表 / 索引，不重写历史数据；临时旧库测试验证账户、原令牌、项目、提案、决定与幂等结果保留，更高版本拒绝。未访问或升级用户实际试用库，也未停止用户正在运行的服务。
- 无新增依赖，未修改 references，未接入模型 / Runtime、安全实验或 Git 写操作。

| 本轮验证 | 实际结果 |
| --- | --- |
| npm run check | 服务、前端与测试类型检查通过；24 / 24 行为测试通过 |
| npm run build | Node ESM 与前端生产构建通过 |
| npm run test:e2e | Chromium 12 / 12 通过，原 9 项回归及 B2 范围发放、真实 CLI 记录自动同步 / 草稿、失败保留与持久化、父子追溯；390px 无横向溢出 |
| 视觉检查 | 已查看桌面 Issue / 报告及 390px 详情截图，内容和标记可读 |
| npm start | 独立临时库与动态端口运行真实生产入口；页面、登录、范围内记录、停止 / 重启持久化、幂等重放及旧会话失效通过；自有进程 / 临时库已清理 |

截至 2026-10-24，B2 工程检查完成、用户试用尚待确认；后续两部分反馈见[人工试用记录](#b2-人工试用反馈2026-10-25)。B1 的交互验收不自动覆盖 B2，以上测试不证明真实项目稳定性改善、语义验收、宿主隔离或完整 MVP / E1–E4 成立。操作及人工试用步骤见[指南](board-quickstart.md#b2-试用检查)。已有安装需重新 build、停止旧服务并 npm start，再刷新 / 登录；无需重新 setup 或删除数据库。新记录权限须由本人明确发放，旧令牌不会自动扩权。


## B2 人工试用反馈（2026-10-25）

用户提供 CLI 输出，确认原 B1 令牌没有 record:append；本人发放新范围后，Intent / note 追加成功，服务返回与该工具对应的来源。随后两张截图和“刷新前后显示一致”确认页面已能显示该记录，重载后正文、类型、来源与关联一致。

用户再查看正式 Issue，反馈“内容显示合理，明确显示了范围和边界以及验证方式”。截图还展示关联 Intent、纳入理由、方案收益风险、原批准说明“合理”和提案决定入口。据此确认 B2 授权记录 / 刷新一致与 Issue 详情展示这两部分人工试用结果。未将截图扩大为父子链接逐项操作、重启、故障或越界场景的人工复验，也不等于真实项目有效性或完整 MVP 验收。


## B3 关键变更与差异审查（2026-10-25）

用户在 B2 两部分反馈确认后明确要求继续，沿既定 B3 及已确认 Intent 推进。当前分支仍为 phase/1-scope-and-interaction，保留此前未提交工作；本轮未进行 Commit / Push / PR。

- 新增精确对象范围的 change:propose。只有本人明确发放该能力及当前 Intent / 指定正式 Issue 对象后，工具才能提出关键候选；旧令牌不扩权，普通记录不能改关键内容。
- 候选保存对象 / Intent / 计划基准版本、服务读取的原内容、完整预期内容、理由与影响；界面逐字段显示修改前后。候选不支持原地替换，未批准时原内容保持有效。
- 人端批准应用 Issue 修订后，更新该 Issue 的版本和确认时 Intent 版本，并保存原快照、决定和计划版本；原提案与初始决定保留。退回 / 拒绝要求理由，批准说明选填。
- Intent 修订须先由本人登记已完成商讨的结论 / 来源，并明确授权这份候选；登记不改 Intent，再核对授权状态后另行批准。授权可以在应用前撤销，不能转移到其他候选，工具直接请求这些入口均被拒。该通路记录账户声明，不独立观察外部对话。
- Intent 应用后旧 Issue 保留原文并提示重新核对；旧新增提案不能批准，但可退回重提。旧修订基准失效不能应用；重新确认现有 Issue 对应新 Intent 仍需明确建议与人工决定。
- 修改、决定、计划版本及幂等回执事务提交，失败回滚；被审或基准变化均阻止旧批准。SSE 继续同步并保留当前审阅输入；修订历史链接能回查原 / 新内容及决定。
- v1 / v2 库增量升至 v3，增加 changes 表及索引，为旧 Issue 补版本 / 原 Intent 版本；临时库验证账户及旧记录 / 凭据 / 回执保留。本轮未操作用户实际数据库或停止用户服务。
- 回归发现项目增多时侧栏无滚动，导致新项目超出窗口，已补滚动区域并完整复验。无新增依赖，references 未修改，模型 / Runtime、安全实验与 Git 交付未接入。

| 本轮验证 | 实际结果 |
| --- | --- |
| npm run check | 全端与测试类型检查通过，34 / 34 行为测试通过 |
| npm run build | Node ESM 与 Vite 生产构建通过 |
| npm run test:e2e | Chromium 15 / 15 通过，含原 12 项及 B3 差异 / 范围 / 真实 CLI、独立商讨授权、跨窗口失效与草稿 |
| 视觉检查 | 已查看桌面 Issue 差异、390px Intent 商讨授权页，内容可读且无横向溢出 |
| npm start | 独立临时库 / 动态端口验证生产页面、登录、受限候选、人工应用与重启历史 / 原快照保留，旧会话失效；自有测试资源已清理 |

B3 已具备本地试用条件，**人工试用尚待确认**。B4 的更全面故障、端到端与交付整理仍独立保留；不由本轮测试宣称全部 V01–V16、E1–E4 或真实项目效果成立。入口及样例见[试用指南](board-quickstart.md#b3-关键变更试用)。已有安装需重新 build 并重启服务 / 登录，无需重新 setup 或删库；记录权限与关键建议权限分别由本人明确授予。

## 四类状态的含义

为避免把设计认可当成工程证明，应分别使用以下状态；它们描述不同维度，可以同时适用于同一能力。

| 状态 | 含义 |
| --- | --- |
| Confirmed Architectural Decision | 用户已确认的目标、边界与规则；不证明实现存在 |
| Unverified Technical Hypothesis | 候选机制是否满足要求仍缺真实实验依据 |
| Not Yet Implemented | 目前没有已确认实现证据的产品能力 |
| Not Authorized | 目前没有明确执行许可的实验、开发或高权限行为 |

Decision 保存已确认规范；Assumption 应明确标为待验证假设；Evidence 记录实际观察及其适用范围；Implementation Status 只能依据实现证据更新。四者不能互相代替。

## 已完成的架构决策固化

[决策索引](decisions.md)保存初始化五轮基线、D6 产品意图修订、D7.1 阶段一推进次序与 D7.2 工程初始化范围。初始化技术与治理基线主要包括：

- Developer Intelligence Hub / Agent Harness 定位和人工责任。
- Issue、Grant、Activity、Run、Evidence、Review、Decision、G0–G4 与权威事实来源。
- Hub 自有 DeepSeek Loop、单主要写入 Run、本地 Commit 和版本明确的本地 Review。
- Trusted Hub / Untrusted Agent、安全边界、候选 Sandbox / Git Broker 与降级恢复要求。
- 初始化的本地技术切片、E1–E4、X1–X5、X1/X2 契约、R1–R7 和四层准入；完整产品交付边界按本轮意图回顾复核。

这表示文档中完成了规则组织，不表示产品能力或可信组件已经完成。

## 尚未实现与未验证

| 对象 | 当前状态 |
| --- | --- |
| TypeScript 与 B1–B3 看板 | 概览 / 记录及关键修订已有实现；B2 两部分人工试用已确认，B3 已通过本地检查，待人工试用 |
| DeepSeek Agent Loop、Tool Executor 与运行生命周期 | Not Yet Implemented；未直接接入 DeepSeek |
| Hub Protected Records、可信审批及恢复 | SQLite 与接口角色 / 记录范围检查已实现 B1 / B2；宿主隔离和可信记录未证明，不能升级为 Trusted Protected Records |
| Sandbox 与 Trusted Git Broker | 没有已确认实现，候选机制属于 Unverified Technical Hypothesis |
| 能力等级与可信组件 | 没有已验证等级分配或已确认可信晋升 |
| Issue / PR / Evidence / Review 产品能力 | B1–B3 有 Intent / 提案 / 决定 / 正式 Issue / 普通记录 / 关键修订历史；PR / Evidence / Review 执行闭环仍未实现，无真实双门禁或人工验收证据 |
| 正式技术实验 X1–X5 | 全部未执行，没有已确认技术 Pass |
| 正式 MVP | 先行看板 B1–B3 已实现，不代表完整 Runtime MVP 已开始或完成；E1–E4 与推进稳定性 / 可理解性尚未获得真实项目验证 |

文档链接或术语一致性检查支持文档质量；B1 / B2 行为及浏览器检查支持其实际覆盖的看板功能，不证明 Agent 运行、宿主安全、远程交付或真实语义验收。

## 授权与准入现状

- 初始轮次获八份 Markdown 创建及检查授权，随后获产品意图对话与文档调整授权；两者本身均不包含代码、实验或 Git 写操作。
- TypeScript 项目初始化轮次获准建立最小入口、目录与开发配置、安装必要开发依赖并验证骨架；该轮本身不包含产品功能、模型接入、安全实验或 Git 写操作。
- 用户随后明确授权将当前项目初始化并推送到 BobcGn/AgentHub；该轮授权包含本地 Git 初始化、origin 配置、首次提交和推送，不包含 PR、Merge 或 Release。
- 阶段一先获分支与执行规划授权，现又明确获准开始本阶段设计并参考 / 复用适用上游材料；获准维护设计、模板、走读及相关文档，不由已完成的首次推送推定新的提交推送许可。
- X1/X2 尚未获得实际执行授权；不能推定 X3–X5 获得许可，所有正式实验仍须各自独立人工授权。
- X1 的 R1–R6 尚待真实环境采集，Preflight 不能据文档存在而宣称完成。
- X2 仍须独立完成 Preflight 与人工 Go/No-Go，不能继承 X1 许可。
- 正式 Runtime MVP Implementation Go 尚未作出；当前源码开发任务已覆盖 B1–B3 看板及对应检查，不能继续以历史骨架范围否定本轮授权，也不能扩展为模型工具执行、高权限能力或 Trusted Component Promotion。
- 本地 Commit 的产品设计规则本身不授予 Git 操作权限；首次提交推送来自上一轮明确任务，本轮分支创建来自当前明确任务，二者按各自范围处理。

## 下一阶段所需事实与人工判断

产品侧无需先提供真实项目。看板先行、外部对话、信息重点、CLI 写入、范围与审批原则已确认；B1 已落地最小交互，B2 两部分人工试用已确认，B3 已补齐关键修订且待人工试用。书籍参考更正后，先建立记录合同、实例与校验，再建设最小 Harness、接入云端模型，并按结构化内容适配状态看板和完成相关 B4 验证，见[纠偏计划](reference-correction-plan.md)。以下仍需区别已确认与未定：

- Intent 已确认为通过对话前置形成；确认、纠正、意图修改商讨和授权的具体交互仍需细化。
- PR 创建方式与 Merge 的产品责任；Hub 的提交推送和 CI 反馈责任已明确。
- 人工实际运行验收的具体场景、环境、启动方式与证据呈现；最终人工介入责任已明确。
- 支持理解 What / Why / Result 的最小看板交互，以及推进稳定性和可理解性的评价方法。

看板技术方案与后续 Runtime 事实验证分开推进；看板开发不以先完成 X1 为条件。安全实验侧仍须**工程事实采集报告**与逐项准入，不由看板可用或当前设计讨论推导实验许可。

报告需为 R1–R6 提供真实环境依据：独立外层保护、模拟资源与身份、候选对象及环境 / 策略 / 版本、预定正反向用例与标准、独立观察、资源预算及停止清理。现有未知项包括这些条件能否实际成立，以及候选 Sandbox 是否满足 X1 契约。

人工随后依据完整 R1–R7 决定是否授权具体 X1 实验。具体授权必须明确，等待或材料齐备本身都不是 Go。X2 的准入另行审查；实验结果、实现准入、可信晋升与 MVP 最终验收仍按[验证规范](validation.md)分别处理。

能力等级完整判定阈值、X3–X5 详细用例和受保护 Worktree 的实际可行性，也仍缺进一步事实或明确判断。当前已有 B1 看板，不由看板功能、目录、配置或文档推导这些 Runtime 能力已有实现或执行许可。
