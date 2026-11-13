# O2I 界面风格规范

新页面和改版都按这份来。以首页（`src/pages/Index.tsx`）为样板；拿不准时照首页做。

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
