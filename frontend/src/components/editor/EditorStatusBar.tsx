import { Chapter } from '../../api/chapters';
import { ModelConfig } from '../../api/models';

type SaveStatus = 'saved' | 'saving' | 'unsaved';

interface EditorStatusBarProps {
  saveStatus: SaveStatus;
  saveRetrying?: boolean;
  wordCount: number;
  chapter: Chapter | null;
  models: ModelConfig[];
  lastGenStats: { token_used?: number; cost?: number; duration_ms?: number } | null;
}

export default function EditorStatusBar({ saveStatus, saveRetrying, wordCount, chapter, models, lastGenStats }: EditorStatusBarProps) {
  return (
    <>
      <div className="flex items-center justify-between mt-3 px-1">
        <div className="flex items-center gap-5 text-[11px] text-parchment-dim/40">
          <span className="flex items-center gap-1.5">
            {saveStatus === 'saved' && (
              <>
                <svg className="w-3 h-3 text-green-500/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-green-500/50">已保存</span>
              </>
            )}
            {saveStatus === 'saving' && (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>保存中</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <span className={`w-1.5 h-1.5 rounded-full ${saveRetrying ? 'bg-blue-400/60 animate-pulse' : 'bg-amber-400/60'}`} />
                <span className={saveRetrying ? 'text-blue-400/50' : 'text-amber-400/50'}>
                  {saveRetrying ? '重试中...' : '未保存'}
                </span>
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            {wordCount.toLocaleString()} 字
          </span>
          {chapter?.token_used ? (
            <span className="flex items-center gap-1.5">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
              {Number(chapter.token_used).toLocaleString()} tokens
            </span>
          ) : null}
          {chapter?.cost ? <span>${Number(chapter.cost).toFixed(4)}</span> : null}
        </div>
        {chapter?.model_id && (
          <span className="text-[11px] text-parchment-dim/30">
            {models.find((m) => m.id === chapter.model_id)?.name}
          </span>
        )}
      </div>

      {lastGenStats && (
        <div className="mt-2 px-4 py-2.5 bg-study-card rounded-lg border border-study-border/50 flex items-center gap-4 text-[11px] text-parchment-dim/50">
          <span className="text-ink/60 font-medium">本次生成</span>
          {lastGenStats.token_used && <span>{lastGenStats.token_used.toLocaleString()} tokens</span>}
          {lastGenStats.cost && <span>${lastGenStats.cost.toFixed(4)}</span>}
          {lastGenStats.duration_ms && <span>{(lastGenStats.duration_ms / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </>
  );
}
