# Electron Apple 风格界面施工文档

## 当前基线

- 施工分支：`electron_design`
- 产品版本：`奥德赛1.0.0-7201`
- npm SemVer：`1.0.0-7201`
- Windows PE 四段版本：`1.0.0.7201`
- 唯一施工目录：`E:\Agent\vibeide\vibeide`
- 生效样式：`electron/src/renderer/styles/global.less` 基础布局 + `apple.less` 最终覆盖

本轮完全放弃 NES.css、像素字体、硬边框和蓝白机视觉。界面采用系统字体、冷色上下文色、克制的半透明材质、弱分隔线、圆角控件、直接按压反馈和减少动态效果适配。

## 设计原则

1. 正文默认不小于 15px，常用控件不小于 14px，元信息不小于 13px。
2. 关键功能使用冷蓝或各页面的冷色上下文色；红色仅表示失败、删除等破坏性语义。
3. 不用高饱和绿色表示普通成功或强调。成功主要依靠文字、图标、位置和低饱和状态底色。
4. 主面板通过材质、明度和留白分层，避免“框中框”；仅保留必要的分隔线和焦点轮廓。
5. 动效必须短、可中断，并遵守 `prefers-reduced-motion` 与 `prefers-reduced-transparency`。
6. 反馈与触发控件保持空间邻近。清除、保存、打开目录等操作不得只在窗口底部反馈。

## 页面现状

### 全局与 Agent 对话

- 左右栏使用可拖动分隔条和 Pointer Capture，宽度可持久化。
- 对话区和右侧工作区取消多层粗边框，改用不同表面明度区分层级。
- 深色模式使用高对比正文和低对比辅助文字，避免文字与背景粘连。

### 仓库

- 固定显示 Agent 生成、硬件工程、参考代码、Skills 四个仓库，不再提供“导入文件夹”。
- 每个仓库标题区提供“在资源管理器中打开”，通过受限 IPC 校验路径后调用 Electron `shell.openPath`。
- 文件仍可进入浏览工作台或编辑器；刷新目录保留。

### 监视器

- 后端使用随包 Python/ESP-IDF Python 的 `pyserial` 读取真实串口字节，经主进程 IPC 推送到 Renderer。
- “串口数值趋势”不是示波器电压波形：它只提取串口标准输出中每个完整文本行的最后一个数字。
- stderr 只进入文本输出，不参与绘图；跨 IPC 数据块的半行会缓存到下一块，避免截断数字被误采样。
- 页面纵向比例为趋势图约 30%、串口文本约 70%；SVG 自适应填满趋势图区。
- 曲线与网格使用冷蓝色，不使用突兀绿色。

### 任务管理器

- Build/Flash 先选择 `hardboard/projects/<project>`，工程与串口下拉保留系统指示器。
- 最近任务表提高字体、正文对比度和状态辨识度。
- “清除记录”会立即清空当前历史视图，并通过 Runtime 删除 EventBus 历史和 Hardboard `.log` 文件。
- 清除不再被残留 PID 或 `running` 状态拒绝；运行中的任务在清除后产生的新事件仍会继续显示。
- 清除进度和结果显示在标题栏按钮旁，不回滚用户已经清除的旧记录。

### 编辑器

- Monaco 多标签页使用类似 Edge 的等宽弹性分配，标签设最小/最大宽度。
- 关闭按钮具有圆形 hover/focus 高亮与按压反馈。
- 文件树右键菜单通过 React Portal 挂载到 `document.body`，使用视口坐标定位在鼠标附近并做边缘约束。
- 右下角字号控件改为圆角按钮组，蓝色按钮替代像素式方框。

## 关键实现

- `electron/src/renderer/styles/apple.less`：Apple 风格材质、排版、颜色、动效和无障碍覆盖。
- `electron/src/renderer/components/BrowserPanel.tsx`：四页面交互、任务清除、串口趋势采样、编辑器标签和右键菜单。
- `electron/src/renderer/components/WorkspacePanel.tsx`：四仓库与资源管理器入口。
- `electron/src/main/gateway.ts` / `preload/index.ts`：受限文件夹打开和硬件 IPC。
- `electron/src/main/hardboard.ts`：真实串口服务、Runtime 历史清理与 Build/Flash 桥接。
- `runtime/src/eventbus/event-store.ts`：EventBus 与 `.log` 物理清理。

## 验收

```powershell
npm.cmd --prefix runtime run verify:event-clear
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run verify:version
git diff --check
```

界面验收至少确认：只有一个 Electron 主窗口；四个仓库按钮存在；清除前后的任务行数归零；趋势图内部 SVG 填满图区；编辑器右键菜单贴近指针；标签关闭按钮可见且有 hover/focus 反馈。
