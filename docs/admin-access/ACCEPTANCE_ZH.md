# 管理员权限本地验收

下文记录最初实现阶段的本地验收，当时未操作生产。随后同日已获用户确认并完成生产修复，当前状态见 [生产修复记录](REPAIR_2026-10-24_ZH.md)。用户已实测 Admin 入口恢复；生产邮件送达、真实账号永久删除仍未做。

| 要求 | 证据 |
|---|---|
| 四类管理员按模块隔离 | 实际 PostgreSQL 角色矩阵、RLS/RPC/Storage 检查；真实 Auth 页面菜单截图 |
| Full 不管理 Users；Course/Question 不管理 Team | 写入/读取拒绝、独立菜单与无权模块不请求；其他账号私有资料读取为 0 |
| Instructor 停用，账号保留 | 旧角色迁为 Student；旧角色重授被触发器拒绝；旧课程所有者不能读/改草稿 |
| Super 删除其他用户 | 实际 React → 相同服务 handler → GoTrue → PostgreSQL 删除链路 |
| 不删自己/Super，不丢公共内容 | 自身/保护账号拒绝；课程、题目作者、文件阻塞；公共内容外键 RESTRICT |
| 过期确认/撤权/关联变化 | 对应数据库拒绝；失败事务无成功审计，用户与内容保留 |
| 删除后旧会话无效 | 真实 Auth user/sessions 清理；旧 access token 与 refresh token 均拒绝 |
| 操作记录 | 成功删除与一条成功审计同事务；接口失败分支清理确认并记录失败 |
| 可复核发布 | 四个独立事务文件、源代码一致性、迁移登记、重跑拒绝和只读检查 |

已通过：题库单元回归 91，学生练习单元回归 21，课程单元回归 7，新增权限/删除接口单元测试 6；合计 125 项。
数据库权限检查 11 组、删除检查 7 组、真实 Auth 完整链路、课程浏览器回归通过。TypeScript 与构建通过。
局部 ESLint 无错误，保留两条既有警告：AuthContext 的 Fast Refresh 导出方式、UserManagement 的 effect 依赖。

详细输出：`task2-database-results.txt`、`task4-database-results.txt`、`task5-live-results.txt`。截图位于 `screenshots/`。
生产发布、生产 Deno 网关与邀请邮件实际送达仍需按 HANDOFF_ZH.md 审核；本地成功不代表线上已更新。

现有学生练习 / Review / Profile / 自适应的真实 Auth、数据库与浏览器回归也全部完成，包含跨标签 A/B 切换、晚到权限响应、登出清理和移动端。测试中的权限请求识别改为 JWT 用户 ID，空题库文案对齐当前页面，没有修改对应学生业务逻辑。
