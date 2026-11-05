# Limit Arena 上线说明

游戏在 `/arena`，必须登录才能玩。题目、答案和解析只存在 Supabase，不进仓库，也不进前端。

```text
浏览器：public/games/limit-arena.html（只有游戏本身）
  │ postMessage
/arena 页面（src/pages/Arena.tsx，带登录状态）
  │ supabase.rpc
数据库：arena_catalog / arena_next_question / arena_submit_answer
  └─ arena_questions（题库）、arena_question_issues（发题和作答记录）
```

## 上线顺序

**第 0 步：先把 GitHub 仓库改成私有。** 这一步完成前，不要推送这个分支。

1. 在 Supabase SQL Editor 执行 `supabase/migrations/20261104000100_arena_game.sql`。
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

完整版 HTML（含题库）只保存在仓库外。拿到新版本后运行：

```bash
npm install --no-save esbuild typescript
node scripts/arena/prepare-game.mjs <完整版.html> --questions <仓库外路径.json>
npm run test:arena
```

脚本依赖游戏代码的具体写法，新版本改动过这些地方时会直接报错，不会悄悄产出错误文件。
题目有改动时，重新运行导入脚本：相同 id 会被覆盖。要下架题目，把 `active` 改成 false。

## 语言切换

游戏右上角可以切换 English / 中文，选择保存在玩家的浏览器里。首次打开时，浏览器语言是中文就显示中文。切换会重新加载游戏，所以进行中的一局里不能切换。

**题目、选项和解析始终是英文**，它们是服务器发来的数据，不会被翻译。翻译只作用于游戏代码里的文字：

- 词表在 `scripts/arena/zh-CN.json`，运行 `prepare-game.mjs` 时写入游戏。
- 模板用 `{}` 按顺序占位，需要调整顺序或省略时用 `{0}`、`{1}`。
- 词表用到新汉字时，构建会报错。用完整版 Cubic 11 字体运行 `python3 scripts/arena/subset-zh-font.py <Cubic_11.ttf>` 重建字体子集。字体授权见 `scripts/arena/fonts/Cubic-11-OFL.txt`。
- 新版游戏如果增加了文字，没进词表的部分会继续显示英文，不会报错，发布前要切到中文检查一遍。

## 能防什么，不能防什么

- 未登录用户拿不到题目；任何客户端都不能直接读题库表。
- 提交之前拿不到答案和解析，同一次发题只有第一次作答有效。
- 每个账号限制为每分钟 30 题、每 24 小时 300 题，改动时修改 `arena_next_question` 里的 `per_minute` 和 `per_day`。超限时游戏发基础奖励，不会卡住。
- 防不住有账号的人慢慢抄题：按上限算，一个账号约两天可以看到全部 471 题。
- 游戏引擎和美术会被下载到浏览器，已压缩混淆，但无法彻底隐藏。
- 分数目前只在浏览器本地计算和保存，以后做排行榜要改成由服务器记录。

## 测试

```bash
npm run test:arena
ARENA_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/一次性测试库 npm run test:arena:db
```

数据库测试会创建角色和测试数据，只能连一次性的本地数据库。
