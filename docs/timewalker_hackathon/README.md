# 时空漫游者｜开发启动交付包

这是一套基于 `melxy1997/hackathon-trip-guide` 设计的开发方案，2026-10-10 编制，现已纳入仓库。运行时、Builder、个人探索与离线样例已陆续实现；换环境接手先读 [09-本地开发交接](docs/09-本地开发交接.md)（2026-10-12）。设计目标与已实现能力须分开阅读。

## 文件说明

- `docs/01-技术设计.md`：完整技术设计、现状盘点、模块、契约、引擎、Builder、页面、API、降级、测试。
- `docs/02-答辩产品说明.md`：产品定位、豫园旗舰剧情、用户页面、五分钟演示、八页幻灯片、评委问答、演示真实性。
- `docs/03-开发任务拆解.md`：项目目标、里程碑、Issue 级任务、依赖、人日估算、协作计划、验收标准。
- `docs/04-首轮实现与验收.md`：首轮代码、契约决定、验证证据和 M2 待办。
- `docs/05-M2实现与验收.md`：Builder、独立草稿、人工审核、模型网关与本地发布边界。
- `docs/06-交互体验与可玩性.md`：个人观察、分支回响、移动交互、手账保存分享。
- `docs/07-离线演示与验收.md`：正式构建离线包、失败回滚、更新处理、现场清单。
- `docs/08-五分钟答辩讲稿.md`：当前八页内容、逐字讲稿、技术图与真实能力口径。
- `docs/09-本地开发交接.md`：接手分支、跨环境安装、验证、迁移、架构入口与后续任务。
- `docs/10-开发日志-可配置观察提示.md`：观察提示迭代的逻辑单元、提交与本地验收记录。
- `docs/11-开发日志-视觉与声音一致性.md`：播放器阅读节奏、真实旁白状态和轻量过渡的开发记录。
- `docs/12-开发日志-React-Compiler-警告清理.md`：地图与发布编辑器 imperative ref 的警告清理和回归记录。
- `examples/yuyuan-timewalker.package.json`：以仓库豫园坐标与节点 ID 为基础的**示例可执行体验包**，并非经现场验证的真实导览路线。
- `tools/validate-experience.mjs`：不需要第三方依赖的初始静态校验脚本，确保场景引用、分支和旧包核心字段正确。
- `tools/simulate-experience.mjs`：命令行剧情路径模拟，验证自然/匠心两个选择均可到结局（不是实际游客前台运行时）。

## 开发启动

现在接手时按 09 文档拉取完整开发分支，在 `tour-hub-web` 使用 Node.js 24，安装并启动前后端、运行 `npm test/build/lint` 与相关浏览器验收。不要重新从 TW-001 开始搭建。主验收路径仍为 `prologue → rockery → jade-nature 或 jade-craft → epilogue`。

如果仅阅读原始方案，可在本目录运行 `node tools/validate-experience.mjs examples/yuyuan-timewalker.package.json`，以及 `node tools/simulate-experience.mjs examples/yuyuan-timewalker.package.json nature` / `craft`。这些工具不能代替应用当前契约与测试。

示例内容包已迁入 `tour-hub-web/public/data/attractions/yuyuan-timewalker.json`；游客入口为 `/experience/yuyuan-timewalker`。当前编辑器已支持 `experience` 透传与最小故事编辑，`tour-hub-web` 提供 `npm test` 和可选 `npm run test:smoke`。本目录内原始校验/模拟工具仍用于阅读方案，应用运行时以 `src/experience/experienceSchema.ts` 与 `storyEngine.ts` 为准。

## 史实与安全提醒

本样板中家书与人物独白是文学创作，不代表存在真实明代家书；官方来源与照片许可仍需人工核验。用于现场演示的位置事件为模拟模式，非 GPS 定位。模型私钥现已只由服务端读取，旧 `VITE_DEEPSEEK_*` 已弃用；真实模型效果未验证，正式发布鉴权/事务仍未完成。
