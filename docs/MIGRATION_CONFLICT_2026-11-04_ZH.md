# test-work 合并后迁移编号核对

只读核对基线：合并提交 `d3f48f2`。2026-11-05 已快进同步至 partner 的 `767f162`（含中英文切换和 Arena 改号）。本记录保存编号冲突核对及同步结果；后续正式题库接入使用独立的 `20261105000000` 前向迁移，不部署生产。

## 生产只读证据

2026-11-04（America/Los_Angeles），通过 Supabase Management API 对项目 `lxoaeaewcrshjkigzyqe` 执行 SELECT，设置 `read_only: true`；没有执行迁移、修补账本或写入业务数据。

账本查询条件：`version >= '20261103000000' OR name IN ('arena_game','question_practice_continuous')`。返回：

| version | name | source_parts | source_md5 |
| --- | --- | --- | --- |
| 20261103000000 | admin_module_role_values | 1 | 136fbad2e284d5ecc3698853b3703fac |
| 20261103010000 | admin_module_permissions | 1 | 356652a085244925048f99d348fa13be |
| 20261103020000 | admin_user_deletion | 1 | d11ccb83ad64a84db35645599c39f9eb |
| 20261103030000 | admin_account_data_guards | 1 | b33fe1b1cdfa87ff55fd140fca43dbd7 |

`source_md5 = md5(array_to_string(statements, E'\n'))`。查询范围内没有其他记录，因此核对当时的 `20261104000000` 未登记，亦无 Arena／连续练习名称记录；此证据早于 partner 的本地改号，不能替代未来部署前的重新核对。

对象查询：`public.arena_questions`、`public.arena_question_issues` 已存在；`public.start_continuous_question_practice(uuid,uuid,uuid)` 不存在，`question_practice_sessions.mode` 不存在。Arena 属于“对象存在但账本未登记”，不能声称未部署，也不能直接重放。尚未核对 Arena 所有函数、权限和数据与本地 SQL 是否一致。

## 本次处理

- 同步 partner 的 `767f162` 后，Arena 使用 `20261104000100_arena_game.sql`，SQL 内容不变。
- 连续练习保留 `20261104000000_question_practice_continuous.sql`，SQL 内容不变；撤回本任务之前未提交的连续练习改号，沿用 partner 已完成的唯一编号修复。
- 新部署包仍要求前置迁移指纹一致、目标编号未登记且连续练习对象不存在；发现部分部署即中止。
- 回归检查覆盖 20261104 编号唯一性、生成器和测试引用、部署包内嵌 SQL 与源码一致、账本版本及源码指纹。

## 剩余边界

仓库还存在独立的 `20261103020000` 冲突：`admin_user_deletion` 与 `course_login_access`。生产账本该编号属于前者，本次保持两份历史文件原样，未将该问题混入 Arena／连续练习修复。生产 `course_topic_visible(uuid,uuid)` 正文 MD5 为 `a133a50145830b4d062f11d37d7ceece`，仅凭此不能判定整套课程登录迁移是否已部署。后续须单独核对后处理，当前不能宣称全仓库编号已唯一。

任何后续生产操作均需明确授权：重新只读核对状态；连续练习按其 README 的 preflight → 单次定向部署 → 只读核验流程；Arena 先完成现有对象差异核对。禁止 broad db push、迁移重放或覆盖已部署历史。

## 2026-11-05 后续修复

上述“剩余边界”保留为当时状态。新一轮生产只读核对已确认课程登录限制未安装，管理员历史匹配；旧 Arena 全目录与原迁移的本地执行基线一致。课程未部署文件改为独立编号 `20261105010000`，Arena 使用只补登记、不重跑 DDL 的定向包。当前执行状态和验证证据见[数据库整理记录](database-reconciliation/README_ZH.md)；代码提交不能代替生产执行证明。
