# O2I Learn Flow 项目全景说明

更新时间：2026-11-06
代码基线：`test-work`（含 PR #19，`de9bd1f`，2026-11-08）；`main` 与其一致
后端：Supabase 项目 `o2i institute web end`（project ref: `lxoaeaewcrshjkigzyqe`）
线上：https://www.o2iinstitute.org（Cloudflare Pages，项目 `o2i-website`）；测试站 https://test-work.o2i-website.pages.dev

> 依据：代码、迁移文件、`docs/` 下各模块的执行记录。生产状态均引用这些记录里的只读核验结论，本文没有重新连库核对。“已部署”“已上线”只在记录有生产证据时使用。

## 1. 一句话定位

面向 **AP Calculus（College Board CED 体系）** 的在线学习站，主线是 **看课 → 做题 → 复盘**，外加一个用正式题库出题的小游戏 Limit Arena。

## 2. 进度条（估算）

百分比是按“该模块上线所需的事项完成了多少”粗估，不是代码量。

| 模块 | 进度 | 状态 |
|---|---|---|
| 账号与管理员权限 | `█████████░` 90% | 模块分权、删除用户、审计已上线；剩旧数据清理 |
| 题库后台（录入/审核/发布） | `█████████░` 90% | 全流程已上线，Arena 旧题导入工具已上线 |
| 学生练习（5 题 + 连续练习 + Review） | `████████░░` 80% | 连续练习已部署上线；真实学生账号验收未见记录 |
| 题库内容 | `█████░░░░░` 50% | 已发布约 145 道（原有 65 + Arena 转录 80）；Arena 转录还有 306 道草稿待发布 |
| Limit Arena 游戏 | `████████░░` 80% | 已接正式题库并上线；发布后学生端验收待做 |
| 课程系统（大纲/视频/游戏） | `███████░░░` 70% | 功能已上线；**Unit 4 登录限制的数据库部分未部署**；Unit 1–3 视频是否已全部录入发布未核实 |
| 上线周其他事项 | `████░░░░░░` 40% | About Us 已加；Solution Requests 楼层式答疑的代码已完成（在 `claude/affectionate-cray-oxc8o5` 分支，**数据库未部署**）；Contact、付款页还没做 |
| 文档与工程卫生 | `██████░░░░` 60% | 记录详尽；`main` 与 `test-work` 分叉，迁移编号曾冲突 |

## 3. 近期大修改（11-01 至 11-06）

| 日期 | 修改 | 生产状态 |
|---|---|---|
| 11-03 | 课程 Unit 4 起要求登录（`20261105010000_course_login_access`，原编号冲突后改号） | 前端已上线；**数据库修复包只做了只读预检，尚未执行**，服务端限制未生效 |
| 11-03 | 连续练习：一题一题出直到学生结束，结束后有总结；答错降难度、连对三题升难度、每五题插复习、连错四题给引导 | 迁移 `20261104000000` 已定向部署并核验，前端已上线 |
| 11-04 | partner 新增 Limit Arena 游戏（[dennis216/o2i-learn-flow PR #15](https://github.com/dennis216/o2i-learn-flow/pull/15) 已合入 main），11-05 加中英文切换 | 已上线 |
| 11-05 | Arena 改用正式题库：服务器逐题发题和判分，答题进入总览和 Review（来源标注 Arena），不影响普通练习自适应 | 迁移 `20261105000000` 已定向部署，前端已上线 |
| 11-05 | 旧 Arena 471 道题迁入正式题库：转换公式/图/表，两位独立 AI 盲解复核，85 道因格式损坏或有歧义被排除 | 迁移 `20261105020000` 已部署；386 道已录入，80 道已发布 |
| 11-05 | 迁移编号冲突整理（`docs/MIGRATION_CONFLICT_2026-11-04_ZH.md`、`docs/database-reconciliation/`） | Arena 旧表登记 + 课程函数修复包已备好，**未执行** |
| 11-05 | 导航栏居中、可横向滚动；新增 About Us 页 | 已上线 |
| 11-06 | Admin 刷新权限时不再丢失正在编辑的内容 | 代码已推送 |

部署方式是“逐个迁移：只读 preflight → 单事务部署 → 只读核验”，没有用 `db push`。部署前后旧数据行聚合校验一致。

## 4. 系统架构

```text
浏览器（React SPA，Cloudflare Pages 发布）
 ├─ 学生端：Courses / Practice / Quiz / Review / Arena / Playground / Solution Requests / Team / About / Profile
 └─ Admin：Courses / Question Bank / Answers / Playground / Team / Users（按模块权限显示）
        │  supabase-js（Auth、RPC、表读写、Storage）
        ▼
Supabase
 ├─ Auth
 ├─ Postgres + RLS：判分、选题、权限都在 RPC（security definer）里
 ├─ Storage：图片、头像、课程 HTML 游戏、题目配图
 └─ Edge Functions：账号邀请/确认/删除；AI 与旧 zombie 函数（遗留）
外部：YouTube（视频）、GeoGebra（Playground）、Lovable AI（AI Tutor，隐藏中）
```

架构图：`docs/ARCHITECTURE_DIAGRAM.png`（11-01 版，未画 Arena 页面，整体结构不变）。

技术栈：React 18 + TypeScript + Vite + React Router 7 + Tailwind + shadcn/ui + TanStack Query + KaTeX + supabase-js。

本地运行：

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 8080
```

## 5. 学生端路由

| 路由 | 功能 |
|---|---|
| `/` | 首页 |
| `/auth`、`/reset-password`、`/profile` | 登录注册、重置密码、个人资料 |
| `/courses` | Course → Unit → Topic 大纲；展开时懒加载视频、HTML 游戏；Topic 可直接进练习。Unit 4 起需登录 |
| `/practice` | 选 Topic（数值排序、按 Unit 筛选），5 题快速练习或连续练习，最近作答 |
| `/quiz` | 答题页：计时、记录选项改动轨迹、服务端判分、解析、下一步推荐 |
| `/review` | 作答历史，可只看错题，显示来源（Practice / Arena） |
| `/arena` | Limit Arena 游戏，必须登录；游戏本体在 `public/games/limit-arena.html`，通过 postMessage 由宿主页取题判分 |
| `/playground` | GeoGebra 工具库 |
| `/solution-requests`、`/solution-requests/:id` | 答疑区：公开问答 / 我的问题；每个问题一页，楼层回复，管理员回复带官方标记。规则见 `docs/solution-requests/README_ZH.md` |
| `/team`、`/about` | 团队、关于我们 |
| `/ai-tutor` | 隐藏（`AI_TUTOR_ENABLED = false`），访问会跳到 `/courses` |
| `/learn*`、`/practice/:videoId` | 旧入口，重定向 |

## 6. 练习与题库

- **题库模型**：`questions` → `question_versions`（草稿/审核/发布）→ `question_options`（可挂 `misconceptions`）；通过 `question_topics` 挂 CED 的 Unit/Topic/Skill。
- **学生记录**：`question_practice_sessions`（含 `mode`、`source`）→ `items` → `attempts`。
- **三种练习入口共用一套判分**：5 题组、连续练习、Arena。Arena 的记录不影响普通练习的选题、Topic 状态和速度信号。
- **自适应**：综合正确率、用时、误解标签、近期重复；只看首次作答，重复做同题不会抹掉之前的错。
- **后台流水线**：手动录入 / XLSX 导入 / Arena JSON 导入 → 草稿 → 预览编辑 → 审核 → 发布 → 取消发布 / 归档 / 重新发布；附作答统计。
- **内容生产**：`docs/question-bank/`（V1–V5 流程）、`docs/arena/legacy-import/`（旧 Arena 转录，私有原始快照放在仓库外）。

## 7. 课程系统

Course → Unit → Topic 大纲，支持自定义课节标题（保留规范 Topic 映射）、多课程共享课节、视频库跨课复用、单文件 HTML 游戏、Draft/Published 两级发布、修订号防覆盖、AB/BC 范围区分。细节见 `docs/courses/`。

## 8. 权限

`super_admin`（唯一）→ 模块管理员（courses / questions / playground / team）→ 学生。以 `user_roles` + `get_admin_access` 为准，`instructor` 已淘汰。账号操作走 Edge Functions：`admin-invite-user`、`force-confirm-user`、`admin-delete-user`。

## 9. 数据表（按用途）

| 分组 | 表 |
|---|---|
| 账号权限 | `profiles`、`user_roles`、`user_login_events`、`admin_user_deletion_*`、`admin_emails`（遗留） |
| 课程 | `courses`、`course_videos`、`course_outline_*`、`course_topic_*`、`course_lesson*`、`course_curriculum_units`、`subjects` |
| CED | `curriculum_frameworks / units / topics / learning_objectives / practices / practice_skills` |
| 题库 | `questions`、`question_versions`、`question_options`、`question_topics`、`question_course_videos`、`question_version_reviews`、`question_publication_events`、`misconceptions`、`option_misconceptions` |
| 练习 | `question_practice_sessions / items / attempts / skills`、`arena_practice_issues` |
| 旧 Arena | `arena_questions`、`arena_question_issues`（保留，不再出题） |
| 答疑 | `solution_requests`、`solution_request_replies / reports / quota`（读写都走 `sr_*` 函数） |
| 其他 | `playground_links`、`team_members` |
| 遗留 | `practice_problems`、AI 三表、Roadmap/Forum 各表、zombie 三表 |

## 10. 还缺什么 / 待修改

### P0：影响上线或数据正确性

1. **Unit 4 登录限制只有前端生效。** 数据库修复包（`docs/database-reconciliation/`）只跑了只读预检，没执行。现在懂一点技术的人可以绕过前端直接调 RPC 看 Unit 4 内容。需要你授权后执行 `10_reconcile.sql`，再跑只读验收。
2. **发布后的真实学生账号验收没有记录。** 连续练习、Arena、80 道新题都缺这一步：两个学生账号走一遍答题 → 总览 → Review → 刷新重试 → 账号隔离，加手机端。
3. **Unit 1–3 视频与游戏发布情况未核实。** 这是上线周 P0。仓库里看不到内容录入记录，需要查库或让负责内容的人确认。
4. **Contact 页还没有。** About Us 页里也没有联系方式，而上线周计划把它列为 P0。

### P1：上线周计划内

5. **Arena 转录题还有 306 道草稿。** 按每批 20 道的流程继续发布，每批回读核验。
6. **Solution Requests**：楼层式答疑的代码已完成，在 `claude/affectionate-cray-oxc8o5` 分支，还没合进 `test-work`。上线顺序：先在 Supabase 执行 `docs/solution-requests/` 部署包 → 合进 `test-work` 测试 → 合进 `main` → 再做一个迁移，关掉旧页面用的直接读表。详见 `docs/solution-requests/README_ZH.md`。
7. **课程小游戏窗口适配**（backlog P1）：近期没有提交，状态未知。
8. **一节课合并多个 CB Topic、Super Admin 细化课程管理**（backlog P1）：还在设计阶段。

### P2：工程卫生

9. **分支约定**：日常修改在 `test-work`（推送后约 1 分钟测试站更新），测试通过后开 PR 合入 `main`，`main` 更新约 1 分钟后正式站上线。不要直接推 `main`。详见 `AGENTS.md`。测试站和正式站共用同一个 Supabase。已不再使用 Lovable 编辑器。
10. **多个 agent 都在写迁移，编号已经撞过一次。** 建议约定：新迁移前先 `git pull`，按当天日期加递增序号，提交前跑 `npm run test:migrations`。
11. **旧数据清理**：zombie profile 与相关函数、`profiles.role` 与 `user_roles` 不一致、公开 bucket 的大小/MIME 限制、旧 Edge Function 关闭 JWT 校验。这些是 9 月审计的发现，至今没处理。
12. **付款页**：只在上线周计划里列了设计（P2，收费首发时升 P0），目前没有任何实现。

## 11. 文档地图

| 想了解 | 看这里 |
|---|---|
| 当前待办 / 上线周 | `docs/PROJECT_BACKLOG_ZH.md`、`docs/LAUNCH_WEEK_2026-11-02_ZH.md` |
| Arena 游戏与正式题库接入 | `docs/arena/README_ZH.md`、`docs/arena/production/README_ZH.md` |
| 旧 Arena 题目转录进度 | `docs/arena/legacy-import/STATUS_ZH.md` |
| 迁移编号冲突与修复包 | `docs/MIGRATION_CONFLICT_2026-11-04_ZH.md`、`docs/database-reconciliation/README_ZH.md` |
| 课程维护与发布 | `docs/courses/README.md`、`docs/courses/improvements/STATUS.md` |
| 管理员权限 | `docs/admin-access/README.md`、`HANDOFF_ZH.md` |
| 题库生产流程 | `docs/question-bank/`（最新 V5） |
| CED 分类 | `docs/AP_CALCULUS_CED_TAXONOMY.md` |
