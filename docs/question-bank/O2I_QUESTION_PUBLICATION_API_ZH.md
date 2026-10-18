# Task 4C：题库发布接口（供 Task 4D 使用）

本文件描述本地实现的数据库能力，不表示生产已部署。Task 4C 不增加网页按钮、不导入真实题目、不开放学生判分。

## 1. 状态规则与部署依赖

| 题目状态 | current_version_id | 含义 |
| --- | --- | --- |
| draft | NULL | 从未发布的新题，工作版本可为 draft/review |
| approved | 本题的 approved 版本 | 已发布；另可有一个 draft/review 工作修订 |
| unpublished | 保留本题的 approved 版本 | 可恢复撤回；学生不可见，工作修订仍保留 |
| retired | NULL | 归档；批准版本转为 superseded，所有历史保留，不提供原地恢复 |

版本状态仍为 `draft / review / approved / superseded`。approved/superseded 的内容和关联不可直接修改或删除。删除只沿用 Task 4B 草稿接口；曾发布题目本体不能永久删除。有工作修订时 Archive 明确失败，不偷偷删除修订。

依赖顺序：foundation → draft-import → Task 4B draft-management → 以下两份 Task 4C 前向迁移：

1. `20261019000000_question_bank_unpublished_status.sql`：新增 enum 值，**必须先单独提交事务**。
2. `20261019010000_question_bank_publication.sql`：约束、审核记录、权限、发布接口。

PostgreSQL 禁止在新增 enum 值的同一事务使用它。不能把这两份拼成一个 BEGIN/COMMIT。本地已实际验证同事务失败回滚与分事务成功；远程迁移部署另行授权，并先核对迁移账本，只补缺项，绝不重跑旧上线脚本或 taxonomy 初始化。

如果第二份迁移失败，其事务回滚，但第一份已提交的 enum 值仍存在；此时旧业务约束仍阻止使用新状态。不要盲目重跑第一份或自行删除 enum 值，应先核对账本及对象状态后处理第二份失败。

## 2. 安全与审核数据

- 新增 `question_version_reviews`：只通过审核 RPC 写入的追加式记录，绑定版本 ID、内容指纹及 `editorial_revision`；保存四项明确确认、使用依据、逐 flag 解决说明、真实登录操作人及服务器时间。
- 新增 `question_publication_events`：追加式 publish/unpublish/republish/archive 审计。版本 `reviewed_by` 对应实际审核人；事件 `actor_id` 对应本次发布操作人，两者可以不同。批准、审核及事件时间均由服务器生成。
- 原始 `import_evidence` 中的 XLSX pending/approved、flags、备注、人工编辑记录和选项注释完整保留；不得转换成可信审核记录或删除已处理的 flag。
- 所有原始 flag（包含 `original_import_evidence` 中的原 flag）都须有非空解决说明，包括 `FIGURE_REQUIRED`。未解决时禁止发布；不支持自动忽略或自动清空。
- 任何版本内容或选项/技能/次要 Topic/误解关联变更都会递增 `editorial_revision`，使旧人工确认失效。即使数据库内容后来改回旧值，旧确认也不会复活。明确退回 draft 同样要求重新确认。浏览器撤销/取消没有写入，因此不改变审核记录。
- `questions.lifecycle_revision` 记录发布状态与版本集合变化，防止“创建修订 → 删除修订”后旧 Save 请求再次有效。
- 学生只能直接读取 approved 题目身份。**原始 question_versions、question_options、误解与审核记录只允许管理员读取**，不能通过 REST 直接拿到 solution/is_correct。此阶段不提供学生正文/判分接口；未来安全取题必须采用不带答案的专用接口。现有静态 Quiz 未修改。
- 附属公开分类关系仍受原有 approved/current 条件与 RLS 保护，不产生新的匿名访问。当前原始版本表收紧后，不应依赖其学生端嵌入查询作为取题接口。
- 客户端不能直接 INSERT 题目/版本，不能直接 UPDATE 状态、审核人、时间、原始导入证据、验证布尔值或两个修订计数。草稿导入和 Task 4B 仍通过原 SECURITY DEFINER RPC 工作。即使调用者伪造旧自定义 GUC，也无法写入这些受保护列。
- 旧 `approve_question_version`、`create_question_revision`、`retire_question` 已撤销客户端执行权限；前两者仅作为私有核心复用。旧送审、退回 draft RPC 仍可用，但不会建立或绕过可信人工确认。

## 3. RPC 清单

所有下划线参数名必须精确匹配；除下面两项读取外，必须由管理员**明确确认操作**后调用。普通用户全部被服务端拒绝，anon 无执行权限。

| RPC | 参数 | 返回值 |
| --- | --- | --- |
| `get_question_publication_state` | `_question_id uuid` | 身份状态、current_version_id、每个版本的 ID/编号/状态/指纹、事件列表 |
| `precheck_question_publication` | `_question_id uuid, _version_id uuid, _action text`（publish/republish） | eligible、稳定 issues、fingerprint、当前/工作版本 ID、最近审核是否仍有效 |
| `record_question_version_review` | `_question_id uuid, _version_id uuid, _expected_fingerprint text, _review jsonb` | review_id、重新计算的 precheck；提交本身不发布 |
| `save_question_bank_revision` | `_question_id uuid, _source_version_id uuid, _expected_fingerprint text, _metadata jsonb` | 新 version_id、status=draft、最新 draft 快照及 state；克隆与保存同事务 |
| `publish_question_version` | `_question_id uuid, _version_id uuid, _expected_fingerprint text` | 一项发布结果 |
| `publish_question_versions` | `_items jsonb`，下述 1–20 项清单 | 结果数组，按服务器稳定锁顺序；客户端按 ID 对应，不依赖提交顺序 |
| `unpublish_question` | `_question_id uuid, _version_id uuid, _expected_fingerprint text` | status=unpublished，保留当前版本，事件 ID、新指纹 |
| `republish_question` | 同上，必须明确当前批准版本 ID | status=approved；不创建重复版本 |
| `archive_question` | 同上，仅对 withdrawn 当前批准版本 | status=retired、current_version_id=NULL，历史版本保留、事件 ID |

发布/撤回/恢复/归档成功结果共同字段：`question_id, version_id, status, current_version_id, event_id`；发布、恢复、撤回另有新 `fingerprint`，批量项另有 `action`。

预检查不是发布授权，发布事务在行锁下重新检查；`eligible` 仅适用于指定 publish/republish 动作，**不控制读取、创建修订、撤回或归档是否可用**。例如当前已发布版本不能再次 publish，但它的状态指纹仍可用于明确 Unpublish 或 Save revision。

## 4. Task 4D 推荐调用顺序

### 新题或现有工作修订发布

1. 从 Saved drafts 明确选择题目及工作版本；读取最新内容/规范标签，调用 precheck 获取指纹及待办。
2. 用户独立完成数学、分类、来源使用依据及实际显示检查；逐项确认并填写必要说明，不从 XLSX 审核单元格自动填 true。
3. 调用 `record_question_version_review`，使用当前指纹；未知 source_type/calculator_policy 必须由人作出真实选择。
4. 使用返回的新 precheck 指纹重新构建发布清单。用户点击确认发布后调用单题或批量发布。
5. 服务端允许明确的 draft/review 目标；draft 内部原子送审后批准，review 保持内容只读。新版批准时旧版变为 superseded，指针原子切换。

### 已发布/撤回题的元数据修订

1. `get_question_publication_state` 读取当前批准版本及其 fingerprint；从现有管理员 repository 读取准确版本内容和规范选项。
2. 打开编辑窗口、预览、撤销、Cancel 均不创建版本。修改范围仍是 Task 4B 八字段。
3. 若无工作修订，明确 Save 时才调用 `save_question_bank_revision`；若已有工作修订，选择其明确 ID，沿用 Task 4B 保存接口，不另建一个。
4. 原批准版本/题目状态不变；新修订必须重新提交可信人工确认再发布。Save 失败连新克隆一起回滚。

### 撤回、恢复与归档

- Unpublish：传当前批准版本 ID 与当前状态指纹；可以保留已有工作修订。
- Republish：明确恢复当前批准版本。即使已有工作修订，也必须向用户显示其存在并明确所选版本；不得省略版本参数默认发旧版。发布工作修订则用 publish，而非 republish。
- Archive：先撤回、再明确确认归档；有工作修订先处理它。归档不是可恢复撤回，不提供永久删除发布历史的接口。
- 请求结果不明时先读 state 和 events，核对目标、current_version_id 与 request_fingerprint；不要自动重试或根据超时断定未提交。

## 5. 审核 JSON 与元数据契约

以下仅示例结构，不代表任何真实题目已审核、具有权利或可发布。`original` 不能作为默认值，必须替换成实际有依据的受控选择。

```json
{
  "math": { "confirmed": true, "notes": "独立计算及唯一答案的核对依据" },
  "taxonomy": { "confirmed": true, "notes": "Topic、Skills、课程范围及难度的核对依据" },
  "source": {
    "confirmed": true,
    "notes": "来源文件定位、实际使用权利/许可依据及核对结果",
    "source_type": "original",
    "locator_verified": true,
    "printed_number_verified": false
  },
  "render": { "confirmed": true, "notes": "实际检查公式、选项、解析和必要图片的结果" },
  "calculator_policy": "no_calculator",
  "flag_resolutions": { "ANSWER_AI_INFERRED": "独立核对后如何解决此 flag" }
}
```

四项 `confirmed` 必须是 JSON boolean true，四项 notes 必须非空。无印刷题号需明确核实唯一 locator；有印刷题号须 `printed_number_verified=true`。没有 locator 不能声称其已核实。所有原 flag 都须解决记录，未知 flag 键被拒绝。

draft 可以通过此明确审核操作补齐 policy/source_type/locator_verified；review 或批准版本不能借审核调用修改内容事实，值不一致时必须先退回 draft 或创建修订。

`_metadata` 仍为八字段：`difficulty, calculator_policy, course_scope, representation_type, primary_topic_code, practice_skill_codes, source_page, source_locator`。Skill 为代码数组，页码为物理页/范围文本（如 `12-13`）；复用 Task 4B 服务端白名单、规范 UUID 解析、页码映射与审计，不另造编辑器。新修订保存不接收题干、选项、答案或解析。

批量清单每项必须且仅有：

```json
{
  "question_id": "[QUESTION_UUID]",
  "version_id": "[EXPLICIT_VERSION_UUID]",
  "expected_fingerprint": "[LATEST_SERVER_FINGERPRINT]",
  "action": "publish"
}
```

上限 20，拒绝重复题目或版本 ID。所有题目先按 UUID 稳定顺序加锁，再锁目标/当前版本；每题都先验证，写入时再走同一批准核心。任意验证或后续数据库写入失败，状态、指针、版本转换和审计事件整批回滚。重复请求返回过期/状态错误，不创建新版本；不保证盲目重放返回原成功结果。

## 6. 错误码

业务错误 SQLSTATE 为 `P0001`，message 前缀为 `QB_*`，`details` 是 JSON，包含 `code`，批量失败另含题目/版本 ID 和 issues。UI 按 code 分类，不匹配英文/中文 message。权限层拒绝可能为 `42501`，TypeScript adapter 映射为 QB_FORBIDDEN。

| 分类 | 稳定错误码 | 下一步 |
| --- | --- | --- |
| 权限 | QB_FORBIDDEN | 不绕过管理员权限 |
| 旧值/目标 | QB_STALE、QB_NOT_FOUND、QB_VERSION_MISMATCH、QB_CURRENT_VERSION_INVALID | 重新读取并明确目标；不覆盖旧窗口 |
| 状态 | QB_VERSION_NOT_WORKING、QB_VERSION_NOT_REVIEW、QB_NOT_PUBLISHED、QB_NOT_UNPUBLISHED、QB_RETIRED、QB_REVISION_SOURCE、QB_REVIEW_TARGET、QB_READ_ONLY | 按当前生命周期选择正确动作 |
| 工作修订/删除 | QB_WORKING_REVISION_EXISTS、QB_DELETE_HISTORY、QB_CHILD_REPARENT | 处理明确修订；不删除历史、不换绑历史关联 |
| 内容 | QB_CONTENT_REQUIRED、QB_OPTION_COUNT、QB_CORRECT_COUNT、QB_CORRECT_MISCONCEPTION、QB_TAXONOMY、QB_SOURCE_REQUIRED、QB_LOCATOR_PAGE、QB_FIGURE_REQUIRED、QB_CALCULATOR_REQUIRED、QB_SOURCE_TYPE_REQUIRED、QB_METADATA_INVALID | 修正对应字段，再审核 |
| 人工审核 | QB_REVIEW_REQUIRED、QB_REVIEW_STALE、QB_CONFIRMATION_REQUIRED、QB_INVALID_REVIEW、QB_LOCATOR_UNVERIFIED、QB_PRINTED_NUMBER_UNVERIFIED | 明确完成当前版本的人工作业与记录 |
| flags | QB_FLAG_UNRESOLVED、QB_FLAG_EVIDENCE_INVALID、QB_UNKNOWN_FLAG | 逐项解决；不能清掉原证据假装通过 |
| 批次/内部保护 | QB_INVALID_BATCH、QB_BATCH_LIMIT、QB_DUPLICATE_TARGET、QB_INVALID_ACTION、QB_INVALID_REVISION、QB_CONTROLLED_LIFECYCLE | 修正请求，不绕过保护 |
| 客户端响应 | QB_RESULT_UNVERIFIED、QB_DATABASE_REJECTED | 先读 state 确认实际结果；不显示虚假成功 |

TypeScript 入口为 `src/lib/questionBankPublication.ts`；没有连接 UI，也不会在模块导入、预览或读取时发起写入。类型文件为手动定向更新，已通过实际数据库参数/列/enum 元数据比较，不是远程生成。

## 7. 验证与未验证范围

执行 `npm run test:question-bank:db-publication`：仅创建本任务 loopback/tmpfs PostgreSQL 17.11，不使用原工作库卷。实际覆盖枚举事务顺序、首次发布、撤回/恢复、旧版继续保留、新版提交前后读指针、修订原子保存、审核/flag 拦截、权限/旧入口/GUC 防绕过、答案隔离、历史关联保护、批量故障回滚、重复请求、真实双连接竞争及最新 30 条 pgTAP。测试结束精确删除容器与全部合成账号/题目。

最新 pgTAP 同时用已缓存的官方 pg_prove 镜像运行（SQL 文件只读挂载，连接仅限本任务容器），不只依靠 Node 对 TAP 字符串计数。未启动完整本地 Supabase 全服务，因此不将此称为完整 Auth/PostgREST 端到端验收。

`npm run test:question-bank:db-drafts` 另外保留 Task 4B 基线和历史 128 条 pgTAP；旧 SQL 已原样移为 `.sql.fixture`，最新 schema 的标准 pgTAP 文件是 `question_bank_publication_test.sql`。Task 4C 测试也在新 schema 下检查原导入和 4B 保存/删除/退回行为。

本任务未执行生产迁移，未验证生产角色、真实来源权利或数学内容、完整 Supabase 登录/PostgREST 浏览器链路；未增加发布/撤回/恢复/归档及修订网页按钮。Task 4D 应接这些接口并做实际页面验收；学生安全取题与判分仍属后续独立任务。

本次实际执行结果：

- `npm run test:question-bank`：64/64；`npm run test:adaptive`：8/8。
- `npm run test:question-bank:db-publication`：Node 报告 33/33（包括外层 test），含 8 个持锁竞争场景、一个独立读者提交可见性场景；最新 30 条 pgTAP 分别经实际 SQL 和官方 pg_prove 通过。
- `npm run test:question-bank:db-drafts`：21/21，包括历史基线 99 + 29 条 pgTAP；两个历史 fixture 与原提交的 Git 对象哈希完全相同。
- 基础迁移静态检查：15/15；app/node TypeScript、修改文件定向 lint、`npm run build`、`git diff --check` 通过。
- 原发布包生成一致性 `--check` 通过；只检查文件，不执行旧上线 SQL。旧 migration、Admin 组件、静态 Quiz、Practice 页面没有修改。
