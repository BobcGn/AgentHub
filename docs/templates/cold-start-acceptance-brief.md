# 跨会话冷启动恢复独立验收简报与操作规范

本简报专为新会话、独立审查员或外部验证程序提供 AgentHub 跨会话冷启动恢复能力（Cold Start Recovery）的独立运行、推导依据与验收操作指南。

---

## 一、运行环境与架构约束

1. **运行平台与工具栈**：
   - 操作系统：macOS / Linux / Windows (跨平台路径与大小写规范)
   - Runtime：Node.js `>=24.16.0 <25` (严格对齐 `package.json` 中的 engines 规范；ESM 模块模式，`"type": "module"`)
   - 依赖与编译：单包 TypeScript 工程，严格遵循 ESM 导入后缀 (`.js`)，无外部运行时框架绑定。
   - 服务启动与入口区分：
     - 开发/源码模式：`npm run cli` 或 `node --import tsx src/index.ts`
     - 生产构建模式：必须先执行 `npm run build`，产物入口为 `node dist/index.js`（`npm start`），不存在 `dist/src/index.js`。
2. **零数据模式与方案 A 约束**：
   - **方案 A（已确认）**：恢复视图完全由现有正式 RecordProject（JSON 实例）与 Run 账本（`runs/${targetRunId}.json`）纯函数投影派生，**绝不新增可独立编辑的第三方事实源，绝不为了恢复功能扩张正式业务 Schema**。
   - **用户确认的 Intent 是目标与预期行为的唯一规范事实源**；Requirement 为可验证交付边界（依据 2026-10-30 确立的 SC-005，PR 为可选交付关联，支持 0..N 个 PR，无 PR 时仍可通过证据完成验收，替代历史单 PR 规则；当前代码处于单 PR 阶段，安排在 P06 改造）。
   - **Unit / Story / Bolt Plan 层级按需出现**；模型仅产出候选，正式应用与整体验收必须由独立人端决策（Human-in-the-loop）。
   - **完全离线安全**：无真实云端外发，不读取真实凭据，不执行任何外部 Git 操作。

---

## 二、独立多进程冷启动消费者接口

为消除单进程测试中内嵌内存状态对验证结论的污染，系统提供了独立的子进程消费者脚本：
- **入口脚本**：`src/presentation/recovery-cli-consumer.ts`
- **调用方式**：通过 OS 原生子进程（如 `child_process.spawnSync` 或 CLI 命令）执行：

```bash
node --import tsx src/presentation/recovery-cli-consumer.ts \
  --projectDir <RecordProject目录> \
  --runDir <Run账本目录> \
  [--projectId <项目ID>] \
  [--targetRequirementId <指定需求ID>] \
  [--format <json|markdown>] \
  [--budgetBytes <字节预算上限>]
```

### 参数说明：
| 参数 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `--projectDir` | 路径 | 是 | 保存正式 RecordProject JSON 实例的目录 |
| `--runDir` | 路径 | 是 | 保存 Run 运行账本（`runs/${targetRunId}.json`）的目录 |
| `--projectId` | 字符串 | 否 | 指定恢复的项目 ID；若未提供且目录仅有 1 个项目则自动选定，目录中存在多个项目时报错阻断 (`MULTIPLE_PROJECTS_FOUND`) |
| `--targetRequirementId` | 字符串 | 否 | 指定推进的目标 Requirement ID；若多需求未完成且未指定，推导 `SELECT_TARGET_REQUIREMENT` |
| `--format` | `json` \| `markdown` | 否 | 输出格式：默认 `json`（输出完整结构化视图）；`markdown` 输出人类可读的紧凑汇报文档 |
| `--budgetBytes` | 整数 | 否 | 恢复上下文 UTF-8 字节预算上限（默认 32,768 即 32 KiB，有效范围 4,096 至 1,048,576 字节）。超出时按确定顺序裁剪可选内容，必要内容超限时安全停止并汇报缺口 |

---

## 三、七核心问题推导矩阵（基于 AIDLC ch04 规范）

在独立冷启动时，消费者通过 `buildRecoveryProjection` 仅凭持久化磁盘记录纯函数回答 7 核心问题：

| 核心问题 | 账本与记录推导来源 | 对应恢复视图字段 |
| :--- | :--- | :--- |
| **Q1: 当前目标是什么？** | `project.records.intent` 与唯一选定的 `activeRequirement` | `goal.intent`, `goal.activeRequirement` |
| **Q2: 已经完成了什么？** | 各层级状态为 `done` 的对象计数与已验证准则 | `progress.requirementsCount`, `progress.activeRequirementBreakdown` |
| **Q3: 现有事实与证据是什么？** | `evidence`、`verifications` 与 `sources` 详细链接 | `evidence.sources`, `evidence.verifications`, `evidence.evidence` |
| **Q4: 存在哪些未知项与假设？** | 未核验准则、失效核查、未闭合问题与未决人端 Gate | `unknowns.openQuestions`, `unknowns.assumptions`, `unknowns.unverifiedCriteria`, `unknowns.pendingHumanGates` |
| **Q5: 当前处于哪种授权状态？** | 匹配 targetRequirementId 的最新 Run 与当前修订 | `authorizations.authorizationState`, `authorizations.projectRevision` |
| **Q6: 存在哪些结构缺失或矛盾？** | Ajv 结构校验与 `inspectRecordRelations` 关系核查 | `gapReport.hasGap`, `gapReport.missingFacts`, `gapReport.contradictoryFacts` |
| **Q7: 下一步最安全的动作是什么？** | 严格优先级门禁判定，产出唯一安全动作与备选动作 | `nextSafeAction.actionCode`, `nextSafeAction.executableNow`, `nextSafeAction.blockingIssues` |

---

## 四、14 个多进程冷启动验收测试场景矩阵

在 `tests/recovery-cold-start.test.ts` 中，所有 14 个场景均在独立 OS 子进程中冷启动运行并严格断言：

| 场景编号 | 场景特征与前置状态 | 期望推导动作 (`actionCode`) | 责任人 (`actor`) | 当前可执行 (`executableNow`) | 关键门禁与阻断理由 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **场景 1** | 正常单需求待推进（无运行、准则已明确） | `REQUIRE_RUN_AUTHORIZATION` | `human` | `true` | 等待人端发放单轮运行授权 |
| **场景 2** | 存在多个未完成需求，未指定目标 | `SELECT_TARGET_REQUIREMENT` | `human` | `true` | 阻断执行；显式指定目标后转为场景 1 |
| **场景 3** | 所有需求均已完成并通过独立人端整体验收 | `ALL_REQUIREMENTS_COMPLETED` | `human` | `false` | 全部需求已关闭，无需模型介入 |
| **场景 4** | 仅分解为 Story（无 Unit/BoltPlan），Story 与准则均已通过 | `REQUEST_HUMAN_OVERALL_ACCEPTANCE` | `human` | `true` | 层级按需出现，不机械索取 Unit，可整体验收 |
| **场景 5** | 仅分解为 Unit（无 Story/BoltPlan），Unit 与准则均已通过 | `REQUEST_HUMAN_OVERALL_ACCEPTANCE` | `human` | `true` | 层级按需出现，不机械索取 Story，可整体验收 |
| **场景 6** | 需求准则已核验，但存在未完成子产物（draft/review） | `REQUIRE_RUN_AUTHORIZATION` | `human` | `true` | 阻断整体验收，需继续推进子产物至 done |
| **场景 7** | 存在处于活动执行中的运行（`status: running`） | `AWAIT_ACTIVE_RUN` | `model` | `false` | 存在正在执行的进程，禁止并发启动或抢占 |
| **场景 8** | 运行处于 `waiting_human` 但工作区授权已超时过期 | `REVIEW_CANDIDATE_IN_HUMAN_BOARD` | `human` | **`false`** | 候选仍需审阅，但禁止直接 apply（API 403 阻断） |
| **场景 9** | 运行授权被人工明确撤销或取消（`revoked/cancelled`） | `INSPECT_CANCELLED_RUN` | `human` | `true` | 人工可查阅取消原因，模型不可推进 |
| **场景 10** | 运行产生后的项目当前修订已递增（基准落后） | `RECONCILE_STALE_RUN` | `human` | `true` | D18.1 保守策略：禁止跨修订直接继承旧断点 |
| **场景 11** | 旧运行缺少配置指纹（`fingerprint: null`） | `REQUIRE_RUN_AUTHORIZATION` | `human` | `true` | D21 Fail-Closed：缺失指纹依据禁止盲目恢复 |
| **场景 12** | 运行候选被保留（`kept`），但尚未合入正式记录 | `REQUIRE_RUN_AUTHORIZATION` | `human` | `true` | 正式记录未变更，清晰提示待人工合入或重新授权 |
| **场景 13** | 存在结构校验错误（缺少标题）或完成态核查缺失 | `STOP_AND_REPORT_GAP` | `human` | `false` | 事实存在矛盾或破坏合同，立即阻断并汇报缺口 |
| **场景 14** | Markdown 路由请求不存在项目或缺少参数 | 错误响应 (404/400) | `human` | `false` | 先校验与生成再写响应头，防止 HeaderSent 异常 |

---

## 五、关键疑难与排查指引

### 1. 为什么子产物（Story / Unit）更新为 `done` 后又退回 `review`？
- **领域不变式约束**：在 AgentHub 的领域模型中，子产物本身若定义了 `acceptanceCriteria`，必须存在针对该子产物且结果为 `passed` 的 `verifications` 记录。
- **自动级联回退**：若子产物的验收条件未全部通过，`cascadeDependentDemotionsAndParentInvalidation` 会主动将其状态拦截在 `review`，防止未经验证的产物虚假标为完成。

### 2. 为什么无指纹的旧运行不能直接 `resume`？
- **决策 D21 (Fail-Closed Policy)**：配置指纹（`fingerprint`）是确保模型运行时端点、协议、参数未被静默篡改的密码学凭据。对于旧版本遗留未记录指纹的运行，系统一律拒绝从中断点直接恢复，必须由人端重新确认授权或干净分叉。

### 3. 如何通过 HTTP API 访问恢复视图？
- JSON 格式：`GET /api/record-projects/:id/recovery?targetRequirementId=:reqId&budgetBytes=32768`
- Markdown 格式：`GET /api/record-projects/:id/recovery?format=markdown&targetRequirementId=:reqId&budgetBytes=32768`
- 响应头保护：服务已实现先完成身份与数据完整性校验，生成文档后再写 HTTP 200 头，确保 404 / 400 能够干净返回，杜绝未处理 Promise 拒绝。

---

## 六、上下文预算（默认 32 KiB）与交付物真实字节计量机制

为确保新会话冷启动时接收到“内容完整、出处可查、遇错会停、体积受控”的恢复上下文包，系统实现了基于实际交付物 UTF-8 真实字节计量的预算控制：

1. **预算参数控制与交付物计量（D23.4 / Gap 1 修复）**：
   - 默认预算：`32768` 字节（32 KiB）；有效范围为 `4096`（4 KiB）至 `1048576`（1 MiB）。
   - 严格参数校验：非整数、NaN、Infinity、负数或超界值直接返回 `400 INVALID_BUDGET_CONFIGURATION`。
   - **交付物真实字节计量**：`deliveryFormat`（`compact_json`、`formatted_json`、`cli_json`、`markdown`、`cli_markdown`）全链路透传，计量采用固定点迭代，严格按 CLI 实际 stdout 格式化输出或 HTTP 实际输出的真实 UTF-8 字节计算，杜绝 CLI 缩进换行突破预算。
2. **必要内容底线保护与紧凑停止诊断（Gap 4 修复）**：
   - Intent 意图、目标需求定义、项目级与需求级已确认决定（`confirmed`）、约束（`constraint`）、直接来源记录以及阻断下一步动作的关键未知项为**绝对必要内容**。
   - 若仅上述必要内容渲染后体积即已超出设定预算，状态机立即推导 `STOP_AND_REPORT_GAP`（附带 `necessaryOverBudget: true` 与超出字节数说明），绝不为了迎合预算破坏核心事实完整性。
   - **紧凑停止诊断视图**：必要内容超限或数据损坏时，由 `buildCompactStopView` 构造轻量化精简诊断结构（< 5 KiB），严格服从预算上限，杜绝通过展开原视图回显 47 KiB 庞大正文导致自相矛盾。
3. **渐进式省略次序（确定性剪裁链 · Gap 2 & Gap 3 修复）**：
   - 当包含可选细节的完整视图超出预算时，自底向上按严格优先级逐步省略：
     1. 剥离来源记录（`sources`）的长正文摘要（`excerpt`），保留定位行号与标识；
     2. 截断证据记录（`evidence`）的观测细节至 64 字符；
     3. 省略次要假设（`unknowns.assumptions`）；
     4. 省略历史或非通过态核查记录（`verifications`）；
     5. 省略候选决定（`proposed`）及次要背景讨论项；
     6. 省略未被当前保留项引用的次要来源记录；
     7. 若上述裁剪完成后必要内容仍超限，强制调用 `buildCompactStopView` 停止并报告缺口，绝不以 49 KiB 超限继续给出授权。
4. **出处传递闭包（Provenance Closure · Gap 3 修复）**：
   - 废除盲目使用 `slice(0, 3)` 截断 sources 的机制；
   - 恢复投影自动将意图、活跃需求、保留的已确认决定与约束所引用的 `sourceRefs` 及 `evidenceRefs` 计算为闭包，出处剪裁仅允许省略未被任何保留项引用的次要来源，保留项所依赖的出处 100% 完整保留在 `evidence.sources` 中，杜绝孤儿引用与闭包断裂。
5. **省略清单与真实回查指引（`omittedSummary` · Gap 5 修复）**：
   - 省略发生时，输出结构化清单记录每个省略项的类型（`kind`）、具体对象真实标识（`id`）与具体省略原因，杜绝宽泛通配字符串；
   - 每个省略项附带精确锚点定位：`retrievalLocator: /api/record-projects/:id#records.collection[id=:id]`；
   - 清单条目有界控制在最多 10 条（防止省略元数据自身撑破预算）；
   - 提供真实存在的回查入口（`retrievalGuide: GET /api/record-projects/:id`），杜绝 404 的 `/records` 路由，确保独立消费者可按需取回完整原始数据。

---

## 七、恢复包出处闭包、停止诊断渐进压缩与事实真实性三大不变式（第十一轮修复规范）

针对第十一轮交叉验证发现的边界漏洞，冷启动恢复系统强制遵守以下三大核心不变式：

1. **不变式一：保留的必要事实必须具备完整可查的出处闭包（Universal Provenance Closure）**
   - 领域层 `RecoveryGoal.intent` 增加 `sourceRefs` 与 `confirmationSourceRefs`，`activeRequirement` 增加 `sourceRefs`，`evidenceLinks.verifications` 与 `evidence` 增加 `sourceRefs`；
   - 步骤 6 使用统一辅助函数 `computeRetainedRequiredSources` 收集意图、确认来源、当前需求、保留核查与证据、保留已确认决定及约束的所有 `sourceRefs`，杜绝将意图来源误清空的漏洞；
   - 增加后置出处完整性门禁（`hasCompleteRequiredSources`）：若必要出处由于预算受限无法完整容纳，严禁剥离来源输出可执行动作，状态机强制推导 `STOP_AND_REPORT_GAP`（`necessaryOverBudget: true`, `executableNow: false`）。

2. **不变式二：所有交付格式在极限预算下均严格服从体积上限（Deterministic Shrinking & Budget Assertion）**
   - 针对 `buildCompactStopView` 仅单次缩短 `why` 导致 Markdown 格式输出 4405 字节（> 4096 字节预算）的缺陷，实现确定性 5 阶段渐进压缩：
     - 阶段 1：清空省略条目，收敛 `missingFacts` 为单条；
     - 阶段 2：缩短 `why` 至 80 字符，精简规则、端点与取回指引；
     - 阶段 3：按比例截断项目、意图与需求名称至 20–30 字符，缩短 `why` 至 50 字符；
     - 阶段 4：剥离非核心元数据、规则列表与端点列表；
     - 阶段 5：终极紧凑骨架保障，并在函数末尾强制断言 `actualBytes <= maxBudgetBytes`；
   - 确保在 CLI 格式化 JSON 与 Markdown 等所有格式下，极限预算（4096 字节）输出均严格合规且退出码为 0。

3. **不变式三：恢复材料严禁虚构或篡改业务事实（Zero Business Fact Fabrication）**
   - 彻底废除停止视图对 `goal.intent.state` 与 `progress.intentState` 硬编码 `'human_confirmed'` 的错误行为；
   - 停止视图严格如实传递意图的实际确认状态（如 `'proposed'`）与进度状态，底层结构损坏时如实降级为 `'unknown'`，绝不向独立消费者伪造已确认的意图事实。

---

## 八、终极预算守卫、授权明细安全省略与停止诊断运行态事实真实性（第十二轮修复规范）

针对第十二轮交叉验证确认的终极预算越界与停止诊断事实失真缺口，系统落地以下规范与守卫：

1. **工作区海量授权读取范围安全省略与真实授权状态保留（Gap 1 修复）**
   - 领域层 `RecoveryAuthorizations` 新增 `authorizationDetailsOmitted?: boolean;`；
   - 当工作区授权包含海量读取范围（如 60 条每条 120 字符）或运行时绑定内部明细导致在极限预算（如 4096 字节）下超限时，停止诊断在阶段 2/3 安全省略明细（`activeGrant: null, runtimeBinding: null, authorizationDetailsOmitted: true`），但**绝不修改真实授权状态**（`authorizationState: 'valid'` 保持 `valid`，不降级为 `none` / `revoked`，不捏造虚假截断范围）；
   - 在授权附注与 Markdown 中如实输出“- **有效授权范围**：授权详情未包含，需取回重新核对”以及 `GET /api/record-projects/:id` 真实回查入口；
   - 阶段 5 终极预算断言：若经 5 阶段渐进压缩后体积仍超出 `maxBudgetBytes`，抛出类型化 `HubError(413, 'BUDGET_EXCEEDED')`；
   - CLI 消费端（`src/presentation/recovery-cli-consumer.ts`）在输出 stdout 前追加 UTF-8 真实字节数校验，超限时写入 stderr 错误并以退出码 1 终止，绝不以退出码 0 输出超限内容。

2. **停止诊断运行态与候选生命周期事实零失真（Gap 2 修复）**
   - 彻底修复 `buildCompactStopView` 将 `pendingCandidateCount: 0`、`keptCandidateCount: 0` 硬编码以及丢弃 `latestRunState` 导致 Markdown 渲染为“最新运行 无 · 待审核候选 0 条”（而授权状态却显示为 valid）的事实失真漏洞；
   - `buildCompactStopView` 显式支持并透传 `latestRunState`、`pendingCandidateCount` 与 `keptCandidateCount`，`applyRecoveryBudget` 步骤 7 完整保留并传递运行态事实；
   - Markdown 渲染层建立 `runStateDisplay` 归一化逻辑，真实反映 `latestRunState`（如 `waiting_human`、`running`、`interrupted`），如实输出候选数量；
   - 结构损坏 Fail-Closed 停止视图（`safeStopView`）同样基于实际 `runs` 真实计算运行状态与候选计数，杜绝伪造 0 候选或无运行。

3. **停机原因严格分类与无偏见诊断**
   - 严格区分“必要恢复上下文超出预算上限”与“记录底层结构错误/合同校验失败”；
   - 结构损坏场景下保留底层结构错误事实诊断（`necessaryOverBudget: false`），绝不将 why 改写为“必要恢复上下文超出预算上限”，绝不将 `missingFacts` 覆盖为“上下文超限”，`pendingHumanGates` 绝不提示用户调大 `--budgetBytes`。

---

## 九、授权恢复路径闭环、未知授权状态如实表达与消费端安全重检（第十三轮修复规范）

针对第十三轮交叉验证确认的授权恢复路径断裂与未知授权状态失真缺口，系统落地以下规范与守卫：

1. **授权详情省略时的定位元数据强制保留与回查闭环（Gap 1 修复）**
   - 领域层 `RecoveryAuthorizations` 显式承载并持久保留 `targetRunId`、`runRevision`、`baseRevision`、`retrievalEndpoint` (`/api/runs/:id`) 与 `retrievalLocator` (`runs/:id.json`)；
   - 彻底废除向仅包含正式业务记录的 `/api/record-projects/:id` 路由索取运行授权依据的错误指引，Markdown 与 JSON 明确输出通过 `/api/runs/:id` 或本地文件路径回查完整运行账本；
   - 在 4096 字节极限预算 5 阶段压缩中，阶段 4 与阶段 5 终极骨架严禁剥离目标 Run 定位器，确保无论上下文压缩到何种程度，消费者均可闭环取回。

2. **在线人端鉴权与离线免鉴权双通路读取**
   - **在线 HTTP 访问**：`GET /api/runs/:id` 严格执行 `requireHuman(principal)` 门禁。未登录请求返回 `401`，工具令牌访问返回 `403`，严禁未经授权的第三方模型调用凭据窥探授权账本；
   - **离线 CLI 消费者**：依据恢复包中的 `retrievalLocator` 直接从 `runDir` 读取并反序列化 `runs/:id.json`，在无网络连接、无鉴权服务的冷启动环境下自洽闭环。

3. **消费端独立安全重检与防漂移/篡改门禁（`verifyRetrievedRunAuthorization`）**
   - 冷启动恢复包仅作为快照呈现。新会话或离线消费者在取得完整 Run 账本后，**严禁盲目信任快照中过期的 `authorizationState: 'valid'`**；
   - 必须通过 `verifyRetrievedRunAuthorization(snapshot, run, project)` 进行独立核验：
     - **运行账本漂移**：若 `run.revision !== snapshot.runRevision`，判定为 `stale_revision` 并阻断推进；
     - **项目基准漂移**：若 `project.revision !== run.authorization.baseRevision`，判定为 `stale_revision` 并阻断推进；
     - **超时过期**：若运行创建时间已超过有效期限（如 24h），判定为 `expired`；
     - **人工撤销**：若运行状态为 `cancelled` 或授权已被撤销，判定为 `revoked`；
     - **项目结构损坏**：若项目底层结构损坏，判定为 `unverified_due_to_corruption` 并阻断执行。

4. **未知与未验证授权状态如实表达（Gap 2 修复）**
   - 解耦项目记录健康度与运行授权生命周期：当项目底层结构存在校验错误（如 `intent.title = 42`）时，数据损坏分支复用 `analyzeProjectAuthorizations` 真实分析磁盘 Run 账本。若存在有效运行，如实标记为 `'unverified_due_to_corruption'`，绝不武断填为 `'none'`；
   - 确立正交完备的 7 态语义：
     - `'valid'`：存在匹配目标需求的未过期运行且项目基准一致；
     - `'expired'`：运行已超时过期；
     - `'revoked'`：运行已被人工撤销或取消；
     - `'stale_revision'`：项目基准已递增，运行属于旧基准；
     - `'none'`：目标需求确定没有任何运行；
     - `'unknown'`：存在多个未完成需求且未显式指定目标，或存在跨不同需求的运行；
     - `'unverified_due_to_corruption'`：存在有效运行但项目结构损坏，无法安全验证适用性。

## 十、恢复包驱动的真实只读消费闭环、目标绑定与事实重检（第十四批修复规范，2026-10-29，待 Codex 独立交叉验证）

> [!IMPORTANT]
> **状态声明**：本规范对应的全链路实现已完成作者自测（222 项单元/行为测试 + 24 项浏览器 E2E 测试全通过），待 Codex 独立交叉验证。

1. **严格目标绑定与归属校验（Gap 1 修复）**
   - **未决目标与未知状态阻断**：在 `verifyRetrievedRunAuthorization` 中，若 `recoveryView.authorizations.targetRunId` 为空、或恢复视图为 `SELECT_TARGET_REQUIREMENT`、或授权状态处于 `unknown`，立即拒绝通过，返回 `valid: false, state: 'unknown'`，阻断外部调用者自行选定或注入任意 Run 伪造通过；
   - **多重归属一致性与悬空需求拦截**：
     - 运行标识核验：`run.id === targetRunId`；
     - 项目归属核验：`run.projectId === targetProjectId`，拦截跨项目运行记录；
     - 需求归属核验：`run.requirementId === targetRequirementId`，拦截跨需求运行记录；
     - 需求存在性与 Intent 归属核验：目标需求必须在当前项目记录中存在且属于当前 Intent（`req.intentId === currentProject.records.intent.id`）。若需求已被删除或脱离 Intent，立即返回 `valid: false, state: 'none'`。

2. **真实重检当前事实与结构校验（Gap 2 修复）**
   - **强制重读当前事实，杜绝依赖旧快照猜测**：消费端重检必须重新读取当前项目与 Run 账本；若读取失败或当前事实缺失，返回未验证（`unverified_due_to_corruption`），严禁降级使用旧快照猜测；
   - **结构健康度前置门禁**：前置调用 `validateBasicStructuralHealth`，若底层记录损坏（如 `intent.title = 42`），立即返回 `unverified_due_to_corruption`，拒绝执行；
   - **多维度漂移与生命周期检测**：
     - 项目修订前进：`currentProject.revision > recoveryView.projectRevision` 时阻断；
     - 运行基准漂移：`run.baseRevision !== currentProject.revision` 判定为 `stale_revision`；
     - 运行账本漂移：磁盘 Run 修订与快照不符判定为 `stale_revision`；
     - 运行生命周期：撤销判定为 `revoked`，超时（>24h）或处于终止态判定为 `expired`；
   - **正交执行语义精确解耦**：
     - `runAuthorizationApplicable: boolean`：Run 授权是否合法且基准一致；
     - `workspaceAccessGranted: boolean`：是否获得本地工作区读写权限；
     - `executableNow: boolean`：当前是否具备立即执行条件；
     - 纯上下文分析运行（`workspace.authorized: false`）是合法 Harness 运行，其授权合法有效（`runAuthorizationApplicable = true, valid = true`），但无工作区本地读写权限（`workspaceAccessGranted = false`），严禁判为非法。

3. **离线定位合同一致性与安全防穿越解析（Gap 3 修复）**
   - **统一定位符合同（`retrievalLocator`）**：规范化 `retrievalLocator` 语义，明确其为相对于 `runDir` 的标准相对路径：`${targetRunId}.json`，消除拼接导致的 `runs/runs/:id.json` 双重目录嵌套 Bug；
   - **安全路径解析器（`resolveRunLocatorPath`）**：
     - 拒绝绝对路径（`isAbsolute` 与 Windows 盘符路径）；
     - 拒绝包含空字节（`\0`）攻击；
     - 严格阻断目录穿越（`..`）；
     - 仅允许合法文件名格式（`^[A-Za-z0-9-]+\.json$`）；
     - 安全平滑兼容历史遗留快照中生成的 `runs/:id.json`（单层且名为 runs 时安全剔除前缀）；
   - **CLI 独立消费验证闭环**：
     - CLI 支持 `--verifyRecovery <path>` 与 `--projectDir` / `--runDir` 参数；
     - 支持独立操作系统进程 A 提取并持久化恢复包后退出，独立操作系统进程 B 纯粹依据恢复包与配置目录完成取回、校验与重检，零带外信息闭环；
     - 验证输出受 `--budgetBytes` 严格约束（默认 32 KiB，最小 4 KiB）。

## 十一、恢复消费者边界加固、正式记录关系完整核验、默认预算强制与账本物理读取约束（第十五批修复规范，2026-10-29，已实现，作者自测通过，待独立交叉验证）

> [!IMPORTANT]
> **状态声明**：本规范对应的全链路实现已完成作者自测（226 项单元/行为测试 + 24 项浏览器 E2E 测试全通过），待 Codex 独立交叉验证。

1. **移除缺少当前项目时的兼容放行（Gap 1 修复）**
   - **废除仅凭修订比较推断有效授权的兼容路径**：在 `verifyRetrievedRunAuthorization` 中移除此前为历史测试保留的“只传 `currentProjectRevision` 不传 `currentProject` 仍可能返回 `valid: true`”的分支；
   - **强制原则**：运行授权适用性推导必须同时具备当前正式项目（`currentProject`）与运行账本（`run`）。缺少当前项目读取依据时，无条件返回 `valid: false, state: 'unverified_due_to_corruption'`，并将 `checks.projectStructureHealthy`、`checks.projectRelationsValid` 与 `checks.requirementExistsInCurrentProject` 均置为 `false`；
   - **如实表达事实状态**：未读取到目标运行账本时返回 `valid: false, state: 'none', run: null`，禁止在应用层或 CLI 生成假备用运行；目标需求在当前项目中已被删除或脱离 Intent 时返回 `valid: false, state: 'none', checks.requirementExistsInCurrentProject: false`，指出需求不存在，不与撤销或过期混淆。

2. **复用正式记录完整关系校验（Gap 2 修复）**
   - **Schema 语法校验与语义关系校验分层**：单纯的 Ajv Schema 校验无法拦截语义引用断裂（如清空 `records.sources` 导致 Intent 或需求中的 `sourceRefs` 成为悬空引用）；
   - **重检前置执行 inspectRecordRelations**：`verifyRetrievedRunAuthorization` 在基础结构检查通过后，强制调用统一的完整关系校验函数 `inspectRecordRelations(records as RecordSet)`；
   - **断裂引用与无效关系拦截**：拦截悬空出处引用（`UNKNOWN_REFERENCE`）、未知 Intent 归属（`UNKNOWN_INTENT`）、不适用证据（`INAPPLICABLE_EVIDENCE`）、未知目标（`UNKNOWN_TARGET`）与循环依赖；一旦发现关系问题，立即将 `checks.projectRelationsValid` 置为 `false`，输出 `valid: false, state: 'unverified_due_to_corruption'`，并在 `reason` 中列出具体问题代码与路径；
   - **CLI 消费端端到端一致性**：CLI `--verifyRecovery` 读取关系断裂项目时，输出 `checks.projectRelationsValid: false` 与 `unverified_due_to_corruption`，拒绝执行。

3. **落实验证报告的默认预算 32768 字节与真实交付边界（Gap 3 修复）**
   - **统一入口预算解析与默认值**：CLI 消费入口对 `--budgetBytes` 统一调用 `validateRecoveryBudget`，不传时无条件默认生效 32768 字节（允许范围 4096 至 1048576 字节）；
   - **海量授权范围时的安全省略与确定性渐进压缩**：工作区授权包含海量读取范围（如 500 条超长路径，体积 > 50 KiB）导致重检报告溢出时，安全省略授权明细（`activeGrant: null, authorizationDetailsOmitted: true`），优先保留重检结论（`valid`）、各项检查清单（`checks`）、修订基准号、停止理由与稳定的定位字段（`retrievalLocator` / `retrievalEndpoint`）；
   - **输出 UTF-8 真实计量与安全报错**：JSON 与 Markdown 报告均通过 `getUtf8ByteLength` 严格计量实际 UTF-8 输出；超限时向 stderr 输出有界错误对象并退出码 1 拦截。

4. **约束账本文件的物理读取范围与禁止符号链接（Gap 4 修复）**
   - **禁止账本符号链接与非普通文件**：在 `resolveRunLocatorPath`、`readSafeRunFile` 与 `JsonRunStore.get` 中强制使用 `lstatSync` 校验：
     - `lstat.isSymbolicLink()` 为真时立即抛出 400 `UNSAFE_RUN_FILE`（运行账本禁止使用符号链接）；
     - `!lstat.isFile()` 为真时立即抛出 400 `UNSAFE_RUN_FILE`（运行账本必须为普通文件）；
   - **物理防逃逸断言与体积上限**：通过 `realpathSync` 断言目标文件物理父目录严格等于已解析的 `runDir`，彻底拦截内部符号链接逃逸到外部目录的攻击；限制账本文件体积上限为 2 MiB；
   - **CLI 错误拦截**：CLI 遇到 `INVALID_LOCATOR` 或 `UNSAFE_RUN_FILE` 攻击时，重新抛出错误，以退出码 1 失败拦截并输出有界 stderr。
