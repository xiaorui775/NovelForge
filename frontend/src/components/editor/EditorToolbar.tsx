import { PromptTemplate } from '../../api/promptTemplates';
import { ModelConfig } from '../../api/models';

interface EditorToolbarProps {
  models: ModelConfig[];
  selectedModel: string;
  onModelChange: (id: string) => void;
  templates: PromptTemplate[];
  selectedTemplate: string;
  onTemplateChange: (id: string) => void;
  autoScore: boolean;
  onAutoScoreChange: (v: boolean) => void;
  scoreThreshold: number;
  onScoreThresholdChange: (v: number) => void;
  multiRound: boolean;
  onMultiRoundChange: (v: boolean) => void;
  autoRevise: boolean;
  onAutoReviseChange: (v: boolean) => void;
  previewMode: boolean;
  onPreviewModeChange: (v: boolean) => void;
  generating: boolean;
  hasContent: boolean;
  polishingMode?: boolean;
  onTogglePolishingMode?: () => void;
  brainstorming?: boolean;
  onBrainstorm?: () => void;
  temperature: number | null;
  onTemperatureChange: (v: number | null) => void;
  topP: number | null;
  onTopPChange: (v: number | null) => void;
  onGenerate: () => void;
  onContinue: () => void;
  onRefine?: () => void;
  onStop?: () => void;
}

export default function EditorToolbar({
  models, selectedModel, onModelChange,
  templates, selectedTemplate, onTemplateChange,
  autoScore, onAutoScoreChange, scoreThreshold, onScoreThresholdChange,
  multiRound, onMultiRoundChange,
  autoRevise, onAutoReviseChange,
  previewMode, onPreviewModeChange,
  generating, hasContent, polishingMode = false, onTogglePolishingMode,
  brainstorming = false, onBrainstorm,
  temperature, onTemperatureChange, topP, onTopPChange,
  onGenerate, onContinue, onRefine, onStop,
}: EditorToolbarProps) {
  return (
    <div className="space-y-4">
      <div className="card-compact">
        <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-2">模型</label>
        <select className="input w-full text-sm py-2" value={selectedModel} onChange={(e) => onModelChange(e.target.value)}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {templates.length > 0 && (
        <div className="card-compact">
          <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-2">Prompt 模板</label>
          <select className="input w-full text-sm py-2" value={selectedTemplate} onChange={(e) => onTemplateChange(e.target.value)}>
            <option value="">默认模板</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      <div className="card-compact">
        <label className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block mb-2">自动评分</label>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-parchment-dim/70">生成后自动评分</span>
          <button onClick={() => onAutoScoreChange(!autoScore)} className={`relative w-9 h-5 rounded-full transition-colors ${autoScore ? 'bg-ink' : 'bg-study-deep'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${autoScore ? 'translate-x-4 bg-parchment' : 'bg-parchment-dim/40'}`} />
          </button>
        </div>
        {autoScore && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-parchment-dim/50">最低阈值</span>
              <span className="text-[11px] text-parchment-dim/70 font-mono">{scoreThreshold.toFixed(1)}</span>
            </div>
            <input type="range" min="4" max="8" step="0.5" value={scoreThreshold} onChange={(e) => onScoreThresholdChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-study-deep rounded-full appearance-none cursor-pointer accent-ink" />
            <div className="flex justify-between text-[10px] text-parchment-dim/30 mt-1"><span>4.0</span><span>8.0</span></div>
          </div>
        )}
      </div>

      <div className="card-compact">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block">多轮生成</span>
            <span className="text-[10px] text-parchment-dim/30">初稿 → 审校 → 定稿</span>
          </div>
          <button onClick={() => onMultiRoundChange(!multiRound)} className={`relative w-9 h-5 rounded-full transition-colors ${multiRound ? 'bg-ink' : 'bg-study-deep'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${multiRound ? 'translate-x-4 bg-parchment' : 'bg-parchment-dim/40'}`} />
          </button>
        </div>
      </div>

      <div className="card-compact">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block">自动修改</span>
            <span className="text-[10px] text-parchment-dim/30">生成后自动修复质量问题</span>
          </div>
          <button onClick={() => onAutoReviseChange(!autoRevise)} className={`relative w-9 h-5 rounded-full transition-colors ${autoRevise ? 'bg-ink' : 'bg-study-deep'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${autoRevise ? 'translate-x-4 bg-parchment' : 'bg-parchment-dim/40'}`} />
          </button>
        </div>
      </div>

      <div className="card-compact">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium block">预览模式</span>
            <span className="text-[10px] text-parchment-dim/30">生成结果不覆盖正文，先对比再决定</span>
          </div>
          <button onClick={() => onPreviewModeChange(!previewMode)} className={`relative w-9 h-5 rounded-full transition-colors ${previewMode ? 'bg-ink' : 'bg-study-deep'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${previewMode ? 'translate-x-4 bg-parchment' : 'bg-parchment-dim/40'}`} />
          </button>
        </div>
      </div>

      <div className="card-compact">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-parchment-dim/50 uppercase tracking-wider font-medium">生成参数</span>
          {temperature !== null || topP !== null ? (
            <button onClick={() => { onTemperatureChange(null); onTopPChange(null); }} className="text-[10px] text-parchment-dim/40 hover:text-parchment-dim/70 transition-colors">重置</button>
          ) : null}
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-parchment-dim/50">Temperature</span>
              <span className="text-[11px] text-parchment-dim/70 font-mono">{temperature !== null ? temperature.toFixed(1) : '默认'}</span>
            </div>
            <input type="range" min="0" max="2" step="0.1" value={temperature ?? 1} onChange={(e) => onTemperatureChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-study-deep rounded-full appearance-none cursor-pointer accent-ink" />
            <div className="flex justify-between text-[10px] text-parchment-dim/30 mt-0.5"><span>0.0 精确</span><span>2.0 创意</span></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-parchment-dim/50">Top P</span>
              <span className="text-[11px] text-parchment-dim/70 font-mono">{topP !== null ? topP.toFixed(1) : '默认'}</span>
            </div>
            <input type="range" min="0" max="1" step="0.1" value={topP ?? 1} onChange={(e) => onTopPChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-study-deep rounded-full appearance-none cursor-pointer accent-ink" />
            <div className="flex justify-between text-[10px] text-parchment-dim/30 mt-0.5"><span>0.0 集中</span><span>1.0 多样</span></div>
          </div>
        </div>
      </div>

      {hasContent && onTogglePolishingMode && (
        <button onClick={onTogglePolishingMode} className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-lg border border-ink/20 text-parchment-dim hover:text-ink hover:bg-study-glow transition-all duration-200">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.93z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
          </svg>
          {polishingMode ? '退出逐句打磨' : '逐句打磨模式'}
        </button>
      )}

      {hasContent && onBrainstorm && (
        <button
          onClick={onBrainstorm}
          disabled={brainstorming || generating || !selectedModel}
          className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-lg border border-amber-500/30 text-amber-300 hover:text-amber-200 hover:bg-amber-500/5 transition-all duration-200 disabled:opacity-40"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a6 6 0 00-3.6 10.8c.47.35.84.82 1.05 1.36l.15.39h4.8l.15-.39c.21-.54.58-1.01 1.05-1.36A6 6 0 0012 3z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 18h4.5M10.5 21h3" />
          </svg>
          {brainstorming ? '正在给你灵感...' : '我卡住了'}
        </button>
      )}

      <div className="space-y-2">
        {generating ? (
          <button onClick={onStop} className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25 transition-all duration-200">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
            </svg>
            停止生成
            <kbd className="ml-auto text-[10px] text-red-300/40 font-mono">⌘G</kbd>
          </button>
        ) : (
          <button onClick={onGenerate} disabled={!selectedModel} className="btn-primary w-full flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            AI 生成
            <kbd className="ml-auto text-[10px] text-study-deep/40 font-mono">⌘G</kbd>
          </button>
        )}

        {hasContent && !generating && (
          <button onClick={onContinue} disabled={!selectedModel} className="btn-secondary w-full flex items-center gap-2 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
            </svg>
            续写
            <kbd className="ml-auto text-[10px] text-parchment-dim/30 font-mono">⌘⇧G</kbd>
          </button>
        )}

        {hasContent && onRefine && (
          <button onClick={onRefine} disabled={generating || !selectedModel} className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-lg border border-ink/20 text-parchment-dim hover:text-ink hover:bg-study-glow transition-all duration-200 disabled:opacity-40">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.93z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L16.875 4.5" />
            </svg>
            精修建议
          </button>
        )}

        {hasContent && !generating && (
          <button onClick={onGenerate} disabled={!selectedModel} className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-lg border border-amber-500/30 text-amber-300 hover:text-amber-200 hover:bg-amber-500/5 transition-all duration-200 disabled:opacity-40">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            快速重试
            <span className="ml-auto text-[10px] text-amber-300/40 font-mono">
              {temperature !== null ? `T${temperature.toFixed(1)}` : ''}{topP !== null ? ` P${topP.toFixed(1)}` : ''}
            </span>
          </button>
        )}
      </div>

      <div className="pt-2 border-t border-study-border/30">
        <p className="text-[10px] text-parchment-dim/25 uppercase tracking-wider font-medium mb-1.5">快捷键</p>
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-parchment-dim/30">
            <span>生成</span><kbd className="font-mono">⌘G</kbd>
          </div>
          <div className="flex justify-between text-[10px] text-parchment-dim/30">
            <span>续写</span><kbd className="font-mono">⌘⇧G</kbd>
          </div>
          <div className="flex justify-between text-[10px] text-parchment-dim/30">
            <span>保存</span><kbd className="font-mono">⌘S</kbd>
          </div>
          <div className="flex justify-between text-[10px] text-parchment-dim/30">
            <span>沉浸模式</span><kbd className="font-mono">⌘\</kbd>
          </div>
          <div className="flex justify-between text-[10px] text-parchment-dim/30">
            <span>逐句打磨</span><kbd className="font-mono">J / K / Enter / X</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
