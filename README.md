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
