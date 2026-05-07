import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';
import { exportApi, ExportFormat, ExportOptions } from '../api/export';
import CoverGenerator from '../components/CoverGenerator';
import ProjectNotes from '../components/ProjectNotes';
import WritingGoals from '../components/WritingGoals';

type ShowToast = (type: 'success' | 'error' | 'info' | 'warning', message: string) => void;

const handleExportBackup = async (projectId: string, showToast: ShowToast) => {
  try {
    const response = await fetch(`/api/backup/export/${projectId}`);
    if (!response.ok) throw new Error('导出失败');
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-backup-${projectId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', '备份已导出');
  } catch {
    showToast('error', '导出失败');
  }
};

const handleImportBackup = async (showToast: ShowToast, navigate: (path: string) => void) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/backup/import', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('导入失败');
      const result = await response.json();
      showToast('success', `项目「${result.name}」已导入`);
      navigate(`/projects/${result.id}`);
    } catch {
      showToast('error', '导入失败');
    }
  };
  input.click();
};

const languageLabels: Record<string, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
};

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject, stats, fetchProject, fetchStats, deleteProject } = useProjectStore();
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();

  const [exportOpen, setExportOpen] = useState(false);
  const [formats, setFormats] = useState<ExportFormat[]>([]);
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    include_toc: true,
    include_cover: true,
    paper_size: 'a4',
  });
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    exportApi.listFormats().then(setFormats).catch(() => {});
  }, []);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen]);

  const handleExport = async (format: string) => {
    if (!id) return;
    setExportOpen(false);
    try {
      await exportApi.download(id, format, exportOptions);
      showToast('success', `${format.toUpperCase()} 已导出`);
    } catch (err) {
      showToast('error', (err as Error).message || '导出失败');
    }
  };

  const handleDelete = async () => {
    if (!id || !currentProject) return;
    if (!await confirm({ message: `确定删除项目「${currentProject.name}」？此操作不可撤销。`, variant: 'danger', confirmText: '删除' })) return;
    try {
      await deleteProject(id);
      showToast('success', '项目已删除');
      navigate('/');
    } catch {
      showToast('error', '删除失败');
    }
  };

  useEffect(() => {
    if (id) {
      fetchProject(id);
      fetchStats(id);
    }
  }, [id, fetchProject, fetchStats]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-parchment-dim/40">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载中...
        </div>
      </div>
    );
  }

  const progress = stats?.progress_percent || 0;

  return (
    <div className="animate-fade-in">
      {Dialog}
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            返回工作台
          </Link>
          <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">{currentProject.name}</h1>
          <p className="text-parchment-dim/50 mt-1 text-sm">
            {currentProject.genre || '未分类'} · {languageLabels[currentProject.language] || currentProject.language}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Link to={`/projects/${id}/outline`} className="btn-primary text-sm">大纲管理</Link>
          <Link to={`/projects/${id}/terminology`} className="btn-secondary text-sm">术语库</Link>
          <Link to={`/projects/${id}/read`} className="btn-ghost text-sm px-3" title="阅读模式">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </Link>
          <Link to={`/projects/${id}/kanban`} className="btn-ghost text-sm px-3" title="章节看板">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </Link>
          <Link to={`/projects/${id}/timeline`} className="btn-ghost text-sm px-3" title="生成时间线">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Link>
          <Link to={`/projects/${id}/pacing`} className="btn-ghost text-sm px-3" title="节奏分析">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </Link>
          <Link to={`/projects/${id}/health`} className="btn-ghost text-sm px-3" title="故事健康度">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </Link>
          <Link to={`/projects/${id}/foreshadowing`} className="btn-ghost text-sm px-3" title="伏笔追踪">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </Link>
          <Link to={`/projects/${id}/chat`} className="btn-ghost text-sm px-3" title="写作助手">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </Link>
          {id && <CoverGenerator projectId={id} />}
          <div ref={exportRef} className="relative">
            <button onClick={() => setExportOpen(!exportOpen)} className="btn-ghost text-sm px-3" title="导出">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-study-card border border-study-border rounded-lg shadow-xl z-50 animate-fade-in">
                {/* Options */}
                <div className="p-3 border-b border-study-border/30 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-parchment-dim/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.include_toc ?? true}
                      onChange={(e) => setExportOptions({ ...exportOptions, include_toc: e.target.checked })}
                      className="rounded border-study-border bg-study-deep text-ink focus:ring-ink/30"
                    />
                    包含目录
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-parchment-dim/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.include_cover ?? true}
                      onChange={(e) => setExportOptions({ ...exportOptions, include_cover: e.target.checked })}
                      className="rounded border-study-border bg-study-deep text-ink focus:ring-ink/30"
                    />
                    包含封面
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-parchment-dim/60">纸张</span>
                    <select
                      className="input text-[11px] py-0.5 px-1.5 flex-1"
                      value={exportOptions.paper_size || 'a4'}
                      onChange={(e) => setExportOptions({ ...exportOptions, paper_size: e.target.value })}
                    >
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-parchment-dim/60">章节</span>
                    <input
                      type="number"
                      className="input text-[11px] py-0.5 px-1.5 w-14"
                      placeholder="起始"
                      min={1}
                      value={exportOptions.chapter_start || ''}
                      onChange={(e) => setExportOptions({ ...exportOptions, chapter_start: e.target.value ? Number(e.target.value) : undefined })}
                    />
                    <span className="text-parchment-dim/30">-</span>
                    <input
                      type="number"
                      className="input text-[11px] py-0.5 px-1.5 w-14"
                      placeholder="结束"
                      min={1}
                      value={exportOptions.chapter_end || ''}
                      onChange={(e) => setExportOptions({ ...exportOptions, chapter_end: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </div>
                </div>
                {/* Formats */}
                <div className="py-1">
                  {formats.map((f) => (
                    <button
                      key={f.format}
                      onClick={() => handleExport(f.format)}
                      className="w-full text-left px-3 py-2 text-sm text-parchment-dim hover:text-parchment hover:bg-study-glow transition-colors"
                    >
                      {f.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => id && handleExportBackup(id, showToast)} className="btn-ghost text-sm px-3" title="导出备份 (JSON)">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </button>
          <button onClick={() => handleImportBackup(showToast, navigate)} className="btn-ghost text-sm px-3" title="导入备份">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </button>
          <Link to={`/projects/${id}/edit`} className="btn-ghost text-sm px-3" title="编辑项目">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </Link>
          <button onClick={handleDelete} className="btn-ghost text-sm px-3 text-red-400/70 hover:text-red-400" title="删除项目">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: '总章节', value: stats?.total_chapters || 0 },
          { label: '已完成', value: stats?.completed_chapters || 0, accent: true },
          { label: '总字数', value: (stats?.total_words || 0).toLocaleString() },
          { label: '进度', value: `${progress}%`, isProgress: true },
        ].map((stat) => (
          <div key={stat.label} className="card-compact">
            <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">{stat.label}</p>
            {stat.isProgress ? (
              <div className="mt-2">
                <p className="text-2xl font-display font-bold text-ink mb-1.5">{stat.value}</p>
                <div className="w-full bg-study-deep rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-ink-dark to-ink rounded-full h-1.5 transition-all duration-700" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <p className={`text-2xl font-display font-bold mt-1 ${stat.accent ? 'text-ink' : 'text-parchment'}`}>
                {stat.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Description */}
      {currentProject.description && (
        <div className="card mb-6">
          <div className="section-title mb-3">小说简介</div>
          <p className="text-sm text-parchment-dim/70 leading-relaxed font-serif">{currentProject.description}</p>
        </div>
      )}

      {/* Quick actions */}
      <div className="section-title mb-4">快速入口</div>
      <div className="grid grid-cols-2 gap-3">
        <Link to={`/projects/${id}/outline`} className="card-compact group hover:border-ink/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ink/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h4 className="font-medium text-parchment text-sm group-hover:text-ink transition-colors">大纲管理</h4>
              <p className="text-[11px] text-parchment-dim/40">编辑全书大纲和章节概述</p>
            </div>
          </div>
        </Link>

        <Link to={`/projects/${id}/terminology`} className="card-compact group hover:border-ink/20 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ink/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div>
              <h4 className="font-medium text-parchment text-sm group-hover:text-ink transition-colors">术语库</h4>
              <p className="text-[11px] text-parchment-dim/40">管理专有名词</p>
            </div>
          </div>
        </Link>

        <Link to={`/projects/${id}/story-bible`} className="card-compact group hover:border-ink/20 transition-all opacity-80 hover:opacity-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-ink/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div>
              <h4 className="font-medium text-parchment text-sm group-hover:text-ink transition-colors">高级：故事圣经</h4>
              <p className="text-[11px] text-parchment-dim/40">可选功能，适合长篇或多线叙事项目</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Writing goals */}
      <div className="mt-8">
        <div className="section-title mb-4">写作目标</div>
        {id && <WritingGoals projectId={id} />}
      </div>

      {/* Notes */}
      <div className="mt-8">
        <div className="section-title mb-4">项目笔记</div>
        {id && <ProjectNotes projectId={id} />}
      </div>
    </div>
  );
}
