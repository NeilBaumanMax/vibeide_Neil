import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getResourcesDir, getAppRoot, getRecordingsDir, getWorkflowsDir, getAgentDir } from './paths';

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
}

export interface WorkbenchSection {
  id: string;
  title: string;
  description: string;
  folderPath: string;
  items: WorkbenchItem[];
  emptyText: string;
}

export interface WorkbenchOverview {
  generatedAt: number;
  sections: WorkbenchSection[];
}

export interface WorkbenchOpenResult {
  kind: 'file' | 'dir';
  path: string;
  url: string;
}

const PROJECT_ROOT = getAppRoot();

function allowedWorkbenchRoots(): string[] {
  return [
    PROJECT_ROOT,
    getRecordingsDir(),
    getWorkflowsDir(),
    path.join(PROJECT_ROOT, 'agent', 'tools'),
  ].map((entry) => path.resolve(entry));
}

function isAllowedWorkbenchPath(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return allowedWorkbenchRoots().some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
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

function buildRootItems(): WorkbenchItem[] {
  const names = ['README.md', 'CLAUDE.md', 'docs', 'config', 'scripts', 'electron', 'runtime', 'agent'];
  return names
    .map((name) => statItem(path.join(PROJECT_ROOT, name)))
    .filter((entry): entry is WorkbenchItem => Boolean(entry));
}

export function getWorkbenchOverview(): WorkbenchOverview {
  return {
    generatedAt: Date.now(),
    sections: [
      {
        id: 'files',
        title: '文件',
        description: '项目主目录与核心资料入口',
        folderPath: PROJECT_ROOT,
        items: buildRootItems(),
        emptyText: '项目入口文件暂时为空',
      },
      {
        id: 'tools',
        title: '工具',
        description: 'Agent 可执行脚本与辅助工具',
        folderPath: path.join(PROJECT_ROOT, 'agent', 'tools'),
        items: listDirectory(path.join(PROJECT_ROOT, 'agent', 'tools')),
        emptyText: '工具目录暂时为空',
      },
      {
        id: 'recordings',
        title: '录制',
        description: '当前保存的浏览器录制文件',
        folderPath: getRecordingsDir(),
        items: listDirectory(getRecordingsDir(), { limit: 24, enrich: enrichRecording }),
        emptyText: '还没有录制文件',
      },
      {
        id: 'replays',
        title: '重放',
        description: '可直接复用的回放/工作流定义',
        folderPath: getWorkflowsDir(),
        items: listDirectory(getWorkflowsDir(), { limit: 24, enrich: enrichWorkflow }),
        emptyText: '还没有工作流文件',
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
