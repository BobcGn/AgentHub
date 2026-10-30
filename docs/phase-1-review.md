# 阶段一评阅材料

日期：2026-10-23。版本：**P1-draft-2**。分支：phase/1-scope-and-interaction；基线：f807bb6；当前为未提交的文档工作稿。状态：**已记录本轮范围与责任确认，交互细化待评阅，阶段尚未整体验收**。


本文保留设计轮次的范围与当时事实；用户随后已授权编码，B1–B3 当前实现和检查见[工程状态](project-status.md#b3-关键变更与差异审查2026-10-25)，不以本文的历史骨架状态代替最新事实。
## 2026-10-25 再次意图确认

用户已明确：理解与推进冲突时先理解再推进，核心逻辑包含业务与技术机制；第一版承接外部 Agent 提供的方案、解释、资料和必要实验结果，支持审阅、追问记录、补充、决定及追溯。规范见[治理](governance.md#先理解再推进)，验证见[理解闭环](validation.md#理解与决策闭环的验证要求)。本文 P1-draft-2 保留早期评阅材料，不作为新交互已设计、实现或获验收的证明；该轮建议先具体决策走读；随后用户已调整为记录体系与 Harness 优先，最新次序见[建设计划](records-and-harness-plan.md)。

## 本次交付与阅读顺序

本阶段把“让人理解 What / Why / Result，并在可控推进中保持意图一致”转为首版范围、交互和验证方案。已有产品意图保持规范效力；本轮用户进一步明确看板先行、外部反向对话及 PR 表达方式，见 D8。未涉及的具体布局和技术方案继续作为建议。

1. [看板版本](architecture.md#看板版本的最小交付)：先完成项目 Intent / Issue 概览及方案、决定与验证计划记录；[C01–C08](architecture.md#首版范围候选与责任)保留完整治理闭环目标，后续再接 Runtime。
2. [看板信息组织](architecture.md#看板版本的最小交付)：围绕做什么、为什么及如何验证给出概览与 Issue 详情草案；原三视图保留为[后续 Runtime 工作区候选](architecture.md#最小工作区交互候选)。
3. [贯穿示例](architecture.md#贯穿示例标题筛选修复)：用虚构的事项筛选修复，说明规范文字、CI 与实际行为可能不一致时如何处理。
4. [验收对应关系与设计走读](validation.md#阶段一验收对应关系与设计走读)：完整目标对应 V01–V16，并区分看板与后续运行验证；本轮做作者设计走读，没有运行业务或安全实验。

本轮 What 是上述材料与复用模板；Why 是在实现前明确产品取舍、可见信息和证据缺口；Result 是可以具体评阅的候选方案，不是产品功能或有效性证明。

## 待判断的三个方案

P1-draft-1 按复用的[决策记录模板](templates/decision-record.md)提出三个方案。下表保留方案标识，并依据用户本轮回答更新，不把未回答部分当作接受。

| 项目 | 本轮明确的结论 | 剩余边界 |
| --- | --- | --- |
| P1-A 交付顺序 | 用户选择先做 Intent / Issue 看板与项目概览，后续 Agent 设施完善再接入真实执行、检查和交付 | C01–C08 是完整目标，不是先行看板的全部实现门槛；看板仍待实现和验收 |
| P1-B 信息组织 | 用户最关注“当前做什么 / 解决什么问题”“方案为何这样选、收益风险及最终人工决定”“如何验证与原意图一致” | 同一工作区或具体页面布局未被明确接受；已据此调整看板草案 |
| P1-C PR 说明与证据 | 用户确认四段式：“做了什么、为什么这么做、如何验证、结果怎么样”；截图等证据由用户补充 | 由谁创建、创建时机、是否 Draft 及上传入口仍未决定，留给实际远程交付阶段 |
| 对话入口 | 用户追加确认：先在 Codex 等外部 Agent 中反向对话，在 Hub 记录方案、取舍和用户决定 | 第一版不要求内置模型；录入的记录不能冒充系统观察或正式 Runtime 集成 |
| 写入入口 | 用户确认类似 Multica 的交互：通过 CLI 或其他工具写入，由用户检查与审批 | 已确认关键内容审批、普通记录仅在划定边界内直接保存；具体命令和协议未定 |
| 新增工作 | 已确认清单之外的新子 Issue 先提待审建议，用户必须知道变动内容及理由；确认后才能纳入正式计划与获准范围 | 待审与正式清单的布局、具体边界表示和实现仍需细化，未确认建议不改变现有范围 |

当前没有新的基础意图问题需要重复询问。后续可先细化工具写入、人工检查与审批，以及项目概览和 Issue 详情的最小操作，再请用户评阅具体交互；PR 创建机制不阻塞看板设计。

## 上游复用记录

来源为本地 awslabs/aidlc-workflows 快照 **bfb6d09d7038970f71ae21e20bc59b03f41168fc**。使用其 [MIT No Attribution 许可](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/LICENSE)下的模板片段与方法；引用为提交固定链接，便于在不提交 references 仓库的情况下查阅。此处不替 AgentHub 选择整体开源许可证。

| 上游内容 | 使用方式 | 实际落点与适配 |
| --- | --- | --- |
| [ADR Template](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-architect-agent/adr-template.md) | 直接提取模板块，保持原文 | [本地决策模板](templates/decision-record.md)；初轮提案按其背景、后果与备选结构组织；本轮确认写入 D8，未回答部分继续留为建议 |
| [Acceptance Criteria Pattern](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-product-agent/requirements-guide.md#acceptance-criteria-pattern) | 直接提取 Given / When / Then 格式块 | [本地验收模板](templates/acceptance-scenario.md)；V01–V15 按此格式编写 |
| [Traceability Matrix Format](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-product-agent/requirements-guide.md#traceability-matrix-format) | 改编表结构 | 验证文档关联 C01–C08、既有决定、设计、场景和未来证据；缺失项写未验证，不制造“全部已填即通过” |
| [Intent Capture](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/aidlc-common/stages/ideation/intent-capture.md) / [Scope Definition](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/aidlc-common/stages/ideation/scope-definition.md) | 参考来源区分与范围取舍方法 | 架构的范围候选保留既有依据，新增布局和 PR 方式保持建议；复用已确认上下文，不导入固定提问仪式 |
| [Rough Mockups](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/aidlc-common/stages/ideation/rough-mockups.md) / [Wireframing Guide](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-design-agent/wireframing-guide.md) | 参考低保真与信息层级方法 | 工作区线框覆盖入口、主要操作、错误与部分结果；不导入其工具链或最终视觉规格 |
| [Units Generation](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/aidlc-common/stages/inception/units-generation.md) / [Delivery Planning](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/aidlc-common/stages/inception/delivery-planning.md) | 参考边界、依赖及交付理由 | 保留三个设计交付单元，并在示例中避免操作型强拆；未导入上游 Unit / Bolt Schema、调度或运行目录 |
| [Product Review](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-product-lead-agent/reviewing.md) / [Corner Checklist](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-product-agent/corner-checklist.md) | 选取适用检查维度，自行走读 | 核对用户依据、验收、空 / 错误 / 部分状态、重复提交、版本变化及未知副作用；没有调用独立 Reviewer |

本轮未复用上游 Engine、Hooks 或 Sensors 的执行实现。其格式检查不构成权限隔离或语义正确证明；AgentHub 仍需独立实现并验证有效 Grant、可信记录、工具执行和恢复。工具不可用、检查失败或观察未知，不能套用上游某些 Sensor 的带备注 PASSED 语义。

## 设计走读的结果与限制

初轮由同一作者对 V01–V11 做了设计走读；本轮按新确认补充 V12–V16，核对交付层次及工具写入与审批的区别。已在方案中分别表达：Intent 确认和执行授权、模型建议和真实动作、停止请求和实际停止、Run 完成和人工接受；同时补足过期版本与保存失败的处理。详细发现与仍缺证据见[走读记录](validation.md#本轮作者设计走读记录)。

筛选示例特意包含“已完成事项也应命中”的预期：若实际只保留未完成事项，Issue / PR 文本一致或 CI 通过仍不足以接受。它用于解释怎样识别偏移，没有真的运行示例、产生 Git 提交或证明 Hub 已能发现偏差。

## 编码规划

用户本轮要求检查遗漏并开始规划编写代码。已形成[看板编码计划](board-implementation-plan.md)：业务方向不再需要反复澄清，具体技术建议、权限身份区别、数据一致性和首个可运行切片均已列出；计划中的技术选择不作为已接受产品决定或实现证明。

## 下一阶段需要的事实

| 事项 | 需要取得的事实 / 输出 | 推进边界 |
| --- | --- | --- |
| 云端模型与上下文 | 确定服务接口、错误 / 超时处理、上下文边界、秘密如何与执行进程隔离 | 本阶段未选定新供应商或调用模型；真实接入按后续范围执行 |
| 正式记录与人工确认 | 选定适合的持久化和身份边界，说明版本、重复请求、保存失败、撤销与恢复 | 模板、UI 按钮或 TypeScript 类型不构成受保护记录 |
| 本地工具与 Sandbox | 获取 R1–R6 环境事实，明确候选对象和可证伪用例 | X1 须独立 Preflight 与人工授权，当前没有实验 Go |
| Git 与远程交付 | Git 元数据、Hook / Filter、网络、凭据、PR 和 CI 的权限及未知副作用边界 | X2 及相关实验分别准入；本项目由当前 Agent 推送成功不证明产品 Broker 可用 |
| 取消与恢复 | 如何观察进程、文件和远程副作用；如何核查当前授权和证据适用性 | X4 / X5 等仍未执行，不先假定可以自动回滚或重试 |
| 实现顺序与真实项目评价 | 按依赖和风险组织后续交付；能力就绪后选真实任务、比较基线与观察方法 | 不要求现在先导入真实项目，不虚构稳定性改善比例 |

看板技术方案与后续 Runtime 事实验证可以分开推进：看板的方案和获准开发不以先完成 X1–X5 为条件；涉及真实工具、Git Broker 或高权限能力时，仍按对应实验与实现准入处理。当前用户回答只确认 D8 的具体产品选择，尚未整体接受所有交互或授予源码实现、实验和 Git 写操作权限。
