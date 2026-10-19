# Task 4 数据库补齐：分三次执行

目标项目：`lxoaeaewcrshjkigzyqe`。本目录不是旧的题库初始化上线包。

## 当前证据与边界

用户在目标项目 SQL Editor 回传的只读结果确认：

- foundation / draft-import 两条记录存在，名称及完整原 SQL 指纹匹配；旧 8 张题库表、原 RLS 和草稿证据列存在。
- `20261018000000`、`20261019000000`、`20261019010000` 三条记录均不存在。
- 4B 的 4 个函数、4C 的 9 个对外接口均不存在；新审核/发布历史表、两个修订计数列均不存在。
- `question_status` 只有 draft / approved / retired，旧指针约束也没有 unpublished。这解释了新版 Saved drafts 查询报错。
- 迁移账本为已确认的六列、两个约束结构，检查身份可 INSERT。执行脚本还会重新核对 RLS、触发器、默认值、权限等完整条件；不符就停止。

**当前只是准备阶段；本目录没有生产执行或生产验收通过的记录。** 上一轮核对正式网站公开 JS 时项目 ref 与上述一致，但 SQL 中的项目注释或手动门禁不是连接目标的技术证明，仍须亲自检查 Dashboard 项目。

不重跑旧 `production/10_deploy_question_bank.sql`、taxonomy、角色初始化或全量历史迁移；不修改三份原迁移，不改变前端，不导入、批准、删除题目，也不创建生产测试账号。

## 在哪里运行什么

进入目标项目的 **SQL Editor → New query**，使用 **postgres** 执行身份。关闭其他数据库变更窗口。

| 顺序 | 完整文件 | 作用 |
| --- | --- | --- |
| 可选只读复查 | `00_status_readonly.sql` | 执行前、步骤之间或网络结果不明时核对账本/对象；不会写入 |
| 第一次 | `10_draft_management.sql` | 草稿编辑/删除接口，以及本项迁移记录 |
| 第二次 | `20_unpublished_status.sql` | 只增加 unpublished 状态，以及本项迁移记录；必须单独提交 |
| 第三次 | `30_publication.sql` | 人工审核、发布/撤回/修订、审计、权限及本项迁移记录 |
| 最后只读验收 | `40_verify_readonly.sql` | 验证最终函数指纹、约束、RLS、授权、对象与五条迁移记录 |

**三个写入文件必须分三次 Run。不要拼进同一次执行。每次复制该文件的完整内容，不单独挑出原 migration 正文。**

每份写入文件顶部都有相同的三个门禁。仅在 SQL Editor 工作副本修改为：

```sql
confirmed_dashboard_project text := 'lxoaeaewcrshjkigzyqe';
accept_no_full_backup_risk boolean := true;
preflight_evidence_confirmed boolean := true;
```

仓库的三份文件继续默认关闭。先确认 Dashboard 项目和已回传证据仍适用，再修改；不能为了消除 STOP 错误绕过其他检查。每次 Run 没有任何错误且事务成功结束后，才进入下一次。

每份文件逐字嵌入**一份**对应原迁移，验证前置函数/对象/账本后执行；DDL 验收通过后才 INSERT 本版本的 version、name、statements，与 DDL 一起提交。created_by、idempotency_key、rollback 保持 NULL。不修改原有记录，不伪造成功，不使用 ON CONFLICT 掩盖重复。

`00_status_readonly.sql` 在前两步运行时，部分“与最终函数体匹配”仍为 false/NULL 是正常的中间状态，不代表可跳过步骤。若实际对象或记录与上述已知状态不同，先停下分析，不盲目运行下一份。

## 成功与失败怎么看

- “Success, no rows returned”只能表示该次没有返回业务行；还需确认没有错误，并运行最终只读验收。
- 最后 `40_verify_readonly.sql` 返回两份 JSON，必须分别 `all_catalog_checks_pass=true`、`all_ledger_checks_pass=true`。账本总共核对旧两条 + 新三条，每条原 SQL 指纹都应匹配。
- 任意 STOP、SQL 错误、超时或网络结果不明：**停，不运行下一步，也不重跑前面的成功步骤**。回传准确错误；先用 `00_status_readonly.sql` 确定已提交范围。
- SQL Editor 若保留失败事务，先单独 `ROLLBACK;` 结束它，再做只读核查。ROLLBACK 不能撤销以前已成功提交的步骤。
- 数据库目录通过但 API 仍报找不到新函数等错误：回传具体错误和只读状态，不重复部署；API/schema cache 的实际可达性需管理员会话另行核验，本包不自动刷新缓存。
- 本包没有自动删除/降级脚本；未知混合状态、对象与账本不一致需要单独分析，不能手工补一条成功记录或删表。

**没有完整备份。事务只保护当前步骤提交前失败，不提供提交后完整恢复能力。** 第一/二步成功后，第三步失败会保留已经提交的第一/二步；PostgreSQL 的 enum 值不能靠第三步回滚消失。不要重跑第二步或手工删除 enum，先查清第三步失败原因。

## 数据库目录通过之后

1. 重新打开/刷新线上 Admin：Saved drafts 应能加载，不再报 unpublished enum 错误；Published problems 也应能读出实际列表。
2. 对现有草稿打开 Preview、Edit，再 Cancel，核对来源、标签、公式和选项，确认没有写入。
3. 打开 Publish 的只读预检查，再 Cancel。pending/未解决 flags 应显示为待审核，不应自动通过。
4. 真正 Save changes、Delete、Publish/Unpublish 会修改生产题目，不属于本次准备或只读验收；需用户明确操作/另行授权，并完成真实人工审核。不要为了测试发布真实未审核题。

数据库目录检查不等于真实管理员会话/API/XLSX 保存验收。学生 Quiz 尚未接新题库；4C 会把原始答案和解析记录限制为管理员读取，这不是学生判分接口。

## 本地检查

```sh
node docs/question-bank/production/task4/build_task4_package.mjs --check
node --test docs/question-bank/production/task4/rehearse_task4.test.mjs
```

生成器不连接数据库，只生成/比对本目录五份 SQL；本地演练仅使用自己新建的 loopback/tmpfs 容器。**生成器和演练测试都不要粘贴到生产 SQL Editor。** 实际结果见 `LOCAL_REHEARSAL_ZH.md`，不把本地结果写成生产已上线。
