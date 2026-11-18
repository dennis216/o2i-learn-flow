# O2I 界面风格规范

新页面和改版都按这份来。以首页（`src/pages/Index.tsx`）为样板；拿不准时照首页做。

## 深绿本地试版（2026-11-16，#49）

Brian 最新方向：不再追求液态玻璃，改为整站深森林绿背景、暖白文字与香槟金强调。仅本地试验，暂不推送、不更新 PR #48、不部署。以下规则优先于旧版蓝色规范。

- 导航、首屏、内容区、课程卡片、弹窗和页脚统一使用深绿色表面；首屏无白边，取消发光无限符号和玻璃浮层。最新布局以文末“本地最新调整”为准：纹章只放在左上角站名旁，首屏使用细线数学示意图。
- 英文首屏标题使用 Georgia 衬线字体，中文保留系统无衬线字体；内容区使用编号、细边框与留白；通过深绿底色、稍浅卡片和边框区分层次。
- 颜色统一放在 `src/index.css` 的 token 中；共享导航、按钮和卡片同步使用绿色系，正文保持高对比。
- 遵循减少动态效果与高对比偏好；不依赖背景模糊。
- 游戏源码、数据库、权限与课程内容保持原样；游戏展示继续使用像素风。

## 品牌

- 名称 **O2I Institute**，口号 **One to Infinity**（1 → ∞）。
- 三个特点，首页和各功能页的文案都围绕它们写：**自适应**（答错换简单的，连对三题升难度）、**个人化**（看到自己哪些知识点要多练，自己的题可以问老师）、**玩中学**（像素冒险视频课 + 极限竞技场）。每次都配上具体做法，不只写这三个词。
- 吉祥物：猫头鹰 **Dr. Owler / 欧鸮博士**（像素形象，`src/components/PixelOwl.tsx`）。
- 文案：说具体的事（教什么、点了去哪），不写 "comprehensive / unlock your potential" 这类套话。中英文都要写，用 `t('English', '中文')`。
- 做减法：一个区块一个标题，说明最多一句；同一件事只说一次（按钮说了去哪，就不再配一段解释）。

## 颜色

只用 `src/index.css` 里的 token，不要在组件里写新的十六进制色或 `text-green-700` 这类固定色。

| 用途 | 类名 |
|---|---|
| 主色蓝（按钮、链接、品牌字；首页主视觉整块蓝底） | `primary` |
| 强调黄（蓝底上的主按钮、高亮、点缀，不做大面积底色） | `accent` |
| 正文 / 次要文字 | `foreground` / `muted-foreground` |
| 功能图标块 | `--education-blue` / `--education-orange` / `--education-teal` |

黄底上的文字和图标用深色，不用白色（对比度不够）。

## 字体

- 正文和标题：`font-sans`（IBM Plex Sans，中文走系统字体）。
- 像素小标签：`font-pixel`（Silkscreen，只有英文字符，只用于 `HudTag`、`NameTag` 这类短标签）。
- 页面主标题：`text-4xl sm:text-5xl font-bold tracking-tight`（首页主视觉可到 `lg:text-6xl`）；区块标题：`text-2xl sm:text-3xl font-bold`。
- 中文标题行距要放宽（`leading-[1.35]`）；中文页面加 `break-keep [overflow-wrap:anywhere]`，只在标点处换行。

## 版式

- 内容宽度 `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`；区块上下 `py-14 sm:py-20`。
- 整块纯色只有两处：首页主视觉（蓝底方格纸 + 黄色 1 → ∞ 曲线）和像素风区块。其余区块白底或 `bg-muted/60`，不加渐变装饰。
- 标题和正文左对齐，和内容宽度的左边线对齐。
- 卡片：无边框，圆角 `rounded-2xl`；入口卡片用自己功能色的浅底（见首页 `features`），整张卡就是链接，里面不再放按钮。
- 按钮写清楚去哪（"浏览课程"），不写 "了解更多"。一个区块最多一个实心主按钮（白底上蓝色，蓝底上黄色，`h-12 px-8 text-base font-semibold`）；次要操作用带下划线的文字链接，不用第二个按钮。
- 图标用 lucide，不用 emoji；功能图标放在彩色圆角方块里（见首页 `features`）。
- 功能页开头统一用 `src/components/PageHeader.tsx`：功能色图标块 + 标题 + 一句说明，页面唯一的主按钮放在右侧（课程蓝、练习青、答疑黄、互动工具紫）。不再做居中的渐变头图、标题上方的小标签和步骤说明。
- 筛选统一用 `src/components/FilterChips.tsx`：一行药丸，选中的是浅蓝底，不是实心蓝，实心蓝留给主按钮。能一层选完就不要两层。
- 列表里每一项不要各带一个按钮：整项可点（卡片或一行），标题就是链接。
- 未登录 / 空状态 / 加载中：都要给一句说明和一个明确的按钮，不要只留一行字和大片空白。

## 动效

- 区块进入视野时淡入：用 `src/components/Reveal.tsx` 包一层。
- 只在用户操作时加悬停动效；全站已对"减少动态效果"做了降级，新动画用 `motion-safe:` / `motion-reduce:`。

## 像素风（只用在和游戏、视频有关的地方）

组件在 `src/components/PixelUi.tsx`，颜色是游戏的调色板（`src/lib/owlSprite.ts` 的 `PIXEL`）。

- `Stars`：深蓝星空底；`Dither`：和浅色页面之间的像素过渡边。
- `pixelPanel`：双线边框 + 硬投影面板；`pixelButton`：黄色像素按钮。
- `HudTag`：`∞ O2I | 标题`；`NameTag` + `PixelOwl`：Dr. Owler 对话框。
- 样板：首页 `CalcQuestSection`、竞技场未登录页（`src/pages/Arena.tsx`）。
- 普通页面（课程、练习、关于等）保持现代风格，不要整页像素化。

## 改完要检查

- 桌面 1440 和手机 390 两个宽度，中文和英文各看一遍，没有横向滚动。
- `npm run build` 通过，改到的文件 `npx eslint` 无新问题。

## 本地最新调整：徽记位置、双语文案、游戏介绍

- 用户明确要求纹章只作为左上角站名旁的小徽记：使用平面版 `public/heraldic-emblem-v4.png`，40px 显示，不在首屏正文或页脚重复展示；首页右侧使用细线数学示意图。
- 首页 CALC QUEST 区块使用墨绿底、暗绿面板、暖金强调，与全站深绿协调。不修改实际游戏里的美术与交互。
- 首页、导航、页脚及课程/练习/答疑/互动模型/团队/登录页面的主要介绍文案使用自然双语表达。保留题目内容、课程数据、功能规则、额度与密码要求；避免逐句翻译、空泛口号与开发术语（如 Authentication、Solution Requests）。
- 所有调整仍仅保存在本地，不推送、不更新 PR #48、不部署。

## 字体与真实数据（本地）

- 英文标题改用 Cormorant Garamond，中文标题使用 Noto Serif SC；正文使用 Inter / Noto Sans SC。加载失败时回退到本机衬线或系统无衬线字体。
- 首屏统计从站点现有 Supabase 公共接口读取：`count_all_profiles`、公开 `team_members` 数量、`courses` 中 `is_published = true` 的数量。移除写死的“50+ 位专家”和数字滚动动画。
- 2026-11-16 本地只读核实结果：公共账号统计 2071，团队成员 7，已发布课程 2。数字仅记录验收时状态，不作为页面常量；页面每次载入重新请求，接口失败的对应项不展示。
- 团队名单、负责人和课程列表继续读取网站现有接口；不更改生产数据库。

## 三语、品牌图标与首屏徽标（最新）

- 语言菜单提供 English / 简体中文 / Español，保存本地选择并设置对应文档语言；西语覆盖主要学生界面、状态、验证提示与动态文案。教学视频、题目正文、课程标题与游戏内部内容保留原语言；竞技场在西语界面下使用英文游戏。
- 西语资源在 `src/lib/i18n/es.ts`；模板插值在 `translate.ts`，未知内容保留原文，不猜测翻译。
- 左上角恢复用户提供的原版 O2I 标志，名称旁保留 24–28px 平面纹章，不在正文放大展示。
- Instagram / YouTube 使用 Simple Icons 11.15.0 的品牌路径，替换通用相机/视频符号；小红书在所有语言中保留真实字标，不再用 RED 文本替代。其余图标沿用既有品牌路径。平台链接保留原值。
- 首屏改成用户参考图中的两枚徽标：从 `count_all_profiles` 读取学习人数；“10+ 位资深导师 · Euclid 荣誉榜 · AMC 前 1%”由用户提供。移除团队人数和课程数量，不再为这两项请求统计数据。
- 调整仍仅在本地，不推送、不更新 PR、不部署、不写生产库。

## Optional light appearance
The header includes a theme toggle beside the language menu in all three languages. Dark remains the default. Light uses warm ivory, forest green and bronze, including page surfaces, cards, navigation and dialogs. next-themes persists the selection under o2i-theme. Local preview only.


## Dr. Owler interaction (#49)
Restored standalone AI chat navigation independently of course AI tools. The draggable homepage owl greets on a tap, responds to repeated pats, becomes annoyed after four quick pats and resets after five seconds. Its localized speech bubble links to the existing authenticated AI chat. Dragging does not open a greeting; Enter/Space work as well. Existing AI service implementation remains unchanged; no test prompts or production writes were sent.

