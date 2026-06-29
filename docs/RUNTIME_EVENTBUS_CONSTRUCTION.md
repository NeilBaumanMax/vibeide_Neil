# Runtime Eventbus 施工文档

## 目标

在保持现有 Agent / Electron 联调主链路稳定的前提下，重写 runtime 的 hardboard 执行层，让每次 MCP 工具调用或用户手动操作都变成可观察、可追踪、可结束的 `RuntimeTask`。

本轮核心目标：

- runtime 增加任务进程管理。
- runtime 增加 eventbus，走生产消费模型。
- Agent 每次调用 MCP tool 都触发事件；hardboard build / flash 额外产生 pid、进度、当前文件等细粒度事件。
- Electron 持续监视 runtime 事件，显示编译进度、当前编译文件、烧录进度、当前烧录文件、当前 pid / task 状态。
- 工作台新增待编译文件列表和源码预览。
- 用户除了让 Agent 调 MCP 烧录，也可以在 Electron UI 手动选择工程和串口后 build / flash。
- 施工完成必须编译验证。

## 不动边界

尽量不改这些已经联调稳定的链路：

- Claude Agent 启动方式。
- Worker prompt / session / stream-json 解析。
- BrowserView / WebContentsView tabs。
- 浏览器 MCP tool 主链路。

Electron 只增加必要的消费者、IPC 和 UI；Agent 仍通过既有 MCP 工具调用 runtime。

## 总框图

```text
MCP tool / 手动按钮
    |
    v
RuntimeTask
    |
    v
ProcessRunner(pid)
    |
    v
HardboardRunner
    |
    v
ESP-IDF resources
  python idf.py build / flash
  CMake / Ninja / GCC / esptool
    |
    v
stdout / stderr stream
    |
    v
HardboardParser
    |
    v
EventBus
    |
    v
EventStore
  runtime/hardboard/events/events.jsonl
  runtime/hardboard/events/state.json
    |
    v
Electron Consumer
    |
    v
Renderer UI
```

## Runtime 目录目标

```text
runtime/src/
  task/
    task-types.ts
    task-manager.ts
    task-registry.ts
  process/
    process-runner.ts
    pid-registry.ts
    kill-tree.ts
  eventbus/
    event-types.ts
    event-bus.ts
    event-store.ts
    producer.ts
    consumer.ts
  hardboard/
    env.ts
    runner.ts
    parser.ts
    project-files.ts
    index.ts
  mcp/
    tool-events.ts
    hardboard.tool.ts
  paths.ts
  index.ts
```

兼容策略：

- `runtime/src/hardboard.ts` 可以短期保留为 facade，导出新 `runtime/src/hardboard/` 的实现，避免一次性打断 MCP import。
- `runtime/src/mcp/tool-events.ts` 在 MCP server 层统一包装 `registerTool`，保证 browser / storage / hardboard 等所有 MCP tool 都产生 tool event。
- `runtime/src/mcp/hardboard.tool.ts` 仍保留原 tool 名称和返回 compact JSON。

## RuntimeTask 模型

每次 MCP 工具调用或手动操作都创建一个 `RuntimeTask`：

```ts
type RuntimeTask = {
  taskId: string;
  source: 'mcp' | 'manual' | 'system';
  kind:
    | 'mcp.tool'
    | 'hardboard.env'
    | 'hardboard.devices'
    | 'hardboard.build'
    | 'hardboard.flash'
    | 'hardboard.serial'
    | 'hardboard.clean'
    | 'hardboard.erase'
    | 'hardboard.snapshot';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  pid?: number;
  projectDir?: string;
  port?: string;
  toolName?: string;
  startedAt: number;
  endedAt?: number;
};
```

所有 MCP 调用都会先创建 `mcp.tool` 任务；hardboard build / flash 这类会启动外部进程的工具，在内部再创建更具体的 `hardboard.build` / `hardboard.flash` 任务，用于承载 pid、stdout/stderr、进度和当前文件。

生命周期：

```text
task.created
process.started(pid)
process.stdout
process.stderr
hardboard.project.files
hardboard.build.started
hardboard.build.file
hardboard.build.progress
hardboard.build.completed
hardboard.flash.started
hardboard.flash.file
hardboard.flash.progress
hardboard.flash.completed
process.exited
task.completed / task.failed
```

任务结束后：

- pid 退出。
- task 标记 `completed` / `failed`。
- `runtime/pids/<taskId>.json` 删除或归档。
- `runtime/hardboard/events/state.json` 保留最后状态。

## 进程管理

当前旧实现用 `execFile`，只能等命令结束后拿完整 stdout / stderr。新实现必须用 `spawn`：

```text
ProcessRunner.spawn(python, [idf.py, "build"])
  stdout chunk -> parser -> eventbus
  stderr chunk -> parser -> eventbus
  exit -> task completed / failed
```

每个 build / flash / serial 都必须有明确 pid：

```text
runtime/pids/<taskId>.json
```

示例：

```json
{
  "taskId": "hardboard-build-20260629-xxxx",
  "kind": "hardboard.build",
  "source": "mcp",
  "pid": 12345,
  "status": "running",
  "projectDir": "hardboard/projects/wifi_connect_fmai",
  "startedAt": 1782740000000
}
```

## ESP-IDF 资源模型

ESP-IDF 不编进主 exe，不放进 asar。ESP-IDF、Ninja、CMake、GCC、Python 都作为资源目录随 app 分发。

```text
resources/runtime/hardboard/esptools/
  esp-idf-v5.4.3/
    esp-idf/
      tools/idf.py
      components/
  idf-tools/
    tools/
      ninja/
      cmake/
      xtensa-esp-elf/
      esp-rom-elfs/
    python_env/
```

用户视角：

```text
打开 奥德赛0.0.exe -> 编译 -> 烧录
```

用户不需要安装：

- ESP-IDF
- Ninja
- CMake
- Python
- GCC toolchain
- esptool.py

runtime 编译前自动设置：

```text
IDF_PATH
IDF_TOOLS_PATH
IDF_PYTHON_ENV_PATH
ESP_ROM_ELF_DIR
PATH += 随包 Python / CMake / Ninja / GCC
CPLUS_INCLUDE_PATH += target 对应 Xtensa C++ multilib include
```

Windows 打包版继续使用短路径：

```text
%LOCALAPPDATA%\vibeide-hardboard-runtime\hardboard
```

## EventBus

eventbus 是运行时状态通道：

```text
Producer:
  MCP tool wrapper
  manual hardboard command
  hardboard runner
  process runner
  heartbeat

Consumer:
  event-store
  Electron monitor
  debug/test consumer
```

事件格式：

```ts
type RuntimeEvent = {
  seq: number;
  id: string;
  time: number;
  source: 'runtime' | 'mcp' | 'manual' | 'system' | 'hardboard' | 'process';
  kind: string;
  taskId?: string;
  pid?: number;
  toolName?: string;
  projectDir?: string;
  message?: string;
  payload?: Record<string, unknown>;
};
```

事件落盘：

```text
runtime/hardboard/events/
  events.jsonl
  state.json
  consumers/
    electron.json
```

`events.jsonl` 是追加事件流。`state.json` 是给 Electron 快速读取的当前快照。

## MCP 触发

Agent 看到的 MCP tool 名称保持不变。runtime server 在注册工具时统一包装 `server.registerTool`：

```text
server.registerTool(name, config, callback)
  -> tool-events wrapper
  -> createRuntimeTask(source=mcp, kind=mcp.tool, toolName=name)
  -> tool.started(source=mcp, toolName=name)
  -> original callback
  -> task.completed / task.failed
  -> tool.completed / tool.failed
```

hardboard build / flash 继续沿用原工具名，但在 callback 内部进入硬件 runner：

```text
hardboard.idf_build / hardboard.idf_flash
  -> RuntimeTask(kind=hardboard.build / hardboard.flash)
  -> ProcessRunner(pid)
  -> process.stdout / process.stderr
  -> hardboard.build.progress / hardboard.flash.progress
```

## 心跳监视

每个运行中的 RuntimeTask 都持续刷新状态。第一版实现为 managed process 显式 heartbeat：

```text
process.started(pid)
每 5s -> heartbeat(taskId, pid)
process.stdout / process.stderr / hardboard.progress -> active
process exit -> clear heartbeat timer -> completed / failed
```

消费者读取 `state.json` 时派生 stale 状态：

```text
status=running && now - lastHeartbeatAt > 15s -> stale
```

如果还没收到第一条 heartbeat，则以当前 state 的 `generatedAt` 作为基准，避免刚启动即判 stale。

```text
heartbeat
  taskId
  pid
  cwd
```

Electron 显示：

- 当前运行任务。
- 当前 pid。
- 最近事件时间。
- `running` / `stale` / `completed` / `failed`。

## Electron 监视页面

Electron 需要新增 hardboard 监视能力：

```text
Electron main
  hardboard-event-monitor.ts
    read events.jsonl since lastSeq
    read state.json
    send hardboard:events
    send hardboard:state

Renderer
  HardboardMonitorPanel
    当前任务
    当前 pid
    编译进度
    当前编译文件
    烧录进度
    当前烧录文件
    串口端口
    最近事件
```

工作台新增：

- 待编译文件列表。
- 点击源码预览。
- 手动选择工程。
- 手动选择串口。
- 手动 build。
- 手动 flash。

手动 build / flash 不走 Agent prompt，直接走 runtime CLI / runner，但必须进入同一套 eventbus。

## 验收

1. 备份分支已推送到 GitHub。
2. 本文档存在并覆盖任务进程管理、工具调用、消息传递、MCP 触发、心跳监视、Electron 监视页面、手动 build / flash。
3. runtime 存在 `task/`、`process/`、`eventbus/`、`hardboard/` 结构。
4. `hardboard.idf_build` / `hardboard.idf_flash` 会创建 RuntimeTask。
5. build / flash 用 `spawn`，能拿到 pid 和流式 stdout / stderr。
6. MCP 调用和手动调用都写入同一套 eventbus。
7. Electron 能消费事件并展示进度状态。
8. 工作台能列出待编译文件，并能预览源码。
9. 用户能手动选择工程和串口后 build / flash。
10. 必须通过编译验证：

```bash
npm --prefix runtime run typecheck
npm --prefix runtime run build
npm --prefix electron run typecheck
npm --prefix electron run build:main
npm --prefix electron run build:renderer
```

如有 Windows 实机条件，再验证：

```cmd
node runtime\dist\index.js hardboard:build hardboard\projects\wifi_connect_fmai
node runtime\dist\index.js hardboard:flash hardboard\projects\wifi_connect_fmai COM7
```
