# V5 交付与上传适配检查

日期：2026-10-22。按用户给出的第一版提示词、审核卡和文件夹截图重做。

## 交付

完整包为 `O2I_AI_PRACTICE_WORKFLOW_V5_PACKAGE.zip`。解压后恰好6个文件：外层HTML、流程说明、审核SOP；input package内是Schema、空白XLSX、CED标签说明。题目和答案PDF由使用者按批次加入，不把参考批次的题混入空白包。

三个prompt分别对应A整理、B独立复核、B全批审核卡与最终导出。没有两题试做，没有额外审核表。计算器政策必选；仅人工保存并通过后，五项状态才为reviewed，姓名来自Reviewer，时间为实际审核当天，重新导出不篡改已保存时间。未确认项仍pending，不代填人工决定。

Questions为26列，删除source_locator、ai_flags，Options仍为6列。原始来源、答案配对、AI推断及人工修改通过notes、两轮证据和审核结果JSON保留。

## 已验证

- `npm run test:question-bank`：91/91通过，含新版真实空白模板、26列输入、缺审核人/非法日期/未选计算器/未完成审核拦截、元数据编辑、旧模板回归。
- 实际生成一个明确标为合成数据的reviewed XLSX，使用Admin同一解析器、规范数据校验、草稿保存计划与RPC客户端函数验证；审核状态、姓名、带时区时间和计算器政策完整保留。客户端请求以测试替身接收，没有向生产发送。
- 用户提供的旧 `O2I_Q1-10_Post_Review_Draft_2026-10-03.xlsx` 实际读取为8题32选项，通过当前代码的草稿保存校验。原文件和原题/答案ZIP未修改，也没有替用户重新审核或填计算器政策。
- `npm run test:question-bank:db-drafts`：独立临时PostgreSQL中22/22通过，执行实际原有导入RPC。新增用例验证reviewed、人工姓名/时间、计算器政策可存储，source_locator可空，题目/版本仍draft、current_version_id为空。既有128条pgTAP断言及权限/事务回归继续执行，临时容器随测试清理。
- 应用TypeScript、四个修改的TS/TSX文件定向ESLint、生产build和diff检查通过。
- 模板三张表仅有表头与使用说明；没有真实题、隐藏题或Excel公式。已渲染查看三张表；数据验证包含pending/reviewed及计算器选项。
- 分发包逐文件与源文件比对，ZIP完整性、3段prompt文本、HTML引用、内联脚本语法及111个Topic/23个Skill检查通过。HTML与模板使用相同简化字段。

## 上线边界

当前改动在本地工作树，**未部署线上Admin**。旧线上前端若仍强制28列或不接受reviewed，会拒绝V5文件；须先发布本次前端兼容修改，再在线上传。无需数据库迁移，现有导入RPC已经验证能保存这些审核记录。

新旧格式都保留字段顺序、来源定位、唯一答案、规范标签、必要图片等校验。reviewed只记录人工卡片审核，不绕过后台发布确认。旧数据的locator/flags保留原样，不删除历史。

未用V5新跑真实题的完整AI与人工审核过程；未验收聊天环境实际生成的卡片交互、离线HTML浏览器复制按钮或线上Admin上传。没有新增准确率/耗时承诺。未改动任务开始时已有的V2 HTML删除和outputs目录。
