# 书籍参考纠偏与推进计划

日期：2026-10-25。用户明确更换此前错误的书籍参考仓库，并要求修正规则与计划。本轮只调整项目文档；已确认 Intent、现有业务代码、实际项目数据及历史人工决定不由参考来源变化而重写。

用户随后通过反向对话再次确认了先理解再推进、业务与技术核心逻辑深入理解，以及第一版理解 / 决策优先；规范见[治理](governance.md#先理解再推进)，决定见[D10](decisions.md#理解与决策意图再次确认2026-10-25)。该轮曾建议先决策走读；用户最新又明确将记录体系与 Harness 前置，现行次序以[建设计划](records-and-harness-plan.md)为准，书籍核查事实与总目标继续保留。

当前实施另已收敛到单个 JSON Schema Requirement；用户确认按需分层及最小出处，已形成[独立合同与说明](json-schema-contract.md)。用户随后明确要求替换正式看板并通过预览另存旧记录，现行范围见[正式看板指南](record-board-quickstart.md)；本文件后续 Harness 次序只保留总体规划，不扩大当前实现范围。

## 当前参考与失效来源

| 资料 | 本轮核实结果 | 使用边界 |
| --- | --- | --- |
| 当前书籍 | [mancbj/aidlc-book-baojun](https://github.com/mancbj/aidlc-book-baojun)，《深入理解 AI-DLC》；本地目录 [aidlc-book-baojun](../references/aidlc-book-reference/aidlc-book-baojun/) | 本项目“书中”“aidlc book”的唯一书籍指代 |
| 书籍快照 | 本地 main 为 9ae1075d3c87f6c6ea626dbfc8b3d3a0132ae64e；本轮 GitHub GET 核对远程 main 相同；最新 Release 为 [v0.9.007](https://github.com/mancbj/aidlc-book-baojun/releases/tag/v0.9.007) | 这是本轮核实的时间点；后续更新需重新核对提交和引用，不能永远称为最新 |
| 独立 workflow 参考 | [awslabs/aidlc-workflows](https://github.com/awslabs/aidlc-workflows)，本地 [aidlc-workflows](../references/aidlc-workflows-reference/aidlc-workflows/) | 工作流、模板与工程机制另行评估，不等于书籍原文或 AgentHub 能力 |
| 旧错误书籍 | bojieli/ai-agent-book，《深入理解 AI Agent》，旧路径 references/aidlc-book-reference/ai-agent-book/ | 旧章节引述和其构建建议不再作为本项目 AIDLC 书籍依据；该路径不作为有效链接 |

书中引用的 WORKING-WITH-AIDLC 来自 mancbj/aidlc-workflows；它与当前本地 awslabs/aidlc-workflows 的仓库身份不同，不能把书中链接视为本地同名文件已核实。上游规则、脚本和实验是研究材料，不会授予本项目执行权限。旧对话或记忆中与本次纠正冲突的书名、章节和构建建议，以本记录和实际文件为准。

## 原文已核实的内容及影响

| 章节 / 样例 | 已核实内容 | 对 AgentHub 的影响 |
| --- | --- | --- |
| [CH-02 人的判断](../references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch02-human-judgment.md) | Intent、Boundary、Non-delegable Judgment、Human Checkpoint、Accountability；反向对话由 AI 提问、提议及暴露风险，人保留关键判断 | 修正原“第二章上下文工程”的错误归因；沿用用户已确认的对话前置和最终责任，不机械审批每个动作 |
| [CH-03 Inception](../references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch03-inception.md) | Intent → Requirements → System Context → Units → Stories → Bolt Plan → Human Checkpoints | 补齐环境、能力边界、可判定验收、执行批次和人工检查点；这条链不等于统一父子树 |
| [CH-04 Memory Bank 与 Standards](../references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch04-memory-bank-standards.md) | 最小可恢复上下文包括 Current State、Intent & Scope、Standards、Evidence Links、Update Protocol；事件 / 快照与看板投影职责不同 | Standards 是横切约束；看板应从正式事实生成，不能以聊天摘要或手填完成状态替代事实 |
| [CH-05 Bolts](../references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch05-bolts.md) | Scope、Type、Gates、Evidence；低风险 Simple 为 Plan → Implement → Test，复杂领域可采用 Model → Design → ADR → Implement → Test | 按风险选择执行粒度与门禁；不照搬重流程，也不把 B1–B4 编号当作已实现 Bolt |
| [CH-07 Verification](../references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch07-verification.md) | Deterministic Checks、Independent Tests、Model Review、Human Judgment，按风险选择验证强度 | 自动检查承担可判定部分；业务语义、重要取舍及最终实际验收仍需人的判断 |
| [EXP-03-01 输入](../references/aidlc-book-reference/aidlc-book-baojun/experiments/sample/samples/input.json)与[校验器](../references/aidlc-book-reference/aidlc-book-baojun/experiments/sample/quickstart.py) | JSON 含 schema_version、intent、requirements、units、stories，以稳定引用建立追溯；Python 检查重复 ID、未知引用、孤立 Story、空验收与缺失 NFR 等 | 可参考字段、校验思路和失败夹具；该实验明确只验证结构追溯，不能验证业务语义，也未覆盖全部工件 |
| [任务合同](../references/aidlc-book-reference/aidlc-book-baojun/progress/schemas/task-schema.md) | Markdown 描述字段与门禁，JSON 保存任务事实，脚本执行检查，驾驶舱为投影 | 上游已存在结构化合同范例；它不等于可直接搬入 TypeScript 的全套标准 JSON Schema |

本轮已定位的拆分实验采用手写 Python 校验；不能把文件中的 schema_version 或 Markdown 名称中的 Schema 等同于正式 JSON Schema 标准实现。AgentHub 采用 JSON Schema 是后续可评阅的适配方案，不是“书中已要求同一技术实现”。

## Markdown 与 JSON Schema 的候选分工

需要解决的问题是：自然语言保留人的理由和上下文，机器能校验关键对象、版本与关系，而且二者不会各自改出不同的正式计划。领域含义以[治理](governance.md#inception-工件与-standards)为准，工程职责见[架构](architecture.md#参考纠偏后的结构化记录方向)。

| 表达 | 建议承担的内容 | 事实边界 |
| --- | --- | --- |
| Markdown | 对话原文 / 摘要、备选方案、收益风险、决定解释；记录来源和适用对象 | 不因写有“已批准”就成为正式决定，摘要须能回查来源 |
| JSON 实例 | 经用例维护的 ID、内容、版本、引用、状态、适用范围及证据索引 | 候选输入与正式记录分开；人工决定由人端流程产生 |
| JSON Schema | 字段、类型、枚举、必填及条件约束；明确合同版本与兼容策略 | 不承担身份鉴定、授权、跨对象语义或实际验收 |
| 关系与用例校验 | 引用存在、依赖环、需求覆盖、版本匹配、权限及审批条件 | 校验失败明确返回；数据自填不能代替可信执行或人工判断 |
| 看板与导出 | 从适用版本的正式事实呈现给人阅读和核对 | 不是可绕过审批的第二事实源 |

候选公共字段可包括稳定 id、对象 version、schemaVersion、来源引用及关联 Intent 版本；具体字段命名和必填条件尚待设计。Requirement、System Context、Unit、Story、Bolt Plan、Standard、Checkpoint 的合同不要求一次全部实现。按用户最新目标，先用已确认 Intent 建立专属记录合同、样例与版本策略，衔接最小 Harness，并为状态看板分块提供数据；现有 SQLite、HTTP / CLI 和审批链优先复用，不另建一套并行可写的数据源。

## 纠偏后的推进次序

本节已按用户最新调整更新；此前先具体决策走读 / 审阅 UI 再建模型和 Harness 的建议次序被替代。当前两项优先目标为专属 Markdown + JSON Schema 记录体系，以及自有 Harness 基础，详见[集中建设计划](records-and-harness-plan.md)。

建议次序为记录合同与样例 → 确定性校验及既有数据衔接 → 最小 Harness 与模型替身检查 → 一个云端 LLM 的真实纵向验证。分状态 Issue 看板在合同收敛后按内容分块适配，可与 Harness 工作并行，不阻塞最小基础链路；相关 B4 和真实任务验证随后推进。

先理解再推进、用户决定与最终实际验收责任保留。字段、状态、工具和模型服务商尚待设计；合同检查、测试替身和状态看板都不能证明真实模型已遵循 Intent。本轮为文档与计划同步，未实施 Schema / Harness、改变实际数据或调用模型。

## 新书阅读与 PDF 构建更正

此前针对旧书的 book/build_pdf.sh、ElegantBook、MacTeX / XeLaTeX 建议不适用于当前仓库。实际入口是[book/README.md](../references/aidlc-book-reference/aidlc-book-baojun/book/README.md)与[scripts/build_book.sh](../references/aidlc-book-reference/aidlc-book-baojun/scripts/build_book.sh)，由 Pandoc、Mermaid CLI、Chromium 和 Tectonic 构建。

本轮只读检查：Python 3.14.6、Pandoc 3.12.1 和 Google Chrome 已存在；mmdc 与 tectonic 不在当前 PATH。未安装依赖、执行构建或验证 PDF 排版。

用户在自己终端中安装缺失工具并构建中文 HTML + PDF：

```bash
brew install mermaid-cli tectonic
cd /Users/bobcgn/AAA_Codings/Personal_Projects/AgentHub/references/aidlc-book-reference/aidlc-book-baojun
bash scripts/build_book.sh .artifacts/book all
open .artifacts/book/deep-understanding-ai-dlc.pdf
```

默认不带参数只生成 HTML；若只需 PDF，可用 bash scripts/build_book.sh .artifacts/book pdf。构建器会重建带有自身标记的输出目录，不应把既有资料目录作为输出。Tectonic 首次运行可能需要联网取得 TeX 资源；依赖已存在不等于构建和排版已通过。想先阅读可使用本轮核实的 [v0.9.007 PDF](https://github.com/mancbj/aidlc-book-baojun/releases/download/v0.9.007/aidlc-book-v0.9.007.pdf) 或[在线阅读](https://mancbj.github.io/aidlc-book-baojun/book-site/index.html)。
