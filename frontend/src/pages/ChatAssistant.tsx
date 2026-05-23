import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatApi, ChatMessage, ChatSSEEvent, SuggestedAction } from '../api/chat';
import { modelsApi, ModelConfig } from '../api/models';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

interface ChapterOption {
  id: string;
  title: string;
  chapter_number: number;
}

const QUICK_PROMPTS = [
  { icon: ' ', text: '帮我构思下一章的大纲' },
  { icon: ' ', text: '分析一下主角的性格发展' },
  { icon: ' ', text: '这段对话写得自然吗？' },
  { icon: ' ', text: '有什么伏笔可以埋设？' },
  { icon: ' ', text: '帮我润色这段文字' },
  { icon: ' ', text: '这个情节转折合理吗？' },
];

type ContextMode = 'full' | 'chapter' | 'selection';

export default function ChatAssistant() {
  const { id: projectId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { currentProject, fetchProject } = useProjectStore();
  const { showToast } = useUIStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const streamingContentRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Chapter reference state
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [referencedChapterId, setReferencedChapterId] = useState<string | null>(null);
  const [referencedText, setReferencedText] = useState<string | null>(null);
  const [contextMode, setContextMode] = useState<ContextMode>('full');
  const [showRefPanel, setShowRefPanel] = useState(false);

  // Apply action confirm state
  const [pendingApply, setPendingApply] = useState<{ messageId: string; action: SuggestedAction; actionIndex: number } | null>(null);

  // Initialize from URL params (coming from chapter editor "Ask AI")
  useEffect(() => {
    const chapterId = searchParams.get('chapterId');
    const selectedText = searchParams.get('selectedText');
    if (chapterId) {
      setReferencedChapterId(chapterId);
      if (selectedText) {
        setReferencedText(decodeURIComponent(selectedText));
        setContextMode('selection');
      } else {
        setContextMode('chapter');
      }
      setShowRefPanel(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (projectId) {
      fetchProject(projectId);
      loadHistory();
      loadModels();
      loadChapters();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const loadHistory = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await chatApi.getHistory(projectId);
      setMessages(data);
    } catch {
      showToast('error', '加载聊天记录失败');
    }
    setLoading(false);
  };

  const loadModels = async () => {
    try {
      const { data } = await modelsApi.list();
      const active = data.filter((m) => m.is_active);
      setModels(active);
      if (active.length > 0) setSelectedModel(active[0].id);
    } catch { /* silent */ }
  };

  const loadChapters = async () => {
    if (!projectId) return;
    try {
      const { data } = await chatApi.getChapterList(projectId);
      setChapters(data);
    } catch { /* silent */ }
  };

  const handleSend = () => {
    if (!projectId || !input.trim() || !selectedModel || streaming) return;

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      project_id: projectId,
      role: 'user',
      content: input.trim(),
      model_id: null,
      token_used: 0,
      referenced_chapter_id: contextMode !== 'full' ? referencedChapterId : null,
      referenced_text: contextMode === 'selection' ? referencedText : null,
      context_mode: contextMode,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setStreamingContent('');

    streamingContentRef.current = '';

    abortRef.current = chatApi.sendMessage(
      projectId,
      {
        message: userMsg.content,
        model_id: selectedModel,
        referenced_chapter_id: contextMode !== 'full' ? referencedChapterId : null,
        referenced_text: contextMode === 'selection' ? referencedText : null,
        context_mode: contextMode,
      },
      (event: ChatSSEEvent) => {
        if (event.type === 'token' && event.content) {
          streamingContentRef.current += event.content;
          setStreamingContent(streamingContentRef.current);
        } else if (event.type === 'done') {
          const assistantMsg: ChatMessage = {
            id: event.message_id || `done-${Date.now()}`,
            project_id: projectId,
            role: 'assistant',
            content: streamingContentRef.current,
            model_id: selectedModel,
            token_used: event.token_used || 0,
            created_at: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
          streamingContentRef.current = '';
          setStreamingContent('');
          setStreaming(false);
        } else if (event.type === 'error') {
          showToast('error', event.message || '发送失败');
          streamingContentRef.current = '';
          setStreamingContent('');
          setStreaming(false);
        }
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = async () => {
    if (!projectId) return;
    try {
      await chatApi.clearHistory(projectId);
      setMessages([]);
      showToast('success', '聊天记录已清空');
    } catch {
      showToast('error', '清空失败');
    }
  };

  const handleApplyAction = async (messageId: string, action: SuggestedAction, actionIndex: number) => {
    setPendingApply({ messageId, action, actionIndex });
  };

  const confirmApplyAction = async () => {
    if (!pendingApply) return;
    const { messageId, actionIndex } = pendingApply;
    setPendingApply(null);
    try {
      const { data } = await chatApi.applyAction(messageId, actionIndex);
      if (data.ok) {
        setMessages(prev => prev.map(m => {
          if (m.id !== messageId) return m;
          try {
            const actions = JSON.parse(m.suggested_action || '[]');
            if (Array.isArray(actions)) {
              const remaining = actions.filter((_: unknown, i: number) => i !== actionIndex);
              return { ...m, suggested_action: remaining.length > 0 ? JSON.stringify(remaining) : null };
            }
          } catch { /* ignore */ }
          return { ...m, suggested_action: null };
        }));
        showToast('success', '已应用到章节');
      }
    } catch {
      showToast('error', '应用失败');
      // Re-fetch history to sync client state with server on failure
      if (projectId) {
        try {
          const { data: history } = await chatApi.getHistory(projectId);
          setMessages(history);
        } catch { /* ignore */ }
      }
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  const clearReference = () => {
    setReferencedChapterId(null);
    setReferencedText(null);
    setContextMode('full');
    setShowRefPanel(false);
  };

  const selectedChapterName = referencedChapterId
    ? chapters.find((c) => c.id === referencedChapterId)?.title || '未知章节'
    : null;

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <Link
            to={`/projects/${projectId}`}
            className="inline-flex items-center gap-1.5 text-parchment-dim/50 hover:text-ink text-xs transition-colors mb-2"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            {currentProject?.name}
          </Link>
          <h1 className="font-display text-2xl font-bold text-parchment tracking-tight">写作助手</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input text-xs py-1.5"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button onClick={handleClear} className="btn-ghost text-sm px-2.5 py-1.5 text-parchment-dim/40 hover:text-red-400/70" title="清空聊天">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto card !p-0 mb-3 min-h-0">
        <div className="p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-parchment-dim/40">
              <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载中...
            </div>
          ) : messages.length === 0 && !streaming ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-ink/20 to-ink/5 flex items-center justify-center">
                  <svg className="w-10 h-10 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-ink/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
              </div>
              <p className="font-display text-xl text-parchment mb-2">AI 写作助手</p>
              <p className="text-parchment-dim/50 text-sm max-w-sm leading-relaxed">
                基于项目上下文的智能对话助手，帮你讨论情节构思、角色塑造、大纲规划
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                const prevMsg = messages[i - 1];
                const showGap = prevMsg && prevMsg.role !== msg.role;

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${showGap ? 'mt-6' : 'mt-4'} ${isUser ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Avatar */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      isUser
                        ? 'bg-ink/20 text-ink'
                        : 'bg-gradient-to-br from-study-deep to-study-card text-parchment-dim/60 border border-study-border'
                    }`}>
                      {isUser ? '你' : 'AI'}
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[75%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
                      {/* Reference badge for user messages */}
                      {isUser && msg.context_mode && msg.context_mode !== 'full' && (
                        <div className={`flex items-center gap-1.5 mb-1 ${isUser ? 'justify-end mr-1' : 'ml-1'}`}>
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-ink/10 text-ink/60 border border-ink/10">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            {msg.context_mode === 'chapter' ? '引用章节' : '引用选段'}
                          </span>
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-3 ${
                        isUser
                          ? 'bg-ink/15 border border-ink/10 rounded-tr-md'
                          : 'bg-study-deep/60 border border-study-border/40 rounded-tl-md'
                      }`}>
                        {isUser ? (
                          <p className="text-sm text-parchment/90 whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        ) : (
                          <div>
                            <div className="text-sm text-parchment/90 leading-relaxed prose-chat overflow-x-auto">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            </div>
                            {msg.suggested_action && (() => {
                              try {
                                const parsed = JSON.parse(msg.suggested_action);
                                // 兼容：可能是单个对象或对象数组
                                const actions: SuggestedAction[] = Array.isArray(parsed) ? parsed : [parsed];
                                const validActions = actions.filter(a => a.action === 'replace' && a.content);
                                if (validActions.length === 0) return null;
                                return (
                                  <div className="mt-3 space-y-2">
                                    {validActions.map((action, idx) => {
                                      const originalIdx = actions.indexOf(action);
                                      const preview = action.content.slice(0, 60) + (action.content.length > 60 ? '...' : '');
                                      return (
                                      <div key={idx} className="flex items-start gap-2 p-2.5 rounded-lg bg-ink/5 border border-ink/10">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs text-parchment-dim/60 truncate">{preview}</p>
                                          <p className="text-[10px] text-parchment-dim/30 mt-0.5">{action.content.replace(/[\s\p{P}]/gu, '').length} 字</p>
                                        </div>
                                        <button
                                          onClick={() => handleApplyAction(msg.id, action, originalIdx)}
                                          className="shrink-0 px-2.5 py-1 text-[11px] rounded-md bg-ink/20 text-ink hover:bg-ink/30 border border-ink/20 transition-colors"
                                        >
                                          应用
                                        </button>
                                      </div>
                                      );
                                    })}
                                  </div>
                                );
                              } catch { /* ignore parse errors */ }
                              return null;
                            })()}
                          </div>
                        )}
                      </div>
                      <p className={`text-[10px] text-parchment-dim/25 mt-1.5 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Streaming message */}
              {streaming && (
                <div className="flex gap-3 mt-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-study-deep to-study-card border border-study-border flex items-center justify-center text-xs font-bold text-parchment-dim/60">
                    AI
                  </div>
                  <div className="max-w-[75%] min-w-0">
                    <div className="rounded-2xl rounded-tl-md px-4 py-3 bg-study-deep/60 border border-study-border/40">
                      {streamingContent ? (
                        <div className="text-sm text-parchment/90 leading-relaxed prose-chat overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingContent}</ReactMarkdown>
                          <span className="inline-block w-1 h-4 bg-ink/60 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5 py-1">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-ink/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-ink/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-ink/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                          <span className="text-xs text-parchment-dim/40">思考中</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 space-y-2">
        {/* Chapter reference bar */}
        {(referencedChapterId || showRefPanel) && (
          <div className="card !p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-3.5 h-3.5 text-ink/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {referencedChapterId ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-parchment-dim/70 truncate max-w-[180px]">{selectedChapterName}</span>
                    <div className="flex rounded-md overflow-hidden border border-study-border/40 flex-shrink-0">
                      <button
                        onClick={() => setContextMode('chapter')}
                        className={`text-[10px] px-2.5 py-1 transition-colors ${
                          contextMode === 'chapter'
                            ? 'bg-ink/15 text-ink'
                            : 'bg-study-deep text-parchment-dim/40 hover:text-parchment-dim/70'
                        }`}
                      >
                        全章上下文
                      </button>
                      {referencedText && (
                        <button
                          onClick={() => setContextMode('selection')}
                          className={`text-[10px] px-2.5 py-1 transition-colors border-l border-study-border/40 ${
                            contextMode === 'selection'
                              ? 'bg-ink/15 text-ink'
                              : 'bg-study-deep text-parchment-dim/40 hover:text-parchment-dim/70'
                          }`}
                        >
                          仅选段
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <select
                    className="text-xs bg-study-deep border border-study-border/30 rounded-md px-2.5 py-1 text-parchment-dim focus:outline-none focus:border-ink/40"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setReferencedChapterId(e.target.value);
                        setContextMode('chapter');
                      }
                    }}
                  >
                    <option value="">选择要引用的章节...</option>
                    {chapters.map((c) => (
                      <option key={c.id} value={c.id}>第{c.chapter_number}章 {c.title}</option>
                    ))}
                  </select>
                )}
              </div>
              <button
                onClick={clearReference}
                className="text-parchment-dim/30 hover:text-parchment-dim/60 transition-colors flex-shrink-0 p-0.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {contextMode === 'selection' && referencedText && (
              <div className="mt-2.5 pt-2.5 border-t border-study-border/20">
                <p className="text-[10px] text-parchment-dim/30 mb-1">引用选段</p>
                <p className="text-xs text-parchment-dim/60 leading-relaxed line-clamp-3">{referencedText}</p>
              </div>
            )}
          </div>
        )}

        {/* Main input + actions row */}
        <div className="card !p-3">
          <div className="flex gap-2.5 items-end">
            <textarea
              ref={inputRef}
              className="input flex-1 resize-none min-h-[2.5rem] max-h-32 !py-2"
              rows={1}
              placeholder={referencedChapterId ? `关于「${selectedChapterName}」的问题...` : '输入消息… (Enter 发送)'}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
              }}
              onKeyDown={handleKeyDown}
              disabled={streaming}
            />
            {!showRefPanel && !referencedChapterId && chapters.length > 0 && (
              <button
                onClick={() => setShowRefPanel(true)}
                className="!py-2 !px-4 text-sm flex items-center gap-1.5 flex-shrink-0 rounded-lg bg-study-surface border border-study-border text-parchment-dim/70 hover:text-ink hover:border-ink/30 transition-colors"
                title="引用章节上下文"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.44a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
                </svg>
                <span>引用</span>
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!input.trim() || !selectedModel || streaming}
              className="btn-primary !py-2 !px-4 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0 text-sm"
            >
              {streaming ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>生成中</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                  <span>发送</span>
                </>
              )}
            </button>
          </div>

          {/* Quick prompts */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-study-border/20">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.text}
                  onClick={() => handleQuickPrompt(p.text)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-study-deep/50 text-parchment-dim/50 hover:text-ink hover:bg-ink/10 border border-transparent hover:border-ink/15 transition-all"
                >
                  <span className="mr-1">{p.icon}</span>{p.text}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Apply action confirm modal */}
      {pendingApply && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={() => setPendingApply(null)}>
          <div className="card w-full max-w-md mx-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-base font-bold text-parchment mb-3">应用到章节</h3>
            <p className="text-[11px] text-parchment-dim/40 mb-2">以下内容将替换章节正文：</p>
            <div className="bg-study-deep/60 border border-study-border/40 rounded-lg p-3 max-h-40 overflow-y-auto mb-4">
              <p className="text-xs text-parchment-dim/80 leading-relaxed whitespace-pre-wrap">{pendingApply.action.content}</p>
            </div>
            <p className="text-[11px] text-parchment-dim/35 mb-4">
              共 {pendingApply.action.content.replace(/[\s\p{P}]/gu, '').length} 字
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingApply(null)} className="btn-secondary text-sm">取消</button>
              <button onClick={confirmApplyAction} className="btn-primary text-sm">确认应用</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
