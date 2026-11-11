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

## 前端

| 位置 | 内容 |
|---|---|
| `src/pages/SolutionRequests.tsx` | 列表：公开问答 / 我的问题，按状态、题型、是否关闭筛选，加载更多；右上角显示 24 小时内还能提几个问题 |
| `src/pages/SolutionRequestThread.tsx` | `/solution-requests/:id`：一个问题和全部楼层；未登录能看公开问题，不能回复 |
| `src/components/solution-requests/` | 共用组件：帖子视图、楼层操作、回复框（预览公式、引用、传图、匿名）、提问 / 修改表单、举报框 |
| `src/components/admin/SolutionRequestInbox.tsx` | 后台 Answers 标签：待解答（awaiting + replied、未关闭，等得最久的在前）、全部问题、举报 |
| `src/lib/solutionRequests.ts` | `sr_*` 调用、校验、中英文文案、错误码、图片上传 / 签名 / 删除 |

用户写的内容按 Markdown + 公式渲染，不渲染 HTML，也不加载外部图片。

## 还没做

- 界面按 `docs/DESIGN.md` 美化（这一版只用了现有组件和 token 颜色）。
- 新前端上正式站之后的收紧迁移（见上文）。
- 通知（邮件 / 站内），这一版按约定不做。
- 撤回时，别人回复里的图片文件留在 Storage 里，但已经没人能读到（管理员除外），以后可以统一清理。
- 发过问题或回复的学生，删除账号时会被"有关联内容"挡住，和以前提问的处理方式一样。

## 测试

- `npm run test:solution-requests:db`：本地一次性 PostgreSQL（只允许 localhost），需要 `SR_TEST_DATABASE_URL`。
  - 覆盖：权限矩阵、匿名不泄露、状态流转、关闭、楼层和引用、修改、可见范围切换、限额、撤回、图片权限、举报、列表和翻页，以及部署包的整个流程。
- `npm run test:solution-requests`：前端数据层的单元测试。
- `npm run test:solution-requests:browser`：真实迁移 + 本地模拟的 Supabase 接口 + Vite + Playwright，走一遍完整流程，同时截桌面和手机宽度的图：
  - 学生 A 匿名公开提问（带图）→ 学生 B 看不到 A 的名字、回复（replied）→ 管理员在 Answers 里看到真名、官方回复（answered）→ A 采纳 B 的回复（solved）、关闭帖子 → B 不能再回复；
  - A 提一个仅管理员可见的问题，B 看不到也打不开 → A 撤回；
  - 未登录访客用手机宽度、中文界面浏览，页面没有横向滚动。
  - 需要 `SR_TEST_DATABASE_URL`（另一个一次性本地库）；Playwright 不在本项目依赖里时，用 `O2I_PLAYWRIGHT_MODULE` 指定位置。
