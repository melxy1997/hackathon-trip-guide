# Builder Agent｜fix/draft 接手入口

2026-10-18；基线 `6abc0d6`。本目录只适用于仓库根目录的 fix/draft 应用，沿用 HashRouter、StoryGraph、服务端草稿和现有真实预览。旧 feature 分支的 Studio/ExperienceDefinitionV1 不适用。

## 交付顺序

1. **本切片已实现**：Zod 创作简报/概念/结构/逐站内容契约，保留地点与图片的候选编译器；工具调用专用模型适配器及两轮真实协议探针。故事支持多结局，要求所有地点可达且能走向结局；打卡保留地点顺序、不写故事分支。
2. **紧接着开发**：持久 Job、真实研究工具、双概念选择、编译候选、后台采纳为新草稿并进入现有预览。优先可演示闭环。
3. **后续**：真实凭据联调通过后接 Deep Agents JS；再接 Seedream 图片/自动选点。不在本轮做版权审查、商业报表、云端配音或平台迁移。

## 当前命令与工程选择

- `npm test`：先编译 Agent，再跑 Node 基础检查。
- `npm run agent:probe`：复用 `.env` / 运行环境的 DEEPSEEK 配置，先让模型调用真实 nonce 工具，再检查第二轮确实消费返回值。缺配置退出 2，不能算通过；真实报告写入私有 `.agent-jobs/probes` 或 `DATA_DIR/agent-jobs/probes`。
- `npm run build:agent`：TypeScript 编译为 `.generated/agent` Node ESM，无额外服务框架。生产集成引用此编译产物；Vite 可直接引用 TS 源码。`npm run build` 已加入此步骤。
- 当前未配置模型/Tavily 凭据，不能宣称已验证真实工具调用；自动化适配器检查使用明确的 HTTP 替身。

代码：`src/agent/contracts.ts`、`server/agent/compiler.ts`、`model.ts`。编译器从快照深拷贝，不保存原稿、不发布；采纳层另生成新 ID。模型专用适配支持 assistant/tool/tool_calls，不修改旧 `/api/ai/chat` 的文本协议。错误不返回上游原文或密钥。

## 开发约定

以可用 Web 小切片及时 commit/push；每次补充这里的实际入口、已完成内容、验证和下一步。只做与这条流程有关的必要检查，不拿旧分支测试数字充当本分支成果。草稿、Job、密钥不提交到 Git。
