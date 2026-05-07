import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { storyTemplatesApi, StoryTemplate, StoryPhase } from '../api/storyTemplates';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

export default function StoryTemplates() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [totalChapters, setTotalChapters] = useState(20);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (projectId) fetchProject(projectId);
    storyTemplatesApi.list().then(({ data }) => {
      setTemplates(data);
    }).catch(() => {
      showToast('error', '加载故事模板失败');
    }).finally(() => {
      setLoading(false);
    });
  }, [projectId, fetchProject]);

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  const handleApply = async () => {
    if (!projectId || !selectedId) return;
    setApplying(true);
    try {
      const { data } = await storyTemplatesApi.apply(projectId, selectedId, totalChapters);
      showToast('success', `模板已应用，生成 ${data.chapter_count} 章大纲`);
      navigate(`/projects/${projectId}/outline`);
    } catch {
      showToast('error', '应用模板失败');
    }
    setApplying(false);
  };

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to={`/projects/${projectId}/outline`}
            className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {currentProject?.name}
          </Link>
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">故事结构模板</h1>
          <p className="text-parchment-dim/50 text-sm mt-1">选择一个叙事结构模板，自动生成大纲框架</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => setSelectedId(tpl.id)}
            className={`card-compact text-left transition-all ${
              selectedId === tpl.id
                ? 'ring-2 ring-ink/40 border-ink/30'
                : 'hover:border-ink/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-display text-base font-bold text-parchment">{tpl.name}</h3>
              {tpl.genre_hint && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-ink/10 text-ink">{tpl.genre_hint}</span>
              )}
            </div>
            <p className="text-[11px] text-parchment-dim/60 leading-relaxed mb-3">{tpl.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {tpl.structure.phases.map((phase: StoryPhase, idx: number) => (
                <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-study-surface text-parchment-dim/50">
                  {phase.name}
                  {phase.ratio > 0 && ` (${Math.round(phase.ratio * 100)}%)`}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {selectedTemplate && (
        <div className="card">
          <h3 className="font-display text-lg font-bold text-parchment mb-3">{selectedTemplate.name}</h3>

          {/* Phase details */}
          <div className="space-y-3 mb-4">
            {selectedTemplate.structure.phases.map((phase: StoryPhase, idx: number) => (
              <div key={idx} className="bg-study-deep/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-parchment">{phase.name}</span>
                  {phase.ratio > 0 && (
                    <span className="text-[10px] text-parchment-dim/40">≈ {Math.round(totalChapters * phase.ratio)} 章</span>
                  )}
                </div>
                <p className="text-[11px] text-parchment-dim/50 mb-2">{phase.description}</p>
                {phase.guides.length > 0 && (
                  <ul className="space-y-1">
                    {phase.guides.map((guide: string, gidx: number) => (
                      <li key={gidx} className="text-[11px] text-ink/70 flex items-start gap-1.5">
                        <span className="text-ink/40 mt-0.5">?</span>
                        {guide}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-4 pt-4 border-t border-study-border/40">
            <div>
              <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-1">总章节数</label>
              <input
                type="number"
                className="input w-24 text-sm"
                min={5}
                max={100}
                value={totalChapters}
                onChange={(e) => setTotalChapters(Math.max(5, Number(e.target.value) || 5))}
              />
            </div>
            <button
              onClick={handleApply}
              disabled={applying}
              className="btn-primary ml-auto"
            >
              {applying ? '应用中...' : '应用此模板'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
