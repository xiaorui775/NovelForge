import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useChapterEditor } from '../hooks/useChapterEditor';
import {
  EditorToolbar,
  GenerationPanel,
  ConsistencyPanel,
  VersionPanel,
  CostConfirmModal,
  EditorStatusBar,
  ScenePanel,
  WritingContext,
} from '../components/editor';
import ChapterMemoEditor from '../components/editor/ChapterMemoEditor';
import VersionDiff from '../components/VersionDiff';

type ParagraphSlice = {
  index: number;
  text: string;
  start: number;
  end: number;
};

function splitParagraphs(content: string): ParagraphSlice[] {
  if (!content.trim()) return [];
  const pieces = content.split(/\n{2,}/);
  const paragraphs: ParagraphSlice[] = [];
  let cursor = 0;

  for (const piece of pieces) {
    const start = content.indexOf(piece, cursor);
    if (start < 0) continue;
    const end = start + piece.length;
    cursor = end;

    if (piece.trim()) {
      paragraphs.push({
        index: paragraphs.length,
        text: piece,
        start,
        end,
      });
    }
  }

  return paragraphs;
}

function getParagraphHint(text: string): string {
  const normalized = text.trim();
  if (!normalized) return '该段较短，建议补充动作、心理或场景细节。';

  const sentenceCount = (normalized.match(/[。！？!?]/g) || []).length || 1;
  const avgSentenceLength = normalized.length / sentenceCount;
  const dialogueCount = (normalized.match(/[“”"「」]/g) || []).length;
  const dialogueRatio = dialogueCount / Math.max(normalized.length, 1);

  const repeated3 = normalized.match(/([一-鿿]{3,})\1+/);
  if (repeated3) {
    return `出现重复短语「${repeated3[1]}」，可替换同义表达增强节奏。`;
  }

  if (avgSentenceLength > 42) {
    return '句子偏长，可拆分为短句并加入停顿词，提升可读性。';
  }

  if (avgSentenceLength < 16) {
    return '句子偏短且密集，可增加描写与过渡让情绪更连贯。';
  }

  if (dialogueRatio > 0.18) {
    return '对话占比偏高，建议补一两句动作或神态描写，避免“漂浮对话”。';
  }

  if (dialogueRatio < 0.04 && normalized.length > 120) {
    return '叙述较多，可补充角色互动或冲突点，增强现场感。';
  }

  return '段落节奏基本平稳，可重点打磨关键词和情绪转折。';
}

export default function ChapterEditor() {
  const { id: projectId, chapterOutlineId } = useParams<{ id: string; chapterOutlineId: string }>();
  const s = useChapterEditor(chapterOutlineId);
  const [focusMode, setFocusMode] = useState(false);
  const [showOutlineRef, setShowOutlineRef] = useState(true);
  const [polishingMode, setPolishingMode] = useState(false);
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  const paragraphs = useMemo(() => splitParagraphs(s.content || ''), [s.content]);

  useEffect(() => {
    if (!polishingMode) return;
    if (paragraphs.length === 0) {
      setCurrentParagraphIndex(0);
      return;
    }
    setCurrentParagraphIndex((prev) => Math.min(prev, paragraphs.length - 1));
  }, [paragraphs, polishingMode]);

  const currentParagraph = paragraphs[currentParagraphIndex] || null;
  const currentParagraphSuggestions = useMemo(() => {
    if (!currentParagraph) return [];
    return s.refineSuggestions.filter((item) => item.paragraph_index === currentParagraph.index);
  }, [s.refineSuggestions, currentParagraph]);

  useEffect(() => {
    if (selectedSuggestionIndex >= currentParagraphSuggestions.length) {
      setSelectedSuggestionIndex(0);
    }
  }, [currentParagraphSuggestions, selectedSuggestionIndex]);

  const activeSuggestion = currentParagraphSuggestions[selectedSuggestionIndex] || null;

  const gotoNextParagraph = useCallback(() => {
    if (paragraphs.length === 0) return;
    setCurrentParagraphIndex((prev) => Math.min(prev + 1, paragraphs.length - 1));
    setSelectedSuggestionIndex(0);
  }, [paragraphs.length]);

  const gotoPrevParagraph = useCallback(() => {
    if (paragraphs.length === 0) return;
    setCurrentParagraphIndex((prev) => Math.max(prev - 1, 0));
    setSelectedSuggestionIndex(0);
  }, [paragraphs.length]);

  const applyActiveSuggestion = useCallback(() => {
    if (!activeSuggestion) return;
    s.applyRefineSuggestion(activeSuggestion);
    setSelectedSuggestionIndex(0);
  }, [activeSuggestion, s]);

  const dismissActiveSuggestion = useCallback(() => {
    if (!activeSuggestion) return;
    s.dismissRefineSuggestion(activeSuggestion.index);
    setSelectedSuggestionIndex(0);
  }, [activeSuggestion, s]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (polishingMode) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setPolishingMode(false);
        return;
      }
      if (!e.metaKey && !e.ctrlKey) {
        if (e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          gotoNextParagraph();
          return;
        }
        if (e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          gotoPrevParagraph();
          return;
        }
        if (e.key === 'Enter' && activeSuggestion) {
          const target = e.target as HTMLElement | null;
          if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
            return;
          }
          e.preventDefault();
          applyActiveSuggestion();
          return;
        }
        if ((e.key === 'x' || e.key === 'X') && activeSuggestion) {
          e.preventDefault();
          dismissActiveSuggestion();
          return;
        }
      }
    }

    if (e.key === 'Escape' && focusMode) {
      setFocusMode(false);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
      e.preventDefault();
      setFocusMode((prev) => !prev);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      s.handleSave();
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
      if (document.activeElement === s.editorRef.current) return;
      e.preventDefault();
      s.handleUndo();
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
      if (document.activeElement === s.editorRef.current) return;
      e.preventDefault();
      s.handleRedo();
    }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'G') {
      e.preventDefault();
      if (!s.generating && s.selectedModel && s.content && s.content.length > 50) {
        s.handleContinue();
      }
    }
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'g') {
      e.preventDefault();
      if (!s.generating && s.selectedModel) {
        s.handleGenerate();
      }
    }
  }, [
    polishingMode,
    focusMode,
    s,
    gotoNextParagraph,
    gotoPrevParagraph,
    activeSuggestion,
    applyActiveSuggestion,
    dismissActiveSuggestion,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (s.loading) {
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

  if (polishingMode) {
    const progress = paragraphs.length > 0
      ? Math.round(((currentParagraphIndex + 1) / paragraphs.length) * 100)
      : 0;

    return (
      <div className="fixed inset-0 z-40 bg-study-deep flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-6 py-3 border-b border-study-border/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPolishingMode(false)}
              className="text-parchment-dim/40 hover:text-ink transition-colors"
              title="退出逐句打磨 (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div>
              <p className="text-[11px] text-ink/70 uppercase tracking-wider">逐句打磨模式</p>
              <p className="text-sm text-parchment-dim/60 font-display">{s.chapterOutline?.title || '章节编辑'}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-parchment-dim/40">第 {Math.min(currentParagraphIndex + 1, Math.max(paragraphs.length, 1))} / {paragraphs.length || 1} 段</p>
            <p className="text-[10px] text-parchment-dim/25">完成度 {progress}%</p>
          </div>
        </div>

        <div className="h-1 bg-study-border/30">
          <div className="h-full bg-ink transition-all" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0 overflow-hidden">
          <div className="overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, idx) => {
                  const active = idx === currentParagraphIndex;
                  return (
                    <button
                      key={`${p.start}-${p.end}`}
                      type="button"
                      onClick={() => {
                        setCurrentParagraphIndex(idx);
                        setSelectedSuggestionIndex(0);
                      }}
                      className={`w-full text-left rounded-xl border transition-all px-4 py-4 ${
                        active
                          ? 'border-ink/40 bg-study-card shadow-[0_0_0_1px_rgba(233,69,96,0.25)]'
                          : 'border-study-border/40 bg-study-card/40 hover:border-study-border/70'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase tracking-wider text-parchment-dim/40">第 {idx + 1} 段</span>
                        {active && <span className="text-[10px] text-ink/70">当前</span>}
                      </div>
                      <p className="text-sm text-parchment-dim/80 whitespace-pre-wrap leading-relaxed">{p.text}</p>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-xl border border-study-border/40 bg-study-card/50 px-5 py-6 text-center text-parchment-dim/40 text-sm">
                  当前内容不足以分段，请先写入正文。
                </div>
              )}
            </div>
          </div>

          <div className="border-l border-study-border/30 bg-study-card/30 p-5 overflow-y-auto">
            <div className="space-y-4">
              <div className="rounded-lg border border-study-border/40 p-4 bg-study-deep/50">
                <p className="text-[11px] text-ink/70 uppercase tracking-wider mb-2">轻量评语</p>
                <p className="text-sm text-parchment-dim/75 leading-relaxed">
                  {currentParagraph ? getParagraphHint(currentParagraph.text) : '暂无可评估段落'}
                </p>
              </div>

              <div className="rounded-lg border border-study-border/40 p-4 bg-study-deep/50 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-ink/70 uppercase tracking-wider">精修建议</p>
                  <span className="text-[10px] text-parchment-dim/35">{currentParagraphSuggestions.length} 条</span>
                </div>

                <button
                  onClick={s.handleRefine}
                  disabled={s.refining || s.generating || !s.selectedModel || !currentParagraph}
                  className="btn-primary w-full text-xs"
                >
                  {s.refining ? '生成中...' : '生成当前章节建议'}
                </button>

                {activeSuggestion ? (
                  <div className="rounded-lg border border-ink/20 p-3 bg-study-card/60">
                    <p className="text-[10px] text-parchment-dim/35 mb-1">建议 {selectedSuggestionIndex + 1} / {currentParagraphSuggestions.length}</p>
                    <p className="text-xs text-parchment-dim/65 mb-2">{activeSuggestion.reason}</p>
                    <p className="text-xs text-ink/80 whitespace-pre-wrap leading-relaxed">{activeSuggestion.revised}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={applyActiveSuggestion} className="btn-primary text-xs px-3 py-1.5">应用 (Enter)</button>
                      <button onClick={dismissActiveSuggestion} className="btn-ghost text-xs px-3 py-1.5">跳过 (X)</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-parchment-dim/40">当前段暂无建议，可先生成精修建议。</p>
                )}

                {currentParagraphSuggestions.length > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0))}
                      disabled={selectedSuggestionIndex === 0}
                      className="btn-ghost text-xs px-2 py-1 disabled:opacity-40"
                    >
                      上一条
                    </button>
                    <button
                      onClick={() => setSelectedSuggestionIndex((prev) => Math.min(prev + 1, currentParagraphSuggestions.length - 1))}
                      disabled={selectedSuggestionIndex >= currentParagraphSuggestions.length - 1}
                      className="btn-ghost text-xs px-2 py-1 disabled:opacity-40"
                    >
                      下一条
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-2 border-t border-study-border/20 text-[10px] text-parchment-dim/25">
          <div className="flex items-center gap-4">
            <span>J/K 切换段落</span>
            <span>Enter 应用建议</span>
            <span>X 跳过建议</span>
          </div>
          <span>Esc 退出逐句打磨模式</span>
        </div>
      </div>
    );
  }

  if (focusMode) {
    return (
      <div className="fixed inset-0 z-40 bg-study-deep flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-6 py-3 border-b border-study-border/30">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFocusMode(false)}
              className="text-parchment-dim/40 hover:text-ink transition-colors"
              title="退出沉浸模式 (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <span className="text-sm text-parchment-dim/60 font-display">
              {s.chapterOutline?.title || '章节编辑'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {s.chapterOutline?.summary && (
              <button
                onClick={() => setShowOutlineRef(!showOutlineRef)}
                className="text-[11px] text-parchment-dim/40 hover:text-ink transition-colors"
              >
                {showOutlineRef ? '隐藏概述' : '显示概述'}
              </button>
            )}
            <button onClick={s.handleSave} disabled={s.saving} className="text-[11px] text-parchment-dim/50 hover:text-ink transition-colors">
              {s.saving ? '保存中...' : '保存'}
            </button>
            <span className="text-[11px] text-parchment-dim/30 font-mono">{s.wordCount} 字</span>
          </div>
        </div>

        {showOutlineRef && s.chapterOutline?.summary && (
          <div className="px-6 py-3 border-b border-study-border/20 bg-study-card/50">
            <p className="text-xs text-parchment-dim/50 leading-relaxed max-w-3xl mx-auto">{s.chapterOutline.summary}</p>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <div className="h-full max-w-3xl mx-auto px-6 py-8">
            <GenerationPanel
              generating={s.generating}
              currentRound={s.currentRound}
              streamingContent={s.streamingContent}
              content={s.content}
              editorRef={s.editorRef}
              onContentChange={s.setContent}
              onStop={s.handleStop}
              chapterId={s.chapter?.id}
              modelId={s.selectedModel}
              onApplyRewrite={s.handleApplyRewrite}
              validationIssues={s.validationIssues}
            />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-2 border-t border-study-border/20">
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-parchment-dim/30">
              {s.saveStatus === 'saved' ? '已保存' : s.saveStatus === 'saving' ? '保存中...' : '未保存'}
            </span>
            {s.generating && (
              <span className="text-[10px] text-ink/60 animate-pulse">AI 生成中...</span>
            )}
          </div>
          <span className="text-[10px] text-parchment-dim/20">Cmd+\ 切换沉浸模式 | Esc 退出</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            to={`/projects/${projectId}/outline`}
            className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            返回大纲
          </Link>
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">
            {s.chapterOutline?.title || '章节编辑'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFocusMode(true)}
            className="btn-ghost text-xs flex items-center gap-1.5"
            title="沉浸模式 (Cmd+\\)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
            沉浸模式
          </button>
          {s.versions.length > 0 && (
            <button onClick={() => s.setShowVersions(!s.showVersions)} className="btn-ghost text-xs flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              版本 ({s.versions.length})
            </button>
          )}
          <button onClick={s.handleSave} disabled={s.saving} className="btn-secondary text-sm">
            {s.saving ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                保存中
              </span>
            ) : '保存'}
          </button>
        </div>
      </div>

      {s.chapterOutline?.summary && (
        <div className="mb-5 p-4 bg-study-card rounded-lg border-l-2 border-ink/40 border-t-0 border-r-0 border-b-0">
          <p className="text-[11px] text-ink/60 uppercase tracking-wider font-medium mb-1.5">章节概述</p>
          <p className="text-sm text-parchment-dim leading-relaxed">{s.chapterOutline.summary}</p>
          {s.chapterOutline.detail_outline && (
            <details className="mt-3">
              <summary className="text-[11px] text-ink/40 cursor-pointer hover:text-ink/60 transition-colors">
                查看细纲（AI 生成时参考）
              </summary>
              <p className="text-xs text-parchment-dim/60 leading-relaxed mt-2 whitespace-pre-wrap">{s.chapterOutline.detail_outline}</p>
            </details>
          )}
          <ChapterMemoEditor
            chapterOutlineId={s.chapterOutline.id}
            initialMemo={s.chapterOutline.chapter_memo}
          />
        </div>
      )}

      {s.chapter?.id && (
        <WritingContext chapterId={s.chapter.id} hasContent={!!(s.content && s.content.length > 50)} modelId={s.selectedModel} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
        <div>
          <div className="card p-0 overflow-hidden">
            <GenerationPanel
              generating={s.generating}
              currentRound={s.currentRound}
              streamingContent={s.streamingContent}
              content={s.content}
              editorRef={s.editorRef}
              onContentChange={s.setContent}
              onStop={s.handleStop}
              chapterId={s.chapter?.id}
              modelId={s.selectedModel}
              onApplyRewrite={s.handleApplyRewrite}
              validationIssues={s.validationIssues}
            />
          </div>

          <EditorStatusBar
            saveStatus={s.saveStatus}
            wordCount={s.wordCount}
            chapter={s.chapter}
            models={s.models}
            lastGenStats={s.lastGenStats}
          />
        </div>

        <div className="space-y-4">
          <EditorToolbar
            models={s.models}
            selectedModel={s.selectedModel}
            onModelChange={s.setSelectedModel}
            templates={s.templates}
            selectedTemplate={s.selectedTemplate}
            onTemplateChange={s.setSelectedTemplate}
            autoScore={s.autoScore}
            onAutoScoreChange={s.setAutoScore}
            scoreThreshold={s.scoreThreshold}
            onScoreThresholdChange={s.setScoreThreshold}
            multiRound={s.multiRound}
            onMultiRoundChange={s.setMultiRound}
            autoRevise={s.autoRevise}
            onAutoReviseChange={s.setAutoRevise}
            generating={s.generating}
            hasContent={!!(s.content && s.content.length > 50)}
            polishingMode={polishingMode}
            onTogglePolishingMode={() => setPolishingMode((prev) => !prev)}
            brainstorming={s.brainstorming}
            onBrainstorm={() => s.handleBrainstorm()}
            onGenerate={s.handleGenerate}
            onContinue={s.handleContinue}
            onRefine={s.handleRefine}
          />


          {s.brainstormResult && s.brainstormResult.directions.length > 0 && (
            <div className="card p-4 border border-amber-500/20 bg-amber-500/5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-amber-300 uppercase tracking-wider font-medium">继续写作方向</p>
                <span className="text-[11px] text-amber-200/60">{s.brainstormResult.directions.length} 条</span>
              </div>
              <div className="space-y-3">
                {s.brainstormResult.directions.map((direction, idx) => (
                  <div key={`${direction.title}-${idx}`} className="rounded-lg border border-amber-500/20 bg-study-deep/40 p-3">
                    <p className="text-sm text-amber-100 font-medium">{direction.title}</p>
                    <p className="text-xs text-parchment-dim/80 mt-1 leading-relaxed">{direction.summary}</p>
                    <p className="text-[11px] text-amber-200/70 mt-1">{direction.why_it_works}</p>
                    <button
                      onClick={() => s.handleBrainstorm(direction.summary)}
                      disabled={s.brainstorming}
                      className="btn-ghost text-xs mt-2 px-3 py-1.5 border border-amber-500/30 text-amber-200"
                    >
                      用这个方向生成过渡段
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.refineSuggestions.length > 0 && (
            <div className="card p-4 border border-ink/20 bg-study-card/60">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-ink/70 uppercase tracking-wider font-medium">精修建议</p>
                <span className="text-[11px] text-parchment-dim/40">{s.refineSuggestions.length} 条</span>
              </div>
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {s.refineSuggestions.map((suggestion) => (
                  <div key={suggestion.index} className="rounded-lg border border-study-border/50 p-3 bg-study-deep/50">
                    <p className="text-[11px] text-parchment-dim/50 mb-1">第 {suggestion.paragraph_index + 1} 段 · 置信度 {Math.round(suggestion.confidence * 100)}%</p>
                    <p className="text-xs text-parchment-dim/70 mb-2">{suggestion.reason}</p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] text-parchment-dim/40 uppercase tracking-wider mb-1">原文</p>
                        <p className="text-xs text-parchment-dim/70 whitespace-pre-wrap leading-relaxed">{suggestion.original}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink/60 uppercase tracking-wider mb-1">建议</p>
                        <p className="text-xs text-ink/80 whitespace-pre-wrap leading-relaxed">{suggestion.revised}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => s.applyRefineSuggestion(suggestion)}
                        className="btn-primary text-xs px-3 py-1.5"
                      >
                        应用
                      </button>
                      <button
                        onClick={() => s.dismissRefineSuggestion(suggestion.index)}
                        className="btn-ghost text-xs px-3 py-1.5"
                      >
                        忽略
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.content && s.content.length > 50 && (
            <ConsistencyPanel
              consistencyResult={s.consistencyResult}
              checkingConsistency={s.checkingConsistency}
              onCheck={s.handleConsistencyCheck}
              disabled={s.checkingConsistency || s.generating || !s.selectedModel}
            />
          )}

          <ScenePanel chapterId={s.chapter?.id || null} />

          {s.showVersions && (
            <VersionPanel
              versions={s.versions}
              compareVersions={s.compareVersions}
              onToggleCompare={s.toggleCompareVersion}
              onCompare={s.handleCompare}
              onRestore={s.handleRestoreVersion}
              onClose={() => { s.setShowVersions(false); }}
            />
          )}
        </div>
      </div>

      {s.diffData && <VersionDiff v1={s.diffData.v1} v2={s.diffData.v2} onClose={() => s.setDiffData(null)} />}

      {s.showCostConfirm && s.costEstimate && (
        <CostConfirmModal costEstimate={s.costEstimate} onConfirm={s.doGenerate} onCancel={() => s.setShowCostConfirm(false)} />
      )}
    </div>
  );
}
