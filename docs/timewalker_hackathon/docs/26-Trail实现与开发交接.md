# 26｜V3 Trail 实现与开发交接

2026-10-15。分支 `feature/timewalker-dual-samples`，基于 `1eb7d2d`。按 [25 号方案](25-时空漫游者-双模式产品方案与开发规划.md) 实现独立 Trail，不修改 Story V1 动作或故事引擎。本页记录实际实现，25 是目标方案。

## 切片一：契约与游客探索

已实现 `TrailDefinitionV1 / assertTrail`、独立静态目录/加载、豫园四站样板及 `/trail/yuyuan-four-sights` 游客页。基底为 `yuyuan`，显式关联 `yuyuan-timewalker`。首页故事之后增加主题路线入口。

严格校验 3–6 个不重复现有地点、有限字段、一个可选推荐、无凭据 HTTPS 或允许的站内详情链接。游客按顺序手动确认；防重复、撤销最后一站、重置确认、刷新恢复、内容变更清旧进度。完成后可下载实际印章组成的 SVG 纪念卡。缺图和坏存储不阻塞当前流程；没有 GPS 或到店核验。

推荐在已完成关联站点后显示，可跳过；滚入可视区域记录 `promotion_view`，点击记录 `promotion_click`。本机事件最多 200 条，可在页面折叠区查看；不是跨设备报表或订单。路线和事件均不调用模型/地图。

实现入口：`src/trail`、`src/pages/TrailPage.tsx`、`public/data/trails`。进度键 `timewalker:trail:v1:<id>`，事件键 `timewalker:trail-events:v1:<id>`。新测试纳入 `npm test`；Node 与浏览器 TypeScript 检查分离，不修改依赖锁。

已验证：122 项 Node 测试、build、lint；新 `npm run test:trail` 在 320/390px 覆盖四站、刷新、撤销/重置、推荐展示事件、实际 SVG 下载/XML 解析、缺图/缺路线与零模型/地图请求。截图写入 `/tmp/timewalker-trail`。后续运营编辑、发布与联动将在本页继续记录。
