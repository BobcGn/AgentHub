# 已确认决策索引

本文件保留初始化时用户指定的五轮 **Confirmed Architectural Decision**，并追加 2026-10-22 产品意图修订及 2026-10-23 推进次序、TypeScript 工程初始化范围确认。编号仅用于定位，不补造讨论原文、历史日期或单独审批记录。新增 D6 编号表示本轮修订，不是对初始化五轮历史的重命名。

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
| D6.10 | 对话前置：参考 Book 第二章的上下文、流程与业务规则原则，先明确意图、边界、责任、方案取舍和验证方式，由用户确认后进入正式交付拆分及授权执行；不机械固定轮数，摘要不能代替确认或授权 | [对话前置](governance.md#对话前置与意图确认)、[产品验证](validation.md#对话前置的产品验证要求) |

## 阶段一推进次序确认（2026-10-23）

| 编号 | 已确认决策 | 主要规范 |
| --- | --- | --- |
| D7.1 | 基于既有 Intent 直接开展阶段一范围与交互设计，真实项目后续导入验证，不要求先提供真实任务才能启动设计 | [阶段一草案](architecture.md#阶段一首版交互草案2026-10-23)、[设计与验证边界](validation.md#阶段一设计检查与后续真实项目验证) |

阶段一提出的功能区域、交互组织、候选范围和场景走读仍是待评阅设计，不因本条推进次序确认自动成为已确认方案或真实运行证据。

## TypeScript 工程初始化范围（2026-10-23）

| 编号 | 用户明确的任务范围 | 主要规范 |
| --- | --- | --- |
| D7.2 | 初始化 TypeScript 项目、建立对应目录、完善规则文档；范围内可建立最小入口与开发配置、安装必要开发依赖并验证骨架。不扩展为产品功能、安全实验、外部模型接入或 Git 写操作 | [工程组织](architecture.md#typescript-工程组织)、[开发规则](../AGENTS.md#typescript-开发规则)、[工程检查](validation.md#typescript-工程初始化检查) |
| D7.3 | 用户随后指定 BobcGn/AgentHub 作为项目仓库并要求初始化推送；本轮获准本地 Git 初始化、origin 配置、首次提交与推送，不包含 PR、Merge 或 Release | [仓库与交付范围](project-status.md#git-仓库初始化与首次推送范围2026-10-23) |

本次采用的单包 Node.js / npm、ESM、严格类型配置和目录布局是实现该任务的工程基线，具体版本见 package.json、锁文件和[工程状态](project-status.md)。它们不是另行取得的最终平台或界面选型决策。

产品意图、阶段次序与工程骨架均不构成技术 Pass、完整 MVP Implementation Go、可信晋升或最终验收。Git 交付仅按 D7.3 的本轮明确任务执行，不推导后续远程权限；工程初始化与后续产品能力准入分别处理。
