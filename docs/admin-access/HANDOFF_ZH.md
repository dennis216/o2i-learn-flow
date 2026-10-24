# 管理员权限：交接与人工审核

本轮交付是本地代码、独立 commits、可重复验收与部署材料。没有 push、没有生产部署、没有修改或删除真实账号。

## 发布顺序

1. 合并本轮 commits 与你正在整理的其他工作。不要用 `git add .` 把并行文件混入。
2. 在生产只读执行 `production/00_preflight_readonly.sql`；六个前置条件必须为 true。保存原角色名单和课程/题目/版本/审核/文件数量。核对 Instructor 账号，避免把仍有课程职责的人误当学生交接。
3. 按顺序分别执行 `10_roles.sql`、`20_permissions.sql`、`30_deletion.sql`、`40_account_data.sql`。每个文件独立执行完成；枚举新增必须先提交，不能把四个文件合成一个事务。
4. 部署更新的 `admin-invite-user` 和新增 `admin-delete-user` Edge Functions；保留 JWT 验证。服务密钥只在服务端环境，不能写入浏览器配置。
5. 发布前端，然后执行 `50_verify_readonly.sql`。确认四条迁移各有一份源 SQL、保护项全部 true；与发布前比较内容数量。Instructor 角色撤去是预期变化，公共内容数量不应减少。
6. 用以下真实账号检查。所有条件通过后，才把新角色分配给交接人员。

不做全库 `db push`，不重放旧课程种子迁移，不自动删除历史内容。部署文件遇到已注册版本会停止，不能通过删除迁移记录强行重跑。

## 人工审核清单

准备一个 Super Admin、一个 Full Admin、一个 Course Admin、一个 Question Admin，以及一个没有公共内容/文件关联的可丢弃 Student 测试账号。实际登录不同浏览器或独立窗口，不能只在同一页面看标签。

| 账号 | 后台应出现 | 后台不应出现 |
|---|---|---|
| Super Admin | Courses、Question Bank、Playground、Team、Users | 无 |
| Full Admin | Courses、Question Bank、Playground、Team | Users |
| Course Admin | Courses、Playground；默认 Courses | Question Bank、Team、Users |
| Question Admin | Question Bank、Playground；默认 Question Bank | Courses、Team、Users |
| Student / 已退役 Instructor | 不可进入 /admin | 所有管理模块 |

1. **正常操作**：Course Admin 保存一个课程草稿；Question Admin 保存一个有真实来源、待审核的题目草稿；四类管理员分别保存一个测试 Playground 项目。Full Admin 可以维护 Team；内容发布仍遵守原审核门槛。
2. **越权**：使用浏览器 Network 的相同请求，以低权限账号会话重试课程、题库、Team、角色设置接口。无权请求应返回权限错误，或 UPDATE/DELETE 影响 0 行；必须刷新/读回确认没有变化，不能仅看 HTTP 200。学生端公开课程和普通练习照常可用。
3. **账号资料**：普通管理员不能读取其他账号的完整 profiles/邮箱或批量角色；自身 Profile 正常，公开团队/作者姓名显示正常。
4. **角色变更**：Super Admin 在 Users 把测试 Student 改为 Course Admin，再改为 Question Admin，最后改回 Student。刷新后默认入口/菜单对应变化；旧页面继续提交也不能越权。只保留新身份，不叠加旧权限。邀请选项仅 Student、Full Admin、Course Admin、Question Admin。
5. **保护账号**：自己的 Super Admin 行没有删除和改角色操作；普通管理员不能调用删除接口。邮箱确认功能仍由 Super Admin 使用。
6. **阻塞删除**：找一个已有关联课程或题目/审核记录的账号，只打开删除预览；看到明确关联数量，Delete permanently 禁用。不要为测试而删除真实素材，也不要改写作者/审核者记录。
7. **真正删除**：用可丢弃 Student 登录，保留该窗口；Super Admin 打开删除预览，确认只有个人数据。错误邮箱不能提交，取消不影响账号。输入正确邮箱并删除后，用户行消失；刷新列表仍不存在；旧账号刷新/重新登录失败。检查删除审计记录，并确认原课程和题库内容未减少。
8. **失败处理**：在测试环境模拟接口失败；页面显示错误、目标账号仍在，不出现删除成功提示。恢复后重新预览并重试。

邮箱邀请的实际送达、生产 Edge 网关、真实设备显示，必须在发布后验证。永久删除关联内容较多的账号会被阻止；需要先处理归属，题目作者/审核证据不可通过此入口重写。

## 本地复验命令

```sh
node --experimental-strip-types --test src/lib/adminAccess.test.mjs scripts/admin-access/deletion-handler.test.mjs
npm run test:question-bank
npm run test:student-practice
npm run test:courses
O2I_ADMIN_DELETION_BROWSER=1 node scripts/admin-access/browser.test.mjs
node scripts/admin-access/build-deploy.mjs
O2I_ADMIN_DELETION_DB=1 O2I_ADMIN_LIVE_AUTH=1 O2I_ADMIN_RELEASE_PACKAGE=1 node --experimental-strip-types scripts/admin-access/database.test.mjs
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

数据库测试使用本地缓存镜像和一次性容器。真实 Auth 模式只在本机回环端口 55996/55997/55999 和 5198 工作，创建并删除合成账号，完成后销毁容器。它调用与 Edge Function 相同的 handler，通过真实 GoTrue、PostgREST、JWT 和数据库完成操作；不等于生产 Deno 网关已验收。

当前可先审每个任务的截图、独立 commit 和部署 SQL；未发布的生产后台不会出现新角色。完整功能人工审核必须同时具备对应数据库迁移、Edge Functions 和前端，不能只更新前端。集成测试结束会销毁本地合成账号，不保留可登录的测试服务。

测试维护：一次性 Supabase PostgreSQL 必须等完整初始化结束后再建业务表，仅检查端口或 pg_isready 会遇到初始化竞态。新权限 RPC 不传用户 ID，账号切换延迟响应测试应按请求 JWT 的 sub 识别账号，不能依赖某一次 access token 字符串。
