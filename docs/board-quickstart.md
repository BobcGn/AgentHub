# 旧版看板试用与 CLI

默认首页已切换到[正式 Requirement 看板](record-board-quickstart.md)。本文保留未迁移旧项目的 B1–B3 流程：先从默认首页进入“旧版工作区”，或使用 /?view=legacy。迁移后旧业务只读，旧 CLI 不能直接操作新 JSON。

旧版可运行的是最小提案审批闭环：建立项目和初始 Intent、划定工具范围、CLI 提案、人工决定、正式 Issue 及重启持久化。B2 补齐概览、Issue 详情和普通记录；B3 已实现 Intent / Issue 关键修订及历史，完整执行生命周期与 Runtime 仍未接入。请先使用演示项目；应用接口内的鉴权不构成同一 OS 用户下的保护证明，详见[安全边界](security.md#看板开发中的审批与宿主边界)。

## 安装与首次启动

在仓库根目录使用 Node.js 24.16.0 / npm 11：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run setup
npm run check
npm run build
npm start
```

setup 必须由本人在交互终端输入两次密码，长度 12–256 字符，不回显；只保存 scrypt 哈希，没有 HTTP 注册 / 密码重置接口，也没有默认账户。之后打开 http://127.0.0.1:4317 登录。setup 不应交给外部 Agent 操作；本轮测试只使用临时演示账户。

当前固定的 better-sqlite3 13.0.3 自带平台模块，本机 macOS arm64 / Node 24 已用忽略生命周期脚本的安装方式验证；无需 npm rebuild。其他平台的兼容性未在本轮验证。必须先 build 才能由 start 提供当前前端产物；dev 只监听服务源码，不自动重建前端。

默认数据库是 .agenthub/board.sqlite；数据、数据库附属文件与测试产物由 .gitignore 排除。可在 setup 和 start 前设置相同的 AGENTHUB_DB；AGENTHUB_PORT 可更改服务端口，默认 4317。服务只监听 127.0.0.1。停止后重启，记录保留，人端会话失效，需要重新登录。

## 建立项目和工具范围

1. 在界面中建立项目，记录已通过外部对话明确的初始 Intent：源头问题、预期结果和验证方式。保存即代表你确认这份初始意图；后续修订须通过 B3 候选建议和人端决定，Intent 另需商讨授权。
2. 进入“管理工具范围”，输入工具来源名称，再发放令牌。基础范围精确绑定该项目 / Intent，允许 board:read、issue:propose。B2 可勾选“允许追加普通记录”，明确选择当前 Intent / 具体正式 Issue，以及讨论摘要、备注、Agent 报告中的允许类型，才增加 record:append；未勾选保持基础权限。后续新增 Issue 不自动加入，旧令牌不自动扩权。不能批准、创建其他项目、改变 Intent 或执行工具。令牌只显示一次；丢失或发放结果不明时，在列表中撤销对应范围后重新发放。
3. 将令牌放入调用 CLI 的进程环境。以 macOS / zsh 为例，下列读取不把令牌写入命令文本：

   ```sh
   read -rs 'AGENTHUB_TOKEN?粘贴工具令牌：'
   export AGENTHUB_TOKEN
   npm run --silent cli -- overview
   ```

   项目 ID 在工具范围区域或 overview 的 project.id 中可见。overview 只返回该令牌范围内的项目，不返回其他工具范围和秘密。

## 提交新增 Issue 建议

仓库提供[虚构筛选示例](../examples/new-issue.json)。先复制并按实际对话结论填写，包含问题、范围、方案、收益、风险、验证及变动理由；intentVersion 必须与当前 Intent 一致，parentIssueId 为 null 或当前正式清单中的父 Issue ID。

```sh
npm run --silent cli -- propose \
  --project '<项目 ID>' \
  --file examples/new-issue.json \
  --request-id demo-proposal-001
```

每个新操作使用独立请求编号；相同操作因网络结果不明而重试时，必须保留相同内容与 request-id。编号为 8–100 位字母、数字、下划线或短横线；同号不同内容返回冲突。成功向 stdout 返回 JSON，失败向 stderr 输出 JSON 并以非 0 退出。--server 可指定 http://127.0.0.1:<port>，拒绝其他主机和重定向。没有 approve 命令或可自行设置的人工角色参数。

命令返回 pending 只说明建议已保存。此时正式清单不变，也没有代码执行许可。工具凭据可在界面撤销，后续调用立即失效。

## 人工审阅与决定

CLI 写入后界面会自动更新，进入“提案与决定”，检查本次增加的 Issue、变动理由、问题边界、方案收益风险和验证方式，再选择决定：

- 批准纳入：补充说明选填，可以直接提交；不填时显示“未补充说明”。
- 退回补充：必须填写退回原因，说明需要补充或调整什么。
- 拒绝：必须填写拒绝原因，说明为什么不纳入计划。

纯空白在批准时按未补充处理，退回 / 拒绝时不能提交；后端也检查相同规则。切换选项保留各自草稿，只有明确提交才保存。补充说明不隐含修改提案；若需改变范围或验收条件，请退回调整。详见[决定说明](governance.md#决定说明与处理结果)。

批准时，正式 Issue、提案状态、决定和计划版本在一个 SQLite 事务中保存；退回或拒绝不改变正式清单。

决定绑定提案、Intent 和正式计划的版本。另一窗口先改变计划后，旧页面决定返回 STALE_REVIEW；刷新并重新核对后再作决定。相同请求重试返回同一结果；旧决定不会重复创建 Issue。返回 HTTP 500 或网络失败不能当作已保存，应先刷新核对，再按原请求编号重试。

退回的提案保留原文和决定，修订需作为新提案另行提交；本版没有原地修改待审内容的入口。批准只代表计划纳入；界面显示“已计划 · 尚未执行”，不代表代码、CI、Git 交付或实际验收已完成。

## 自动同步与审阅保护

已登录页面通过 SSE 接收当前 Hub 服务的变更通知；CLI 或其他浏览器窗口成功写入后，概览、提案列表、正式 Issue 和计数自动读取最新内容，无需点击刷新。通知不携带记录内容或凭据，实际数据仍走鉴权查询。工具只需使用现有 CLI，不增加订阅令牌。

自动更新保留当前项目、视图及正在输入的草稿，不替你选择新提案或作出决定。若当前审阅对应的提案、Intent 或正式计划版本变化，提交会暂停，并显示“核对最新内容并继续”；检查最新内容后才能继续，最终请求仍绑定所审版本。仅新增待审建议不会改变正式计划版本。

页面显示自动同步连接状态。网络中断时保留上次内容并提示，上线、重新连接或返回页面时补读最新快照；读取暂时失败会提示并在 2 秒后重试。会话失效需要退出后重新登录，手动刷新仍可使用。

当前通知覆盖通过同一个 Hub 服务完成的写入；直接改库或另起服务进程共享数据库不属于已实现的通知来源。自动显示新内容不意味着新工作已被批准或任何代码已执行。

## 开发与检查

```sh
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

check 包含服务、浏览器及测试的类型检查，以及领域 / SQLite / HTTP / 真实 CLI 测试。test:e2e 启动临时库与独立 4318 端口，使用演示密码，仅测试代码包含该密码，产品入口不加载测试自举。测试关闭后移除临时库。首次浏览器测试需要下载 Chromium；test-results 保存截图，失败时保留 trace。

开发前端热更新可分两个终端运行（先完成 setup）：

```sh
AGENTHUB_DEV_ORIGIN=http://127.0.0.1:5173 npm run dev
npm run dev:web
```

在 http://127.0.0.1:5173 使用界面，Vite 将 /api 代理到 4317。普通 start 使用同源构建产物，无需 DEV_ORIGIN。开发监听不代替类型检查和 build。

## 当前限制

- 只支持本机单个人端账户，尚无密码重置、多用户、远程服务或 TLS 部署方案。
- 人端密码、工具令牌与独立接口能区分应用调用身份；同一 OS 用户仍可能读取进程环境、改库或修改服务代码。数据库权限、哈希、localhost 和忽略规则均不证明已建立受保护审批。
- UI 人工决定记录代表账户通路提交的决定，不是已验证的 Trusted Hub Protected Record。真实语义验收由用户完成，本轮自动化测试不代替它。
- 暂无模型调用、实际执行、Git / CI、PR / 截图附件上传。后续工作顺序见[编码计划](board-implementation-plan.md)。

## B2 记录写入

已有安装只需停止旧服务，运行 npm run check、npm run build，再 npm start；刷新并重新登录。无需重新 setup 或删除数据库。启动时以事务将 B1 v1 库增量升级为 v2，仅增加记录表与索引，保留已有账户、项目、令牌、提案、决定和幂等结果；本轮已用临时旧库验证，未操作用户试用库。

旧令牌仍只有原权限。需要记录能力时，由本人发放含明确记录边界的新令牌，保存后再按需要撤销旧令牌。先查询自身范围：

```sh
npm run --silent cli -- scope
```

[Intent 备注示例](../examples/new-record.json)关联当前 Intent；issueId 为 null，kind 为 note。请按实际内容和当前 intentVersion 填写；关联具体 Issue 时填其 id，并确认其处于令牌的 recordScope.issueIds 中。kind 只支持 discussion、note、agent_report。

```sh
npm run --silent cli -- record \
  --project '<项目 ID>' \
  --file examples/new-record.json \
  --request-id demo-record-001
npm run --silent cli -- overview
```

--project 只填 project.id，不拼接 Intent ID 或说明。每条新记录换 request-id；结果不明时用同号同内容重试。记录和幂等回执同事务保存，重试不会产生第二条；同号不同内容冲突，旧 Intent 版本拒绝。

工具写入的身份、来源名称、范围 ID 和时间由服务根据凭据生成；sourceRef 是写入者提供的外部对话线索，不是独立执行证据。未经允许的对象 / 类型返回 OUT_OF_SCOPE。不能通过 actor、verified、approved 等字段伪造决定或可信结果。

页面新增“讨论与记录”，可筛选全部、当前 Intent 或具体正式 Issue，也可由人端追加记录。Issue 详情展示批准方案、收益风险、验证计划、原始提案与用户决定，父子单元互相跳转。记录只追加，纠错时追加更正；讨论摘要不自动成为用户决定，Agent 报告标为未经实际运行核验。范围内追加无需审批，不改变正式内容或计划版本。

CLI 追加成功后，记录和计数沿用自动同步；未提交草稿按对象保留，切换视图和保存失败不丢失。草稿仅在当前登录页面内存中保存，刷新 / 退出会清空，已保存记录可重载查询。

## B2 试用检查

1. 打开已有正式 Issue，检查源头 Intent、做什么、为什么、方案收益风险、验证计划与原提案 / 决定是否能对应；有父子关系时检查相互跳转。
2. 在工具范围中只允许当前 Intent 的“备注”，执行上面的 record；不点击刷新，确认页面出现同一条内容与工具来源。
3. 将同一输入改为未授权 Issue 或 Agent 报告，换 request-id 重试，应明确失败。范围内报告需另行授权类型，保存后仍显示未经实际运行核验。
4. 输入一份未保存的人端草稿，再用 CLI 追加记录，确认草稿保留、已保存记录自动出现；停止服务后重新启动，确认保存内容仍在。

B2 实现轮次的自动化为 24 个非浏览器行为测试与 12 个 Chromium 场景；B2 授权记录 / 刷新一致与 Issue 详情两部分已于 2026-10-25 获得用户反馈确认；真实项目效果仍待验证。

## B3 关键变更试用

已有安装先停止旧服务，运行 npm run check、npm run build、npm start，再刷新 / 登录。B3 启动将 v1 / v2 库增量升级为 v3：新增 changes 表 / 索引，为旧 Issue 补 version=1 和原提案对应的 intentVersion；保留账户、令牌、记录、原提案、决定及幂等回执，不重置数据。本轮只用临时旧库验证，没有操作用户实际库。旧版本程序不能继续打开 v3 库，升级后使用本版运行。

首轮建议只测试已有 Issue，保留当前项目 Intent：

1. 在“管理工具范围”发放新令牌，勾选“允许提交关键变更建议”，仅选择要测试的正式 Issue。该权限只准提交候选，不能直接修改或批准；记录权限是另一项独立选择。旧令牌不自动扩权。
2. 在终端用 read -rs / export 替换 AGENTHUB_TOKEN，然后查询 scope 和 overview。scope 应有 change:propose 及 changeScope.issueIds；overview 提供当前 Issue / Intent / 计划版本。
3. 复制[Issue 修订示例](../examples/issue-change.json)到自己的输入文件，填写真实 targetId、baseVersion（Issue version）、intentVersion、planVersion，并将 after 替换为完整的预期 Issue 内容。示例的 ID 是占位，版本只是演示值，不可未经核对直接提交。若只细化验证，其余字段应保留当前原文。

```sh
npm run --silent cli -- scope
npm run --silent cli -- overview
npm run --silent cli -- change --project '<项目 ID>' --file examples/issue-change.json --request-id b3-manual-change-001
```

4. 不刷新，打开“关键变更”，核对对象与版本、为什么变动、预期影响及逐字段修改前后。此时正式 Issue 应保持原内容。
5. 选择“批准应用修订”（说明选填），或退回 / 拒绝（理由必填）。批准后 Issue 版本及计划版本各加一，原提案、初始决定与修订历史保留；Issue 详情的“修订历史与决定”能返回差异。审批不扩大工具范围或赋予执行许可。

建议的内容不可原地替换。基准失效时不能批准，可带理由退回，再从最新 overview 另提新建议；不要仅篡改版本号来套用旧内容。重复请求沿用原 request-id 和内容，新建议 / 新决定使用新编号。保存失败时界面保留当前输入，结果不明先核对再同号重试。

## B3 Intent 商讨授权

[Intent 候选示例](../examples/intent-change.json)仅演示格式。提交前须由本人明确授予 changeScope.intent；candidate 的 baseVersion 与 intentVersion 都是当前 Intent version。提交候选仅供讨论，不表示已授权改意图。

本人先在外部完成商讨，明确新意图、责任 / 边界和影响；随后在“关键变更”选中这份候选，填写“商讨结论与授权边界”“商讨来源”，勾选“我已完成商讨，明确授权应用本页这份 Intent 修订”，登记授权。该入口只接受人端会话，工具不能登记或自称人工；单纯写一条讨论摘要也不能代替授权。

登记授权后 Intent 仍不变。界面要求核对更新的授权状态，再另行批准应用修订；授权可在未应用前撤销，只绑定这一份候选。退回 / 拒绝无需先授权。应用后的意图若还需改动，应再次商讨、授权并提交新修订，不直接回滚或改写历史。

Intent 应用后，已有 Issue 保留原文及确认时的 Intent 版本，并提示需要重新核对。旧新增提案不能批准，可退回并依据新 Intent 重提；旧关键变更基准失效。确认现有 Issue 内容仍适配新意图时，也要提出明确的 Issue 修订建议；该情形允许正文不变，仅在人工批准后更新其对应 Intent 版本。系统不会替用户作出语义判断。

范围调整由本人重新发放明确对象的新令牌，并按需要撤销旧令牌完成；没有自动继承子 Issue、候选建议自我扩权或新增执行权限。外部商讨来源仍是人端提供的说明，应用账户通路不证明 OS 隔离或独立验证了对话。
