# Task 4D：管理员题库管理页面

## 页面与安全边界

Admin 的 **Question Bank** 使用固定顺序：Import XLSX → Saved drafts → Published problems。

- 导入仍复用原解析器、规范数据和字段校验；只有确认保存才调用原事务导入 RPC，始终保存未发布 draft。
- Saved drafts 按题目身份计数、排序和分页。工作修订优先展示；撤回且没有工作修订时展示保留的批准版本，不重复列历史。
- Published problems 只展示当前发布版本。有工作修订时显示 **Unpublished changes**。
- Preview 复用严格 Markdown/LaTeX 渲染，全部选项可见，正确答案绿色标记；解析与来源可展开。
- Edit 仍只有原八项元数据及同一规范选择组件。已发布/撤回题的窗口只读取；确认保存才原子创建并保存工作修订。已有工作版本时明确编辑它，不再创建第二个。
- review 版本不能直接编辑或删除，必须经原受控动作退回 draft。
- 新题 Delete 删除未发布身份及专属记录；Delete draft 只删除工作修订。Unpublish 保留批准版、历史与工作修订；Archive 保留历史，有工作修订时明确拒绝。

没有新增数据库表、迁移、直接表写入、学生取题或判分功能；没有改动旧 Practice 表单、静态 Quiz、自适应与课程模块。

## 发布与人工确认

Publish 打开只读预检查，显示明确题目/版本、来源、内容阻断及需要的人工输入。

1. 核实计算器政策和实际来源使用依据；没有默认许可。
2. 核实印刷题号，或无印刷题号时核实唯一 locator。
3. 数学、分类、来源使用依据和显示四项均须明确确认及说明。XLSX 自称 approved/pending 不会勾选确认。
4. 原 AI flags 不删除；每项保留明确解决说明。修改计算器政策或来源类别会清除浏览器中的四项确认，保留说明供再次核对。
5. 与具体版本仍一致且预检查通过的已有服务端人工确认可以复用。修改后或退回 draft 的旧确认不能复活。

最终确认前，预览、填写、批量填充、撤销、关闭和 Cancel 都不写库。最终确认依次保存明确人工审核记录，再使用 **一个** Task 4C 批量发布 RPC；服务端在行锁下重新核查，任一项失败整批发布回滚。

**审核记录和发布不是同一个事务。** 最终确认后，某些审核记录可能已经保存而后续发布失败；它们作为审计证据保留。页面会说明这一点，刷新实际状态再继续，不自动重试、不声称失败意味着从未写入。

## Publish all 的真实范围

读取所有分页的未发布题目，不拿当前 20 张卡片冒充全部。显示总数、每个明确版本与选择数量；用户可以排除任意题目。

- 服务端上限 20；超过 20 时初始不选任何题，要求明确选择一批。
- 选中项目有阻断时不静默跳过，也不会先发布其他题。
- 批量计算器政策只作用于明确选择的 draft 工作副本，不确认四项审核、不推断来源许可、不解决或删除 flags。
- 最终按钮显示准确的 **Publish N problems**，并再次确认。
- 读取失败、过期、权限拒绝或结果未知均保持错误状态；错误不伪装成空列表或成功。笔记保留，重新加载后内容变化要求重新确认。

## 本地验证与复跑

常规：`npm run test:question-bank`、`npm run test:adaptive`、app/node TypeScript、修改文件定向 ESLint、`npm run build`、`git diff --check`。

数据库：`npm run test:question-bank:db-publication` 和 `npm run test:question-bank:db-drafts` 各自创建独立一次性 PostgreSQL，结束后删除自身容器；不使用现有工作库或生产。

浏览器：`scripts/question-bank/task4d-browser.test.mjs`，用 Node 的 `--experimental-strip-types` 运行。需要本机 Docker 的已缓存官方 PostgreSQL、GoTrue、PostgREST 镜像，以及本机 Playwright/Chrome：

- `O2I_PLAYWRIGHT_MODULE`：本机 Playwright 的模块入口；可省略以使用已安装的 playwright。
- `O2I_CHROME_EXECUTABLE`：可选的本机 Chrome 路径。
- `O2I_SYNTHETIC_XLSX`：明确的合成单题 XLSX（external_id 以 synthetic- 开头），不使用真实题目冒充合成输入。
- `O2I_ACCEPTANCE_XLSX`：可选真实最终 8 题文件，只验收预览、草稿保存/回读、重复拦截和原文件未改变，不编造真实人工发布确认。

脚本启动独立网络、loopback 端口与 tmpfs 数据库，执行实际前置 DDL/规范数据及题库迁移（避开 taxonomy 的删除视频尾部），通过真实 Auth 创建一次性 `.test` 账号并登录，通过真实 REST 调用题库。所有密码和服务密钥只在内存及临时容器中；浏览器只获得本地 anon key。拒绝非本机浏览器请求，不连接生产。

截图和结果写入被 Git 忽略的 `.task4d-browser.local/`；真实文件、账号凭据和测试输出不提交。finally 核对任务标签后精确删除本次容器及网络，临时题目/账号随 tmpfs 数据库一并消失。

## 尚未上线

本地代码/测试和 commit 不等于生产部署。生产仍需另行授权，核对并按依赖补齐 Task 4B draft-management 与 Task 4C 两份迁移；新增 enum 迁移必须先单独提交。不能重跑旧题库上线包或 taxonomy 初始化。

之后单独更新网页，使用真实管理员会话验收。学生 Quiz 尚未接入新题库；Task 4C 原始答案/解析表限制为管理员读取，未来需安全取题及服务端判分接口。

## 本次实际验收记录（2026-10-18）

- 题库自动测试 79/79；自适应回归 8/8；基础迁移历史静态检查 15/15。
- 实际 PostgreSQL：Task 4C 33/33（含 8 个真实行锁竞争场景及官方 pg_prove 的最新 30 条断言）；Task 4B 独立基线 21/21（含历史 128 条 pgTAP）。两个基线不混称为同一 schema。
- 最终真实 Auth/PostgREST/Chrome 验收 26/26：导入、持久化列表、编辑、首版发布、修订、撤回、恢复、两种删除、归档、过期编辑、断网、权限撤销、批量注入故障整体回滚、跨分页完整范围、取消零题库写入、双击防重、普通用户/匿名隔离及窄屏。
- 用户最终 XLSX 实际为 8 题/32 选项，原题号 1–6、8、9。预览、行内/独立公式、绿色答案、草稿保存与数据库完整回读、来源/选项注释/AI flags/审核备注保留、重复导入拦截及文件哈希不变通过。**真实题没有发布，也没有代填来源许可或人工批准**；发布链路仅使用合成题。
- app/node TypeScript、题库相关修改文件的定向 ESLint、build、diff 检查通过。Admin.tsx 仅改入口名称，17 个 lint 错误与 1 个警告和 HEAD 基线的规则及行号一致，未作无关修复。
- 所有测试容器与专用网络已删除，临时账号、角色和题目随独立 tmpfs 数据库销毁；没有重置原工作库、连接生产、改变旧迁移或部署网页。
- 本机截图：`.task4d-browser.local/03a-real-solution-formula.png`、`04-batch-review.png`、`05-narrow.png`、`06-all-pages-scope.png`；结果：`results.json`。全部被 Git 忽略，不作为生产验收记录。
