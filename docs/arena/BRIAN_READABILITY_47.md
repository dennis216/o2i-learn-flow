# Brian：Arena 源码整理（#47）

## 改动范围

本次以 `7ea98010fc58f7c76691753b8d130e7d456b96fd` 为基线，只整理源码、翻译维护方式和测试。#41/#42 的界面和移动修改已先提交，本次不改玩法、伤害、刷怪、地图或视野。

- HTML 保留页面、字体、样式，通过同源 ES module 加载 `public/games/limit-arena.js`。
- JS 用固定版本 Prettier 格式化。保留既有变量名，今后修改函数时逐步改清楚。
- 中英文只维护在 JS 中：语言分支和静态标签映射。历史 JSON 移到 `scripts/arena/fixtures/legacy-zh-CN.json`，不是当前翻译源。
- 测试调用 `createArenaTestApi()` 的独立实例，不再截取源码片段再执行。测试实例不启动 DOM 事件或动画循环，不把调试接口挂到实际游戏窗口。
- 历史生成器同时禁止覆盖 HTML 和 JS，新增回归检查。字体扫描读取当前两份源码。
- HTML 和 JS 使用 `Cache-Control: no-cache`，避免拆分后缓存不同版本的文件。

## 分支与评审

因 #47 明确要求单独 PR，而 #41/#42 的 PR #48 尚未合并，本次使用个人工作分支 `brian-arena-readability`，PR 暂以 `brian` 为基线，只显示整理差异。这是为分开评审而采用的例外；不直接更新 `test-work` 或 `main`。#48 合入后再把本 PR 基线改为 `test-work`。

## 检查

- `npm run test:arena`：74/74 通过（原行为测试保留，补充实例隔离、运行时中英文和生成器保护）。
- `npm run check:arena:format`、TypeScript 检查、生产构建通过。
- AST 对比原有 936 个函数/回调：934 个函数体结构保持一致；仅外层运行时包装及启动包装因模块提取、语言处理函数提取而变化。
- WebKit、Chromium，1440×900、1180×820、844×390，中英文菜单、六把武器选择、开始、暂停/继续共 12 组通过。
- 实际模块游玩流程使用模拟题目桥接，不连接生产数据库写入。设备尺寸模拟不等于实体 iPad/iPhone 测试。
- 可选历史导入测试有 4 项环境失败；同环境原基线也有这 4 项：3 项 `python3` Windows 别名无执行权限、1 项无法创建目录链接。本次不修改历史导入工具或数据库文件。

## 日常修改

```sh
npm run format:arena
npm run check:arena:format
npm run test:arena
npm run build
```

之后到个人预览站实际玩一局。新文案需同时检查中英文；新增汉字需通过字体覆盖测试。不要用仓库外完整版重新生成当前游戏。
