import React, { useCallback, useEffect, useState } from 'react';
import type { ManagedSkillDetail, ManagedSkillSummary, SkillManagerSnapshot, WorkbenchItem, WorkbenchOverview, WorkbenchSection } from '../types';

interface Props {
  overview: WorkbenchOverview | null;
  onRefresh: () => void;
  onOpenItem: (targetPath: string) => void;
  onEditItem: (item: WorkbenchItem) => void;
}

function formatTime(value: number | null): string {
  if (!value) return '未知时间';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(value: number | null): string {
  if (value == null) return '目录';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isBrowserRunnable(item: WorkbenchItem): boolean {
  return item.kind === 'file' && /\.(html?|svg)$/i.test(item.name);
}

function isEditable(item: WorkbenchItem): boolean {
  return item.kind === 'file' && /(?:CMakeLists\.txt|\.c|\.h|\.cpp|\.hpp|\.S|\.md|\.json|\.txt|\.yaml|\.yml)$/i.test(item.name);
}

const EMPTY_SKILL: ManagedSkillDetail = {
  id: '', name: '', description: '', body: '# 使用说明\n\n请描述 Agent 应遵循的步骤、边界和验收标准。',
  sourcePath: '', sourceFormat: 'standard', updatedAt: 0, deployed: false, command: '',
};

function SkillManager({ onOpenFolder, onRefreshWorkbench }: { onOpenFolder: (folderPath: string) => void; onRefreshWorkbench: () => void }) {
  const [snapshot, setSnapshot] = useState<SkillManagerSnapshot | null>(null);
  const [editor, setEditor] = useState<ManagedSkillDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refresh = useCallback(async () => {
    const result = await window.electronAPI?.listManagedSkills?.();
    if (result?.ok) setSnapshot({ skills: result.skills, status: result.status });
    else setFeedback(result?.error || 'Skill 仓库读取失败');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const editSkill = async (skill: ManagedSkillSummary) => {
    const result = await window.electronAPI?.getManagedSkill?.(skill.id);
    if (result?.ok && result.skill) setEditor(result.skill);
    else setFeedback(result?.error || 'Skill 读取失败');
  };

  const saveSkill = async () => {
    if (!editor) return;
    setBusy(true);
    const result = await window.electronAPI?.saveManagedSkill?.({
      id: editor.id, name: editor.name, description: editor.description, body: editor.body,
      originalId: editor.sourcePath ? editor.id : undefined,
    });
    setBusy(false);
    if (!result?.ok) {
      setFeedback(result?.error || 'Skill 保存失败');
      return;
    }
    if (result.snapshot) setSnapshot(result.snapshot);
    setEditor(null);
    setFeedback('已保存并同步到 Agent 工作区');
    onRefreshWorkbench();
  };

  const deleteSkill = async (skill: ManagedSkillSummary) => {
    if (!window.confirm(`确定删除 Skill“${skill.name}”吗？此操作会同时撤销 Agent 工作区中的部署。`)) return;
    setBusy(true);
    const result = await window.electronAPI?.deleteManagedSkill?.(skill.id);
    setBusy(false);
    if (result?.ok && result.snapshot) {
      setSnapshot(result.snapshot);
      setFeedback('Skill 已删除并撤销部署');
      onRefreshWorkbench();
    } else setFeedback(result?.error || 'Skill 删除失败');
  };

  const syncSkills = async () => {
    setBusy(true);
    const result = await window.electronAPI?.syncManagedSkills?.();
    setBusy(false);
    if (result?.ok) {
      setSnapshot({ skills: result.skills, status: result.status });
      setFeedback(`同步完成：${result.status.deployedCount} 个 Skill 可用`);
    } else setFeedback(result?.error || '同步失败');
  };

  return (
    <section className="workspace-section skill-manager nes-container is-rounded">
      <div className="workspace-section-header skill-manager-header">
        <div>
          <h3>Skills</h3>
          <p>在固定源仓库中维护，保存后自动部署为 Agent 原生 Skill。</p>
        </div>
        <div className="skill-manager-actions">
          <button className="nes-btn" type="button" onClick={() => snapshot && onOpenFolder(snapshot.status.sourceDir)}>打开目录</button>
          <button className="nes-btn" type="button" disabled={busy} onClick={() => void syncSkills()}>立即同步</button>
          <button className="nes-btn is-primary" type="button" disabled={!snapshot?.status.writable} onClick={() => setEditor({ ...EMPTY_SKILL })}>新建 Skill</button>
        </div>
        {snapshot ? (
          <div className="skill-manager-status">
            <span className={snapshot.status.writable ? 'is-ready' : 'is-error'}>{snapshot.status.writable ? '源仓库可写' : '源仓库只读'}</span>
            <span>{snapshot.status.deployedCount}/{snapshot.status.skillCount} 已部署</span>
            <code title={snapshot.status.sourceDir}>{snapshot.status.sourceDir}</code>
          </div>
        ) : null}
        {feedback ? <div className="skill-manager-feedback" aria-live="polite">{feedback}</div> : null}
      </div>
      <div className="skill-manager-list">
        {snapshot?.skills.length ? snapshot.skills.map((skill) => (
          <article className="skill-manager-row" key={skill.id}>
            <div className="skill-manager-state" title={skill.deployed ? 'Agent 已可用' : '等待同步'}>{skill.deployed ? '✓' : '○'}</div>
            <div className="skill-manager-copy">
              <div><strong>{skill.name}</strong><code>{skill.command}</code>{skill.sourceFormat === 'legacy' ? <em>兼容格式</em> : null}</div>
              <p>{skill.description}</p>
            </div>
            <div className="skill-manager-row-actions">
              <button type="button" className="nes-btn" onClick={() => void editSkill(skill)}>编辑</button>
              <button type="button" className="nes-btn is-error" disabled={busy} onClick={() => void deleteSkill(skill)}>删除</button>
            </div>
          </article>
        )) : <div className="workspace-empty">暂无 Skill，可点击“新建 Skill”添加。</div>}
      </div>
      {editor ? (
        <div className="skill-editor-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditor(null)}>
          <form className="skill-editor" onSubmit={(event) => { event.preventDefault(); void saveSkill(); }}>
            <div className="skill-editor-title"><strong>{editor.sourcePath ? '编辑 Skill' : '新建 Skill'}</strong><button type="button" onClick={() => setEditor(null)} aria-label="关闭">×</button></div>
            <label>Skill ID<input className="nes-input" value={editor.id} disabled={Boolean(editor.sourcePath)} placeholder="例如 espidf-helper" onChange={(event) => setEditor({ ...editor, id: event.target.value.toLowerCase() })} /></label>
            <label>显示名称<input className="nes-input" value={editor.name} placeholder="简短、明确的名称" onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            <label>触发描述<textarea className="nes-textarea skill-description" value={editor.description} placeholder="说明何时应使用该 Skill" onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
            <label>Skill 指令<textarea className="nes-textarea skill-body" value={editor.body} onChange={(event) => setEditor({ ...editor, body: event.target.value })} /></label>
            <div className="skill-editor-actions"><button className="nes-btn" type="button" onClick={() => setEditor(null)}>取消</button><button className="nes-btn is-primary" type="submit" disabled={busy}>{busy ? '保存中…' : '保存并同步'}</button></div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function renderSection(section: WorkbenchSection, onOpenItem: (item: WorkbenchItem) => void, onOpenFolder: (folderPath: string) => void) {
  return (
    <section key={section.id} className="workspace-section nes-container is-rounded">
      <div className="workspace-section-header">
        <div>
          <h3>{section.title}</h3>
          <p>{section.description}</p>
        </div>
        <div className="workspace-section-tools">
          <code>{section.folderPath}</code>
          <button className="nes-btn workspace-open-folder" type="button" onClick={() => onOpenFolder(section.folderPath)}>在资源管理器中打开</button>
        </div>
      </div>
      <div className="workspace-items">
        {section.items.length ? section.items.map((item: WorkbenchItem) => (
          <button
            key={item.path}
            type="button"
            className="workspace-item workspace-item-button nes-container is-rounded"
            onClick={() => onOpenItem(item)}
            title={`打开 ${item.path}`}
            data-workbench-path={item.path}
          >
            <div className="workspace-item-kind">{item.kind === 'dir' ? 'DIR' : isBrowserRunnable(item) ? 'RUN' : isEditable(item) ? 'EDIT' : 'FILE'}</div>
            <div className="workspace-item-body">
              <strong title={item.summary || item.label || item.name}>{item.summary || item.label || item.name}</strong>
              <span title={item.detail || item.path}>{item.detail || item.path}</span>
              {item.sourceUrl ? <em title={item.sourceUrl}>{item.sourceUrl}</em> : null}
            </div>
            <div className="workspace-item-meta">
              <span>{formatSize(item.size)}</span>
              <span>{formatTime(item.updatedAt)}</span>
            </div>
          </button>
        )) : (
          <div className="workspace-empty">{section.emptyText}</div>
        )}
      </div>
    </section>
  );
}

export default function WorkspacePanel({ overview, onRefresh, onOpenItem, onEditItem }: Props) {
  const [folderFeedback, setFolderFeedback] = useState<{ message: string; detail: string; tone: 'pending' | 'success' | 'error' } | null>(null);

  const handleOpenFolder = async (folderPath: string) => {
    setFolderFeedback({ message: '正在打开目录…', detail: folderPath, tone: 'pending' });
    const result = await window.electronAPI?.openWorkbenchFolder?.(folderPath);
    setFolderFeedback(result?.ok
      ? { message: '已在资源管理器中打开', detail: result.path || folderPath, tone: 'success' }
      : { message: '目录打开失败', detail: result?.error || '目录不可用', tone: 'error' });
  };

  const handleOpenItem = async (item: WorkbenchItem) => {
    if (window.electronAPI?.isWorkbenchSmokeTest) {
      onOpenItem(item.path);
      return;
    }

    if (item.kind === 'dir' || isBrowserRunnable(item) || !isEditable(item)) {
      onOpenItem(item.path);
      return;
    }
    onEditItem(item);
  };

  return (
    <div className="workspace-panel">
      <div className="workspace-hero">
        <div>
          <span className="workspace-eyebrow">Skill Repository</span>
          <h2>Skills 与工程资源</h2>
          <p>集中管理 Skills、硬件工程和参考代码。Skill 保存后会自动部署到 Agent 工作区，并出现在左侧对话输入区的 Skills 选择器中。</p>
        </div>
        <div className="workspace-actions">
          {folderFeedback ? (
            <span
              className={`workspace-folder-feedback is-${folderFeedback.tone}`}
              aria-live="polite"
              title={folderFeedback.detail}
            >
              {folderFeedback.message}
            </span>
          ) : null}
          <button className="nes-btn" type="button" onClick={onRefresh}>刷新目录</button>
        </div>
      </div>
      <div className="workspace-grid">
        {overview?.sections.filter((section) => section.id !== 'agent-generated').map((section) => section.id === 'skills'
          ? <SkillManager key={section.id} onOpenFolder={(folderPath) => void handleOpenFolder(folderPath)} onRefreshWorkbench={onRefresh} />
          : renderSection(section, handleOpenItem, (folderPath) => void handleOpenFolder(folderPath)))}
      </div>
    </div>
  );
}
