import { useState } from 'react';
import { outlinesApi, ReverseOutlineResult, ReverseOutlineItem } from '../api/outlines';
import { useUIStore } from '../stores/uiStore';

interface ReverseOutlineViewProps {
  outlineId: string;
  modelId: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  matched: { label: '符合', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  drifted: { label: '偏移', color: 'text-amber-400', bg: 'bg-amber-400/10' },
  missing: { label: '缺失', color: 'text-red-400', bg: 'bg-red-400/10' },
  extra: { label: '新增', color: 'text-blue-400', bg: 'bg-blue-400/10' },
};

export default function ReverseOutlineView({ outlineId, modelId, onClose }: ReverseOutlineViewProps) {
  const { showToast } = useUIStore();
  const [result, setResult] = useState<ReverseOutlineResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data } = await outlinesApi.reverseOutline(outlineId, modelId);
      setResult(data);
    } catch {
      showToast('error', '反向大纲生成失败');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-study-card border border-study-border/50 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-study-border/30">
          <div>
            <h2 className="font-display text-lg font-bold text-parchment">反向大纲</h2>
            <p className="text-[11px] text-parchment-dim/40 mt-0.5">对比计划大纲与实际写作内容</p>
          </div>
          <button onClick={onClose} className="text-parchment-dim/40 hover:text-parchment transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!result && !loading && (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-ink/10 mb-4">
                <svg className="w-7 h-7 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <p className="text-parchment-dim/50 text-sm mb-4">AI 将分析已写章节，对比计划大纲与实际内容</p>
              <button
                onClick={handleGenerate}
                className="btn-primary text-sm"
              >
                开始分析
              </button>
            </div>
          )}

          {loading && (
            <div className="text-center py-16">
              <svg className="w-8 h-8 animate-spin mx-auto mb-4 text-ink/60" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-parchment-dim/50 text-sm">AI 正在分析各章节内容...</p>
            </div>
          )}

          {result && (
            <div>
              {/* Overall assessment */}
              <div className="mb-6 p-4 bg-study-deep/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-parchment-dim/50 uppercase tracking-wider">整体评估</span>
                  <span className={`text-lg font-display font-bold ${
                    result.match_rate >= 80 ? 'text-emerald-400' :
                    result.match_rate >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {result.match_rate.toFixed(0)}%
                  </span>
                  <span className="text-[11px] text-parchment-dim/40">符合率</span>
                </div>
                <p className="text-sm text-parchment-dim/70">{result.overall_assessment}</p>
              </div>

              {/* Chapter list */}
              <div className="space-y-3">
                {result.items.map((item: ReverseOutlineItem) => {
                  const statusInfo = STATUS_LABELS[item.status] || STATUS_LABELS.matched;
                  return (
                    <div key={item.chapter_number} className="card p-4">
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                          {statusInfo.label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-[10px] text-parchment-dim/30">第{item.chapter_number}章</span>
                            <span className="text-sm font-medium text-parchment">{item.title}</span>
                            <span className="text-[10px] text-parchment-dim/30 ml-auto">{item.word_count.toLocaleString()} 字</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {item.planned_summary && (
                              <div>
                                <p className="text-[10px] text-parchment-dim/30 mb-0.5">计划</p>
                                <p className="text-xs text-parchment-dim/60 leading-relaxed">{item.planned_summary}</p>
                              </div>
                            )}
                            {item.actual_summary && (
                              <div>
                                <p className="text-[10px] text-parchment-dim/30 mb-0.5">实际</p>
                                <p className="text-xs text-parchment-dim/80 leading-relaxed">{item.actual_summary}</p>
                              </div>
                            )}
                          </div>

                          {item.notes && (
                            <p className="text-[10px] text-parchment-dim/40 mt-2 italic">{item.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
