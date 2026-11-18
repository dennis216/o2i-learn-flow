# Brian：竞技场在电脑、iPad、iPhone 上的适配（#41）

以 `186d3f4`（`brian-arena-nov17`）为基线，只改布局和提示文字，不改玩法、伤害、刷怪或题目。

## 测到的问题和改法

| 问题 | 设备 | 改法 |
|---|---|---|
| Pause / Exit 固定 52×48px：手机上太大（竖屏画面只有约 220px 高），电脑上太小 | 全部 | 尺寸跟着游戏画面短边走：`clamp(34px, 8cqmin, 72px)`。实测 iPhone 竖屏/横屏 34px、iPad 竖屏 37px、iPad 横屏 53px、电脑 1440×900 65px；图标和文字按比例缩放 |
| Auto-lock 按钮在全屏时压在画面下面，iPhone 上点不到 | 手机、iPad | 移进 `.tpad` 触屏按钮层，放在 Pause 下方，同样按画面缩放 |
| 右上角 HUD（LV / KILLS / QUIZ）只在触屏时避开 Pause；电脑上 Exit 压住 "LV" | 全部 | `topRightControlOffset()` 取右上角所有可见按钮（Pause、Exit、Auto-lock）的最低点，HUD 排在它下面 |
| 菜单页 Exit 变大后会碰到语言 / 音乐 / 音效按钮 | 全部 | 菜单的 header 按 Exit 尺寸往左让 |
| 英文提示 `(locked > marked > nearest)` 的 `>` 显示成 "?" | 全部 | 像素字体补 `> < = ; " * ^ _ # [ ] → ←` |
| 触屏设备上显示键盘提示：WASD、Press E、(Enter)、keys 1–9 | 手机、iPad | 新手提示按设备区分（拖动移动、点敌人锁定、点冲刺/技能按钮）；菜单里的键盘提示包进 `.kbd-hint`，触屏时隐藏 |
| 第 3 步（单元与难度）的"开始"按钮在长列表最底部，竖屏要滑很久 | iPhone 竖屏 | 按钮行 `position: sticky` 固定在面板底部；窄屏时摘要放在按钮上方 |
| 竖屏开局后画面只有一条 | iPhone 竖屏 | 开局时也提示一次横屏（16:9 设计不变） |

## 检查

- `npm run test:arena`：82/82 通过（含中文字体覆盖）。
- `prettier --check public/games/limit-arena.js` 通过。其余文件在 Windows 上因 `core.autocrlf=true` 被检出为 CRLF 而报格式警告，与本次改动无关。
- 用本地测试页（同源 iframe + 模拟题目桥接，不连生产库）在 1440×900、1180×750、820×1106、844×360、390×664 上走完菜单、三步选择、开局、暂停，并点击 Auto-lock 和 Pause；中英文都看过。
- 尺寸模拟不等于实体设备；宽度 ≥768 时浏览器不模拟触屏，iPad 和手机横屏是手动打开触屏模式测的。升级答题界面只检查了 Exit 位置规则，没有在本地实际触发升级。
