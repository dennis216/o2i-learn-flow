# 管理员权限交接与执行记录

本轮仅本地提交，不 push，不自动修改生产账号或删除真实用户。

## 已批准的权限

| 角色 | 数据库标识 | Courses | Question Bank | Playground | Team | Users / 删除用户 |
|---|---|---|---|---|---|---|
| Super Admin | super_admin | 是 | 是 | 是 | 是 | 是 |
| Full Admin | admin（保留旧标识） | 是 | 是 | 是 | 是 | 否 |
| Course Admin | course_admin | 是 | 否 | 是 | 否 | 否 |
| Question Admin | question_admin | 否 | 是 | 是 | 否 | 否 |
| Student | student | 学生端 | 学生端 | 学生端 | 公开信息 | 否 |

模块权限包含现有编辑、发布、删除；原内容审核和版本锁定规则继续生效。
不做自定义权限面板，不按单门课程授权。后台每人一种管理员身份，服务端原子替换角色。

## 顺序任务（一个任务一个 commit）

1. 盘点权限与删除影响；冻结范围、记录部署和验收边界。
2. 数据库：模块授权、RLS/RPC/Storage、停用 Instructor、原子角色设置。
3. 前端及邀请：菜单、默认入口、题库内部权限判断、角色显示与设置。
4. 删除用户：预览与确认、保护 Super Admin、保留公共内容、操作记录。
5. 整体验收：数据库越权、浏览器、构建、部署材料与人工审核清单。

## Task 1 仓库盘点结论

- `user_roles` 是权限来源，`profiles.role` 和 Team 职位不是授权依据。
- `has_role(...,'admin')` 目前被多个模块共用；不能把新角色全部视为 admin，否则会放开 Team 和用户数据。
- Courses 包括 subjects、课程目录、视频、共享课时、HTML 游戏、课程图片及相关 Storage。
- Question Bank 包括草稿导入/编辑/删除、审核发布、统计、题目图片；必须继续保护答案和未发布版本。
- Playground 独立授权；Team 及 team-photos 仅 Full/Super。
- 旧 Instructor 授权不仅在邀请界面：courses/course_videos 的所有者策略、Storage 和 requests 中也有遗留入口。
- `courses.instructor_id -> profiles.user_id ON DELETE CASCADE`：直接删除作者账号可能连带删除课程。新删除功能必须拦截。
- questions/question_versions.created_by、reviewed_by、question_version_reviews.reviewed_by、question_publication_events.actor_id 使用 RESTRICT：不重写作者/审核者身份，不删除审核证据。存在关联时阻止永久删除，明确列出阻塞项。
- Storage 账号归属需要单独检查；未解决的文件归属阻止删除，不能先删对象导致课程素材丢失。
- Super Admin 唯一性和禁止浏览器修改规则保留；不能删除自己或 Super Admin。
- 旧 admin 原样保留，显示 Full Admin。旧 instructor 账号不删除，仅撤去该角色；没有其他角色时转 student，不自动提权。

## 验证与截图边界

后端任务截图展示本地检查输出；前端截图标明使用合成账号/网络夹具。
本地 PostgreSQL 验证使用一次性 Docker 容器，不接生产。截图不能代替数据库权限测试。
线上人数、真实账号映射、生产数据库策略仍需部署前只读盘点；本轮不把本地结果描述为线上验收。

## Task 2 数据库验收

实际一次性 PostgreSQL 已通过 10 组检查，见 `task2-database-results.txt`。
包含角色矩阵、Instructor 退役、课程草稿隔离/写入、Team、Playground、题库真实草稿导入、课程 RPC、Storage 所有者绕过拦截、角色原子切换与撤销。
迁移必须先提交 `20261103000000` 枚举，再执行 `20261103010000`，不能合在同一事务使用新枚举。
课程内部 before_outline 函数亦纳入授权修正；不修改课程正文和题库审核规则。

## Task 3 前端与账号设置

24 项相关单元测试、TypeScript 检查及构建通过。真实 React 页面配合合成账号/网络夹具完成四类管理员与学生路由检查、菜单精确匹配、无权模块不请求、题库正常空列表、原子角色切换、邀请角色选项检查。
截图 `task3-*.png` 是本地实际页面，账号与数据为合成夹具；不表示生产已经部署或邮件实际送达。
学生端课程编辑入口也只接受课程权限，Question Admin 不再获得课程编辑入口。

## Task 4 安全删除用户

只接受 Super Admin；不允许删除自己或 Super Admin。前端先预览关联、输入目标邮箱；后台准备短时确认，Auth 真正 DELETE 时数据库再次检查身份、邮箱、关联和有效期。
公共内容相关的旧 CASCADE 外键改为 RESTRICT，不删除课程，不改写题目作者或审核记录；上传文件归属检查与账号删除串行化。存在关联时先阻止永久删除。
成功审计与删除在同一事务；Auth 失败或响应未知时清理确认并记录失败，前端不会提前移除用户。
数据库 6 组删除检查、4 组服务处理逻辑测试、实际 React 删除对话框的阻塞/确认/失败/成功流程均通过；构建和 TypeScript 通过。
当前数据库测试的 auth.sessions 是显式的最小外键模型；真实 Auth 服务会话验收另在 Task 5 记录。浏览器 Task 4 截图使用合成网络响应。
注意：部署后，直接 Auth Admin API 删除也需要先生成有效 Super Admin 确认；外部控制台不能绕过保护直接删账号。

## Task 5 最终交接

- 新增账户私有资料的限制性策略，避免历史宽松策略让普通管理员读取其他账号邮箱；公开展示继续使用不含邮箱的 public_profiles。
- 自我复核修正课程文件路径边界：无 owner 的 course-games 路径以课程 UUID 开头，不应当成用户 UUID。
- 部署包与源迁移逐字匹配，四步部署已经在一次性 PostgreSQL 实际执行；迁移登记、拒绝重跑与只读校验通过。
- 新增真实本地 GoTrue / PostgREST / JWT / Supabase SDK / React 验收，五种账号真实登录；低权限删除拒绝、角色切换立即生效、页面删除成功、旧访问与刷新令牌失效、成功审计均通过。
- Task 5 的 `task5-live-*.png` 使用真实本地 Auth 和数据库，账号内容仍为合成测试数据；生产 Deno 网关与邀请邮件送达未测试。
- 人工审核及部署顺序见 `HANDOFF_ZH.md`。本轮只在 test-work 本地提交，不 push，不部署生产。
