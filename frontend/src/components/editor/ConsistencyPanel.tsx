import { ConsistencyCheckResult } from '../../api/chapters';

interface ConsistencyPanelProps {
  consistencyResult: ConsistencyCheckResult | null;
  checkingConsistency: boolean;
  onCheck: () => void;
  disabled: boolean;
}

export default function ConsistencyPanel({ consistencyResult, checkingConsistency, onCheck, disabled }: ConsistencyPanelProps) {
  return (
    <div className="card-compact">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">一致性检查</span>
        <button onClick={onCheck} disabled={disabled} className="btn-ghost text-[11px] px-2 py-1">
          {checkingConsistency ? (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              检查中
            </span>
          ) : '开始检查'}
        </button>
      </div>
      {consistencyResult && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-center py-2">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-display font-bold ${
              consistencyResult.overall_score >= 8 ? 'bg-green-500/15 text-green-400' :
              consistencyResult.overall_score >= 6 ? 'bg-amber-500/15 text-amber-400' :
              'bg-red-500/15 text-red-400'
            }`}>
              {consistencyResult.overall_score.toFixed(1)}
            </div>
          </div>
          {consistencyResult.issues.length > 0 ? (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {consistencyResult.issues.map((issue, i) => (
                <div key={i} className={`p-2 rounded-md text-[11px] ${
                  issue.severity === 'error' ? 'bg-red-500/10 border-l-2 border-red-500/40' :
                  issue.severity === 'warning' ? 'bg-amber-500/10 border-l-2 border-amber-500/40' :
                  'bg-study-deep border-l-2 border-study-border'
                }`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`font-medium ${
                      issue.severity === 'error' ? 'text-red-400' :
                      issue.severity === 'warning' ? 'text-amber-400' :
                      'text-parchment-dim/60'
                    }`}>
                      {issue.dimension === 'terminology' ? '术语' :
                       issue.dimension === 'character' ? '角色' :
                       issue.dimension === 'worldview' ? '世界观' :
                       issue.dimension === 'plot' ? '情节' : issue.dimension}
                    </span>
                  </div>
                  <p className="text-parchment-dim/60">{issue.description}</p>
                  {issue.suggestion && <p className="text-parchment-dim/40 mt-0.5">建议：{issue.suggestion}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-[11px] text-green-400/60 py-1">未发现一致性问题</p>
          )}
          {consistencyResult.summary && (
            <p className="text-[11px] text-parchment-dim/40 leading-relaxed pt-1 border-t border-study-border/30">
              {consistencyResult.summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
