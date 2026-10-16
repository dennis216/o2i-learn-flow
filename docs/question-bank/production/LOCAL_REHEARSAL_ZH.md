# 上线包本地演练记录

日期：2026-10-16。范围：两个既有题库迁移的生产上线材料。本轮将备份引用门禁替换为显式的无完整备份风险确认，并保留全部其他安全检查；**没有生产连接或写入**。

本轮由生成器重新生成 SQL，在全新隔离容器从“前置依赖存在、两项题库迁移未应用”的状态完整复测。六列生产账本 fixture 沿用已通过的兼容方案，不改原迁移、不重放 taxonomy。

**没有完整备份。事务只保护提交前失败，不提供提交后的完整恢复能力。** 默认风险门禁仍为 false；本地演练通过不等于生产已执行或已具备恢复保障。

## 环境与隔离

- 起始分支 `migrate-codex-work`，HEAD `0a65a7b`，本地记录领先 origin 1 个提交。起始没有已跟踪改动，原有 3 个 V1 文件及上线包目录的 7 个文件均未跟踪，全部保留。
- Docker Engine 29.8.2；Node 24.21.0。使用本机已有镜像 `public.ecr.aws/supabase/postgres:17.11.0.002`，实际 PostgreSQL 17.11。生产元数据为 17.6，存在小版本差异。
- 一次性容器 `o2i-qb-release-rehearsal-20261016`，purpose label 为 `question-bank-release-rehearsal`，端口只绑定 `127.0.0.1:55439`，数据目录 `/var/lib/postgresql/data` 使用临时文件系统。未挂载已有 Supabase 卷，没有 reset 现有工作数据库。
- 利用镜像自带的 auth/schema/数据库角色；从仓库提取所需角色/更新时间函数原文，构造最小前置表及独立合成规范数据。**没有运行完整 taxonomy/角色初始化或其他历史迁移，也没有使用生产题目或账号。**
- 起始题库表/类型/RPC/两个目标账本记录均不存在，主要前置依赖和两条前置迁移记录已存在。账本 fixture 严格复现用户提供的生产六列结构：`version text NOT NULL`；`statements text[]`、`name text`、`created_by text`、`idempotency_key text`、`rollback text[]` 可空；所有列无默认值/identity/generated；`PRIMARY KEY(version)` 与标准 `UNIQUE(idempotency_key)`；RLS 关闭、无用户触发器、检查身份有 SELECT/INSERT 权限。
- 两条前置迁移记录额外放入合成的 created_by、idempotency_key、rollback 哨兵值，确保本轮写入不改变既有账本证据。目标两条新记录另外三个可选字段均断言为 NULL，不编造审计信息。
- 测试连接的临时随机凭据只在进程内存/临时容器存在，不写文件、不打印。仅内存中的本地 SQL 副本将 `accept_no_full_backup_risk` 设为 true；磁盘上的发布 SQL 保持 false，没有备份引用或虚构恢复凭证。

## 实际执行结果

`node --test docs/question-bank/production/rehearse_release.test.mjs` 最终在全新容器执行：**30/30 通过（29 个子测试 + 1 个外层测试组）**。

| 子测试 | 实际结果 |
| --- | --- |
| 前置依赖存在、两个题库迁移未应用 | 通过，题库表/类型/主要函数/账本记录均为 0；三个 gate 默认关闭；嵌入内容逐字等于且仅有两项指定原迁移 |
| 六列账本元数据与生产证据一致 | 在上述起始测试内核对六列、类型、可空性、无默认值/identity/generated、两个约束、RLS、触发器及权限 |
| 项目/风险/账本确认 gate 默认关闭 | 拒绝执行，零题库对象/记录 |
| 仅风险未接受，其他 gate 在本地测试副本中已确认 | 报显式风险确认错误，零题库对象/记录，原有数据不变 |
| 风险确认设为 NULL | 同样拒绝，零题库对象/记录 |
| 仅项目未确认 / 仅账本证据未确认 | 两个独立测试均拒绝，风险确认不能绕过其他门禁 |
| 不兼容账本的 13 个独立负向测试 | 未知列、缺列、错误类型、错误可空性、默认值、generated 列、缺主键、错误唯一键、延迟唯一键、NULLS NOT DISTINCT 唯一键、额外约束、RLS 启用、用户触发器全部被前检拒绝；变异 fixture 回滚 |
| 题库表已经存在但没有记录 | 前检拒绝，不覆盖已有对象 |
| foundation 执行后注入第二阶段失败 | foundation 创建的表、类型、函数全部回滚；两个账本记录均为 0 |
| 两份 DDL 和账本 INSERT 后注入失败 | 两份迁移和账本全部回滚；既有哨兵数据/其他账本不变 |
| 明确接受风险且其他检查通过，整包成功执行 | 8 表、8 类型、18 最终函数、16 policy、14 trigger；只读验收全通过；两条记录的名称和原 SQL 指纹匹配，created_by/idempotency_key/rollback 全部为 NULL |
| 成功后再次执行 | 报 already recorded；成功对象与全部账本内容不变 |
| 两个真实数据库连接的上线锁保护 | 连接 A 持有相同 transaction advisory lock；连接 B 执行整包，立即报另一份 release 正在运行；A 回滚释放锁 |
| 既有 foundation pgTAP | 99/99 通过，测试事务回滚 |
| 既有 draft-import pgTAP | 29/29 通过，测试事务回滚 |
| 删除关键唯一索引的本地负向验收 | 只读验收返回 false；负向测试事务回滚 |
| 演练结束内容与前置数据核查 | 新题目/版本均为 0，既有哨兵数据/其他账本与基线相同 |

128 个 pgTAP 断言直接通过本地 `pg` 驱动执行原 `supabase/tests/*_test.sql`，检查 TAP 输出与断言数量；**本次没有运行 `npx supabase test db` 或启动原有 Supabase 全栈**。覆盖首次批准、修订/历史不可变、学生/匿名 RLS、非管理员管理接口拒绝、草稿保存、重复拒绝、批次回滚及未知来源/计算器政策的批准阻断。

其他实际检查：

- `node docs/question-bank/production/build_release_package.mjs --check`：通过；生成 SQL 与原迁移逐字内容、接口及指纹一致。
- `node --test supabase/tests/question_bank_foundation_static.test.mjs`：15/15 通过。
- `npm run test:question-bank`：39/39 通过。
- `node --check` 检查两个新增 `.mjs`：通过。
- `git diff --check` 及新增包文件的 `git diff --no-index --check`：通过。
- `git diff --exit-code -- supabase/migrations src package.json package-lock.json`：通过；原迁移、应用及依赖文件未改。
- 本次没有修改 TS/前端，未重跑 TypeScript、前端 build、浏览器真实 XLSX 保存；这不是前端验收任务。

原迁移 SHA-256：

```text
20260926000000_question_bank_foundation.sql
e73b10c65d1d79283b548f693c517b57b2de1f5448a9d1d6cfbaf456d9cfe212
20261004000000_question_bank_draft_import.sql
6fb4b1df0d9dc182d37bea38efadf496de1bcc6ca7cc957b1f9738ef2bc02b34
```

本轮只修改生成器的风险门禁、既有演练的门禁断言、生成的上线 SQL 和两份说明，共 5 个文件。`00` 补查 SQL、`20` 只读验收 SQL 内容保持不变。**没有为通过演练修改两份原迁移、应用或生产数据库**。项目确认仍为空，风险确认及账本确认均默认 false；生产包没有被本地测试副本解锁操作改写。

## 清理与保留

核对精确容器名、purpose label、挂载与端口后，仅清理本次临时容器：

```sh
docker inspect o2i-qb-release-rehearsal-20261016 \
  --format '{{.Name}} {{index .Config.Labels "o2i.purpose"}} {{json .Mounts}}'
docker stop --timeout 5 o2i-qb-release-rehearsal-20261016
docker rm o2i-qb-release-rehearsal-20261016
```

本次临时容器及其测试数据库已移除；只包含可丢弃的合成数据，无需恢复。原有三个 `supabase_*` 本地卷保持存在，未挂载/修改。无生产连接、生产迁移、缓存刷新、账号变更、commit、push、merge、切换分支或前端部署。

最终 Git 状态：原分支/HEAD 不变，原有 3 个 V1 未跟踪文件不变，`docs/question-bank/production/` 仍为原有 7 个未跟踪文件，其中本轮修改 5 个；没有暂存文件或已跟踪改动。

## 仍未验证的事项

- 生产迁移账本完整结构与检查身份 SELECT/INSERT 权限：用户已提供只读证据，本轮据此适配；不代表生产部署或管理员真实会话验收通过。
- 完整备份、可恢复点及整库恢复流程：尚未建立/验证；用户已选择受控增量方式，须另行明确接受风险并决定生产执行，不能宣称具备提交后全库恢复能力。
- 生产两份迁移实际执行与只读验收：未执行。
- 生产管理员真实会话、REST/API/cache 就绪、真实 XLSX 保存/readback：另行验收。
- 前端英文修复是否在后续推送/部署：本次未操作、未重新核对部署状态。
