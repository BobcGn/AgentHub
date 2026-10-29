# JSON Schema 记录合同 v1

日期：2026-10-25。独立合同已扩展接入正式项目看板、JSON 保存与人端确认的旧数据迁移预览。当前最小 Harness 已通过独立候选合同与本合同配合，运行 Schema 不改变 v1 业务含义，见[指南](harness-quickstart.md)。真实模型提炼、目录 / Git 管理及实际 PR 操作仍未实现；界面与迁移操作见[正式看板指南](record-board-quickstart.md)。

## 已确认的边界

用户已确认：Intent 拆为多个 Requirements，Requirement 在看板中对应 Issue；一个 Requirement 包含多项拆解产物，最终对应一个 PR。子产物分别需要验收依据，Requirement 仍有整体核对。跨 Requirement 不共享拆解产物归属。

本轮反向对话进一步确认：首版保留 Unit / Story / Bolt Plan 分层合同，允许按需出现；关键内容保留最小出处。长对话是短期上下文，长期 JSON 保存提炼后的决定、约束、未知、假设、进展与事实；不以完整 Markdown 对话作为长期必备材料。

合同参考[书中第 3 章](../references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch03-inception.md)的工件语义，同时采用用户的一对多归属与单 PR 边界。完整 Standards、System Context 独立对象、复杂方案编辑和真实执行不在本次最小合同中；scope / constraints 先承载本切片需要的边界，不宣称完整 AI-DLC 实现。

## 本 Requirement 的拆解和证据入口

| 子产物 | 做什么及为什么 | 验收依据 |
| --- | --- | --- |
| 合同与样例 | 明确各层职责，分离预期、实际结果、决定记录与观察 | 独立计划 / 合成完成样例可校验，非法样例被拒绝 |
| 结构与关系校验 | 结构交给标准验证器，跨对象规则由纯领域代码检查 | 类型、出处、归属、依赖环、单 PR、证据适用性等正反例 |
| 只读入口 | 从 JSON 快照输出稳定诊断，便于实际核对 | 源码与构建入口、不同退出码和错误处理 |
| 兼容说明与文档 | 解释旧模型保留范围、新模型边界及使用方式 | 字段映射、链接及工程检查；不自动迁移实际数据 |

上述是本次开发切片的说明，不是写入用户实际看板的正式子 Issue，也不代表用户已经验收。一个 PR 的约束体现在数据合同中；本轮没有创建实际 PR。

## 合同组成

Schema 使用 [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)，校验依赖固定 Ajv 8.20.0。ID 是本地注册标识，校验时不联网获取 Schema；数据不做类型强转、自动填默认值或删除未知字段。各文件位于[schemas/records](../schemas/records/)。

| Schema | 内容与职责 |
| --- | --- |
| common | ID、非空文本、范围、验收条件、对象引用、实际结果、确认及接受记录 |
| intent | 源头问题、预期结果、范围、约束及确认出处 |
| requirement | 需求内容、状态、整体验收条件、实际结果、人工接受记录、单个最终 PR 摘要 |
| unit | 独立能力边界、职责、输入和输出 |
| story | 用户价值、验收条件，可选 Unit 归属 |
| bolt-plan | 本需求 Stories 的执行计划、类型、阶段与退出条件 |
| source | 出处类型、定位线索和可选短摘录 |
| context-item | 精炼的长期信息及其性质、出处和必要证据 |
| evidence | 观察内容、适用对象、subject、环境、局限与来源 |
| verification | 对一个对象的一条验收条件的当前核查记录 |
| record-set | 一个 Intent 及相关对象的可独立校验快照 |

顶层数组必须显式给出，但可为空。Unit、Story、Bolt Plan 不要求机械填满；Story 不需要 Unit 时 unitId 为 null。Bolt Plan 若存在，则 storyIds 必须非空并引用同一 Requirement 的 Stories。Unit / Story / Bolt Plan 均有唯一 requirementId，不设置各自 PR 字段。

record-set 是校验交换结构，不规定实际文件目录或每项业务对象的存储方式。schemaVersion 只标识本数据合同为 1.0.0，不引入 Git 或项目版本管理方案。

## 共同内容分块

| 字段 | 含义 |
| --- | --- |
| id / title / problem | 稳定标识、标题与本项问题 |
| expectedOutcome / scope | 预期结果及包含 / 排除边界 |
| rationale / expectedImpact | 为什么这样做、预期影响 |
| acceptanceCriteria | 有 ID 的条件，以及准备如何验证 |
| sourceRefs | 对关键信息的最小出处引用 |
| status | 当前工作记录状态，独立于审批与验收结论 |
| result | 实际做了什么、为何如此、实际影响和证据引用；发生前为 null |

Unit 增加 responsibilities / inputs / outputs；Story 增加 userValue / unitId；Bolt Plan 增加 storyIds / constructionType / stages / exitConditions。细化层级不要求各自独立提 PR。

requirement.pullRequest 为 null 或一个对象，含 url、what、why、verification、result，分别表达最终 PR 四段式说明。不同 Requirements 不得共用同一个最终 PR，子产物不得另挂 PR。

## 进展、结果与证据规则

状态为 draft、planned、in_progress、review、done，是本合同的工作状态。Bolt Plan 的 done 表示这份计划产物已按其条件完成，不表示一次实际 Run 已执行结束。draft 可暂缺验收条目；其他阶段必须有至少一项。review / done 必须记录实际 result；这是审阅阶段的工作报告，不意味着已通过。

标为 done 的每个交付子产物必须有当前、适用、带证据的通过核查，逐条对应自身验收条件。模型审查不能作为唯一完成依据。Requirement 的 done 另外要求所有现有子产物均 done、整体条件通过、人工接受记录及唯一 PR。accepted 的补充理由可为空，changes_requested 必须有说明；不修改旧审批“批准说明可选、退回 / 拒绝必填”的规则。

证据可明确列出同一 Requirement 内多个适用对象，避免复制同一报告；核查只能使用对其目标适用的证据。subject 描述被观察的产物 / 快照，environment 描述环境，limitations 保留局限；验证器不读取目标文件、不运行测试，也不鉴定这些陈述真实性。

每个对象的每条条件在当前快照中只能有一条 verification，避免用旧通过掩盖失败或未知。独立校验只检查快照不变量，不证明某次状态迁移、真实执行或审批过程合法。正式项目用例另外检查人端身份、修订号、显式保存及整体接受入口；内容变化会撤销适用的旧核查 / 接受，旧值和关联变化进入审计历史。

## 长期上下文与最小出处

contextItems 记录 decision、constraint、open_question、assumption、progress、fact；epistemicStatus 区分 confirmed、proposed、unknown、observed。未决问题只能为 unknown；observed 必须引用证据。其他摘要是否忠实仍须实际提炼与人端核对，本轮只定义结果合同。

每条内容保留 sourceRefs，来源通过 locator 表达对话 / 消息标识、参考链接或观察线索；excerpt 可为 null，非空时最多 600 字符。合同拒绝额外 transcript、trusted、approved 等字段，但不能判断普通文本里是否夹带原始对话或错误摘要，不宣称已实现自动压缩。

**human_confirmed、accepted、来源类型及验证结果在这里都是被校验记录中的陈述，不是可信身份或权限。** 即使一个伪造者填出结构和引用都完整的 JSON，离线校验仍不能鉴定审批真实性。此入口不写入 Hub、不批准工作、不产生用户理解确认或最终验收；未来正式写入须经过有效人端 / 工具边界，不能直接信任这些字段。

## 使用与结果

合法计划样例：[planned.json](../examples/records/planned.json)。完整状态样例：[completed.synthetic.json](../examples/records/completed.synthetic.json)，其中所有来源、核查、接受与 PR 都是明确的合成演示，不是实际执行或用户验收。

```bash
npm run --silent records:validate -- examples/records/planned.json
npm run --silent records:validate -- examples/records/invalid/unknown-source.json
npm run build
node dist/presentation/validate-records.js examples/records/planned.json
```

合法输入退出码 0，非法输入退出码 1；报告包含 valid、scope: structure-and-relations 与带 JSON 路径的 issues。不输出原始记录内容，不进行网络、数据库或 Git 写入。单个输入上限为 8 MiB。缺少文件、JSON 语法错误等返回 RECORD_VALIDATION_ERROR。

非法样例还包括[跨需求引用](../examples/records/invalid/cross-requirement.json)与[缺失核查](../examples/records/invalid/missing-verification.json)。valid 为 true 仅表示本合同结构与关系规则成立，不能代替业务语义、证据真实性或用户验收。

## 现有模型衔接

| B1–B3 现有字段 / 对象 | 新合同对应方向 | 本轮处理 |
| --- | --- | --- |
| Intent problem / outcome / verification | Intent problem / expectedOutcome；原验证文字保留为带出处的待核对信息 | 预览新表示，确认前不写新项目；迁移确认不等于确认意图表示 |
| IssueContent 与 parentIssueId | 每个旧正式 Issue 对应一个 Requirement 草案 | 父子关系保留映射和来源，不推断 Unit / Story / Bolt Plan |
| solution / benefits / risks | 原文保留为 proposed contextItems；部分明确字段映射到理由 / 预期影响 | 不把旧方案和风险推断成完整新模型；缺项明确待核对 |
| discussion / note / agent_report | 带最小出处的 proposed contextItems | 不自动变为 confirmed、证据或 passed |
| 人端决定、Intent 商讨授权与工具范围 | 原库保留；批准文字作为来源，不产生新接受 | 工具不自动获得新 JSON 权限，迁移后原业务写入被拒；撤销令牌仍允许 |

src/domain/record-contract.ts 定义对应 TypeScript 类型，基础设施通过已注册 Schema 校验未知输入，纯领域代码检查引用、归属、依赖与证据适用性，应用层组合报告。类型和 Schema 需同步维护；Ajv 泛型本身不是两份声明自动等价的证明，当前以严格编译、合法 / 非法样例和边界行为测试核对。本轮没有新增运行时领域依赖检查。

正式应用以 RecordProject 的 records 字段保存本合同，外层包含项目名、修订号、迁移映射和审计历史；这些元数据不是 record-set 的额外字段。文件由应用内部保存，界面从同一份 records 投影；独立校验入口仍只读 record-set。正式写入不允许通用 JSON 编辑修改已确认 Intent 或伪造整体接受，来源与观察证据采用追加更正。保存与边界说明见[正式看板指南](record-board-quickstart.md)。

实际检查结果见[工程状态](project-status.md#正式-json-项目看板与迁移2026-10-25)。本 Requirement 的最终人工评阅和真实使用有效性仍待用户判断。
