import { QualityScore } from '../../api/chapters';

interface QualityPanelProps {
  qualityScore: QualityScore | null;
  scoring: boolean;
  onScore: () => void;
  disabled: boolean;
}

export default function QualityPanel({ qualityScore, scoring, onScore, disabled }: QualityPanelProps) {
  return (
    <div className="card-compact">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">质量评分</span>
        <button onClick={onScore} disabled={disabled} className="btn-ghost text-[11px] px-2 py-1">
          {scoring ? (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              评分中
            </span>
          ) : '开始评分'}
        </button>
      </div>
      {qualityScore && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-center py-2">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-display font-bold ${
              qualityScore.overall >= 8 ? 'bg-green-500/15 text-green-400' :
              qualityScore.overall >= 6 ? 'bg-amber-500/15 text-amber-400' :
              'bg-red-500/15 text-red-400'
            }`}>
              {qualityScore.overall.toFixed(1)}
            </div>
          </div>
          {[
            { label: '连贯性', value: qualityScore.coherence },
            { label: '文笔', value: qualityScore.writing_quality },
            { label: '情节推进', value: qualityScore.plot_progression },
          ].map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-parchment-dim/50">{item.label}</span>
                <span className="text-[11px] text-parchment-dim/70 font-mono">{item.value.toFixed(1)}</span>
              </div>
              <div className="w-full bg-study-deep rounded-full h-1.5">
                <div className={`rounded-full h-1.5 transition-all duration-500 ${
                  item.value >= 8 ? 'bg-green-500/60' : item.value >= 6 ? 'bg-amber-500/60' : 'bg-red-500/60'
                }`} style={{ width: `${item.value * 10}%` }} />
              </div>
            </div>
          ))}
          {qualityScore.notes && (
            <p className="text-[11px] text-parchment-dim/40 leading-relaxed pt-1 border-t border-study-border/30">
              {qualityScore.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
