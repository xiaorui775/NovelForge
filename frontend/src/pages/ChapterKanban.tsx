import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { outlinesApi, ChapterOutline } from '../api/outlines';
import { chaptersApi, Chapter } from '../api/chapters';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

interface ChapterCard {
  outline: ChapterOutline;
  chapter: Chapter | null;
}

type ColumnId = 'pending' | 'writing' | 'completed';

interface Column {
  id: ColumnId;
  title: string;
  color: string;
}

const COLUMNS: Column[] = [
  { id: 'pending', title: '待生成', color: 'text-parchment-dim/50' },
  { id: 'writing', title: '写作中', color: 'text-amber-400' },
  { id: 'completed', title: '已完成', color: 'text-green-400' },
];

function getColumn(chapter: ChapterCard): ColumnId {
  if (!chapter.chapter) return 'pending';
  if (chapter.chapter.status === 'completed') return 'completed';
  return 'writing';
}

export default function ChapterKanban() {
  const { id: projectId } = useParams<{ id: string }>();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();
  const [chapters, setChapters] = useState<ChapterCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadChapters();
    }
  }, [projectId]);

  const loadChapters = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data: outline } = await outlinesApi.get(projectId);
      const { data: chapterOutlines } = await outlinesApi.listChapters(outline.id);

      if (chapterOutlines.length === 0) {
        setChapters([]);
        setLoading(false);
        return;
      }

      // Batch fetch all chapters in one request
      const outlineIds = chapterOutlines.map((co) => co.id);
      const { data: batchResults } = await chaptersApi.batchGetByOutlines(outlineIds);
      const chapterMap = new Map(batchResults.map((r) => [r.chapter_outline_id, r]));

      const results: ChapterCard[] = chapterOutlines.map((co) => {
        const ch = chapterMap.get(co.id);
        return {
          outline: co,
          chapter: ch ? {
            id: ch.id,
            chapter_outline_id: ch.chapter_outline_id,
            content: ch.content,
            word_count: ch.word_count,
            status: ch.status,
            model_id: null,
            token_used: 0,
            cost: 0,
            created_at: '',
            updated_at: '',
          } : null,
        };
      });
      setChapters(results);
    } catch {
      showToast('error', '加载章节失败');
    }
    setLoading(false);
  };

  const grouped: Record<ColumnId, ChapterCard[]> = {
    pending: [],
    writing: [],
    completed: [],
  };
  for (const ch of chapters) {
    grouped[getColumn(ch)].push(ch);
  }

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
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">章节看板</h1>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-parchment-dim/50">
          <span>{chapters.length} 章</span>
          <span>·</span>
          <span>{grouped.completed.length} 已完成</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="bg-study-deep/50 rounded-xl p-3 min-h-[300px]"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-xs font-medium uppercase tracking-wider ${col.color}`}>
                {col.title}
              </h3>
              <span className="text-[11px] text-parchment-dim/30 font-mono">
                {grouped[col.id].length}
              </span>
            </div>
            <div className="space-y-2">
              {grouped[col.id].map((ch) => (
                <div
                  key={ch.outline.id}
                  className="card-compact hover:ring-1 hover:ring-ink/20 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-parchment-dim/30">
                          #{ch.outline.chapter_number}
                        </span>
                        <h4 className="text-sm font-medium text-parchment truncate">
                          {ch.outline.title || `第${ch.outline.chapter_number}章`}
                        </h4>
                      </div>
                      <p className="text-[11px] text-parchment-dim/40 mt-1 line-clamp-2 leading-relaxed">
                        {ch.outline.summary}
                      </p>
                    </div>
                    <Link
                      to={`/projects/${projectId}/chapters/${ch.outline.id}`}
                      className="flex-shrink-0 p-1.5 text-parchment-dim/30 hover:text-ink transition-colors rounded-md hover:bg-ink/10"
                      title="编辑章节"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </Link>
                  </div>
                  {ch.chapter && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-study-border/20">
                      <span className="text-[10px] text-parchment-dim/30 font-mono">
                        {Number(ch.chapter.word_count).toLocaleString()} 字
                      </span>
                      {ch.chapter.status === 'completed' && (
                        <span className="text-[10px] text-green-400/70">✓ 完成</span>
                      )}
                      {ch.chapter.status === 'error' && (
                        <span className="text-[10px] text-red-400/70">✗ 错误</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {grouped[col.id].length === 0 && (
                <div className="text-center py-8 text-parchment-dim/20 text-xs">
                  暂无章节
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
