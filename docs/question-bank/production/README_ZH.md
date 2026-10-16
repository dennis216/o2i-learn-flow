# O2I 生产题库数据库上线包

目标项目：`lxoaeaewcrshjkigzyqe`。准备日期：2026-10-16。

**当前状态：材料已准备、本地演练通过；生产未执行、生产验收未完成。**

上线 SQL 默认拒绝执行。用户已决定采用受控增量上线，不再以完整备份为前提；本包改为要求显式接受无完整备份的风险，**默认 `accept_no_full_backup_risk := false`，本次不授权生产执行**。生产六列迁移账本的两个约束及权限检查全部保留。项目名称、文件注释、手动填写的项目 ref 都不是数据库连接目标的技术证明，必须亲自在 Dashboard 核对当前项目和地址栏。

## 文件与使用顺序

| 文件 | 用途 | 会不会写生产 |
| --- | --- | --- |
| `00_ledger_preflight_readonly.sql` | 补查迁移账本列、约束、触发器和执行者权限 | 不会，只读事务 |
| `10_deploy_question_bank.sql` | 原样执行 foundation → draft-import，同事务同步两个迁移记录 | 解锁并由用户执行后会写；默认阻止 |
| `20_verify_readonly.sql` | 上线后检查对象、函数指纹、约束、RLS、授权、账本 | 不会，只读事务 |
| `LOCAL_REHEARSAL_ZH.md` | 实际本地演练结果与限制 | 不会 |
| `build_release_package.mjs` | 从原迁移机械生成并核对 SQL，不连接数据库 | 不会 |
| `rehearse_release.test.mjs` | 专供隔离临时容器的测试程序 | **绝不能用于生产** |

## 已有生产证据与本次审查

用户提供的生产元数据表明：8 张题库物理表、题库 RPC、两个目标迁移记录都缺失；taxonomy 已存在；`has_role(uuid, app_role)`、`is_super_admin(uuid)`、`update_updated_at_column()` 的签名与函数体匹配仓库。这个结果解释了 `public.questions` 的 PGRST205，不是仅凭截图推测缓存故障。

本包只复用以下两个原迁移，原文件没有修改。生成文件中以 dollar-quoted 文本逐字嵌入原 SQL；SHA-256 写在文件头，账本保存原 SQL 文本而不是只有一个空的成功标记。

1. `supabase/migrations/20260926000000_question_bank_foundation.sql`
2. `supabase/migrations/20261004000000_question_bank_draft_import.sql`

完整审查结论：

- foundation 建立 8 张规范化表、8 个枚举类型、题目/版本独立生命周期、同题当前版本复合外键、一个 working revision / 一个 approved version 的部分唯一索引、正确选项唯一索引、16 条 authenticated RLS policy，以及历史内容保护。没有课程、视频、账号、标签或旧题表的数据更新。
- draft-import 仅修改新题库对象：草稿的 `source_type` / `calculator_policy` 可为空；增加版本和选项的 `import_evidence`；批准前仍由 CHECK 和触发器要求元数据齐全；修订复制保留证据；保存 RPC 始终创建 draft，当前发布指针为空，整批失败回滚。
- 两份迁移的最终对象共有 18 个函数、14 个触发器。保存与生命周期 RPC 都要求管理员身份；提交到 review、批准、退役不是本次上线脚本会调用的操作。上线不会导入题目、批准题目或开放访客 policy。
- 直接依赖：`auth.users(id)`、`auth.uid()`、`auth.role()`、`gen_random_uuid()`、`extensions` schema、`app_role`、`user_roles`、上述角色/更新时间函数、taxonomy 的 framework/topic/skill 表、`course_videos(id)`。现有 `courses`、units、practices、`practice_problems` 也纳入保留状态前检。
- 原迁移复用数据库的默认表授权；前检不假定默认权限正确，事务提交前核对 authenticated 的逐项 CRUD 权限及所有子表 RLS。没有匿名题库 policy。**表授权不等于 RLS 后的可见权限。**
- Supabase 的默认函数授权可能使 anon 仍具有部分生命周期/内部函数的 EXECUTE；原迁移的 `REVOKE ... FROM PUBLIC` 不等于撤销所有显式默认授权。生命周期 RPC 内部仍有管理员检查；保存 RPC 明确撤销 PUBLIC/anon。验收 SQL 展示实际授权，不把所有函数都描述成 anon 无 EXECUTE。此次不改原迁移或扩展权限设计；本地匿名、普通用户和非管理员回归均执行。
- **绝不重跑 taxonomy 或角色初始化。** taxonomy 迁移含 `DELETE FROM public.course_videos` 等既有产品内容操作，不能使用“从头重放所有历史迁移”的生产方案。

## 无完整备份：必须明确接受的风险

- 目前没有已完成并经恢复验证的完整数据库备份；后台此前显示 **No backups**。本包不伪造备份引用，也不把只读访问、本地演练或空的私有备份目录当作恢复保障。
- 两项迁移和两条账本记录在同一事务中完成。**事务只保护提交前的失败，不提供提交后的完整恢复能力。** 成功提交后才发现问题，不能靠 `ROLLBACK` 撤销已提交内容。
- 采用受控增量方式：只增加这两项题库迁移，不重放 taxonomy、不导入题目、不改旧课程/视频/账号/`practice_problems`。这降低变更范围，但不等于零风险或已经有备份。
- 新门禁 `accept_no_full_backup_risk boolean := false` 必须由用户在另行决定生产执行后，于 SQL Editor 工作副本中明确设为 `true`；`false` 或 `NULL` 都拒绝执行。项目和账本确认门禁仍独立生效。
- 本次只调整上线包并在一次性本地库演练，不连接生产，不继续密码尝试、备份工具或账号/权限研究。原有私有资料保持不动。

## 给非技术操作者的步骤

### A. 先看风险与账本；现在不要执行生产

1. 用户回传的生产 `ledger_preflight` JSON 已确认下列结构。本包严格检查这六列、所有列无默认值/identity/generated、RLS 关闭、无用户触发器，以及执行者的 SELECT/INSERT 权限。
   - `version text NOT NULL`，约束 `schema_migrations_pkey: PRIMARY KEY(version)`。
   - `statements text[] NULL`、`name text NULL`。
   - `created_by text NULL`、`idempotency_key text NULL`、`rollback text[] NULL`。
   - 另一个且仅另一个约束为 `schema_migrations_idempotency_key_key: UNIQUE(idempotency_key)`，非延迟、允许多个 NULL 的标准唯一约束。
2. 这份六列结构已在隔离本地库实际演练。上线仍只 INSERT `version、name、statements`；另外三列保持 NULL，不编造执行者、幂等键或回滚 SQL，也不修改已有账本记录。
3. 阅读上述风险说明。**无完整备份仍是事实**；明确风险确认替代备份引用要求，不代表恢复能力已补齐。仓库文件中的三个发布 gate 均保持关闭；本次任务不是生产执行授权。
4. `00_ledger_preflight_readonly.sql` 保留供必要时重新只读核查，不需要为了补同一份已收到证据反复运行。若执行前环境有变化或证据过期，可在目标项目 SQL Editor 重新运行。任何未知列、类型/可空性/默认值变化、额外/不同约束、RLS、触发器或权限不兼容，均必须**停止，不绕过前检**。

### B. 用户另行决定生产执行后，才修改 SQL Editor 工作副本

1. 关闭其他题库数据库变更窗口；不要同时跑 CLI migrations 或另一份上线脚本。此包对自身使用 advisory lock，对账本短暂加锁；不能替代人工协调所有部署工具。
2. 再确认 Dashboard 的项目 ref 与本包相同，并选择 SQL Editor 的 `postgres` 执行身份。不能用浏览器 anon key、管理员业务登录或注释替代连接确认。
3. 把 `10_deploy_question_bank.sql` **完整**放入一个新查询。只有在 A 已完成并另行决定执行后，才在 SQL Editor 工作副本修改顶部三个 gate：`confirmed_dashboard_project := 'lxoaeaewcrshjkigzyqe'`、`accept_no_full_backup_risk := true`、`production_ledger_evidence_confirmed := true`。不要填写虚构备份引用，不改迁移正文、不分段执行，也不要把门禁当作数据库目标自动识别。
4. 一次运行整个文件。依赖、旧对象、旧记录、并发或权限不符都会报 `STOP:`；DDL 失败则显示原 SQL 错误。正常结束必须没有任何错误并完成 `COMMIT`；随后必须做 C 验收，不能仅凭一个“Success”提示认定业务可用。

### C. 上线后立即只读验收

1. 在同一目标项目的新查询运行 `20_verify_readonly.sql` 的全部内容。
2. 第一份结果的 `all_catalog_checks_pass` 必须为 `true`；检查 8 表、18 函数、16 policy、14 trigger、关键复合外键/约束、3 个完整有效的部分唯一索引、草稿可空列和证据列。
3. 第二份结果必须恰好是两个版本：`20260926000000`、`20261004000000`，每行 `matches_packaged_migration=true`。这证明对象与账本一起成功，不是提前标记。
4. 回传这两份元数据结果。管理员实际会话、REST schema cache/API 可达性、真实 XLSX 保存/readback 仍须另行验收；**系统目录通过不等于业务验收通过**。本包不创建测试用户或导入测试题到生产。
5. 前端上线是另一个任务。本次不推送或部署 `0a65a7b`，数据库上线也不会自动更新网站 JS；前端部署不能补建缺失数据库对象。

## 失败与恢复：先停，不盲目重试

- 执行前门禁拒绝：不绕过安全检查，保留准确错误，重新检查项目、显式风险确认、账本和依赖。
- 同一事务内任何 SQL 报错：两份迁移和两个新账本记录一起回滚。停止操作、保留错误全文并运行只读检查；不要单独补写“成功”记录。SQL Editor 如果保留了 aborted transaction，会话可先执行 `ROLLBACK;` 结束失败事务；它不是修复 SQL。
- 网络断开/超时、无法判断是否已提交：不要再次运行部署文件。先只读检查 8 表和两个账本记录，确定是全部缺失还是全部完成；混合状态必须调查，不能手动猜测补齐。
- 已成功提交但后续业务失败：停止题库写入，保留元数据和日志，优先评估小范围向前修复。**目前没有经验证的全库恢复路径，本包没有自动 down / DROP CASCADE 脚本**；删除可能损失后续导入内容、依赖和审计历史。
- 全库恢复能力尚未建立，不能承诺恢复到上线前状态。任何提交后修复/移除新对象都须另行批准，先检查依赖和是否已有题库数据；不能只删除两个账本记录冒充回滚，也不能直接覆盖正在运行的生产库。

## 本地可重复演练（不是生产操作步骤）

仅在本机 Docker 中创建新的临时容器，不挂载现有工作库卷。镜像须已在本机，以下命令不会登录/link 到 Supabase，也不会 `db reset`。

```sh
node docs/question-bank/production/build_release_package.mjs --check
docker run --detach --name o2i-qb-release-rehearsal-20261016 \
  --label o2i.purpose=question-bank-release-rehearsal \
  --tmpfs /var/lib/postgresql/data:rw,size=768m \
  --publish 127.0.0.1:55439:5432 \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  public.ecr.aws/supabase/postgres:17.11.0.002
docker exec o2i-qb-release-rehearsal-20261016 pg_isready -U postgres
node --test docs/question-bank/production/rehearse_release.test.mjs
```

每次须使用新容器。`trust` 仅供无挂载卷、只绑定 loopback 的一次性容器初始化；不能用于生产/共享数据库。测试连接前会在内存中初始化随机临时凭据，不打印或保存。测试自行构造最小前置表和合成规范数据，提取仓库角色/更新时间函数原文，不运行完整 taxonomy/角色初始化迁移；不会模拟真实生产用户或真实题目。完成后只移除名称和 purpose label 都已核对为本次演练的容器；不操作现有 `supabase_*` 卷。容器移除命令见实际演练记录。
