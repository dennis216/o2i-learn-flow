# 自定义课程管理执行记录

## 范围与交付规则

按已确认的 Task 0–7 执行；每个 Task 独立 commit、结果汇报和截图。截图必须注明本地模拟或真实线上。禁止将本地验证称为生产验收。保持学生端卡片、Unit、折叠和内容布局；自定义课名、多 Topic 合并以课程内大纲条目实现。

## Task 0 基线

- 分支：`test-work`；起点：`4eae761`。
- 当前已有题库修改、`docs/PROJECT_BACKLOG_ZH.md`、`outputs/` 等未跟踪工作，不属于本任务，不修改、不暂存。
- 现有结构：`course_lessons` 存储共享内容，`course_lesson_courses` 以 `(course_id,topic_id)` 为主键；不能直接表达一 Topic 多课节。新增课程内大纲条目复用原内容存储。
- 现有学生端保留纵向 Unit/Topic 折叠；课程页已经复用后台内容编辑器。
- 现有独立视频管理含 transcript/subtitle 等能力，移动入口必须保留这些功能。
- `npm run test:courses`：6/6 通过。
- 本轮匿名生产只读请求：DNS `ENOTFOUND`，未读取或修改生产数据；既有部署记录不视为本轮验证。
- 本轮本地浏览器基线通过：保存、刷新找回、共享确认及课程页编辑防丢失；测试使用模拟网络数据，不是线上账号验收。
- 截图：[原后台 dropdown 操作基线](screenshots/task0-admin-baseline.png)。

## 任务依赖

0 基线 → 1 数据与接口 → 2 Courses 入口 → 3 大纲编辑 → 4 视频管理 → 5 学生端与往返 → 6 回归交付 → 7 生产部署及真实账号验收。

Task 7 需要另行确认远程推送和生产部署；本轮实施授权不包含该操作。

## Task 1 数据与接口

- 新增课程内大纲条目、同 Unit 多 Topic 映射、课程级 revision 和原内容引用；迁移逐项保留现有大纲。
- 提供大纲读取、课节读取/保存、原子合并/拆分/排序、归档恢复和明确内容共享/独立副本接口。
- 旧 Topic/视频入口可解析新课节；旧管理写入被定制课程门槛保护。
- 保留现有素材、游戏私有桶、规范 Topic 与练习会话；所有新写入由服务端管理员权限和版本约束。
- `O2I_COURSE_OUTLINE_DB=1 npm run test:courses:db`：通过，含原课程/游戏/练习/共享回归及 14 类新大纲检查。
- `npx tsc -p tsconfig.app.json --noEmit`：通过；`npm run test:courses`：7/7。
- [Task 1 截图](screenshots/task1-database.png)：真实隔离数据库测试报告，不是产品界面或生产验收。

## Task 2 统一 Courses 入口

- Courses 成为后台默认入口；Create Course、Subjects、Manage Videos 改为课程管理内入口，原视频元数据编辑仍可访问。
- 点击课程名或 Manage content，直接带入课程上下文；已编辑内容离开前确认。
- 新建课程通过管理 RPC 原子创建，AB/BC 模板初始化大纲及练习范围；普通课程明确保留无模板状态。
- 本地浏览器：课程入口、一级 tab 收敛、创建模板参数及创建后直达内容通过。
- 类型检查通过；Admin 既有 lint 问题仍保留，按规则计数与基线比较，不扩大为无关清理。
- 截图：[课程列表](screenshots/task2-courses.png)、[创建课程](screenshots/task2-create-course.png)，均为本地模拟数据。
- 隔离数据库创建测试通过：权限、学科存在性、价格边界、模板限制、完整大纲及默认草稿；首次夹具缺少真实表 UUID 默认值已修正，重跑通过。

## Task 3 大纲式课节编辑

- 直接展示 Unit/课节，支持点击编辑、自定义课名、同 Unit CB Topic 多选、上移/下移、新建课节、选择合并内容及预览视频/游戏。
- 合并默认草稿，原内容及原条目保留可恢复；允许明确保留选中内容的发布状态。拆分/移除恢复未覆盖 Topic。
- 内容编辑复用原编辑器，新增按稳定课节 ID 的保存/共享/独立草稿路径；课名和映射保持课程独立。
- 大纲与内容版本冲突拒绝覆盖；未保存离开、浏览器返回、关闭编辑器均有保护。
- 新内容保存后锁定旧 Topic 编辑入口，避免旧客户端覆盖新内容引用。
- 本地浏览器通过：合并预览、自定义标题/两 Topic 一行、内容草稿保存、关闭取消保留编辑、拆分补回 Topic；类型检查及本 Task 修改组件 lint 通过。
- 截图：[合并预览](screenshots/task3-merge-preview.png)、[合并后大纲](screenshots/task3-outline.png)，本地模拟数据。
