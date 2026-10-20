# O2I 真实题工作流入口

当前版本是 **v4（2026-10-20）**。使用 [完整指南与三个prompt](O2I_AI_PRACTICE_WORKFLOW_V4_ZH.md)，或解压分发文件 `O2I_AI_PRACTICE_WORKFLOW_V4_PACKAGE.zip` 后打开 [离线手册](START_HERE_O2I_Practice_Workflow_V4.html)。

流程：来源包 → Chat A整理 → 新Chat B独立复核 → 对照与人工决定后自动导出 → Admin预览、保存草稿、回读、一次确认发布。

配套文件：

- [导入Schema](O2I_QUESTION_IMPORT_SCHEMA.md)：28个Questions字段、6个Options字段及当前保存/发布边界。
- [空白XLSX](templates/O2I_Question_Bank_Import_Template.xlsx)：只含表头与说明，没有真实题。
- [Topic/Skill代码快照](O2I_CED_CODE_REFERENCE.md)：来自仓库规范迁移，Admin保存时还要核对实际数据库。
- [人工审核SOP](O2I_HUMAN_REVIEW_SOP_ZH.md)：核验项与修订处理。
- [校验记录](WORKFLOW_V4_VALIDATION.md)：区分已验证与未执行。

旧V1/V2/V3及无版本号的旧ZIP均为历史材料，不能与v4混用。AI只交pending草稿，正式发布由管理员在后台确认。
