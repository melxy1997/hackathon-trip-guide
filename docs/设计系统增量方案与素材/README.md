# TIMEWALKER Design System V1.1 · 增量包

**适配分支：`fix/draft`（根目录 `src/`）**。继续沿用你已经选定的星轨字标，取消通用功能蓝和全站大圆角，改为墨黑主操作、纸白编辑式布局、深金轨迹、精细切角及多样化的几何语法。包含完整开发规范、可编辑 SVG、原子组件示例、可离线互动的四页视觉样板。

## 最快查看

1. 打开 `preview/brand-showcase.html`，切换「品牌与组件 / 发现首页 / 沉浸故事 / 创作工作台」四个标签。**请先解压 ZIP 再打开**，否则相对图片可能不显示。
2. 阅读 `27-Timewalker-设计系统V1.1-增量规范与开发任务.md`，重点看 §0、§1、§4、§5。
3. 已经接入旧 V1 CSS：使用 `delta/src/styles/` 两份增量文件；没有接入：使用 `ready-to-copy/src/` 合并版。**不要两种方式同时安装。**

## 文件结构

```text
27-Timewalker-设计系统V1.1-增量规范与开发任务.md
README.md
preview/
  brand-showcase.html                # 可离线打开的视觉样板（设计 Demo）
  redshan-story.jpg                  # 仅用于样板的故事图片
assets/
  svg/                              # 原创可编辑 SVG 装饰元素（15 个）
  manifest.json                     # 文件清单和使用约束
  reference/
    timewalker-wordmark-reference.png  # 字标参考，正式网站沿用 public/timewalker-logo.png
    visual-direction-v1-1.png       # 视觉方向 Slide 概念图，非当前截图
delta/src/styles/
  timewalker.v1-1.tokens.css        # 覆盖 V1 token
  timewalker.v1-1.components.css    # 覆盖 V1 原子组件视觉
ready-to-copy/src/styles/
  timewalker.tokens.css             # V1 + V1.1 合并版，适合原始 fix/draft
  timewalker.components.css         # V1 + V1.1 合并版
ready-to-copy/src/components/ui/
  Button.tsx
  Surface.tsx
```

## 代码集成（任选一种）

**只有 `fix/draft` 原代码 / 尚未安装 V1**：将 `ready-to-copy/src/` 对应文件复制到项目的 `src/`，在 `src/index.css` 里 Tailwind 导入之后加入：

```css
@import "./styles/timewalker.tokens.css";
@import "./styles/timewalker.components.css";
```

**已安装上一版 V1**：复制 `delta/src/styles/*`，在 V1 的 token import 后加入新 token import，在 V1 的组件 import 后加入新组件 CSS import。完整顺序见 27 号文档 §4。

接着逐个替换旧 Tailwind 硬编码色，例如 `bg-[#3b82f6]` → `<Button variant="primary">`，`bg-[#eff6ff]` → 语义选中态与清晰指示；`rounded-2xl` 不做全局替换，只针对具体组件选择 4px、6px、8px、静态切角等新几何。

## 注意

- SVG 不是 Logo 矢量母版，正式 LOGO 仍从应用 `public/timewalker-logo.png` 引用。
- 没有提供任何字体文件，也不强迫新增字体依赖。
- 预览地图是编辑式插画示意，不是能够导航的高德地图。
- `fix/draft` 当前的 React 逻辑与发布能力未在此包中改写；需在实际项目运行 `npm run build`、`npm run lint` 和页面功能回归。
- 本包是设计开发交接，尚未推送 GitHub。**不要误报为已经全站上线。**
