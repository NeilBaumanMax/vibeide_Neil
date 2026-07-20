import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { shell } from 'electron';
import { getAgentDir, getRecordingsDir, getWorkflowsDir, getAgentWorkspaceDir, getHardboardDir, getResourcesDir, getRuntimeDataDir } from './paths';

export interface WorkbenchItem {
  name: string;
  kind: 'file' | 'dir';
  path: string;
  updatedAt: number | null;
  size: number | null;
  label?: string;
  summary?: string;
  detail?: string;
  actionCount?: number | null;
  sourceUrl?: string;
  category?: 'skill' | 'agent' | 'hardware' | 'reference' | 'doc' | 'imported';
}

export interface WorkbenchSection {
  id: string;
  title: string;
  description: string;
  folderPath: string;
  items: WorkbenchItem[];
  emptyText: string;
  removable?: boolean;
}

export interface WorkbenchOverview {
  generatedAt: number;
  hardboardProjects: string[];
  sections: WorkbenchSection[];
}

export interface WorkbenchOpenResult {
  kind: 'file' | 'dir';
  path: string;
  url: string;
}

export interface WorkbenchFileResult {
  ok: boolean;
  path?: string;
  text?: string;
  error?: string;
}

export interface WorkbenchDirectoryResult {
  ok: boolean;
  path?: string;
  items?: WorkbenchItem[];
  error?: string;
}

export interface WorkbenchMutationResult {
  ok: boolean;
  path?: string;
  oldPath?: string;
  kind?: 'file' | 'dir';
  error?: string;
}

const AGENT_DIR = getAgentDir();
const AGENT_TOOLS_DIR = path.join(AGENT_DIR, 'tools');
const SKILLS_DIR = path.join(AGENT_DIR, 'skills');
const DOCS_DIR = getResourcesDir('docs');
const IMPORTED_FOLDERS_FILE = getRuntimeDataDir('workbench-imports.json');
const EDITOR_EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules', 'build', 'managed_components', 'dist', 'dist-package', '__pycache__']);
const EDITOR_TEXT_FILE = /(?:^|\/)(?:CMakeLists\.txt|Makefile|Dockerfile|Kconfig(?:\.projbuild)?|sdkconfig(?:\.defaults)?|[^/]+\.(?:c|h|cpp|hpp|cc|hh|S|asm|md|mdx|json|jsonc|txt|yaml|yml|toml|ini|cfg|conf|html?|css|less|scss|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|cmd|bat|xml|csv))$/i;

function allowedWorkbenchRoots(): string[] {
  return [
    getAgentWorkspaceDir(),
    getRecordingsDir(),
    getWorkflowsDir(),
    AGENT_TOOLS_DIR,
    getHardboardDir(),
    DOCS_DIR,
    SKILLS_DIR,
    ...readImportedFolders(),
  ].map((entry) => path.resolve(entry));
}

function isAllowedWorkbenchPath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return allowedWorkbenchRoots().some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

function isWorkbenchRoot(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const protectedRoots = [
    ...allowedWorkbenchRoots(),
    getHardboardDir('projects'),
    getHardboardDir('example'),
    SKILLS_DIR,
  ].map((entry) => path.resolve(entry));
  return protectedRoots.some((root) => resolved === root);
}

function validateEntryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') throw new Error('名称不能为空');
  if (trimmed !== path.basename(trimmed) || /[\\/:*?"<>|]/.test(trimmed)) {
    throw new Error('名称不能包含路径分隔符或 Windows 保留字符');
  }
  return trimmed;
}

function statItem(filePath: string, enrich?: (item: WorkbenchItem) => WorkbenchItem): WorkbenchItem | null {
  try {
    const stats = fs.statSync(filePath);
    const item: WorkbenchItem = {
      name: path.basename(filePath),
      kind: stats.isDirectory() ? 'dir' : 'file',
      path: filePath,
      updatedAt: Number.isFinite(stats.mtimeMs) ? Math.round(stats.mtimeMs) : null,
      size: stats.isDirectory() ? null : stats.size,
    };
    return enrich ? enrich(item) : item;
  } catch {
    return null;
  }
}

function listDirectory(folderPath: string, options?: { limit?: number; includeHidden?: boolean; enrich?: (item: WorkbenchItem) => WorkbenchItem }): WorkbenchItem[] {
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => options?.includeHidden || !entry.name.startsWith('.'))
      .map((entry) => statItem(path.join(folderPath, entry.name), options?.enrich))
      .filter((entry): entry is WorkbenchItem => Boolean(entry))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        if ((b.updatedAt ?? 0) !== (a.updatedAt ?? 0)) return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
        return a.name.localeCompare(b.name, 'zh-CN');
      });

    return entries.slice(0, options?.limit ?? 12);
  } catch {
    return [];
  }
}

function listFilesRecursive(folderPath: string, options?: {
  limit?: number;
  include?: RegExp;
  excludeDirs?: Set<string>;
  category?: WorkbenchItem['category'];
}): WorkbenchItem[] {
  const results: WorkbenchItem[] = [];
  const excludeDirs = options?.excludeDirs ?? new Set(['.git', 'node_modules', 'build', 'managed_components', 'dist', 'dist-package']);
  const visit = (dir: string, depth: number) => {
    if (results.length >= (options?.limit ?? 24) || depth > 5 || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || excludeDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (options?.include && !options.include.test(entry.name) && !options.include.test(fullPath)) continue;
      const item = statItem(fullPath, (base) => ({
        ...base,
        category: options?.category,
        detail: path.relative(folderPath, fullPath).replace(/\\/g, '/'),
      }));
      if (item) results.push(item);
      if (results.length >= (options?.limit ?? 24)) return;
    }
  };
  visit(folderPath, 0);
  return results.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function readImportedFolders(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(IMPORTED_FOLDERS_FILE, 'utf-8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => path.resolve(entry))
      .filter((entry, index, all) => fs.existsSync(entry) && fs.statSync(entry).isDirectory() && all.indexOf(entry) === index);
  } catch {
    return [];
  }
}

function writeImportedFolders(folders: string[]): void {
  fs.mkdirSync(path.dirname(IMPORTED_FOLDERS_FILE), { recursive: true });
  fs.writeFileSync(IMPORTED_FOLDERS_FILE, JSON.stringify(folders, null, 2), 'utf-8');
}

export function importWorkbenchFolder(folderPath: string): WorkbenchOverview {
  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`导入路径不是文件夹: ${resolved}`);
  }
  const current = readImportedFolders();
  if (!current.includes(resolved)) {
    writeImportedFolders([...current, resolved]);
  }
  return getWorkbenchOverview();
}

export function removeImportedWorkbenchFolder(folderPath: string): WorkbenchOverview {
  const resolved = path.resolve(folderPath);
  const next = readImportedFolders().filter((entry) => entry !== resolved);
  writeImportedFolders(next);
  return getWorkbenchOverview();
}

function enrichRecording(item: WorkbenchItem): WorkbenchItem {
  if (item.kind !== 'file' || !item.name.endsWith('.json')) return item;

  try {
    const payload = JSON.parse(fs.readFileSync(item.path, 'utf-8')) as {
      label?: string;
      startUrl?: string;
      startTitle?: string;
      actionCount?: number;
      events?: Array<{ title?: string; url?: string }>;
    };
    const label = payload.label || item.name.replace(/\.json$/i, '').replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/, '');
    const actionCount = typeof payload.actionCount === 'number' ? payload.actionCount : payload.events?.length ?? null;
    const startTitle = payload.startTitle || payload.events?.[0]?.title || '';
    const startUrl = payload.startUrl || payload.events?.[0]?.url || '';
    return {
      ...item,
      label,
      actionCount,
      sourceUrl: startUrl,
      summary: actionCount == null ? label : `${label} · ${actionCount} 个动作`,
      detail: startTitle || startUrl || item.name,
    };
  } catch {
    return item;
  }
}

function enrichWorkflow(item: WorkbenchItem): WorkbenchItem {
  if (item.kind !== 'file' || !item.name.endsWith('.json')) return item;

  try {
    const payload = JSON.parse(fs.readFileSync(item.path, 'utf-8')) as {
      name?: string;
      sourceUrl?: string;
      sourceTitle?: string;
      recordingFile?: string;
      extract?: { type?: string; selector?: string };
    };
    const label = payload.name || item.name.replace(/\.json$/i, '');
    return {
      ...item,
      label,
      sourceUrl: payload.sourceUrl || '',
      summary: `${label}${payload.extract?.type ? ` · ${payload.extract.type}` : ''}`,
      detail: payload.sourceTitle || payload.recordingFile || payload.sourceUrl || item.name,
    };
  } catch {
    return item;
  }
}

export function getWorkbenchOverview(): WorkbenchOverview {
  return {
    generatedAt: Date.now(),
    hardboardProjects: listDirectory(getHardboardDir('projects'), { limit: 100 })
      .filter((item) => item.kind === 'dir')
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b, 'zh-CN')),
    sections: [
      {
        id: 'agent-generated',
        title: 'Agent 生成',
        description: 'Agent 生成的文件与临时工程产物',
        folderPath: getAgentWorkspaceDir(),
        items: listDirectory(getAgentWorkspaceDir(), {
          limit: 12,
          enrich: (item) => ({ ...item, category: 'agent' }),
        }),
        emptyText: '还没有生成文件',
      },
      {
        id: 'hardware-files',
        title: '硬件工程',
        description: '可编译/烧录工程里的 C、CMake、配置和头文件',
        folderPath: getHardboardDir('projects'),
        items: listFilesRecursive(getHardboardDir('projects'), {
          limit: 24,
          include: /(?:CMakeLists\.txt|sdkconfig(?:\.defaults)?|\.c$|\.h$|\.cpp$|\.hpp$|\.S$)/i,
          category: 'hardware',
        }),
        emptyText: '还没有硬件工程文件',
      },
      {
        id: 'reference-code',
        title: '参考代码',
        description: 'ESP-IDF 参考示例与可复用片段',
        folderPath: getHardboardDir('example'),
        items: listFilesRecursive(getHardboardDir('example'), {
          limit: 16,
          include: /(?:CMakeLists\.txt|README\.md|\.c$|\.h$|\.cpp$|\.hpp$|\.md$)/i,
          category: 'reference',
        }),
        emptyText: '还没有参考代码',
      },
      {
        id: 'skills',
        title: 'Skills',
        description: 'Agent skills、工具说明和可编辑 Markdown',
        folderPath: SKILLS_DIR,
        items: listFilesRecursive(SKILLS_DIR, {
          limit: 16,
          include: /\.(md|json|txt)$/i,
          category: 'skill',
        }),
        emptyText: '还没有 skills 文件',
      },
    ],
  };
}

export function openWorkbenchItem(targetPath: string): WorkbenchOpenResult {
  if (!isAllowedWorkbenchPath(targetPath)) {
    throw new Error('不允许打开工作台范围外的路径');
  }

  const resolved = path.resolve(targetPath);
  const stats = fs.statSync(resolved);
  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error('只能打开文件或目录');
  }

  return {
    kind: stats.isDirectory() ? 'dir' : 'file',
    path: resolved,
    url: pathToFileURL(resolved).toString(),
  };
}

export function listWorkbenchDirectory(targetPath: string): WorkbenchDirectoryResult {
  try {
    if (!isAllowedWorkbenchPath(targetPath)) return { ok: false, error: '不允许列出仓库范围外的目录' };
    const resolved = path.resolve(targetPath);
    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) return { ok: false, error: '只能列出目录内容' };

    const items = fs.readdirSync(resolved, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.') && !EDITOR_EXCLUDED_DIRECTORIES.has(entry.name))
      .filter((entry) => entry.isDirectory() || (entry.isFile() && EDITOR_TEXT_FILE.test(entry.name)))
      .map((entry) => statItem(path.join(resolved, entry.name)))
      .filter((entry): entry is WorkbenchItem => Boolean(entry))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });

    return { ok: true, path: resolved, items };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function readWorkbenchFile(targetPath: string): WorkbenchFileResult {
  try {
    if (!isAllowedWorkbenchPath(targetPath)) return { ok: false, error: '不允许读取工作台范围外的路径' };
    const resolved = path.resolve(targetPath);
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) return { ok: false, error: '只能读取文件' };
    if (stats.size > 512 * 1024) return { ok: false, error: '文件超过 512KB，暂不在工作台预览' };
    return { ok: true, path: resolved, text: fs.readFileSync(resolved, 'utf-8') };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function writeWorkbenchFile(targetPath: string, text: string): WorkbenchFileResult {
  try {
    if (!isAllowedWorkbenchPath(targetPath)) return { ok: false, error: '不允许写入工作台范围外的路径' };
    const resolved = path.resolve(targetPath);
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) return { ok: false, error: '只能写入文件' };
    fs.writeFileSync(resolved, text, 'utf-8');
    return { ok: true, path: resolved, text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function createWorkbenchEntry(parentPath: string, name: string, kind: 'file' | 'dir'): WorkbenchMutationResult {
  try {
    if (!isAllowedWorkbenchPath(parentPath)) return { ok: false, error: '不允许在工作目录范围外新建内容' };
    const resolvedParent = path.resolve(parentPath);
    if (!fs.statSync(resolvedParent).isDirectory()) return { ok: false, error: '只能在文件夹中创建内容' };
    const targetPath = path.join(resolvedParent, validateEntryName(name));
    if (!isAllowedWorkbenchPath(targetPath)) return { ok: false, error: '目标路径不在允许范围内' };
    if (fs.existsSync(targetPath)) return { ok: false, error: '同名文件或文件夹已经存在' };

    if (kind === 'dir') fs.mkdirSync(targetPath);
    else fs.writeFileSync(targetPath, '', { encoding: 'utf-8', flag: 'wx' });
    return { ok: true, path: targetPath, kind };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function renameWorkbenchEntry(targetPath: string, nextName: string): WorkbenchMutationResult {
  try {
    if (!isAllowedWorkbenchPath(targetPath)) return { ok: false, error: '不允许重命名工作目录范围外的内容' };
    const resolved = path.resolve(targetPath);
    if (isWorkbenchRoot(resolved)) return { ok: false, error: '不能重命名文件资源管理器根目录' };
    const stats = fs.statSync(resolved);
    const nextPath = path.join(path.dirname(resolved), validateEntryName(nextName));
    if (!isAllowedWorkbenchPath(nextPath)) return { ok: false, error: '目标路径不在允许范围内' };
    if (nextPath !== resolved && fs.existsSync(nextPath)) return { ok: false, error: '同名文件或文件夹已经存在' };
    fs.renameSync(resolved, nextPath);
    return { ok: true, oldPath: resolved, path: nextPath, kind: stats.isDirectory() ? 'dir' : 'file' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteWorkbenchEntry(targetPath: string): Promise<WorkbenchMutationResult> {
  try {
    if (!isAllowedWorkbenchPath(targetPath)) return { ok: false, error: '不允许删除工作目录范围外的内容' };
    const resolved = path.resolve(targetPath);
    if (isWorkbenchRoot(resolved)) return { ok: false, error: '不能删除文件资源管理器根目录' };
    const stats = fs.statSync(resolved);
    await shell.trashItem(resolved);
    return { ok: true, path: resolved, kind: stats.isDirectory() ? 'dir' : 'file' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
