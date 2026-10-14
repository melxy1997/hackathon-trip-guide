# 程导览 Web

统一应用目录（npm 包名 `trip-guide`）。说明与截图见仓库根目录 [README.md](../README.md)。

```bash
cp .env.example .env
npm install
npm run dev
```

Agent 创作需另复制 `.env.server.example` 为 `.env.server.local`，配置服务端 `DEEPSEEK_*` 后运行 `npm run dev:full`（前端 5174、API 8787）。可选 `TAVILY_API_KEY` 用于联网补充灵感。

发布后台 `/publish` 可选择构想、编译、导出/导入创作成果并采用到编辑器。命令行彩排：

```bash
npm run agent:rehearse -- --attraction yuyuan-timewalker
npm run agent:rehearse -- --attraction shanghai-planetarium --concept 2 --research
```

省略 `--attraction` 会依次生成两个样板。命令会真实调用已配置的模型/搜索服务，输出到忽略目录 `.agent-jobs/rehearsals/`；生成的 `*.studio.json` 可在 Studio 导入。缺少配置时明确退出，不生成假成果。详见 [23-Agent研究与演示成果交接](../docs/timewalker_hackathon/docs/23-Agent研究与演示成果交接.md)。
