# 验收场景模板

为把预期结果写成可观察条件，直接提取上游 [Requirements Guide](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/core/knowledge/aidlc-product-agent/requirements-guide.md) 的 Acceptance Criteria Pattern，下面格式块保持原样。来源为 awslabs/aidlc-workflows 的 bfb6d09d7038970f71ae21e20bc59b03f41168fc，根目录 [LICENSE](https://github.com/awslabs/aidlc-workflows/blob/bfb6d09d7038970f71ae21e20bc59b03f41168fc/LICENSE) 为 MIT No Attribution；上游版权声明为 Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.

```text
Given [precondition or initial state]
When [action or trigger]
Then [expected outcome]
And [additional outcomes if needed]
```

AgentHub 按[Evidence 与 Review](../governance.md#evidence-与-review)补充场景与交付版本的关系。准备场景时注明适用 Intent / 修订、交付单元和所需观察；实际运行后再记录目标版本、环境、观察来源、实际结果、偏差与未知项，并关联人工决定。

预期和实际必须分开。尚未运行时明确写“未运行”，缺失信息写未知，不能为填满模板虚构日志、通过结果或用户验收。模板只约束文档表达，不是测试执行器、存储 Schema 或可信审批实现。

本阶段已用于[验收对应关系与设计走读](../validation.md#阶段一验收对应关系与设计走读)的 V01–V16；这些场景最初是设计材料；当前 B1 部分行为已有实际检查，见[工程状态](../project-status.md#b1-最小提案审批闭环实现2026-10-23)，不代表 V01–V16 已全部验证。
