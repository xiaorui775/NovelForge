import { RefObject, useState } from 'react';
import SelectionToolbar from './SelectionToolbar';
import type { ValidationIssue } from '../../api/chapters';

interface GenerationPanelProps {
  generating: boolean;
  currentRound: { round: number; label: string } | null;
  streamingContent: string;
  content: string;
  editorRef: RefObject<HTMLTextAreaElement>;
  onContentChange: (v: string) => void;
  onStop: () => void;
  chapterId?: string;
  modelId?: string;
  onApplyRewrite?: (start: number, end: number, newText: string) => void;
  validationIssues?: ValidationIssue[];
}

export default function GenerationPanel({
  generating, currentRound, streamingContent, content, editorRef, onContentChange, onStop,
  chapterId, modelId, onApplyRewrite, validationIssues = [],
}: GenerationPanelProps) {
  const [showValidation, setShowValidation] = useState(true);
  if (generating) {
    return (
      <div>
        <div className="flex items-center gap-2.5 px-5 py-3 border-b border-study-border/40 bg-study-deep/50">
          <div className="relative flex items-center justify-center w-4 h-4">
            <div className="absolute w-4 h-4 rounded-full bg-ink/20 animate-ping" />
            <div className="relative w-2 h-2 rounded-full bg-ink" />
          </div>
          <span className="text-xs text-ink font-medium">
            {currentRound ? `${currentRound.label}中...` : 'AI 正在创作...'}
          </span>
          {currentRound && (
            <div className="flex items-center gap-1.5">
              {['初稿', '审校', '定稿'].map((label, i) => (
                <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${
                  i < currentRound.round ? 'bg-ink/20 text-ink/60' :
                  i === currentRound.round ? 'bg-ink text-parchment' :
                  'bg-study-deep text-parchment-dim/30'
                }`}>
                  {label}
                </span>
              ))}
            </div>
          )}
          <button onClick={onStop} className="ml-auto btn-ghost text-xs text-parchment-dim/60 hover:text-red-400">
            停止
          </button>
        </div>
        <div className="p-6 min-h-[500px]">
          <div className="font-serif text-[17px] leading-[1.9] text-parchment-dim whitespace-pre-wrap">
            {streamingContent}
            <span className="inline-block w-[2px] h-5 bg-ink/70 ml-0.5 animate-pulse align-text-bottom" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <textarea
        ref={editorRef}
        className="w-full min-h-[500px] p-6 bg-transparent font-serif text-[17px] leading-[1.9] text-parchment-dim resize-none focus:outline-none placeholder-study-muted/50"
        placeholder="在此落笔..."
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
      />
      {chapterId && modelId && onApplyRewrite && (
        <SelectionToolbar
          chapterId={chapterId}
          modelId={modelId}
          textareaRef={editorRef}
          content={content}
          onApplyRewrite={onApplyRewrite}
          generating={generating}
        />
      )}
      {validationIssues.length > 0 && (
        <div className="border-t border-study-border/40">
          <button
            onClick={() => setShowValidation(!showValidation)}
            className="w-full px-5 py-2.5 flex items-center gap-2 text-xs text-parchment-dim/60 hover:text-parchment-dim transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showValidation ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>质量检查</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              validationIssues.some(i => i.severity === 'error') ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'
            }`}>
              {validationIssues.filter(i => i.severity === 'error').length > 0
                ? `${validationIssues.filter(i => i.severity === 'error').length} 个问题`
                : `${validationIssues.length} 个建议`}
            </span>
          </button>
          {showValidation && (
            <div className="px-5 pb-4 space-y-2">
              {validationIssues.map((issue, i) => (
                <div key={i} className={`flex gap-3 text-xs p-2.5 rounded-lg ${
                  issue.severity === 'error' ? 'bg-red-500/8 border border-red-500/15' :
                  issue.severity === 'warning' ? 'bg-amber-500/8 border border-amber-500/15' :
                  'bg-study-surface border border-study-border/30'
                }`}>
                  <span className={`flex-shrink-0 mt-0.5 ${
                    issue.severity === 'error' ? 'text-red-400' :
                    issue.severity === 'warning' ? 'text-amber-400' : 'text-parchment-dim/40'
                  }`}>
                    {issue.severity === 'error' ? '!' : issue.severity === 'warning' ? '~' : 'i'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-parchment-dim/80">{issue.rule}</span>
                      <span className="text-parchment-dim/30">{issue.description}</span>
                    </div>
                    {issue.suggestion && (
                      <p className="text-parchment-dim/40 mt-0.5">建议：{issue.suggestion}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
