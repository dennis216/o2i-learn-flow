# 课程内容维护与发布

## 当前交付边界

已实现 Course → Unit → Topic 的真实内容维护、YouTube URL、正式题库练习、单文件 HTML 游戏、Draft/Published、按课懒加载和旧入口跳转。讲义、游戏成绩、视频文件上传不在第一版。

真实样板尚未完成：需要内容团队提供 BC Unit 1 的 2–3 个 Topic、正式 YouTube URL 和对应 HTML。所有自动化测试使用隔离本地服务与明确标注的测试内容，没有向生产库导入假课或假题。

## 后台操作

1. 使用 Content Admin 或 Super Admin 登录，进入 Admin → Course Content。
2. 选择 Course，核对 AP practice scope，再选择 Unit / Topic。AB 排除 BC-only Topic；BC 包含两者。
3. Add YouTube video 填写标题、HTTPS YouTube URL；多个视频按列表顺序展示。Link existing course video 可复用本课程视频，避免复制文件或逐题绑定。
4. 编辑共享视频前核对提示中的其他 Topic；保存会同时更新这些课中的视频标题和 URL。Remove from this lesson 只移除当前关联。
5. 可选上传一个自包含 `.html` 游戏（1 byte–5 MiB）。CSS、JS、图片、音频必须内嵌。外部脚本、请求、iframe、表单提交和主站存储不开放。游戏由团队审核，不自动记录分数。
6. Preview lesson 检查未保存的配置。默认 Draft；勾选 Published 后 Save lesson。发布至少需要一个有效视频，游戏可选。
7. 整门 Course 也必须处于 Published，学生才能访问。课设为 Draft 后保留规范标题，但不能展开、不显示“未开放”。
8. 已发布课保存修改后立即生效；需要撤下时先取消 Published 并保存。已在浏览器中加载的内容不会被远程清除。

上传和保存是两步。上传成功但尚未保存的文件不对学生开放。保存失败保留编辑状态，可核对后重试；旧文件不会被删除。替换后不再引用的私有文件保留供管理员核对，本版不运行自动垃圾清理。

## 学生路径

- 打开课程只加载目录，点击已发布 Topic 才加载视频配置和播放器；不自动播放。
- 同时只展开一课。关闭或切换会卸载播放器和游戏。
- 对应课程范围有已发布真实题目时显示 Go to Practice；没有题目就不显示，不拿其他 Topic 或样题代替。
- 游戏点击 Start game 才下载和运行；Close game 即卸载。
- 练习保存服务器判分和账户作答；登录后及“再练一组”保留课程范围，可返回原 Topic。
- Learn/Lesson 旧原型已退出。旧视频链接通过已发布关联定位，找不到则回课程或 Practice 目录。

## 生产部署

本轮未执行生产部署。不要执行历史课程目录迁移或整个数据库 push；旧目录迁移含视频删除语句。

1. 在生产数据库执行 `production/00_preflight_readonly.sql`。所有门槛须为 true。特别要求 adaptation-v2 的已部署 ledger 和所复用函数正文与现有迁移源完全一致；不满足时先核对其独立部署包，不能在本阶段静默升级。
2. 检查工作区和待发布提交，只发布本阶段变更，注意开始前已有的无关提交。
3. 执行 `production/10_deploy.sql`：一次事务安装 4 个新迁移并记录 ledger；任何错误整体回滚，禁止重复执行。
4. 执行 `production/20_verify_readonly.sql`，要求 `all_checks_pass=true`，再发布前端。
5. 由后台录入真实内容，先 Draft 预览，再发布。执行 `production/30_pilot_inventory_readonly.sql` 核对 Unit 1 真实内容数量；SQL 不能替代教学审核和播放器体验验收。
6. 用 Content Admin 和真实普通账户在桌面、手机、平板验证：发布、观看、游戏、练习、刷新、返回课程、修改立即生效和撤回 Draft。
7. 如有问题，先将样板课设回 Draft。保留题目、作答和历史会话，不运行破坏性回退。

## 本地验证

- `npm run test:courses`：视频 URL、HTML 文件边界和隔离策略。
- `npm run test:courses:db`：临时 Docker PostgreSQL，课程与游戏 RLS、真实练习 SQL、精确部署包、重放拒绝；结束清理容器。
- `npm run test:courses:browser`：本地浏览器 UI/网络模拟测试；不代表真实数据库或生产验收。
- `O2I_COURSE_INTEGRATION=1 npm run test:student-practice:integration`：临时 Auth、REST、数据库和真实页面的组合验收。设置 `O2I_PLAYWRIGHT_MODULE` 指向现有 Playwright；不安装新依赖。
- `npx tsc -p tsconfig.app.json --noEmit`、`npm run build`。

测试截图目录：`node_modules/.cache/course-browser/` 与 `node_modules/.cache/student-practice/`。交付截图复制到 `screenshots/`；它们是本地验证画面，YouTube 预览与游戏测试内容不代表正式教学素材。
