# 时空漫游者 Builder Agent · 真实服务接入包

适用仓库：`https://github.com/melxy1997/hackathon-trip-guide`，目标分支 `feature/configurable-observation-hints`，提交基线 `f1e2ca5`。

文档：`docs/19-Builder-Agent-真实依赖与实施手册.md`。包含供应商首选、官方接口、权限/费用先决条件、智能创作工作流、与原仓库集成方案、团队分工及验收标准。

脚本：`scripts/smoke-providers.mjs`。拷贝到仓库的 `tour-hub-web/scripts/`，在 `tour-hub-web` 目录运行。

前提：Node.js 24+，已申请对应供应商密钥，并在本地 `.env.server.local` 设置；不提交任何 API Key 到版本控制。

命令：

- `node --env-file-if-exists=.env.server.local scripts/smoke-providers.mjs search`
- `node --env-file-if-exists=.env.server.local scripts/smoke-providers.mjs map`
- `node --env-file-if-exists=.env.server.local scripts/smoke-providers.mjs image --accept-billing`

图片命令将调用计费服务。脚本仅用于**真实外部服务冒烟**，未替换仓库既有网关/编辑器，也不等于完成 Builder Agent；可按文档任务逐步集成。
