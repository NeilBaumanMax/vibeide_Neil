# Catnip Forge 启动界面施工基线

## 产品目标

启动界面是主窗口尚未可交互时的真实状态反馈，同时承担稳定的品牌首次呈现。它至少可见约 5 秒；只有“5 秒展示完成”和“工作台真实就绪”两个条件都满足后，才让位给主窗口。

## 视觉结构

- 固定窗口尺寸为 `760 × 470`，无系统边框、透明外层、28px 圆角内容卡片。
- 背景使用象牙白到浅猫薄荷绿的低对比渐变；深蓝承担主标题和品牌识别，猫薄荷绿只用于定位文字和进度反馈。
- 左上角为叶片标记、产品名和中文全称，右上角为正式组合图标。
- 主文案固定为 `One prompt. Working hardware.` 与“一句话，让硬件跑起来。”，英文定位作为眉题。
- 右下角完整显示透明猫咪形象，不做圆形裁切；底部显示当前启动阶段、百分比和进度条。
- 字体优先使用系统 UI 字体栈，英文标题采用紧凑字距；减少动画偏好下停用入场、呼吸和进度过渡。

## 启动时序

`electron/src/main/index.ts` 负责双窗口时序：

1. Electron ready 后先创建 Splash；窗口真正显示时启动 5 秒时间线，进度从 8% 逐帧平滑推进至 94%。
2. 创建隐藏的主窗口时，阶段文案更新为“正在准备工作区”。
3. Gateway 和 BrowserView 开始工作后，阶段文案更新为“正在连接开发环境”。
4. Renderer 完成加载后，阶段文案更新为“正在载入工作台”。
5. 主窗口触发 `ready-to-show` 后只记录真实就绪，不立即抢占启动页；若 5 秒尚未结束则继续等待。
6. 5 秒与真实就绪同时满足后，以 180ms 收尾动画推进至 100%“准备就绪”，约 220ms 后关闭 Splash 并显示、聚焦主窗口。

进度时间线只运行一次并封顶在 94%，不得循环；最终 100% 仍由真实 `ready-to-show` 放行。如果 5 秒结束时工作台尚未就绪，启动页保持 94% 等待。主页面加载失败时应立即关闭 Splash、显示主窗口错误页并记录日志，避免用户被永久困在启动界面。系统启用“减少动态效果”时不执行逐帧动画，但仍保留最短展示和真实就绪门槛。

## 文件与打包

- `electron/assets/splash.html`：独立启动页面，不依赖 Renderer bundle。
- `electron/assets/splash-cat.png`：右下角完整角色素材。
- `electron/assets/splash-leaf.png`：左上角叶片标记。
- `electron/assets/splash-logo.png`：右上角组合标识。
- `electron-builder.yml` 的 `assets/**/*` 已确保这些资源进入 app.asar，开发版和打包版均从同一相对位置加载。

## 验收

```powershell
npm.cmd --prefix electron run typecheck
npm.cmd --prefix electron run build:main
npm.cmd --prefix electron run build:renderer
npm.cmd --prefix electron run verify:splash-ui
git diff --check
```

`verify:splash-ui` 需要先以 `VIBEIDE_SPLASH_HOLD=1` 启动桌面开发版。脚本通过 CDP 验证窗口尺寸、三张素材、文案、默认 5000ms 时间线、平滑单调进度、手动进度更新与溢出状态，并把截图写入临时目录；截图不得提交 Git。
