# Arena 正式题库接入发布包

仅准备发布材料，不代表生产已部署。当前前端依赖本包；数据库未准备好时，不得发布新前端。

## 行为

- 通过 `arena_practice_catalog` / `arena_practice_next_question` / `arena_practice_submit_answer` 使用正式题库。只发已发布、题干和解析非空、四个非空选项且唯一正确答案的题；所需图片必须存在且为 HTTP(S)。没有可用题时保留游戏原有“基础奖励继续游戏”的行为。
- 每局首次发题创建一条来源为 Arena 的学习会话；每局最多 100 道且不重出。待答题尚未提交时重复请求返回同一次出题。
- 题目版本和选项 UUID 顺序冻结。服务器复用 Practice 判分，答题记录与结果同一事务。重试返回第一次已保存的答案；不增加第二条记录。
- 总览合并显示，并按 Practice / Arena 分项；Practice 最近记录和 Review 标记来源。游戏历史详情只读，保留题目、选择、正确答案、解析、提交时间和 Practice this Topic 链接。
- Arena 记录不参与普通练习的选题历史、Topic 状态、新题/复习判断和强化信号；游戏时长统一记为未知，不进入速度分析。学习分析中的总答题数和正确数仍包含 Arena。
- 旧 `arena_questions`、`arena_question_issues` 及旧 RPC 保留。不复制或导入旧题，不推断旧答案对应的正式题目版本，不补写旧记录。

## 发布步骤（必须另获明确生产授权）

1. 只读核对生产账本和当前对象。前置为 Review `20261025000000`、adaptation-v2 `20261026000000`、course practice `20261028000000`、continuous practice `20261104000000`；都须具有匹配源文件指纹。未部署的前置包须另行评审和授权，不得重放已有历史。
2. 执行 `00_preflight_readonly.sql`，要求三个字段均为 true。该检查只查询目录和迁移账本，不读取题目或账号内容。若为 false，先查差异，不要修改历史账本来强行通过。
3. 获明确授权后执行一次 `10_deploy.sql`。事务锁定账本；已登记、部分对象存在或前置函数/源文件不一致都会中止；业务 SQL 与新账本记录原子提交。
4. 执行 `20_verify_readonly.sql`，要求 `all_checks_pass=true`。本包会前向替换 Practice 的选题/快照函数，旧部署包针对这些函数的正文指纹此后可能不再匹配，应以本包核验为准。
5. 数据库核验通过后再发布前端，用两个真实学生账号验收游戏答题 → 总览增量 → Review 详情、刷新重试、账号隔离、普通五题和连续练习；检查手机和中英文游戏 UI。

新版本号是 `20261105000000_arena_practice_integration`。Arena 原迁移编号沿用 partner 的 `20261104000100`，连续练习保留 `20261104000000`。本包独立于旧 Arena 数据结构，不需要重放旧 Arena 迁移。此前只读核对发现旧 Arena 两张表已存在而账本未登记，详见 [记录](../../MIGRATION_CONFLICT_2026-11-04_ZH.md)。

## 本地验证与重新生成

```bash
node scripts/arena/generate-practice-deploy.mjs
node --test scripts/continuous-practice-migration.test.mjs
npm run test:arena
npm run test:student-practice
npm run test:arena:practice:db
node scripts/arena/practice-browser.test.mjs
```

数据库测试仅使用一次性本地 Docker PostgreSQL；浏览器测试使用本地合成 API 数据，验证 UI 和宿主页桥接，不等同生产真实账号验收。浏览器截图在 `node_modules/.cache/arena-practice/`。迁移、前置迁移内容改变后重新生成三份 SQL，并重新验证包内源文件和函数指纹。
