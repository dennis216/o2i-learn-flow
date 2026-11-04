# 无限练习（continuous-v1）：实现与发布

设计依据：`docs/superpowers/specs/2026-11-03-adaptive-continuous-practice-design.md`。本包不导入或发布题目，不修改 5 题模式的选题规则。生产部署和真实账号验收须单独执行。

## 已实现行为

- 练习页顶部：Start 5 questions / Free practice / Review。Topic 卡片、课节 Start practice、旧视频跳转、分析面板和答案里的 Practice this Topic 都进入无限练习；只有 Start 5 questions 和旧 5 题会话的 Start another set 仍是 5 题。
- 服务器每次只发一题；刷新或重复请求返回仍在等待的题，不多发。单次最多 100 题。
- Topic 状态只看每道题**第一次**作答：最近 6 道中少于 4 道为 insufficient；第一次做对 ≥75% 为 stable，否则 needs_practice。复习题（第一次做对过的题再做）做错，退回 needs_practice，直到之后又有 4 道新题的第一次作答。
- 选下一题：首题 medium（needs_practice 时 easy）；做错降一档，连续 3 道做对升一档；没有更简单的新题时出最接近的难度，不提示；做错后优先同 Skill。每第 5 题优先复习一道第一次和最近一次都做对、且距今 ≥3 天的题，没有就跳过。不重出做过的题。
- Free practice：做错留在同一 Topic；同一 Topic 最多连续 5 题；Topic 顺序 needs_practice → insufficient → stable。
- 同一 Topic 连续 4 道（常规题）做错时提示看视频或解析；继续后计数从头开始，到 8 再提示。
- 新题用完：Topic 模式显示 Watch the lesson（课程入口时）/ Choose another Topic / End session；Free practice 显示 End session。
- End session 后会话关闭，未作答的题保持“未作答”，服务器拒绝再提交。复盘：作答数、新题数和第一次做对数、设备上报用时（仅参考）、按 Topic 三档状态及依据、错题与解析、下一步建议。
- 练习页提示 7 天内未结束且至少答过一题的会话：Continue / End and see recap。
- 每题的入选原因（规则版本 continuous-v1）和服务器发题时间冻结在 `question_practice_items`，用于以后检验规则。

## 接口与兼容

新增 `start_continuous_question_practice`、`next_continuous_question_practice`、`end_continuous_question_practice`、`get_open_continuous_question_practice`；作答继续用 `submit_question_practice_v2`。`question_practice_snapshot` 外层增加 `mode`、`ended_at`，无限练习会话另含 `continuous`（原因、提示、复盘）。旧 5 题会话 `mode='set'`，内容不变。

本迁移替换了课程迁移的 `question_practice_snapshot` 外层函数，因此课程包 `20_verify_readonly.sql` 对该函数的正文指纹核验会不再匹配，属预期；以本包核验为准。

新前端在数据库未部署本包时：练习页的未结束提示静默隐藏，但无限练习入口会报错。**必须先部署数据库再发布前端。**

## 发布顺序

1. 只读执行 `00_preflight_readonly.sql`：`adaptation_v2_matches`、`course_practice_matches` 为 true，`continuous_recorded`、`continuous_objects_present` 为 false。
2. 本地运行 `npm run test:student-practice`、`O2I_COURSE_DB_EXTRA=1 O2I_COURSE_CONTINUOUS_DB=1 node scripts/course-content-db.test.mjs`（需本机 Docker）、TypeScript、ESLint 和 build。
3. 明确授权后执行一次 `10_deploy.sql`，再执行 `20_verify_readonly.sql`，要求 `all_checks_pass=true`。
4. 发布前端。
5. 用两个学生账号验收：Topic 卡片 / Free practice / 课节入口各做到新题用完；做错变简单、连对升难度、连错 4 题提示、刷新不多发题、End 后不能提交、复盘内容、未结束提示、账号隔离、手机宽度无横向溢出；5 题模式和 Review 不变。

修改迁移后重新运行 `node scripts/generate-continuous-practice-deploy.mjs` 生成本目录 SQL。
