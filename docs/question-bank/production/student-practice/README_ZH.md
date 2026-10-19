# 已发布题库：学生真实练习闭环

本任务只在本地实施、测试、提交。未 push、未部署、未连接生产数据库，也没有审核或发布真实 8 题。

## 行为与边界

- 登录后 Practice 按规范 Topic 列出有当前已发布题目的分类，并读取本人最近 10 条账户作答。真实作答不读写旧 localStorage 示例成绩。
- Quiz 每组最多 5 个不同题目，不足 5 题按实际数量返回，零题显示空状态。只取 `questions.status=approved` 且当前版本 `approved` 的单选题。
- 取题只投影题目/版本身份、题干、选项文字/身份、图片及已保存标签。提交前没有正确答案、解析、`is_correct` 或原始导入证据；没有放宽原答案/解析表权限。
- 服务端将 Auth 用户绑定到会话、已发题和精确版本。提交仅接受会话、题目、选项和不可信设备用时；判分与账户作答在同一事务保存。客户端不能提交用户身份、正确与否或成绩。
- 同一会话/题目只能保存一次；相同选项重试返回原记录，不同选项不能覆盖。失败时不显示已保存；结果未知可用只读接口查询。页面 URL 中的会话身份用于刷新恢复。
- 新版本发布后，已经发出的题仍按绑定的旧版本判分；撤回/归档阻止新会话取题，已经发出的保留版本仍可完成。历史版本和作答不被覆盖。
- 最近作答与会话只允许本人读取；所有客户端都无直接新增/修改/删除判分记录的权限。退出/换号时页面按用户身份重新挂载，先前账户的请求结果不会进入新页面。
- Lesson 完成记录和 Review 课程笔记仍是原有原型能力；两处练习按钮转到 Practice 选择规范 Topic。旧 lesson/skill Quiz 筛选没有可靠映射，会明确拒绝，不忽略条件取全库。
- 本轮使用题目 ID 顺序取前 5 题，没有实现新的自适应算法，也不保证不同组之间换题。需要题目轮换时再扩展选题策略。
- 未修改旧 `practice_problems`、AI 工作流、XLSX 格式或现有发布规则。

## 用户后续上线顺序

1. 已完成的题库历史迁移和简化发布迁移不要重跑。此次唯一新增迁移为 `supabase/migrations/20261021000000_question_bank_student_practice.sql`，与并行 Team 变更无依赖。
2. 确认生产项目身份，在 SQL Editor 一次复制执行本目录 **10_deploy.sql 全文**。此文件已包含完整新 SQL，无需替换占位符；在一个事务中核对已完成简化迁移的原 SQL 指纹、创建学生练习表/接口并写入新账本。重复执行会明确拒绝；失败不留下部分结构或账本。不要额外再执行原 migration 文件。
3. 独立执行 **20_verify_readonly.sql 全文**，唯一结果中的 `all_checks_pass` 必须为 true（11 项）。该查询只读目录和账本，不读取题目或账户内容。
4. 本轮没有推送授权。后续另行 push、PR 审核合并和前端部署；确认部署包含本任务 commit。部署前新前端无法调用尚未安装的接口；部署旧前端不会自动接通新题库。
5. 部署后用登录账户检查 Practice 分类、取题、提交后解析、刷新及最近作答，另一个账户不得看到前一账户记录。真实题是否发布仍由管理员人工审核决定；若没有已发布题，空状态是正确结果。

如使用正式迁移工具部署，执行原新增 migration 并由工具记账，随后只读验收；不要同时再执行 SQL Editor 部署副本。本任务未评估或执行包含无关待部署迁移的整库 `db push`。

## 本地复现

```sh
npm run test:student-practice
npm run test:question-bank
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.node.json
npm run build

# 缓存有 PostgreSQL / GoTrue / PostgREST Docker 镜像、Chrome、Playwright 时执行：
O2I_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
O2I_ACCEPTANCE_XLSX=/absolute/path/to/O2I_Q1-10_Post_Review_Draft_2026-10-03.xlsx \
npm run test:student-practice:integration
```

集成脚本使用专用一次性数据库、Auth、REST 和仅 loopback 的浏览器；不读取项目生产密钥、不复用已有数据库，结束删除容器。需 Docker 权限和空闲端口 55512–55515、5192。检查与截图保存在 Git 忽略的 `node_modules/.cache/student-practice/`，真实题内容不进入提交。

真实文件验收分两部分：8 题/32 选项实际保存为隔离草稿，检查原文字和标签回读；将其安全投影通过本地浏览器 fixture 显示在 Quiz，验证公式、选项和只读标签。完整发布→取题→判分→刷新闭环使用合成题。该 UI fixture 不构成真实题已审核、已发布或已通过生产验收的证据。

生成上线副本：`node scripts/generate-student-practice-deploy.mjs`。部署副本及账本原文来自唯一新增 migration；集成测试实际执行并核对副本，而不是只做静态文本测试。
