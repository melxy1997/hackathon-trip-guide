# 开发日志：React Compiler 警告清理

日期：2026-10-12。工作分支：`feature/configurable-observation-hints`。

本轮清理上一轮验收记录中的 10 条 React Compiler/oxlint 警告，不改变地图初始化、故事引擎、发布流程或数据契约。

## 逻辑单元 1：地图 imperative ref

- `AmapLiveMap` 的八个最新属性/回调 ref 从 render 阶段赋值改为 commit 后的 effect 同步。
- AMap 实例仍由空依赖 effect 创建一次；属性变化不会销毁并重建第三方地图。
- 延迟完成的地图加载、点击和失败回调读取最新的已提交属性，避免并发 render 将未提交值暴露给 imperative API。
- `PublishSpotMap` 的起点 marker 同步 effect 改为依赖完整 `start` 对象，满足 effect 实际读取边界。
- 提交：`f1182f0`。

## 逻辑单元 2：编辑器草稿快照

- `PublishEditorPage` 的草稿 ref 改为 commit 后同步。
- 阶段切换后的延迟地图定位仍读取最新草稿，但不会读取被 React 放弃的 render 数据。
- 提交：`b29e6e0`。

## 静态验证

- `npm run lint`：从 10 条警告降为 **0 警告、0 错误**。
- `npm test`：59 项通过，0 失败、0 跳过。
- `npm run build`：成功。
- `git diff --check`：通过。

## 浏览器验收

使用 Chrome for Testing 151，在 `127.0.0.1:5174` 完成：

- `test:smoke`：五轮双分支、媒体失败、编辑预览、导演真实性和旧包回归通过，0 页面错误。
- `test:builder`：模板、未配置网关、取消请求、审核重置、导出和双分支预览通过，包含移动端编辑器路径。
- `test:playability`：触摸、键盘、320/390px、静音重播、减少动画、缺图、下载和分享回退通过。
- `test:offline`：真实 Worker、校验失败回滚、版本替换、源站不可用时五轮双分支、刷新/新标签页、下载、缓存驱逐和定向清理通过。

在线高德地图仍需要未提交的真实 Key，本轮没有伪造在线地图成功；无 Key 回退及不依赖外部地图的 Builder/故事流程已覆盖。

## 最终状态

React Compiler/oxlint 从 **10 条警告**降为 **0 警告、0 错误**；Node 测试、生产构建和全部 Chromium 套件通过。
