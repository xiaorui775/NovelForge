import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { chaptersApi, Chapter, ChapterVersion, SSEEvent, QualityScore, VersionCompare, ConsistencyCheckResult, ValidationIssue, RefineSuggestion, ChapterBrainstormResponse } from '../api/chapters';
import { outlinesApi, ChapterOutline } from '../api/outlines';
import { promptTemplatesApi, PromptTemplate } from '../api/promptTemplates';
import { useModelState } from '../stores/modelStore';
import { sendNotification } from '../utils/notify';
import { useUIStore } from '../stores/uiStore';

type SaveStatus = 'saved' | 'saving' | 'unsaved';

export function useChapterEditor(chapterOutlineId: string | undefined) {
  const { models, fetchModels } = useModelState();
  const { showToast } = useUIStore();

  const [chapterOutline, setChapterOutline] = useState<ChapterOutline | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('nf_last_model') || '');
  const [generating, setGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastGenStats, setLastGenStats] = useState<{ token_used?: number; cost?: number; duration_ms?: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [qualityScore, setQualityScore] = useState<QualityScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [autoScore, setAutoScore] = useState(false);
  const [scoreThreshold, setScoreThreshold] = useState(6.0);
  const [costEstimate, setCostEstimate] = useState<{ cost: number; tokens: number } | null>(null);
  const [showCostConfirm, setShowCostConfirm] = useState(false);
  const [compareVersions, setCompareVersions] = useState<string[]>([]);
  const [diffData, setDiffData] = useState<{ v1: VersionCompare; v2: VersionCompare } | null>(null);
  const [multiRound, setMultiRound] = useState(false);
  const [autoRevise, setAutoRevise] = useState(false);
  const [currentRound, setCurrentRound] = useState<{ round: number; label: string } | null>(null);
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyCheckResult | null>(null);
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [refining, setRefining] = useState(false);
  const [refineSuggestions, setRefineSuggestions] = useState<RefineSuggestion[]>([]);
  const [brainstorming, setBrainstorming] = useState(false);
  const [brainstormResult, setBrainstormResult] = useState<ChapterBrainstormResponse | null>(null);
  const [saveRetrying, setSaveRetrying] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedContentRef = useRef('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const contentRef = useRef('');

  const undoStackRef = useRef<{ past: string[]; future: string[] }>({ past: [], future: [] });
  const pushUndoSnapshot = useCallback((currentContent: string) => {
    const stack = undoStackRef.current;
    stack.past.push(currentContent);
    if (stack.past.length > 50) stack.past.shift();
    stack.future = [];
  }, []);

  const handleUndo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.past.length === 0) return;
    const previous = stack.past.pop()!;
    stack.future.push(content);
    setContent(previous);
  }, [content]);

  const handleRedo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.future.length === 0) return;
    const next = stack.future.pop()!;
    stack.past.push(content);
    setContent(next);
  }, [content]);

  // Keep contentRef in sync with content state for use in callbacks
  useEffect(() => { contentRef.current = content; }, [content]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  // Restore draft from localStorage if available
  useEffect(() => {
    if (chapterOutlineId) loadChapter();
  }, [chapterOutlineId]);

  useEffect(() => {
    promptTemplatesApi.list().then(({ data }) => {
      setTemplates(data);
      const saved = localStorage.getItem('nf_last_template');
      if (saved && data.find((t) => t.id === saved)) {
        setSelectedTemplate(saved);
      } else {
        const defaultT = data.find((t) => t.is_default);
        if (defaultT) setSelectedTemplate(defaultT.id);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (models.length > 0 && !selectedModel) setSelectedModel(models[0].id);
  }, [models, selectedModel]);

  useEffect(() => {
    if (selectedModel) localStorage.setItem('nf_last_model', selectedModel);
  }, [selectedModel]);
  useEffect(() => {
    if (selectedTemplate) localStorage.setItem('nf_last_template', selectedTemplate);
  }, [selectedTemplate]);

  const loadChapter = async () => {
    if (!chapterOutlineId) return;
    setLoading(true);
    try {
      const [chapterRes, outlineRes] = await Promise.all([
        chaptersApi.getByOutline(chapterOutlineId),
        outlinesApi.getChapter(chapterOutlineId),
      ]);
      setChapter(chapterRes.data);
      setChapterOutline(outlineRes.data);
      const loadedContent = chapterRes.data.content || '';
      // Check for unsaved draft in localStorage
      const draftKey = `draft:${chapterOutlineId}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft && savedDraft !== loadedContent) {
        const shouldRestore = window.confirm('检测到未保存的草稿，是否恢复？');
        if (shouldRestore) {
          setContent(savedDraft);
          setSaveStatus('unsaved');
        } else {
          setContent(loadedContent);
          localStorage.removeItem(draftKey);
        }
      } else {
        setContent(loadedContent);
        if (savedDraft) localStorage.removeItem(draftKey);
      }
      setRefineSuggestions([]);
      lastSavedContentRef.current = loadedContent;
      if (saveStatus !== 'unsaved') setSaveStatus('saved');
      const { data: versionList } = await chaptersApi.listVersions(chapterRes.data.id);
      setVersions(versionList);
    } catch {
      showToast('error', '加载章节失败');
    }
    setLoading(false);
  };

  const doAutoSave = useCallback(async () => {
    const currentChapter = chapter;
    const currentContent = contentRef.current;
    if (!currentChapter || currentContent === lastSavedContentRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      await chaptersApi.update(currentChapter.id, { content: currentContent, auto_save: true });
      lastSavedContentRef.current = currentContent;
      if (chapterOutlineId) localStorage.removeItem(`draft:${chapterOutlineId}`);
      setSaveStatus('saved');
      retryCountRef.current = 0;
      setSaveRetrying(false);
    } catch {
      setSaveStatus('unsaved');
      if (retryCountRef.current < 3) {
        const delay = 3000 * Math.pow(2, retryCountRef.current);
        retryCountRef.current++;
        setSaveRetrying(true);
        retryTimerRef.current = setTimeout(() => {
          savingRef.current = false;
          doAutoSave();
        }, delay);
        return;
      }
      setSaveRetrying(false);
    }
    savingRef.current = false;
  }, [chapter, chapterOutlineId]);

  useEffect(() => {
    if (!chapter || generating || refining) return;
    if (content === lastSavedContentRef.current) return;
    setSaveStatus('unsaved');
    // Write to localStorage immediately for crash protection
    if (chapterOutlineId) {
      try { localStorage.setItem(`draft:${chapterOutlineId}`, content); } catch { /* quota exceeded */ }
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { doAutoSave(); }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [content, chapter, generating, refining, doAutoSave, chapterOutlineId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved' || saveStatus === 'saving') {
        e.preventDefault();
        // Save to localStorage on page close
        if (chapterOutlineId && content !== lastSavedContentRef.current) {
          try { localStorage.setItem(`draft:${chapterOutlineId}`, content); } catch { /* quota exceeded */ }
        }
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveStatus, chapterOutlineId, content]);

  const doGenerate = useCallback(() => {
    if (!chapter || !selectedModel) return;
    setGenerating(true);
    setStreamingContent('');
    setRefineSuggestions([]);
    setLastGenStats(null);
    setShowCostConfirm(false);
    setCurrentRound(null);
    setValidationIssues([]);

    abortRef.current = chaptersApi.generate(
      chapter.id,
      { model_id: selectedModel, template_id: selectedTemplate || undefined, auto_score: autoScore, score_threshold: scoreThreshold, multi_round: multiRound, auto_revise: autoRevise },
      (event: SSEEvent) => {
        if (event.type === 'token' && event.content) {
          setStreamingContent((prev) => prev + event.content);
        } else if (event.type === 'round_start') {
          setCurrentRound({ round: event.round || 0, label: event.round_label || '' });
          setStreamingContent('');
          showToast('success', `开始${event.round_label}...`);
        } else if (event.type === 'round_token' && event.content) {
          setStreamingContent((prev) => prev + event.content);
        } else if (event.type === 'round_complete') {
          showToast('success', `${event.round_label}完成，${event.word_count} 字`);
        } else if (event.type === 'scored') {
          showToast('success', `质量评分: ${event.score?.toFixed(1)} 分`);
        } else if (event.type === 'low_score') {
          showToast('warning', `评分 ${event.score?.toFixed(1)} 低于阈值 ${event.threshold}，正在重试...`);
        } else if (event.type === 'score_error') {
          showToast('warning', '自动评分失败，已跳过');
        } else if (event.type === 'conflicts') {
          const count = event.conflicts?.length || 0;
          if (count > 0) {
            showToast('warning', `发现 ${count} 条术语/故事圣经冲突，已按术语优先生成`);
          }
        } else if (event.type === 'done') {
          setGenerating(false);
          setStreamingContent('');
          setCurrentRound(null);
          pushUndoSnapshot(content);
          setLastGenStats({ token_used: event.token_used, cost: event.cost, duration_ms: event.duration_ms });
          setSaveStatus('saved');
          loadChapter();
          const roundInfo = event.rounds ? `（${event.rounds} 轮生成）` : '';
          const scoreInfo = event.score ? `，评分 ${event.score.toFixed(1)}` : '';
          showToast('success', `生成完成，共 ${event.word_count} 字${roundInfo}${scoreInfo}`);
          sendNotification('NovelForge', `章节生成完成，共 ${event.word_count} 字`);
        } else if (event.type === 'validation' && event.issues) {
          setValidationIssues(event.issues);
        } else if (event.type === 'error') {
          setGenerating(false);
          setStreamingContent('');
          setCurrentRound(null);
          showToast('error', event.message || '生成失败');
        }
      },
    );
  }, [chapter, selectedModel, selectedTemplate, autoScore, scoreThreshold, multiRound, autoRevise, content, pushUndoSnapshot]);

  const handleGenerate = useCallback(async () => {
    if (!chapter || !selectedModel) return;
    try {
      const { data } = await chaptersApi.estimateCost(chapter.id, selectedModel, selectedTemplate || undefined);
      setCostEstimate({ cost: data.estimated_cost, tokens: data.estimated_input_tokens + data.estimated_output_tokens });
      setShowCostConfirm(true);
    } catch {
      doGenerate();
    }
  }, [chapter, selectedModel, selectedTemplate, doGenerate]);

  const handleContinue = useCallback(() => {
    if (!chapter || !selectedModel) return;
    setGenerating(true);
    setRefineSuggestions([]);
    setStreamingContent(content);
    setLastGenStats(null);
    setValidationIssues([]);

    abortRef.current = chaptersApi.continueWriting(
      chapter.id,
      { model_id: selectedModel },
      (event: SSEEvent) => {
        if (event.type === 'token' && event.content) {
          setStreamingContent((prev) => prev + event.content);
        } else if (event.type === 'validation' && event.issues) {
          setValidationIssues(event.issues);
        } else if (event.type === 'conflicts') {
          const count = event.conflicts?.length || 0;
          if (count > 0) {
            showToast('warning', `发现 ${count} 条术语/故事圣经冲突，已按术语优先续写`);
          }
        } else if (event.type === 'done') {
          setGenerating(false);
          setStreamingContent('');
          pushUndoSnapshot(content);
          setLastGenStats({ token_used: event.token_used, cost: event.cost, duration_ms: event.duration_ms });
          setSaveStatus('saved');
          loadChapter();
          showToast('success', `续写完成，共 ${event.word_count} 字`);
          sendNotification('NovelForge', `续写完成，共 ${event.word_count} 字`);
        } else if (event.type === 'error') {
          setGenerating(false);
          setStreamingContent('');
          showToast('error', event.message || '续写失败');
        }
      },
    );
  }, [chapter, selectedModel, content, pushUndoSnapshot]);

  const handleRefine = useCallback(() => {
    if (!chapter || !selectedModel || !content || content.trim().length < 50) {
      showToast('warning', '内容太短，无法精修');
      return;
    }
    setRefining(true);
    setRefineSuggestions([]);

    abortRef.current = chaptersApi.refine(
      chapter.id,
      { model_id: selectedModel, draft_text: content, max_suggestions: 10 },
      (event: SSEEvent) => {
        if (event.type === 'refine_start') {
          showToast('success', `开始精修，分析 ${event.total || 0} 段`);
        } else if (event.type === 'refine_suggestion') {
          const s: RefineSuggestion = {
            index: event.index || 0,
            paragraph_index: event.paragraph_index || 0,
            original: event.original || '',
            revised: event.revised || '',
            reason: event.reason || '',
            confidence: event.confidence || 0,
          };
          setRefineSuggestions((prev) => [...prev, s]);
        } else if (event.type === 'done') {
          setRefining(false);
          showToast('success', `精修完成，${event.suggestions_count || 0} 条建议`);
        } else if (event.type === 'error') {
          setRefining(false);
          showToast('error', event.message || '精修失败');
        }
      },
    );
  }, [chapter, selectedModel, content, showToast]);

  const brainstormTransitionRef = useRef<string>('');

  const handleBrainstorm = useCallback((selectedDirection?: string) => {
    if (!chapter || !selectedModel) return;
    setBrainstorming(true);
    setBrainstormResult(null);
    brainstormTransitionRef.current = '';

    const isTransitionRequest = !!selectedDirection;

    abortRef.current = chaptersApi.brainstorm(
      chapter.id,
      { model_id: selectedModel, selected_direction: selectedDirection || undefined },
      (event: SSEEvent) => {
        if (event.type === 'brainstorm_direction' && event.direction) {
          setBrainstormResult((prev) => ({
            directions: [...(prev?.directions || []), event.direction!],
            transition_text: prev?.transition_text || null,
          }));
        } else if (event.type === 'brainstorm_transition_token' && event.content) {
          brainstormTransitionRef.current += event.content;
          const accumulated = brainstormTransitionRef.current;
          setBrainstormResult((prev) => ({
            directions: prev?.directions || [],
            transition_text: accumulated,
          }));
        } else if (event.type === 'done') {
          setBrainstorming(false);
          if (isTransitionRequest && event.transition_text) {
            pushUndoSnapshot(content);
            setContent((prev) => {
              const separator = prev.endsWith('\n') ? '\n' : '\n\n';
              return `${prev}${separator}${event.transition_text}`;
            });
            showToast('success', '已插入过渡段落');
          } else if (event.directions && event.directions.length > 0) {
            setBrainstormResult({ directions: event.directions, transition_text: event.transition_text || null });
            showToast('success', `已生成 ${event.directions.length} 个走向`);
          }
        } else if (event.type === 'error') {
          setBrainstorming(false);
          showToast('error', event.message || '脑暴失败');
        }
      },
    );
  }, [chapter, selectedModel, pushUndoSnapshot, content, showToast]);

  const applyRefineSuggestion = useCallback((s: RefineSuggestion) => {
    if (!s.original || !s.revised) return;
    const start = content.indexOf(s.original);
    if (start < 0) {
      showToast('warning', '未找到原文片段，可能已被修改');
      return;
    }
    pushUndoSnapshot(content);
    const end = start + s.original.length;
    setContent((prev) => prev.substring(0, start) + s.revised + prev.substring(end));
    setRefineSuggestions((prev) => prev.filter((x) => x.index !== s.index));
  }, [content, pushUndoSnapshot, showToast]);

  const dismissRefineSuggestion = useCallback((index: number) => {
    setRefineSuggestions((prev) => prev.filter((x) => x.index !== index));
  }, []);

  const handleStop = () => {
    abortRef.current?.abort();
    setGenerating(false);
    setRefining(false);
    setBrainstorming(false);
    if (streamingContent) {
      setContent(streamingContent);
      setStreamingContent('');
    }
  };

  const handleSave = async () => {
    if (!chapter) return;
    // Cancel any pending auto-save retry
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryCountRef.current = 0;
    savingRef.current = true;
    setSaving(true);
    setSaveStatus('saving');
    try {
      await chaptersApi.update(chapter.id, { content });
      lastSavedContentRef.current = content;
      if (chapterOutlineId) localStorage.removeItem(`draft:${chapterOutlineId}`);
      setSaveStatus('saved');
      showToast('success', '保存成功');
    } catch {
      setSaveStatus('unsaved');
      showToast('error', '保存失败');
    }
    savingRef.current = false;
    setSaving(false);
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!chapter) return;
    try {
      pushUndoSnapshot(content);
      const { data } = await chaptersApi.restoreVersion(chapter.id, versionId);
      setContent(data.content || '');
      setShowVersions(false);
      showToast('success', '已恢复到此版本');
    } catch {
      showToast('error', '恢复失败');
    }
  };

  const handleScore = async () => {
    if (!chapter || !selectedModel) return;
    setScoring(true);
    setQualityScore(null);
    try {
      const { data } = await chaptersApi.scoreChapter(chapter.id, selectedModel);
      setQualityScore(data);
      showToast('success', '评分完成');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '评分失败';
      showToast('error', message);
    }
    setScoring(false);
  };

  const toggleCompareVersion = (versionId: string) => {
    setCompareVersions((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      if (prev.length >= 2) return [prev[1], versionId];
      return [...prev, versionId];
    });
  };

  const handleCompare = async () => {
    if (!chapter || compareVersions.length !== 2) return;
    try {
      const { data } = await chaptersApi.compareVersions(chapter.id, compareVersions[0], compareVersions[1]);
      setDiffData(data);
    } catch {
      showToast('error', '获取版本内容失败');
    }
  };

  const handleConsistencyCheck = async () => {
    if (!chapter || !selectedModel) return;
    setCheckingConsistency(true);
    setConsistencyResult(null);
    try {
      const { data } = await chaptersApi.checkConsistency(chapter.id, selectedModel);
      setConsistencyResult(data);
      showToast('success', '一致性检查完成');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '检查失败';
      showToast('error', message);
    }
    setCheckingConsistency(false);
  };

  const handleApplyRewrite = useCallback((start: number, end: number, newText: string) => {
    pushUndoSnapshot(content);
    setContent((prev) => prev.substring(0, start) + newText + prev.substring(end));
  }, [content, pushUndoSnapshot]);

  const displayContent = generating ? streamingContent : content;
  const wordCount = useMemo(() => {
    if (!displayContent) return 0;
    const cjkChars = (displayContent.match(/[一-鿿㐀-䶿]/g) || []).length;
    const totalRatio = cjkChars / Math.max(displayContent.length, 1);
    if (totalRatio > 0.3) {
      return displayContent.replace(/[\s\p{P}]/gu, '').length;
    }
    return displayContent.trim() ? displayContent.trim().split(/\s+/).length : 0;
  }, [displayContent]);

  return useMemo(() => ({
    chapterOutline, chapter, versions, content, setContent,
    loading, selectedModel, setSelectedModel, generating, streamingContent,
    showVersions, setShowVersions, saving, lastGenStats, saveStatus, saveRetrying,
    qualityScore, scoring, templates, selectedTemplate, setSelectedTemplate,
    autoScore, setAutoScore, scoreThreshold, setScoreThreshold,
    costEstimate, showCostConfirm, setShowCostConfirm,
    compareVersions, diffData, setDiffData,
    multiRound, setMultiRound, currentRound, autoRevise, setAutoRevise,
    consistencyResult, checkingConsistency,
    validationIssues, refining, refineSuggestions,
    brainstorming, brainstormResult,
    editorRef, displayContent, wordCount,
    handleGenerate, handleContinue, handleRefine, handleBrainstorm, handleStop, handleSave,
    handleRestoreVersion, handleScore, toggleCompareVersion,
    handleCompare, handleConsistencyCheck, doGenerate, models,
    handleApplyRewrite, handleUndo, handleRedo, pushUndoSnapshot,
    applyRefineSuggestion, dismissRefineSuggestion,
  }), [
    chapterOutline, chapter, versions, content, loading, selectedModel, generating,
    streamingContent, showVersions, saving, lastGenStats, saveStatus, saveRetrying,
    qualityScore, scoring, templates, selectedTemplate, autoScore,
    scoreThreshold, costEstimate, showCostConfirm, compareVersions,
    diffData, multiRound, currentRound, consistencyResult,
    checkingConsistency, validationIssues, refining, refineSuggestions,
    brainstorming, brainstormResult,
    displayContent, wordCount, models, handleApplyRewrite, autoRevise,
    handleUndo, handleRedo, handleGenerate, handleContinue, handleRefine,
    handleBrainstorm, handleSave, handleRestoreVersion, handleScore, handleCompare,
    handleConsistencyCheck, doGenerate, applyRefineSuggestion, dismissRefineSuggestion,
  ]);
}
