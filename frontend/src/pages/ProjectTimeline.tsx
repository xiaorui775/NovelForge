import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { projectsApi, TimelineEvent } from '../api/projects';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
};

const formatDuration = (ms: number) => {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}min`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
};

export default function ProjectTimeline() {
  const { id: projectId } = useParams<{ id: string }>();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadTimeline();
    }
  }, [projectId]);

  const loadTimeline = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await projectsApi.getTimeline(projectId);
      setEvents(data);
    } catch {
      showToast('error', '加载时间线失败');
    }
    setLoading(false);
  };

  const filtered = events.filter((e) => {
    if (filter === 'success') return e.status === 'completed';
    if (filter === 'error') return e.status === 'error';
    return true;
  });

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
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {currentProject?.name}
          </Link>
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">生成时间线</h1>
        </div>
        <div className="flex items-center bg-study-deep rounded-lg p-0.5">
          {(['all', 'success', 'error'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filter === f ? 'bg-ink text-study-deep' : 'text-parchment-dim/50 hover:text-parchment'
              }`}
            >
              {f === 'all' ? '全部' : f === 'success' ? '成功' : '失败'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-parchment-dim/40 text-sm">暂无生成记录</p>
        </div>
      ) : (
        <div className="relative pl-8">
          {/* Timeline line */}
          <div className="absolute left-3 top-0 bottom-0 w-px bg-study-border/30" />

          <div className="space-y-4">
            {filtered.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className="relative"
              >
                {/* Timeline dot */}
                <div className={`absolute -left-5 top-3 w-2.5 h-2.5 rounded-full border-2 ${
                  event.status === 'completed'
                    ? 'bg-ink border-ink'
                    : event.status === 'error'
                    ? 'bg-red-400 border-red-400'
                    : 'bg-amber-400 border-amber-400'
                }`} />

                <div className="card-compact">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {event.status === 'completed' ? (
                          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        <h4 className="text-sm font-medium text-parchment">
                          第{event.chapter.chapter_number}章 {event.chapter.title || ''}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-parchment-dim/40">
                        <span>{event.chapter.word_count.toLocaleString()} 字</span>
                        <span>{formatTokens(event.token_input + event.token_output)} tokens</span>
                        <span>${Number(event.cost).toFixed(4)}</span>
                        {event.duration_ms > 0 && <span>{formatDuration(event.duration_ms)}</span>}
                        {event.model_name && <span>{event.model_name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {event.quality_score !== null && (
                        <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                          event.quality_score >= 8 ? 'bg-green-400/10 text-green-400' :
                          event.quality_score >= 6 ? 'bg-amber-400/10 text-amber-400' :
                          'bg-red-400/10 text-red-400'
                        }`}>
                          {Number(event.quality_score).toFixed(1)}
                        </span>
                      )}
                      <span className="text-[11px] text-parchment-dim/30">{timeAgo(event.created_at)}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
