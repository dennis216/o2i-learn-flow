# 学生真实练习生产修复记录（2026-10-19，America/Los_Angeles）

**当前结论：缺失 RPC 故障已修复；真实学生账号的取题、判分、解析、刷新回读及 A → B → A 换号验收均已通过。**

## 故障与实际修复

学生页面出现 `Could not find the function public.list_question_practice_topics without parameters in the schema cache`。生产只读预检查证明学生练习迁移、三张练习表及 start RPC 均不存在。原因是前端已调用新接口，生产数据库尚未安装接口；与学生账号缺少管理员权限无关。

在 `lxoaeaewcrshjkigzyqe` / main PRODUCTION 的 Dashboard SQL Editor 依次执行已有完整事务包；每步独立核验通过后再继续。没有更改应用代码，没有重复添加迁移，也没有重跑其他历史迁移或整库 db push。

| 阶段 | 最终账本状态 | 独立核验 |
| --- | --- | --- |
| 简化发布 `20261020000000` | matches，原指纹 `af640c18c5f8814caa56a5d8edcf47fc` | 部署前目录 19 项与账本检查已通过；此次未重跑部署 |
| 学生基础 `20261021000000` | matches，指纹 `bc92e36429c448b7d1523432f1250115` | 11/11，`all_checks_pass=true` |
| 随机取题 `20261023000000` | matches，指纹 `463ff7e63c60ebf1b79a3ca34a9ebdc1` | 4/4，`all_checks_pass=true` |
| Topic 自适应 `20261024000000` | 未部署，`adaptive_present=false` | 不属于本次部署范围 |

最终三张练习表均存在，start RPC 存在。已部署结构要求本人读取、禁止客户端直接写入判分记录；公开 RPC 仅限 authenticated，内部辅助函数不向客户端开放。

代码基线为已合并 PR #12 的 main `cbcc757`。本轮实际生产入口脚本为 `assets/index-DKXhS5Hk.js`；未取得托管平台对该产物的确切 Git SHA，不以 main HEAD 冒充实际部署 SHA。本地同基线 build 的入口为 `index-BysYC8IB.js`，因此这里只记录线上实际行为和产物标识。

## 首批真实题

已有 8 道真实题已发布，无需重新导入或发布。只读核对确认：8/8 当前版本 approved、8/8 存在与当前内容指纹匹配的审核记录、8/8 记录了审核人。Topic 1.5 两题、1.6 四题、1.15 两题。

本轮未代替人工重新审核来源或数学结论，未填写审核人，未修改题目状态。精确 question_id / version_id / Topic 清单保存在本地证据 `published-manifest.json`；审核人的身份保留在原生产审核记录中，报告不复制账户标识。

## 生产验收证据

| 检查 | 实际证据与结果 |
| --- | --- |
| 普通账号 A | 使用用户实际登录的学生账号；数据库以该会话所属 UID 的 authenticated 角色核对，admin=false、super_admin=false |
| 首页与真实取题 | 显示 8 题、3 个 Topic；Topic 1.5 按实际题池返回 2 题，无示例替代 |
| 提交前保护 | 在账号 A 的实际生产角色下调用同一个 get RPC：2 题均未作答，无答案/解析/is_correct/导入证据；选项仅 id/key/text；原始 versions/options 可见行数均为 0。这是生产数据库 RPC 投影核验，不是浏览器 HTTP 抓包 |
| 服务端判分和解析 | 真实两题分别选择正确、错误选项；显示 Correct/Incorrect 与 Saved to your account，并显示正确答案和解析；另一个已发全库会话补查错误选择，同样保存并显示解析，覆盖不同会话的对错判分 |
| 刷新与历史 | 刷新原会话仍为 1/2 correct，两条 Saved 结果；Practice 最近作答均可进入原会话 |
| 重试与覆盖保护 | 对 A 已保存答案在回滚事务中执行同选项两次重试，记录不新增；不同选项触发 23505，原答案不变；会话仍只有 2 条作答，1 对 1 错 |
| 随机与小池回退 | A 已见 Topic 1.5 两题后，全库下一组 5/5 未发题；再下一组 1 道未发题加旧题补足；两组均 5 个不同题 |
| 刷新不重抽 | 浏览器刷新第二个全库会话后，生产已发 question/version/position 指纹与刷新前完全相同 |
| 桌面/手机 | 1280×960、390×844 实际页面无横向溢出，KaTeX 错误数均 0；截图留存；此次题目没有必要图片标记 |
| 退出清除 | A 通过 UI 退出后，直接访问其已完成会话 URL 只显示登录入口，无题目及作答 |
| B 读取 A 的旧链接与接口 | 两个会话所属账户确实不同；B 为普通角色（admin=false、super_admin=false）。浏览器访问 A 的旧链接明确拒绝且不显示题目/结果；以真实 B UID 的 authenticated 角色核对，A 的 sessions/items/attempts 可见行数均 0，get 与 submit RPC 均拒绝（42501）。B 可读取自己的 1 个会话、2 道已发题，最近作答为 0，与首页一致 |
| A → B → A 恢复 | A 重新登录后直接打开原会话，仍显示 1/2 correct、两条 Saved 结果和解析；A 访问 B 的会话也被拒绝。A 角色下 B 的 sessions/items/attempts 可见行数均为 0；A 首页恢复本人历史，新增跨会话测试后共 3 条，与数据库一致 |

账号 A 原会话保留 2 条真实作答（1 对 1 错），另一个全库会话增加 1 条错误作答，共 3 条；剩余全库会话仅发题未提交，B 独立创建的 1 组 2 题也未提交。重复提交检查在事务结束回滚，不删除或重置真实记录。

## 本地检查与限制

本次 latest-main 基线重新执行 `npm run test:student-practice`：5/5；`npm run build`：通过。其余隔离 Auth/REST/故障恢复测试的历史结果及最近一次 Docker API 500 见 [VALIDATION.md](VALIDATION.md)，不能充当本次生产实测。

本次未向生产注入断网、服务中断或丢响应；故障恢复证据来自既有隔离测试。尚未取得生产前端确切 Git SHA。自适应仍待后续独立迁移和验收。

## 证据位置与提交边界

原始只读 JSON、截图和会话标识保存在主工作区 Git 忽略目录 `outputs/student-practice-production.local/`，不提交真实题文本、答案、账户标识、会话 URL 或凭据。

本次修复的持久化交付是上线记录与运行说明；实际数据库变更来自仓库已有部署包。两名真实普通账号的隔离与恢复已完成；提交范围仅包括这些记录，不含应用代码、题目内容、原始截图或无关并行变更。
