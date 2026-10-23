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

## Task 4 视频管理

- 完整视频管理收进 Course Content，保留 subtitle、transcript、exam tips、PDF 与新增元数据入口。
- 列表支持本课程使用/拥有、全部课程、未被保存课节引用三种范围，并可搜索。
- 显示共享影响范围；仍被任一保存内容引用的视频禁止删除，服务端同样约束。
- 元数据保存增加 revision 冲突检查；视频任何字段变化同步推进引用内容的 revision。
- transcript 编辑保留原始文本，非法 JSON 不会被静默丢弃，保存前及服务端各自验证。
- 本地浏览器通过：迁移后的入口、共享影响、无效 JSON 保留并阻止保存、元数据读回、删除保护、筛选搜索。
- 截图：[视频库](screenshots/task4-video-library.png)、[视频元数据编辑](screenshots/task4-video-metadata.png)，本地模拟数据。
- 测试基础设施修正：Supabase PostgreSQL 镜像初始化期间临时 Unix socket 就绪不代表最终实例就绪；等待 TCP 连接后再执行测试，避免初始化重启的偶发断连。
- 隔离数据库回归通过，新增视频库权限、输入边界、元数据版本冲突、内容版本失效及引用保护检查通过；类型检查通过。

## Task 5 学生端大纲与练习往返

- 保持 Course → Unit 折叠大纲和原有视觉结构；课节显示自定义标题，合并后的 CB Topics 作为一行标签，未准备的 Topic 仍占位。
- 展开课节后按原有方式加载视频与游戏；一节课覆盖多个 Topic 时，练习按钮仍分别进入各自规范 Topic 的题库。
- 练习路由仅接受同时带有课程和规范 Topic 的有效课节 ID；返回课程时核对课节仍属于该课程及 Topic，失效时退回规范 Topic 链接。
- 旧 Topic 和视频入口继续解析到已发布课节；管理员可在学生大纲中直接打开同一个课节编辑器。
- 本地浏览器通过：桌面及手机大纲、合并课单行、未准备 Topic、视频延迟加载、两种 Topic 各自提交及返回、旧链接；类型检查、相关文件 lint、学生 Practice 测试 21/21 通过。
- 截图：[学生端桌面](screenshots/task5-student-desktop.png)、[学生端手机](screenshots/task5-student-mobile.png)，均使用本地模拟课程及视频。

## Task 6 回归与交付包

- `test:courses:browser` 已切到新课程大纲流程，覆盖后台入口、合并/拆分、视频管理、学生桌面/手机、两种 CB Topic 的练习往返、旧链接和 HTML 游戏隔离；旧下拉框测试不再作为现行入口。
- AI Tutor 隐藏测试改走 Courses → Course Content → Manage videos；访客、学生、教师、管理员和超级管理员的桌面/手机回归通过。
- 生成 [受控生产发布包](production/README.md)：精确校验前置共享课节迁移及函数，四个新迁移在同一事务执行，后置 26 项只读校验并对比课程/课节/绑定/视频数量。
- 隔离 PostgreSQL 实际执行该包通过；重复部署被拒绝。旧课程/游戏/练习/共享内容、新大纲、建课及视频库数据库回归通过。
- `npm run build`、`npx tsc -p tsconfig.app.json --noEmit`、`npm run test:courses` 与本 Task 相关文件 lint 通过；删除课程确认文案已改为说明关联内容可能阻止删除，建议取消发布。
- [Task 6 截图](screenshots/task6-regression.png)：本地模拟数据，显示合并课两种独立 Topic 练习；不是线上账号验收。
