import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useConfirm } from '../components/ConfirmDialog';
import { analyticsApi, AnalyticsOverview } from '../api/analytics';
import WritingCalendar from '../components/WritingCalendar';
import { ProjectGoalsProgress, writingGoalsApi } from '../api/writingGoals';

export default function Dashboard() {
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
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [projectGoalsProgress, setProjectGoalsProgress] = useState<ProjectGoalsProgress | null>(null);
  const [goalProjectId, setGoalProjectId] = useState<string>('');

  useEffect(() => {
    if (showTrash) {
      fetchTrash();
    } else {
      fetchProjects(showArchived);
    }
    analyticsApi.getOverview().then(({ data }) => setOverview(data)).catch(() => {});
  }, [fetchProjects, fetchTrash, showArchived, showTrash]);

  useEffect(() => {
    if (showTrash || projects.length === 0) {
      setProjectGoalsProgress(null);
      setGoalProjectId('');
      return;
    }

    if (!goalProjectId || !projects.some((project) => project.id === goalProjectId)) {
      setGoalProjectId(projects[0].id);
    }
  }, [projects, showTrash, goalProjectId]);

  useEffect(() => {
    if (showTrash || !goalProjectId) {
      setProjectGoalsProgress(null);
      return;
    }

    writingGoalsApi
      .projectProgress(goalProjectId)
      .then(({ data }) => setProjectGoalsProgress(data))
      .catch(() => setProjectGoalsProgress(null));
  }, [goalProjectId, showTrash]);

  const goalMarks = useMemo(() => {
    if (!projectGoalsProgress?.calendar_marks) return undefined;
    return Object.fromEntries(
      projectGoalsProgress.calendar_marks.map((mark) => [
        mark.date,
        { achieved: mark.achieved, missed: mark.missed },
      ])
    );
  }, [projectGoalsProgress]);

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

  const handleRestore = async (id: string) => {
    try {
      await restoreProject(id);
      showToast('success', '项目已恢复');
    } catch {
      showToast('error', '恢复失败');
    }
  };

  const handleArchive = async (id: string, name: string) => {
    if (!await confirm({ message: `确定归档项目「${name}」？归档后可在"已归档"中查看。`, variant: 'default', confirmText: '归档' })) return;
    try {
      await archiveProject(id);
      showToast('success', '项目已归档');
    } catch {
      showToast('error', '归档失败');
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      await unarchiveProject(id);
      showToast('success', '项目已恢复');
    } catch {
      showToast('error', '恢复失败');
    }
  };

  const allTags = Array.from(new Set(projects.flatMap((p) => p.tags || []))).sort();
  const displayList = (showTrash ? trashProjects : projects)
    .filter((p) => !selectedTag || (p.tags || []).includes(selectedTag));

  const todayGoal = projectGoalsProgress?.today_goal;

  return (
    <div className="animate-fade-in">
      {Dialog}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl font-bold text-parchment tracking-tight">
            {showTrash ? '回收站' : '工作台'}
          </h1>
          <p className="text-parchment-dim/60 mt-1.5 text-sm">
            {showTrash ? '已删除的项目将在 30 天后自动清理' : '在这里开始你的创作旅程'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!showTrash && (
            <label className="flex items-center gap-2 text-xs text-parchment-dim/50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-study-border bg-study-card text-ink focus:ring-ink/30"
              />
              显示已归档
            </label>
          )}
          <button
            onClick={() => setShowTrash(!showTrash)}
            className={`btn-ghost text-xs flex items-center gap-1.5 ${showTrash ? 'text-amber-400' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            {showTrash ? '返回工作台' : '回收站'}
          </button>
          {!showTrash && (
            <Link to="/projects/new" className="btn-primary flex items-center gap-2 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              新建项目
            </Link>
          )}
        </div>
      </div>

      {!showTrash && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { label: '进行中项目', value: projects.length, accent: true },
              { label: '总字数', value: overview ? overview.total_words.toLocaleString() : '...' },
              { label: '总生成次数', value: overview ? overview.total_generations.toString() : '...' },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`card-compact stagger-item ${stat.accent ? 'border-ink/20' : ''}`}
              >
                <p className="text-xs text-parchment-dim/50 uppercase tracking-wider font-medium">
                  {stat.label}
                </p>
                <p className={`text-3xl font-display font-bold mt-2 ${
                  stat.accent ? 'text-ink' : 'text-parchment'
                }`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div className="card-compact mb-10 border-ink/20">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-parchment-dim/50 uppercase tracking-wider font-medium">今日目标</p>
                {todayGoal ? (
                  <p className="text-xl font-display font-bold text-parchment mt-1">
                    {todayGoal.current.toLocaleString()} / {todayGoal.target.toLocaleString()}
                  </p>
                ) : (
                  <p className="text-sm text-parchment-dim/45 mt-1">暂无今日目标</p>
                )}
              </div>

              <div className="flex-1 max-w-[240px]">
                <p className="text-[11px] text-parchment-dim/45 mb-1">统计项目</p>
                <select
                  className="input w-full text-xs py-1.5"
                  value={goalProjectId}
                  onChange={(e) => setGoalProjectId(e.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>

              <div className="text-right">
                {todayGoal ? (
                  <>
                    <p className={`text-sm font-medium ${todayGoal.achieved ? 'text-emerald-400' : 'text-red-400'}`}>
                      {todayGoal.achieved ? '已达成' : '未达成'}
                    </p>
                    <p className="text-xs text-parchment-dim/45 mt-1">
                      连续写作 {projectGoalsProgress?.streak_days ?? 0} 天
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-parchment-dim/40">创建 daily_words 目标后显示</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {!showTrash && <div className="mb-8"><WritingCalendar goalMarks={goalMarks} streakOverride={projectGoalsProgress?.streak_days} /></div>}

      {!showTrash && allTags.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <span className="text-[11px] text-parchment-dim/40 uppercase tracking-wider font-medium">标签</span>
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
              !selectedTag ? 'bg-ink/20 text-ink' : 'text-parchment-dim/40 hover:text-parchment-dim/60'
            }`}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                selectedTag === tag ? 'bg-ink/20 text-ink' : 'text-parchment-dim/40 hover:text-parchment-dim/60'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div>
        <div className="section-title mb-5">{showTrash ? '已删除项目' : '最近项目'}</div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-study-card rounded-lg border border-study-border"></div>
              </div>
            ))}
          </div>
        ) : displayList.length === 0 ? (
          <div className="card text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-ink/10 mb-5">
              <svg className="w-8 h-8 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                {showTrash ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                )}
              </svg>
            </div>
            <p className="font-display text-lg text-parchment mb-1.5">
              {showTrash ? '回收站为空' : '还没有小说项目'}
            </p>
            <p className="text-parchment-dim/50 text-sm mb-6">
              {showTrash ? '删除的项目会在这里显示' : '创建你的第一个项目，开始 AI 写作之旅'}
            </p>
            {!showTrash && (
              <Link to="/projects/new" className="btn-primary text-sm">
                + 新建项目
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {displayList.map((project, i) => {
              const isArchived = project.status === 'archived';
              const isDeleted = !!project.deleted_at;
              return (
              <div
                key={project.id}
                className={`stagger-item flex items-center justify-between p-4 bg-study-card rounded-lg border border-study-border hover:border-ink/20 transition-all duration-200 group ${isArchived || isDeleted ? 'opacity-60' : ''}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-ink/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-ink/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-parchment group-hover:text-ink transition-colors text-sm">
                      {project.name}
                    </h4>
                    <p className="text-xs text-parchment-dim/40 mt-0.5">
                      {project.genre || '未分类'} · {project.language}
                      {isDeleted && project.deleted_at && (
                        <span className="ml-2 text-amber-400/60">
                          · 删除于 {new Date(project.deleted_at).toLocaleDateString('zh-CN')}
                        </span>
                      )}
                    </p>
                    {(project.tags || []).length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {project.tags.map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded text-[9px] bg-ink/8 text-parchment-dim/50">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isDeleted ? (
                    <>
                      <button
                        onClick={() => handleRestore(project.id)}
                        className="p-1.5 rounded-md text-parchment-dim/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                        title="恢复项目"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(project.id, project.name)}
                        className="p-1.5 rounded-md text-parchment-dim/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="永久删除"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`tag-muted text-[11px] ${isArchived ? 'text-amber-400/70' : ''}`}>
                        {isArchived ? '已归档' : project.status === 'draft' ? '草稿' : '进行中'}
                      </span>
                      {isArchived ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleUnarchive(project.id);
                          }}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-parchment-dim/30 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                          title="恢复项目"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleArchive(project.id, project.name);
                          }}
                          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-parchment-dim/30 hover:text-amber-400 hover:bg-amber-500/10 transition-all"
                          title="归档项目"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleDelete(project.id, project.name);
                        }}
                        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 text-parchment-dim/30 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="删除项目"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                      <Link to={`/projects/${project.id}`} className="p-1.5 rounded-md text-study-muted group-hover:text-ink transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </Link>
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
