# O2I 协作约定

这是默认做法，不是硬性规定：情况特殊时按需调整，但请说明原因。

## 分支与上线

- 日常改动直接在 `test-work` 上做。开工前先 `git pull origin test-work`。
- 推到 `test-work` 后约 1 分钟，测试站自动更新：https://test-work.o2i-website.pages.dev
- 测试没问题后，开 PR 把 `test-work` 合并进 `main`；`main` 一更新，正式站 https://www.o2iinstitute.org 约 1 分钟后自动上线。
- 不要直接推送到 `main`。如果有人直接改了 `main`，记得把它同步回 `test-work`。
- 尽量少量多次提交、每次一件事，并让 `test-work` 保持能正常运行（别把做到一半的东西推上去）。
- 需要好几天的大改动，或多人同时改同一块文件时，可以临时开分支；合并后及时删除。
- 合并 PR 时选 "Create a merge commit"（不要 squash）。合并后 `main` 和 `test-work` 应指向同一个提交：把 `test-work` 快进到 `main`。
- 大的更新合并进 `main` 后，把 `main` 另存一个备份分支 `backup-YYYY-MM-DD`（例如 `backup-2026-11-09`），方便回溯。备份分支只保留最近两个：新建第三个时，删掉日期最早的那个。`feature/calc-quest-world` 先保留，不要清理。

## 注意

- 测试站和正式站共用同一个 Supabase 数据库。在测试站上的删除、发布、改数据都会直接影响学生；测试用测试账号。
- 数据库结构改动（`supabase/migrations`）会同时影响两边，要兼容正式站上还在运行的旧代码。
- 不要再用 Lovable 编辑器改代码，网站已迁到 Cloudflare Pages（项目 `o2i-website`）。
- 出问题需要回滚：Cloudflare → `o2i-website` → Deployments → 选上一个正常版本 → Rollback。
