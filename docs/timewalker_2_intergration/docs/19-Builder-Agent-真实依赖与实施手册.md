# 19｜Builder Agent 真实服务依赖、故事创作流水线与实施手册

版本：2026-10-13；对应仓库 `melxy1997/hackathon-trip-guide`，分支 `feature/configurable-observation-hints`，基线提交 `f1e2ca5`。

**目标**：自然语言需求 → 真实资料检索 → 空间节点/路线 → 具有情节的故事设计 → 图片和语音素材 → 经过审核的可执行体验包 → 现有编辑器修改 → 原有播放器预览/发布。本文推荐真实服务作为开发主路径，模拟只用于自动化回归和答辩故障恢复。

**验证边界**：已依据厂商官方文档确认接口存在、基本鉴权方式和服务限制；尚未取得团队密钥，没有声称已经完成真实供应商联调。仓库已有单次生成和故事引擎，但本文件中的多阶段 Builder 尚待实施。

## 1. 采购/申请先决条件：四个关键服务

| 类别 | 优先 | 备用 | 必须申请/确认 | 当天可做的真实验收 |
|---|---|---|---|---|
| 通用检索、正文 | Tavily Search/Extract | Brave Search + 自己的正文提取 | `TAVILY_API_KEY`；公司网络可访问 `api.tavily.com`；确认中文站点覆盖 | 豫园 6 条检索结果 + 至少 2 条可用正文；存 `raw_content`、URL、抓取时间 |
| 景点 POI、路由 | 高德 Web 服务 2.0 | 当前内容包坐标 + 人工路线核验 | `AMAP_SERVER_KEY`，单独 Web 服务类型 Key，与浏览器 JS Key 分开；查配额 | 真正查出豫园 POI，再查询三穗堂到大假山的路径，保留高德原始响应 |
| 历史画面生图 | 火山方舟 Seedream 5.0 flash/pro（以控制台实际开通名称为准） | 阿里百炼万相 2.6、OpenAI 图片接口 | `ARK_API_KEY`、`ARK_IMAGE_MODEL`；开通模型额度、图像生成权限、确认出网与计费 | 根据故事稿生成一张历史园林插画，立即下载、保存、展示在项目页面 |
| 故事设计 LLM | 现有服务端 DeepSeek 网关 | 其他公司已许可的 OpenAI 兼容服务 | 现有服务端模型凭据；验证可调用、文本长度、严格 JSON 能力；不要用前端 `VITE_` 存密钥 | 以真实资料输入生成两个不同故事提纲，进入人工编辑器 |

第二批能力：腾讯云 TextToVoice / CreateTtsTask 作为中文语音输出。真实音频建议预生成并下载到体验包，避免游客播放每一章都依赖外部在线语音服务。密钥包括服务授权、所在地域、支持的音色和费用额度；浏览器语音合成作为降级，不作为最终沉浸体验主方案。

图片与云语音服务的模型/音色标识随开通地域或时间变化，不能直接把文档示意名称当成保证可用的模型 ID。

## 2. 信息源分层，不以搜索排名替代可信度

层 A：政府文化和旅游部门、文物管理部门、景区官方网站、博物馆数字馆藏、明确署名的专业研究材料。已确认的上海市政府豫园页面：https://www.shanghai.gov.cn/citywalk/20260625/3a8ac74e088f4d468d9c3434b0b43d94.html 。该页面可支撑园林营建背景；具体三穗堂、玉玲珑的细节仍需要独立资料。

层 B：地理结构化数据——高德 POI ID、名称、GCJ-02 坐标、地点属性、地图路径、长度与估算时间。与历史事实分离存储；高德路网不等于景区内部通行保证。节点必须保留 `locationStatus: verified|estimated|needs_review` 与来源时间。

层 C：延伸阅读与故事线索——通用网页搜索、图书书评、游记、传说、园林文化普及材料。可用于启发人物关系、审美主题和故事悬念，但在未得到独立核验前不能自动作为确证史实。

层 D：媒体素材——首选仓库已有景点照片，其次版权状态清晰的 Wikimedia Commons 文件，再次生成艺术插画。Commons 使用 MediaWiki `action=query&prop=imageinfo&iiprop=url|size|extmetadata` 查作者、许可及归属要求。搜索结果里的图片 URL 不能证明拥有使用权；素材必须保存 attribution、license、assetHash、originalSource、reviewStatus。

### 2.1 推荐的检索策略

用户输入「豫园 35 分钟、亲子、历史悬念」时，研究智能体至少发起三种不同意图的查询：
- 可信事实：豫园 潘允端 营建 年代 site:shanghai.gov.cn；另可定位文化旅游局、文博机构等。
- 现场细节：豫园 三穗堂 大假山 玉玲珑 位置 造景 特征；必须与现有地点包 ID 匹配。
- 叙事切口：豫园 造园者 家庭情感 江南园林 人与自然 审美；输出候选主题而非直接写成史实。

Tavily：`POST https://api.tavily.com/search`，使用 `Authorization: Bearer …`，入参 `query/search_depth/max_results/include_domains`；详情和正文 `POST https://api.tavily.com/extract`，入参 `urls/extract_depth/format`，检查 `results` 和 `failed_results`，不能把 HTTP 200 当成全部成功。Brave 备用 `GET https://api.search.brave.com/res/v1/web/search`，Header `X-Subscription-Token`；可评估 `/res/v1/llm/context`，但搜索上下文仍不是原文引用的充分证据。

### 2.2 证据记录契约

每项主张 `claim` 有 `evidenceId, claim, stance, sourceUrl, sourceTitle, retrievedAt, rawExcerpt, rawExcerptHash, reviewStatus, strength, conflictsWith`。必须区分「原文中确有此句」「该句是否支持主张」「来源是否可靠」。同一段旁白里的若干事实应该分开校验；没有可靠证据时，重写、转为可明确标注的艺术创作，或请人工定夺。**文学创作不能被用作掩饰不实历史事件的方法**。

对应现有冻结 Schema：服务端 EvidenceBoard 保留丰富审查元数据；编译阶段投影到 `ExperienceDefinitionV1.sources` 的 `official|secondary` 和故事块 `sourceIds/fictional`，不贸然改动冻结协议。

## 3. 图像生产：不要让临时 URL 进入已发布内容包

优先采用「真实景点实拍 + 历史艺术插画」双轨。现代地点的真实外观必须用可信照片说明；历史重现使用清楚注明“艺术演绎”的生成插画。历史人物服装、建筑形制等关键元素应提供参考图或经过核实的描述。不要把生图结果称为历史照片，也不要让模型生成未经证据证实的建筑细节作为史料证据。

火山方舟官方图片接口 `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`，常用请求含 `model/prompt/size/response_format/watermark`；当 `response_format=url` 时应及时下载返回的 `data[].url`，临时图片链接一般在 24 小时内失效。新版 Seedream 5.0 pro/flash 和此前 4.5 的具体参数与能力略有区别，必须按实际开通版本确认尺寸和参考图参数。

备用阿里百炼：万相 2.6 图片编辑接口 `wan2.6-image`，纯文本生图官方建议使用 `wan2.6-t2i`；注意北京/新加坡域名和 Key 不通用。备用 OpenAI：图片 API 可生成/编辑，支持模型与尺寸/质量选择；如果从海外发起访问须考虑公司供应商许可及网络连通性。三种服务只需选一种主用与一种预留适配接口。

应新增服务端媒体入口：`generateImage → download → inspect MIME/bytes → convert/compress → registerAsset → bindSceneBlock`。采纳草稿时把 StoryBlock 中新图片一起导入本地草稿，发布时逐个收集 `scenes[].blocks[].assetRef`，写入 `PublishedAttraction.assets` 并替换引用。现有 `materializeMedia` 仅处理景点图片/封面，不足以完成这一流程。

建议图片要求：每幕先 1 张主图，生成候选至多 2 张，统一 `styleKey`（美术风格、主色、镜头、字体留白）；尽可能使用参考画面保持人物及园林视觉一致。成片可压缩为 WebP/JPEG，并分别保留原始生成版本与面向游客的压缩版本。20MiB 是既有离线演示限制，须按最终压缩产物计算。

## 4. 导演式创作：不是一次性让模型写完整 JSON

Builder 的差异化价值主要体现为可复用的“故事设计方法”，而非某一种大模型框架。建议把语义生产拆成以下不可省略的几个产物：

**ResearchDossier（研究档案）**：真实地点、空间关系、历史事实、人物关系、景区感官细节、可用图片，以及未核实冲突项。

**StoryConcepts（候选故事命题）**：至少两个截然不同的故事理念；每个含核心问题、主角或叙事视角、游客身份、为什么适合这个景区、能够回收的情绪主题。例如“建园者跨越四百年的家书”与“园林中的五种山水暗语”，不要只是同一故事的两套语气。

**StoryBible（故事圣经）**：时代背景、真实事实边界、虚构人物设定、人物动机、核心冲突、悬念、高潮与结局、跨章节连续信息、视觉风格规范。该文件给后续分幕生成提供一致性约束。

**BeatSheet（节拍与空间图）**：每一幕 `sceneId, spotId, dramaticRole, visualAnchor, openingHook, revealedFactIds, newQuestion, userAgency, emotionalTone, exitCondition, estimatedMinutes`；必须形成“开场问题—逐幕发展—高潮揭示—主题回收”，并解释为什么这一幕必须发生在这个真实地点。

**ExperienceDefinitionV1（编译成品）**：将 BeatSheet 编译到现有 Frozen V1 契约，并且通过 `assertExperience`、可玩性模拟、事实与素材审核。不能让模型直接绕开故事设计层填满 JSON。模型可以对不佳的故事提纲重新规划章节，而不是只修复字段语法错误。

### 4.1 叙事质量与反思机制

除了事实与结构 Critic，应新增 Narrative Critic：评价开头能否吸引人、每幕是否推动变化、人物动机是否一致、现场物件是否真正参与故事、分支是否有意义、结局是否回应开场。质检返回具体的章节/段落及“为何不好—如何修改”的建议，而不是只打一个分。

推荐改稿闭环：第一次产出两个 StoryConcept；选一版继续做 BeatSheet；检查是否存在“换成任意景点都成立”的无关场景；针对弱幕提出局部修复，再进入正式编译。关键质量指标是“可用历史证据的覆盖”“空间专属性”“叙事因果性”“完整故事可执行率”，而非纯粹的字数和 JSON 成功率。

### 4.2 自主规划不等于完全放开危险能力

允许模型在代码允许的任务种类内按质量诊断增加“补检索某一历史主张”“重新安排两幕”“重生同一人物插画”等步骤，保留真实迭代能力。代码负责费用预算、资源访问、Job 生命周期与发布权限；不是要求模型只能走固定五幕模板。

## 5. 与仓库结合的最短上线链路

首条真实纵向链路应是：`POST /api/agent/jobs` → `research` → `concepts` → `outline` → `compile_experience` → `assertExperience` → `GET /artifact` → 浏览器 `createAgentDraft` → `saveDraft` → `StoryEditor` 审核 → 现有播放器预览。新的来源和媒体必须走 Agent Candidate 校验，不走原有仅允许白名单来源/媒体的 `assertBuilderCandidate`。

后续扩展 `generate_media`、`narration`、`route_planner`、`critic_narrative`。任务产物独立保存，用 `artifactId/version/hash` 追踪版本。现有 Node 网关支持模型生成，但其 HTTP 请求断开会取消关联操作；长任务必须转成服务端独立生命周期，由客户端订阅事件，而不是关闭页面就中止。

Client-side localStorage 草稿与 server-side Job Store 不在同一存储空间。`POST /api/agent/jobs/:id/draft` 如继续保留，应明确是返回供客户端采纳的导入产物，或改名 `/candidate`，不能说服务端直接写了浏览器草稿。采纳时必须核验 `attractionId, sourceVersion, imageManifest, evidenceManifest`。

## 6. 第一天就要走通的联调

先复制 `scripts/smoke-providers.mjs` 到 `tour-hub-web/scripts/`，配好 Node 24+。新建**不要提交仓库**的 `.env.server.local`，用如下变量名：

- `TAVILY_API_KEY`：Tavily 控制台创建的密钥；
- `AMAP_SERVER_KEY`：高德 Web服务 API 密钥，和现有浏览器 JS API Key 区分；
- `ARK_API_KEY`：火山方舟密钥；
- `ARK_IMAGE_MODEL`：控制台已开通的**实际模型 ID**；
- `MODEL_API_KEY` / `MODEL_API_BASE_URL` / `MODEL_NAME`：映射到现有 gateway 实际读取的服务端环境变量，而非自行新增一套不被消费的名称。

按顺序执行：

1. `node --env-file-if-exists=.env.server.local scripts/smoke-providers.mjs search`：落 `search.json`，必须有至少一篇 200 字以上的正文，并且明确记录提取失败项。
2. `node --env-file-if-exists=.env.server.local scripts/smoke-providers.mjs map`：落 `map.json`，检查 POI 数据和路由服务能返回结果；失败要保留 `infocode` 以便排障。
3. `node --env-file-if-exists=.env.server.local scripts/smoke-providers.mjs image --accept-billing`：**显式同意计费**后生成图片，落盘生成图及 provenance；打开真实图像核对实际编码和艺术风格，不能只看 HTTP 200。
4. 用现有 gateway 的模型服务生成两个 StoryConcept 并存档，再人工选其一进行编译。不要让脚本在没有模型密钥时悄悄改用 Mock。

单个外部接口连通并不代表完整生产链路完成。第一次验收必须至少包含一次跨服务真实数据传递：真实搜索正文 → 模型引用真实主张 → 生成故事草稿 → 通过现有 Schema → 本地编辑器预览。

## 7. 团队分工与可验收任务

| 负责人 | 第 1–2 天交付 | 完成标准 |
|---|---|---|
| 资料与搜索 | Tavily+Extract、政府来源白名单、证据 ID | 真正取到三穗堂/豫园相关正文，保留来源和失败记录 |
| 空间 | 高德 Web 服务 POI+Walking adapter、POI identity 映射 | 至少 3 个已有地点匹配；路线原始结果可查看 |
| 故事 | StoryConcept、StoryBible、BeatSheet、Story Compiler | 真实模型产出两个不同故事概念，其中一个能编译并运行 |
| 视觉/语音 | Seedream image adapter、素材入库、可选云端配音 | 一幅新图真正生成、下载，编辑器打开，发布后仍有效 |
| 前台/编辑器 | 新 Agent 候选采纳、草稿审核、进度与质量诊断 | 不覆盖旧包；人工修改、预览及发布链路可用 |
| 集成负责人 | 路由、预算、任务记录、端到端验收 | 联调录屏可复现、日志脱敏、三方密钥未出现在前端 |

## 8. 真正可交付的 MVP 验收

- 不预写用户主题的五幕脚本：从同一景区两种不同自然语言任务真实产出**结构显著不同**的提纲。
- 事实旁白至少展示 3 个能打开原文的证据引用；资料不足时能主动缩小主张而非编造。
- 根据已有地点和地图信息构建至少 3 幕能够绑定现实景点的故事，并能由真实故事引擎推进到结局。
- 生成至少一张历史艺术画面并进入草稿；重新启动页面后依然可访问；发布后不引用供应商临时 URL。
- 交互式工作台允许人工修改章节、替换素材、审查史实，最终仍走现有发布门禁。
- 真正网络访问、模型调用、媒体生成、耗时及失败均可在日志或任务产物中查证；Mock 仅在自动测试或断网演示时使用，且有显著标识。

## 9. 外部依赖正式文档与价格（以实际账号为准）

Tavily Search：https://docs.tavily.com/documentation/api-reference/endpoint/search
Tavily Extract：https://docs.tavily.com/documentation/api-reference/endpoint/extract
Tavily 价格：https://www.tavily.com/pricing
Brave 搜索：https://api-dashboard.search.brave.com/documentation/quickstart
Brave 价格：https://api-dashboard.search.brave.com/documentation/pricing
Exa 价格：https://exa.ai/pricing
高德地点 2.0：https://developer.amap.com/api/webservice/guide/api-advanced/newpoisearch
高德路径 2.0：https://developer.amap.com/api/webservice/guide/api/newroute
火山方舟图片：https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh
阿里百炼万相：https://help.aliyun.com/zh/model-studio/wan-image-generation-api-reference
OpenAI 图像：https://developers.openai.com/api/docs/guides/image-generation
腾讯云语音：https://cloud.tencent.com/document/product/1073/127845
Commons 图像许可：https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
MediaWiki 图像信息：https://www.mediawiki.org/wiki/API:Imageinfo

**不可忽略**：所有外部服务必须由真实团队账号开通、预算授权、运行地网络验证；搜索排名不等于史实，图像结果链接不等于素材已入库，地图路线不等于实际无障碍可达，结构校验不等于故事优质。
