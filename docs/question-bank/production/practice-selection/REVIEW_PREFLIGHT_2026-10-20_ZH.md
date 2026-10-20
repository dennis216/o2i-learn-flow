# 8157ab6 上线前核验与生产现状

## 生产修复完成（2026-10-20）

用户明确授权“允许执行 Review 增量迁移并验收”后，已修复 Only incorrect 上线故障。**本次修复范围验收通过。** 下方快速验收失败及上线前记录是历史状态。

1. 执行前重新只读核验：`base_matches=true`、`review_ledger=null`、`boolean_function=null`，证明基础指纹匹配且 Review 迁移与 boolean RPC 确实缺失。
2. 在 `lxoaeaewcrshjkigzyqe` / main PRODUCTION 执行现有 `30_review_deploy.sql` 完整事务一次，返回 `Success. No rows returned`。未重放历史迁移，未执行整库 db push。
3. 部署事务已发送 `NOTIFY pgrst,'reload schema'`。独立执行 `31_review_verify.sql`，6/6 检查通过、`all_checks_pass=true`：账本指纹匹配、两个 RPC 均 authenticated-only、sessions/attempts 禁止学生直接写入、snapshot 辅助函数私有。
4. 正式站真实已登录账户实测：普通历史 8 条；Only incorrect 返回 6 条，全部 Incorrect、无 Correct、无 alert。该实际参数调用成功证明 REST schema cache 已能识别新增 RPC。
5. 从错题列表进入指定保存题，准确显示原会话第 4/5 题、原错误选择、正确答案和 Solution；刷新仍为相同题与已保存结果。Back to Review 后再次筛选仍返回 6 条错题。

本次只部署 Review RPC 与账本，不修改题目、选项或学生作答，不改前端。未重复跑本地测试，未重测第二账号、手机或 Admin 写入；本账户仅 8 条历史，本次未构造“最新十次以外的错题”生产数据，其算法覆盖保留在既有隔离测试中。

修复截图：`outputs/review-production.local/review-incorrect-fixed.jpg`。后续按用户要求补拍三张正式站体验截图：`01-all-answers.jpg`（全部作答）、`02-only-incorrect.jpg`（只看错题）、`03-saved-solution.jpg`（原选择、正确答案及数学解析），均位于同一本地证据目录，不提交真实题目截图。

本次 Git 提交仅包含本验收记录，不包含并行 Profile、AuthContext、学生接口或测试改动；不 push。实际修复是部署仓库已有的增量 SQL，没有新增应用代码。

## 上线后快速验收补记（2026-10-20）

用户通知已部署，并要求快速验收。本次实际正式站检查结论：**新版前端已生效，但快速验收未通过，错题筛选接口尚不可用。** 下文上线前记录保留为历史状态。

- 通过：登录后新版 Review 加载本人 8 条作答，显示 Topic、对错、时间和指定题目解析链接。
- 通过：进入一条错题链接准确打开原会话第 4/5 题，显示已保存的错误选择、正确答案与 Solution；选项禁用。
- 通过：刷新仍停在同一题，保存结果及解析保持；Back to Review 返回 8 条账户历史。
- 阻塞：点击 Only incorrect 后提示 `Could not find the function public.list_question_practice_attempts(_incorrect_only) in the schema cache`，无法显示错题列表。可能是迁移未部署，或部署后接口缓存未生效；本次未查询数据库区分两者。

处理：先核对 Review 迁移账本；未部署则执行 `30_review_deploy.sql` 一次，已部署则不要重放，检查函数定义及 PostgREST schema cache。执行 `31_review_verify.sql` 并要求 `all_checks_pass=true`，然后重试线上错题筛选。

本次按快速验收范围未重跑本地测试，未执行生产 SQL，未新增作答，未测试第二账号、手机或 Admin 写操作。此次完成的是上线核查并报告阻塞，不代表功能生产验收通过。

核验日期：2026-10-20（America/Los_Angeles）。代码：`8157ab6467319f5c1715483aa58fe50b138d263f`。生产项目：`lxoaeaewcrshjkigzyqe`，main PRODUCTION；网站：https://www.o2iinstitute.org。

## 结论

本轮代码及隔离验收通过，未发现阻塞上线的问题。用户明确本次提交尚未 push，因此当前结论是**具备上线条件，生产验收待发布后完成**。线上旧 Review 与新迁移缺失是当前部署状态，不是新提交的运行缺陷。

本轮没有 push、发布前端、执行生产迁移、提交新作答、改变题目审核或发布状态。生产 SQL 仅查询迁移账本、函数定义、权限和题量；SQL Editor 可能自动保存查询草稿。

## 本轮重新执行的检查

| 检查 | 结果 |
| --- | --- |
| `npm run test:student-practice` | 7/7 通过 |
| `npm run test:student-practice:integration` | 22/22 通过；临时本地容器已清理 |
| `npm run build` | 通过 |
| `npx tsc --noEmit -p tsconfig.app.json` | 通过 |
| 相关 4 个 TS/TSX 文件 ESLint | 通过 |
| `git diff --check` | 通过 |
| Review 部署包与迁移源文件逐字匹配 | 通过；验证 SQL 包含源文件 MD5 `dbb06ac25eebc2319a3543505c1dff36` |

隔离集成实际使用本地 PostgreSQL、Auth、REST 和浏览器，覆盖：先筛错题再取最近十条、时间并列排序、旧无参数调用、原题版本解析、未完成会话、非法及未作答链接、失败/重试/空状态、过期响应、跨标签页换账号、退出、外账号链接拒绝、390px 布局。题目与账号均为隔离测试数据，不代表生产真实账号验收。结果保存在被 Git 忽略的 `node_modules/.cache/student-practice/results.json`。

## 生产只读证据

| 项目 | 当前状态 |
| --- | --- |
| 基础练习迁移 `20261021000000` | 存在，MD5 `bc92e36429c448b7d1523432f1250115`，匹配部署包前置门槛 |
| 随机取题迁移 `20261023000000` | 存在，MD5 `463ff7e63c60ebf1b79a3ca34a9ebdc1` |
| Topic 自适应迁移 `20261024000000` | 账本中不存在 |
| Review 迁移 `20261025000000` | 账本中不存在 |
| 历史 RPC | 只有无参数版本；本人 UID 筛选、最近十条；authenticated 可执行，anon 不可执行 |
| 带 boolean 参数的历史 RPC | 不存在；目前无法提供新 Review 的全历史错题筛选 |
| authenticated 直接 INSERT/UPDATE/DELETE 作答记录 | 无权限 |
| 已发布学生单选题 | 8 道：Topic 1.5 两题、1.6 四题、1.15 两题；问题及当前版本均 approved |

生产浏览器使用已有登录账号确认：Practice 显示三个 Topic、对应题量和本人八条最近作答；进入已有已完成会话可见 `1/5 correct`、五条已保存结果与解析。未提交或修改该会话。访问 `/admin` 被重定向到首页。已登录 `/review` 仍为旧 Review cards / Saved moments 页面。

本轮没有取得生产 Admin 登录界面，也未重复证明生产 A/B 双账号隔离；不能把本地双账号检查代替生产检查。没有取得生产前端确切 Git SHA。

## 学生和 Admin 使用范围

学生现在可登录后在 `/practice` 按已发布 Topic 或全库练习，每组最多五道；服务器保存及判分，提交后查看解析，从 Practice 最近作答回到原会话。小题池会重复；目前不能把旧 `/review` 当作账户错题本。新版上线后，Review 才提供最近十次提交、最近十道错题与指定题目保存解析入口。

按当前代码及部署说明，Admin 的题库流程为 `/admin` → Question Bank → 导入 XLSX → 预览并调整元数据 → Save drafts → 人工检查保存版本 → Publish 单题或批量发布。保存草稿不会直接让学生取到；旧 Practice 管理页属于旧题库链路，应使用 Question Bank 供应新学生练习。题库支持修改为未发布修订、撤回、再发布和归档；人工负责题目来源和数学审核。Admin 另有课程、视频、学科、Playground 和 Team 管理入口，用户管理只对 super_admin 展示；这些管理操作不属于本轮写入验收范围。

项目当前是可供少量学生试用的真实练习闭环。题库仅覆盖三个 Topic；自适应已在代码及隔离测试中实现，尚未部署。Lesson 的学习笔记等仍使用浏览器 localStorage，不能视为已经接入账户历史或新 Review。

## 发布与最终生产验收顺序

1. 先在生产执行一次 [30_review_deploy.sql](30_review_deploy.sql)。它只要求已核实的基础练习迁移，不要求自适应；不重放历史迁移、不整库 db push。
2. 执行 [31_review_verify.sql](31_review_verify.sql)，必须 `all_checks_pass=true`。
3. Push 并让实际托管项目同步、发布包含 8157ab6 的前端。Push 本身不证明正式站产物已更新。
4. 使用两名真实学生账号，核对最近提交、最新十条之外的错题、未完成会话的指定题解析、刷新、退出、换号和他人链接拒绝；核对手机布局。
5. 取得上述生产证据后，才能给出“8157ab6 生产验收通过”。当前此门槛未完成。

工作区原有题库工作流文档、模板和未跟踪文件保持原样。本次仅新增此核验记录，未创建 commit。
