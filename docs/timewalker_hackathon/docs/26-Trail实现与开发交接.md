# 26｜V3 Trail 实现与开发交接

2026-10-15。分支 `feature/timewalker-dual-samples`，基于 `1eb7d2d`。按 [25 号方案](25-时空漫游者-双模式产品方案与开发规划.md) 实现独立 Trail，不修改 Story V1 动作或故事引擎。本页记录实际实现，25 是目标方案。

## 切片一：契约与游客探索

已实现 `TrailDefinitionV1 / assertTrail`、独立静态目录/加载、豫园四站样板及 `/trail/yuyuan-four-sights` 游客页。基底为 `yuyuan`，显式关联 `yuyuan-timewalker`。首页故事之后增加主题路线入口。

严格校验 3–6 个不重复现有地点、有限字段、一个可选推荐、无凭据 HTTPS 或允许的站内详情链接。游客按顺序手动确认；防重复、撤销最后一站、重置确认、刷新恢复、内容变更清旧进度。完成后可下载实际印章组成的 SVG 纪念卡。缺图和坏存储不阻塞当前流程；没有 GPS 或到店核验。

推荐在已完成关联站点后显示，可跳过；滚入可视区域记录 `promotion_view`，点击记录 `promotion_click`。本机事件最多 200 条，可在页面折叠区查看；不是跨设备报表或订单。路线和事件均不调用模型/地图。

实现入口：`src/trail`、`src/pages/TrailPage.tsx`、`public/data/trails`。进度键 `timewalker:trail:v1:<id>`，事件键 `timewalker:trail-events:v1:<id>`。新测试纳入 `npm test`；Node 与浏览器 TypeScript 检查分离，不修改依赖锁。

已验证：122 项 Node 测试、build、lint；新 `npm run test:trail` 在 320/390px 覆盖四站、刷新、撤销/重置、推荐展示事件、实际 SVG 下载/XML 解析、缺图/缺路线与零模型/地图请求。截图写入 `/tmp/timewalker-trail`。后续运营编辑、发布与联动将在本页继续记录。

## 切片二：运营编辑、真实发布与联动

发布后台新增运营路线管理、新建/编辑入口 `/publish/trails/new`、`/publish/trails/:id`。可选 3–6 个已有地点，按钮调整顺序，编辑标题、引导语、印章和一个可选推荐；关联故事为显式配置。部分未填完草稿也能保存/刷新，实际预览和发布必须通过完整校验。

开发态 `POST /__trip_guide/trails/export` 将路线和索引写到实际静态目录，串行更新，单文件临时写入后 rename；目录写失败回滚路线文件。输入、来源、体积与地点/故事引用均检查，不提供生产 CMS。前端发布后重新 GET 校验，成功才显示分享链接；静态托管/preview 无写入服务时明确转为 JSON 导出，下载不冒充发布。

草稿预览不写游客进度。豫园故事包新增根字段 `relatedTrailId`，经草稿/发布透传，结局可进入四站路线；Trail 的 relatedExperienceId 可返回故事。Story V1 和状态机不变；天文馆没有豫园路线关联。

`test:trail` 已扩展：真实开发态发布插件运行在临时数据目录，运营端改顺序并发布，全新浏览器按分享链接读取，完成并点击推荐；另验草稿刷新、预览隔离、非法链接、JSON 下载、静态部署失败提示和 Story/Trail 链接。测试不写仓库 public/data。发布 Node 测试覆盖并发更新、拒绝非法输入且保留已发布路线。此切片 125 项 Node、build、lint 和 Trail 浏览器套件通过；其他回归结果稍后更新。

## 回归中修正的 Studio 导入时序

旧脚本在重载后直接设置隐藏文件框，可能赶在 Studio 恢复完成前触发导入；该请求会被 ready 守卫忽略。文件框现与导入按钮一样在恢复/请求期间禁用；浏览器测试改为实际点击按钮并通过 filechooser 选择文件，保留全部导入/保留旧候选/携带媒体/发布断言。Studio 复验通过，无固定延时或跳过断言。
