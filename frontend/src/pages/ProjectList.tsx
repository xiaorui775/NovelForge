import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';

export default function ProjectList() {
  const {
    projects, trashProjects, loading,
    fetchProjects, fetchTrash, deleteProject,
    archiveProject, unarchiveProject,
    restoreProject, permanentDeleteProject,
  } = useProjectStore();
  const { showToast } = useUIStore();
  const { confirm, Dialog } = useConfirm();
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  useEffect(() => {
    if (showTrash) {
      fetchTrash();
    } else {
      fetchProjects(showArchived);
    }
  }, [fetchProjects, fetchTrash, showArchived, showTrash]);

  const handleDelete = async (id: string, name: string) => {
    if (!await confirm({ message: `确定将「${name}」移到回收站？`, variant: 'danger', confirmText: '移到回收站' })) return;
    try {
      await deleteProject(id);
      showToast('success', '项目已移到回收站');
    } catch {
      showToast('error', '删除失败');
    }
  };

  const handlePermanentDelete = async (id: string, name: string) => {
    if (!await confirm({ message: `确定永久删除「${name}」？此操作不可撤销！`, variant: 'danger', confirmText: '永久删除' })) return;
    try {
      await permanentDeleteProject(id);
      showToast('success', '项目已永久删除');
    } catch {
      showToast('error', '删除失败');
    }
  };

  const displayProjects = showTrash ? trashProjects : projects;
  const filteredProjects = selectedTag
    ? displayProjects.filter((p) => p.tags?.includes(selectedTag))
    : displayProjects;

  const allTags = [...new Set(projects.flatMap((p) => p.tags || []))];

  return (
    <div className="animate-fade-in">
      {Dialog}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">项目管理</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowTrash(false); setShowArchived(false); }}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${!showTrash && !showArchived ? 'bg-ink text-parchment' : 'bg-study-deep text-parchment-dim/60 hover:text-parchment'}`}
          >
            进行中
          </button>
          <button
            onClick={() => { setShowArchived(true); setShowTrash(false); }}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${showArchived && !showTrash ? 'bg-ink text-parchment' : 'bg-study-deep text-parchment-dim/60 hover:text-parchment'}`}
          >
            已归档
          </button>
          <button
            onClick={() => { setShowTrash(true); setShowArchived(false); }}
            className={`text-xs px-3 py-1.5 rounded-lg transition-all ${showTrash ? 'bg-ink text-parchment' : 'bg-study-deep text-parchment-dim/60 hover:text-parchment'}`}
          >
            回收站
          </button>
          <Link to="/projects/new" className="btn-primary text-sm">
            + 新建项目
          </Link>
        </div>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && !showTrash && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedTag(null)}
            className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-all ${!selectedTag ? 'bg-ink/20 text-ink' : 'bg-study-deep text-parchment-dim/50 hover:text-parchment'}`}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full transition-all ${selectedTag === tag ? 'bg-ink/20 text-ink' : 'bg-study-deep text-parchment-dim/50 hover:text-parchment'}`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="flex items-center gap-3 text-parchment-dim/40">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            加载中...
          </div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-parchment-dim/40 text-sm mb-4">
            {showTrash ? '回收站为空' : showArchived ? '没有已归档的项目' : '还没有项目'}
          </p>
          {!showTrash && !showArchived && (
            <Link to="/projects/new" className="btn-primary text-sm">
              创建第一个项目
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProjects.map((project) => (
            <div key={project.id} className="card-hover group stagger-item">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      to={`/projects/${project.id}`}
                      className="font-display font-semibold text-parchment hover:text-ink transition-colors truncate"
                    >
                      {project.name}
                    </Link>
                    {project.status === 'draft' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink/10 text-ink">草稿</span>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-xs text-parchment-dim/50 line-clamp-2 mb-2">{project.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] text-parchment-dim/40">
                    {project.target_words_per_chapter_min && (
                      <span>目标 {project.target_words_per_chapter_min}-{project.target_words_per_chapter_max} 字/章</span>
                    )}
                    <span>{new Date(project.updated_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                  {project.tags && project.tags.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {project.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-study-surface text-parchment-dim/50">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {showTrash ? (
                    <>
                      <button onClick={() => restoreProject(project.id)} className="btn-ghost-xs" title="恢复">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                      </button>
                      <button onClick={() => handlePermanentDelete(project.id, project.name)} className="btn-ghost-xs text-red-400" title="永久删除">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  ) : showArchived ? (
                    <>
                      <button onClick={() => unarchiveProject(project.id)} className="btn-ghost-xs" title="取消归档">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <Link to={`/projects/${project.id}`} className="btn-ghost-xs" title="详情">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </Link>
                      <Link to={`/projects/${project.id}/edit`} className="btn-ghost-xs" title="编辑">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </Link>
                      <button onClick={() => archiveProject(project.id)} className="btn-ghost-xs" title="归档">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(project.id, project.name)} className="btn-ghost-xs text-red-400" title="删除">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
