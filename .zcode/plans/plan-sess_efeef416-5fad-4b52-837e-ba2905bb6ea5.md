## 调研结论

你指出的发布链路确实是其中最明显的一处，但不止这一处。当前项目有三类“界面看起来完整、发布环境无法真实闭环”的实现：

1. **Node 已实现但前端仍是假成功的发布流程**
   - Node 的 `libs/app.js` 已经挂载了 `/__trip_guide/*` 本地文件 API，Vite 也挂载了同一套 API；但 `publishDraft()` 在写入前就把草稿标为 published，并在任意失败时自动下载文件。
   - 预览页仍会把下载回退当作已发布，打开“去前台看”，而公开站点实际没有该景点。
   - 下载的 `catalog.json` 只包含刚导出的一个条目，手动替换会覆盖原目录。

2. **草稿、图片和编辑进度只在浏览器 localStorage 中**
   - 新建、编辑、上传图片、AI 逐段生成后的保存全依赖 localStorage；不能跨浏览器/设备，配额或隐私模式失败还会被吞掉。
   - 这意味着 Node 部署即使发布可写，作者编辑中的内容仍不属于服务端数据，无法形成管理后台的真实闭环。

3. **开发/生产路由不一致与显式 mock 回退**
   - `npm run dev` 缺少 `/api/ai/chat`，AI 在开发态必然走前端 mock/模板回退。
   - 游客问答的失败回退会针对关键词返回固定“豫园”答案，即使当前景点不是豫园。
   - 删除、回收站、恢复在 Node 已可用，但 UI 文案、绝对根路径和错误语义仍沿袭“写 public/.trash”的开发工具模型。
   - Serverless 不能使用此方案：其文件系统不应被用作持久内容仓库。按你已选择的范围，Serverless 保持前台静态/只读展示，管理与写入闭环由 Node 长驻服务承担。

## 已确认的实施边界

- 目标部署：**Node 长驻服务 + `DATA_DIR` 指向平台挂载的持久卷**。
- 管理接口：按你的选择，**保持公开访问**。我会在文档和运行时日志中明确警告：任何能访问服务的人都能创建、编辑、发布、删除和恢复内容；生产公网暴露存在高风险。
- 不引入数据库或对象存储，不伪造 Serverless 可写能力。

## 实施计划

1. **将本地文件数据源改造成可配置的 Node 持久数据目录。**
   - 重构 `libs/spots-store.cjs`，不再硬编码写 `public/spots` 与 `.trash/spots`。
   - 新的目录结构以 `DATA_DIR` 为根目录：`$DATA_DIR/published/`（包与媒体）、`$DATA_DIR/trash/`、`$DATA_DIR/drafts/`。
   - 未配置 `DATA_DIR` 时仅为本地兼容回退到现有项目目录；Node 启动时输出实际数据目录及公开写接口风险警告。
   - 在 `libs/app.js` 继续将公开 GET `/spots/*` 映射到持久卷的 published 目录，因此发布成功后前台立刻读取到新包和 catalog，而不需要重建 `dist`。
   - 补齐原子文件写入（临时文件 + rename）及临界目录创建，避免 catalog/package 半写入。

2. **增加真实的草稿 API，并将前端草稿库迁移为异步服务端数据源。**
   - 在 `libs/spots-store.cjs` 增加：`GET /__trip_guide/drafts`、`POST /__trip_guide/drafts`、`GET /__trip_guide/drafts/:id`、`PUT /__trip_guide/drafts/:id`、`DELETE /__trip_guide/drafts/:id`。
   - 服务端校验 id 和请求体大小；草稿以 JSON 放在 `$DATA_DIR/drafts/<id>.json`，保存时由服务端更新 `updatedAt`。
   - 新增前端 `draftApi`/重构 `draftStore`，让 `listLocalDrafts`、`getDraft`、`createDraft`、`saveDraft`、`deleteDraft`、`ensureEditableDraft` 都变为 Promise API；所有编辑页面已经在异步 effect 中读取草稿，将同步调用点逐一改成 `await`、处理失败 toast，并对高频输入采用防抖保存或离开页面前刷新。
   - 图片在编辑阶段暂时仍为 draft JSON 中的 data URL；到发布时通过现有媒体上传转换为 `$DATA_DIR/published/media/` 文件。会加草稿大小上限和清晰错误，避免 localStorage 静默丢失的假保存。

3. **修正发布为真正的事务式成功语义。**
   - `publishDraft()` 首先构建包和媒体，上传媒体后调用发布接口；只有服务端返回成功后才把服务端草稿状态更新为 `published`。
   - 失败时向 UI 抛出明确错误，不再自动下载并假装发布成功。
   - 将“下载自包含包”变成单独且明确的手动导出能力（若保留），不生成单条目的 catalog 伪装为部署结果。
   - 发布接口先验证 package，再用原子方式写包和目录；成功响应包含稳定的 `publicPath`/包 ID。预览页只在这个结果成功后开启“去前台看”。

4. **让管理路由和前端 API 均使用站点基址、并处理真实错误。**
   - `exportTarget.ts` 的 `/__trip_guide/*` 改为由 `SERVERLESS_INJECT_PUBLIC_PATH`/统一 `siteUrl` 推导，防止子路径部署时误打到域名根。
   - 回收站列表不再把网络错误伪装为空列表；页面展示“加载回收站失败”的可见状态。
   - 删除/恢复的返回文案改为产品语义（“已移入回收站”），不泄漏 `.trash` 目录和服务器绝对路径。
   - 由于你选择了公开接口，在首页 Node 日志和 README 显式输出并记录此风险；不隐含加入会阻断当前使用方式的认证。

5. **对齐开发服务与 Node 行为，并清理明显假 AI 表现。**
   - 将 `/api/ai/chat` 加入 Vite 开发中间件，复用 `libs/runtime-config.cjs` 的服务端代理实现；开发模式不再必然退回 mock。
   - 修改游客问答失败 UI：保留“AI 不可用”的清楚提示与基于当前路径的非虚构指引，但删除固定“豫园”知识问答，避免给错误景点伪造答案。
   - AI 内容生成的模板回退仍保留为明确标示的“模板草稿”，不将其标记为 AI 成功；当前页面已有部分提示，实施时统一显示来源/失败原因。

6. **部署文档与验证。**
   - README 新增 Node 持久部署例子：`DATA_DIR=/mnt/timewalker-data npm start`，解释挂载卷、备份目录、更新前台无需重新构建、以及公开管理接口的风险。
   - Serverless 配置/文档明确它只用于当前静态展示和运行时配置/AI，不能作为管理写入后端。
   - 验证覆盖：Node 用临时 `DATA_DIR` 创建草稿、更新、发布带媒体的景点、读取 `/spots/catalog.json` 和 `/spots/:id.json`、删除、列出回收站、恢复；重启服务后再次验证草稿与发布数据仍存在。
   - 运行 `npm run build`、`npm run lint`，并验证 Vite dev 的 AI 代理、发布前端无 API Key、发布失败不会切换为成功/下载状态。

该方案把当前“本地 demo 的文件操作”收敛为可挂持久卷部署的单租户 Node 内容系统。它不解决跨实例水平扩缩容和公网权限控制——这两个问题需要后续迁移至数据库与对象存储、并引入认证。