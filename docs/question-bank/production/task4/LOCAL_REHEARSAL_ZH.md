# Task 4 上线包：实际本地演练

状态：**本地准备/演练通过；没有生产执行记录，也没有生产使用验收。**

## 验证环境和起点

- 仅新建带 `o2i.purpose=task4-release-rehearsal` 标签的独立官方 PostgreSQL 17.11 容器，回环端口 55446，数据目录 tmpfs；不挂载或 reset 现有工作数据库。
- 临时密码仅在进程内存/自己的容器中，不写文件或输出。测试账号、题目均为合成数据，不使用生产用户或真实 XLSX。
- 复用旧上线包演练的最小前置 fixture（仅可信仓库函数/DDL，不运行旧演练 runner），避开 taxonomy 的课程/视频删除尾部；仅在本地构造角色、规范数据和哨兵记录。
- 起点实际执行原 foundation / draft-import，写入对应原 SQL 指纹；账本使用生产已确认的六列、两个约束。已有一题 pending 草稿和选项/技能/证据，三个 Task 4 版本均未应用。

## 命令与结果

```sh
node docs/question-bank/production/task4/build_task4_package.mjs
node docs/question-bank/production/task4/build_task4_package.mjs --check
node --check docs/question-bank/production/task4/build_task4_package.mjs
node --check docs/question-bank/production/task4/rehearse_task4.test.mjs
node --test docs/question-bank/production/task4/rehearse_task4.test.mjs
node docs/question-bank/production/build_release_package.mjs --check
npm run test:question-bank
git diff --check
```

- Task 4 包装演练：16 个子场景通过，Node 含外层合计 **17/17**，无跳过。
- 题库回归：**83/83**。
- 生成一致性：五份 SQL 与生成器输出一致；三份写入文件各逐字包含一份对应原迁移；门禁仍全部默认关闭。
- 旧发布包一致性检查通过，没有改写旧包、原迁移或应用代码。
- 两份脚本 Node 语法检查及 diff 检查通过。未运行前端 TypeScript/build/视觉验收：本任务没有前端/类型变更，也没有宣称线上管理员使用已通过。

## 实际覆盖

1. 生产形态起点与只读状态报告；原迁移逐字保留，目标/风险/证据门禁默认关闭。
2. 目标/风险未确认拒绝写入；未知账本列拒绝，六列/两个约束检查没有取消。
3. 两个真实 PostgreSQL 连接：一方持有题库发布 advisory transaction lock，另一方运行上线包被拒绝；不是 SQL 字符串模拟并发。
4. 第一步故障注入：函数创建与账本插入一起回滚；成功后本版本记账且三个可选审计字段仍为 NULL。
5. 第一步重复被拒绝；缺 enum 迁移账本时第三步不能越序执行。
6. enum + publication 合并在一个真实事务，实际触发 PostgreSQL 的新 enum 值未提交错误；enum 和该记录整体回滚。
7. enum 步骤故障注入，标签自身与账本一起回滚；独立成功提交后可被下一个事务使用，重复执行被拒绝。
8. 前一步账本指纹不匹配、未记账的第三步对象均阻断，不自动覆盖或补成功记录。
9. 第三步故障注入：新对象、授权变更、账本一起回滚；已经提交的第一/二步保留。
10. 三步分开成功后，最终只读目录/权限/八组枚举/函数指纹/关键约束和旧两条 + 新三条账本原 SQL 指纹全部通过。
11. 现有草稿仍为 draft，发布指针仍 NULL；审核/发布历史没有被自动填充。管理员读取及发布预检查可用，未审核项继续阻断发布。
12. 普通/匿名会话看不到草稿或原始答案；不能调用发布写接口。既有账号、角色、课程、视频、旧练习、规范数据、题目/选项/证据及旧账本的快照保持不变；仅排除新加且初值为 0 的两个修订计数列。
13. 所有部署文件重复执行均被拒绝；自己的测试容器结束后已精确删除，账号和数据随 tmpfs 销毁。

演练曾发现并修正包装层问题：旧更新时间函数的 `search_path` 属性位于函数体之后，解析器需同时读取前后属性；带 FROM 的聚合查询必须给输出列明确命名，不能把表别名误当返回列名。已重新生成并完整重跑；没有为通过测试更改原迁移或放宽校验。

## 限制

- 本地使用 PostgreSQL 17.11；用户提供的生产版本为 17.6，未在生产自动执行。
- 生产前检来自用户回传的只读元数据，不等于已有执行授权或真实管理员/API 验收。
- 三步不能组成一个总事务：前面已提交的步骤不会因后一步失败而自动撤销。
- 没有完整备份或经验证的提交后全库恢复能力；本包没有自动 down/drop/reset。
- 本地测试不等于生产目录已通过，更不等于真实 XLSX、生产编辑/发布或学生 Quiz 已接通。
