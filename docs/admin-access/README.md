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
