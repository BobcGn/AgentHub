# BobcGnHub

BobcGnHub（AgentHub）是面向研发的 Developer Intelligence Hub / Agent Harness。它把 Issue 看板与 Agent 执行过程连接起来，让开发者先理解方案的理由、收益和风险，再让 Agent 按明确的交付单元推进，并用对应版本的证据判断实际结果。

## 为什么做 AgentHub

使用者在通过 Agent 与任务看板开发项目时，遇到了两类问题：机械遵循规则会使理解速度跟不上 Agent 的推进；规范的任务记录又可能与实现和验收结果发生语义偏移，最终带来返工或放弃。仅增加提示词和记录无法提供对 Agent 运行过程的充分掌控。

AgentHub 希望让人持续明白“我要做什么 / 做了什么、为什么这么做、结果是什么”，并在理解速度与推进速度之间取得平衡。安全隔离、授权、证据和恢复是支撑这一目标的机制。项目是否有价值，还需要实际使用证明推进稳定性和可理解性有所改善。

## 已确认的产品方向

- 对话前置：先澄清源头问题、意图、边界、责任与验证方式，呈现方案理由、收益和风险，由用户确认 Intent 后再进入正式交付拆分与授权执行；已有确认可按适用范围复用。
- 从源头问题和第一性原理划定交付边界，避免机械、无限拆分；较大的 Intent 可用父 Issue 表达，拆分后的交付单元对应子 Issue。
- 经用户确认的 Intent 是目标与预期行为的唯一事实源。Issue、方案、实现和验收均须与其对应；意图修改须先与用户商讨，并在用户明确授权后进行。
- 推进前让人理解方案、收益、风险与验证方式，再在有效 Grant 内执行。
- Issue 中的预期与 PR / Review 中的实际交付保持可追溯的对应关系；规范文字不能代替执行证据。
- Hub 在提交前检查改动和本地测试，通过后在获准范围内提交、推送，并查看对应版本的流水线信息；CI 失败时在原目标和授权内返工。
- 推送后的 CI/CD 是第一道交付门禁；第二道门禁由用户介入实际运行验收，核对实际结果与 Issue / PR 所述的本次修改影响和结果，并检查是否偏离 Intent。
- 第一版优先云端模型与 Hub 自有 Harness。本地小模型后续可承担辅助 Review 或文档总结；已有 Agent 的接入须另行验证约束能否被绕过。

三种运行模式的职责和优先级见[架构](docs/architecture.md)，Intent / Issue 与记录语义见[治理](docs/governance.md)，交付门禁和产品有效性验收见[验证](docs/validation.md)。

## 当前 MVP 边界

先前的单个本地缺陷修复、本地 Commit 和本地 Review 链路保留为技术验证切片。它可以检验部分执行与交付机制，但不足以单独证明本轮确认的完整产品目标。

当前优先方向是云端模型、自有 Harness、单主要写入 Run，以及从已确认 Intent 到人工验收的交付闭环。Hub 负责提交前检查、本地测试、获准提交推送及流水线反馈；最终实际验收由用户介入。PR 创建方式、运行验收场景和最小看板交互仍待细化，完整产品 MVP 边界尚未重新冻结。现有 DeepSeek Loop 是既有技术起点，本轮未重新指定具体模型或服务商。

阶段一直接基于上述已确认意图推进，真实项目在后续导入验证，不作为设计启动条件。现已形成[首版交互草案](docs/architecture.md#阶段一首版交互草案2026-10-23)及[设计检查与真实验证的边界](docs/validation.md#阶段一设计检查与后续真实项目验证)。功能区域、页面组织和首版具体范围仍是待评阅草案。

E1–E4 与技术准入要求继续适用。Codex 正式适配、完整 MCP、多 Agent、多项目调度、Electron 打包、通用 VM 管理和通用 Skill / Workflow 市场仍延期；本地辅助模型也不作为第一版必要条件。详见[验证契约](docs/validation.md)。

## 当前真实状态

截至 2026-10-23，项目已有规则文档、阶段一范围与交互草案，以及本次获准创建的 TypeScript 工程骨架。当前入口只打印骨架状态，用于检查编译和启动链路。references 下两个上游仓库是参考资料，不构成 AgentHub 已实现能力。

对话、Intent / Issue 管理、云端模型、自有 Harness、受控工具、Git / CI 和人工验收闭环尚未实现。X1–X5 未获技术 Pass，正式 MVP Implementation Go 尚未作出；本次工程初始化授权不包含安全实验、模型接入或 Git 写操作。详见[当前工程状态](docs/project-status.md)。

## 本地开发

使用 Node.js 24（本次验证版本为 24.16.0）和 npm 11，精确依赖版本由 package-lock.json 固定。TypeScript 固定为 6.0.3；后续工具链升级单独验证。

```sh
npm ci
npm run check
npm run build
npm start
```

首次在本机安装了 nvm 时，可先执行 `nvm use`；其他 Node.js 安装方式遵守 package.json 的 engines 范围即可。`npm run dev` 使用 Node.js 监听并运行 TypeScript 入口，不代替类型检查；`npm start` 运行最近一次 build 的产物，修改后须重新 build。编译使用 NodeNext / ESM 与 strict 检查，配置依据 [TypeScript 模块文档](https://www.typescriptlang.org/tsconfig/module.html)及[严格检查文档](https://www.typescriptlang.org/tsconfig/strict.html)。

```text
src/
  index.ts          # 骨架入口与后续组合入口
  domain/           # 领域语义与不变量
  application/      # 用例与流程协调
  harness/          # 自有模型循环与上下文组织
  infrastructure/   # 模型、存储、工具、Git / CI 等外部适配
  presentation/     # 后续用户交互入口
tests/              # 后续有实际行为时添加测试
docs/               # 规范、设计、决策与工程事实
references/         # 上游参考，排除在本项目编译之外
```

目前除 src/index.ts 外的源码目录和 tests 仅保留占位文件。目录职责与依赖规则见[架构](docs/architecture.md#typescript-工程组织)，贡献和验证规则见 [AGENTS.md](AGENTS.md#typescript-开发规则)。尚未建立单元测试、格式检查、CI 或产品运行验证；`npm run check` 当前仅执行 TypeScript 静态检查。

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

## 下一步

基于骨架继续评阅阶段一草案，收敛确认交互、PR 创建方式和最小看板范围，再按明确的交付单元取得后续实现授权。真实项目后续导入验证；技术实验仍需工程事实采集报告、各自的 Preflight 和明确人工授权。骨架可启动不构成 Experiment Go、技术 Pass、完整 MVP Implementation Go、可信晋升或最终验收。
