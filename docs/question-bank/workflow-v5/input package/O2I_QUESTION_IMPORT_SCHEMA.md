# O2I 导入格式 · V5

请直接填同包的空白模板。只保留 Questions、Options、Instructions 三张表，表头和顺序不要改。Questions 一题一行，Options 一选项一行。

## Questions：26列

| 字段 | 填什么 |
| --- | --- |
| external_id | 本题稳定唯一ID，同题重做不要改ID |
| source_document | 题目PDF的真实文件名，含.pdf |
| source_page | PDF物理页码，跨页可写12-13，不是印刷书页 |
| source_question_number | 原PDF实际印刷题号，不能自编 |
| stem | 原题题干 |
| solution | 来源解析，或注明是AI草拟的解析 |
| correct_option_key | 正确选项键，如C |
| difficulty | easy / medium / hard，由人工最后确认 |
| course_scope | AB / BC / BOTH |
| primary_topic_code | 一个规范Topic代码 |
| practice_skill_codes | 实际考查的Skill；多个用竖线分隔，如1.E\|2.B |
| representation_type | analytical / graphical / numerical / verbal / mixed |
| calculator_policy | no_calculator / calculator_allowed / calculator_required；草稿可空，人工通过时必须选 |
| requires_figure | TRUE或FALSE |
| figure_reference | 必要图片在原PDF的文件、页码和位置，无图则空 |
| image_url | 必要图片的稳定授权网址，无图则空；不能用临时聊天链接 |
| source_transcription_notes | 转录疑点、原文或勘误说明；答案PDF文件/物理页及配对依据也记在这里 |
| ai_inference_notes | AI解法、难度或分类判断的理由；与来源内容分开 |
| math_review_status | 草稿pending；人工核对数学后reviewed |
| source_rights_status | 草稿pending；人工查看来源及使用说明后reviewed |
| taxonomy_review_status | 草稿pending；人工核对标签后reviewed |
| render_review_status | 草稿pending；人工查看卡片显示后reviewed |
| human_review_status | 草稿pending；人工保存并通过后reviewed |
| human_review_notes | 审核修改、意见，以及需要保留的限制 |
| reviewed_by | 实际审核人的名字，从prompt末尾Reviewer填写 |
| reviewed_at | 实际审核时间，自动记录且包含时区，例如2026-10-22T15:20:00-07:00；这只是格式示例，不是应照抄的审核时间 |

## Options：6列

| 字段 | 填什么 |
| --- | --- |
| question_external_id | 对应Questions.external_id |
| option_key | 原题选项标签，如A、B、C、D，保留原顺序 |
| option_text | 原选项内容 |
| is_correct | TRUE或FALSE，每题恰好一个TRUE，并与答案键一致 |
| misconception_code | 本流程留空 |
| option_explanation | 有可靠解释可保留，没有则空 |

## 填写和导出

- 不新增source_locator、ai_flags列。来源、数学和标签疑点写在notes、证据JSON及卡片中，不能因为删列就隐藏问题。
- 只处理已有真实印刷题号的单选题，每题2–6个选项；无题号、缺图或来源无法看清时列待处理，不编造内容。
- 中文、英文、数学公式均作为文本保存，不用Excel公式。数学使用 `\(...\)` 和 `\[...\]`，保留负号、极限方向和上下标。
- 不确定值留空，不用N/A、0或“未知”代替；但最终通过题必须填齐答案、解析、难度、课程范围、表示方式、主Topic、至少一个Skill和计算器政策。
- Draft阶段审核状态pending，姓名/时间为空。最终只导出已保存通过的题：五项状态reviewed，姓名取实际Reviewer，时间取实际审核当天；不能由AI自行宣称已经人工审核。
- reviewed是本次卡片审核记录，**不是网站发布状态**。Admin仍保存未发布草稿；实际页面显示和发布由管理员最后确认。
