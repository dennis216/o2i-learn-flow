# Limit Arena 上线说明

游戏在 `/arena`，必须登录才能玩。完整题库不打包进公开游戏文件；服务器每次只发一道题，提交后才返回正确答案和解析。

```text
浏览器：public/games/limit-arena.html（只有游戏本身）
  │ postMessage
/arena 页面（src/pages/Arena.tsx，带登录状态）
  │ supabase.rpc
数据库：arena_practice_catalog / arena_practice_next_question / arena_practice_submit_answer
  ├─ questions / question_versions / question_options（正式题库）
  ├─ question_practice_sessions / items / attempts（统一学习记录，source=arena）
  └─ arena_practice_issues（冻结的显示选项顺序）
```

## 当前接入：正式题库

游戏已改为从正式题库取题，游戏答题进入总览和 Practice Review，并标记 Arena；第一版不参与普通练习自适应。题目、选项和解析通过 Practice 同款 Markdown/公式渲染，保留图片和表格。中英文切换继续只翻译游戏 UI。

发布请使用 [正式题库接入发布包](production/README_ZH.md)，任务和验收边界见 [任务清单](FORMAL_QUESTION_BANK_TASKS_ZH.md)。新前端必须在数据库前置和接入迁移部署并核验后发布。旧 Arena 数据保留，不会自动进入正式学习记录。

以下是旧独立题库的历史构建和部署说明；不用于当前正式题库接入。此前生产只读核对发现旧 Arena 两张表已存在而账本未登记，禁止直接重跑旧建表迁移或重新导入旧题。

## 旧独立题库上线顺序（历史参考）

**第 0 步：先把 GitHub 仓库改成私有。** 这一步完成前，不要推送这个分支。

1. 先核对对象和账本。当前生产已有旧 Arena 对象，使用[目录校验及登记修复包](../database-reconciliation/README_ZH.md)，不要执行原建表脚本。只有已确认没有任何旧 Arena 对象的全新环境，才可通过迁移工具安装 `20261104000100_arena_game.sql` 并登记；SQL Editor 直接执行源文件不会自动登记。
2. 导入题库。题库文件不在仓库里，由 `prepare-game.mjs` 生成：

   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
   node scripts/arena/import-questions.mjs /仓库外的路径/limit-arena-questions.json
   ```

   service-role key 能绕过全部数据库权限，只能放在环境变量里，不能写进代码。
3. 确认结果：脚本最后应显示 `Table now holds 471`。
4. 部署前端，用普通账号登录后玩到第一次升级，确认能看到题目、提交后能看到解析。

顺序不能反：数据库和题库必须先就绪，否则玩家升级时只会看到“服务器无响应”的基础奖励。

## 更新游戏

**直接维护仓库里的两个游戏源码文件：`public/games/limit-arena.html`（页面、字体、样式）和 `public/games/limit-arena.js`（游戏逻辑、中英文 UI）。**（#47）

知识点联动玩法（题碑、单元技能、小首领与装备、管理员测试速度）在 `public/games/arena-knowledge.js`，规则和数值见 [DENNIS_KNOWLEDGE_FLOW_55.md](DENNIS_KNOWLEDGE_FLOW_55.md)（#55）。

- 以前这个文件由 `prepare-game.mjs` 从仓库外的完整版生成。Brian 在 #41/#42（PR #46）里直接改了这个文件，这些改动只存在于仓库里；再从完整版生成会把它们全部覆盖。
- 所以 `prepare-game.mjs` 拒绝写入这两个源码文件，只能用 `--out <别的路径>` 生成一份对照用的副本。
- 仓库外的完整版只做存档，不再修改。当初放在仓库外是因为它带着题库；现在题目由服务器发，这个理由已不成立。
- JS 已用 Prettier 恢复缩进换行。改完运行 `npm run format:arena`、`npm run check:arena:format` 和 `npm run test:arena`，再在个人预览站玩一局。
- 单字母变量不会由格式化自动恢复。以后修改某个函数时，再逐步改清楚相关名字，避免一次重写整个引擎。
- 万一文件被覆盖了，从最后确认正常的提交恢复这两个文件；不要用仓库外存档生成覆盖，也不要默认恢复到还没合入个人修改的分支。

旧流程（仅供查阅，不要再用来更新游戏）：

```bash
npm install --no-save esbuild typescript
node scripts/arena/prepare-game.mjs <完整版.html> --questions <仓库外路径.json> --out <仓库外的对照副本.html>
```

## 语言切换

游戏右上角可以切换 English / 中文，选择保存在玩家的浏览器里。首次打开时，浏览器语言是中文就显示中文。进行中的一局切换语言会先确认，接受后重新加载；取消则继续当前一局。

**题目、选项和解析始终是英文**，它们是服务器发来的数据，不会被翻译。翻译只作用于游戏代码里的文字：

- 统一在 `public/games/limit-arena.js` 维护中英文文案（知识点联动玩法的文案在 `arena-knowledge.js` 的数据表里）（`i` 语言分支，以及同文件的静态标签映射 `legacyStaticTranslations`）。新增 UI 同时写两种语言，不增加另一份运行时 JSON 词表。
- 旧 JSON 移到 `scripts/arena/fixtures/legacy-zh-CN.json`，仅供历史生成器对照和归档测试。它不是当前游戏翻译源，修改它不会更新 UI。
- 新汉字由测试检查字体子集覆盖。必要时用完整版 Cubic 11 字体运行 `python scripts/arena/subset-zh-font.py <Cubic_11.ttf>` 重建；脚本扫描当前 HTML 和 JS。字体授权见 `scripts/arena/fonts/Cubic-11-OFL.txt`。
- 新增文字如果只写了英文，会继续显示英文，不会报错，发布前要切到中文检查一遍。

## 能防什么，不能防什么

- 未登录用户拿不到题目；任何客户端都不能直接读题库表。
- 提交之前拿不到答案和解析，同一次发题只有第一次作答有效。
- 每个账号限制为每分钟 30 题、每 24 小时 300 题，改动时修改 `arena_next_question` 里的 `per_minute` 和 `per_day`。超限时游戏发基础奖励，不会卡住。
- 防不住有账号的人慢慢抄题：旧独立题库的 471 题按旧限流约两天可被一个账号逐题收集；当前正式题库的可用数量取决于已发布且符合游戏格式的题目，限流不能彻底防止收集。
- 游戏引擎和美术会被下载到浏览器；格式化后的 JS 可读，不能用于保存秘密或完整题库。
- 分数目前只在浏览器本地计算和保存，以后做排行榜要改成由服务器记录。

## 测试

行为测试通过 `scripts/arena/test-runtime.mjs` 调用 JS 导出的 `createArenaTestApi()`，每次创建独立状态并注入画布、时钟和 DOM 替身；不再按代码原文的字符串位置截取函数。接口不会挂在游戏窗口上，测试实例不会启动浏览器动画循环。页面入口还会用 Acorn 检查模块语法。

```bash
npm run test:arena
ARENA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/一次性测试库 npm run test:arena:db
```

数据库测试会创建角色和测试数据，只能连一次性的本地数据库。
