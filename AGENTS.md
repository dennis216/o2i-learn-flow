# O2I 协作约定

这是默认做法，不是硬性规定：情况特殊时按需调整，但请说明原因。

## 团队分工

| 人 | GitHub | 主要负责 | 个人分支 |
|---|---|---|---|
| Reeva | `ReevaYao` | 各板块都做；**唯一的数据库负责人** | `reeva` |
| Dennis | `dennis216` | 游戏、课程（Courses），有时做全局改动；仓库管理员 | `dennis` |
| Brian | 待补 | 游戏、练习（Practice） | `brian` |

游戏 Dennis 和 Brian 都会改：改之前在对应的 Issue 里说一声，避免两人同时改同一个文件。改别人负责的板块，也先在 Issue 里说。

## 任务记录

- 每件要做的事都开一个 GitHub Issue，写清做什么、谁负责、做完是什么样子；按板块打标签（`area: …`）。
- 讨论结果和决定写进 Issue 评论或 `docs/`，不要只留在聊天里。
- 提交或 PR 说明里写上 `#Issue号`；做完在 Issue 里写一句结论再关闭。AI 也照做。

## 分支与上线

```
reeva / dennis / brian  ──PR──▶  test-work（测试站）  ──PR──▶  main（正式站）  ──▶  backup-YYYY-MM-DD
```

- 每个人只在**自己的分支**上改。每天开工前先把 `test-work` 合进自己的分支：`git checkout <自己的分支> && git pull && git merge origin/test-work`。
- 自己分支推上去后，Cloudflare 会生成个人预览站：`https://<分支名>.o2i-website.pages.dev`，先在这里看效果。
- 做完一件事（最多一两天）就开 PR 合进 `test-work`，别攒很多再合，攒得越久冲突越多。别把做到一半、跑不起来的东西合进 `test-work`。
- `test-work` 的测试站：https://test-work.o2i-website.pages.dev 。大家都合进来以后在这里一起验收。
- 定期统一上线：开 PR 把 `test-work` 合进 `main`，`main` 更新后约 1 分钟正式站 https://www.o2iinstitute.org 自动上线。
- 合并 PR 都选 "Create a merge commit"（不要 squash）。合进 `main` 后把 `test-work` 快进到 `main`，让两者指向同一个提交。
- 不要直接推送到 `main` 或 `test-work`，都走 PR。如果有人直接改了 `main`，记得同步回 `test-work`。
- 大的更新合并进 `main` 后，把 `main` 另存一个备份分支 `backup-YYYY-MM-DD`（例如 `backup-2026-11-09`）。备份分支只保留最近两个：新建第三个时，删掉日期最早的那个。`feature/calc-quest-world` 先保留，不要清理。

## 数据库

- **只有 Reeva 写生产库**（执行迁移、部署包、改 Supabase 设置）。其他人和他们的 AI 只写迁移文件和部署包，交给 Reeva 执行，不要自己连生产库写入。
- 新迁移开工前先在 Issue 里占好版本号（`supabase/migrations/` 的文件名时间戳），避免两个人用同一个号。
- 部署沿用"只读预检 → 单事务部署 → 只读验收"，部署记录（时间、执行人、验收结果）写进对应的 `docs/` 目录。
- 依赖新数据库函数的前端，要等数据库部署完再合进 `test-work`。

## 界面风格

- 新页面和界面改动按 [docs/DESIGN.md](docs/DESIGN.md) 做（颜色、字体、版式、像素风组件都在里面），样板是首页。

## 注意

- 测试站、个人预览站和正式站共用同一个 Supabase 数据库。在测试站上的删除、发布、改数据都会直接影响学生；测试用测试账号。
- 数据库结构改动（`supabase/migrations`）会同时影响两边，要兼容正式站上还在运行的旧代码。
- 不要再用 Lovable 编辑器改代码，网站已迁到 Cloudflare Pages（项目 `o2i-website`）。
- 出问题需要回滚：Cloudflare → `o2i-website` → Deployments → 选上一个正常版本 → Rollback。
