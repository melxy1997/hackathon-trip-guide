# 27｜TIMEWALKER 设计系统 V1.1：去功能蓝与精细几何增量方案

> **增量基线**：上一版《26｜TIMEWALKER 品牌视觉语言与前端设计系统（V1.0）》及其 `timewalker.tokens.css`、`timewalker.components.css`。  
> **项目代码分支**：`melxy1997/hackathon-trip-guide` · **`fix/draft`** · 读取基线 `6abc0d69`。注意：这里的根目录是 `src/`，不是历史分支的 `tour-hub-web/src/`。  
> **交付状态**：可审阅的设计规范 + CSS 两种集成方式 + React 原子组件 + SVG 素材 + 离线交互预览；**未提交 GitHub**，未在实际业务代码中做全站迁移。  
> **版本定位**：**仅改变 V1.0 中的视觉决策和相关组件规则，不改变现有故事/打卡模式、地图与编辑器业务逻辑。**

## 0. 最重要的设计决定

**品牌关键词继续保持「时间 × 空间 × 旅途 × 故事」，但表现从“黑金简约圆角 UI”升级为“编辑式叙事 × 精密航行仪器”。** 字标里的锋利转折、纤细金色轨道、方向箭头和小型星体都是母题。品牌层使用纸白、墨黑、金属轨道色、极细分隔线与克制留白；故事画面可以是夜色动物园、江南园林、宇宙冷光等不同世界。品牌统一的是可识别的设计语法，不是所有内容画面的色相。

V1.1 冻结四条新决策：

1. **取消“功能蓝”**：`#3b82f6 / #2563eb / #eff6ff / #1d4ed8` 不再承担全站的 CTA、当前选中、输入焦点、文本链接等默认语义。不是禁用一切蓝色：高德原生地图点位、故事海报中的冷夜色、外部内容图像可以保留蓝色。
2. **告别大面积 `rounded-2xl`**：常规表面 6px、工具控制 4px、地图浮层 6px、对话框 8px；明确区分直角线框、可选斜切角、地图玻璃浮层、圆形罗盘/印章。**不是把每个角强行归零，也不是给每个面板都切角。**
3. **金色用于“识别、标记与精度”**：金属轨道金 `#B58B59` 用于轨迹、刻度、微标识与边线；低亮度深轨金 `#79552F` 才可放在浅底小文字上。主按钮仍用星墨黑；单纯把蓝按钮换成金按钮并不能建立系统。
4. **品牌 Shell 与 Scene Skin 分开**：Header、Publisher、基础表单和地图控制面板使用品牌语义；红山动物园悬疑故事可保持夜蓝黑与场景电影色调，但核心操作不应变成系统默认蓝。

## 1. 相比 V1.0 有哪些明确的增量

| 设计维度 | V1.0 倾向 | V1.1 最终决定 | 修改范围 |
|---|---|---|---|
| 操作色 | 语义墨黑，但旧页面蓝 CTA 未被完整废弃 | 全局主操作固定墨黑；次操作纸白描边；文字链接深苔墨 | Token + Button + 链接/焦点迁移 |
| 强调金 | 星轨与装饰，也容易被误用成 CTA | **不可大面积用于功能按钮**；选中态使用暖白底 + 深金细边 + 图标 | Token + Selected + ModeTag |
| 控件角 | 10px | **4px** | Button/Input/Select |
| 普通卡 | 16px | **6px**；封面叙事可另用直角/斜切 | Card/Surface |
| 地图浮层 | 14px | **6px**，可保留轻玻璃，明显区分故事卡/工具栏 | `StoryTourPage`, `TourPage` |
| 对话框 | 旧页 `rounded-2xl` | **8px**，顶部标题线和底部明确操作 | modal/dialog |
| 标签 | 常见胶囊 | **3px 精细矩形**；胶囊只用真实的搜索过滤/小型地图控件 | ModeTag/Badge |
| 封面 | 统一柔和圆角容器 | 编辑式直角版面 + 局部 8–14px 切角 / 微细图章 | Home Hero、故事面板 |
| 阴影 | 普通卡普遍可见 | 日常卡以边框/间距为主，地图浮层与弹窗才保留阴影 | Surface |
| 图形 | LOGO 之外欠缺图形语言 | 增加轨道、星罗盘、章节编号、旅途节点、短划与细分隔线 | SVG 包 + 类名 |
| 字体 | 系统无衬线为主 | 品牌艺术字标独立；编辑大标题宋/衬线、工具文案黑体、英文微标签加字距 | 只改层级，**不发送或强制安装字体文件** |

V1.0 文档的“主卡 16px、浮层 14px、控件 10px”等数字以本文件覆盖；色彩语义基础和两层品牌架构保持有效。旧 CSS 和新 CSS 不同时被业务组件手动复制：选择下述一种集成方式。

## 2. Token 表（可直接由工程使用）

### 2.1 基础色与语义色

| Token | V1.1 值 | 语义 | 用例 |
|---|---|---|---|
| `--tw-ink-950` | `#181F27` | 星墨黑 | 主 CTA、标题、重要状态 |
| `--tw-paper-50` | `#F8F6F0` | 纸白 | 全局底色，不是全白 |
| `--tw-paper-0` | `#FFFEFB` | 白纸面 | 输入、浮层、卡片 |
| `--tw-paper-100` | `#F0ECE3` | 暖浅灰 | 次要区域和 hover |
| `--tw-stone-300` | `#D7D1C6` | 石雾灰 | 分隔线与弱边框 |
| `--tw-gold-400` | `#B58B59` | 轨道金 | 0.5–2px 精细装饰 |
| `--tw-gold-700` | `#79552F` | 深轨金 | 浅底微标签、可读金色文字 |
| `--tw-pine-600` | `#50635D` | 苔石绿 | 目的地/路线内容语境 |
| `--tw-color-action` | `#181F27` | 主操作色 | `Button primary`，不随 Story/Trail 更改 |
| `--tw-color-link` | `#354B46` | 正文内链接 | 链接有下划线/其他 affordance |
| `--tw-color-selected` | `#F2ECDF` | 暖浅选中面 | 节点、章节选择背景 |
| `--tw-color-selected-border` | `#9D7343` | 选中边框 | 配合勾选/指示条，不靠颜色独立表达 |
| `--tw-color-focus` | `#79552F` | 键盘焦点 | 2px 轮廓 + 3px 外偏移 |

浅纸底上，轨道金 `#B58B59` 对比度约 **2.86:1**，不作为普通小字；深轨金 `#79552F` 对纸白约 **6.16:1**。墨黑对纸白约 **15.37:1**。故事叙述若使用透明叠层，则必须以实际合成背景另行验算对比度。色值对比度在交接包脚本中可复算。

### 2.2 精细几何语言

- **4px / Precision Control**：按钮、输入、选择器、功能操作，不丢失明显的交互边界。
- **6px / Quiet Surface**：普通卡、地图信息浮层。视觉焦点依靠内容与排版，而非大圆角。
- **8px / Deliberate Modal**：对话框、确认面板。需要清晰聚焦，轻阴影，不一定有品牌装饰。
- **0–2px / Editorial Frame**：故事海报、章节画框、策展封面，配一条极细金轨或排版刻度。
- **8–14px 斜切角 / Cut Corner**：仅用于章节封面、故事选择主容器等强调部位。避免地图交互按钮和用户表单被裁切；切角容器中的可访问焦点不允许被 `clip-path` 裁掉。
- **50% / Orbital Marker**：小罗盘、定位点和完成印章；**并非通用 pill 按钮**。

高级感来自统一的线条、比例和文字密度，而不是把所有元素都改成直角、玻璃或金色。

### 2.3 字体层级

保留字标的定制字体图像；它不是页面文本的字体资源。正文依旧优先使用已部署的中文系统黑体，标题用宋/明朝风格回退。页面标题可使用 `--tw-font-editorial`，模块标题使用 `--tw-font-sans`；英文微标签或编号用 0.14–0.26em 字距。大标题 34–56px（移动端 28–36px）、工作台标题 20–28px、正文 14–16px、辅助 12–13px。**小于 12px 的字只能是装饰性微标，不承载必要操作说明。**

## 3. 素材包结构与使用边界

`assets/svg` 包含原创、可编辑的 SVG（不是 LOGO 字形矢量化），包括轨道长弧、细分隔线、八向星罗盘、路线节点、章节指针、四向星、路径丝线、山景轮廓、切角标记、探索印章、细箭头与轨道网格。

| 文件 | 适合场景 | 限制 |
|---|---|---|
| `orbit-arc.svg` | 首页标题留白、故事封面装饰 | 每屏最多一条显著轨道，不能遮挡字标/标题 |
| `orbit-divider.svg` | 章节分隔、内容上下文转换 | 与主体之间保持足够空间 |
| `star-compass.svg` | 功能区小品牌符号、章节目录 | 不直接替代需辨识的按钮图标 |
| `waypoint.svg`, `chapter-node.svg` | 地图章节进度、手动打卡节点 | **装饰 SVG ≠ 精确地理路线**；真实地图数据仍用 AMap |
| `route-thread.svg` | 个人记录、进度示意、品牌纹理 | 不代替可点击或实测的路线指引 |
| `four-star.svg`, `brass-arrow.svg` | 章节标题辅助、超轻量 CTA 辅纹 | 小尺寸需要校验对比度与清晰度 |
| `cut-corner.svg`, `scene-corner.svg` | 故事封面角标、静态装饰性边角 | 不用于可聚焦表单控件的遮罩 |
| `mountain-horizon.svg` | 缺少封面时的中性装饰，不替代用户内容 | 不要把古典元素塞入所有科幻故事 |
| `seal-exploration.svg`, `bookmark-ribbon.svg` | 结局记录、里程碑、策展标签 | 不能充当“真实景区盖章核销”证据 |
| `orbital-grid.svg`, `minute-ticks.svg` | 少量背景精细纹样、进度刻度 | 推荐透明度 ≤ 0.25，避免与正文干扰 |

正式品牌字标已在 `fix/draft/public/timewalker-logo.png`，**优先引用当前项目文件**；`assets/reference/timewalker-wordmark-reference.png` 是预览用参考裁切图，不替换生产字标、不声称已提供 logo 矢量源。`assets/reference/visual-direction-v1-1.png` 是设计方向展板，**不是当前产品真实截图或可直接开发的切图**。`preview/redshan-story.jpg` 仅为本地演示缩略图，不应未经团队许可投入新的商业素材库。SVG 不含外部字体、外链脚本或远端资源。

## 4. CSS / React 如何接入 `fix/draft`

### 方式 A：在原 V1.0 基础上叠加（推荐用于已有接入 V1 的项目）

将 `delta/src/styles/` 中的两个文件放入仓库 `src/styles/`，确认 V1 文件已存在，然后在 `src/index.css` 原有 `@import "tailwindcss";` 后按序导入：

```css
@import "tailwindcss";
@import "./styles/timewalker.tokens.css";
@import "./styles/timewalker.v1-1.tokens.css";
@import "./styles/timewalker.components.css";
@import "./styles/timewalker.v1-1.components.css";
```

如果你们已经导入 V1 不要重复导入；只补入两份 delta。V1.1 覆盖旧的同名半径、色值和状态变量，**业务组件开始使用 Token 才会真正生效**。仅仅导入新 CSS 不会把 `bg-[#3b82f6]` 等任意类自动改色。

### 方式 B：还未接入 V1、从 `fix/draft` 原样起步（推荐你们目前使用）

把 `ready-to-copy/src/styles/timewalker.tokens.css` 和 `timewalker.components.css` 放到 `src/styles/`；把 `ready-to-copy/src/components/ui/Button.tsx`、`Surface.tsx` 放入 `src/components/ui/`；在原 `src/index.css` 保留 Tailwind、地图和原动画规则，仅在 `@import "tailwindcss";` 之后增加：

```css
@import "tailwindcss";
@import "./styles/timewalker.tokens.css";
@import "./styles/timewalker.components.css";
```

这组文件已将 V1.0 + V1.1 合并，**不要与方式 A 的 delta 同时导入**。先改 `SiteHeader`、`SiteFooter` 与 `ModeTag`，再迁移首页和故事地图。可参考 `ready-to-copy/src/components/ui/Button.tsx` 内已提供的 `Button / ActionLink` 组件；不要在第一天把全站按钮全部机械替换。

> **Tailwind CSS 4 规则**：`@theme inline` 已放在 Token 文件中，可在 Tailwind 编译后使用 `bg-tw-action / text-tw-ink / border-tw-border / rounded-tw-control` 等设计语义。避免依赖运行时拼接的任意类名；旧组件可逐步迁移到 `var(--tw-color-*)`。

### 迁移示例：三段可以原地替换的样式

```tsx
// Before: 系统默认高饱和蓝与大圆角
<button className="rounded-xl bg-[#3b82f6] px-4 py-3 text-white hover:bg-[#2563eb]">开始</button>

// After: 使用可复用语义；尺寸、焦点、disabled 由组件统一定义
<Button variant="primary">开启故事</Button>

// Before: 蓝底章节选中态
className={active ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'hover:bg-[#f3f4f6]'}

// After: 用选中语义 + 明确指示（文字或图标另行标明）
className={active ? 'tw-selected' : 'hover:bg-tw-surface'}
```

### React 示例现阶段明确不包含什么

只提供可编译方向的两个原子组件；完整 ToastProvider、Dialog 焦点管理、表单验证、地图 Overlay 抽象与路径动画仍需要在业务仓库集成。**素材包的交互式 HTML 是独立设计演示，不是可嵌入的 React 业务页，也不向 GitHub 代码写入任何数据。**

## 5. 按真实页面制定迁移 PR，不破坏功能

| PR | 页面/文件 | 优先级 | 具体变化 | 回归要点 |
|---|---|---|---|---|
| DS-11 | `src/index.css`, `src/styles/*`, `src/components/ui/*` | P0 | CSS Token / 原子组件；集中式几何和焦点 | `npm run build`、`npm run lint`、视觉样例 |
| DS-12 | `SiteHeader`, `SiteFooter`, `ModeTag`, `HomePage` | P0 | 保留正式字标、编辑式标题、浅金轨道、严谨卡片/标签、深墨 CTA | 首页轮播、点击路由、发布入口、375px |
| DS-13 | `StoryTourPage`, `TourProgressBar` | P0 | 屏幕主视觉从白蓝浮层改为叙事主体，深色章节 + 纸白地图操作；去蓝色故事选择 | 开场、分支、旁白、地图点击、进度恢复、结局 |
| DS-14 | `TourPage`, `AskAiPanel` | P1 | 统一地图浮层、当前站、步骤进度、返回/音频控制 | 打卡、地图定位、工具弹层、模拟路由 |
| DS-15 | `PublishListPage`, `PublishEditorPage`, `PublishPreviewPage`, `content/*` | P1 | 共用 Button/Input/Surface/Toast，工作台使用编辑式章节标题 | 保存、导出、预览、返回、AI 生成、Toast 错误 |
| DS-16 | 细节 QA | P0 | 375 / 768 / 1440 px、键盘、focus、对比度、减弱动画、截图对比 | `npm run lint`、`npm run build`；当前 repo 无 `npm test` |

建议从 `fix/draft` 最新 HEAD 切独立视觉任务分支，所有人共享 Token 文件只由一个人负责。**最先修改首页与动物园故事地图**，而非一次性重构发布后台。每个 PR 最多覆盖一个独立的交互区域，做明确的视觉前后对比；避免在同时改剧情、地图或保存逻辑时混入设计迁移。

### 5.1 核心视觉验收标准

- 关键操作（首页「开始漫游」、故事开场「开始」、分支选择、结束、编辑「保存 / 发布」）不再出现通用亮蓝色；地图原生品牌内容和故事摄影不受限制。
- 首页、故事地图、打卡页、发布后台的基本控件不再各自采用任意大圆角；普通卡以边界、白空间、内容层级为主要视觉形式。至少同时看到 4px、6px、直角/局部切角的明确用法，不是全部直角。
- 动画与操作保持用户可预测的反馈，`prefers-reduced-motion` 下不强制移动；焦点可见，禁用态与选中态不仅靠颜色。
- 手机端没有“地图被浮层完全挡住”或“主操作被剪切”的问题，适当调小卡片/改成底部抽屉，而不是无限叠加半透明层。
- 不因新 CSS 改写地图图层、造成真实故事分支/播报、离线或发布流程回归。视觉演示里的故事地图只是**排版示意**，应由现有 AMap 保持真实交互。

## 6. 一屏讲清楚品牌逻辑（供 Hackathon Slides 使用）

主标题：**「一套视觉语言，让每一段旅程都拥有自己的世界。」**  
字幕：TIMEWALKER — Temporal Editorial Design System V1.1

讲述结构：**字标的锋利字形 → 精细几何与版面 → 轨道金与编辑式刻度 → 语义组件 → 不同故事风格 / 地图叙事 / 运营工作台。** 给评委看的是品牌审美如何沉淀成可复用的工程资产，而不只是“做了几张 UI 图”。

推荐展示：首屏一条大字标、一组 6 色样本、一组 4 / 6 / 8 / 切角几何、一组三种按钮、一组故事地图/工作台的对比。**不要用满屏金色、所有背景都有星轨、全部按钮做黑金渐变**；简洁和留白才会显得珍贵。

## 7. 与上一版和现有代码的关系

- 上一版 `26-Timewalker-品牌设计系统与迁移方案.md` 继续作为**理念与 V1.0 规范底稿**；本文件仅覆盖其“主动作色、半径、交互选中、组件视觉、几何和展示素材”相关章节。
- 本包 `delta/` 是增量覆盖；`ready-to-copy/` 是已经合并的完整文件，两者二选一。
- `preview/brand-showcase.html` 包含品牌、首页、故事地图与 Studio 四个互动标签页，需要与素材文件保持相对目录不变，适合离线打开评审。
- `assets/svg/*.svg` 是可编辑设计元素，不能自动替换原 LOGO 或地图数据；`assets/reference/*.png` 仅供内部展示。
- 这不是对 `fix/draft` 的自动代码 PR。**提交代码前应在实际项目完成编译、交互和视觉回归，不能把 HTML Demo 通过当成业务测试通过。**
