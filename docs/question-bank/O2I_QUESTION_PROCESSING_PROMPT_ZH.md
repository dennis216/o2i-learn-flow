# O2I 题目处理提示词入口

请直接复制 [v4指南第3节](O2I_AI_PRACTICE_WORKFLOW_V4_ZH.md#3-三个可复制prompt) 的三个prompt。离线HTML有相同文本和复制按钮。本文件不再维护另一套提取prompt，避免新旧混用。

1. Chat A：原始来源包 → Draft.xlsx + Evidence.json。
2. 新Chat B：相同原始来源包，先独立求解 → 保存Independent.json。此前不能看A输出。
3. Chat B：接收A输出 → 展示差异/审核卡 → 等真实人工决定 → 保存Decisions.json → 自动导出Import.xlsx + Validation.md。

必要来源缺失、范围不清或未收到决定时，停住依赖这些信息的步骤，不猜。卡片交互不可用可接收明确文字决定，不能把默认值当同意。

最终保持三sheet、28/6列、五项审核pending和空reviewed_by/at。后台只需一次发布确认，不必把XLSX改approved，不重复填四套表。
