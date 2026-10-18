# Task 4B：已保存草稿的编辑与删除

## 实现边界

- 复用 Task 4A 列表，不新增第二套列表。只有工作版本可进入编辑；review 必须明确确认、通过现有 RPC 退回 draft。
- XLSX 预览与已保存草稿共用 `QuestionBankMetadataFields`、现有校验器和草稿保存计划。允许字段仅为难度、计算器政策、课程范围、表示方式、规范 Topic/Skills、来源物理页码、locator。
- 新增前向迁移 `20261018000000_question_bank_draft_management.sql`；两份旧题库迁移未修改，RLS 和发布流程未放宽。
- 读取使用 `get_question_bank_draft`；保存使用 `update_question_bank_draft_metadata`；删除使用 `delete_question_bank_draft`。三个入口均在服务器验证管理员身份。
- 保存和删除按 question → version 顺序加行锁，与原生命周期 RPC 一致。旧值指纹包含题目生命周期、完整版本、选项、技能、次要 Topic、误解关联和视频关联，不能只靠父表时间戳覆盖子表修改。
- 保存只接收八个白名单字段；服务器重新解析规范代码，元数据与技能关联同事务更新。失败整笔回滚；旧窗口冲突要求重新读取，不自动覆盖。
- 修改记录位于版本 `import_evidence.metadata_edits`，记录服务器操作人、时间、前后值。首次编辑保留完整 `original_import_evidence`；原 AI flags、人工备注、导入时修改记录和选项注释不丢弃。相关审核关卡重置 pending，绝不自动 passed 或发布。
- 页码范围仍采用既有映射：`source_page` 存起始物理页，`source_reference` 保存范围。原始页码及原 source_reference 保留在证据/修改记录中；无关来源说明不会被当成页码展示。
- 从未发布且仅有一个工作草稿的新题可整题删除；已有发布历史只能删除工作 draft。当前发布版、superseded 历史与共享字典保持不变。删除须二次确认准确题目和版本。

## 自动及实际数据库验证

运行：

```sh
npm run test:question-bank
npm run test:adaptive
node --test supabase/tests/question_bank_foundation_static.test.mjs
npm run test:question-bank:db-drafts
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
npx eslint src/components/admin/QuestionBankDraftEditor.tsx src/components/admin/QuestionBankMetadataFields.tsx src/components/admin/QuestionBankLibrary.tsx src/components/admin/QuestionBankPreview.tsx src/lib/questionBankDraftManagement.ts src/lib/questionBankPreviewEdits.ts src/lib/questionBankDraftManagement.test.mjs supabase/tests/question_bank_draft_management.integration.test.mjs
npm run build
git diff --check
```

- 题库纯逻辑/前端协议测试：56/56；自适应回归：8/8；原基础迁移静态检查：15/15。
- 实际 PostgreSQL 17.11：20 个子场景全部通过（Node 报告含外层为 21/21）；其中原有 foundation / draft-import 的 99 + 29 条 pgTAP 断言也实际执行并全部通过。
- 覆盖有效编辑、规范代码/字段白名单拒绝、关联独立变更的过期检测、更新与删除故障回滚、非管理员及匿名权限、两种删除范围、review 保护、发布及历史版本不可修改/删除、原账号/角色/课程/视频/旧练习数据不变。
- 7 个竞争场景均使用两个真实 PostgreSQL 连接、显式事务，并读取 `pg_stat_activity` 确认第二个连接进入行锁等待，再提交先行事务。覆盖保存/保存、保存/删除、删除/保存、送审/删除、删除/送审、批准/删除、批准/保存。
- 测试脚本只创建带任务标签、回环端口 55440、tmpfs 数据目录的独立容器；不挂载原工作库卷。测试结束精确删除该容器，测试账号及题目随其销毁。启动需本机已有 Docker 与指定官方 PostgreSQL 镜像；不下载镜像，不连接外部数据库。
- 新增 TypeScript RPC 定义为人工更新；实际数据库目录核对了参数名、顺序、返回类型。没有覆盖整份 types 文件或连接远程生成类型。
- TypeScript、修改文件定向 lint、构建、diff 检查通过。首次构建的沙箱写入限制在获准的本地构建运行中解决，未为此修改应用代码。

## 浏览器验证与尚未验证

- 本机新 Chrome 会话、正常 Admin 页面：Task 4B 合成 API 验证 8 组场景；Task 4A 原列表/分页/导入/预览回归 9 组场景。
- 已检查编辑/撤销、取消零写入、保存失败保留值、最终值回读与刷新、两类删除确认、review 受控退回、窄屏、绿色正确答案、行内及独立数学公式、读取失败与重载。
- 浏览器使用合成 API；数据库事务/RLS/竞争是另外的真实 PostgreSQL 测试。未把两者冒充完整 Supabase 登录 → PostgREST → UI 的端到端验收，也未把合成内容称为真实 XLSX 批次。
- 浏览器截图、脚本仅放在 Git 忽略的 `.task4b-browser.local/`，不提交真实题目、凭据或本地测试资料。
- **生产数据库未连接、未修改；新迁移未上线，前端未部署。** 后续必须另行授权部署此新增迁移及前端，并使用真实管理员会话做编辑/删除验收。不要重跑旧的两份题库迁移或 taxonomy 初始化。
