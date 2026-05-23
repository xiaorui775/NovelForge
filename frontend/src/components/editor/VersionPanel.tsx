import { useState } from 'react';
import { ChapterVersion } from '../../api/chapters';

interface VersionPanelProps {
  versions: ChapterVersion[];
  compareVersions: string[];
  onToggleCompare: (id: string) => void;
  onCompare: () => void;
  onRestore: (id: string) => void;
  onClose: () => void;
}

function changeTypeLabel(changeType: string): { label: string; className: string } {
  if (changeType === 'user_edit') return { label: '手动编辑', className: 'bg-blue-500/15 text-blue-400' };
  if (changeType === 'restore') return { label: '版本恢复', className: 'bg-purple-500/15 text-purple-400' };
  if (changeType === 'preview') return { label: '预览生成', className: 'bg-amber-500/15 text-amber-400' };
  if (changeType === 'adopt_preview') return { label: '采纳预览', className: 'bg-teal-500/15 text-teal-400' };
  return { label: 'AI 生成', className: 'bg-emerald-500/15 text-emerald-400' };
}

function diffSummary(diffSnapshot: string | null): string {
  if (!diffSnapshot) return '无变更摘要';
  const lines = diffSnapshot.split('\n');
  const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
  const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
  if (added === 0 && removed === 0) return '无变更摘要';
  return `+${added} / -${removed}`;
}

function diffPreview(diffSnapshot: string | null): string[] {
  if (!diffSnapshot) return [];
  return diffSnapshot
    .split('\n')
    .filter(
      (line) =>
        (line.startsWith('+') && !line.startsWith('+++')) ||
        (line.startsWith('-') && !line.startsWith('---')),
    )
    .slice(0, 8);
}

export default function VersionPanel({ versions, compareVersions, onToggleCompare, onCompare, onRestore, onClose }: VersionPanelProps) {
  const [showRevisions, setShowRevisions] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);

  return (
    <div className="card-compact">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">版本历史</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowRevisions((prev) => !prev);
              if (showRevisions) setExpandedVersionId(null);
            }}
            className={`btn-ghost text-[11px] px-2 py-1 ${showRevisions ? 'text-ink' : 'text-parchment-dim/60'}`}
          >
            {showRevisions ? '隐藏修订' : '显示修订'}
          </button>
          {compareVersions.length === 2 && (
            <button onClick={onCompare} className="btn-ghost text-[11px] px-2 py-1 text-ink">对比</button>
          )}
          <button onClick={onClose} className="text-parchment-dim/30 hover:text-parchment-dim transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {versions.map((v) => {
          const typeMeta = changeTypeLabel(v.change_type);
          const shouldShowPreview = showRevisions && expandedVersionId === v.id;
          const preview = diffPreview(v.diff_snapshot);

          return (
            <div key={v.id} className={`flex items-start gap-2 p-2.5 rounded-lg transition-colors ${
              compareVersions.includes(v.id) ? 'bg-study-glow ring-1 ring-ink/20' : 'hover:bg-study-glow'
            }`}>
              <button
                onClick={() => onToggleCompare(v.id)}
                className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  compareVersions.includes(v.id) ? 'bg-ink border-ink text-parchment' : 'border-study-border/60 hover:border-parchment-dim/40'
                }`}
              >
                {compareVersions.includes(v.id) && (
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => setExpandedVersionId((prev) => (prev === v.id ? null : v.id))}
                className="flex-1 text-left group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-parchment-dim font-medium">v{v.version_number}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${typeMeta.className}`}>
                      {typeMeta.label}
                    </span>
                    {v.quality_score !== null && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        v.quality_score >= 8 ? 'bg-green-500/15 text-green-400' :
                        v.quality_score >= 6 ? 'bg-amber-500/15 text-amber-400' :
                        'bg-red-500/15 text-red-400'
                      }`}>
                        {Number(v.quality_score).toFixed(1)}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-parchment-dim/30 flex-shrink-0">{Number(v.word_count).toLocaleString()} 字</span>
                </div>
                <p className="text-[11px] text-parchment-dim/25 mt-0.5">
                  {new Date(v.created_at).toLocaleString()}
                </p>
                <p className="text-[10px] text-parchment-dim/35 mt-0.5 font-mono">
                  {diffSummary(v.diff_snapshot)}
                </p>
                {shouldShowPreview && (
                  <div className="mt-1.5 rounded border border-study-border/60 bg-study-surface/30 px-2 py-1.5 space-y-0.5">
                    {preview.length > 0 ? (
                      preview.map((line, idx) => (
                        <p
                          key={`${v.id}-diff-${idx}`}
                          className={`text-[10px] font-mono whitespace-pre-wrap break-all ${
                            line.startsWith('+') ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {line}
                        </p>
                      ))
                    ) : (
                      <p className="text-[10px] text-parchment-dim/35 font-mono">无可展示修订</p>
                    )}
                  </div>
                )}
              </button>

              <button
                onClick={() => onRestore(v.id)}
                className="btn-ghost text-[10px] px-2 py-1 text-parchment-dim/70 hover:text-ink flex-shrink-0"
              >
                恢复
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
