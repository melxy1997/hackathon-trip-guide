---
name: trip-guide-content
description: >-
  Produces 时空漫游者 (trip-guide) published attraction packages (catalog.json and
  {id}.json) with spots, slides, narration, coordinates, and optional
  assets. Use when generating or editing 时空漫游者 漫游内容, 发布包, PublishedAttraction,
  catalog, or when an external AI should output content for public/spots.
---

# 时空漫游者内容生产

为「时空漫游者」仓库根目录应用（包名 `timewalker`）生产可直接投放的漫游 JSON。应用读取：

```
public/spots/catalog.json
public/spots/{id}.json
```

运行时类型在 `src/lib/tourPackage.ts`。

## Builder 工作流（fix/draft）

当前实现入口见 `docs/builder-agent/README.md`，规划见 `docs/builder-agent/00-增量开发设计.md`。快速产出可编辑、可预览作品为首要目标。

1. 读取已保存的服务端 DraftAttraction 地点快照，沿用名称、地点 ID、经纬度和图片；地点不完整则进入现有地图编辑器确认，不编造占位坐标。
2. 按用户命题研究、提出两个不同概念，让作者选一个；已有信息足够就直接推进，不额外确认已提供的参数。
3. 将结构和逐站内容交给 `server/agent/compiler.ts`，映射到本分支 StoryGraph / Slide。不要使用旧分支的 ExperienceDefinitionV1。
4. 输出 Job 候选，作者采纳后由受控接口创建新 ID 草稿；Agent 不直接写 `public/spots`、发布目录或原稿。
5. 在现有 `/publish/:newId/preview` 用真实游客页查看，由作者点击已有发布按钮。下文发布包字段仅作格式参考，不是 Agent 直接覆盖成品的指令。

## 文件约定

| 文件 | 类型 |
|---|---|
| `catalog.json` | `AttractionCatalog` |
| `{id}.json` | `PublishedAttraction`（每个景点一个文件） |

## PublishedAttraction（必填）

```json
{
  "schemaVersion": 1,
  "id": "yuyuan",
  "name": "豫园",
  "description": "一句话简介",
  "start": { "lng": 121.49185, "lat": 31.22732 },
  "zoom": 17.5,
  "coverImage": "/spots/yuyuan/san-sui-tang.jpg",
  "publishedAt": 1710000000000,
  "spots": [],
  "assets": {}
}
```

### Spot

- `id`：kebab-case，稳定唯一
- `name` / `poetic`
- `lng` / `lat`：WGS84 近似即可，发布页可再拖
- `triggerRadiusMeters`：默认 `38`
- `image`：`assets/...` 键、data URL、https、或站点相对路径如 `/spots/{id}/xxx.jpg`
- `imageCredit`
- `slides[]`：至少 1 页；`title`、`bullets`（2–5 条）、`narration`（80–150 字口语）

### assets（推荐）

```json
"assets": {
  "assets/yuyuan/san-sui-tang.jpg": "data:image/jpeg;base64,..."
}
```

节点 `image` / `coverImage` 写对应键。目录项 `coverImage` 应解析为可直接给 `<img src>` 的值（data URL 或 https 或已有静态路径）。

### catalog.json

```json
{
  "schemaVersion": 1,
  "updatedAt": 1710000000000,
  "items": [
    {
      "id": "yuyuan",
      "name": "豫园",
      "description": "…",
      "coverImage": "/spots/yuyuan/san-sui-tang.jpg",
      "publishedAt": 1710000000000
    }
  ]
}
```

## 内容准则

- 中文；史实谨慎，不确定处用「相传」「据说」
- 漫游顺序：入口 → 主景 → 收束
- 不要编造精确开放时间/门票价格
- 本轮优先复用已有照片；剧情插画可用于表现故事，不把插画说成真实现场照片。自动配图在后续服务切片中接入。

## 校验清单

- [ ] `schemaVersion === 1`
- [ ] `spots.length >= 1`
- [ ] 每个 spot 有 `image` 与至少一页 slide
- [ ] `start` / `zoom` 合法
- [ ] catalog 中存在对应 `id`
- [ ] JSON 可被 `JSON.parse`，无尾逗号

## 示例

最小节点：

```json
{
  "id": "san-sui-tang",
  "name": "三穗堂",
  "poetic": "一麦三穗 · 迎客之始",
  "lng": 121.49185,
  "lat": 31.22732,
  "triggerRadiusMeters": 38,
  "image": "/spots/map-intro.jpg",
  "imageCredit": "",
  "slides": [
    {
      "title": "三穗堂",
      "bullets": ["豫园正门大厅", "取意一麦三穗"],
      "narration": "欢迎来到豫园。我们现在所在的位置是三穗堂，正门大厅，寓意丰收与吉祥。"
    }
  ]
}
```
