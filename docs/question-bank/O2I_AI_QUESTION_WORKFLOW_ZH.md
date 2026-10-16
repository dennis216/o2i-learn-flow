# O2I AI 题库处理工作流

## 1. 目的与边界

本工作流供 O2I 管理员使用 ChatGPT Work 处理已经存在于 PDF 中的单项选择题（single-answer MCQ）。目标是把来源明确的题目转录为结构化导入数据，并为人工审核准备证据。

本流程不得：

- 生成新题、改写题意、补写缺失选项，或把多选题擅自改成单选题；
- 伪造来源文件名、PDF 页码、原题号、答案、图形或版权状态；
- 用 AI 的判断替代人工最终批准；
- 把 `pending` 以外的最终审核状态交给 AI 填写；
- 把未经审核的内容直接导入生产题库。

当前仓库中的题库表仍是设计合同，不是本流程要修改的数据库。本包只生成管理员文档和暂存模板。

## 2. 角色与职责

| 角色 | 主要职责 | 不得执行 |
| --- | --- | --- |
| 管理员 | 确认来源、拆分批次、上传 PDF、保存 AI 输出与审计记录 | 不得跳过来源和版权检查 |
| ChatGPT Work | 转录原题、标出不确定性、提出分类建议、输出模板字段 | 不得给出最终批准 |
| 数学审核人 | 独立解题并核对唯一正确答案、选项与解答 | 不得只复述 AI 结论 |
| 来源/权利审核人 | 核对来源定位、许可、内部使用范围和图形权利 | 不得把“网上可见”视为可使用 |
| 分类审核人 | 核对课程范围、CED 主题、Practice Skills、难度和表示方式 | 不得用自由文本代替规范代码 |
| 渲染审核人 | 在最终显示环境检查 Markdown、LaTeX、图片和选项顺序 | 不得只看原始单元格文本 |
| 最终批准人 | 确认所有关卡通过并把状态改为 `approved` | 不得由 AI 充当 |

至少由一名未依赖 AI 解答过程的审核人完成独立数学验证。小团队可由同一人承担多个审核角色，但必须分别记录每个关卡的证据。

## 3. 输入要求

每一批次必须有：

1. 管理员实际上传到 ChatGPT Work 的真实来源 PDF；
2. 可识别且稳定的 `source_document` 文件名；
3. PDF 查看器显示的 `source_page`；
4. 来源实际印刷的 `source_question_number`（如果有）；
5. 来源没有印刷题号时，按本流程生成并由人工验证的 `source_locator`；
6. 来源/许可说明及允许用途；
7. 如题目依赖图形，清晰的图形页面或经授权的裁图。

`source_page` 使用 PDF 文件的物理页序号，不用书页印刷页码替代。如果两者不同，可在 `source_transcription_notes` 中补充印刷页码。

`source_question_number` 只记录来源页面实际印刷的题号。来源没有印刷题号时，该字段保持为空，绝不填入管理员编号或 AI 生成编号。

`source_locator` 是 O2I 生成的定位元数据，不表示来源印刷了该编号。无印刷题号时，格式为 `pPPP-itemII`：`PPP` 是至少三位的 PDF 物理页码，`II` 是该页从上到下、从 1 开始的题目顺序。例如，物理第 12 页从上到下第 3 题写为 `p012-item03`。人工审核人必须对照 PDF 验证该 locator 能唯一定位原题。

## 4. 字段责任：转录与推断必须分开

### 4.1 来源转录

以下内容应逐字、逐符号来自来源 PDF：

- `source_document`、`source_page`，以及来源实际印刷的 `source_question_number`（如果有）；
- `stem`；
- `option_key` 和 `option_text`；
- 来源已经给出的答案或解答；
- 图形标题、标签及其与题目的关系。

AI 不得静默修正文法、数值、符号或选项顺序。明显的 OCR 错误也要先保留来源证据，再在 `source_transcription_notes` 中说明建议修正。

### 4.2 AI 推断

以下内容通常属于 AI 建议，必须接受人工审核：

- `difficulty`；
- `course_scope`；
- `primary_topic_code`；
- `practice_skill_codes`；
- `representation_type`；
- `calculator_policy`；
- `misconception_code` 和 `option_explanation`；
- 来源未提供时由 AI 草拟的 `solution` 或推断的 `correct_option_key`。

所有推断必须写入 `ai_inference_notes`，并在 `ai_flags` 中使用明确代码。来源没有答案时，AI 可以提出候选答案，但必须添加 `ANSWER_AI_INFERRED`；来源没有解答时，AI 草拟的解答必须添加 `SOLUTION_AI_DRAFT`。两者都不能成为最终依据。

### 4.3 O2I 定位元数据

`source_locator` 既不是来源转录，也不是对题目内容的 AI 推断。它是 O2I 为无印刷题号的题目生成的确定性跟踪元数据。生成后必须添加 `SOURCE_LOCATOR_UNVERIFIED` 或保持来源审核为 `pending`；人工确认能唯一定位后，方可清除该 flag 并通过来源审核。

## 5. 标准处理流程

### 步骤 1：来源登记

- 记录来源文件名、版本、获取方式、权利状态和负责人。
- 确认 PDF 是否为文本型、扫描型或混合型。
- 确认批次仅包含现有单项选择题。
- 没有明确复用权限时，把批次停在权利审核，不进入生产导入。

### 步骤 2：页面、题号与 locator 定位

- 用 PDF 查看器逐题记录物理页码；只有来源实际印刷题号时才填写 `source_question_number`。
- 跨页题必须记录全部相关页，例如 `12-13`，并在备注中解释。
- 页面没有印刷题号时，让 AI 按物理页码和该页从上到下的题目顺序生成 `source_locator`，例如 `p012-item03`。此时 `source_question_number` 保持为空。
- 生成的 `source_locator` 必须由人工审核人对照 PDF 验证唯一性；验证前可添加 `SOURCE_LOCATOR_UNVERIFIED`。
- 不得因为 PDF 没有印刷题号而添加 `SOURCE_LOCATOR_MISSING`。只有需要 locator、但无法生成或无法唯一定位时才使用该 flag。
- 仅在 `source_document` 或 `source_page` 缺失，或真实 `source_question_number` 与经验证的 `source_locator` 都无法唯一定位题目时，才阻断导入。

### 步骤 3：PDF/OCR 准备

- 文本型 PDF：优先直接提取文本，再与页面视觉内容逐字符核对。
- 扫描型 PDF：先 OCR，再把 OCR 结果与扫描页并排核对。
- 数学 OCR 重点核对负号、分数线、指数、根号、积分上下限、极限趋向、绝对值、希腊字母和选项标签。
- 无法可靠辨认的字符不得猜测。保留占位说明，添加 `OCR_UNCERTAIN` 或 `OCR_MATH_UNCERTAIN`，并把题目设为 `blocked` 或保持 `pending`。

### 步骤 4：在 ChatGPT Work 中处理

- 新建仅用于当前批次的会话。
- 上传真实 PDF，并使用 `O2I_QUESTION_PROCESSING_PROMPT_ZH.md`。
- 小批量处理，建议每批 10–20 题；图形密集或 OCR 质量差时每批 5–10 题。
- 要求 AI 同时输出 Questions 与 Options 两类行，不得省略定位字段。
- 要求 AI 列出所有不确定性，不得用“看起来合理”替代证据。

### 步骤 5：管理员结构检查

管理员在数学审核前先检查：

- 每题的 `external_id` 唯一且稳定；
- `source_document` 和 `source_page` 非空；
- 每题至少有一个可用定位依据：真实 `source_question_number`，或经人工验证且唯一的 `source_locator`；
- 每个 Options 行的 `question_external_id` 能对应一题；
- 每题恰好一个 `is_correct=TRUE` 候选；若来源答案不明确，保持 `pending` 并添加相应 flag；
- `correct_option_key` 与 Options 表中候选正确项一致；
- AI 生成行的 `human_review_status` 均为 `pending`；
- `ai_flags` 与备注中的不确定性一致。

### 步骤 6：人工审核

严格按 `O2I_HUMAN_REVIEW_SOP_ZH.md` 完成四个关卡：

1. 独立数学验证；
2. 来源和权利审核；
3. 分类体系审核；
4. 最终渲染审核。

只要任一关卡未通过，`human_review_status` 就不能为 `approved`。

### 步骤 7：导入前冻结

- 锁定最终 `external_id`、选项键和来源定位。
- 清除已解决的 flag；保留仍有审计价值的历史说明。
- 确认所有批准题都有审核人和审核时间。
- 将原始 PDF、AI 原始输出、人工修订记录和最终 XLSX 作为同一批次归档。

## 6. Markdown 与 LaTeX 规则

- 普通文本使用 Markdown。
- 行内数学使用 `\(...\)`，例如 `\(f'(x)=2x\)`。
- 独立公式使用 `\[...\]`，例如 `\[\int_a^b f(x)\,dx\]`。
- 不使用裸 `$...$` 或 `$$...$$`，避免不同渲染器行为不一致。
- Markdown 强调符号不得进入 LaTeX 定界符内部。
- 不把公式截图当作可搜索文本；只有来源确实依赖图形时才使用图片。
- 最终渲染审核必须检查符号、换行、上下标、选项对齐和移动端可读性。

## 7. 图形题处理

当题干、选项或解答必须依赖图形时：

- `requires_figure=TRUE`；
- `figure_reference` 指向来源文件、物理页码和图形位置；
- `image_url` 只填写已获授权并已上传的稳定地址；
- 图形缺失、被裁切、标签不清或版权未确认时添加 `FIGURE_MISSING`、`FIGURE_TEXT_UNCLEAR` 或 `RIGHTS_REVIEW_REQUIRED`；
- 无图无法唯一解答时，不得根据版面上下文猜答案，状态必须为 `blocked`；
- 对图形做 OCR 不能替代最终视觉核对。

## 8. 不确定性代码

`ai_flags` 使用 `|` 分隔多个代码。推荐代码：

| 代码 | 含义 | 最低处理要求 |
| --- | --- | --- |
| `OCR_UNCERTAIN` | 普通文本 OCR 不可靠 | 对照原页人工核对 |
| `OCR_MATH_UNCERTAIN` | 数学符号 OCR 不可靠 | 数学审核人逐符号核对 |
| `SOURCE_LOCATOR_MISSING` | 无印刷题号且无法生成或验证唯一 locator | 禁止导入；不得仅因题号为空而使用 |
| `SOURCE_LOCATOR_UNVERIFIED` | 已生成 locator，但尚未由人工验证唯一性 | 完成来源定位审核后清除 |
| `OPTION_ORDER_UNCERTAIN` | 选项顺序或标签不确定 | 对照原页重建证据 |
| `ANSWER_AI_INFERRED` | 答案由 AI 推断 | 独立解题验证 |
| `ANSWER_UNCERTAIN` | 无法确认唯一答案 | 保持 `blocked` |
| `SOLUTION_AI_DRAFT` | 解答并非来源转录 | 独立验证并编辑 |
| `TAXONOMY_UNCERTAIN` | 主题或技能代码不确定 | 分类审核人处理 |
| `DIFFICULTY_UNCERTAIN` | 难度建议不确定 | 分类审核人处理 |
| `FIGURE_REQUIRED` | 题目依赖图形 | 检查图形资产 |
| `FIGURE_MISSING` | 必需图形缺失 | 保持 `blocked` |
| `FIGURE_TEXT_UNCLEAR` | 图形标签不清 | 获取更清晰来源 |
| `RIGHTS_REVIEW_REQUIRED` | 权利状态未确认 | 禁止生产使用 |
| `DUPLICATE_SUSPECTED` | 可能与现有题重复 | 人工查重 |

## 9. 完成定义

一个批次只有在以下条件全部满足时才可进入生产导入：

- `source_document` 与 `source_page` 完整；每题另有真实印刷题号或经人工验证的唯一 locator；
- 题干和选项与 PDF 一致；
- 数学、权利、分类和渲染四个关卡均通过；
- 每题只有一个经人工确认的正确选项；
- 所有阻断性 flag 已解决；
- 最终批准由授权人员完成并有审计记录。
