# O2I 题库版本生命周期数据库测试规格

## 1. 用途

本规格用于在可丢弃的本地 Supabase/PostgreSQL 环境中验证 `20260926000000_question_bank_foundation.sql`。仓库使用固定版本的项目级 Supabase CLI；静态检查仍不能代替数据库集成测试。

Task 4C 已更新发布审核与答案读取边界。下面第 2 节起保留的是 Task 2 历史基线规格；**最新接口与状态规则以 [Task 4C 接口说明](O2I_QUESTION_PUBLICATION_API_ZH.md) 为准**，不能再按旧接口直接批准或向学生读取原始答案表。

当前自动化入口：

- `npm run test:question-bank:db-publication`：建立独立 tmpfs PostgreSQL，按提交顺序验证最新迁移、真实双连接竞争，并执行最新 30 条 pgTAP；不 reset 既有本地工作库；
- `npx supabase test db`：仅在已应用最新迁移的可丢弃 Supabase 环境运行 `supabase/tests/question_bank_publication_test.sql`；
- `npm run test:question-bank:db-drafts`：在独立 Task 4B 基线环境执行旧 99 + 29 条 pgTAP 及草稿操作回归。历史 SQL 原样保存在 `supabase/tests/fixtures/*.sql.fixture`，不会混入最新 schema 的标准 pgTAP 扫描；
- `question_bank_revision_concurrency.test.mjs` 是旧基础 schema 的并发基线；最新发布/修订竞争已在 Task 4C 集成测试中覆盖，不在最新 schema 上调用已私有化的旧创建 RPC；
- `node --test supabase/tests/question_bank_foundation_static.test.mjs`：保留迁移结构与安全防护的快速静态回归检查。

这些命令只允许连接 `localhost`、`127.0.0.1` 或 `::1` 的可丢弃数据库。不得使用远程 Supabase URL。

测试必须创建三个身份：

- `admin_user`：拥有 `admin` 角色；
- `student_user`：普通 authenticated 用户；
- `anonymous`：无登录身份，用于确认没有匿名题库访问。

测试数据使用现有 `curriculum_topics`、`curriculum_practice_skills` 和 `course_videos` 的规范 ID。每个场景结束后回滚事务或销毁测试数据库。

## 2. 首版批准

1. 管理员创建 `questions.status=draft`，`current_version_id=NULL`。
2. 创建 version 1，状态必须自动为 `draft`，并写入 2–6 个选项及唯一正确项。
3. 调用 `submit_question_version_for_review(question_id, v1_id)`。
4. 调用 `approve_question_version(question_id, v1_id)`。

预期：

- v1 为 `approved`，具有 `reviewed_by` 和 `approved_at`；
- question 为 `approved`，`current_version_id=v1_id`；
- student 能读取 question、v1 和 v1 子记录；
- anonymous 不能读取题库记录。

## 3. 从已发布版本创建修订

调用 `create_question_revision(question_id)`。

预期：

- 返回 v2 UUID，`version_number=2`、`status=draft`；
- v2 完整复制 v1 的题干、解答、分类、来源、选项、Practice Skills、次要 Topics 和 misconception 映射；
- v2 使用新的 version/option UUID；
- question 仍为 `approved` 且 `current_version_id=v1_id`；
- student 仍只读到 v1，不能直接查询 v2。

## 4. Review 阶段不改变发布内容

调用 `submit_question_version_for_review(question_id, v2_id)`。

预期：

- v2 为 `review`；
- v2 内容及所有子记录的直接 INSERT/UPDATE/DELETE 被拒绝；
- question 仍指向 v1；
- student 仍只读到 v1；
- 调用 `return_question_version_to_draft(question_id, v2_id)` 后，v2 恢复可编辑。

## 5. 批准 v2 并原子切换

把 v2 重新送审，然后调用 `approve_question_version(question_id, v2_id)`。

预期在同一事务提交后：

- v1 从 `approved` 变为 `superseded`；
- v2 从 `review` 变为 `approved`，记录审核人和批准时间；
- question 保持 `approved`，`current_version_id=v2_id`；
- student 只能读取 v2 及其子记录，不能读取 v1；
- 不存在学生可观察到的“无发布版本”或同时发布两个版本的中间状态。

## 6. 历史版本不可变

分别尝试修改或删除 v1 的版本行、选项、Practice Skill、次要 Topic 和 misconception 映射。

预期：所有操作均被拒绝，v1 仍完整保存。对当前 `approved` v2 的同类直接写入也必须被拒绝；修改必须通过创建 v3 完成。

## 7. 单一 working revision

在 v2 已发布后并发执行两次 `create_question_revision(question_id)`。

预期：

- question 行锁使调用串行化；
- 仅一次调用成功；
- 另一次返回“已经存在 draft 或 review version”的错误；
- 部分唯一索引 `question_versions_one_working_revision` 作为最终数据库保护；
- 同一 question 不可能同时存在两个 `draft/review` 版本。

## 8. 未授权操作

使用 `student_user` 调用以下函数：

- `create_question_revision`；
- `submit_question_version_for_review`；
- `return_question_version_to_draft`；
- `approve_question_version`；
- `retire_question`。

预期：全部以权限错误拒绝，且所有数据保持不变。直接更新 question 发布状态或 version 编辑状态也必须被触发器拒绝。

## 9. 退役

在没有 working revision 时调用 `retire_question(question_id)`。

预期：

- 当前 approved version 变为 `superseded`；
- question 变为 `retired`，`current_version_id=NULL`；
- student 不再能读取 question 或任何版本/子记录；
- 管理员仍能读取全部历史；
- 不删除任何 version；
- 存在 draft/review working revision 时，退役被拒绝，管理员必须先处理该 revision。

## 10. 批准完整性回归

对 v2 分别构造以下无效状态并尝试批准：

- 少于 2 个或多于 6 个选项；
- 0 个或多个正确选项；
- `requires_figure=TRUE` 但没有 `image_url`；
- 缺少来源文件或正整数物理页码；
- 无真实印刷题号且 locator 未验证；
- 正确选项关联 misconception；
- 缺少有效主 CED Topic。

预期：每次批准均以清晰数据库错误回滚；旧的 published version 和 question 发布指针保持不变。
