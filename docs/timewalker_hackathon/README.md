# 时空漫游者｜开发启动交付包

这是一套基于 `melxy1997/hackathon-trip-guide` 现有代码结构设计的**可进入开发**的方案，2026-10-10 编制；文件为建议方案，**尚未写入 GitHub 原仓库**。

## 文件说明

- `docs/01-技术设计.md`：完整技术设计、现状盘点、模块、契约、引擎、Builder、页面、API、降级、测试。
- `docs/02-答辩产品说明.md`：产品定位、豫园旗舰剧情、用户页面、五分钟演示、八页幻灯片、评委问答、演示真实性。
- `docs/03-开发任务拆解.md`：项目目标、里程碑、Issue 级任务、依赖、人日估算、协作计划、验收标准。
- `examples/yuyuan-timewalker.package.json`：以仓库豫园坐标与节点 ID 为基础的**示例可执行体验包**，并非经现场验证的真实导览路线。
- `tools/validate-experience.mjs`：不需要第三方依赖的初始静态校验脚本，确保场景引用、分支和旧包核心字段正确。
- `tools/simulate-experience.mjs`：命令行剧情路径模拟，验证自然/匠心两个选择均可到结局（不是实际游客前台运行时）。

## 开发启动

先完成并评审 TW-001，使用示例包冻结经验契约；再并行开发状态机、体验播放器、旗舰剧情素材。第一条验收路径是：`prologue → rockery → jade-nature 或 jade-craft → epilogue`。在 UI 开发前先运行：`node tools/validate-experience.mjs examples/yuyuan-timewalker.package.json`，再运行 `node tools/simulate-experience.mjs examples/yuyuan-timewalker.package.json nature` 和末尾改为 `craft` 的第二次模拟。

本交付包不是编译好的应用；它提供了文档、样板数据和最小验证工具。推荐把文档合入仓库 `docs/`，将示例内容包按约定迁入 `tour-hub-web/public/data/attractions/`，工具迁至工程自己的验证脚本目录。**不要不经字段兼容改造就将示例包直接交给旧编辑器重发布**，旧草稿逻辑尚不认识 `experience`。

## 史实与安全提醒

本样板中家书与人物独白是文学创作，不代表存在真实明代家书；引用官方资料用于确认建园史实。用于现场演示的位置事件默认是模拟模式，非 GPS 定位。生产部署前必须将浏览器 `VITE_DEEPSEEK_API_KEY` 移入服务端，正式发布必须带鉴权和路径保护。
