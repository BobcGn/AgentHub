# 决策记录模板

为使重要取舍能被理解和复查，直接提取上游 [ADR Template](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-architect-agent/adr-template.md) 的 Markdown 模板块，内容保持原样。来源为 awslabs/aidlc-workflows 的 bfb6d09d7038970f71ae21e20bc59b03f41168fc，根目录 [LICENSE](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/LICENSE) 为 MIT No Attribution；上游版权声明为 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

在 AgentHub 中，模板用于记录问题背景、选项和后果；实际确认与授权以[治理规则](../governance.md)为准。填写人不能自行把 Proposed 改成 Accepted，决策被接受也不自动取得实验或执行权限。模板内的 PostgreSQL 句子是上游写作示例，不是本项目选型。

```markdown
# ADR-[NUMBER]: [Title - Short Descriptive Name]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Date
[YYYY-MM-DD]

## Context
What is the issue or situation that motivates this decision? Describe the forces
at play: technical constraints, business requirements, team capabilities, timeline
pressures, and any other factors influencing the decision.

Be specific. Include:
- What problem are we solving?
- What constraints exist (budget, timeline, team skill, compliance)?
- What quality attributes matter most (performance, security, maintainability)?
- What existing decisions or systems does this interact with?

## Decision
State the decision clearly and concisely. Use active voice:
"We will use PostgreSQL as the primary data store for the order management service."

Not: "It was decided that PostgreSQL might be a good option."

## Consequences

### Positive
- What becomes easier, faster, or better as a result of this decision?
- What risks are mitigated?

### Negative
- What becomes harder or more expensive?
- What new risks are introduced?
- What capabilities are foreclosed?

### Neutral
- What trade-offs are we accepting?
- What follow-up decisions will be needed?

## Alternatives Considered

### Alternative 1: [Name]
- Description: Brief explanation of this option
- Pros: What would this have given us?
- Cons: Why did we reject it?

### Alternative 2: [Name]
- Description: Brief explanation of this option
- Pros: What would this have given us?
- Cons: Why did we reject it?

## References
- Links to relevant RFCs, design documents, benchmark results, or discussions
```

本阶段已用该结构组织[三个待判断方案](../phase-1-review.md#待判断的三个方案)。只为重要取舍记录这些内容，普通实施细节无需单独建立决策文件。

## AgentHub 理解与决策补充

本节是 2026-10-25 用户意图确认后的项目适配，**不是上游 ADR 原文**；上面的引用模板块保持原样。只围绕当前决策所需内容逐步补充，不要求用户一次填写所有项目。规范见[先理解再推进](../governance.md#先理解再推进)。

| 需要回答的问题 | 材料与记录 |
| --- | --- |
| 源头问题和必须满足的条件是什么 | 关联已确认 Intent / Issue 及适用版本，说明结果与约束 |
| 影响哪些行为、对象和接口 | 具体变化、边界、依赖及可能受影响的已有功能 |
| 有哪些可行选择，为什么推荐这一项 | 各选项的收益、风险、代价、假设与未知项，避免只列推荐结论 |
| 业务与技术核心逻辑怎样成立 | 按因果关系解释规则、机制、失败路径及关键设计，使用户可以继续深入追问 |
| 哪些知识或假设尚未弄清 | 对应问题、参考链接、适用版本及未解之处；不得以链接数量充当理解 |
| 是否需要实验，怎样检验 | 待回答假设、预期、方法、授权范围及停止条件；实际运行后另记环境 / 版本、观察、证据与局限 |
| 用户实际作出了什么决定 | 选择、适用内容 / 版本、必要理由与待处理问题；按既有动作规则记录，批准补充说明仍可选 |
| 后续怎样核对结果 | 预期行为、验证场景和证据入口；未执行与未验证保持明确 |

是否理解充分由用户判断；候选材料、普通讨论或模型总结不能自行建立人端确认。此模板不设置测验或自动评分，也不因填写完成产生工具、实验、Git 或 Runtime 权限。
