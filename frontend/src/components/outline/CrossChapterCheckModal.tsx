import { CrossChapterConsistencyResult } from '../../api/chapters';

/**
 * 跨章一致性检查结果弹窗。
 *
 * 从 OutlineManager 抽出：此前结果渲染为页面底部静态 card，章节一多就让用户一路
 * 滚到底部才能看到。现在固定居中模态，触发即见全文。
 */
interface Props {
  result: CrossChapterConsistencyResult;
  onClose: () => void;
}

export default function CrossChapterCheckModal({ result, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="card border border-ink/20 animate-slide-up w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="section-title">跨章一致性检查</div>
            <span className="text-xs text-parchment-dim/40">已扫描 {result.chapters_scanned} 章</span>
          </div>
          <button onClick={onClose} className="text-parchment-dim/40 hover:text-ink transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto -mx-1 px-1">
          {result.issues.length > 0 ? (
            <div className="space-y-2">
              {result.issues.map((issue, i) => (
                <div key={i} className={`p-3 rounded-lg text-sm ${
                  issue.severity === 'error' ? 'bg-red-500/10 border-l-3 border-red-500/50' :
                  issue.severity === 'warning' ? 'bg-amber-500/10 border-l-3 border-amber-500/50' :
                  'bg-study-deep border-l-3 border-study-border'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium ${
                      issue.severity === 'error' ? 'text-red-400' :
                      issue.severity === 'warning' ? 'text-amber-400' :
                      'text-parchment-dim/60'
                    }`}>
                      {issue.dimension === 'character' ? '角色状态' :
                       issue.dimension === 'timeline' ? '时间线' :
                       issue.dimension === 'location' ? '地点' :
                       issue.dimension === 'foreshadowing' ? '伏笔' : issue.dimension}
                    </span>
                    {issue.from_chapter && (
                      <span className="text-[11px] text-parchment-dim/40">第 {issue.from_chapter} 章</span>
                    )}
                  </div>
                  <p className="text-parchment-dim/70 leading-relaxed">{issue.description}</p>
                  {issue.suggestion && <p className="text-parchment-dim/45 mt-1 text-xs">建议：{issue.suggestion}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <svg className="w-10 h-10 text-green-400/40 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-green-400/60">未发现跨章一致性问题</p>
            </div>
          )}
          {result.summary && (
            <p className="text-xs text-parchment-dim/40 leading-relaxed mt-4 pt-3 border-t border-study-border/30">
              {result.summary}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
