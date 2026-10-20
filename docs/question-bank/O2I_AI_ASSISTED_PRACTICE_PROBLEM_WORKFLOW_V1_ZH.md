# O2I 现有选择题：AI 辅助整理与人工筛选工作流 v1

> 本版依据 2026-10-03 的 Unit 1、印刷题号 Q1–10 首次完整试跑整理。适用范围是**已有来源的单项选择题**。它产出经过人工卡片筛选的 **XLSX 暂存草稿**，不等于正式批准、入库或发布。每批保留原始文件、两轮 AI 证据、人工决策和最终 XLSX。

## 一页总览

| 步骤 | 谁做、在哪做 | 上传什么 | 本步结束时必须拿到什么 |
| --- | --- | --- | --- |
| 1. 来源整理 | Chat 1 | 原题 PDF、答案/解析 PDF、空白模板、导入 Schema、CED taxonomy（可先打成一个 ZIP） | 草稿 XLSX + 逐题来源/推断证据 JSON |
| 2. 盲审 | **新开 Chat 2** | 与步骤 1 相同的五份原始文件；**不要上传 Chat 1 输出** | 独立复核 JSON，先保存再看 Chat 1 输出 |
| 3. 对照与人工卡片 | 继续 Chat 2 | 步骤 1 的草稿 XLSX + 证据 JSON；步骤 2 原始文件和独立 JSON 已在本 Chat | 差异分队列、可交互审核卡、提交后的持久化人工决策 JSON |
| 4. 导出暂存稿 | 继续 Chat 2 | 通常不用重新上传；若 Chat 2 无法读取，则补传原始 PDF、步骤 1/2 输出和人工决策 JSON | 仅含最终选中题目的 XLSX + 校验报告；所有正式审核状态仍为 `pending` |

### 开始前，管理员准备这些文件

1. **原题 PDF**：完整、清晰、能找到每道题的 PDF 物理页码；题目、选项和图形不要被裁掉。
2. **答案/解析 PDF**：最好与原题有相同的印刷题号。若只有答案没有解析，AI 解法必须明确标为草稿，不得冒充来源解法。
3. 仓库中的 [导入 Schema](O2I_QUESTION_IMPORT_SCHEMA.md)、[空白 XLSX 模板](templates/O2I_Question_Bank_Import_Template.xlsx)、[CED taxonomy](../AP_CALCULUS_CED_TAXONOMY.md)。每次运行上传**同一版本**，不要把上一批已填数据当空白模板。
4. 告诉 AI **本批印刷题号范围**，例如 `Q1–10`。建议先做 10–20 题；扫描质量差、跨页或图形多时缩小批次。
5. 确认来源使用权限。PDF 能下载或能被 AI 读取，**不等于**可以复制、导入网站或对学生展示。权利未确认时只能保持内部审核草稿。

优先选有明确题号、单一正确答案、答案能对应回原题、数学和图形清晰的资料。若题号缺失，按 Schema 建 `source_locator` 并交人工验证；若答案对不上、页码/图形缺失或题目本身多解，先放入异常队列，不让 AI 猜。**不要把有原题的批次混入 AI 新编题。**

推荐把上述五份文件压成一个来源包 `O2I_[BATCH]_Source_Packet.zip`，Chat 1 与 Chat 2 各上传一次。来源包里不要放上一轮 AI 输出。文件名可以不同，但在 prompt 的 `[原题文件名]`、`[答案文件名]`、`[题号范围]` 填真实值。

团队分发用的 `O2I_AI_ASSISTED_PRACTICE_PROBLEM_WORKFLOW_V1_PACKAGE.zip` 不是来源包：它只含本指南和四份固定参考文件，不含任何原题。先解压，再取其中的 Schema、空白模板、CED taxonomy，加上**本批自己的两个 PDF**组成五文件来源包；审核 SOP 留给人工审核员使用。

### 交接与命名

- Chat 1 保存：`[BATCH]_Chat1_Draft.xlsx`、`[BATCH]_Chat1_Evidence.json`。
- Chat 2 盲审先保存：`[BATCH]_Independent_Review.json`。**完成此保存后**才接收 Chat 1 输出。
- 卡片上的决定必须点击/提交并导出：`[BATCH]_Human_Decisions.json`。仅在页面上选按钮、但没有提交为持久文件，不算完成。
- 最终保存：`[BATCH]_Post_Review_Draft.xlsx`。同时保留所有中间文件；不要用最终 XLSX 覆盖原始草稿。

下面的四个代码块可分别复制到对应 Chat。`[...]` 必须替换为本批真实信息；文件路径由 Chat 在当前工作区自行识别，不能照抄另一批的绝对路径。

## 步骤 1：Chat 1 来源整理与初次配对

**上传**：原题 PDF、答案/解析 PDF、空白 `O2I_Question_Bank_Import_Template.xlsx`、`O2I_QUESTION_IMPORT_SCHEMA.md`、`AP_CALCULUS_CED_TAXONOMY.md`，或含这五份文件的 ZIP。不要上传旧批次草稿。

```text
你是 O2I 现有 AP Calculus 单项选择题的第一轮整理员。本批为 [BATCH]，只处理原题 PDF 中真实印刷的 [题号范围]。先列出你实际能打开的五份附件及其文件名：原题 PDF [原题文件名]、答案/解析 PDF [答案文件名]、O2I_Question_Bank_Import_Template.xlsx、O2I_QUESTION_IMPORT_SCHEMA.md、AP_CALCULUS_CED_TAXONOMY.md。缺任何一份就停止并告诉我缺什么；不要借用旧聊天、旧文件或自行找替代题目。

请读取 Schema 和空白模板，严格保持 Questions、Options、Instructions 三个 sheet、表头及字段顺序。逐题从原题 PDF 转录题干、选项、印刷题号和 PDF 物理页码；将答案 PDF 按印刷题号与原题配对，并记录答案所在物理页码。来源有解析时忠实记录；来源没有解析时，才自行写解法并标记 SOLUTION_AI_DRAFT。答案是推断而非来源给出时标记 ANSWER_AI_INFERRED。不要改写原题、补造题号、补造来源、图形、权限或计算器政策；图形缺失、跨页、OCR 不清、题号冲突和解法疑点都要留下证据并加 flag。没有印刷题号时，只能建立 pPPP-itemII 形式的暂存 locator，并标记 SOURCE_LOCATOR_UNVERIFIED。

根据提供的 taxonomy 给出 course_scope、primary_topic_code、practice_skill_codes 和综合判断的 easy/medium/hard 作为候选。不要把解法行数或文字长度当唯一难度依据。若给定文档不足以核实规范代码，保留候选并标 CODE_UNVERIFIED/TAXONOMY_UNCERTAIN，不得宣称已核实。misconception_code 留空，不猜干扰项心理过程。数学内容采用 Markdown + LaTeX：行内 \(...\)，独立公式 \[...\]；保留正负号、极限方向、指数、上下标和选项顺序。

所有 Questions 行的 math_review_status、source_rights_status、taxonomy_review_status、render_review_status、human_review_status 均为 pending；reviewed_by/reviewed_at 留空。不得写 approved。source_type 不在此模板中，不要自行推断。

输出两个可下载文件：① [BATCH]_Chat1_Draft.xlsx；② [BATCH]_Chat1_Evidence.json。证据 JSON 每题至少包含题号、原题 PDF 物理页、答案 PDF 物理页、答案配对依据、哪些内容是逐字转录、哪些是 AI 推断、疑点/flags 和图形需求。重新打开 XLSX 验证 sheet、字段顺序、题数、选项数、唯一正确选项、外键关联、待审状态、中文及 LaTeX 文本；报告检查结果和所有无法确定之处。不要入库或声称题目已获批准。
```

## 步骤 2：新 Chat 2 独立盲审

**上传**：与步骤 1 相同的五份原始文件/ZIP。**此时不要上传 Chat 1 的 XLSX、证据 JSON，也不要引用 Chat 1 内容。**

```text
你是 O2I 的第二轮独立复核员。本批 [BATCH]，只审核原题 PDF 中真实印刷的 [题号范围]。先列出实际能打开的五份附件：原题 PDF [原题文件名]、答案/解析 PDF [答案文件名]、空白 O2I_Question_Bank_Import_Template.xlsx、O2I_QUESTION_IMPORT_SCHEMA.md、AP_CALCULUS_CED_TAXONOMY.md。缺文件就停止。这是盲审：目前不得读取或请求 Chat 1 草稿、证据或旧聊天结果；不得参考其答案和标签。

独立逐题定位原题及答案/解析的 PDF 物理页和印刷题号；独立解题，核对恰好一个正确选项，检查来源解析是否完整、有效；记录原始题干/选项中的易错符号，特别是极限方向、负号、指数、上下标、图形依赖。给出 course_scope、CED Topic/Practice Skill 与 easy/medium/hard 的独立候选及理由。规范代码无法从附件核实时标 CODE_UNVERIFIED，不要猜成已核实。区分来源事实与 AI 推断；无法判定则明确 uncertain，给出需要人工翻查的页码和原因。不要做正式权利批准或渲染批准。

先把完整独立结果保存为可下载的 [BATCH]_Independent_Review.json。每题至少包含印刷题号、原题/答案物理页、正确选项、关键数学步骤、Topic/Skill/难度候选、问题及证据。重读文件验证覆盖了 [题号范围] 的每题。保存完成后停下，明确告诉我现在才可以上传 Chat 1 的两个输出文件；在看到它们之前不得做对照或改写独立结论。
```

## 步骤 3：同一 Chat 2 对照，并用卡片人工筛选

**前提**：步骤 2 的独立 JSON 已保存。**现在上传**步骤 1 的 `[BATCH]_Chat1_Draft.xlsx` 和 `[BATCH]_Chat1_Evidence.json`；原始 PDF、Schema、taxonomy 和独立 JSON 仍在本 Chat 可读。若不可读，补传，不依赖记忆。

```text
继续本 Chat 的 [BATCH] 盲审。先确认你已保存 [BATCH]_Independent_Review.json，再打开我刚上传的 Chat 1 草稿 XLSX 与 Evidence JSON。将 Chat 1、独立 JSON、原题 PDF 和答案 PDF 按真实印刷题号逐题对照；不要让后看到的 Chat 1 结果覆盖独立发现。

把每题分为「一致/低风险」「冲突」「不确定」三队列，逐项比较：原题逐字性（尤其极限方向、符号、数值）、选项及顺序、来源页和答案配对、唯一正确答案、解法逻辑、图形、course_scope、Topic/Skill、难度、LaTeX。给每个冲突提供可回查的 PDF 文件名、物理页和印刷题号；不要仅写“有问题”。未核实的 taxonomy 代码仍标 CODE_UNVERIFIED。不要把两 AI 一致当作人工或正式批准。

为人工审核员生成可交互的逐题卡片。卡片正面必须显示批次/题号、来源文件和物理页、题干与全部选项、答案；可展开解法、来源证据、标签/难度和两轮差异。每题提供「通过」「需修改」「排除」三个决定，以及简短备注；允许直接改简单字段（例如难度 dropdown、明确的符号转录修正），复杂修改写在备注并带来源定位。先展示两张有代表性的样例卡并暂停，等我确认交互方式后再生成余下卡片。若当前环境不能保存真正的交互选择，必须直说并暂停；不要把静态 Markdown 表格说成可提交的审核卡。

我逐题操作后，你必须获取并确认“提交”的结构化结果，将所有决定、修改前后值、备注和来源定位保存为可下载的 [BATCH]_Human_Decisions.json；检查每个题号恰有一个最终决定、没有遗漏或重复。卡片「通过」仅表示该题进入后续暂存稿候选，不代表数学/权利/分类/渲染四个正式审核关卡 passed，更不代表数据库 approved。请在没有收到我的提交结果之前停止，不要自行替我按通过。
```

样例卡可用后，管理员回复一句：`样例可以，继续生成本批剩余卡片。` 全部操作后再明确点击卡片的提交动作；只点选但不提交，决策可能只存在于临时 UI 状态。

## 步骤 4：同一 Chat 2 导出最终暂存 XLSX

**上传**：通常无需新附件；本 Chat 应已有原始五份文件、Chat 1 两个输出、独立 JSON、已提交的人工决策 JSON。缺哪份补哪份。**只在人工决策 JSON 确实保存后执行。**

```text
继续处理 [BATCH]。先列出并重新打开你实际读取的：原题 PDF、答案/解析 PDF、O2I_Question_Bank_Import_Template.xlsx、O2I_QUESTION_IMPORT_SCHEMA.md、AP_CALCULUS_CED_TAXONOMY.md、[BATCH]_Chat1_Draft.xlsx、[BATCH]_Chat1_Evidence.json、[BATCH]_Independent_Review.json、[BATCH]_Human_Decisions.json。缺任一必要文件就停止。以人工“已提交”的 Decisions JSON 为最终筛选依据，不得用聊天里未提交的口头/卡片状态代替。

按真实题号逐题处理：只把最终决定为「通过」且所有直接修改已明确、可追溯的题目写入新的 [BATCH]_Post_Review_Draft.xlsx；「排除」不写入；「需修改」在修改尚未由人工再次确认前不写入，列入单独待处理清单。应用已确认的简单修正到题干、选项、答案、解法、标签或难度，并把重要修改和来源证据写入 notes；不得因两轮 AI 一致而覆盖人工决定。若数学或来源冲突尚未消除，停止该题导出并列为未解决，不自行猜一个答案。

使用原空白模板结构，保持且仅保留 Questions、Options、Instructions 三个 sheet、既定表头和字段顺序；每个导出题目保留所有对应选项，正确选项恰好一个，Options.question_external_id 必须关联 Questions.external_id。数学保持 Markdown + LaTeX 的 \(...\) 与 \[...\]，检查反斜杠、负号和极限方向在 XLSX 重新打开后未损坏。misconception_code 证据不足则留空，calculator_policy/权限来源无法确认则留空并保留 flag。所有导出行的 math_review_status、source_rights_status、taxonomy_review_status、render_review_status、human_review_status 仍为 pending；reviewed_by/reviewed_at 留空。绝不写 approved 或伪造审核人。

重新打开输出 XLSX，核验三个 sheet、表头、通过题数与选项数、排除/需修改数量、题号与来源定位、唯一正确项、外键、人工修正、状态、中文和 LaTeX 字符。给出下载链接、逐题导出/未导出摘要、未解决风险和校验报告。可以做 LaTeX 语法检查，但不能将其描述成网站实际渲染已通过。不要访问网站、数据库或发布题目，除非我另行明确要求。
```

## 审核员速查 Checklist

逐题卡片优先看异常队列；低风险题也要快速扫一遍，不要无条件批量通过。

- [ ] 批次、真实印刷题号、原题和答案 PDF 的**物理页码**能对上；必要时一键/按定位回原页。
- [ ] 题干与选项的数字、正负号、极限方向、上下标、图形、顺序无错；答案**恰好一个**，解法关键步骤成立。
- [ ] Topic/Skill/course_scope 是有依据的候选；`CODE_UNVERIFIED`、权利/图形/计算器政策等未决项没有被“通过”掩盖。难度不合理时用 dropdown 改。
- [ ] 小错在卡片上改并记来源；复杂错选「需修改」并写清位置和要求；不值得修或不可靠的选「排除」。
- [ ] **提交**卡片决定，核对决策 JSON 覆盖全批，再核对导出 XLSX 的题数、修正与所有 `pending` 状态。

“30 题 10 分钟”只可作为**卡片快速分流**的优化目标，不是已验证的正式题库审核时长；数学独立验证、来源/权利、规范分类和真实页面渲染仍按 [人工审核 SOP](O2I_HUMAN_REVIEW_SOP_ZH.md) 完成。题目正式入库、管理员上传确认和发布属于后续网站流程，当前四步没有完成或验证这些操作。

## 固定参考文件与已知限制

- [O2I_QUESTION_IMPORT_SCHEMA.md](O2I_QUESTION_IMPORT_SCHEMA.md)：XLSX 暂存格式与到版本化数据库的映射边界。
- [O2I_Question_Bank_Import_Template.xlsx](templates/O2I_Question_Bank_Import_Template.xlsx)：唯一空白模板，不要拿上一批填好的 XLSX 当模板。
- [AP_CALCULUS_CED_TAXONOMY.md](../AP_CALCULUS_CED_TAXONOMY.md)：分类原则；**此文档不是完整规范代码清单**，而且其“下一次迁移”说明是历史文字，不能据此判断当前数据库状态。代码候选必须与当前规范数据再核对。
- [O2I_HUMAN_REVIEW_SOP_ZH.md](O2I_HUMAN_REVIEW_SOP_ZH.md)：正式四关卡批准标准。本工作流中的卡片“通过”与此文档的 `approved` 不同。

首次试跑的 Q1–10 最终只导出 8 题：Q7、Q10 被排除；Q6 极限方向从误转录的负无穷修回来源的正无穷；Q8/Q9 的最终难度经人工调整为 hard。该结果证明对照和卡片能发现并保留修正，但**不能证明**所有题的权利、taxonomy 代码、计算器政策或网站数学排版已通过正式审核。
