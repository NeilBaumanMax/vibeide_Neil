import { app } from 'electron';
import * as path from 'path';

/**
 * 路径工具函数 — 统一管理 Electron 主进程的所有路径。
 *
 * 开发模式（未打包，或 ELECTRON_DEV=1）：
 *   __dirname = electron/dist/main/
 *   用 `../../../` 上溯到项目根
 *
 * 生产模式（已打包）：
 *   __dirname = app.asar/dist/main/
 *   资源在 process.resourcesPath/ 下
 *   用户数据用 app.getPath('userData')
 */

// ─── 模式判断 ───────────────────────────────────────────

/** 是否处于已打包的生产模式 */
export function isPackaged(): boolean {
  return app.isPackaged;
}

/** 是否在开发模式中运行 */
export function isDev(): boolean {
  return !app.isPackaged || process.env.ELECTRON_DEV === '1';
}

// ─── 根目录 ─────────────────────────────────────────────

let _devProjectRoot: string | null = null;

/** 开发模式下的项目根目录（D:\vibeide-windows1.0） */
function devProjectRoot(): string {
  if (!_devProjectRoot) {
    // __dirname = electron/dist/main/
    // 上溯 3 级 = electron/dist/main/../../.. = 项目根
    _devProjectRoot = path.resolve(__dirname, '..', '..', '..');
  }
  return _devProjectRoot;
}

/** 开发模式下从 worker/ 子目录上溯（多一级 ..） */
function devProjectRootFromWorker(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

// ─── 公开路径函数 ───────────────────────────────────────

/** Electron 资源目录（打包后 resourcePath，开发时是项目根） */
export function getAppRoot(): string {
  if (isDev()) return devProjectRoot();
  return path.resolve(process.resourcesPath, '..');
}

/** extraResources 目录（agent/、runtime/、scripts/ 等） */
export function getResourcesDir(...segments: string[]): string {
  const base = isDev() ? devProjectRoot() : process.resourcesPath;
  return path.join(base, ...segments);
}

/** 开发模式下从 worker 目录获取 extraResources */
export function getResourcesDirFromWorker(...segments: string[]): string {
  const base = isDev() ? devProjectRootFromWorker() : process.resourcesPath;
  return path.join(base, ...segments);
}

/** Agent 目录（agent/） */
export function getAgentDir(): string {
  return isDev()
    ? path.join(devProjectRoot(), 'agent')
    : path.join(process.resourcesPath, 'agent');
}

/** Agent 生成文件工作区（持久、可写，不随打包覆盖） */
export function getAgentWorkspaceDir(): string {
  return getRuntimeDataDir('agent-workspace');
}

/** Runtime 目录（runtime/） */
export function getRuntimeDir(): string {
  return isDev()
    ? path.join(devProjectRoot(), 'runtime')
    : path.join(process.resourcesPath, 'runtime');
}

/** Hardboard 硬件 vibecoding 资源目录 */
export function getHardboardDir(...segments: string[]): string {
  return path.join(getRuntimeDir(), 'hardboard', ...segments);
}

/** Claude Code CLI 二进制路径 */
export function getClaudeBin(): string {
  return path.join(
    getAgentDir(),
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'bin',
    'claude.exe',
  );
}

/** MCP 配置文件路径（动态生成时无需使用） */
export function getMcpConfigPath(): string {
  return path.join(getRuntimeDir(), 'mcp-config.json');
}

/** API Key 文件路径 */
export function getApiKeyPath(): string {
  if (isDev()) {
    return path.join(devProjectRoot(), 'apikey.txt');
  }
  // 使用 app.getPath('userData') 但不要被后续的 setPath 影响
  // 这里使用固定的 base path
  const base = app.isReady()
    ? app.getPath('appData')
    : process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  return path.join(base, 'vibeide', 'apikey.txt');
}

/** 运行时数据目录（recordings、workflows、logs 等） */
export function getRuntimeDataDir(...segments: string[]): string {
  const base = isDev()
    ? path.join(devProjectRoot(), 'runtime')
    : path.join(app.getPath('userData'), 'runtime-data');
  return path.join(base, ...segments);
}

/** 用户数据目录下的子路径 */
export function getUserDataPath(...segments: string[]): string {
  return path.join(app.getPath('userData'), ...segments);
}

/** Electron Chrome profile 目录 */
export function getChromeProfileDir(): string {
  return getRuntimeDataDir('chrome_profile', 'electron-shell');
}

/** 录制文件目录 */
export function getRecordingsDir(): string {
  return getRuntimeDataDir('recordings');
}

/** 工作流文件目录 */
export function getWorkflowsDir(): string {
  return getRuntimeDataDir('workflows');
}

/** 截图目录 */
export function getScreenshotsDir(): string {
  return isDev()
    ? path.join(devProjectRoot(), 'agent', 'screenshots')
    : path.join(app.getPath('userData'), 'screenshots');
}

/** 日志目录 */
export function getLogDir(): string {
  return isDev()
    ? path.join(devProjectRoot(), 'agent', 'logs')
    : path.join(app.getPath('userData'), 'logs');
}

/** 编译后的 Runtime JS 入口（tsc outputDir=dist, rootDir=src, 所以 dist/mcp/...） */
export function getRuntimeServerEntry(): string {
  return path.join(getRuntimeDir(), 'dist', 'mcp', 'server.js');
}

/** Runtime tsx.cmd 路径 */
export function getTsxBin(): string {
  return path.join(getRuntimeDir(), 'node_modules', '.bin', 'tsx.cmd');
}

/** Dev 模式下 Runtime 源码入口 */
export function getRuntimeDevServerEntry(): string {
  return path.join(getRuntimeDir(), 'src', 'mcp', 'server.ts');
}
