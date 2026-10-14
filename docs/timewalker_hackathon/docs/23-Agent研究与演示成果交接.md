# 23｜Agent 联网研究与演示成果交接

2026-10-15。分支：`feature/timewalker-dual-samples`。在团队 `ebd1619` 的共享契约、独立导入、双概念、编译和 Creative Studio 基础上继续开发。目标仍是快速可用、有演示效果；不增加素材许可审核任务。

## 切片一：Tavily 联网研究后端

已实现 `POST /api/agent/research`，请求为现有 `CreativeBrief`。服务端加载基础包，组合景点/展区/主题进行 Tavily Search（最多四条），再对前两条结果执行 Extract。返回 `dossier`、requestId、durationMs；其中 pages 提供来源、正文或摘要，以及是否成功提取正文。

`POST /api/agent/concepts` 在原 brief 外允许可选 `researchId`；`POST /api/agent/compile` 同样允许可选 `researchId`。服务器只接受自己登记的研究 ID，不接受浏览器自造的资料正文。研究内容作为数据参与创作，新增来源登记在候选 resourceManifest，继续通过既有校验与发布链。旧 Builder 的来源/媒体白名单保持不变。

研究快照进程内最多 32 份，30 分钟过期，绑定简报和基础包版本/指纹。重启或过期会要求重新研究或使用已有资料，不宣称持久 Job 恢复。最多两个并发研究；固定 Tavily API，正文只读取本次搜索结果，无任意 URL 抓取入口。摘要/正文/响应均有长度上限，错误不回传供应商原文或密钥。

新增服务端配置 `TAVILY_API_KEY`，放在 `tour-hub-web/.env.server.local`。健康接口增加 `researchConfigured` 布尔值。搜索失败明确报错；Extract 失败保留实际搜索摘要并给出提示；取消和超时不伪装成功。没有 Tavily 时旧资料创作链继续可用。

实现入口：`server/agent/research.ts`、`server/gateway.ts`、`server/agent/compile.ts`、共享 `ResearchDossier`。新增自动化覆盖搜索/提取范围、裁剪、缺配置、失败/取消、过期/绑定、研究→概念→编译和来源登记。测试使用可控 provider 响应，不是供应商真实成功记录。

## 当前凭据与外部验收

本环境未发现 `DEEPSEEK_*`、`TAVILY_API_KEY`、`ARK_API_KEY` 配置，也没有 `.env.server.local`。因此尚未运行真实模型、Tavily 或 Seedream；不将 mock 验证写成真实联调。团队可在配置现有 DeepSeek 三变量和 Tavily 后从 Studio 实际生成两份作品。Deep Agents、工具调用模型、自动生图、TTS 仍需后续切片；参考资料中的旧分支/已完成缺口不得照搬重做。

后续切片与最终验证结果将在本文件继续更新。
