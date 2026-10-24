# O2I 真实题工作流

当前使用 **V5**：[操作说明与三个提示词](workflow-v5/O2I_AI_ASSISTED_PRACTICE_PROBLEM_WORKFLOW_V5_ZH.md)，或下载 [完整包](O2I_AI_PRACTICE_WORKFLOW_V5_PACKAGE.zip)。

目录按截图整理：外层HTML、流程说明、审核SOP；input package内是格式说明、空白模板、CED标签说明。使用时再加入题目和答案PDF，共五个输入文件。

Chat A整理 → 新Chat B独立复核 → B一次生成全部审核卡 → 人工通过后导出。每卡必选计算器政策；最终五项审核状态reviewed，名字来自Reviewer，时间记录实际审核当天。网站仍保存未发布草稿。

新版Questions 26列，去掉source_locator、ai_flags。当前代码兼容旧28列文件。部署状态与本地检查见 [校验记录](WORKFLOW_V5_VALIDATION.md)。V1–V4保留供追溯。
