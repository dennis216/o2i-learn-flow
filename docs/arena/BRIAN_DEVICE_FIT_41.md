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

后续（按 Brian 要求）：
- 手机和平板上不再显示 Auto-lock 按钮，自动锁定保持开启；电脑键盘仍可按 L 切换。
- 手机和 iPad（包括接了触控板或键盘的 iPad，按 `body.touch` 判断）只显示方形 "Exit"，不显示 Esc 标记、触屏按钮上的 "Shift ·" / "E ·"、暂停页的 (Esc) / (L)、答题页底部的 A–D 提示，也不显示 - / +。电脑保持 Dennis 的 "Exit full screen [Esc]" 横条和 - / +。游戏左上角 HUD 里的 SHIFT / E 保留。
- 手机/iPad 窗口模式（玩家点过 Exit 后会记住）下，暂停、答题、选择等面板打开时隐藏 "Full" 按钮，避免它浮在面板中间。

## 横屏只在战斗时要求（Brian 要求：选枪竖屏、进游戏横屏）

- 原来点 Start（进入选英雄之前）就请求原生全屏并锁横屏，选英雄 / 选枪也被锁成横的。现在点 Start 只进全屏不锁方向；开局（`I === "play"`）时 `lockLandscapeForRun()` 才锁横屏，回到标题 / 结算时 `releaseLandscape()` 解锁。只有安卓类浏览器支持锁方向。
- iPhone / iPad 无法锁方向：战斗中竖着拿时，`syncLandscapeGate()`（每帧检查）自动暂停并显示"请把设备横过来"；横过来后自动继续。菜单、选择、答题、结算不拦。Exit 在提示层上方，可以直接退出；退出后提示层消失，保持暂停，由玩家自己继续。只在展开（全屏）播放器中生效；电脑不受影响。
- 去掉了菜单阶段的"建议横屏"提示（新增的提示层取代）。`public-game.test.mjs` 相应更新，并新增竖屏暂停 / 横屏继续的测试。

## 与 test-work 上 Dennis 全屏控制（98efde6）的合并

`test-work` 已有 Dennis 的全屏改动：记住是否全屏、电脑上 Exit 变成带 Esc 标记的横条、全屏时 - / + 调游戏大小。合并时两边都保留：

- `limit-arena.html` 的按钮层同时有 Auto-lock（本次）和 - / + 控件（Dennis）。
- 电脑上的 Exit 横条保留 Dennis 的横排和 Esc 标记，高度、图标、文字按画面缩放；- / + 排在横条下方，不再固定 72px。
- 电脑主菜单右上角改为竖排：语言 / 音乐 / 音效 → Exit 横条 → - / +。合并前横条（约 206px 宽）会压住音乐和音效按钮。
- 触屏设备不变：方形 Pause / Exit，没有 - / +。

## 检查

- `npm run test:arena`：82/82 通过（含中文字体覆盖）。
- `prettier --check public/games/limit-arena.js` 通过。其余文件在 Windows 上因 `core.autocrlf=true` 被检出为 CRLF 而报格式警告，与本次改动无关。
- 用本地测试页（同源 iframe + 模拟题目桥接，不连生产库）在 1440×900、1180×750、820×1106、844×360、390×664 上走完菜单、三步选择、开局、暂停，并点击 Auto-lock 和 Pause；中英文都看过。
- 尺寸模拟不等于实体设备；宽度 ≥768 时浏览器不模拟触屏，iPad 和手机横屏是手动打开触屏模式测的。升级答题界面只检查了 Exit 位置规则，没有在本地实际触发升级。
