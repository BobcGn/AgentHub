# BobcGnHub

BobcGnHub（AgentHub）面向使用 Agent 开发的研发者，帮助人从源头问题理解改动的意义、备选方案的取舍及核心业务与技术机制，再用对应证据核对实际影响。理解与推进冲突时先理解再推进；当前先建设专属 Markdown + JSON Schema 记录体系与自有 Harness，后续接入 LLM 推进和验证，并将结构化数据融入分状态、分块的 Issue 看板。

## 为什么做 AgentHub

使用者在通过 Agent 与任务看板开发项目时，遇到了两类问题：机械遵循规则会使理解速度跟不上 Agent 的推进；规范的任务记录又可能与实现和验收结果发生语义偏移，最终带来返工或放弃。仅增加提示词和记录无法提供对 Agent 运行过程的充分掌控。

AgentHub 希望让人依据第一性原理持续明白“我在解决什么问题、做了什么、为什么值得做、核心逻辑怎样成立、哪些证据支持结果”。核心业务与技术机制需深入理解，是否充分由用户判断；用户尚未理解时不推进依赖该判断的正式实现。安全隔离、授权、证据和恢复是支撑这一目标的机制。项目是否有价值，还需要实际使用证明推进稳定性和可理解性有所改善。

## 已确认的产品方向

- 对话前置：先澄清源头问题、意图、边界、责任与验证方式，呈现方案理由、收益和风险，由用户确认 Intent 后再进入正式交付拆分与授权执行；已有确认可按适用范围复用。
- 从源头问题和第一性原理划定交付边界，避免机械、无限拆分；较大的 Intent 可用父 Issue 表达，拆分后的交付单元对应子 Issue。
- 经用户确认的 Intent 是目标与预期行为的唯一事实源。Issue、方案、实现和验收均须与其对应；意图修改须先与用户商讨，并在用户明确授权后进行。
- 先理解再推进：说明影响范围、备选方案的收益风险及业务与技术核心机制，提供对应参考资料，必要时在明确范围和适用授权内实验验证；由用户判断理解是否充分并决定方案，再在有效 Grant 内执行。
- Issue 中的预期与 PR / Review 中的实际交付保持可追溯的对应关系；规范文字不能代替执行证据。
- Hub 在提交前检查改动和本地测试，通过后在获准范围内提交、推送，并查看对应版本的流水线信息；CI 失败时在原目标和授权内返工。
- 推送后的 CI/CD 是第一道交付门禁；第二道门禁由用户介入实际运行验收，核对实际结果与 Issue / PR 所述的本次修改影响和结果，并检查是否偏离 Intent。
- 当前优先建设记录体系及 Harness；LLM 参与的解释、审查与语义验证在接入后推进，确定性检查随基础建设完成。Runtime 优先云端模型与 Hub 自有 Harness。本地小模型后续可承担辅助 Review 或文档总结；已有 Agent 的接入须另行验证约束能否被绕过。

三种运行模式的职责和优先级见[架构](docs/architecture.md)，Intent / Issue 与记录语义见[治理](docs/governance.md)，交付门禁和产品有效性验收见[验证](docs/validation.md)。

## 当前 MVP 边界

先前的单个本地缺陷修复、本地 Commit 和本地 Review 链路保留为技术验证切片。它可以检验部分执行与交付机制，但不足以单独证明本轮确认的完整产品目标。

当前交付顺序为先建立 Markdown、结构化实例与 JSON Schema 合同，并建设最小 Harness；后续接入云端 LLM 推进并验证解释、审查、执行和结果记录。正式看板现采用状态列 / Requirement 卡片，详情按 v1 合同分块；当前最小 Harness 已记录脚本化候选步骤与人端应用，完整方案比较、真实模型与代码执行仍待后续建设。既有外部记录入口继续保留，审阅交互不作为 Harness 建设前提。Runtime 仍优先云端模型、自有 Harness、单主要写入 Run，完整目标仍是从已确认 Intent 到人工验收的闭环。Hub 负责提交前检查、本地测试、获准提交推送及流水线反馈；最终实际验收由用户介入。用户已确认方案选择通过反向对话后由用户最终决定，PR 按做了什么、为什么这么做、如何验证、结果怎么样四段编写，并由用户补充截图等证据。具体布局与 PR 创建方式仍未定，见[阶段一材料](docs/phase-1-review.md)。现有 DeepSeek Loop 是既有技术起点，本轮未重新指定具体模型或服务商。

阶段一直接基于上述已确认意图推进，真实项目在后续导入验证，不作为设计启动条件。现已形成[首版交互草案](docs/architecture.md#阶段一首版交互草案2026-10-23)及[设计检查与真实验证的边界](docs/validation.md#阶段一设计检查与后续真实项目验证)。功能区域、页面组织和首版具体范围仍是待评阅草案。

E1–E4 与技术准入要求继续适用。Codex 正式适配、完整 MCP、多 Agent、多项目调度、Electron 打包、通用 VM 管理和通用 Skill / Workflow 市场仍延期；本地辅助模型也不作为第一版必要条件。详见[验证契约](docs/validation.md)。

## JSON Schema 记录合同

当前记录合同已接入正式看板：Requirement 是看板 Issue，一个 Requirement 对应一个最终 PR；Unit / Story / Bolt Plan 按需出现、分别验收并唯一归属该需求。长期 JSON 提炼关键信息及最小出处，不归档完整 Markdown 对话。已提供 11 份 Draft 2020-12 Schema、合法 / 非法合成样例及只读命令：

```bash
npm run --silent records:validate -- examples/records/planned.json
```

字段、分层关系、状态、证据、样例与旧模型映射见[合同说明](docs/json-schema-contract.md)。成功仅表示结构 / 关系规则成立，不鉴定人工确认或证据真实性。新建正式项目与明确确认的迁移结果保存为 JSON，并由同一数据投影看板；实际旧数据不会自动迁移。最小 Harness 已复用本合同生成候选、人端保存并在新会话读取；真实模型自动提炼仍未实现。试用见[正式看板指南](docs/record-board-quickstart.md)。

## 当前真实状态

截至 2026-10-25，默认首页已替换为正式 JSON Requirement 状态看板：一个卡片对应一个需求，详情支持手动预览 / 编辑可选 Unit、Story、Bolt Plan、长期上下文、出处、验收证据与核查；Requirement 只记录一个最终 PR。保存显示差异与理由，修订冲突保留草稿，内容变化使相关旧核查 / 整体接受失效。整体接受由独立人端入口记录，不以状态按钮证明真实执行。

旧项目先做迁移预览，每个旧正式 Issue 生成一个 Requirement 草案，父子及 B1 / B3 批准历史保留来源；人端确认后另存 JSON，旧库保留为只读来源，仍可撤销旧令牌。新 JSON 接口当前只供人端，不给旧工具令牌自动扩权。已确认 Intent 正文不在通用编辑范围，新界面尚无完整 Intent 修订流程。操作与已知限制见[指南](docs/record-board-quickstart.md)。

保留的 B1 提案审批、B2 概览 / 普通记录及 B3 关键修订已实现并通过本地自动检查：用户建立项目 / 初始 Intent，发放限定范围的工具令牌，CLI 提交待审新增 Issue 建议，界面展示变动、理由、方案收益风险及验证方式，由人端决定后更新正式清单。SQLite 保存项目、提案、决定与正式 Issue，服务重启后保留；重复请求、版本冲突及事务失败有实际验证。

B2 新增正式 Issue 详情、父子关联、原意图 / 方案决定追溯，以及人端和工具的讨论摘要、备注、Agent 报告追加。工具记录权限由人端明确选择对象与类型，旧令牌不自动扩权，报告不成为实际验证结果。B2 的授权记录、刷新一致与 Issue 详情展示已获用户试用确认。B3 新增 Issue / Intent 候选修订、修改前后及影响审阅、版本绑定决定和历史；Intent 应用须先由人端登记商讨并明确授权，批准不会自动扩大工具范围。B3 仍待人工试用，真实项目效果仍待验证；云端模型、受控代码执行、Git / CI 及实际验收闭环尚未实现；自有 Harness 的当前脚本化切片见下文。应用接口鉴权不证明同一 OS 用户下的隔离或可信审批，X1–X5 未获技术 Pass。完整工程证据见[当前状态](docs/project-status.md#b3-关键变更与差异审查2026-10-25)，操作见[试用指南](docs/board-quickstart.md)。

## 最小 Harness 与长期记录

需求详情现在提供“需求运行”：读取适用的已确认 Intent 和一个需求，调用脚本化替身，检查结构化候选后等待人工。可保留候选，也可预览后明确保存到正式长期信息；重启后候选、过程和已保存内容保留，新运行从当前 JSON 读取。需求状态与验收不自动改变。当前未接真实 LLM 或代码执行，详见[试用与恢复指南](docs/harness-quickstart.md)。

用户提供图标已原样作为静态资产与页面图标保存；Desktop App 是后续目标，用户选择先完成 Harness，再确定桌面容器。

## 本地试用

使用 Node.js 24（本次验证 24.16.0）和 npm 11，在仓库根目录运行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run setup
npm run check
npm run build
npm start
```

setup 由本人在交互终端建立人端密码，没有默认账户；打开 http://127.0.0.1:4317 登录。默认账户及旧来源保存于 .agenthub/board.sqlite，正式 JSON 位于同级 record-projects；重启后需重新登录。首次试用请用演示项目；默认首页人端操作新 JSON，未迁移旧项目的外部 Agent 只取得原界面发放的工具令牌。详细的 CLI 示例、范围撤销、失败处理、开发方式及剩余限制见[试用指南](docs/board-quickstart.md)。

```text
src/
  index.ts          # 组合与本地服务启动
  domain/           # 项目、Intent、提案、Issue、记录与边界规则
  application/      # 提案 / 决定 / 记录、版本与幂等用例
  infrastructure/   # JSON / SQLite、会话 / 工具凭据、HTTP 适配
  presentation/     # setup、工具 CLI、React 看板
  harness/          # 后续自有模型循环，仍预留
tests/              # 领域、真实 SQLite / HTTP / CLI、浏览器测试
examples/           # 虚构提案与记录输入，不是项目的正式 Intent
docs/               # 规范、设计、决策与工程事实
references/         # 上游参考，不参与产品编译
```

check 包含服务、前端与测试类型检查，以及记录合同、正式 JSON 用例与旧模型行为测试；build 编译 Node ESM 和 Vite 前端。首次运行浏览器测试需有 Chromium，再运行 npm run test:e2e；检查数量及本轮结果见[工程状态](docs/project-status.md#正式-json-项目看板与迁移2026-10-25)。npm start 使用最近一次 build 产物；开发运行器 tsx 仅用于源码入口，不取代 TypeScript 严格检查。尚无远程 CI 运行证据。

## 文档导航与主要事实源

| 文档 | 主要职责 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 项目内 Agent 的工作边界与文档维护规则 |
| [架构](docs/architecture.md) | 产品体验、运行模式、Hub 与执行组件职责 |
| [治理](docs/governance.md) | Intent / Issue、授权、G0–G4、证据与权威事实源 |
| [安全](docs/security.md) | 信任边界、安全不变量与待验证机制 |
| [验证](docs/validation.md) | 当前 MVP 边界、交付门禁、E1–E4、产品有效性与技术准入 |
| [决策索引](docs/decisions.md) | 初始基线、产品意图、阶段推进与本次工程初始化范围 |
| [工程状态](docs/project-status.md) | 当前状态、待确认事项与工程证据缺口 |
| [阶段一执行计划](docs/phase-1-plan.md) | 首版范围、交互、验收契约的交付单元与完成标准 |
| [阶段一评阅材料](docs/phase-1-review.md) | 范围 / 交互 / 验收产出、反向对话结论与上游复用记录 |
| [看板编码计划](docs/board-implementation-plan.md) | B1–B4 交付单元、权限与一致性要求及验证标准 |
| [正式 Requirement 看板指南](docs/record-board-quickstart.md) | 新项目、按需分层编辑、保存与迁移、证据及冲突处理 |
| [JSON Schema 记录合同](docs/json-schema-contract.md) | 当前 JSON Schema Requirement、分层合同、样例、只读校验与映射边界 |
| [Harness 试用与恢复](docs/harness-quickstart.md) | 最小候选闭环、隔离 AgentHub 自测、长期 JSON 继承、停止和恢复 |
| [记录体系与 Harness 建设计划](docs/records-and-harness-plan.md) | 当前两项优先目标、结构化看板分块、Harness 边界与建议交付次序 |
| [参考纠偏与推进计划](docs/reference-correction-plan.md) | 正确书籍、章节依据、结构化记录方向、后续次序与 PDF 构建更正 |
| [看板试用指南](docs/board-quickstart.md) | 安装、账户、工具范围、CLI 提案 / 记录 / 修订、人工决定与当前限制 |

## 当前参考

书籍统一为 [mancbj/aidlc-book-baojun《深入理解 AI-DLC》](references/aidlc-book-reference/aidlc-book-baojun/)，本轮核实本地 / 远程 main 为 9ae1075d3c87f6c6ea626dbfc8b3d3a0132ae64e，最新 Release 为 v0.9.007。此前误用的《深入理解 AI Agent》不再作为书籍依据。独立的 [awslabs/aidlc-workflows](references/aidlc-workflows-reference/aidlc-workflows/) 按其自身仓库与版本评估，不能与书中链接混同。来源、失效结论及章节对照见[纠偏记录](docs/reference-correction-plan.md)。

## 下一步

先按[Harness 指南](docs/harness-quickstart.md)试用当前脚本化闭环，核对候选保留 / 人端应用及跨会话继承。随后与用户确定云端服务商、模型与调用范围，再验证真实语义提炼和解释；桌面容器另行确定，复用已提供图标。完整 Intent 修订、受控代码执行、Git / CI、OS 隔离与真实项目有效性仍独立推进，不以本轮技术检查代替人工验收。
