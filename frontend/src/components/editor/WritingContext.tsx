import { useState, useEffect } from 'react';
import { chaptersApi, ChapterContext, ContextUsage } from '../../api/chapters';

interface WritingContextProps {
  chapterId: string;
  hasContent: boolean;
  modelId?: string;
}

function formatRelativeTime(isoStr: string | null): string {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function WritingContext({ chapterId, hasContent, modelId }: WritingContextProps) {
  const [ctx, setCtx] = useState<ChapterContext | null>(null);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!chapterId || !hasContent) {
      setCtx(null);
      return;
    }
    setLoading(true);
    chaptersApi.getContext(chapterId)
      .then(({ data }) => setCtx(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chapterId, hasContent]);

  useEffect(() => {
    if (!chapterId || !modelId) {
      setContextUsage(null);
      return;
    }
    chaptersApi.getContextUsage(chapterId, modelId)
      .then(({ data }) => setContextUsage(data))
      .catch(() => {});
  }, [chapterId, modelId]);

  if (!hasContent) return null;
  if (!ctx && !loading) return null;

  const hasAnything = ctx && (ctx.chapter_summary || ctx.content_summary || ctx.prev_chapter_summary
    || ctx.open_foreshadowings.length > 0 || ctx.scenes.length > 0);

  if (!hasAnything && !loading) return null;

  return (
    <div className="bg-study-card/60 border border-study-border/30 rounded-lg mb-4 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-study-glow/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg className="w-3.5 h-3.5 text-ink/50 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
          <span className="text-xs text-parchment-dim/60 font-medium">
            {loading ? '加载上下文...' : '写作上下文'}
          </span>
          {ctx?.last_edit_time && (
            <span className="text-[10px] text-parchment-dim/30">
              {formatRelativeTime(ctx.last_edit_time)}
            </span>
          )}
          {contextUsage && (
            <ContextUsageBar usage={contextUsage} />
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-parchment-dim/30 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && ctx && (
        <div className="px-4 pb-3 space-y-3 border-t border-study-border/20">
          {/* 章节大纲摘要 */}
          {ctx.chapter_summary && (
            <Section title="大纲摘要" content={ctx.chapter_summary} />
          )}

          {/* 内容摘要 */}
          {ctx.content_summary && (
            <Section title="内容摘要" content={ctx.content_summary} />
          )}

          {/* 前一章摘要 */}
          {ctx.prev_chapter_summary && (
            <Section title="上一章" content={ctx.prev_chapter_summary} />
          )}

          {/* 伏笔 */}
          {ctx.open_foreshadowings.length > 0 && (
            <div className="pt-1">
              <h4 className="text-[10px] text-parchment-dim/40 uppercase tracking-wider mb-1.5">未解决伏笔</h4>
              <div className="flex flex-wrap gap-1.5">
                {ctx.open_foreshadowings.map((fs, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-amber-400/10 text-amber-400/80 px-2 py-0.5 rounded-full">
                    {fs.plant_chapter && <span className="opacity-50">{fs.plant_chapter}</span>}
                    {fs.description.length > 30 ? fs.description.slice(0, 30) + '...' : fs.description}
                  </span>
                ))}
              </div>
            </div>
          )}

          {contextUsage && (
            <div className="pt-1">
              <h4 className="text-[10px] text-parchment-dim/40 uppercase tracking-wider mb-1.5">上下文使用量</h4>
              <div className="text-[11px] text-parchment-dim/55 mb-2">
                {contextUsage.total_used_tokens.toLocaleString()} / {contextUsage.max_context_tokens.toLocaleString()} tokens
              </div>
              <div className="space-y-1.5">
                {contextUsage.modules.filter((m) => m.tokens > 0).map((module) => {
                  const pct = contextUsage.total_used_tokens > 0
                    ? (module.tokens / contextUsage.total_used_tokens) * 100
                    : 0;
                  return (
                    <div key={module.name}>
                      <div className="flex items-center justify-between text-[10px] text-parchment-dim/45 mb-0.5">
                        <span>{module.name}</span>
                        <span className="font-mono">{module.tokens} · {pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-1 bg-study-deep rounded-full overflow-hidden">
                        <div className="h-full bg-ink/60 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="pt-1">
      <h4 className="text-[10px] text-parchment-dim/40 uppercase tracking-wider mb-0.5">{title}</h4>
      <p className="text-[11px] text-parchment-dim/60 leading-relaxed">{content}</p>
    </div>
  );
}

function ContextUsageBar({ usage }: { usage: ContextUsage }) {
  const percent = usage.usage_percent;
  const color = percent > 85 ? 'bg-red-400' : percent > 60 ? 'bg-yellow-400' : 'bg-green-400';
  const textColor = percent > 85 ? 'text-red-400' : percent > 60 ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className="flex items-center gap-1.5 ml-auto" title={`上下文使用: ${usage.total_used_tokens.toLocaleString()} / ${usage.max_context_tokens.toLocaleString()} tokens`}>
      <div className="w-16 h-1.5 bg-study-deep rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${textColor}`}>{percent}%</span>
    </div>
  );
}
