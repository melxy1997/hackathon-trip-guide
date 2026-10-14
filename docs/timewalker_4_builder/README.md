# 时空漫游者 · Builder Agent V2 开发交接包

本交付基于 `melxy1997/hackathon-trip-guide` 的 `feature/configurable-observation-hints` 分支（审阅 HEAD `115329097028e74fcde6b84520664f1270153031`）。

## 文件

- `repo-ready/docs/timewalker_hackathon/docs/18-Builder-Agent-设计.md`：可直接用来替换仓库原文档的 V2 正文。**交接包没有在 GitHub 上提交或修改任何文件。**
- `docs/18-Builder-Agent-设计-V2.0-可实施版.md`：便于浏览时区分版本的相同副本。
- `examples/storyCompiler.ts`：Story Compiler 实现示例。待在目标仓库中创建 `server/agent/schemas.ts` 后，根据注释放入 `server/agent/pipeline/storyCompiler.ts` 并运行 TypeScript 检查；尚未在目标工程编译。
- `examples/yuyuan.brief.json`：豫园创作输入。
- `examples/planetarium.brief.json`：上海天文馆创作输入。对应景点发布包尚须创建。
- `scripts/smoke-model-tools.mjs`：内部兼容模型的真实 Tool Calling 探针。没有密钥时不会调用服务。
- `scripts/smoke-seedream.mjs`：真实调用火山方舟生成和下载图片的探针。仅在显式提供 `--confirm-billing` 后会发出请求，可能发生费用。

## 先做这四件事

1. 在当前功能分支运行 `npm ci && npm test && npm run build`，记录基线。
2. 配置仅服务端可见的 `.env.server.local`，参考文档 §4；严禁向 GitHub 提交密钥。
3. 复制 `smoke-model-tools.mjs` 到 `tour-hub-web/scripts/`，执行 `node --env-file-if-exists=.env.server.local scripts/smoke-model-tools.mjs`，确认模型实际产生 `tool_calls`。
4. 准备图像 API 凭据后执行 `node --env-file-if-exists=.env.server.local scripts/smoke-seedream.mjs --confirm-billing`；**事先确认有预算并得到费用授权**。

第二步再开始创建 Agent Service、素材入库和两个故事样板。无真实密钥时仅能验证 JavaScript 脚本语法及 JSON 可解析性，不能声称模型/搜索/生图 API 已联调。

## 注意

`readWebPage` 在设计文档 §8.2 给的是工具接口骨架，其中尚需实现**仅允许读取本任务搜索结果的 URL**等服务端守卫后才可使用；不允许直接向开放网络提供未受约束的网页抓取工具。`storyCompiler.ts` 是逻辑级实现示例而非在仓库安装依赖后经过 `tsc` 的交付代码。

实施文档中的本地 `.agent-jobs/`、`.env.server.local` 等路径要加入 `.gitignore`，图片生成的临时 URL 不可写入最终发布包。

---

选用 TypeScript 版 Deep Agents 作为 Builder Agent 的核心智能体框架，底层使用 LangGraph，但不要将整个内容生产系统都交给一个自由运行的 Agent。

具体采用：

Deep Agents 负责自主研究、创意构思和工具调用；确定性 TypeScript 服务负责体验包编译、素材入库、校验与发布。

这套组合既能避免重新发明 Agent 的规划、上下文管理和子任务委派机制，也不会让模型直接修改你们已经稳定的故事运行时。

### 建议的分层架构

\#chatgpt-mermaid-\_r_1a0\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_1a0\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_1a0\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_1a0\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_1a0\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_1a0\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_1a0\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_1a0\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_1a0\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_1a0\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1a0\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1a0\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_1a0\_ p{margin:0;}#chatgpt-mermaid-\_r_1a0\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_1a0\_ .label text,#chatgpt-mermaid-\_r_1a0\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ .node rect,#chatgpt-mermaid-\_r_1a0\_ .node circle,#chatgpt-mermaid-\_r_1a0\_ .node ellipse,#chatgpt-mermaid-\_r_1a0\_ .node polygon,#chatgpt-mermaid-\_r_1a0\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ .rough-node .label text,#chatgpt-mermaid-\_r_1a0\_ .node .label text,#chatgpt-mermaid-\_r_1a0\_ .image-shape .label,#chatgpt-mermaid-\_r_1a0\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_1a0\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ .rough-node .label,#chatgpt-mermaid-\_r_1a0\_ .node .label,#chatgpt-mermaid-\_r_1a0\_ .image-shape .label,#chatgpt-mermaid-\_r_1a0\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_1a0\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_1a0\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1a0\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1a0\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_1a0\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_1a0\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_1a0\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_1a0\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_1a0\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_1a0\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1a0\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_1a0\_ .icon-shape,#chatgpt-mermaid-\_r_1a0\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_1a0\_ .icon-shape p,#chatgpt-mermaid-\_r_1a0\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_1a0\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_1a0\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_1a0\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_1a0\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_1a0\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_1a0\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_1a0\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_1a0\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_1a0\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1a0\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_1a0\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1a0\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_1a0\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_1a0\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_1a0\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_1a0\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ .node rect,#chatgpt-mermaid-\_r_1a0\_ .node circle,#chatgpt-mermaid-\_r_1a0\_ .node ellipse,#chatgpt-mermaid-\_r_1a0\_ .node polygon,#chatgpt-mermaid-\_r_1a0\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_1a0\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_1a0\_ .node.mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_1a0\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_1a0\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1a0\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}#chatgpt-mermaid-\_r_1a0\_ .selected rect{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1a0\_ .selected polygon{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1a0\_ .selected ellipse{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1a0\_ .selected circle{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1a0\_ .selected path{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1a0\_ .selected tspan{fill:rgb(23, 54, 94)!important;}Builder Studio · ReactNode.js Builder APIDeep Agents · 创作总导演资料研究故事策划与编剧素材导演外部工具层Web Search地点与地图图像生成语音合成结构化创作产物TypeScript ExperienceCompiler现有 StoryEditor现有 ExperiencePlayer

这里最有价值的架构决定是：Agent 不直接生产最终发布包，也不直接调用发布接口。

它可以修改故事大纲、重新构思人物和安排图片，但最终必须输出明确的创作产物，由普通 TypeScript 代码转换成你们已经定义的 `ExperienceDefinitionV1`。

这样一来，你们可以自由升级大模型和 Agent 框架，而不影响游客端和现有发布后台。

## 二、Agent 应该如何分工？

我建议初期只设置一个总导演 Agent + 两个专业子 Agent，不要先做五六个角色相互协商。

Builder Director · 创作总导演

理解用户需求，判断体验类型，决定何时研究、何时创作、何时准备素材。对故事方案进行取舍，最终输出可编译的创作成果。

Research Agent · 场景研究员

负责网页搜索、景点背景、展区信息、文化素材和故事灵感。输出精简的地点研究档案，不必建设复杂的逐句事实审核系统。

Story Agent · 编剧

根据研究档案提出不同故事方案，形成故事设定、分幕节拍、人物关系、悬念与结局。重点优化叙事，而不是直接填写景点介绍模板。

Media Director 暂时不必做成独立子 Agent。 它可以先作为确定性素材生产阶段：Story Agent 输出每幕的画面描述、风格和角色设定，普通服务端代码将其转换成生图、配音任务。

这样减少了不必要的多轮模型交流，还让媒体生产更容易并行。

Deep Agents 原生支持通过 `subagents` 注册专业子智能体，每个子智能体可以独立指定工具、提示词和模型。默认隔离上下文，尤其适合将大量检索结果留在 Research Agent 内，让编剧只接收整理后的研究成果。

### 不同故事类型，用 Skills 而不是新建 Agent

豫园与天文馆的差别主要在创作方法和表现风格，并不是技术工具完全不同。

所以我建议为它们创建不同的创作技能：

| 创作技能                         | 负责提供的知识与创作约束         |
| ---------------------------- | -------------------- |
| `heritage-story`             | 历史书信、人物情感、文化叙事、水墨意象  |
| `science-fiction-experience` | 科幻悬念、宇宙尺度、探索与发现、未来视觉 |
| `interactive-story`          | 故事分支、章节节拍、用户选择、结局回收  |
| `experience-authoring`       | 体验包数据契约、章节结构、交互字段约束  |

这些技能可以使用 `SKILL.md` 形式组织。Deep Agents 支持按需加载技能内容，不需要每次都把所有类型的创作规范塞进系统提示词。

这也让未来拓展自然景区、主题乐园、博物馆时，不需要重写一套 Agent 架构。

## 三、Tools 技术选型：第一版实现这六个业务工具

这是我建议真正落进代码的工具清单。

| Tool 名称                   | 实际服务或实现        | 作用与优先级                      |
| ------------------------- | -------------- | --------------------------- |
| `load_attraction_context` | 现有景点数据包、本地内容目录 | P0 获取景点名称、地点节点、坐标及现有图片      |
| `web_search`              | Tavily Search  | P0 搜集场景资料、故事素材和灵感           |
| `read_web_page`           | Tavily Extract | P0 提取搜索结果正文，减少仅凭摘要创作        |
| `search_places`           | 高德地点搜索 2.0     | P1 发现新的景点与地点；首个双样板可直接使用已知地点 |
| `generate_image`          | 火山方舟 Seedream  | P0 生成关键章节插画与故事封面            |
| `synthesize_voice`        | 腾讯云语音合成等       | P1 将定稿旁白转换为音频文件             |

Tavily 有 TypeScript SDK `@tavily/core`，可直接调用搜索与网页提取；高德提供服务端地点搜索和步行规划；火山方舟提供正式的图片生成 HTTP 接口。以上均可封装为 LangChain `tool()`，交由 Deep Agents 调用。

这里建议再明确一个重要区别：并非每个技术步骤都应该暴露成大模型工具。

例如 `compile_experience`、`assertExperience`、`materializeMedia` 和发布草稿创建，我建议由服务端代码按固定流程执行。Agent 的自由度应该集中在研究、创意和内容生成上，而不是让模型选择是否进行结构校验。

### Deep Agents 内置工具怎么用？

官方已经提供 `read_file`、`write_file`、`edit_file`、`ls`、`glob`、`grep` 等虚拟文件系统工具，不需要你们重新实现。Agent 可以把研究档案、故事提纲、章节文本写成中间文件，再按需读取和修改。

但我不建议给网页服务中的 Agent 开放整个仓库的真实文件系统，更不要默认开放 Shell 执行。第一版使用 `StateBackend` 保存智能体工作区中的文本文件，生成的图片和音频则由业务代码保存到明确的任务目录。

因为 Deep Agents 的虚拟工作区，不等于你们的正式素材仓库或发布系统。这三者必须分清。

## 四、模型选型：继续使用现有模型网关，但首先测试 Tool Calling

你们当前仓库已经有 Node 服务端模型网关，支持 OpenAI 风格的聊天接口。

我建议继续复用现有模型服务和凭据，但在 Deep Agents 里通过 `ChatOpenAI` 适配内部兼容接口，而不是将现有 `/api/builder/draft` 当作 Agent 的模型入口。

这是因为 `/api/builder/draft` 是一个有固定提示词和数据校验的业务接口，而 Deep Agents 需要能直接调用支持工具调用的原始模型接口。

LangChain 官方支持通过 `ChatOpenAI` 的 `configuration.baseURL` 接入兼容 OpenAI 的服务。若使用 DeepSeek 官方接口，也存在独立的 `@langchain/deepseek` 集成。

## 五、一个可以直接开工的 TypeScript 最小原型

建议先在 `tour-hub-web` 下建立独立的 Agent 模块，安装：

```
npm install deepagents langchain @langchain/core @langchain/openai @tavily/core zod
```

以下是最小研究与创意编排原型，用来确认 Deep Agents、现有兼容模型、Tavily 和子智能体能够贯通。它不包括图片生成和最终体验包编译。

```

import { createDeepAgent } from "deepagents";
import { tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { tavily } from "@tavily/core";
import { z } from "zod";

const searchClient = tavily({
  apiKey: process.env.TAVILY_API_KEY!,
});

const webSearch = tool(
  async ({ query }) => {
    const result = await searchClient.search(query, {
      maxResults: 5,
    });

    return JSON.stringify(
      result.results.map(({ title, url, content }) => ({
        title,
        url,
        content: content.slice(0, 1200),
      })),
    );
  },
  {
    name: "web_search",
    description: "检索旅游景点、展馆、历史与文化资料",
    schema: z.object({
      query: z.string().min(2).max(200),
    }),
  },
);

const model = new ChatOpenAI({
  model: process.env.BUILDER_MODEL!,
  apiKey: process.env.BUILDER_MODEL_API_KEY!,
  configuration: {
    baseURL: process.env.BUILDER_MODEL_BASE_URL!,
  },
  temperature: 0.7,
});

export const builderAgent = createDeepAgent({
  model,
  systemPrompt: `
你是一名沉浸式旅行体验总导演。
根据游客群体、目的地与主题，创作有情节的故事体验。
必要时委托研究员搜集背景，委托编剧设计情节。
先产出两个不同的故事方案，再提出推荐及理由。
不要直接发布内容，也不要把编造剧情描述为已核验的事实。
  `,
  subagents: [
    {
      name: "researcher",
      description: "搜集目的地背景、空间和创作素材",
      systemPrompt: "研究地点，返回精简的场景与创作素材档案。",
      tools: [webSearch],
    },
    {
      name: "story_writer",
      description: "根据素材设计人物、悬念、分幕与结局",
      systemPrompt: "设计沉浸式故事，强调戏剧性与地点关联。",
      tools: [],
    },
  ],
});

```

测试调用：

```
const result = await builderAgent.invoke({
  messages: [{
    role: "user",
    content:
      "为上海天文馆创作一段科幻悬疑体验。" +
      "提出两种截然不同的故事，并推荐更适合现场体验的一种。",
  }],
});

console.log(result.messages.at(-1)?.content);
```

这段代码使用了 Deep Agents 的正式 `createDeepAgent`、子智能体配置与 LangChain 工具接口。具体连接内部模型时，还需按公司网关真实模型标识、工具调用协议和超时情况完成联调；它是可以开始集成的代码骨架，不是已经验证过内部网关的现成服务。

第一轮成功标准不是看生成了多么华丽的故事，而是能够在执行记录中确认：总导演确实委托了研究员、研究员确实调用了搜索工具、研究结果确实传递给编剧，最终产生两种明显不同的创作方案。

## 六、任务持久化与服务端架构怎样决策？

建议采用以下分工：

| 技术领域     | 决定                                     | 原因                                 |
| -------- | -------------------------------------- | ---------------------------------- |
| 服务端      | 继续 Node.js + TypeScript                | 与现有仓库一致，减少迁移                       |
| Agent 核心 | `deepagents`                           | 自带工具循环、上下文管理和子任务委派                 |
| 状态检查点    | LangGraph Checkpointer                 | 利用底层能力，不重复开发整个 Agent 执行状态机         |
| 本地持久化    | SQLite Checkpointer                    | 适合黑客松的单机任务恢复                       |
| 图片、音频文件  | 服务端任务目录                                | 避免大媒体进入 Agent 消息和检查点               |
| 创作成果结构   | Zod 中间产物 + 现有 `ExperienceDefinitionV1` | 创意与执行解耦                            |
| 前端通信     | 现有 Node API + SSE                      | 展示研究、创作和媒体阶段进度                     |
| 追踪调试     | LangSmith 可选，或接入团队已有观测能力               | 查看模型调用、工具耗时、失败和成本                  |
| MCP      | 按需接入                                   | 对已有 MCP 服务直接复用，不为普通 HTTP 接口额外搭一层协议 |

LangGraph 的 JavaScript 生态提供 SQLite 与 PostgreSQL Checkpointer。第一阶段可用 `@langchain/langgraph-checkpoint-sqlite`，为每个创作任务分配稳定的 `thread_id`；后续迁移服务端部署时再考虑 PostgreSQL。

我不建议同时自研一套复杂 `JobStore + Step DAG + 重试调度`，再在里面嵌套 Deep Agents 和 LangGraph。这样会让两套系统同时尝试管理任务状态、暂停恢复和失败重试。

服务端只需要补充业务任务信息：创建者输入、当前阶段、生成的故事版本、素材文件、最终草稿以及错误摘要。内部智能体执行历史交给 LangGraph。

对于 MCP，官方 `@langchain/mcp-adapters` 可以将现有 MCP Server 的工具转换为 LangChain 工具。因此以后如果公司已经有景点内容、地图或图片服务 MCP，直接接入即可；对于 Tavily、Seedream 这种已经有简单 HTTP/SDK 的服务，首版直接封装 TypeScript 工具通常更省事。

## 七、建议的代码结构

在现有 `tour-hub-web` 中新增：

```
server/
  agent/
    builderAgent.ts
    subagents/
      researcher.ts
      storyWriter.ts
    tools/
      webSearch.ts
      readWebPage.ts
      loadAttraction.ts
      searchPlaces.ts
      generateImage.ts
      synthesizeVoice.ts
    schemas/
      creativeBrief.ts
      researchDossier.ts
      storyConcept.ts
      storyBible.ts
      beatSheet.ts
    adapters/
      tavily.ts
      amap.ts
      seedream.ts
      tts.ts
    pipeline/
      storyCompiler.ts
      assetImporter.ts
      candidateValidator.ts
    jobs/
      jobService.ts
      artifactStore.ts
```

其中最需要重视的是 `schemas` 和 `pipeline`。

我建议明确这条边界：

\#chatgpt-mermaid-\_r_1b4\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_1b4\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_1b4\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_1b4\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_1b4\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_1b4\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_1b4\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_1b4\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_1b4\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_1b4\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1b4\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1b4\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_1b4\_ p{margin:0;}#chatgpt-mermaid-\_r_1b4\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_1b4\_ .label text,#chatgpt-mermaid-\_r_1b4\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ .node rect,#chatgpt-mermaid-\_r_1b4\_ .node circle,#chatgpt-mermaid-\_r_1b4\_ .node ellipse,#chatgpt-mermaid-\_r_1b4\_ .node polygon,#chatgpt-mermaid-\_r_1b4\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ .rough-node .label text,#chatgpt-mermaid-\_r_1b4\_ .node .label text,#chatgpt-mermaid-\_r_1b4\_ .image-shape .label,#chatgpt-mermaid-\_r_1b4\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_1b4\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ .rough-node .label,#chatgpt-mermaid-\_r_1b4\_ .node .label,#chatgpt-mermaid-\_r_1b4\_ .image-shape .label,#chatgpt-mermaid-\_r_1b4\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_1b4\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_1b4\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1b4\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1b4\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_1b4\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_1b4\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_1b4\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_1b4\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_1b4\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_1b4\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_1b4\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_1b4\_ .icon-shape,#chatgpt-mermaid-\_r_1b4\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_1b4\_ .icon-shape p,#chatgpt-mermaid-\_r_1b4\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_1b4\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_1b4\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_1b4\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_1b4\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_1b4\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_1b4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_1b4\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_1b4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_1b4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1b4\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_1b4\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_1b4\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_1b4\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_1b4\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_1b4\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_1b4\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ .node rect,#chatgpt-mermaid-\_r_1b4\_ .node circle,#chatgpt-mermaid-\_r_1b4\_ .node ellipse,#chatgpt-mermaid-\_r_1b4\_ .node polygon,#chatgpt-mermaid-\_r_1b4\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_1b4\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_1b4\_ .node.mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_1b4\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_1b4\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_1b4\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}#chatgpt-mermaid-\_r_1b4\_ .compiled rect{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1b4\_ .compiled polygon{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1b4\_ .compiled ellipse{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1b4\_ .compiled circle{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1b4\_ .compiled path{fill:rgb(220, 234, 254)!important;stroke:rgb(86, 136, 199)!important;color:rgb(23, 54, 94)!important;}#chatgpt-mermaid-\_r_1b4\_ .compiled tspan{fill:rgb(23, 54, 94)!important;}Creative BriefDeep AgentsResearch DossierStory ConceptsStory BibleBeat SheetStory CompilerExperienceDefinitionV1现有编辑器与播放器

`StoryConcept` 应包含主题、故事钩子、人物或叙事身份、核心冲突、结局设想和适合的场景；`BeatSheet` 则应包含每幕的场景标识、故事目标、讲述文本草稿、画面提示词、情绪节奏和可能的互动。

Agent 只需要按照 Zod 结构输出这些中间产物。编译器负责把它们映射成 `Scene`、`StoryBlock`、`Interaction` 和 `Action`，最后调用现有 `assertExperience`。

这也解决了此前评审发现的候选来源和媒体问题：新的 Agent 产物走专门的素材入库、候选编译与草稿导入流程，不需要放宽旧 Builder 的白名单。

## 八、开发顺序：先跑通真实 Agent，再补平台能力

1

第一里程碑：真实研究与创意生成

接通 Deep Agents、现有模型和 Tavily。分别输入豫园与上海天文馆的需求，实际生成不同的研究档案和两套故事候选。这个阶段就应当进行模型工具调用验收，而不是使用 Mock 代替。

2

第二里程碑：真实故事编译

Story Agent 生成分幕节拍，由 TypeScript 编译器生成 `ExperienceDefinitionV1`。两份结果都能进入现有 StoryEditor 和 ExperiencePlayer，豫园与天文馆各自拥有合适的视觉主题。

3

第三里程碑：多模态素材闭环

连接 Seedream，生成至少两张真实新图；支持导入、编辑、发布后的媒体持久化。然后连接语音合成，让两种题材表现出不同的声音风格。

4

第四里程碑：Agent Studio 与任务恢复

增加 SQLite 检查点、阶段进度、候选版本管理和工具调用记录；形成答辩时可以展示的创作工作台。原有人工审核和发布机制保持不变。

我还建议把《18-Builder-Agent-设计》中“自研确定性 Planner + Orchestrator + 文件 Job Store”这一决策正式改成一个新的架构决策记录（ADR）：

ADR-001：采用 Deep Agents 作为自主创作运行时，采用确定性 Story Compiler 作为体验包生产与发布边界。

确定性的部分并没有被取消，只是放到了真正需要确定性的地方；而资料探索、故事比较、局部创意修正这些需要自主性的工作，才交由 Deep Agents 发挥。

最终你们不仅能说“我们使用了 Deep Agents”，还能够在答辩时展示一条真实的技术链：

创作意图 → 自主工具调用 → 场景理解 → 故事构思 → 多模态素材生产 → 可执行体验包 → 用户沉浸式体验。

这比单纯展示多 Agent 调用关系更有说服力，也能直接证明一套 Builder 如何创造出豫园和上海天文馆两种风格截然不同的体验。

### 建议团队明天就从这里开始

不要先开发完整 Agent Studio。第一件事是让现有内部模型真正完成一次 `tool_calls`，随后接通 Tavily Search/Extract，最后要求 Deep Agents 根据真实检索内容生成两种不同的故事概念。这是整个架构能否成立的第一道实证。

官方已确认 Deep Agents JS 支持子智能体与结构化输出，Tavily 有正式 JavaScript SDK，火山方舟支持图片生成 API。