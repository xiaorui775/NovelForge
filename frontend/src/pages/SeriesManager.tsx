import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { seriesApi, Series } from '../api/series';
import { projectsApi, Project } from '../api/projects';
import { useUIStore } from '../stores/uiStore';

export default function SeriesManager() {
  const { showToast } = useUIStore();
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [editingSeries, setEditingSeries] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [addingToSeries, setAddingToSeries] = useState<string | null>(null);
  const [addProjectId, setAddProjectId] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [seriesRes, projRes] = await Promise.all([
        seriesApi.list(),
        projectsApi.list(),
      ]);
      setSeriesList(seriesRes.data);
      setAllProjects(projRes.data.filter((p: Project) => !p.deleted_at));
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { showToast('error', '请输入系列名称'); return; }
    try {
      await seriesApi.create({ name: newName, description: newDesc, project_ids: selectedProjectIds });
      showToast('success', '系列创建成功');
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setSelectedProjectIds([]);
      loadData();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast('error', detail || '创建失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确认删除此系列？项目不会被删除，只是解除关联。')) return;
    try {
      await seriesApi.delete(id);
      showToast('success', '系列已删除');
      loadData();
    } catch { showToast('error', '删除失败'); }
  };

  const handleUpdate = async (id: string) => {
    try {
      await seriesApi.update(id, { name: editName, description: editDesc });
      showToast('success', '系列已更新');
      setEditingSeries(null);
      loadData();
    } catch { showToast('error', '更新失败'); }
  };

  const handleAddProject = async () => {
    if (!addingToSeries || !addProjectId) return;
    try {
      await seriesApi.addProject(addingToSeries, addProjectId);
      showToast('success', '项目已加入系列');
      setAddingToSeries(null);
      setAddProjectId('');
      loadData();
    } catch { showToast('error', '添加失败'); }
  };

  const handleRemoveProject = async (seriesId: string, projectId: string) => {
    try {
      await seriesApi.removeProject(seriesId, projectId);
      showToast('success', '项目已移出系列');
      loadData();
    } catch { showToast('error', '移除失败'); }
  };

  const handleMoveUp = async (seriesId: string, projects: Series['projects'], index: number) => {
    if (index === 0) return;
    const ids = [...projects.map(p => p.id)];
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    try {
      await seriesApi.reorder(seriesId, ids);
      loadData();
    } catch { showToast('error', '排序失败'); }
  };

  const handleMoveDown = async (seriesId: string, projects: Series['projects'], index: number) => {
    if (index >= projects.length - 1) return;
    const ids = [...projects.map(p => p.id)];
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    try {
      await seriesApi.reorder(seriesId, ids);
      loadData();
    } catch { showToast('error', '排序失败'); }
  };

  const unassignedProjects = allProjects.filter(p => !p.series_id);

  if (loading) {
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

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">系列管理</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          + 创建系列
        </button>
      </div>

      {/* Create series form */}
      {showCreate && (
        <div className="card mb-6 border-ink/20 animate-slide-up">
          <h3 className="font-display text-lg font-semibold text-parchment mb-4">创建系列</h3>
          <input
            type="text"
            className="input w-full mb-3 text-sm"
            placeholder={'系列名称，如"灵脉纪元系列"'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <textarea
            className="textarea w-full h-20 mb-3 text-sm"
            placeholder="系列描述（可选）"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          {allProjects.length > 0 && (
            <div className="mb-4">
              <p className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium mb-2">选择要加入的项目</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {allProjects.map(p => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-parchment-dim/70 hover:text-parchment-dim cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(p.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedProjectIds([...selectedProjectIds, p.id]);
                        else setSelectedProjectIds(selectedProjectIds.filter(id => id !== p.id));
                      }}
                    />
                    {p.name}
                    {p.series_id && <span className="text-[10px] text-amber-400/60">（已在其他系列中）</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={handleCreate} className="btn-primary text-sm">创建</button>
            <button onClick={() => setShowCreate(false)} className="btn-ghost text-sm">取消</button>
          </div>
        </div>
      )}

      {/* Series list */}
      {seriesList.length === 0 ? (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 text-parchment-dim/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <p className="text-parchment-dim/50 text-sm">还没有系列</p>
          <p className="text-parchment-dim/30 text-xs mt-1">创建系列可将多部作品关联，续作生成时自动注入前作上下文</p>
        </div>
      ) : (
        <div className="space-y-4">
          {seriesList.map(series => (
            <div key={series.id} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {editingSeries === series.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input text-sm py-1 w-48"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <button onClick={() => handleUpdate(series.id)} className="btn-primary text-xs px-3 py-1">保存</button>
                      <button onClick={() => setEditingSeries(null)} className="btn-ghost text-xs">取消</button>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-display text-lg font-semibold text-parchment">{series.name}</h3>
                      <span className="text-xs text-parchment-dim/40">{series.projects.length} 部作品</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {editingSeries !== series.id && (
                    <>
                      <button
                        onClick={() => { setEditingSeries(series.id); setEditName(series.name); setEditDesc(series.description || ''); }}
                        className="btn-ghost text-xs"
                      >
                        编辑
                      </button>
                      <button onClick={() => handleDelete(series.id)} className="text-xs text-red-400/60 hover:text-red-400">
                        删除
                      </button>
                    </>
                  )}
                </div>
              </div>
              {series.description && (
                <p className="text-sm text-parchment-dim/60 mb-3">{series.description}</p>
              )}
              {editingSeries === series.id && (
                <textarea
                  className="textarea w-full h-16 mb-3 text-sm"
                  placeholder="系列描述"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              )}

              {/* Projects in series */}
              {series.projects.length > 0 ? (
                <div className="space-y-1.5">
                  {series.projects.map((p, idx) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-study-deep/50 rounded-lg">
                      <span className="text-xs text-ink/50 font-mono w-6 text-center">{idx + 1}</span>
                      <Link to={`/projects/${p.id}`} className="text-sm text-parchment-dim/80 hover:text-ink transition-colors flex-1">
                        {p.name}
                      </Link>
                      <span className="text-[10px] text-parchment-dim/30">{p.genre || ''}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleMoveUp(series.id, series.projects, idx)}
                          disabled={idx === 0}
                          className="p-1 text-parchment-dim/30 hover:text-ink disabled:opacity-20 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                        </button>
                        <button
                          onClick={() => handleMoveDown(series.id, series.projects, idx)}
                          disabled={idx >= series.projects.length - 1}
                          className="p-1 text-parchment-dim/30 hover:text-ink disabled:opacity-20 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                        </button>
                        <button
                          onClick={() => handleRemoveProject(series.id, p.id)}
                          className="p-1 text-parchment-dim/30 hover:text-red-400 transition-colors"
                          title="移出系列"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-parchment-dim/40 py-2">尚未添加作品</p>
              )}

              {/* Add project */}
              {addingToSeries === series.id ? (
                <div className="flex items-center gap-2 mt-3">
                  <select
                    className="input text-sm py-1.5 flex-1"
                    value={addProjectId}
                    onChange={(e) => setAddProjectId(e.target.value)}
                  >
                    <option value="">选择项目</option>
                    {unassignedProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button onClick={handleAddProject} disabled={!addProjectId} className="btn-primary text-xs px-3 py-1.5">添加</button>
                  <button onClick={() => { setAddingToSeries(null); setAddProjectId(''); }} className="btn-ghost text-xs">取消</button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingToSeries(series.id)}
                  className="text-xs text-ink/50 hover:text-ink mt-3 transition-colors"
                >
                  + 添加作品
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
