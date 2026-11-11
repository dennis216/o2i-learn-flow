# 答疑区（Solution Requests）

## 规则

| 项 | 规则 |
|---|---|
| 可见范围 | 公开（所有人能看，未登录也能看；登录后能回复）/ 仅管理员（只有提问人和管理员）。可以互相切换；公开改成仅管理员时，别人的回复保留，但他们之后看不到这个帖子 |
| 状态（自动计算） | awaiting 等待解答 → replied 有同学回复 → answered 有官方回复 → solved 已解决。提问人自己的回复不算 replied |
| 已解决 | 提问人或管理员标记，可以撤销，可以顺便采纳某一楼；不会自动关闭 |
| 关闭 | 提问人或管理员关闭 / 重新打开；关闭后谁都不能回复，也不能改回复 |
| 楼层 | 一直往下排，不嵌套；可以引用 #N；楼号固定，删了不重新编号 |
| 匿名 | 提问和每条回复单独选，只对其他学生匿名；管理员能看到真实身份。官方回复不能匿名 |
| 修改 / 撤回 | 改过显示"已编辑"；撤回是真删，整楼一起删 |
| 管理 | 管理员能隐藏回复或整个问题，能处理举报；登录用户可以举报 |
| 限额 | 学生每 24 小时最多 5 个问题，撤回的也算；每小时最多 30 条回复；管理员不受限 |
| 图片 | 一个问题最多 3 张，一条回复最多 1 张；jpg / png / webp / gif，单张不超过 5MB |
| 权限 | `answers` 模块，所有管理员类型都有（super_admin / admin / course_admin / question_admin） |

## 数据库

迁移：`supabase/migrations/20261111000000_solution_request_threads.sql`

- `solution_requests` 新增：是否匿名、图片路径、已解决 / 关闭 / 隐藏的时间和人、编辑时间、回复数、楼号计数、最后活动时间、采纳的楼层。状态只允许上面四个值，由数据库算，不能手动改。
- 新表 `solution_request_replies`（楼层）、`solution_request_reports`（举报）、`solution_request_quota`（提问次数，撤回不删）。三张表不开放直接读写。
- 所有读写都走 `sr_*` 函数，匿名作者的名字和用户 ID 不会返回给其他学生。
- 新上传的图片放在 `r/<随机 ID>.<扩展名>`，路径里不带用户 ID；上传人记在 Storage 的 `owner_id`。以前 `<用户 ID>/` 下的图片继续有效。
- 为了让正式站上的旧页面继续能用，暂时保留了"公开问题可直接读""本人可直接插入"这两条规则。旧页面的直接插入同样受限额约束，服务器字段（状态、解答等）会被重置。**新前端合进 `main` 之后，要再做一个迁移把这两条关掉**，那之后匿名才完全不泄露。

### 部署（人工在 Supabase SQL Editor 执行）

部署包由 `node scripts/generate-solution-request-deploy.mjs` 生成，改了迁移要重新生成；`npm run test:solution-requests:db` 会检查它是否过期。

1. 执行 `00_preflight_readonly.sql`（只读），保存输出：
   - `baseline_ok` 必须是 true；
   - `requests_with_old_solution` 应该是 0（正式站从来没写过解答）；
   - 第二个结果里 `solution_requests` 应该只有三条规则：SELECT、INSERT、UPDATE。
2. 执行 `10_upgrade.sql`：一个事务；已经登记过的话会直接拒绝。
3. 执行 `20_verify_readonly.sql`（只读）：`all_checks_pass` 必须是 true。
4. 部署之后，再把新前端合进 `test-work`。新前端依赖这些函数，顺序不能反。

出问题时：这个迁移只加东西、不删数据，旧页面照常能用。不要重跑，先用第 3 步的结果定位。

## 测试

- `npm run test:solution-requests:db`：本地一次性 PostgreSQL（只允许 localhost），需要 `SR_TEST_DATABASE_URL`。
  - 覆盖：权限矩阵、匿名不泄露、状态流转、关闭、楼层和引用、修改、可见范围切换、限额、撤回、图片权限、举报、列表和翻页，以及部署包的整个流程。
