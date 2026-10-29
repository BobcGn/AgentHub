# 最小 Harness 试用

日期：2026-10-26。当前闭环已支持接入 DeepSeek 云端模型（默认模型名称为 `DeepSeek-V4.1-Flash-1017`，对应 API 端点模型 `deepseek-flash`）；未配置 `DEEPSEEK_API_KEY` 时自动平滑回退至本地脚本化替身 `scripted-v1`。你可以提交一个简短问题，查看输入依据和结构化候选，保留候选，或在人端核对后保存到正式长期信息。下一次运行从 JSON 读取，而不是依赖上一次内存或聊天全文。

## 隔离运行 AgentHub 自测项目

建议另用试用库与端口，保留现有项目数据。在 AgentHub 仓库根目录执行：

~~~bash
npm run build
AGENTHUB_DB=.agenthub/harness-trial/board.sqlite npm run setup
AGENTHUB_DB=.agenthub/harness-trial/board.sqlite AGENTHUB_PORT=4320 npm start
~~~

如果需要使用 DeepSeek 模型分析，可在启动前提供凭据（也可以通过 `DEEPSEEK_MODEL` 切换模型，或 `HARNESS_TIMEOUT_MS` 调整超时）：

~~~bash
DEEPSEEK_API_KEY=your_key AGENTHUB_DB=.agenthub/harness-trial/board.sqlite AGENTHUB_PORT=4320 npm start
~~~

首次 setup 由本人在终端设置试用人端密码。浏览器打开 http://127.0.0.1:4320；已有该试用账户时无需重复 setup。记录默认在试用库同级的 record-projects，运行在 runs；没有改动原 .agenthub/board.sqlite 和原正式项目。

1. 通过“新建/导入项目”新建名为“AgentHub · Harness 试用”的项目。初始意图可描述“让 AgentHub 从正式记录继承进度，运行过程可核对”；范围限定单需求、脚本化候选，明确不涉及真实模型、代码执行或自动验收。
2. 新增一个需求，例如“跨会话继承 AgentHub 进度”。本轮只是隔离试用，不登记实际产品已验收、测试已通过或真实 PR。
3. 打开需求详情的“需求运行”。输入最多 600 字的本轮问题，明确确认只读取当前意图与本需求的适用记录，再开始运行。
4. 在“查看输入依据与已继承的记录”中核对本轮实际使用的内容、来源摘要及省略清单；运行过程记录调用、检查、等待和停止原因。当前替身只生成演示未知问题，不是真实理解、对话提炼或语义审查。
5. 选择“保留候选，本轮结束”，正式 JSON 不发生变更。保留的候选仍可稍后预览并申请保存。
6. 选择“预览保存到长期记录”，核对新增内容与影响，再明确确认保存。只新增待核对未知／假设和最小出处，不改变 Intent、需求工作状态、核查或整体接受。
7. 刷新、退出登录或停止重启服务；重新登录并打开需求。历史运行和候选保留。再开始新运行，检查输入依据中已经出现上一轮实际保存的长期信息。
8. 可以取消并撤销本次运行授权；候选仍保留历史，但不能继续应用。项目修订变化时旧候选不自动适配，须依据最新记录另起运行。

这验证的是记录、循环与恢复机制。你对真实核心逻辑的理解、真实模型表现和最终产品接受仍需独立判断。

## 合同与上下文

候选合同在 [candidate.schema.json](../schemas/harness/candidate.schema.json)，持久化运行合同在 [run.schema.json](../schemas/harness/run.schema.json)。Schema 使用当前 Ajv 和记录合同注册表，不联网取 Schema，不做字段强转、默认填充或删除未知字段。

模型通过有界 ReAct 循环执行（默认最多 5 次工具调用、最多 6 次真实模型请求熔断），支持只读工作区工具（`list_directory`、`read_file`、`search_code`），由 Hub 在本地执行并严格执行逐跳符号链接链检查（拦截经受保护目录或外部跳板指回源码的别名链）、`readScope` / `exclude` 范围检查与敏感路径过滤。Run 持久化非敏感运行时绑定 `runtime: { id, configVersion, provider, model, endpoint, external }`，未知端点或配置漂移默认拒绝。

模型仅可针对当前单个 Requirement 提出四类待核对候选动作（`append_context`、`propose_criteria`、`propose_decomposition`、`propose_bolt_plan`），不能跨需求接管、覆盖已完成（`done`）子产物或生成批准 / 接受 / 可信 / 核查通过等字段；候选来源只能引用本次已提供的来源。预览与保存共享统一的语义差异与级联失效规则：纯顺序重排不误撤销核查，真实内容修改展示完整 `before` / `after`、`effects` 与 `warnings`，保留历史证据和原 `sourceRefs`。

必要上下文保留完整 Intent、需求、范围与验收，以及适用约束和已确认的决定；可选长期信息按优先级选择并记录省略 ID。每次真实模型请求均按实际外发内容（快照 + 历史步骤与完整工具输出 + 工具 Schema）校验并累计 UTF-8 输入字节预算（默认单 Run 累计上限 32 KiB、单次响应上限 16 KiB、默认超时 45 秒）；这是应用层 UTF-8 负载字节与请求次数预算，不等同于模型服务商分词器的 Token 计费统计。

## 人端与运行职责

Run 自身保存 revision、运行时绑定、上下文快照、候选、步骤检查点、独立 `executionId` 和事件，不是第二套正式业务数据。模型端口仅接收投影输入并返回未知响应，不能读库、写库或决定权限。应用用例检查结构、完整记录关系、范围与项目修订；正式项目内容仍由原记录服务统一保存。

Run 的 running / waiting_human / applying / completed / failed / cancelled / interrupted 独立于 Requirement 的工作状态、核查结果和人工接受。本轮结束、保留候选、正式信息保存是不同事实，均不表示需求 done。理由与解释只作待核对材料，不读取或依赖内部思维链。

运行范围由真实人端启动，只覆盖本次项目和需求的读取、候选生成。该授权保存 24 小时，可取消撤销；到期后需本人重新核对，同一修订下可继续判断，不自动继承旧工具令牌权限。人端应用入口独立检查身份和确认，Harness 不构造人端身份，不开放自动长期记录追加。

## 中断、恢复、模型切换与分叉

超时、取消及撤销后，每次执行拥有独立 `executionId`，迟到的旧请求回调、检查点、指标或候选均被丢弃，无法写入新执行或产生副作用。等待人工时不反复调用模型；若因网络波动、超时或服务重启发生意外中断，已执行的工具调用、已知消耗与步骤将完整保留在 Run 中，运行进入 `interrupted` 状态。

恢复（含同一会话内切换模型/运行时）与会话分叉（`fork`）均先原子完成修订、授权、运行时版本、外发范围与剩余预算前置检查，检查失败绝不污染原 Run 的候选、模型绑定或账本：
1. **逐请求诚实计量**：恢复不退还已发生的模型请求次数与输入字节，未完成工具对账仅累计新执行的工具调用，不重复计入历史已完成工具轮次；
2. **工具轮次先对账与完整继承**：若中断前存在未完成的 `tool_calls`，恢复时先补齐对账再发起模型请求；切换至仅支持单步 `propose` 的模型时，完整保留历史工具调用元数据与工具输出（不做 200 字符静默截断），并纳入输入字节预算检查；
3. **跨项目修订保守分叉**：当项目 `revision` 已偏离父 Run 的 `baseRevision` 时，携带历史步骤观察的分叉（`forkPointStep > 0`）以 `STALE_OBSERVATIONS_NOT_INHERITABLE` 拒绝直接继承旧观察，仅允许从第 0 步重新分叉或基于新修订另起运行。

正式保存与 Run 回执分开持久化。应用先登记申请，正式 JSON 保存审计回执；若随后 Run 保存中断，恢复时根据项目中的实际回执补记，而不是再次追加。相同候选重复应用最多产生一条长期记录。若此时请求取消，也先核对实际回执，明确显示已经发生的保存并撤销剩余授权，不假装取消能回滚记录。它是当前单服务进程的应用恢复机制，不证明同 OS 用户防篡改、多进程事务或强制隔离。

## 跨会话冷启动恢复标准与核对接口（AIDLC 第 4 章）

根据《深入理解 AI-DLC》第 4 章《内存库标准》（`references/aidlc-book-reference/aidlc-book-baojun/book/chapters/ch04-memory-bank-standards.md`），新会话或新 Agent 不应依赖任何上一轮聊天的内存状态，必须仅凭磁盘持久化入口即可准确回答 7 个核心问题：
1. **当前目标是什么**：当前确认的 Intent 与活跃的 Requirement 标题及范围；
2. **当前推进到哪里**：需求总数、拆解情况（Units / Stories / Bolt Plans 计数与状态）、Run 状态及未决候选数量；
3. **下一步安全动作是什么**：确定性动作代码（`REQUIRE_HUMAN_INTENT_CONFIRMATION`、`RECONCILE_STALE_RUN`、`REVIEW_CANDIDATE_IN_HUMAN_BOARD`、`CONTINUE_RUN`、`STOP_AND_REPORT_GAP` 等）及执行主体；
4. **为什么可以做**：前置条件核验说明与不变量保障；
5. **适用哪些修订和授权**：项目 revision、Run revision、当前有效 Grant 与绑定的运行时；
6. **依据与证据在哪里**：当前引用的来源、核查记录与关联证据；
7. **哪些事项仍未知或必须等待人工**：当前开放假设（assumptions）、未决候选与待人工决策 Gate。

### 导出与核对接口

系统提供只读接口获取当前项目的恢复视图：
~~~bash
# JSON 格式冷启动恢复视图（存在多个未完成需求时，可传 targetRequirementId 聚焦具体需求）
curl -s -b cookies.txt http://127.0.0.1:4320/api/record-projects/:id/recovery
curl -s -b cookies.txt "http://127.0.0.1:4320/api/record-projects/:id/recovery?targetRequirementId=REQ-1"

# Markdown 格式恢复报告（适合直接喂给新会话的只读上下文，提炼 7 个核心问题与最小可恢复栈）
curl -s -b cookies.txt "http://127.0.0.1:4320/api/record-projects/:id/recovery?format=markdown"
curl -s -b cookies.txt "http://127.0.0.1:4320/api/record-projects/:id/recovery?format=markdown&targetRequirementId=REQ-1"

# 独立命令行消费者子进程入口（跨进程直接从磁盘持久化目录读取推导，无服务依赖）
node --import tsx src/presentation/recovery-cli-consumer.ts \
  --projectDir data/record-projects \
  --runDir data/runs \
  --projectId :id \
  [--targetRequirementId :reqId] \
  [--format json|markdown]
~~~

详细的多进程验收用例与操作规范参见 [跨会话冷启动恢复独立验收简报](templates/cold-start-acceptance-brief.md)。

当持久化记录中存在矛盾（如 Requirement 标记为 `done` 但其关联核查为 `unknown` 或缺少 passing 证据）、意图未确认或运行基准滞后时，状态机判定为 `STOP_AND_REPORT_GAP`、`REQUIRE_HUMAN_INTENT_CONFIRMATION` 或 `RECONCILE_STALE_RUN`，坚决停止执行并报告具体缺失项，拒绝猜测推进。

## 工程检查

~~~bash
npm run check
npm run build
npm run test:e2e
node --import tsx tests/harness-start-smoke.ts
~~~

行为与浏览器测试用 AgentHub 作为隔离示例项目，检查候选保留／应用、跨会话读取、非法／越界／过期输出、预算、取消、授权到期和回执中断。最后一个命令启动当前 dist/index.js，用临时账户／目录和端口验证实际重启，结束清理；不读取实际用户项目或输出真实凭据。

## 图标和桌面形态

用户提供的图标已原样保存为 [agenthub-icon.png](../src/presentation/web/public/agenthub-icon.png)，当前用作页面图标，后续桌面容器可复用。图片内容没有编辑或重绘。Desktop App 是用户确认的最终应用形态；用户已选择先完成 Harness，再确定桌面容器，本轮没有选定 Electron / Tauri 或打包桌面应用。
