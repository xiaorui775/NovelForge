import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chaptersApi, SSEEvent } from '../../api/chapters';

interface SelectionToolbarProps {
  chapterId: string;
  modelId: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onApplyRewrite: (start: number, end: number, newText: string) => void;
  generating: boolean;
  temperature?: number;
  topP?: number;
}

const PRESET_INSTRUCTIONS = [
  { label: '润色', icon: '✨', instruction: '润色这段文字，提升文笔质量，保持原意不变' },
  { label: '缩短', icon: '📐', instruction: '精简这段文字，去除冗余，保留核心信息' },
  { label: '扩写', icon: '📝', instruction: '扩写这段文字，增加细节描写和情感表达' },
  { label: '换风格', icon: '🎨', instruction: '用更文学化的风格改写这段文字' },
  { label: '加描写', icon: '🌄', instruction: '为这段文字增加环境或心理描写' },
  { label: '加对话', icon: '💬', instruction: '将这段叙述改写为对话形式，增加角色互动' },
];

export default function SelectionToolbar({
  chapterId,
  modelId,
  textareaRef,
  content,
  onApplyRewrite,
  generating,
  temperature,
  topP,
}: SelectionToolbarProps) {
  const navigate = useNavigate();
  const { id: projectId } = useParams<{ id: string }>();
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [rewriting, setRewriting] = useState(false);
  const [rewrittenText, setRewrittenText] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Detect text selection
  const handleSelectionChange = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || generating || rewriting) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start !== end && end - start >= 5) {
      const selectedText = content.substring(start, end);
      setSelection({ start, end, text: selectedText });

      // Calculate position near the selection
      // We use a simple heuristic: position near the cursor area
      const rect = textarea.getBoundingClientRect();
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 24;
      const textBefore = content.substring(0, start);
      const linesBefore = textBefore.split('\n').length - 1;
      const topOffset = Math.min(linesBefore * lineHeight - textarea.scrollTop, rect.height - 200);

      setPosition({
        top: rect.top + topOffset + lineHeight,
        left: rect.left + rect.width / 2,
      });
      setShowToolbar(true);
      setRewrittenText('');
      setShowCustomInput(false);
    } else {
      // Don't hide if we're interacting with the toolbar
      if (!toolbarRef.current?.contains(document.activeElement)) {
        setShowToolbar(false);
        setSelection(null);
      }
    }
  }, [textareaRef, content, generating, rewriting]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  // Close toolbar on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        // Check if click is in textarea (user might be making new selection)
        if (textareaRef.current?.contains(e.target as Node)) return;
        setShowToolbar(false);
        setSelection(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [textareaRef]);

  const handleRewrite = (instruction: string) => {
    if (!selection || !modelId) return;

    setRewriting(true);
    setRewrittenText('');

    // Get context (500 chars before and after)
    const contextBefore = content.substring(Math.max(0, selection.start - 500), selection.start);
    const contextAfter = content.substring(selection.end, Math.min(content.length, selection.end + 500));

    abortRef.current = chaptersApi.rewriteSelection(
      chapterId,
      {
        model_id: modelId,
        selected_text: selection.text,
        instruction,
        context_before: contextBefore,
        context_after: contextAfter,
        temperature: temperature ?? undefined,
        top_p: topP ?? undefined,
      },
      (event: SSEEvent) => {
        if (event.type === 'token' && event.content) {
          setRewrittenText((prev) => prev + event.content);
        } else if (event.type === 'done') {
          setRewriting(false);
        } else if (event.type === 'error') {
          setRewriting(false);
          setRewrittenText(`错误: ${event.message}`);
        }
      },
    );
  };

  const handleApply = () => {
    if (!selection || !rewrittenText || rewrittenText.startsWith('错误:')) return;
    onApplyRewrite(selection.start, selection.end, rewrittenText);
    setShowToolbar(false);
    setSelection(null);
    setRewrittenText('');
  };

  const handleDiscard = () => {
    abortRef.current?.abort();
    setRewriting(false);
    setRewrittenText('');
    setShowCustomInput(false);
    setCustomInstruction('');
  };

  const handleClose = () => {
    abortRef.current?.abort();
    setShowToolbar(false);
    setSelection(null);
    setRewrittenText('');
    setRewriting(false);
    setShowCustomInput(false);
    setCustomInstruction('');
  };

  const handleAskAI = () => {
    if (!selection || !projectId) return;
    const params = new URLSearchParams({
      chapterId: chapterId || '',
      selectedText: selection.text,
    });
    navigate(`/projects/${projectId}/chat?${params.toString()}`);
  };

  if (!showToolbar || !selection) return null;

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 animate-fade-in"
      style={{
        top: `${Math.max(8, position.top)}px`,
        left: `${Math.min(position.left, window.innerWidth - 320)}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="bg-study-card border border-study-border/50 rounded-xl shadow-2xl shadow-black/40 p-3 w-[300px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-parchment-dim/50">
            已选 {selection.text.length} 字
          </span>
          <button
            onClick={handleClose}
            className="text-parchment-dim/30 hover:text-parchment-dim/60 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview area */}
        {rewrittenText && (
          <div className="mb-3 max-h-40 overflow-y-auto">
            <div
              className={`text-xs leading-relaxed whitespace-pre-wrap p-2 rounded-lg ${
                rewrittenText.startsWith('错误:')
                  ? 'bg-red-900/20 text-red-400'
                  : 'bg-ink/10 text-parchment-dim'
              }`}
            >
              {rewrittenText}
            </div>
          </div>
        )}

        {/* Action buttons for preview */}
        {rewrittenText && !rewriting && !rewrittenText.startsWith('错误:') && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleApply}
              className="flex-1 text-xs px-3 py-1.5 bg-ink text-parchment rounded-lg hover:bg-ink/80 transition-colors"
            >
              应用改写
            </button>
            <button
              onClick={handleDiscard}
              className="flex-1 text-xs px-3 py-1.5 bg-study-deep text-parchment-dim/60 rounded-lg hover:text-parchment transition-colors"
            >
              放弃
            </button>
          </div>
        )}

        {/* Loading indicator */}
        {rewriting && (
          <div className="flex items-center gap-2 mb-3 text-ink/60">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-xs">AI 改写中...</span>
            <button
              onClick={() => { abortRef.current?.abort(); setRewriting(false); }}
              className="ml-auto text-[10px] text-parchment-dim/40 hover:text-red-400 transition-colors"
            >
              停止
            </button>
          </div>
        )}

        {/* Preset options */}
        {!rewrittenText && !showCustomInput && (
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {PRESET_INSTRUCTIONS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleRewrite(preset.instruction)}
                disabled={rewriting}
                className="flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-study-deep/80 text-parchment-dim/60 hover:text-parchment hover:bg-study-glow transition-all disabled:opacity-40"
              >
                <span>{preset.icon}</span>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Ask AI - navigate to chat with context */}
        {!rewrittenText && !showCustomInput && (
          <button
            onClick={handleAskAI}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] px-2 py-2 rounded-lg bg-ink/10 text-ink/70 hover:bg-ink/20 hover:text-ink transition-all mb-2 border border-ink/10"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
            问 AI
          </button>
        )}

        {/* Custom instruction input */}
        {!rewrittenText && (
          <>
            {showCustomInput ? (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customInstruction.trim()) {
                      handleRewrite(customInstruction.trim());
                    }
                  }}
                  placeholder="输入改写指令..."
                  autoFocus
                  className="flex-1 text-xs bg-study-deep border border-study-border/30 rounded-lg px-2.5 py-1.5 text-parchment-dim placeholder:text-parchment-dim/30 focus:outline-none focus:border-ink/40"
                />
                <button
                  onClick={() => {
                    if (customInstruction.trim()) handleRewrite(customInstruction.trim());
                  }}
                  disabled={!customInstruction.trim() || rewriting}
                  className="text-xs px-2.5 py-1.5 bg-ink text-parchment rounded-lg hover:bg-ink/80 transition-colors disabled:opacity-40"
                >
                  改写
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomInput(true)}
                className="w-full text-[11px] text-parchment-dim/40 hover:text-ink/60 transition-colors py-1"
              >
                自定义指令...
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
