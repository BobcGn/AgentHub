# 已确认决策索引

本文件保留初始化时用户指定的五轮 **Confirmed Architectural Decision**，并追加 2026-10-22 产品意图修订、2026-10-23 推进次序与 TypeScript 初始化范围，以及 2026-10-25 书籍参考纠正和理解 / 决策意图再次确认。编号仅用于定位，不补造讨论原文、历史日期或单独审批记录。新增 D6 编号表示本轮修订，不是对初始化五轮历史的重命名。

这里保存决策摘要及其主要规范链接，避免复制整套规则。候选机制不是技术证据；当前实现、实验与许可状态统一见[工程状态](project-status.md)。

## 第一轮：治理与任务授权

| 编号 | 已确认决策 | 主要规范 |
| --- | --- | --- |
| D1.1 | Hub 掌握研发控制权；Agent 在任务级授权内自主执行，人负责关键决策、权限扩大与最终验收 | [架构](architecture.md)、[治理](governance.md) |
| D1.2 | Grant 由人工批准目标、约束、范围、工具能力、预算与验收条件；模型不能因认为必要而扩权 | [任务授权](governance.md#任务授权与变化) |
| D1.3 | 重要目标、权限、验收和交付边界变化需人工裁决；普通授权内组织调整可自动留痕 | [Gate](governance.md#g0g4-与人工责任) |

## 第二轮：AIDLC、Issue、Evidence、Gate

| 编号 | 已确认决策 | 主要规范 |
| --- | --- | --- |
| D2.1 | 交付 Issue 是独立、可验证的问题；交付型与调查型具有不同的必要描述。Intent / 父 Issue 关系由 D6.3 补充 | [核心对象](governance.md#核心对象) |
| D2.2 | Activity 是 AIDLC 活动单位，不等于 Issue 或 Run | [核心对象](governance.md#核心对象) |
| D2.3 | Evidence 分别检查 Integrity、Applicability、Sufficiency；模型自述不是唯一执行证据 | [Evidence / Review](governance.md#evidence-与-review) |
| D2.4 | 采用 G0–G4；Issue / PR 通常一对一，拆分须有依据；Review 明确 What / Why / Impact、版本、证据和剩余风险 | [治理](governance.md) |

## 第三轮：Run、权限、Rules / Skills、事实源与恢复

| 编号 | 已确认决策 | 主要规范 |
| --- | --- | --- |
| D3.1 | Run 有边界、预算与追溯性，可在有效授权下跨 Activity；Session 可重建但不是审批权威 | [运行上下文](architecture.md#sessionrun-与-activity) |
| D3.2 | 工具由 Hub 控制真实执行；Rules、AGENTS.md、Skills、工具返回与模型建议不能扩大正式授权 | [Loop](architecture.md#hub-自有-deepseek-loop)、[任务授权](governance.md#任务授权与变化) |
| D3.3 | Local Git、Hub Protected Records、Tool Execution Observations、Remote GitHub 分别承担不同事实职责 | [事实源](governance.md#权威事实源与持久化边界) |
| D3.4 | 中断后核查真实副作用；持久化满足受保护写入、授权失效、备份恢复和敏感清理，不预选数据库或事件溯源方案 | [治理](governance.md#权威事实源与持久化边界)、[恢复](security.md#中断恢复与能力降级) |

## 第四轮：MVP、领域模型、可信事实、Runtime、安全、实现准入

| 编号 | 已确认决策 | 主要规范 |
| --- | --- | --- |
| D4.1 | 初始化基线为单个本地缺陷修复、本地 Commit / Review 与 E1–E4；本地链路现保留为技术验证切片，完整产品边界按 D6.5 / D6.7 复核。单主要写入 Run 和 E1–E4 继续适用 | [MVP](validation.md#当前-mvp-目标与-e1e4) |
| D4.2 | 首版采用 Hub 自有 DeepSeek Loop；Codex / MCP 等延期扩展服从统一治理，MCP 不是权限证明 | [架构](architecture.md) |
| D4.3 | Trusted Hub / Untrusted Agent 分离；首版面向 macOS，Sandbox、Broker、凭据、网络、IPC 和恢复均需真实验证 | [安全](security.md) |
| D4.4 | Agent 可修改授权工作文件，可信 Broker 负责受限 Git 管理修改与本地 Commit；远程交付不含在默认本地授权内 | [Git 边界](governance.md#git-交付边界)、[Broker](security.md#trusted-git-broker受限的-git-权限入口) |
| D4.5 | 受保护 Worktree 不满足要求时，可依据失败证据提议独立 Git 元数据副本；重大改道由人工批准 | [安全](security.md) |
| D4.6 | 能力等级绑定已验证环境、策略和组件版本；重要条件失效限制受影响能力 | [能力降级](security.md#中断恢复与能力降级) |
| D4.7 | 分开实验授权、实现 Go / Scoped Go / No-Go、可信组件晋升与 MVP 验收；Scoped Go 不开放未验证高权限能力 | [四层准入](validation.md#四层准入与可信晋升) |

## 第五轮：独立实验保护、X1/X2 契约、Preflight

| 编号 | 已确认决策 | 主要规范 |
| --- | --- | --- |
| D5.1 | X1–X5 分别验证 Sandbox、Broker、间接权限、中断恢复和可信事实；各实验独立授权并预设可证伪假设、正反向用例、观察、预算、停止与清理 | [技术实验](validation.md#x1x5-技术实验) |
| D5.2 | 首次高风险实验优先使用可丢弃 macOS VM 或经审查的等效独立保护，采用模拟资源和受控网络 | [实验前提](validation.md#实验启动前-r1r7) |
| D5.3 | X1 与 X2 各有 P1–P5 / N1–N8 正式契约；单项 Pass 不证明组合安全，Guest Pass 不证明宿主执行资格 | [验证契约](validation.md) |
| D5.4 | R1–R7 覆盖外层隔离、模拟身份、对象条件、用例标准、独立观察、预算清理和具体授权；X1/X2 分别 Preflight 和人工 Go/No-Go | [Preflight](validation.md#实验启动前-r1r7) |
| D5.5 | 实验退出区分 Pass、Fail、Inconclusive、Unsafe to Continue；实验 Go 不等于技术 Pass | [四态退出](validation.md#实验四态退出) |

## 本轮产品意图修订（2026-10-22）

| 编号 | 已确认的产品意图与决策 | 主要规范 |
| --- | --- | --- |
| D6.1 | 解决理解速度跟不上 Agent 推进及记录与实现语义偏移的问题；人先理解方案理由、收益和风险，再按交付单元推进 | [产品动机](../README.md#为什么做-agenthub)、[架构](architecture.md#为什么需要-hub-控制层) |
| D6.2 | Issue 与 PR / Review 应对应表达 What、Why 和有证据的 Result，保持预期、实际结果和偏差可追溯 | [语义对应](governance.md#intent交付单元与语义对应) |
| D6.3 | 大 Intent 可作为父 Issue，按源头问题和实际交付边界划分子 Issue，避免机械或无限拆分 | [领域治理](governance.md#intent交付单元与语义对应) |
| D6.4 | 规划已有 Agent、云端模型 + 自有 Harness、本地模型 + 自有 Harness 三种模式；首版优先云端，本地小模型后续可做辅助 Reviewer / 总结，已有 Agent 需先验证绕过风险 | [运行模式](architecture.md#三种运行模式与优先级) |
| D6.5 | 推送后 CI/CD 为第一道交付门禁，用户介入实际运行验收为第二道，分别发现工程错误与语义漂移；失败回到适用授权和原意图内修复 | [交付门禁](validation.md#两道交付门禁) |
| D6.6 | 产品价值需由实际使用中的推进稳定性、What / Why / Result 可理解性及理解与推进的平衡支持；具体评价方法尚未确认 | [产品有效性](validation.md#产品有效性与待确定的验收方法) |
| D6.7 | D4.1 的本地切片不单独代表完整产品验收；提交推送及验收责任已由 D6.9 明确，PR 创建方式、具体场景和最小看板仍待细化，完整 MVP 边界待重新冻结 | [当前 MVP](validation.md#当前-mvp-目标与-e1e4)、[工程状态](project-status.md) |
| D6.8 | 用户确认的 Intent 是目标与预期行为的唯一规范事实源；修改须先商讨并获用户明确授权，Issue / PR / 验收条件不得擅自重定义意图 | [意图事实源与变更](governance.md#意图的唯一事实源与变更) |
| D6.9 | Hub 提交前检查并确认本地测试通过后，在获准范围内提交推送、查看流水线；最终由用户介入实际运行，对照 Intent、Issue / PR 的影响及结果验收 | [交付门禁](validation.md#两道交付门禁)、[Git 责任](governance.md#git-交付边界) |
| D6.10 | 对话前置：参考已纠正书籍第 2 章“人的判断”及反向对话，先明确意图、边界、责任、方案取舍和验证方式，由用户确认后进入正式交付拆分及授权执行；不机械固定轮数，摘要不能代替确认或授权 | [对话前置](governance.md#对话前置与意图确认)、[产品验证](validation.md#对话前置的产品验证要求) |

## 阶段一推进次序确认（2026-10-23）

| 编号 | 已确认决策 | 主要规范 |
| --- | --- | --- |
| D7.1 | 基于既有 Intent 直接开展阶段一范围与交互设计，真实项目后续导入验证，不要求先提供真实任务才能启动设计 | [阶段一草案](architecture.md#阶段一首版交互草案2026-10-23)、[设计与验证边界](validation.md#阶段一设计检查与后续真实项目验证) |

阶段一提出的功能区域、交互组织、候选范围和场景走读仍是待评阅设计，不因本条推进次序确认自动成为已确认方案或真实运行证据。用户随后要求签出阶段一分支并规划执行，现已形成[执行计划草案](phase-1-plan.md)；计划中的交付单元和方案未因此新增为已确认产品决策。

## 阶段一执行与上游复用（2026-10-23）

| 编号 | 用户明确的任务范围 | 主要材料 |
| --- | --- | --- |
| D7.4 | 适用上游内容可参考或直接使用，开始阶段一工作；本轮形成首版范围、交互、验收设计与复用模板，不把产出自动当作用户已接受方案 | [阶段一评阅材料](phase-1-review.md)、[复用记录](phase-1-review.md#上游复用记录) |

P1-A / P1-B / P1-C 起初均为提案。用户反向对话后的实际确认见 D8：P1-A 已调整为看板先行；P1-B 的信息优先级已明确，但具体布局仍为建议；P1-C 的文本结构和人工证据责任已确认，创建方式仍未决定。不得将局部回答扩大为整份草案的接受。

## 阶段一反向对话确认（2026-10-23）

| 编号 | 用户已明确的决定 | 主要规范 |
| --- | --- | --- |
| D8.1 | 先完成项目 Issue 看板与 Intent / Issue 概览；Agent 设施完善后再接入真实 Runtime，完成执行、检查和交付。先行看板有独立使用价值，不以完整执行闭环作为其交付前提 | [看板版本](architecture.md#看板版本的最小交付)、[分层验收](validation.md#看板版本与后续-runtime-的验证边界) |
| D8.2 | 交付信息优先回答当前做什么 / 解决什么问题、为何选该方案及其收益风险、如何验证结果符合最初意图；方案选择须 Agent 与用户反向对话，最终由用户决定 | [交付方案](governance.md#intent交付单元与语义对应) |
| D8.3 | PR 按“做了什么、为什么这么做、如何验证、结果怎么样”编写，用户附加截图等证据；该回答未决定实际创建 PR 的主体或时机 | [PR 说明](governance.md#pr-四段式说明与人工证据) |
| D8.4 | 看板版本先与 Codex 等外部 Agent 进行反向对话，在 Hub 中记录方案、取舍及用户决定；不要求该版内置模型对话，也不等同于正式接入外部 Agent Runtime | [先行交付](architecture.md#看板版本的最小交付) |
| D8.5 | 看板采用类似 Multica 的工具写入交互：提供 CLI 或其他形式工具完成写入，由用户检查与审批；具体协议和命令尚未决定，审批原则由 D8.6 补充 | [工具写入](governance.md#工具写入与人工检查) |
| D8.6 | 用户选择关键内容审批、普通记录在划定边界内可直接保存；关键内容不因在边界内而免审批，普通记录不得越界。具体边界在 B2 实现为人端显式选择对象与记录类型，新增交付单元由 D8.7 明确 | [写入边界](governance.md#工具写入与人工检查) |
| D8.7 | 已确认 Intent / Issue 清单外需要新增子 Issue 时，先提待审建议，说明变动内容及理由；用户确认后才能纳入正式交付计划与获准工作范围，不因符合 Intent 而自动扩大范围 | [变更审查](governance.md#新增交付单元与变更审查) |
| D8.8 | 用户试用后明确沿用批准／退回／拒绝：批准的补充说明选填；退回与拒绝必须填写理由。未填写不能被系统代填为人工理由，已有记录保留 | [决定说明](governance.md#决定说明与处理结果) |
| D8.9 | 用户验收决定说明细化后，进一步要求终端 / Agent 新增内容时已打开页面主动更新，避免依赖手动刷新；原有人工审批与意图边界继续适用 | [看板同步](governance.md#看板同步与审阅版本) |

D8 明确交付顺序、信息与责任，沿用既有完整产品目标和云端自有 Harness 优先方向。工具写入方向已确认；具体边界的划定、协议与命令、界面布局、附件入口、存储选型、PR 创建方式及阶段整体接受状态未由这些回答自动确定。

## 看板编码规划的技术建议（2026-10-23）

用户要求检查第一轮遗漏并开始编码规划，已形成[可执行计划](board-implementation-plan.md)。其中本地 Web、React / Vite、SQLite 驱动和服务 / CLI 组织均为 Proposed 的工程建议，不是新增 Confirmed Architectural Decision；本轮没有依赖安装、源码实现或安全实验结果。后续重要选型以用户实际决定记录，不能由计划存在推定已接受。

## B1 编码任务与工程基线（2026-10-23）

用户在上述规划后明确要求“请开始执行代码的编写”，本轮据此实现 B1 最小提案审批闭环，并安装必要精确版本依赖、执行对应行为 / 浏览器检查及启动重启验证；不推定新 Commit / Push、模型接入、安全实验或完整 MVP 准入。

B1 采用 React / Vite、本地 Node HTTP、better-sqlite3 / SQLite、parseArgs CLI 与 tsx 开发运行器；人端账户、会话与工具范围机制见[安全边界](security.md#看板开发中的审批与宿主边界)。这些是已落地的工程选择与受限接口证据，不改写 D8 的用户目标，不冒充用户已最终选择平台、确认交互或接受可信审批。实际结果见[工程状态](project-status.md#b1-最小提案审批闭环实现2026-10-23)。

## TypeScript 工程初始化范围（2026-10-23）

| 编号 | 用户明确的任务范围 | 主要规范 |
| --- | --- | --- |
| D7.2 | 初始化 TypeScript 项目、建立对应目录、完善规则文档；范围内可建立最小入口与开发配置、安装必要开发依赖并验证骨架。不扩展为产品功能、安全实验、外部模型接入或 Git 写操作 | [工程组织](architecture.md#typescript-工程组织)、[开发规则](../AGENTS.md#typescript-开发规则)、[工程检查](validation.md#typescript-工程初始化检查) |
| D7.3 | 用户随后指定 BobcGn/AgentHub 作为项目仓库并要求初始化推送；本轮获准本地 Git 初始化、origin 配置、首次提交与推送，不包含 PR、Merge 或 Release | [仓库与交付范围](project-status.md#git-仓库初始化与首次推送范围2026-10-23) |

本次采用的单包 Node.js / npm、ESM、严格类型配置和目录布局是实现该任务的工程基线，具体版本见 package.json、锁文件和[工程状态](project-status.md)。它们不是另行取得的最终平台或界面选型决策。

产品意图、阶段次序与工程骨架均不构成技术 Pass、完整 MVP Implementation Go、可信晋升或最终验收。Git 交付仅按 D7.3 的本轮明确任务执行，不推导后续远程权限；工程初始化与后续产品能力准入分别处理。

## B2 工程实现记录（2026-10-24）

用户在 B1 两项反馈验收后要求继续，本轮沿既定 B2 推进。复用 D8.6：普通记录只在划定边界内保存；工程表示为人端明确勾选当前 Intent / 具体正式 Issue 及允许的讨论摘要 / 备注 / Agent 报告类型。旧令牌无自动扩权，普通记录不改变关键内容或验收状态。

新增 Issue 详情与父子关联、原意图 / 方案决定追溯、CLI scope / record、记录来源和 v1 → v2 增量迁移；未新增技术依赖或改变总体目标。这是已落地的工程选择，B2 在该轮实现时尚待人工试用，后续反馈见下节；不新增“用户已最终接受交互 / 安全方案”的架构决策。具体证据见[工程状态](project-status.md#b2-概览与边界内记录2026-10-24)。

## B2 人工反馈与 B3 工程记录（2026-10-25）

用户实测旧令牌被拒、新令牌按 Intent / note 范围写入成功；截图及反馈确认页面刷新前后内容 / 来源一致，并确认正式 Issue 的范围、边界及验证方式展示合理。这是两部分实际反馈，不扩大为所有故障路径人工复验或产品稳定性结论。

用户随后明确要求继续 B3。本轮工程沿已确认规则实现不可原地替换的候选、版本 / 差异 / 影响审阅、决定与历史；Intent 另外要求人端登记已完成的商讨及对本候选的明确授权，再审批应用。工具建议权限单独明确授予，旧令牌不扩权。这里是既有规则的工程落地，B3 交互尚待用户试用，不新增总体目标或安全选型的最终确认。

## 书籍参考来源确认（2026-10-25）

| 编号 | 用户已明确的决定 | 主要规范 |
| --- | --- | --- |
| D9.1 | 历史确认：书籍指代统一到本地 aidlc book 参考；当时误指向 bojieli/ai-agent-book。该具体来源已被用户随后更正，由 D9.2 替代；保留区分原文、转述与适配建议的要求 | [纠偏记录](reference-correction-plan.md) |
| D9.2 | 用户明确此前参考内容错误，已重新克隆原计划参考的书。当前统一指向 references/aidlc-book-reference/aidlc-book-baojun/，《深入理解 AI-DLC》，mancbj/aidlc-book-baojun；要求修正规则、相关文档与推进计划 | [项目规则](../AGENTS.md#书籍参考来源约定)、[纠偏计划](reference-correction-plan.md) |

本项固化经更正的参考来源，不改写用户已确认 Intent，也不把 Schema、工件映射或运行时方案的建议写成已确认架构。新书第 2–5、7 章及 JSON 实验的核查事实见[纠偏记录](reference-correction-plan.md)；后续设计和实施仍须按实际任务授权推进。

## 理解与决策意图再次确认（2026-10-25）

用户在参考纠偏后要求多轮反向对话，并对完整意图复述明确回答“没错”，随后要求修改文档纠偏。以下来自该次明确确认，不据此将候选界面、模型或 Schema 设计升级为既定方案。

| 编号 | 用户已明确的决定 | 主要规范 |
| --- | --- | --- |
| D10.1 | 根本问题是推进过程不透明，自动流水线 / 验收通过后仍可能在人工验收发现语义偏移；需要从源头问题理解改动意义，并用对应证据客观核对 | [治理](governance.md#先理解再推进)、[产品有效性](validation.md#产品有效性与待确定的验收方法) |
| D10.2 | 理解与速度冲突时先理解再推进；业务逻辑和关键技术机制都包含在需深入理解的核心逻辑中，是否理解充分由用户判断 | [先理解再推进](governance.md#先理解再推进) |
| D10.3 | 决策材料应说明影响范围及备选方案的收益风险；可借助对应参考链接初步理解，必要时在明确范围和授权内实验验证后选择方案 | [治理](governance.md#先理解再推进)、[决策材料补充](templates/decision-record.md#agenthub-理解与决策补充) |
| D10.4 | 历史第一版次序：先由外部 Agent 提供材料，在 Hub 审阅、追问记录、补充、决定和追溯；该建设次序现由 D11 替代，理解与人工判断的目标保留 | [首版设计方向](architecture.md#理解与决策的首版设计方向) |
| D10.5 | 看板、Markdown、JSON Schema、Bolt 和 Harness 服务于上述目标；材料齐全、模型解释或自动检查不等于理解和实际验收 | [验证要求](validation.md#理解与决策闭环的验证要求)、[后续计划](reference-correction-plan.md#纠偏后的推进次序) |

本轮仅获项目文档修改与方向说明授权；不修改实际项目 Intent / 数据、不实现新代码或 Schema、不执行实验、安装依赖或进行 Git 写操作。已确认的产品文档可以依据此次明确确认更新，历史 B1–B3 的工程与人工反馈按原适用范围保留。

## 记录体系与 Harness 优先（2026-10-25）

用户在实现审查后明确调整当前推进目标，并提供分状态 Issue 看板截图作为交互参考。本次确认替代 D10.4 及先决策走读 / 审阅 UI 再建 Harness 的建设次序；D10.1–D10.3 的总目标、先理解再推进和人工判断责任保留。

| 编号 | 用户已明确的决定 | 主要规范 |
| --- | --- | --- |
| D11.1 | 建立 AgentHub 专属 Markdown + JSON Schema 记录体系；结构化部分后续融入看板 | [治理](governance.md#记录体系与-harness-建设次序)、[建设计划](records-and-harness-plan.md) |
| D11.2 | 看板可采用类似 Multica 的分状态 Issue 列表 / 卡片，内容按结构化合同分块；截图中的具体任务和数量不构成需求 | [结构与看板候选](records-and-harness-plan.md#结构化内容与看板分块候选) |
| D11.3 | 当前建设 AgentHub 自有 Harness，为后续接入 LLM 后推进并验证符合 Intent 的工作提供基础 | [Harness 职责候选](records-and-harness-plan.md#最小-harness-职责候选) |

LLM 参与的解释、审查和语义验证随基础及模型接入推进，确定性校验仍随建设完成；人工最终验收不转交模型。具体合同、状态、库、模型服务商、工具能力和模块实现为待设计内容，不能由以上方向推定已实现或取得所有执行许可。本轮同步规范与计划，没有实施 Schema / Harness、安装依赖、调用模型或进行 Git 写操作。

## JSON Schema Requirement 确认与实现（2026-10-25）

用户在进一步讨论后将当前任务明确收敛为 JSON Schema，并要求开始规划与实现；发现不明确点时必须反向对话。当前确认细化 D11 的记录目标，不推定 Harness、UI / 数据迁移或 Git 执行授权。

| 编号 | 用户已明确的决定 | 主要规范 |
| --- | --- | --- |
| D12.1 | 对话作为短期上下文，长期 JSON 提炼关键内容；目前不讨论团队、业务记录目录或 Git 版本管理 | [治理](governance.md#json-记录requirement-与拆解产物) |
| D12.2 | Requirement 是 Intent 拆解产物，在看板中对应 Issue；一个 Requirement 包含多项拆解产物，最终只对应一个 PR | [治理](governance.md#json-记录requirement-与拆解产物) |
| D12.3 | 多个子产物分别提供验收依据；Hub Requirement 与 GitHub PR 说明做了什么、为什么、影响 / 结果及验证 | [合同](json-schema-contract.md#进展结果与证据规则) |
| D12.4 | 本轮反向对话选择保留 Unit / Story / Bolt Plan 分层合同，允许按需出现 | [合同组成](json-schema-contract.md#合同组成) |
| D12.5 | 本轮反向对话选择保留最小出处：对话 / 消息标识、参考链接和必要短摘录，不保留完整 Markdown 对话 | [上下文](json-schema-contract.md#长期上下文与最小出处) |
| D12.6 | 开始当前 JSON Schema 的实现及必要校验；未决的业务语义继续向用户确认 | [工程状态](project-status.md#json-schema-记录合同首版2026-10-25) |

Draft 2020-12、Ajv 8.20.0、只读校验入口及快照结构是本次已落地的工程选择，尚不构成用户对全部字段与交互的最终接受。生产存储、正式导入、界面转换、自动提炼和审批真实性校验均未实现；合法合成数据也不能证明真实执行或人工验收。


## 正式 JSON 项目看板与迁移确认（2026-10-25）

用户要求检查当前 UI 是否符合新合同，不符合时修改；在反向对话中明确选择下列边界。它扩展 D12 的实现范围，保留一需求一 PR、可选分层和最小出处，不授权模型 / Harness 或 Git 写操作。

| 编号 | 用户明确选择 | 主要规范 |
| --- | --- | --- |
| D13.1 | 直接替换正式项目看板，同时确定新 JSON 保存与旧数据适配，不只做独立演示编辑器 | [正式看板](record-board-quickstart.md)、[架构](architecture.md#正式-json-项目与看板投影) |
| D13.2 | 提供迁移预览，每个旧正式 Issue 生成一个 Requirement 草案；父子与批准历史保留为来源；本人确认后另存新 JSON，旧库保留 | [映射](json-schema-contract.md#现有模型衔接)、[迁移](record-board-quickstart.md#旧项目迁移) |

2026-10-26 用户试用确认新 UI 符合预期，并要求项目入口改为“新建/导入项目”；JSON Schema 作为底层实现，不在客户端普通文案中强调。该反馈只确认本轮界面方向，不扩大为真实执行或完整产品验收。

工程上采用本地 JSON 项目快照、修订号冲突检查、临时文件原子替换及审计历史；SQLite 继续维护账户和旧记录，迁移后旧项目业务只读，撤销令牌仍可用。它们是本切片的已落地实现，不代表用户已最终验收交互或安全隔离。未实现团队 / 目录管理、Git 回滚界面、外部工具的新 JSON 写入或自动摘要。

## Harness 首个交付范围确认（2026-10-26）

用户明确 Harness 必须与 JSON Schema 配合，提炼后的关键内容进入 JSON，跨会话从 JSON 读取当前进度。本轮三项选择已确认，随后明确 Desktop 容器后置；此确认扩展当前源码任务到下面的最小 Harness，不受 D13 历史“本轮不含 Harness”范围限制。

| 编号 | 用户明确的决定 | 主要规范 |
| --- | --- | --- |
| D14.1 | 首个候选选择 A：针对一个 Requirement 的待核对长期信息，例如未知问题或假设；保持提议 / 未知性质 | [候选语义](governance.md#harness-候选与跨会话继承2026-10-26) |
| D14.2 | 同时支持保留候选与人端确认后应用；测试时用 AgentHub 作为测试版本中的项目推进，不修改已有实际用户项目 | [试用](harness-quickstart.md#隔离运行-agenthub-自测项目) |
| D14.3 | 恢复选择 A：运行、候选与事件持久化，重启后可查看 / 取消，重查修订与授权后继续人工判断，不自动重发中断调用 | [恢复](harness-quickstart.md#中断和恢复) |
| D14.4 | 初版最终形态为 Desktop App，使用用户提供图片作图标；用户另明确先完成 Harness，再确定桌面容器 | [图标与桌面](harness-quickstart.md#图标和桌面形态) |

本轮工程沿现有 TypeScript 分层、记录合同、人端身份、修订与通知实现，无新增依赖。Scripted-v1、32 KiB / 16 KiB、单次调用及 10 秒、24 小时运行授权、JSON Run 文件和回执核对是本切片可调整的工程选择，不构成模型服务商、通用 Agent 框架、桌面容器或高权限执行选型。真实 LLM、模型 API Key、任意 Shell、代码执行、Git Broker 和 OS 安全实验未启用；没有 Commit / Push / PR。

## Harness 工作区读取与外发边界确认（2026-10-26）

用户在架构审查中针对第二批工作区读取与外发边界确认下列核心决策，并明确指示直接实施：

| 编号 | 用户明确的决定 | 主要规范 |
| --- | --- | --- |
| D15.1 | 采用链接策略 B（Symlink Policy B）：允许授权工作区内普通源码符号链接，同时核对逻辑路径、中间解析路径和最终物理路径（realpath）；必须解析在授权根边界内且未触及受保护位置；阻断指向外部、敏感路径与循环链接 | [安全](security.md#工作区读取符号链接与工具边界2026-10-26) |
| D15.2 | 工作区工具授权与缺省边界：项目创建不强制绑定工作区；未显式授权工作区的 Run 其 tools 严格为 []，不回退到当前目录或环境变量；持久化保存 Run 授权元数据（不含凭据），UI 真实展示模型服务商、是否直连公网和工具范围 | [安全](security.md#工作区读取符号链接与工具边界2026-10-26) |
| D15.3 | 资源消耗与工具边界收紧：严格实施 16 KiB (16384 bytes) UTF-8 字节上限（安全截断不破坏多字节字符）；readFile 采用流式按行扫描与文件描述符读取，单行上限 4096 字符，扫描预算 512 KiB；searchCode 限制深度、文件数、字节与匹配数，区分未找到与截断 | [安全](security.md#工作区读取符号链接与工具边界2026-10-26) |

## 基建正确性、运行预算、步骤账本与恢复对账（2026-10-26）

用户要求完成已有基建的正确性与权限修复，落实运行预算计量、可核验步骤账本（以 `toolCallId` 串联）、断点恢复先对账再决定是否重发，并在看板直观呈现目标、边界与执行轨迹，提炼上下文选择逻辑。

| 编号 | 已落实的实现与待确认取舍 | 主要规范 |
| --- | --- | --- |
| D16.1 | **候选重复 ID 严禁与统一变更**：初检、预览与保存统一拒绝包含重复条件 ID（`DUPLICATE_CRITERIA_ID`）、重复 Unit ID（`DUPLICATE_UNIT_ID`）或重复 Story ID（`DUPLICATE_STORY_ID`）的候选；模型可修改未完成工作内容，严禁跨需求接管或覆盖已完成对象 | [治理](governance.md)、[合同](json-schema-contract.md) |
| D16.2 | **诚实运行预算与指标审计**：断点恢复时不退还已发生的模型调用次数（移除 `calls - 1` 退款），真实记录 `calls`；新增 `metrics` 累计追踪输入字节、输出字节、工具调用次数及耗时毫秒，并在超出预算时立即阻断 | [架构](architecture.md)、[安全](security.md) |
| D16.3 | **可核验步骤账本与对账恢复**：以 `toolCallId` 强关联模型 `tool_calls` 与工具执行结果，账本只记录公开可复现的调用参数、路径与观察结果，不收录隐式 CoT；从中断恢复时，先比对 assistant 轮次与 tool 轮次，自动补齐未执行完成的工具调用并更新账本，再发起后续模型请求 | [架构](architecture.md)、[快速上手](harness-quickstart.md) |
| D16.4 | **聚焦上下文选择提炼**：上下文大纲（`focusOutline`）自动提炼当前需求及同需求下子产物的职责接口（Unit 输入/输出）、验收准则、用户价值、同需求依赖及退出条件（Bolt Plan exitConditions），跨会话严格从正式 JSON 记录继承，排除未应用候选 | [上下文](json-schema-contract.md) |
| D16.5 | **默认工作区范围、同会话模型切换、粒度 2 会话分叉与运行时管理**：由用户于 2026-10-26 明确确认，详见 D17 | [D17](#工作区默认范围运行时管理同会话模型切换与会话分叉确认2026-10-26) |

## 工作区默认范围、运行时管理、同会话模型切换与会话分叉确认（2026-10-26）

用户在讨论边界与模型切换恢复机制后，明确确认以下四项架构决策并指示实施（引用《深入理解 AI-DLC》`references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch04-memory-bank-standards.md` 第 4 章 02 节“最小可恢复上下文栈”与 05 节“冷启动恢复 A/B 检查”原则）：

| 编号 | 用户明确确认的决定 | 主要规范 |
| --- | --- | --- |
| D17.1 | **默认整树工作区读取范围**：授权工作区后默认覆盖整个工作区目录树（`readScope: ['.']`），无需手工枚举子目录；安全底线由 Path-Jail、链接策略 B 与敏感路径黑名单（`.git`、`node_modules`、`.env*`、`.agenthub`、SQLite 库、私钥等）强制拦截 | [安全](security.md#工作区读取符号链接与工具边界2026-10-26) |
| D17.2 | **Multica 风格运行时管理**：内置预设运行时（`scripted-v1`、`deepseek-chat`、`deepseek-reasoner`、`openai-compatible`），支持用户手动新增或自定义修改运行时配置（`id`、`name`、`provider`、`baseUrl`、`model`、`apiKeyEnv`、`timeoutMs`）；`apiKeyEnv` 仅保存环境变量名，严禁保存或回显明文密钥 | [工程状态](project-status.md#基建正确性运行预算与对账恢复2026-10-26) |
| D17.3 | **同一会话内切换模型/供应商（In-Session Model Switch）**：在同一会话（同一 `HarnessRun`）中无论因网络中断恢复还是在等待确认时，用户均可切换至不同模型或供应商；系统对未完成工具调用先对账补齐（`reconcilePendingToolTurns`），剥离尾随候选轮次并完整保留已执行的客观步骤账本（`turns`），跨模型协议自适应转换（含从支持 `step` 的工具模型切换至仅支持 `propose` 的模型），并记录 `model_switched` 审计事件 | [工程状态](project-status.md#基建正确性运行预算与对账恢复2026-10-26) |
| D17.4 | **Codex 风格会话分叉（粒度 2 · 步骤账本级分叉）**：支持从任意步骤 `forkPointStep` 分叉创建新 `HarnessRun`，记录 `fork: { parentRunId, parentRevision, forkPointStep }` 血缘，完整继承截至 `forkPointStep` 的 JSON 快照与已验证工具步骤账本（避免在新分支重复执行已完成工具调用），且不修改或污染父会话 | [工程状态](project-status.md#基建正确性运行预算与对账恢复2026-10-26) |

## 跨修订会话分叉观察继承决策确认（2026-10-26）

用户针对五批独立交叉验证中关于“项目修订变化后分叉会话继承历史步骤观察”的三项备选方案（方案 A 保守拒绝、方案 B 显式人端重认领与陈旧标记隔离、方案 C 有界确定性重放），明确确认**保持方案 A**：

| 编号 | 用户明确确认的决定 | 主要规范 |
| --- | --- | --- |
| D18.1 | **跨修订分叉保守拒绝继承历史步骤观察（方案 A）**：当 `project.revision !== parentRun.baseRevision` 时，会话分叉（`fork`）若请求继承历史步骤观察（`forkPointStep > 0` 且 `inheritedTurns.length > 0`），系统以 `409 STALE_OBSERVATIONS_NOT_INHERITABLE` 严格拒绝直接继承旧观察，仅允许 `forkPointStep: 0`（基于最新修订干净分叉）或另起新 Run 继承最新正式 JSON 记录。彻底杜绝模型将旧需求边界或旧上下文下的工具观察误当作新修订事实。 | [Harness 服务](../src/application/harness-service.ts)、[快速上手](harness-quickstart.md#中断恢复模型切换与分叉) |

## 跨会话冷启动恢复标准与零 Schema 扩张确认（2026-10-27）

用户在独立审查与冷启动恢复标准讨论中，明确确认**方案 A（纯聚焦恢复投影，零 Schema 扩张）**：

| 编号 | 用户明确确认的决定 | 主要规范 |
| --- | --- | --- |
| D19.1 | **纯聚焦恢复投影与零 Schema 扩张（方案 A）**：跨会话冷启动恢复严格基于已持久化的正式业务 JSON 记录（`RecordProject`）与客观运行账本（`HarnessRun`），不向正式 JSON Schema 注入非业务运行态字段；通过应用层纯领域函数（`buildRecoveryProjection` 与 `deriveNextSafeAction`）提炼最小可恢复上下文栈与 7 个核心问题，零开销保证合同规范纯洁性。 | [恢复领域](../src/domain/recovery.ts)、[快速上手](harness-quickstart.md#跨会话冷启动恢复标准与核对接口aidlc-第-4-章) |
| D19.2 | **冷启动 7 个核心问题与确定性停止门禁（AIDLC 第 4 章标准）**：新会话或新 Agent 仅凭持久化入口必须能回答：当前目标、当前进度、下一步安全动作、为何可做、适用修订与授权、证据与理由、未知项与人工 Gate。一旦发现记录矛盾（如声明完成但核查为 unknown 或缺少 passing 证据）、基准过旧或意图未确认，状态机必须输出 `STOP_AND_REPORT_GAP` / `RECONCILE_STALE_RUN` / `REQUIRE_HUMAN_INTENT_CONFIRMATION` 停止执行并请求人工裁决，严禁自主猜测。 | [恢复服务](../src/application/recovery-service.ts)、[工程状态](project-status.md#第六批安全与一致性缺口修复与跨会话冷启动恢复2026-10-27) |

## 运行时配置指纹绑定、流式预算贯通与依赖影响解耦确认（2026-10-27）

针对执行约束链及独立审查，明确并落实以下架构决策：

| 编号 | 已确认的决策 | 主要规范 |
| --- | --- | --- |
| D20.1 | **运行时配置指纹绑定与闭门原则（Fail-Closed Runtime Identity）**：在 `run.schema.json` 与 `ModelRuntimeBinding` 持久化 64 字符 SHA-256 非敏感配置指纹；严格拒绝 URL 查询参数与锚点（`UNSUPPORTED_RUNTIME_URL_QUERY`）；保留 URL 路径、模型名与环境变量名的大小写；彻底移除未知 ModelPort 的本地脚本化隐式推断，未知能力抛出 `403 UNKNOWN_PORT_DENIED`；运行时配置变更必须通过指纹检查阻断静默改道。 | [运行时注册表](../src/infrastructure/providers/runtime-registry.ts)、[安全](security.md) |
| D20.2 | **端到端有界流式输出预算贯通（End-to-End Stream Budget）**：将 Run 剩余输出预算 `stepRemainingBudget` 严格绑定到底层流式 reader 读取上限，超限立即 `reader.cancel()` 中断网络连接；明确区分网络原始响应字节（`rawResponseBytes`）与候选序列化字节，避免重复计量；异常、中断与超限时在 Run 账本中保留已知消耗并如实反映未知部分。 | [Harness 循环](../src/harness/loop.ts)、[模型 Provider](../src/infrastructure/providers/model-provider.ts) |
| D20.3 | **内容变更核查失效与完成态回退分开解耦（Decoupled Invalidation & Demotion）**：上游 Unit 内容修改时，沿依赖链将所有下游对象（包含 review/draft/done）的 `passed` 核查失效为 `unknown`；完成态回退依据 `dependsOn`、`unitId`（Story 归属 Unit）及准则通过性约束独立计算；`BoltPlan.storyIds` 仅作为规划范围解耦于上游前置依赖。 | [候选变更](../src/domain/record-candidate-mutations.ts)、[记录关系](../src/domain/record-relations.ts) |

## 多进程隔离冷启动验收、非200响应有界预算与旧运行闭门策略确认（2026-10-28）

针对第七轮独立交叉验证问题，明确并落实以下架构决策：

| 编号 | 已确认的决策 | 主要规范 |
| --- | --- | --- |
| D21.1 | **多进程隔离冷启动验收与统一整体验收判定（Decoupled Hierarchy & Multi-Process Acceptance）**：冷启动恢复视图与动作推导严格解耦 Unit/Story/Bolt Plan 可选层级，仅检查现有子产物是否完成与需求验收准则是否全部 passed，整体验收门禁与 API 入口统一复用 `checkRequirementAcceptanceEligibility`；建立独立的子进程消费者（`src/presentation/recovery-cli-consumer.ts`），通过 OS 原生隔离全面覆盖 14 种冷启动场景。 | [恢复领域](../src/domain/recovery.ts)、[CLI 消费者](../src/presentation/recovery-cli-consumer.ts)、[冷启动简报](templates/cold-start-acceptance-brief.md) |
| D21.2 | **非200响应有界流式读取与已知消耗准确累计（Bounded Error Reading & Byte Accounting）**：底层 Provider 在处理 429/500 等异常 HTTP 状态码时，错误响应读取上限与本次剩余输出预算对齐（`Math.min(4096, effectiveMax)`），防止恶意或超限错误体耗尽资源；错误抛出时附带已读取字节数 `bytesRead`，由 Harness 调度循环准确累计入 `metrics.outputBytes`，避免失败导致已知消耗丢失。 | [模型 Provider](../src/infrastructure/providers/model-provider.ts)、[Harness 调度](../src/harness/loop.ts)、[安全](security.md) |
| D21.3 | **旧运行缺失指纹严格闭门原则（Fail-Closed Policy on Missing Fingerprint）**：当 Run 账本中的 `runtimeBinding` 缺少配置指纹 `fingerprint` 时，系统在恢复解析（`resolveBoundRuntime`）阶段严格抛出 `409 MISSING_RUNTIME_FINGERPRINT`，阻断仅凭 model 字符串跳过校验恢复；冷启动视图将此类运行推导为 `REQUIRE_RUN_AUTHORIZATION` 并清晰陈述指纹缺失阻断理由。 | [运行时注册表](../src/infrastructure/providers/runtime-registry.ts)、[Harness 服务](../src/application/harness-service.ts)、[治理](governance.md) |

## 整体验收门禁一致性、结构损坏 Fail-Closed 与聚焦恢复上下文决策确认（2026-10-28）

针对第八轮独立交叉审查发现的问题，明确并落实以下架构决策：

| 编号 | 已确认的决策 | 主要规范 |
| --- | --- | --- |
| D22.1 | **整体验收前置检查严格一致性（Acceptance Preflight Gate Parity）**：`checkRequirementAcceptanceEligibility` 严格覆盖完成态全部结构与关系约束（包含需求关联最终 Pull Request、交付结果、各验收条件具备有效非模型核查且指向有效已核验依据、所有子产物已处于完成态且无悬空引用），既作为服务层 `RecordProjectService.acceptRequirement` 的直接校验，又由 `RecoveryService` / `buildRecoveryProjection` 统一调用，消除“建议可验收但提交必被拒”的不一致。若前置检查不满足，恢复视图绝不给出 `REQUEST_HUMAN_OVERALL_ACCEPTANCE` 或 `executableNow=true`，诚实列出未就绪项。 | [恢复领域](../src/domain/recovery.ts)、[项目记录服务](../src/application/record-project-service.ts)、[治理](governance.md) |
| D22.2 | **数据结构损坏 Fail-Closed 最小安全视图（Fail-Closed Structural Safety）**：遇到数据结构损坏（如顶级集合缺失或校验失败），绝不调用关系检查，不抛出 `TypeError`，统一返回最小安全恢复视图（`actionCode: 'STOP_AND_REPORT_GAP', executableNow: false`），并在 JSON、Markdown、HTTP、CLI 各入口保持一致。 | [恢复领域](../src/domain/recovery.ts)、[关系检查](../src/domain/record-relations.ts)、[安全](security.md) |
| D22.3 | **聚焦恢复上下文与只读消费端解耦（Focused Recovery Context & Offline Consumer Decoupling）**：指定具体需求时严格过滤为最小上下文包，仅包含该需求、其直接子产物、关联来源/核查/证据，以及项目级或绑定该需求的问题与假设，排除无关需求的技术细节；显式区分正式事实、前置观察与未知假设；`RecoveryService` 提供面向离线读取的 `getProjectRecovery` 纯只读投影，CLI 独立消费者无需伪造身份。 | [恢复领域](../src/domain/recovery.ts)、[恢复服务](../src/application/recovery-service.ts)、[CLI 消费者](../src/presentation/recovery-cli-consumer.ts) |

## 可配置恢复预算、必要内容出处闭包与三层事实对齐决策确认（2026-10-28）

针对第九轮独立交叉审查发现的问题，明确并落实以下架构决策：

| 编号 | 已确认的决策 | 主要规范 |
| --- | --- | --- |
| D23.1 | **可配置恢复上下文预算与渐进式截断（Configurable Budget & Progressive Truncation）**：恢复上下文预算可通过 `--budgetBytes` / `budgetBytes` 参数显式配置，默认 32 KiB（32,768 字节），范围限制在 4 KiB 至 1 MiB 之间；参数经过严格类型与数值校验（拒绝 NaN、Infinity、负数、浮点、字符串）。Intent、适用范围、约束、已确认决定、当前目标需求、直接出处及阻断下一步安全动作的关键未知项为必要内容；若仅必要内容超限，系统以 `STOP_AND_REPORT_GAP`（`necessaryOverBudget: true`）安全停止；若可选内容超限，按确定性顺序（源码摘要 -> 证据详情 -> 次要假设 -> 非通过态核查 -> 次要出处）渐进式省略，并附带上限 10 条的 `omittedSummary` 与稳定回查入口（`GET /api/record-projects/:id`）。 | [恢复领域](../src/domain/recovery.ts)、[CLI 消费者](../src/presentation/recovery-cli-consumer.ts)、[HTTP 路由](../src/infrastructure/http-server.ts) |
| D23.2 | **出处传递闭包与三层事实严格对齐（Provenance Closure & 3-Tier Fact Stratification）**：恢复投影计算相关来源集合（`scopedSources`）与证据集合（`scopedEvidence`）时，强制将 `contextItems` 的 `sourceRefs` 与 `evidenceRefs` 纳入传递闭包，彻底修复“内容进入恢复包但唯一出处被裁剪”的孤儿引用漏洞；同时严格区分三层语义：5.1 正式记录事实（已确认决定与约束）、5.2 前置运行观察（历史 Run 观察，不构成新授权）、5.3 未知事项与待验证假设（`proposed` 决定绝不升格为 `confirmed`），消除“已核验记录”夸大表述。 | [恢复领域](../src/domain/recovery.ts)、[恢复服务](../src/application/recovery-service.ts)、[治理](governance.md) |
| D23.3 | **基础结构校验前置防崩溃（Upfront Fail-Closed Structural Validation）**：在调用任何业务逻辑或关系校验前，前置执行无副作用的 `validateBasicStructuralHealth`；当 `requirements[0].title` 为非字符串、数组元素为 null 或顶级集合错类型时，安全捕获违规项（上限 25 条）并直接返回最小安全停止视图，杜绝调用 `.trim()` 等属性访问导致 `TypeError` 崩溃服务，保证 HTTP、CLI、JSON、Markdown 所有入口 Fail-Closed 一致性。 | [恢复领域](../src/domain/recovery.ts)、[安全](security.md) |
| D23.4 | **交付物真实 UTF-8 计量、预算闭门兜底、出处闭包不破坏与紧凑安全停止诊断（Deliverable UTF-8 Metering, Budget Enforcement, Undamaged Provenance Closure & Compact Stop Diagnostic）**：针对第十轮交叉审查缺口落实严格规则：① `deliveryFormat` 全链路透传，计量按 CLI 实际 stdout 格式化输出或 Markdown 文本的真实 UTF-8 字节计算，杜绝 CLI 缩进换行突破预算；② `applyRecoveryBudget` 引入 Step 5 剪裁 `proposed` 决定与次要讨论，剪裁后若必要内容仍超限，强制调用 `buildCompactStopView` 报告 `STOP_AND_REPORT_GAP`（`necessaryOverBudget: true`），严禁以 49 KiB 超限继续给出授权；③ 废除按数组索引 `slice(0, 3)` 截断 sources 的机制，出处剪裁仅省略未被任何保留项（意图、需求、已确认决定、约束）引用的次要来源，保留项所依赖的出处闭包 100% 完整保留；④ 必要内容超限或数据损坏时，由 `buildCompactStopView` 构造轻量化精简诊断（< 5 KiB），杜绝回显 47 KiB 庞大正文；⑤ 遗漏元数据具备具体真实对象 ID 与 `#records.collection[id=...]` 锚点，取回入口明确指向真实存在的 `GET /api/record-projects/:id`（杜绝 404 的 `/records` 路由）。 | [恢复领域](../src/domain/recovery.ts)、[恢复服务](../src/application/recovery-service.ts)、[CLI 消费者](../src/presentation/recovery-cli-consumer.ts)、[HTTP 服务](../src/infrastructure/http-server.ts) |
| D23.5 | **恢复包全出处闭包保护、停止诊断确定性渐进压缩与事实真实性三大不变式（Universal Provenance Closure, Deterministic Stop View Shrinking & Zero Fabrication Invariants）**：① **不变式一（出处闭包）**：保留的必要事实必须具备完整可查的来源。`RecoveryGoal.intent`、`activeRequirement` 与 `evidenceLinks` 显式承载 `sourceRefs` 与 `confirmationSourceRefs`，在步骤 6 中受 `computeRetainedRequiredSources` 闭包保护；压缩后执行 `hasCompleteRequiredSources` 门禁，必要出处无法容纳时强制停机，严禁剥离意图来源输出可执行动作；② **不变式二（预算绝对确定性）**：所有交付格式（CLI 格式化 JSON / Markdown、HTTP JSON / Markdown）在极限预算（如 4096 字节）下均严格合规。`buildCompactStopView` 执行 5 阶段渐进式收敛压缩并附带最终断言，杜绝仅缩短 why 导致 Markdown 输出 4405 字节超限；③ **不变式三（事实零虚构）**：恢复诊断严禁篡改业务事实。停止视图严格如实传递意图实际确认状态（如 `'proposed'`），底层结构损坏时如实降级为 `'unknown'`，绝不伪造硬编码 `'human_confirmed'`。 | [恢复领域](../src/domain/recovery.ts)、[治理](governance.md)、[架构](architecture.md) |
| D23.6 | **终极预算守卫、授权明细安全省略与停止诊断运行态事实零失真（Ultimate Budget Enforcement, Authorization Detail Omission & Run Fact Preservation）**：① **授权详情安全省略**：当工作区授权包含海量读取范围（如 60 条每条 120 字符）或运行时绑定内部明细过大导致预算紧张时，停止诊断在阶段 2/3 安全省略明细（`activeGrant: null, runtimeBinding: null, authorizationDetailsOmitted: true`），但**绝不修改真实授权状态**（`authorizationState: 'valid'` 保持 `valid`，不捏造截断的假范围，不伪造 `revoked`），并在授权附注与 Markdown 中如实输出“授权详情未包含，需取回重新核对”及 `GET /api/record-projects/:id` 回查入口；② **终极预算守卫与多层闭门兜底**：`buildCompactStopView` 阶段 5 终极断言 + CLI 消费者实际标准输出 UTF-8 真实字节双重校验，在极限预算（如 4096 字节）下经渐进收敛后仍超限时，抛出类型化 `HubError(413, 'BUDGET_EXCEEDED')`，HTTP 返回 413，CLI 输出有界错误到 stderr 并以退出码 1 终止，绝不以退出码 0 输出超限内容；③ **停止诊断运行态与候选生命周期事实零失真**：停止诊断必须如实反映 `latestRunState`（如 `waiting_human`）、`pendingCandidateCount` 与 `keptCandidateCount`，绝不因进入停止视图就硬编码为 0 或丢失状态渲染为“无运行”；④ **停机原因严格分类与无偏见诊断**：明确区分“必要恢复上下文超出预算上限”与“记录底层结构错误/合同校验失败”，结构损坏时保留损坏事实诊断，绝不误写为预算超限，绝不误导用户盲目增大 `--budgetBytes`。 | [恢复领域](../src/domain/recovery.ts)、[CLI 消费者](../src/presentation/recovery-cli-consumer.ts)、[治理](governance.md)、[架构](architecture.md) |
| D23.7 | **授权恢复路径闭环、未知授权状态如实表达与消费端安全重检（Closed Authorization Retrieval Path, Truthful Representation of Unknown Authorization & Consumer Verification）**：① **授权恢复路径闭环与明确定位契约**：当恢复包受预算约束省略工作区授权与运行时绑定明细时（`authorizationDetailsOmitted: true`），`RecoveryAuthorizations` 强制保留稳定的物理与逻辑定位元数据（`targetRunId`、`runRevision`、`baseRevision`、`retrievalEndpoint: /api/runs/:id`、`retrievalLocator: runs/:id.json`）；Markdown 与 JSON 中明确指引通过 `GET /api/runs/:id` 或文件路径回查完整账本，彻底消除此前因提示回查 `/api/record-projects/:id` 导致在新会话中形成死胡同的缺陷；② **在线人端鉴权与离线免鉴权双通路读取**：在线 HTTP 访问由服务层强约束只供人端凭据，工具令牌与未登录访问分别返回 403 / 401 严防越权；离线 CLI 消费者可通过 `retrievalLocator` 直接从 `runDir` 读取并解析，零外部带外信息即可闭环；③ **未知与未验证授权状态如实表达**：解耦项目记录结构健康度与运行授权生命周期，当项目底层结构损坏但存在具有活跃授权的 Run 时，授权状态如实推导为 `'unverified_due_to_corruption'`，绝不武断默认归零为 `'none'`；严格区分 `'valid'`、`'expired'`、`'revoked'`、`'stale_revision'`、`'none'`、`'unknown'`（多需求未选定）、`'unverified_due_to_corruption'` 七类正交语义；④ **消费端独立重检与防漂移/篡改门禁**：提供纯领域安全重检函数 `verifyRetrievedRunAuthorization`，任何新会话或独立消费者在取回完整 Run 账本后，必须对照快照基准比对版本号、过期时间、取消状态与项目结构健康度，严防盲目信任快照中过期的 `'valid'` 状态。 | [恢复领域](../src/domain/recovery.ts)、[Run 存储](../src/infrastructure/run-store.ts)、[HTTP 路由](../src/infrastructure/http-server.ts)、[治理](governance.md)、[安全](security.md) |
| D23.8 | **恢复包驱动的真实只读消费闭环、目标绑定与事实重检（Read-Only Consumer Closed Loop, Goal Binding & Fact Re-verification）**：针对第十四轮审查缺口落实四大强制契约：① **严格目标绑定与归属校验**：`verifyRetrievedRunAuthorization` 强制校验 `recoveryView.authorizations.targetRunId`，若为空、为多需求未选定（`SELECT_TARGET_REQUIREMENT`）或处于 `unknown` 状态，立即拒绝并不予通过；强校验传入运行记录的 `run.id === targetRunId`、`run.projectId === targetProjectId`、`run.requirementId === targetRequirementId`，且验证该需求在当前项目中真实存在且归属于当前 Intent，拦截跨项目、跨需求、悬空或已删除需求的非法绑定；② **真实当前事实重检与结构健康度门禁**：消费端必须重新读取当前项目与 Run 账本，若读取失败或缺失则返回未验证，绝不允许退回使用旧快照猜测；前置执行结构校验（`validateBasicStructuralHealth`），若底层结构损坏返回 `unverified_due_to_corruption`；严格校验项目修订未前进/漂移、运行修订一致、运行未过期且处于活跃非终止状态；③ **精确区分三类正交执行语义**：明确解耦并分别计算 `runAuthorizationApplicable: boolean`（Run 授权是否合法适用）、`workspaceAccessGranted: boolean`（是否具备本地工作区读写权限）、`executableNow: boolean`（当前是否可立即执行）；纯上下文分析运行（`workspace.authorized: false`）是合法 Run，其授权适用但无工作区访问权限，严禁判为非法；④ **离线定位合同一致性与防穿越安全解析**：统一 `retrievalLocator` 语义，规范化定义为相对于 `runDir` 的 `${targetRunId}.json`（消除冗余的 `runs/` 前缀嵌套）；实现安全路径解析器 `resolveRunLocatorPath`，严防绝对路径、空字节与目录穿越（`..`），并具备对历史生成的 `runs/${id}.json` 快照的安全平滑兼容能力；⑤ **独立进程级只读消费闭环验证**：CLI 消费者支持 `--verifyRecovery <path>` 与 `--projectDir`、`--runDir` 组合，支持独立操作系统进程 A 生成恢复包并退出，独立进程 B 纯粹依据恢复包与目录完成取回、校验与重检，零带外信息闭环，且输出受 `--budgetBytes` 严格约束。 | [恢复领域](../src/domain/recovery.ts)、[Run 存储](../src/infrastructure/run-store.ts)、[CLI 消费者](../src/presentation/recovery-cli-consumer.ts)、[恢复服务](../src/application/recovery-service.ts)、[治理](governance.md)、[安全](security.md) |
| D23.9 | **恢复消费者边界加固、正式记录关系完整核验、默认预算强制与账本物理读取约束（Consumer Boundary Hardening, Full Relation Verification, Default Budget Enforcement & Physical Run Ledger Constraints）**：针对第十五轮审查缺口落实四大强制契约：① **移除缺少当前项目时的兼容放行**：`verifyRetrievedRunAuthorization` 彻底废除仅凭 `currentProjectRevision` 比对即放行 `valid: true` 的历史遗留分支；必须具备当前重新读取的正式项目事实（`currentProject`），若未提供或读取失败立即返回 `valid: false, state: 'unverified_due_to_corruption'`，并将 `checks.projectStructureHealthy`、`checks.projectRelationsValid` 与 `checks.requirementExistsInCurrentProject` 均置为 `false`，杜绝凭空推断；若未读取到目标运行账本，如实返回 `state: 'none', run: null`，不捏造虚假备用运行；② **复用正式记录完整关系校验（inspectRecordRelations）**：对重新读取的正式项目，仅通过 Ajv Schema 校验无法发现断裂引用（如删除 `sources` 后 Intent 仍保留 `sourceRefs` 导致 `UNKNOWN_REFERENCE`，或需求归属未知 Intent 导致 `UNKNOWN_INTENT`）；重检前置执行 `inspectRecordRelations`，一旦发现断裂引用、孤儿产物或无效依赖，立即将 `checks.projectRelationsValid` 标记为 `false` 并输出 `valid: false, state: 'unverified_due_to_corruption'`，附带具体问题代码与路径；③ **落实验证报告默认预算 32768 字节与真实交付边界**：CLI 入口统一调用 `validateRecoveryBudget`，不传 `--budgetBytes` 时严格默认生效 32768 字节（允许范围 4096 至 1048576 字节）；格式化 JSON 与 Markdown 均通过 `getUtf8ByteLength` 计量实际 UTF-8 输出；当工作区授权范围庞大（如 500 条路径，体积 > 50 KiB）导致验证报告超限时，安全省略明细（`activeGrant: null, authorizationDetailsOmitted: true`），优先保留重检结论、检查清单、修订号与定位字段（`retrievalLocator` / `retrievalEndpoint`），在 4096 字节极限预算下执行渐进压缩；④ **约束账本文件的物理读取范围与禁止符号链接**：运行存储（`resolveRunLocatorPath`、`readSafeRunFile` 与 `JsonRunStore.get`）强制通过 `lstatSync` 校验目标文件，严禁使用符号链接（`UNSAFE_RUN_FILE`），要求必须为普通文件；通过 `realpathSync` 物理防逃逸断言目标文件物理父目录严格等于已解析的 `runDir`；限制账本文件体积上限为 2 MiB；CLI 遇到非法定位符或符号链接攻击时直接向 stderr 输出有界错误并以退出码 1 失败拦截。 | [恢复领域](../src/domain/recovery.ts)、[Run 存储](../src/infrastructure/run-store.ts)、[CLI 消费者](../src/presentation/recovery-cli-consumer.ts)、[治理](governance.md)、[安全](security.md) |

## JSON Schema 完善基线与决策索引（SC-001—SC-024，2026-10-30）

用户在多轮反向对话后确立了针对 JSON Schema 完善工作的 24 项统一决策基线（编号 **SC-001 至 SC-024**），并确立分期实施规划（**P01—P13**）。这些决策用于指导后续每轮编码与独立验证，消除规则不一致。

完整决策规范、书籍参考定位、合同总图与正反例验收矩阵统一维护于主交付文档：[JSON Schema 完善路线图与验收矩阵](json-schema-roadmap.md)。

### 关键替代关系明确

1. **废除并替代 D12.2 一需求一 PR 约束**：
   - **旧决策 D12.2** 曾规定“一个 Requirement 对应一个最终 PR”；
   - **新决策 SC-005（PR 可选及多 PR）** 明确废除此项旧规则：PR 是可选交付关联，一个 Requirement 允许关联 0 个、1 个或多个 PR；无仓库或无 PR 时仍可通过适用的产物、证据与人工接受完成验收。该项将在 P06 正式落地代码。
2. **多仓库绑定扩展（SC-004）**：
   - 项目可不绑定仓库，亦可绑定多个仓库，Requirement 明确自身适用的仓库范围；绑定不产生 Git 操作权限。
3. **长期存储、存储物理限制与单次加载预算三者解耦（SC-008）**：
   - **长期保存原则**：持久化存储（`RecordProject`）完整保留所有有工程价值的信息，模型单次会话上下文预算不能成为拒绝保存有效信息的理由；
   - **物理写入限制**：当前单文件存储实现（`JsonRecordProjectStore.write`）设有 16 MiB 的硬性拒绝写入阈值，用于防范异常死循环写入与保护宿主安全；这属于当前本地实现的写入守卫，并非用户确认的长期业务容量目标，更非“软提醒”；
   - **单次加载与交付预算**：恢复服务与 CLI 采用单次精简交付预算控制（当前实现默认 32 KiB，支持配置 4 KiB 至 1 MiB），用于限制喂给大模型或命令行的上下文体积，两者物理与概念完全解耦，严禁因恢复预算而削减或丢弃长期记录。

### SC-001—SC-024 索引概览

| 编号 | 名称 | 核心原则 | 主责阶段 |
|---|---|---|---|
| SC-001 | 工程价值 | 记录必须服务于目标、事实、风险与验证，拒绝形式化场面话 | P10 |
| SC-002 | 职责分离 | Schema 约束结构，实例承载记录，用例检查规则，校验通过不等于真实与授权 | P13 |
| SC-003 | 拆解与归属 | Intent 拆为 Requirements（看板卡片）；子项按需分层且唯一归属单需求 | P04 |
| SC-004 | 仓库绑定 | 项目可选绑定 0..N 仓库，Requirement 明确范围，绑定不产生 Git 权限 | P06 |
| SC-005 | PR 可选及多 PR | PR 为可选交付关联（0..N），无 PR 亦可验收，替代强制单 PR 旧规则 | P06 |
| SC-006 | PR 识别 | 严谨识别 PR 四段式（What/Why/Verification/Result），歧义人端裁决，不瞎猜 | P06 |
| SC-007 | 预期与实际 | 严格分离“要做什么/为何做”与“实际做了什么/证据为何” | P04 |
| SC-008 | 存储与加载 | 保留完整价值信息，单次加载预算受控，出处不足停机说明缺口 | P10 |
| SC-009 | 认识状态与出处 | 严格区分 proposed/unknown/observed/confirmed，来源不代表权限 | P03 |
| SC-010 | 稳定决策目标 | 稳定决策标识，方案对比，accepted/rejected/deferred 状态机与重估条件 | P03 |
| SC-011 | 生命周期 | 采用状态（active/inactive）与工作状态（draft..done）解耦，不物理删除 | P04 |
| SC-012 | 停用与重新启用 | 停用不得逃避验收，重新启用全面重检当前意图与依赖，旧证据按依据复用 | P04 |
| SC-013 | System Context 与 Standards | 声明外部边界与依赖，Standards 版本化，显式例外治理，冲突默认 Fail-Closed | P05 |
| SC-014 | Intent 修订顺序 | 先反向对话确认新意图，再对齐拆解产物，严禁先写代码反向改意图 | P08 |
| SC-015 | 依赖与影响 | 记录依赖理由与契约，区分归属与跨需求影响，显式检查与 Agent 发现互补 | P04 |
| SC-016 | 证据适用性 | 证据强绑定代码版本指纹与环境，机器/模型/人工结论不得混淆 | P07 |
| SC-017 | 增量验证范围 | 拓扑级依赖与受影响验证，未知影响默认 Fail-Closed 标记待核对 | P09 |
| SC-018 | 错误级联控制 | 增量报告变化与影响，上游依据失败阻断依赖其的正式执行与判定 | P09 |
| SC-019 | 对话级检查点与归因 | 提示词发送前状态为检查点，精确归因 Agent 变更，不混入外部操作 | P11 |
| SC-020 | 回滚一致性 | 工作区与记录双向一致回滚，撤销项明确标记，保留审计与不可逆副作用清单 | P12 |
| SC-021 | 完整项目合同 | 外层元数据、审计、迁移全量 Schema 校验，数据损坏安全只读阻断崩溃 | P02 |
| SC-022 | 兼容与迁移 | 明确 Schema 演进策略，兼容读取与语义迁移解耦，迁移强制预览人端确认 | P02 |
| SC-023 | 一致性与回归 | Schema、类型、关系校验、存储与文档严格对齐，全量正反例与场景回归 | P13 |
| SC-024 | 收尾与交互边界 | 恢复后清晰呈现目标/进度/被否决路线/缺口，UI 业务化（新建/导入项目） | P13 |
