# 23｜Agent 联网研究与演示成果交接

> **文档状态：阶段记录，不是当前开发入口。** 本文中的“当前/待实现/下一步”、分支与测试数只对应文内记录阶段。最新能力见 [导航与当前状态](README.md)，领取任务见 [03](03-开发任务拆解.md)，环境接手见 [09](09-本地开发交接.md)。旧文涉及素材署名/许可复核不再作为本轮任务或验收门槛。

2026-10-15。分支：`feature/timewalker-dual-samples`。在团队 `ebd1619` 的共享契约、独立导入、双概念、编译和 Creative Studio 基础上继续开发。目标仍是快速可用、有演示效果；不增加素材许可审核任务。

后续生成素材闭环与最新待办见 [24-生成素材闭环与开发待办](24-生成素材闭环与开发待办.md)。下文保留本阶段交付记录。

## 切片一：Tavily 联网研究后端

已实现 `POST /api/agent/research`，请求为现有 `CreativeBrief`。服务端加载基础包，组合景点/展区/主题进行 Tavily Search（最多四条），再对前两条结果执行 Extract。返回 `dossier`、requestId、durationMs；其中 pages 提供来源、正文或摘要，以及是否成功提取正文。

`POST /api/agent/concepts` 在原 brief 外允许可选 `researchId`；`POST /api/agent/compile` 同样允许可选 `researchId`。服务器只接受自己登记的研究 ID，不接受浏览器自造的资料正文。研究内容作为数据参与创作，新增来源登记在候选 resourceManifest，继续通过既有校验与发布链。旧 Builder 的来源/媒体白名单保持不变。

研究快照进程内最多 32 份，30 分钟过期，绑定简报和基础包版本/指纹。重启或过期会要求重新研究或使用已有资料，不宣称持久 Job 恢复。最多两个并发研究；固定 Tavily API，正文只读取本次搜索结果，无任意 URL 抓取入口。摘要/正文/响应均有长度上限，错误不回传供应商原文或密钥。

新增服务端配置 `TAVILY_API_KEY`，放在 `tour-hub-web/.env.server.local`。健康接口增加 `researchConfigured` 布尔值。搜索失败明确报错；Extract 失败保留实际搜索摘要并给出提示；取消和超时不伪装成功。没有 Tavily 时旧资料创作链继续可用。

实现入口：`server/agent/research.ts`、`server/gateway.ts`、`server/agent/compile.ts`、共享 `ResearchDossier`。新增自动化覆盖搜索/提取范围、裁剪、缺配置、失败/取消、过期/绑定、研究→概念→编译和来源登记。测试使用可控 provider 响应，不是供应商真实成功记录。

## 当前凭据与外部验收

本环境未发现 `DEEPSEEK_*`、`TAVILY_API_KEY`、`ARK_API_KEY` 配置，也没有 `.env.server.local`。因此尚未运行真实模型、Tavily 或 Seedream；不将 mock 验证写成真实联调。团队可在配置现有 DeepSeek 三变量和 Tavily 后从 Studio 实际生成两份作品。Deep Agents、工具调用模型、自动生图、TTS 仍需后续切片；参考资料中的旧分支/已完成缺口不得照搬重做。

## 切片二：Studio 研究入口与可交接成果

发布后台 `/publish` 的 Creative Studio 新增「联网补充故事灵感」：展示真实响应中的来源、正文/摘要区别和降级说明，之后生成的构想/候选携带研究 ID。可点击「使用已有资料」主动回退。修改简报后研究不会误用于新简报；旧构想禁止继续编译，但上一份成功候选仍可采用和导出。

创作输入、构想、选择、候选和运行元数据自动保存到 `timewalker:studio:v1`。刷新后重新校验当前基础包并恢复，不自动调用模型。研究 ID 是进程内临时绑定，恢复/导入时会清除，必要时重新研究；恢复不是服务端 Job 续跑。研究页预览本身暂不持久保存。

「导出创作成果」下载 JSON，「导入创作成果」可换浏览器继续演示并采用。文件包含候选、选择、artifact 来源与模型/耗时/尝试次数，不包含密钥；它是工作台成果文件，不是正式发布包。导入执行基础包和候选校验，失败保留原成果。素材 URL 仍须可访问，内嵌媒体则随候选保存。基础包更新会阻止旧候选直接恢复，需要重新生成或人工迁移。

本机自动保存限制 750,000 字符，避免多兆 base64 撑满 localStorage；存储不可用/超限明确提示导出，旧成功快照不被失败写入覆盖。导入/导出文件上限 8 MiB，正式发布继续使用既有媒体打包逻辑。不是任意故事的离线包管理系统。

运行记录折叠显示 request ID、model、duration、attempts 与 artifact。导入/恢复明确提示「没有重新调用模型」。测试 fixture 的 model 标为 `mock-browser-fixture`，不得用于答辩的真实供应商成功证据。

实现入口：`src/experience/agent/studioSession.ts`、`components/CreativeStudio.tsx`、`scripts/smoke-studio.mjs`。已验证 111 项 Node 测试、build、lint；扩展 Studio Chromium 验收已通过：研究缺配置/成功、资料联动、简报失配、取消、保留成果、刷新、真实文件下载/导入、损坏文件保留候选、320/390px 与采用到编辑器。截图输出 `/tmp/timewalker-studio/`，不提交临时文件。

## 切片三：可复现的真实网关彩排命令

新增 `npm run agent:rehearse`。默认依次生成两个样板，可选单个景点、概念序号与联网研究：

```bash
# 先在另一个终端启动配置了 .env.server.local 的 npm run dev:full
cd tour-hub-web
npm run agent:rehearse -- --attraction yuyuan-timewalker
npm run agent:rehearse -- --attraction shanghai-planetarium --concept 2 --research
# 省略 --attraction 则依次跑两个；--output 可指定成果目录
```

命令通过实际 API 网关执行，先检查配置，再调用研究/概念/编译。默认输出 `.agent-jobs/rehearsals/<时间>/`（已加入 Git 忽略）：

- `run.json`：实际成功/失败、模型、请求、耗时、尝试次数、artifact 哈希与研究页数。
- `<id>.research.json`：启用研究时保存正文/摘要及来源，可复现输入。
- `<id>.concepts.json`：两个实际返回的概念。
- `<id>.studio.json`：经现有校验的候选和运行元数据，可在 `/publish` 导入、采用并预览。

文件采用临时写入后 rename；编译失败保留先前研究/概念和 failed 状态。不输出密钥，不把缺配置当成功：当前环境实际运行命令返回退出码 2、提示配置，未生成假成果。CLI 的成功/编译失败/缺配置流程另外使用临时测试网关验证，该自动化里的模型明确为 `test-provider-fixture`。

脚本不自动修改种子包、不自动发布、不调用生图服务；如果原媒体为外部引用，导入仍需要该引用可访问。要形成正式演示包，采用后沿用编辑器审核和发布。不要直接拿资料包的 `prompt/requestedTheme` 示例当 API 的 `theme/style` 请求，它们是不同输入格式；彩排命令已构造当前实际契约。

## 最终验收与提交状态

2026-10-15 集成收口：112/112 Node 测试通过，TypeScript/Vite 生产 build 通过，oxlint 通过。七套 Chromium 验收 `test:studio`、`test:builder`、`test:creator`、`test:dual`、`test:smoke`、`test:playability`、`test:offline` 全部完成且退出码为 0。Studio 新增验收使用明确标记的 mock provider；离线使用最新构建的真实 Worker，完成回滚、版本替换、豫园五轮与天文馆双分支断网流程。Markdown 本地链接与代码围栏检查通过。

本轮已推送的功能提交：

| 提交 | 交付 |
|---|---|
| `de0160c` | Tavily 研究、受简报/包绑定的上下文、概念与编译衔接 |
| `196169c` | Studio 研究入口、自动恢复、成果导入导出、旧简报保护 |
| `76c615d` | 实际网关彩排脚本、失败留存、示例配置与使用说明 |

成员并行提交 `095d715 docs: rebuild README around Timewalker dual-sample experience engine` 已完整保留；本地未推送的 Studio 提交重放到它之后再正常推送，没有强推。之后在其 README 结构上仅同步新增能力说明。

## 本阶段结束时的后续建议（当前排期见 03）

1. **优先拿到真实作品**：在服务端配置既有 `DEEPSEEK_*`，可选 Tavily，重启 API，执行两份彩排。将 `*.studio.json` 导入 Studio → 采用 → 编辑预览两分支 → 发布。成果目录自行备份或挑选需要的非敏感样板提交，默认不提交整个 `.agent-jobs`。
2. **按效果接新图闭环**：实现 Seedream adapter 与持久 AssetStore，至少一张新图从下载到受控引用、Agent 候选、草稿、发布包完整跑通。继续复用已完成的 `resourceManifest` 和媒体打包，不把供应商临时 URL 写入最终包。不新增许可审核任务。
3. **再做自主工具编排**：先用真实模型证明标准 `tool_calls` 往返可用，再按 `timewalker_4_builder` 接 Deep Agents Director/研究/编剧与确定性编译。当前研究由确定性服务调用，不是模型自主选工具，也未安装 Deep Agents 依赖。参考包中旧分支、天文馆“待创建”、媒体“待打包”等描述已过时，不要重复实现。
4. **声音与答辩打磨可并行**：用预生成 MP3 增强主要章节；两包实测各 2–3 分钟；真机检查声音/分享/下载；彩排时用成功成果文件接续耗时步骤。

尚未交付：真实供应商成功证据、Deep Agents/tool calling、Seedream 自动生成/持久资产服务、云端 TTS、服务端持久 Job 与进程重启恢复。它们不影响已有固定样板、本地 Builder 和本次完成的工作台成果恢复。不要把浏览器恢复/文件导入描述成服务器任务续跑。
