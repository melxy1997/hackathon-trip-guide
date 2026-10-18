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

## 第二切片：后台纵向闭环已接入

入口：既有 `/publish/:id/content` 的「AI 完整创作」→ `/#/publish/:id/agent`。沿用 HashRouter。原稿先等保存队列完成；作者输入命题/受众/模式，创建持久任务，研究后比较两个概念，选择后编译逐站内容，采纳成新 ID 草稿并进入既有 `/publish/:newId/preview`，由作者点击原有发布按钮。离开页面不取消任务；刷新可恢复最后任务，亦可输入任务 ID。可取消、重选概念生成新版本；旧版本文件保留。

后端已挂 Node 与 Vite：`/api/builder/health`、`POST /jobs`、`GET /jobs/:id`、`/artifacts`、`/candidate`、`POST /select-concept`、`/adopt`、`/cancel`。这里的 jobs 路径均在 `/api/builder` 下。Serverless 明确返回暂不支持，不静默落临时 Job。

研究工具实际实现 Tavily Search/Extract，模型自行调用快照/搜索/正文/研究提交工具，再交付两个概念、图结构和逐站文案。采纳前服务端核对源快照与候选版本/哈希，仅创建新草稿；重复采纳返回同一草稿，原稿更新则保留候选并提示重新创作。原坐标、照片和原发布包不改动。

**当前运行器是受控工具调用流水线，不是 Deep Agents SDK。** 每个任务先实测两轮工具协议，再进入创作；每阶段有模型/搜索/时长预算，提交无效最多修复一次。这样先交付现有产品中的可用链路，真实凭据验证后再替换运行器，不把框架安装当成交付。没有真实账号时不能展示假研究/假生成。

配置：`.env` 的 `DEEPSEEK_API_KEY/BASE_URL/MODEL`、`TAVILY_API_KEY`，改后重启。可选 `BUILDER_MAX_MODEL_CALLS=12`、`BUILDER_MAX_WEB_SEARCHES=4`、`BUILDER_JOB_TIMEOUT_MS=240000`。私有 Job 位于 `DATA_DIR/agent-jobs`，未设 DATA_DIR 时为 `.agent-jobs`；里面包含原稿快照，应与草稿一起备份，不进 Git。当前按单 Node 进程运行；重启会将运行中任务标记中断，等待选择/完成的任务可再读，不声称自动恢复任意工具调用。多 worker 协调是后续项。

实际验证：5 项 Node 检查通过，覆盖两种模式通过真实 HTTP Job API 研究→概念→候选→独立草稿写盘、版本冲突与取消；其中模型/搜索明确使用自动化替身。`npm run build` 通过；`npm run lint` 无错误，原地图组件有 9 条已有警告，未为此扩张本轮。Node 生产服务与 Vite 的真实 health 路由均返回正确配置状态。浏览器端到端演示正在下一切片收口。

[原始增量设计](00-增量开发设计.md)保留评审基线；实际状态以本页为准。首提交 `fd3f9d3` 为模型探针/编译器，第二切片另行提交。下一步优先浏览器真实预览与发布演示，再用团队凭据跑红山、豫园两个真实作品；随后接 Deep Agents 与图片，不做额外平台。
