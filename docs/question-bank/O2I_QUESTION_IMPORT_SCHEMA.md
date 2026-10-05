# O2I 题库导入暂存 Schema

## 1. 用途

本 Schema 定义管理员从真实来源 PDF 处理现有单项选择题时使用的 XLSX 暂存格式。Task 3B 的 Admin 页面可预览并确认保存为**未发布草稿**；此操作不是人工批准或学生发布。

工作簿必须且只能包含三个工作表：

1. `Questions`
2. `Options`
3. `Instructions`

`Questions` 一题一行；`Options` 一选项一行；`Instructions` 只保存使用说明和占位示例。模板交付时 Questions 和 Options 只有表头，没有生产数据。

### 1.1 与生产题库表的映射边界

Task 2 的生产表采用 `questions`（稳定身份与生命周期）、`question_versions`（版本化内容与来源）、`question_options`（结构化选项）以及关联表。Task 3B 通过管理员专用的单次事务 RPC 保存整个工作簿；任何一题失败，整批回滚。转换边界如下：

Task 3B 每次确认最多保存 100 题。超过上限时应拆分工作簿，并分别预览、核验和确认；不能把一次失败的批次视为部分成功。

- 首次保存创建 `questions.status=draft` 和 `question_versions.status=draft`，且 `questions.current_version_id=NULL`。无论 XLSX 的 `human_review_status` 是 `pending` 还是 `approved`，都不映射为数据库批准状态。
- 题目级 `questions.status` 只表示整体发布生命周期：`draft`、`approved`、`retired`。编辑过程属于版本级状态：`draft`、`review`、`approved`、`superseded`。
- `questions.current_version_id` 只指向当前发布的 `approved` 版本；题目处于 `draft` 或 `retired` 时该字段为空。学生只能读取题目级 `approved` 且由该字段指向的版本。
- 管理员完成初版内容后，调用 `submit_question_version_for_review(question_id, version_id)` 送审；review 版本只读，需要修改时必须调用 `return_question_version_to_draft(question_id, version_id)`。
- 生产批准只能调用 `approve_question_version(question_id, version_id)`。该函数记录版本级 `reviewed_by`、`approved_at`，并原子切换发布指针；AI 不得调用或模拟批准。
- 已发布题目需要修改时，必须调用 `create_question_revision(question_id)` 克隆当前版本。旧版继续向学生发布，新版作为唯一 working draft/review；新版批准后旧版变为不可修改的 `superseded` 历史。
- 退役通过 `retire_question(question_id)` 隐藏题目并清空发布指针；版本历史保留，不得硬删除。
- `correct_option_key` 仅用于交叉校验；生产库不在题目行保存答案键，而是在唯一一个 `question_options.is_correct=TRUE` 的选项行保存正确性。
- `primary_topic_code` 与 `practice_skill_codes` 必须解析为规范表中的 UUID；不得把代码或名称作为自由文本复制到关联表。
- XLSX 可暂存跨页 `source_page`（例如 `12-13`）；生产库的 `question_versions.source_page` 必须是题目开始位置的单个正整数 PDF 物理页码，完整跨页信息写入 `source_reference`。不得使用书本印刷页码替代 PDF 物理页码。
- 使用 `source_locator` 时，人工确认其可唯一定位后，生产库才可设置 `source_locator_verified=TRUE`。该布尔值是审核结果，不得由 AI 自行设置。
- 生产库的 `source_type` 是权利审核人选择的受控值：`original`、`licensed`、`public_domain` 或 `permission_granted`。当前模板不自动推断该值，草稿保存为 `NULL`。未知 `calculator_policy` 同样保存为 `NULL`；版本正式批准前，两者必须由管理员确认并补齐。
- `question_versions.import_evidence` 保存原始跨页文本、图形定位、转录/推断 notes、AI flags、XLSX 审核状态、四个审核关卡、审核备注及表格中的审核人/时间；`question_options.import_evidence` 保存 misconception 代码和选项解释。这些是导入证据，不等于数据库版本级 `reviewed_by` / `approved_at`，也不会自动映射到受控 misconception 关系。
- 草稿保存仍要求题干、解析、难度、课程范围、表示方式、规范 Topic/Skill、来源文件和页码、2–6 个选项及唯一正确项。`pending` 可以预览；缺失这些入库所需值时，页面会明确阻断保存。保存阶段不根据 XLSX 的人工审核状态发布题目。

## 2. 通用规则

- 文件编码和单元格文本必须保留中文与 Unicode 数学符号。
- 数学内容使用 Markdown 加 LaTeX：行内 `\(...\)`，独立公式 `\[...\]`。
- 多值代码使用竖线 `|` 分隔，例如 `1.C|2.B`。
- 布尔值统一使用 `TRUE` 或 `FALSE`。
- 空值保持为空，不用 `N/A`、`未知` 或 `0` 伪装缺失数据。
- AI 生成的 Questions 行必须写 `human_review_status=pending`。
- AI 不得写 `approved`。只有授权人工最终批准人可以设置该状态。
- 不能确认的内容必须同时写入 `ai_flags` 和相应 notes 字段。
- `source_question_number` 可空；无印刷题号时使用经人工验证的 `source_locator`，不得把 locator 写进题号字段。
- `source_locator` 是 O2I 跟踪元数据，不是来源印刷编号，也不是题目内容。

## 3. Questions 工作表

### 3.1 字段顺序

模板使用以下字段顺序：

1. `external_id`
2. `source_document`
3. `source_page`
4. `source_question_number`
5. `source_locator`
6. `stem`
7. `solution`
8. `correct_option_key`
9. `difficulty`
10. `course_scope`
11. `primary_topic_code`
12. `practice_skill_codes`
13. `representation_type`
14. `calculator_policy`
15. `requires_figure`
16. `figure_reference`
17. `image_url`
18. `source_transcription_notes`
19. `ai_inference_notes`
20. `ai_flags`
21. `math_review_status`
22. `source_rights_status`
23. `taxonomy_review_status`
24. `render_review_status`
25. `human_review_status`
26. `human_review_notes`
27. `reviewed_by`
28. `reviewed_at`

### 3.2 字段定义

| 字段 | 必填阶段 | 类型/允许值 | 规则 |
| --- | --- | --- | --- |
| `external_id` | AI 输出 | 文本 | 管理员定义的稳定唯一 ID。不得使用行号作为长期 ID。 |
| `source_document` | AI 输出 | 文本 | 实际上传 PDF 的原始文件名，含扩展名。 |
| `source_page` | AI 输出 | 文本 | PDF 物理页码；跨页可写 `12-13`。 |
| `source_question_number` | 有印刷题号时 | 可空文本 | 只记录来源实际印刷的题号。无印刷题号时保持为空，绝不生成或填入替代编号。 |
| `source_locator` | 无印刷题号时 | 可空文本 | O2I 跟踪元数据，格式 `pPPP-itemII`，例如 `p012-item03`。按 PDF 物理页码和该页从上到下的题目顺序生成；验证前使用 `SOURCE_LOCATOR_UNVERIFIED`，必须由人工确认能唯一定位原题。 |
| `stem` | AI 输出 | Markdown + LaTeX | 逐字转录题干，不改写。 |
| `solution` | 人工批准前 | Markdown + LaTeX | 来源解答优先；AI 草拟必须添加 `SOLUTION_AI_DRAFT`。 |
| `correct_option_key` | 人工批准前 | 文本 | 必须匹配 Options 中唯一 `is_correct=TRUE` 的 `option_key`。AI 推断时添加 `ANSWER_AI_INFERRED`。 |
| `difficulty` | 人工批准前 | `easy` / `medium` / `hard` | O2I 编辑难度，不是 CED 标签。 |
| `course_scope` | 人工批准前 | `AB` / `BC` / `BOTH` | 依据规范主题和课程范围审核。 |
| `primary_topic_code` | 人工批准前 | 文本 | 一个规范 CED 主题代码，例如 `1.6`；不得填自由文本标题。 |
| `practice_skill_codes` | 人工批准前 | 文本 | 一个或多个规范代码，以 `|` 分隔。 |
| `representation_type` | 人工批准前 | `analytical` / `graphical` / `numerical` / `verbal` / `mixed` | 主要表示方式。 |
| `calculator_policy` | 人工批准前 | `no_calculator` / `calculator_allowed` / `calculator_required` | 不确定时留空并加 flag。 |
| `requires_figure` | AI 输出 | `TRUE` / `FALSE` | 题目、选项或解答是否必须依赖图形。 |
| `figure_reference` | 图形题 | 文本 | 来源文件、物理页码和图形位置的稳定描述。 |
| `image_url` | 生产导入前 | URL 文本 | 仅填写已授权并稳定托管的资产地址。 |
| `source_transcription_notes` | 有差异时 | 文本 | 记录 OCR、印刷页码、勘误和转录证据。不得混入分类建议。 |
| `ai_inference_notes` | 有推断时 | 文本 | 解释 AI 对答案、解答、难度、分类等提出的建议及依据。 |
| `ai_flags` | 有不确定性时 | 代码列表 | 使用 `|` 分隔；代码见工作流文档。无 flag 时留空。 |
| `math_review_status` | 人工审核 | `pending` / `passed` / `failed` / `blocked` | 独立数学验证状态。 |
| `source_rights_status` | 人工审核 | `pending` / `passed` / `failed` / `blocked` | 来源定位与权利审核状态。 |
| `taxonomy_review_status` | 人工审核 | `pending` / `passed` / `failed` / `blocked` | 分类审核状态。 |
| `render_review_status` | 人工审核 | `pending` / `passed` / `failed` / `blocked` | 最终渲染审核状态。 |
| `human_review_status` | 全流程 | `pending` / `needs_correction` / `blocked` / `approved` / `rejected` | AI 只能写 `pending`；人工完成全部关卡后才能写 `approved`。 |
| `human_review_notes` | 人工审核 | 文本 | 记录发现、修订、决定和未解决限制。 |
| `reviewed_by` | 最终批准 | 文本 | 授权审核人的可追溯标识。 |
| `reviewed_at` | 最终批准 | ISO 8601 日期时间 | 建议使用 `YYYY-MM-DDTHH:mm:ssZ`。 |

## 4. Options 工作表

### 4.1 字段顺序

1. `question_external_id`
2. `option_key`
3. `option_text`
4. `is_correct`
5. `misconception_code`
6. `option_explanation`

### 4.2 字段定义

| 字段 | 必填阶段 | 类型/允许值 | 规则 |
| --- | --- | --- | --- |
| `question_external_id` | AI 输出 | 文本 | 必须匹配 Questions 的 `external_id`。 |
| `option_key` | AI 输出 | 文本 | 保留原题标签与顺序，例如 `A`、`B`、`C`、`D`。 |
| `option_text` | AI 输出 | Markdown + LaTeX | 逐字转录，不为统一风格而改写。 |
| `is_correct` | 人工批准前 | `TRUE` / `FALSE` | 每题最终恰好一个 TRUE。来源无答案时 AI 候选仍须人工独立验证。 |
| `misconception_code` | 人工批准前 | 文本 | 受控代码；证据不足时留空。正确项必须留空；应用层必须在写入前再次拒绝“正确选项 + misconception”组合，数据库触发器也会拒绝该组合。 |
| `option_explanation` | 人工批准前 | Markdown + LaTeX | 解释为什么选项正确或错误；AI 草拟内容必须人工审核。 |

## 5. 跨表验证规则

生产导入前必须通过：

1. `Questions.external_id` 无空值、无重复；
2. 每个 `Options.question_external_id` 都能关联到一题；
3. 每题至少两个选项，且选项键不重复；
4. 每题恰好一个 `is_correct=TRUE`；
5. `correct_option_key` 与该 TRUE 行的 `option_key` 一致；
6. `source_document` 与 `source_page` 必填，且 `source_page` 表示 PDF 物理页码；
7. `source_question_number` 只包含来源实际印刷题号；没有印刷题号时该字段为空，并填写经人工验证、可唯一定位的 `source_locator`；
8. 不得仅因 `source_question_number` 为空而阻断。只有文件或物理页码缺失，或真实题号与已验证 locator 都无法唯一定位时，才阻断；
9. `requires_figure=TRUE` 时 `figure_reference` 必填；用于生产时 `image_url` 也必须可访问且已获授权；
10. 四个关卡状态均为 `passed` 才允许 `human_review_status=approved`；
11. `approved` 行必须有 `reviewed_by` 和 `reviewed_at`；
12. 阻断性 flag 存在时不得批准；
13. 所有 Markdown/LaTeX 已在目标渲染器通过视觉检查。

## 6. Instructions 工作表

该表可包含占位说明，例如 `[SOURCE_FILE.pdf]`、`[PAGE_NUMBER]`、`[PRINTED_QUESTION_NUMBER_OR_BLANK]`、`[p012-item03]` 和 `[QUESTION_TEXT]`。占位内容仅解释格式，不代表真实题目、真实来源或可导入数据。不得把 Instructions 中的占位示例复制到 Questions 或 Options 作为生产行。
