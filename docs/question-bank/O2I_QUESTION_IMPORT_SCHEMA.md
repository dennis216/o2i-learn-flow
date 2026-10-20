# O2I 题库导入暂存 Schema

当前操作流程：[v4指南](O2I_AI_PRACTICE_WORKFLOW_V4_ZH.md)（2026-10-20）。本格式保持28个Questions字段、6个Options字段；审核列保留为导入证据，正式发布使用当前后台的一次人工确认。

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
- 题目级 `questions.status` 表示整体生命周期：`draft`、`approved`、`unpublished`（可恢复撤回）、`retired`（归档）。编辑过程属于版本级状态：`draft`、`review`、`approved`、`superseded`。
- `questions.current_version_id` 指向当前保留的 `approved` 版本；`approved` 和 `unpublished` 均保留该指针，`draft` 或 `retired` 时为空。只有题目级 `approved` 身份可对学生投放；原始版本/选项表限定管理员读取，学生取题/判分使用专用安全接口。本导入流程不直连学生接口。
- 管理员完成初版内容后，调用 `submit_question_version_for_review(question_id, version_id)` 送审；review 版本只读，需要修改时必须调用 `return_question_version_to_draft(question_id, version_id)`。
- 当前简化版 `record_question_version_review` 仅接收真实管理员明确提交的 `{"confirmed":true}`，确认内容、正确答案、显示和Topic/Skills。操作人、时间由服务端生成并绑定明确版本/内容；导入审核状态不替代此记录。内容/关联变化使旧确认失效。旧四项确认、使用依据、逐flag表单不再是接口要求；人工仍须实际核实数学与来源使用依据。
- 发布使用带明确题目/版本/旧值指纹的 `publish_question_version` 或 `publish_question_versions`；批次上限 20，任一失败整批回滚。旧 `approve_question_version` 仅作私有实现核心，不再允许客户端直接执行。
- 已发布或撤回题需要修改时，读取/打开编辑窗口不会创建版本；明确 Save 后通过 `save_question_bank_revision` 原子克隆当前版本并保存 Task 4B 允许的元数据。旧版保持不变，新版为唯一 working draft/review；新版发布后旧版保留为 `superseded`。旧 `create_question_revision` 不再供客户端直接调用。
- `unpublish_question` 可恢复撤回并保留当前批准版本；`republish_question` 必须明确指定恢复版本。有工作修订时不能省略目标默认发布旧版。撤回后可归档为 `retired`，须先处理工作修订；历史保留、不硬删除。具体管理员操作见 [v4指南](O2I_AI_PRACTICE_WORKFLOW_V4_ZH.md)。
- `correct_option_key` 仅用于交叉校验；生产库不在题目行保存答案键，而是在唯一一个 `question_options.is_correct=TRUE` 的选项行保存正确性。
- `primary_topic_code` 与 `practice_skill_codes` 必须解析为规范表中的 UUID；不得把代码或名称作为自由文本复制到关联表。
- XLSX 可暂存跨页 `source_page`（例如 `12-13`）；生产库的 `question_versions.source_page` 必须是题目开始位置的单个正整数 PDF 物理页码，完整跨页信息写入 `source_reference`。不得使用书本印刷页码替代 PDF 物理页码。
- 使用 `source_locator` 时仍须人工核对唯一定位；当前发布校验检查格式、页码和题号/locator至少一个存在，不再要求额外locator确认勾选。模板没有 `source_locator_verified` 列，AI不得增加或伪造该值。
- 生产库 `source_type` 的受控值为 `original`、`licensed`、`public_domain`、`permission_granted`，模板没有该列，导入保存为 `NULL`；未知 `calculator_policy` 同样为 `NULL`。当前简化发布允许两者为空，不要求为发布补造值。计算器政策可来自来源明示或管理员明确设定，两者依据分别留证；没有指定可空。使用权限仍由人工确认，后端不会自动判断许可是否有效。
- `question_versions.import_evidence` 保存原始跨页文本、图形定位、转录/推断 notes、AI flags、XLSX 审核状态、四个审核关卡、审核备注及表格中的审核人/时间；`question_options.import_evidence` 保存 misconception 代码和选项解释。这些是导入证据，不等于数据库版本级 `reviewed_by` / `approved_at`，也不会自动映射到受控 misconception 关系。
- 草稿保存仍要求题干、解析、难度、课程范围、表示方式、规范 Topic/Skill、来源文件和页码、2–6 个选项及唯一正确项。`pending` 可以预览；缺失这些入库所需值时，页面会明确阻断保存。保存阶段不根据 XLSX 的人工审核状态发布题目。

## 2. 通用规则

- 文件编码和单元格文本必须保留中文与 Unicode 数学符号。
- 数学内容使用 Markdown 加 LaTeX：行内 `\(...\)`，独立公式 `\[...\]`。
- 多值代码使用竖线 `|` 分隔，例如 `1.C|2.B`。
- 布尔值统一使用 `TRUE` 或 `FALSE`。
- 空值保持为空，不用 `N/A`、`未知` 或 `0` 伪装缺失数据。
- AI 生成的 Questions 行必须写 `human_review_status=pending`。
- v4所有AI导出（含应用真实人工选题决定后的最终XLSX）仍为 `pending`，四个审核关卡也为 `pending`，`reviewed_by` / `reviewed_at` 留空。真实人工决定写外部Decisions.json及human_review_notes摘要；后台批准由服务器记录，不要求回XLSX改approved。
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
| `solution` | 保存草稿前 | Markdown + LaTeX | 来源解答优先；AI草拟加 `SOLUTION_AI_DRAFT`。 |
| `correct_option_key` | 保存草稿前 | 文本 | 匹配Options唯一TRUE；AI推断加 `ANSWER_AI_INFERRED`。 |
| `difficulty` | 保存草稿前 | `easy` / `medium` / `hard` | 编辑难度，不是CED或必须由来源给出的评级。 |
| `course_scope` | 保存草稿前 | `AB` / `BC` / `BOTH` | 依据规范主题与实际考查范围。 |
| `primary_topic_code` | 保存草稿前 | 文本 | 一个规范Topic代码，不能用自由标题。 |
| `practice_skill_codes` | 保存草稿前 | 文本 | 至少一个规范Skill，以 `|` 分隔。 |
| `representation_type` | 保存草稿前 | `analytical` / `graphical` / `numerical` / `verbal` / `mixed` | 主要表示方式。 |
| `calculator_policy` | 可空 | `no_calculator` / `calculator_allowed` / `calculator_required` | 未指定可空；真实冲突或待核实的已有要求才标具体疑点，不一律添加uncertain。 |
| `requires_figure` | AI 输出 | `TRUE` / `FALSE` | 题目、选项或解答是否必须依赖图形。 |
| `figure_reference` | 图形题 | 文本 | 来源文件、物理页码和图形位置的稳定描述。 |
| `image_url` | 生产导入前 | URL 文本 | 仅填写已授权并稳定托管的资产地址。 |
| `source_transcription_notes` | 有差异时 | 文本 | 记录 OCR、印刷页码、勘误和转录证据。不得混入分类建议。 |
| `ai_inference_notes` | 有推断时 | 文本 | 解释 AI 对答案、解答、难度、分类等提出的建议及依据。 |
| `ai_flags` | 有不确定性时 | 代码列表 | 使用 `|` 分隔；代码见工作流文档。无 flag 时留空。 |
| `math_review_status` | 兼容证据列 | `pending` / `passed` / `failed` / `blocked` | v4导出pending，数学核实记录在Decisions。 |
| `source_rights_status` | 兼容证据列 | `pending` / `passed` / `failed` / `blocked` | v4导出pending，使用依据按批次引用。 |
| `taxonomy_review_status` | 兼容证据列 | `pending` / `passed` / `failed` / `blocked` | v4导出pending，分类决定记录在Decisions。 |
| `render_review_status` | 兼容证据列 | `pending` / `passed` / `failed` / `blocked` | v4导出pending，实际Admin显示仍须人看。 |
| `human_review_status` | 全流程 | `pending` / `needs_correction` / `blocked` / `approved` / `rejected` | 保留历史受控值；v4导出只写pending，数据库批准单独记录。 |
| `human_review_notes` | 人工审核 | 文本 | 记录发现、修订、决定和未解决限制。 |
| `reviewed_by` | 兼容证据列 | 可空文本 | v4留空，后台正式操作人由服务器记录。 |
| `reviewed_at` | 兼容证据列 | 可空ISO 8601时间 | v4留空；历史表格值只作证据。 |

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
| `is_correct` | 保存草稿前 | `TRUE` / `FALSE` | 每题恰好一个TRUE，AI候选仍须人工独立验证。 |
| `misconception_code` | 可空 | 文本 | 证据不足留空，正确项必须空。导入存为选项证据，不自动创建受控误区关联。 |
| `option_explanation` | 可空 | Markdown + LaTeX | 可靠说明可保留；AI草拟须核实，不要求为填满每个干扰项编写解释。 |

## 5. 跨表验证规则

生产导入前必须通过：

1. `Questions.external_id` 无空值、无重复；
2. 每个 `Options.question_external_id` 都能关联到一题；
3. 每题2–6个选项，选项键不重复；
4. 每题恰好一个 `is_correct=TRUE`；
5. `correct_option_key` 与该 TRUE 行的 `option_key` 一致；
6. `source_document` 与 `source_page` 必填，且 `source_page` 表示 PDF 物理页码；
7. `source_question_number` 只包含来源实际印刷题号；没有印刷题号时该字段为空，并填写经人工验证、可唯一定位的 `source_locator`；
8. 不得仅因 `source_question_number` 为空而阻断。只有文件或物理页码缺失，或真实题号与已验证 locator 都无法唯一定位时，才阻断；
9. `requires_figure=TRUE` 时 `figure_reference` 必填；用于生产时 `image_url` 也必须可访问且已获授权；
10. v4导出五项审核均pending，reviewed_by/at空；旧表中的approved/passed只作为导入证据，不自动成为服务器批准。不能以状态字符串证明真实人工审核；
11. 保存草稿还要求解析、难度、课程范围、表示方式、规范主Topic和至少一Skill完整；未加载当前规范数据时禁止保存；
12. 未解决内容错误不得发布。AI flags是证据，当前服务器不强制逐flag解决表；人工解决记录仍须保留；
13. 发布前在Admin实际检查Markdown/LaTeX和图片。语法通过不能证明实际显示；学生界面另验。

实现依据：`src/lib/questionBankImport.ts`、`questionBankDraftSave.ts`、`questionBankPreviewEdits.ts`、`questionBankPublicationWorkflow.ts`，以及 `20261020000000_question_bank_simple_publication.sql`。这是当前仓库契约，不代表已查询或部署生产。全批草稿最多100题，发布最多20题；已有external_id重复导入会被拦截，不能靠改ID伪装更新。

## 6. Instructions 工作表

该表可包含占位说明，例如 `[SOURCE_FILE.pdf]`、`[PAGE_NUMBER]`、`[PRINTED_QUESTION_NUMBER_OR_BLANK]`、`[p012-item03]` 和 `[QUESTION_TEXT]`。占位内容仅解释格式，不代表真实题目、真实来源或可导入数据。不得把 Instructions 中的占位示例复制到 Questions 或 Options 作为生产行。
