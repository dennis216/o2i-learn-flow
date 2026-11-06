# 课程管理与 AB/BC 共享：执行记录

## 当前结论

代码已实现并在 `test-work` 提交；共享数据库已生产部署且 35/35 核验通过。**新前端尚未推送或发布**。真实游戏的 CSS 布局候选文件尚未上传；现有 AB 1.1 尚未关联到 BC。不能将本地浏览器测试称为新前端线上验收。

| Task | 本轮结果 | 验收边界 |
| --- | --- | --- |
| 1 现状核对 | 完成公开 API 与已登录数据库的只读清单 | 唯一已保存内容为 AB 1.1；BC 无草稿冲突；1.1 无可用课程练习 |
| 2 内容管理 | 实现列表、状态筛选、重开编辑、课程页编辑、预览、保存反馈、离开/返回防丢失 | 本地浏览器通过；待新前端生产发布 |
| 3 空间与视频 | 保留纵向折叠大纲；占满视窗；独立容器约束真实 iframe 元素比例 | 本地桌面/手机/iPad 尺寸通过；YouTube 网络与实机播放待验 |
| 4 游戏 | 展开/收起复用同一 iframe；保留状态；隔离不变；制作真实 1.1 CSS 候选 | 本地真实文件绘制和按钮通过；原生全屏/iPad Safari 实机及生产替换待验 |
| 5 练习 | 视频上方显示入口/准备中/失败重试；直达课程内 Topic；保留登录返回与做题返回 | 有题、无题、失败重试、提交返回的本地回归通过 |
| 6 共享数据 | 单份内容＋课程关联、版本与身份检查、事务保存、归档恢复、独立草稿 | 隔离数据库通过；生产迁移及 35 项只读核验通过 |
| 7 共享界面 | 当前适用课程、影响提示、两份内容选择、游戏预览、恢复与拆分入口 | 本地冲突确认与课程页编辑通过；数据操作的权限/恢复由隔离数据库验证；生产 UI 待发布 |
| 8 部署验收 | 数据库部署、数量核对和匿名公开 API 验收完成；本地检查完成 | 前端 push/发布待用户确认，随后做真实账号验收 |

## 生产只读清单与部署

目标：`lxoaeaewcrshjkigzyqe`，2026-10-22 UTC。

部署前 AB 的 `practice_course_scope` 错设为 BC。AB 8 Units、BC 10 Units；只有 AB 1.1 已发布且有一个 YouTube 视频和一个游戏。`list_course_practice_topics` 两门课程均为 `[]`。管理员数据库清单确认仅一条课节记录，无 BC 草稿冲突。

通过已登录 Supabase SQL Editor 执行：

1. `production/00_preflight_readonly.sql` 的迁移源与函数正文门槛、对象缺席门槛均 true。
2. 原样执行已在隔离数据库验证的 `production/10_deploy.sql`，单次事务成功。该包保存既有行和素材，不自动合并/共享/发布；将规范 AB 课程范围恢复为 AB。
3. `production/20_verify_readonly.sql` 的 **35/35** 检查全部 true，`all_checks_pass=true`；包含精确迁移/函数正文、RLS、表权限、管理 RPC 权限、游戏私有桶及课程范围。
4. 部署前后计数一致：courses=3、videos=1、questions=8、versions=8、attempts=20、sessions=17。新 lessons=1、bindings=1，旧 course_topic_content=1，全部保留。
5. 匿名真实 API 复查：AB 8 Units/81 Topics、BC 10 Units/111 Topics，HTTP 200；AB 1.1 视频/游戏仍 HTTP 200；匿名管理清单 HTTP 401；学生课节响应不包含编辑版本元数据。

已登记迁移：`20261031000000_course_shared_lessons`。**禁止重复执行部署包，也不要使用旧课程包的函数指纹检查新状态。** SQL Editor 中完成的部署与核验有真实浏览器证据；截图见下方。未产生生产测试用户、假题、作答或新教学素材。

数据库结构部署不等于已将 AB 1.1 共享到 BC。关联与 CSS 游戏替换仍需通过正式管理流程执行并验收。

## 本地验证

- `npm run test:courses`：6/6。
- `npm run test:student-practice`：20/20。
- `npx tsc -p tsconfig.app.json --noEmit`：通过。
- 修改文件范围的 ESLint 与 `git diff --check`：通过。
- `npm run build`：通过。
- `npm run test:courses:db`：旧课程、游戏 RLS、课程练习与账户隔离、旧部署包、新共享部署包/重复部署拒绝、双向内容选择、版本冲突、发布撤回、游戏读取、独立草稿、恢复与回滚均通过。一次临时 PostgreSQL 连接中断后重跑通过；临时容器自动移除。
- `O2I_REAL_COURSE_GAME=responsive npm run test:courses:browser`：通过。包含草稿保存/刷新找回、课程页编辑、取消关闭及浏览器返回、共享冲突选择、可用性三态、做题及返回、延迟加载/卸载、iframe 16:9、展开不重复下载且状态保留、iframe 隔离、真实游戏布局与按钮。
- 真实游戏候选：1180×820 时文档高 754px，与 iframe 可用高度一致；原文件为 1513px。1024×768 时触控区在视窗内；820×1180、390×844 无文档横向溢出。竖屏和手机保留源文件的纵向滚动，关卡和成就按需要局部滚动。
- `assets/README.md` 记录源对象、SHA-256 与 CSS-only 改动；移除新增样式后与原文件逐字节一致。未重新批准数学/教学内容。

浏览器网络夹具主动阻断外部资源，并测试 500 响应与 CSP 拦截；对应控制台消息不是生产故障证据。

## 接口与兼容性

新增 `course_lessons`、`course_lesson_courses`、`course_lesson_videos`；保留原表与所有数据。`get_course_outline`、`get_course_topic`、练习与旧视频链接保持课程上下文；管理员读取新增内容身份、revision、源素材课程与共享课程列表。

管理接口：`list_saved_course_lessons`、`save_course_lesson`、`share_course_lesson`、`restore_course_lesson`。新保存必须携带读取时的 lesson_id 和 revision；冲突拒绝写入并保留编辑器内容，可明确选择重新加载。旧 `save_course_topic` 仍兼容，但旧客户端不提供乐观版本检查，应尽快发布新前端。

解除共享和恢复使用独立未发布副本，原内容与资产保留。共享确认是一项单独的事务操作：先保存当前修改，再预览双方并选择内容；不采用两个独立保存请求模拟同步。当前小型管理目录以课程锁串行化写入，未来多人高并发编辑时再缩小锁范围。

## 下一步发布与验收

1. 确认允许推送现有 `test-work`；不创建新远程分支、不合并 main。
2. 推送本批提交，在 Lovable 发布匹配前端；确认线上 bundle 已改变。
3. 管理员从 Admin 和 `/courses` 各完成一次真实找回/编辑/读回；普通账户确认草稿素材不可读取。
4. 在 AB 1.1 预览 CSS 候选后替换游戏，保留旧对象；将已审核课节明确共享到 BC。若期间出现 BC 草稿，先使用冲突界面选择，禁止覆盖。
5. 以管理员与普通账户、iPad Safari 横竖屏验收；1.1 验证准备中文案，用已有有题 Topic 验证直接做题。不得为验收生成或发布假题。

目前 `outputs/` 为原有未跟踪目录，未修改、未纳入提交。

## 截图

- [生产数据库：部署后范围及数量](screenshots/production-database.jpg)：真实 Supabase 页面。
- [管理员共享内容](screenshots/admin-shared.png)、[冲突选择](screenshots/share-confirmation.png)：本地模拟数据。
- [纵向大纲与播放器](screenshots/student-tablet.png)、[练习准备中](screenshots/practice-coming-soon.png)：本地模拟数据。
- [真实游戏候选 1180×820](screenshots/real-game-responsive-interactive.png)、[1024×768](screenshots/real-game-1024x768.png)、[iPad 竖屏](screenshots/real-game-820x1180.png)、[手机](screenshots/real-game-390x844.png)：真实源文件的本地 CSS 候选渲染，不是已部署的新游戏。
