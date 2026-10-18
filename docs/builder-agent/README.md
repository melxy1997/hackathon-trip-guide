# Builder Agent｜fix/draft 接手入口

2026-10-18；基线 `6abc0d6`。本目录只适用于仓库根目录的 fix/draft 应用，沿用 HashRouter、StoryGraph、服务端草稿和现有真实预览。旧 feature 分支的 Studio/ExperienceDefinitionV1 不适用。

## 交付顺序

1. **本切片已实现**：Zod 创作简报/概念/结构/逐站内容契约，保留地点与图片的候选编译器；工具调用专用模型适配器及两轮真实协议探针。故事支持多结局，要求所有地点可达且能走向结局；打卡保留地点顺序、不写故事分支。
2. **已实现并走通 Web**：持久 Job、研究工具、双概念选择、编译候选、采纳新草稿、现有真实预览与发布。模型/搜索的真实账号效果仍待配置。
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

实际验证：5 项 Node 检查通过，覆盖两种模式通过真实 HTTP Job API 研究→概念→候选→独立草稿写盘、版本冲突与取消；其中模型/搜索明确使用自动化替身。`npm run build` 通过；`npm run lint` 无错误，原地图组件有 9 条已有警告，未为此扩张本轮。Node 生产服务与 Vite 的真实 health 路由均返回正确配置状态。浏览器端到端已通过，详见下文第三切片。

[原始增量设计](00-增量开发设计.md)保留评审基线；实际状态以本页为准。首提交 `fd3f9d3` 为模型探针/编译器；`05cde36` 为研究 Job、后台与新草稿采纳。后续提交见 git log；下一步按下表接手。


## 第三切片：可演示路径与接手任务

已完成完整浏览器操作：已有豫园内容页→AI 完整创作→输入命题→研究/两个概念→刷新恢复→选择→完成候选→新 ID 草稿→真实故事游客页预览→原有按钮实际发布→全新 320px 浏览器读取。测试服务实际写入临时草稿/图片/包/目录，原稿内容不变；模型和搜索是明确的自动化替身，不是真实账号证据。截图：[双概念选择](screenshots/concepts-390.png)、[真实游客预览](screenshots/preview-390.png)（同样来自替身驱动验收）。

同时修复首次从发布包打开编辑器的并发问题：StrictMode 并发创建草稿可能一成一败而退回列表，现按同 ID 合并请求；另一浏览器抢先创建时重新读取已有草稿。任务恢复时同时恢复命题/模式/受众等简报，避免看到原稿打卡模式却继续故事任务。首次编译与研究共享 12 次默认模型预算，作者显式重选创建新版本后重新计预算。

必要验收已完成：`npm run build`、5 项 `npm test` 和 `npm run test:builder`；lint 无错误，原地图组件仍有 9 条原有警告。构建的 runtime-config 普通脚本提示是现有加载机制，未为此改造。没有真实模型/Tavily凭据，也没有把替身算成真实成功；`agent:probe` 在当前环境明确提示未配置。

### 新成员 5 分钟上手

1. 拉取 **fix/draft 最新 HEAD**（不是旧 feature 分支），在仓库根目录安装锁定依赖。运行 `npm run dev`，默认 5173；若端口被占自行选择并记下实际端口。
2. 在 `.env` 安全填写模型与 Tavily 的真实配置，重启开发服务；先跑 `npm run agent:probe`，成功再开始真实生成。未配置时页面有提示，原有内容编辑/预览继续可用。
3. 进入 `/#/publish/yuyuan/content` 点击「AI 完整创作」，或直接 `/#/publish/yuyuan/agent`。修改模式为沉浸故事，输入家书命题。研究→选概念→采纳→预览→发布。红山则用 `attr-mvbsg4kw` 替换 ID。
4. 生产方式 `npm start`（含 Agent 编译）；设 `DATA_DIR` 保存实际数据。Builder 第一版使用单 Node 进程。纯静态 preview / Serverless 不能运行 Job。
5. 若重启/换浏览器，保存任务 ID 以便恢复；跨机器迁移需要复制 DATA_DIR（或 `.timewalker-drafts` 与 `.agent-jobs`），不能只拉 Git。

浏览器检查需要环境提供 Playwright/Chromium（未新增项目依赖）：

```bash
# 前端启动后，默认脚本指向 5175；可覆盖为你的实际端口
TIMEWALKER_BASE_URL=http://127.0.0.1:5173 npm run test:builder
```

可选指定 `TIMEWALKER_PLAYWRIGHT_MODULE`（包入口路径）、`TIMEWALKER_CHROMIUM`（浏览器路径）。脚本中的替身只用于自动化，不进入运行时功能。

### 当前任务状态与直接下一步

| 设计任务 | 当前状态 | 下一位直接做什么 |
|---|---|---|
| BA-FX-01 工具探针 | 实现并有 HTTP 替身检查，真实账号未跑 | 配模型，执行 agent:probe；保留真实报告 |
| BA-FX-02 Node/Vite 服务 | 已实现，两个真实 health 可读 | 直接复用，不另起后端框架 |
| BA-FX-03 研究工具 | Search/Extract/快照已接入；真实账号未跑 | 配 Tavily，用红山/豫园各产出真实资料 |
| BA-FX-04 候选编译 | 已完成，沿用现有 StoryGraph/Slide | 内容效果优化，不换游客契约 |
| BA-FX-05 Deep Agents SDK | 未接；当前为受控工具运行器 | 真实探针通过后，替换 pipeline 的调度层，复用工具与提交边界 |
| BA-FX-06 Job/版本 | 已完成第一版持久 JSON、阶段/取消/重选 | 后续再做跨进程协调与任意工具恢复；不要先扩成工作流平台 |
| BA-FX-07 Web/采纳 | 已完成并通过真实预览/发布路径 | 优先在实际账号下试玩，优化故事效果 |
| BA-FX-08 双题材作品 | 豫园 Web 替身闭环、两模式 API 已跑；真实作品待交付 | 红山保留世界观、豫园打卡转故事各跑一次，保存任务与发布 ID |
| BA-FX-09 图片 | 未接 | 核心真作品出来后接 Seedream 下载/保存，保持现有 prepareMedia 可取 |
| BA-FX-10/11/12/13 | 后置 | 自动选点、局部改写/重绘、Checkpoint/SSE、音频升级均不挡当前演示 |

优先下一步：**配置团队凭据→跑真实两题材→优化作品/录制屏幕→再接框架和图片。** 遇到真实 Provider 协议差异就改适配器，不重做草稿、路由和预览。继续每个可验收小切片 commit/push，并更新本页；不用为本轮扩张版权、商业化或全面重构任务。
