import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { shell } from 'electron';
import { getAgentDir, getAgentWorkspaceDir } from './paths';

const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_DIR = path.join(getAgentDir(), 'skills');
const DEPLOY_DIR = path.join(getAgentWorkspaceDir(), '.claude', 'skills');
const MANIFEST_FILE = path.join(DEPLOY_DIR, '.odyssey-managed.json');

export interface ManagedSkillSummary {
  id: string;
  name: string;
  description: string;
  sourcePath: string;
  sourceFormat: 'legacy' | 'standard';
  updatedAt: number;
  deployed: boolean;
  command: string;
}

export interface ManagedSkillDetail extends ManagedSkillSummary {
  body: string;
}

export interface SkillManagerStatus {
  sourceDir: string;
  deployDir: string;
  writable: boolean;
  skillCount: number;
  deployedCount: number;
  lastSyncAt: number | null;
  error?: string;
}

export interface SkillManagerSnapshot {
  skills: ManagedSkillSummary[];
  status: SkillManagerStatus;
}

interface SkillDocument {
  name: string;
  description: string;
  body: string;
}

interface ManagedManifest {
  version: 1;
  syncedAt: number;
  skills: Record<string, { sourcePath: string; hash: string }>;
}

function normalizeLegacyId(filename: string): string {
  return filename.replace(/\.md$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function escapeYaml(value: string): string {
  return JSON.stringify(value.replace(/\r?\n/g, ' ').trim());
}

function parseSkill(text: string, fallbackName: string): SkillDocument {
  let body = text.replace(/^\uFEFF/, '').trim();
  let name = fallbackName;
  let description = '';
  const match = body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
      if (!field) continue;
      const rawValue = field[2].trim();
      let value = rawValue.replace(/^'([\s\S]*)'$/, '$1');
      if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        try { value = JSON.parse(rawValue) as string; } catch { value = rawValue.slice(1, -1); }
      }
      if (field[1] === 'name' && value) name = value;
      if (field[1] === 'description') description = value;
    }
    body = body.slice(match[0].length).trim();
  }
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!name || name === fallbackName) name = heading || fallbackName;
  if (!description) {
    description = body
      .split(/\r?\n/)
      .map((line) => line.replace(/^#+\s*/, '').replace(/^[-*>\s]+/, '').trim())
      .find((line) => line && line !== heading)?.slice(0, 240)
      || `在与 ${name} 相关的任务中使用此技能。`;
  }
  return { name, description, body };
}

function serializeSkill(document: SkillDocument): string {
  return `---\nname: ${escapeYaml(document.name)}\ndescription: ${escapeYaml(document.description)}\n---\n\n${document.body.trim()}\n`;
}

function assertSkillId(id: string): string {
  const normalized = id.trim().toLowerCase();
  if (!SKILL_ID.test(normalized) || normalized.length > 64) {
    throw new Error('Skill ID 只能使用小写字母、数字和连字符，且不超过 64 个字符');
  }
  return normalized;
}

function sourceEntries(): Array<{ id: string; file: string; format: 'legacy' | 'standard' }> {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  const entries: Array<{ id: string; file: string; format: 'legacy' | 'standard' }> = [];
  for (const entry of fs.readdirSync(SOURCE_DIR, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const id = normalizeLegacyId(entry.name);
      if (id) entries.push({ id, file: path.join(SOURCE_DIR, entry.name), format: 'legacy' });
    } else if (entry.isDirectory() && SKILL_ID.test(entry.name)) {
      const file = path.join(SOURCE_DIR, entry.name, 'SKILL.md');
      if (fs.existsSync(file) && fs.statSync(file).isFile()) entries.push({ id: entry.name, file, format: 'standard' });
    }
  }
  const standardIds = new Set(entries.filter((entry) => entry.format === 'standard').map((entry) => entry.id));
  return entries.filter((entry) => entry.format === 'standard' || !standardIds.has(entry.id));
}

function readManifest(): ManagedManifest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8')) as ManagedManifest;
    return parsed?.version === 1 && parsed.skills ? parsed : null;
  } catch {
    return null;
  }
}

function isSourceWritable(): boolean {
  try {
    fs.mkdirSync(SOURCE_DIR, { recursive: true });
    fs.accessSync(SOURCE_DIR, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function copySupportTree(source: string, target: string): void {
  const stats = fs.lstatSync(source);
  if (stats.isSymbolicLink()) return;
  if (stats.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      if (entry.startsWith('.')) continue;
      copySupportTree(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  if (stats.isFile()) fs.copyFileSync(source, target);
}

export function listManagedSkills(): SkillManagerSnapshot {
  const manifest = readManifest();
  const deployedIds = new Set(Object.keys(manifest?.skills || {}));
  const skills = sourceEntries().map((entry) => {
    const stats = fs.statSync(entry.file);
    const doc = parseSkill(fs.readFileSync(entry.file, 'utf-8'), entry.id);
    return {
      id: entry.id,
      name: doc.name,
      description: doc.description,
      sourcePath: entry.file,
      sourceFormat: entry.format,
      updatedAt: Math.round(stats.mtimeMs),
      deployed: deployedIds.has(entry.id) && fs.existsSync(path.join(DEPLOY_DIR, entry.id, 'SKILL.md')),
      command: `/${entry.id}`,
    } satisfies ManagedSkillSummary;
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return {
    skills,
    status: {
      sourceDir: SOURCE_DIR,
      deployDir: DEPLOY_DIR,
      writable: isSourceWritable(),
      skillCount: skills.length,
      deployedCount: skills.filter((skill) => skill.deployed).length,
      lastSyncAt: manifest?.syncedAt || null,
    },
  };
}

export function getManagedSkill(id: string): ManagedSkillDetail {
  const normalized = assertSkillId(id);
  const entry = sourceEntries().find((candidate) => candidate.id === normalized);
  if (!entry) throw new Error(`找不到 Skill：${normalized}`);
  const summary = listManagedSkills().skills.find((skill) => skill.id === normalized)!;
  return { ...summary, ...parseSkill(fs.readFileSync(entry.file, 'utf-8'), normalized) };
}

export function saveManagedSkill(input: { id: string; name: string; description: string; body: string; originalId?: string }): ManagedSkillDetail {
  if (!isSourceWritable()) throw new Error(`Skill 源仓库不可写：${SOURCE_DIR}`);
  const id = assertSkillId(input.id);
  const name = input.name.trim();
  const description = input.description.trim();
  const body = input.body.trim();
  if (!name) throw new Error('Skill 名称不能为空');
  if (!description) throw new Error('Skill 描述不能为空，它决定 Agent 何时使用该技能');
  if (!body) throw new Error('Skill 指令不能为空');
  if (body.length > 100_000) throw new Error('SKILL.md 超过 100KB，请拆分为支持文件');

  const existing = sourceEntries().find((entry) => entry.id === id);
  if (input.originalId) {
    if (assertSkillId(input.originalId) !== id || !existing) throw new Error('原 Skill 已不存在，请刷新后重试');
  } else if (existing) {
    throw new Error(`Skill ID 已存在：${id}`);
  }
  const targetFile = existing?.file || path.join(SOURCE_DIR, id, 'SKILL.md');
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const tempFile = `${targetFile}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempFile, serializeSkill({ name, description, body }), 'utf-8');
  fs.renameSync(tempFile, targetFile);
  syncManagedSkills();
  return getManagedSkill(id);
}

export async function deleteManagedSkill(id: string): Promise<{ ok: true; id: string }> {
  if (!isSourceWritable()) throw new Error(`Skill 源仓库不可写：${SOURCE_DIR}`);
  const normalized = assertSkillId(id);
  const entry = sourceEntries().find((candidate) => candidate.id === normalized);
  if (!entry) throw new Error(`找不到 Skill：${normalized}`);
  await shell.trashItem(entry.format === 'standard' ? path.dirname(entry.file) : entry.file);
  syncManagedSkills();
  return { ok: true, id: normalized };
}

export function syncManagedSkills(): SkillManagerSnapshot {
  fs.mkdirSync(DEPLOY_DIR, { recursive: true });
  const previous = readManifest();
  const next: ManagedManifest = { version: 1, syncedAt: Date.now(), skills: {} };
  const activeIds = new Set<string>();

  for (const entry of sourceEntries()) {
    const id = assertSkillId(entry.id);
    activeIds.add(id);
    const sourceText = fs.readFileSync(entry.file, 'utf-8');
    const normalizedText = serializeSkill(parseSkill(sourceText, id));
    const targetDir = path.join(DEPLOY_DIR, id);
    if (fs.existsSync(targetDir) && !previous?.skills[id]) {
      throw new Error(`Agent 工作区已存在非 Catnip Forge 管理的同名 Skill：${id}`);
    }
    const stagingDir = path.join(DEPLOY_DIR, `.odyssey-staging-${id}-${process.pid}-${Date.now()}`);
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.writeFileSync(path.join(stagingDir, 'SKILL.md'), normalizedText, 'utf-8');
    if (entry.format === 'standard') {
      for (const support of fs.readdirSync(path.dirname(entry.file), { withFileTypes: true })) {
        if (support.name === 'SKILL.md' || support.name.startsWith('.')) continue;
        copySupportTree(path.join(path.dirname(entry.file), support.name), path.join(stagingDir, support.name));
      }
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.renameSync(stagingDir, targetDir);
    next.skills[id] = {
      sourcePath: entry.file,
      hash: crypto.createHash('sha256').update(normalizedText).digest('hex'),
    };
  }

  for (const oldId of Object.keys(previous?.skills || {})) {
    if (!activeIds.has(oldId) && SKILL_ID.test(oldId)) {
      fs.rmSync(path.join(DEPLOY_DIR, oldId), { recursive: true, force: true });
    }
  }
  const tempManifest = `${MANIFEST_FILE}.tmp-${process.pid}`;
  fs.writeFileSync(tempManifest, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tempManifest, MANIFEST_FILE);
  return listManagedSkills();
}

export function ensureManagedSkillsDeployed(): SkillManagerSnapshot {
  try {
    return syncManagedSkills();
  } catch (error) {
    const snapshot = listManagedSkills();
    snapshot.status.error = error instanceof Error ? error.message : String(error);
    return snapshot;
  }
}

export function getSkillSourceDir(): string {
  return SOURCE_DIR;
}
