# 时空漫游者 Web

```bash
cp .env.example .env
npm install
npm run dev
```

## 运行时配置

地图配置与 AI 配置不再在 Vite 构建时写进前端产物。生产发布时，请为 Node 或 Serverless 运行环境注入以下变量；它们优先于仓库根目录 `.env` 中的本地开发默认值：

```dotenv
AMAP_KEY=your-amap-js-api-key
AMAP_SECURITY_CODE=your-amap-security-js-code
DEEPSEEK_API_KEY=your-api-key-here
DEEPSEEK_BASE_URL=https://your-openai-compatible-endpoint/v1
DEEPSEEK_MODEL=deepseek-v4.1-flash
```

- `AMAP_KEY` 和 `AMAP_SECURITY_CODE` 是浏览器加载高德 JS API 所需的公开配置，通过 `GET /runtime-config.js` 在页面加载时下发。
- `DEEPSEEK_API_KEY` 与 `DEEPSEEK_BASE_URL` 仅保留在服务端；浏览器会调用同源 `POST /api/ai/chat`，不会接触或打包 API Key。
- 更新发布平台环境变量后，重启对应 Node 实例或重新部署函数即可生效，无需重新执行 `npm run build`。

为兼容已有本地 `.env`，开发环境仍会识别旧的 `VITE_AMAP_KEY`、`VITE_AMAP_SECURITY_CODE`、`VITE_DEEPSEEK_API_KEY`、`VITE_DEEPSEEK_BASE_URL`、`VITE_DEEPSEEK_MODEL`；新部署应使用上述无 `VITE_` 前缀的变量。

## Node 持久化发布

`npm start` 适用于需要在运行中创建草稿、发布景点、删除和恢复内容的 Node 长驻部署。请将 `DATA_DIR` 配置为平台挂载的持久卷，发布包、媒体、草稿和回收站都会保存在该目录，重启服务后仍可继续编辑和访问：

```bash
DATA_DIR=/mnt/timewalker-data npm start
```

目录结构如下：

```text
$DATA_DIR/
  drafts/       # 编辑中的草稿
  published/    # 对外读取的 catalog、景点包与媒体
  trash/        # 已删除但可恢复的发布内容
```

`DATA_DIR` 未设置时，Node 会沿用项目内的 `public/spots`（发布内容）、`.trash/spots`（回收站）与 `.timewalker-drafts`（草稿），仅适合本机开发。生产环境应备份持久卷，并确保运行用户对该目录有读写权限。

> **安全提醒：当前发布后台和 `/__trip_guide/*` 管理接口按单租户内网工具实现，没有应用内登录或权限校验。任何能访问该 Node 服务的人都可以创建草稿、发布、删除和恢复内容。不要将其直接暴露到公网；如必须公网部署，请先通过反向代理、VPN 或后续认证改造限制管理路径。**

Serverless 部署当前只适用于静态展示、运行时地图配置和 AI 代理；它的文件系统不作为内容管理的持久存储，不能用于发布、草稿、删除或恢复闭环。
