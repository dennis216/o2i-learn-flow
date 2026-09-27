# O2I Learn Flow 项目全景说明

更新时间：2026-09-20
适用代码版本：本说明随 Git 提交一起保存
远程后端：Supabase 项目 `o2i institute web end`（project ref: `lxoaeaewcrshjkigzyqe`）

## 1. 先理解这个项目实际上由三套东西组成

```text
浏览器中的 React 网站
├── 原有网站功能 ──> Supabase 远程数据库 / Auth / Storage / Edge Functions
│   ├── Courses、视频、AI Tutor、Playground、Team、Solution Requests
│   └── Admin 内容后台
├── 新的自适应学习原型 ──> 浏览器 localStorage
│   ├── Learn、Lesson、Review、Quick Practice、Quiz
│   └── 暂时不写入 Supabase，换浏览器后数据不会自动同步
└── 账号与权限 ──> Supabase Auth + public.user_roles
    ├── super_admin：唯一 Top Admin
    ├── admin：内容管理员
    └── 普通登录用户
```

最重要的结论：**现在存在两套练习系统，而且尚未合并。**

1. 原项目的 `practice_problems`：Supabase 数据表和 Admin 表单已经存在，但远程表目前是 0 道题，结构也不足以支持完整的选择题、自适应推荐和答题轨迹。
2. 新自适应原型：有 8 道本地示例题、计时、错项轨迹、反馈和推荐算法，但数据只存在浏览器 localStorage，不是正式题库。

## 2. 技术结构

### 前端

- React 18 + TypeScript
- Vite 8
- React Router 7
- Tailwind CSS + shadcn/ui / Radix UI
- TanStack Query
- KaTeX / React Markdown
- Supabase JavaScript SDK

主要入口：

- `src/main.tsx`：挂载 React 应用。
- `src/App.tsx`：全局 Provider、导航栏和路由。
- `src/components/Navbar.tsx`：桌面与移动端导航。
- `src/index.css`：全局视觉变量和样式。

### 后端

- Supabase Auth：邮箱密码登录、邀请、密码重置。
- Supabase Postgres：课程、视频、用户、AI 对话等数据。
- Row Level Security：限制普通用户和管理员能做什么。
- Supabase Storage：图片、视频、头像等文件。
- Edge Functions：AI、邀请账号、确认账号和旧 zombie 数据生成逻辑。

### 本地运行

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 8080
```

访问：`http://127.0.0.1:8080/`

`.env` 包含 Supabase 前端连接信息，已被 `.gitignore` 排除，不会进入 Git。

## 3. 当前页面和路由

| 路由 | 页面 | 数据来源 | 当前状态 |
|---|---|---|---|
| `/` | 首页 | 前端静态内容 | 保留原 UI 和产品定位；Get Started 进入 Courses，Try Practice 进入练习 |
| `/auth` | 登录/注册 | Supabase Auth | 可用 |
| `/reset-password` | 密码重置 | Supabase Auth | 已修复 PKCE recovery code 交换 |
| `/profile` | 个人资料 | Auth + Profile/统计 | 可用；Top Admin 信息只读 |
| `/courses` | 课程库 | Supabase | 可用；前台筛选只显示指定科目 |
| `/practice` | Quick Practice | 本地原型 | 可用，但不是正式数据库题库 |
| `/quiz` | 自适应 5 题练习 | 本地题库 + localStorage | 可用原型 |
| `/learn` | 原型课程入口 | 本地静态内容 | 可用原型 |
| `/learn/:lessonId` | 原型课程播放器 | 本地静态内容 + localStorage | 模拟视频进度和学习信号 |
| `/review` | 复习中心 | localStorage | 可用原型 |
| `/practice/:videoId` | 原有视频配套题页 | Supabase + AI function | 页面存在，但数据库目前无 practice problems |
| `/ai-tutor` | 独立 AI Tutor | Supabase + Lovable AI function | 原项目已有；仍依赖外部 AI API |
| `/playground` | GeoGebra 工具库 | Supabase | 可用，当前 17 个链接 |
| `/solution-requests` | 用户求解请求 | Supabase + Storage | 可用，当前 2 条未处理请求 |
| `/team` | 团队页 | Supabase | 可用，当前 8 位成员 |
| `/admin` | 内容管理后台 | Supabase | Admin/Top Admin 可用 |

`Roadmaps`、`Forum`、`Discussion` 的前台页面和导航已按要求移除，但其数据库表与旧数据仍保留，没有删除。

## 4. 当前账号与权限

### 权限模型

| 角色 | 能做什么 | 不能做什么 |
|---|---|---|
| `super_admin` | 所有内容管理；邀请账号；授予/撤销 content admin；查看登录记录 | 不能通过网站改 UI、代码、数据库策略 |
| `admin` | 添加、修改、删除课程、视频、practice problems、subjects、team、playground 等内容 | 不能管理账号权限；不能改 UI、代码或数据库策略 |
| `instructor` | 旧数据模型中的 instructor 权限 | 当前后台邀请支持，但产品边界尚未完全整理 |
| 普通用户 | 学习、使用公开功能、提交自己的内容 | 不能进入 Admin |

当前远程 `user_roles`：

- 1 个 `super_admin`：O2I 官方 Top Admin。
- 4 个原项目已有的 `admin` 内容管理员，其中包括 Dennis/Ziquan 的旧账号。
- 旧管理员账号没有被删除、没有修改密码，目前已经是 `admin`。

授权判断以 `public.user_roles` 为准，不以 `profiles.role` 为准。旧数据库里多个管理员的 `profiles.role` 仍显示 `student`，这是遗留字段不一致，后续应该清理，但当前登录权限由 `user_roles` 正确控制。

### 本次用户列表问题

远程 `profiles` 共 1628 行，其中：

- 42 个真实账号 profile。
- 1586 个旧项目生成的 `zombie` 模拟 profile。

Supabase 默认单次最多返回 1000 行。原 Users 页面没有过滤 zombie，因此真实账号可能被截断，页面内搜索也找不到。本次已修改为只查询 `is_zombie = false` 的 42 个真实账号。

## 5. Admin 后台现在能管理什么

Admin Dashboard 目前有以下标签：

1. **Add Video**：关联课程，填写标题、单元、YouTube/视频 URL、顺序、描述、字幕、transcript、exam tips、notes 和 playground link。
2. **Create Course**：创建课程，填写标题、描述、level、subject、category、价格和图片。
3. **Practice**：创建原有格式的 practice problem，可关联视频并填写题目正文、解答、图片、unit/lesson 编号。
4. **Subjects**：管理前台科目元数据。
5. **Playground**：管理 GeoGebra 链接。
6. **Team**：管理团队成员和照片。
7. **Manage Videos**：编辑或删除现有视频。
8. **Courses**：编辑或删除现有课程。
9. **Users**：仅 Top Admin 可见；邀请 Student/Instructor/Content Admin、授予/撤销 admin、查看加入时间和网站记录的最近登录。

注意：当前 Practice 表单不是正式自适应题库编辑器。它没有稳定题目版本、选项、正确答案、难度、skill tags、misconception tags、审核状态和答题记录结构。

## 6. 远程数据库内容快照

### 核心内容

| 数据 | 数量 | 说明 |
|---|---:|---|
| Auth 登录账号 | 42 | 真实 Supabase Auth 用户 |
| Profiles | 1628 | 42 个真实 + 1586 个 zombie 模拟 profile |
| Role assignments | 5 | 1 Top Admin + 4 Content Admin |
| Login events | 14 | 新增的最小化网站登录记录；不存 IP/浏览器指纹 |
| Courses | 6 | 旧项目课程数据 |
| Course videos | 60 | 56 个 YouTube URL、3 个 Storage 路径、1 个空 URL |
| Practice problems | 0 | 正式表为空 |
| Subjects | 5 | 旧后台科目数据 |
| Playground links | 17 | AP Calculus BC GeoGebra 链接 |
| Team members | 8 | 数学、物理、化学团队 |
| Roadmaps | 3 | UI 已移除，数据保留 |
| Chapters / Sub-chapters | 0 / 0 | Roadmap 层级目前为空 |
| User progress | 0 | 原 roadmap progress 为空 |
| AI tutor sessions / chats | 18 / 32 | 原项目 AI 对话数据 |
| AI summaries | 0 | 暂无持久化总结 |
| Solution requests | 2 | 均为 pending |
| Forum posts / discussion replies | 11 / 1 | UI 已移除，数据保留 |
| Zombie topics / comments | 8 / 12 | 旧模拟社区系统 |
| Pending zombie comments | 0 | 当前没有待发模拟评论 |

### 6 个课程和视频数量

| 课程 | Subject | 视频数 | 前台当前是否容易看到 |
|---|---|---:|---|
| AP Calculus Practice Questions | AP Calc | 29 | 是 |
| AP Calculus AB | AP Calc | 4 | 是 |
| Pre-Calculus 12 | Pre-Calculus 12 | 15 | 是 |
| Counting and Probability | Counting & Prob 1 | 4 | 当前筛选隐藏 |
| Intro to Geometry | Geo 1 (Intro) | 4 | 当前筛选隐藏 |
| Intro to Algebra | Alg 1 (Intro) | 4 | 当前筛选隐藏 |

前台课程筛选目前只保留：

- High School：AP Calc、Stats、Precalc、SAT Math。
- Contest：AMC 10、AMC 12。

数据库中的旧课程没有删除，只是部分不在当前筛选项中。

### 5 个数据库 Subjects

- Alg 1 (Intro)
- AP Calc
- Counting & Prob 1
- Geo 1 (Intro)
- Pre-Calculus 12

### 3 个保留但未显示的 Roadmaps

- Qualify for AIME through AMC 10
- Qualify for AIME through AMC 12
- 750+ Math SAT

### 17 个 Playground 内容

全部是 AP Calculus BC Unit 9–10 的 GeoGebra 工具，覆盖 parametric curves、vectors、polar coordinates、series、convergence tests、Taylor/Maclaurin series 和 error bounds。

### 团队内容

共 8 位成员，分为数学组、物理组、化学组。Team 表与登录账号表互相独立；一个人在 Team 页面出现不代表其拥有管理员账号。

## 7. 当前 Supabase 表结构

| 表 | 用途 | 当前是否仍被主要 UI 使用 |
|---|---|---|
| `profiles` | 用户公开资料，包含真实与 zombie profile | 是 |
| `user_roles` | 实际授权角色 | 是，权限核心 |
| `user_login_events` | 最小化登录记录 | 是，Top Admin Users 页面 |
| `admin_emails` | 旧的管理员邮箱表 | 遗留；不应再作为授权来源 |
| `courses` | 课程 | 是 |
| `course_videos` | 课程视频、transcript、notes 等 | 是 |
| `practice_problems` | 旧格式视频配套题 | 页面和后台存在，但当前 0 行 |
| `subjects` | 后台 subject 列表 | 是 |
| `playground_links` | GeoGebra 资源 | 是 |
| `team_members` | Team 页面 | 是 |
| `solution_requests` | 用户求解请求 | 是 |
| `ai_tutor_sessions` | AI 对话 session | 是 |
| `ai_tutor_chats` | AI 消息 | 是 |
| `ai_summaries` | AI 总结 | 结构存在，当前为空 |
| `roadmaps` | 旧 roadmap 顶层 | UI 已移除 |
| `chapters` | Roadmap chapter | UI 已移除，当前为空 |
| `sub_chapters` | Roadmap subchapter | UI 已移除，当前为空 |
| `video_lessons` | Roadmap 视频 | UI 已移除，当前为空 |
| `user_progress` | Roadmap 完成进度 | UI 已移除，当前为空 |
| `forum_posts` | 旧论坛主题 | UI 已移除，数据保留 |
| `discussion_posts` | 旧论坛讨论 | UI 已移除，数据保留 |
| `post_replies` | 旧回复结构 | UI 已移除，当前为空 |
| `zombie_topics` | 模拟论坛话题模板 | 遗留 |
| `zombie_comments` | 模拟评论模板 | 遗留 |
| `pending_zombie_comments` | 模拟评论调度 | 遗留，当前为空 |

## 8. Storage 文件桶

| Bucket | Public | 用途 |
|---|---|---|
| `course-images` | 是 | 课程图片 |
| `avatars` | 是 | 用户头像 |
| `roadmap-videos` | 是 | 旧 roadmap 视频 |
| `course-videos` | 是 | 直接上传的课程视频 |
| `practice-images` | 是 | 练习题图片 |
| `team-photos` | 是 | 团队照片 |
| `solution-images` | 否 | 用户题目/答案图片 |

当前所有公开 bucket 都没有文件大小和 MIME type 限制，这是后续上线前需要收紧的配置。

## 9. Edge Functions

远程部署了 9 个函数：

| Function | 用途 | Gateway JWT |
|---|---|---|
| `admin-invite-user` | Top Admin 邀请账号并分配角色 | 开启 |
| `force-confirm-user` | Top Admin 确认用户邮箱 | 开启 |
| `ai-tutor` | 课程内 AI | 关闭；函数代码自行验证用户 |
| `ai-tutor-standalone` | 独立 AI Tutor | 关闭；函数代码自行验证用户 |
| `generate-practice-question` | 旧 AI 生成题功能 | 关闭；函数代码自行验证用户 |
| `generate-zombie-users` | 生成模拟 profile | 关闭；依赖 URL secret |
| `zombie-daily-post` | 生成模拟帖子 | 关闭；依赖 URL secret |
| `zombie-process-comments` | 发布模拟评论 | 关闭；依赖 URL secret |
| `zombie-schedule-comments-for-post` | 调度模拟评论 | 关闭；依赖 URL secret |

AI 函数依赖 `LOVABLE_API_KEY`，因此仍有 API 成本。新的自适应算法不调用这些 AI 函数生成每套题。

## 10. 新自适应学习原型

### 已有功能

- 课程视频长暂停、用户确认复习点、Ask AI 信号。
- 按 skill 生成复习卡。
- Quick Practice 与课后 quiz 共用同一个选择算法。
- Easy 3 分钟、Medium 5 分钟、Hard 10 分钟目标时间。
- 正确但超时保留“正确”，同时标记需要复习。
- 记录学生点过的全部选项轨迹，不只记录最终答案。
- 错误选项可以绑定 educator-authored misconception tags。
- 下一套题考虑 correctness、time、Ask AI、pause、misconception 和重复题惩罚。
- 8 个自动化算法测试均通过。

### 本地示例内容

- Subjects：AP Calculus 可用；Physics 和 Chemistry 仅为占位。
- Courses：1 个 AP Calculus pilot，Physics/Chemistry 各 1 个未开放占位。
- Skills：4 个（limit meaning、limit algebra、continuity、derivative definition）。
- Lessons：3 个，其中 2 个 ready、1 个 coming soon。
- Questions：8 道 AP Calculus MCQ 示例题。

### 尚未完成

- 没有写入 Supabase。
- 没有正式、可版本化的题库表。
- 没有 Admin 题库编辑器或批量导入。
- 没有真实视频和本地 prototype lesson 的绑定。
- 没有跨设备学习记录。
- 没有 FRQ 可靠评分流程。
- 没有基于真实 pilot 数据校准 3/5/10 分钟阈值。

## 11. 原项目已有 vs 后续新增/修改

### 下载 ZIP 时原项目已经存在

- 原首页 UI、品牌定位和大部分 public pages。
- Supabase 项目、Auth、数据库 migrations、Storage buckets。
- Courses、60 个视频及课程播放器。
- Admin Dashboard 及课程、视频、practice、subjects、team、playground CRUD。
- AI Tutor、AI 生成练习、AI summary/notes 等 Lovable AI 调用。
- Team、Playground、Solution Requests。
- Forum、Roadmaps 和 zombie 模拟社区系统。
- 多个原有 admin 账号和 42 个真实账号。
- 1586 个 zombie 模拟 profiles。

### 本轮工作新增或修改

1. 建立下载 ZIP 后的本地 Git baseline。
2. 更新有安全公告的依赖；当前 `npm audit --omit=dev` 为 0 个已知漏洞。
3. 新增 subject-agnostic 自适应选择算法与 8 项测试。
4. 新增 Learn → Lesson → Review → Quiz/Quick Practice 的 localStorage 交互原型。
5. 按要求恢复原首页/UI/Logo，并将 public copy 保持英文。
6. 按要求从前台移除 Roadmap、Forum 和 Discussion，不删除后端数据。
7. 缩减 Courses 筛选到 AP Calc、Stats、Precalc、SAT Math、AMC 10、AMC 12。
8. Get Started 改为进入 Courses，Explore Courses 改为 Try Practice。
9. 新增单一 `super_admin`、Content Admin、账号邀请、角色管理和登录记录。
10. 将 O2I 官方邮箱设为唯一 Top Admin；原管理员账号保留为 Content Admin。
11. 修复 Supabase 密码重置 recovery code 回调。
12. 修复 Users 页面被 zombie profiles 截断的问题，只显示真实账号。

## 12. 当前质量与风险

### 已验证

- TypeScript 检查通过。
- Vite production build 通过。
- 自适应算法 8/8 tests 通过。
- `npm audit --omit=dev`：0 个已知漏洞。
- Top Admin 登录、Profile badge 和 Admin Dashboard 已由实际截图确认。

### 明确存在的问题

1. **Git 没有 remote**：当前 commit 只保存在这台电脑，不是 GitHub 云备份。
2. **正式题库为空**：`practice_problems` 为 0，新的 8 题仍只是本地原型。
3. **两套学习系统未合并**：Supabase Courses 和 local prototype Learn/Quiz 是两条数据链。
4. **zombie 数据污染用户列表**：已在 Admin UI 过滤，但 1586 条模拟 profile 仍在数据库。
5. **旧 Forum/Roadmap 后端仍存在**：前台删除不等于数据库删除。
6. **Content Admin 不止一个**：远程仍有 4 个原项目 admin，需要团队确认哪些应继续保留。
7. **遗留角色字段不一致**：`profiles.role` 与 `user_roles` 不一致，实际权限以 `user_roles` 为准。
8. **视频数据需要清洗**：1 条视频 URL 为空；部分 URL/标题重复；所有 duration 基本为空。
9. **公开 Storage bucket 限制不足**：未设置大小和 MIME 限制。
10. **Edge Function 暴露面较大**：旧 AI/zombie functions 的 gateway JWT 关闭；虽有代码内鉴权或 secret，仍应单独安全审查。
11. **代码 lint 技术债**：全项目 ESLint 当前为 57 errors / 20 warnings，主要来自原有后台、GeoGebra、AI 页面和 UI 模板。
12. **尚未部署正式可分享站点**：当前主要使用本机 `127.0.0.1:8080`。

## 13. Git 存档状态

当前仓库是本地 Git，历史从下载 ZIP 后的 baseline 开始。关键节点：

- `22f2e70`：下载 ZIP 后的原始 baseline。
- `b644105`：自适应算法 foundation。
- `c5e95d7`：交互式学习闭环原型。
- `ba4d736`：恢复原 UI，并整合学习原型。
- `2bd6e10`：删减导航和课程筛选。
- `0050c8f`：安全的 Top Admin / Content Admin 系统。
- `c423fe7`：修复密码重置回调。
- 本说明所在的新 commit：修复真实用户列表并保存完整项目审计。

因为没有配置 `git remote`，以上 commit 目前都只存在本机。要形成真正的异地备份，下一步需要确定官方 GitHub repository，然后添加 remote 并 push。

## 14. 建议的下一步顺序

1. **先连接官方 GitHub 并 push**，避免电脑损坏导致本地 Git 一起丢失。
2. **团队确认 4 个现有 Content Admin**，撤销不再需要的账号权限。
3. **停止/隔离 zombie 系统**，确认是否保留旧 Forum 数据，再决定归档或删除。
4. **视频先采用 YouTube Unlisted** 做 pilot，后台继续保存 URL；付费/私密课程再迁移 Cloudflare Stream。
5. **设计正式题库 schema**：questions、versions、options、skills、misconceptions、sessions、attempts、events、learner_skill_state。
6. **把 Admin Practice 改成真正的题库编辑器**，支持审核状态、批量导入和版本管理。
7. **将自适应原型接入 Supabase**，统一 Courses/Video/Quiz 数据链。
8. **清理 lint 和视频脏数据**，然后再做公开部署。
