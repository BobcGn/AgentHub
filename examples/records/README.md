# JSON 记录演示

本目录只保存合同与失败边界夹具，不是用户实际项目数据。

- planned.json：包含 Unit / Story / Bolt Plan 的计划记录，没有实际结果或完成证据。
- completed.synthetic.json：演示完成记录所需的证据、整体核查、人工接受记录和单个 PR。全部为合成值；示例 PR 不指向真实交付。
- invalid/unknown-source.json：来源引用不存在。
- invalid/cross-requirement.json：Unit 与 Story 的 Requirement 归属冲突。
- invalid/missing-verification.json：有结果描述和证据指针，但缺少逐条件核查。

运行 npm run --silent records:validate -- <文件>，合法退出 0，非法退出 1。具体字段、限制和信任边界见[合同说明](../../docs/json-schema-contract.md)。
