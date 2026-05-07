import { useState } from 'react';
import { outlinesApi } from '../../api/outlines';
import { useUIStore } from '../../stores/uiStore';

interface ChapterMemo {
  task: string;
  must_payoff: string;
  prohibitions: string;
}

function parseMemo(raw: string | null): ChapterMemo {
  if (!raw) return { task: '', must_payoff: '', prohibitions: '' };
  try {
    const parsed = JSON.parse(raw);
    return {
      task: parsed.task || '',
      must_payoff: parsed.must_payoff || '',
      prohibitions: parsed.prohibitions || '',
    };
  } catch {
    return { task: '', must_payoff: '', prohibitions: '' };
  }
}

interface Props {
  chapterOutlineId: string;
  initialMemo: string | null;
}

export default function ChapterMemoEditor({ chapterOutlineId, initialMemo }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [memo, setMemo] = useState<ChapterMemo>(() => parseMemo(initialMemo));
  const [saving, setSaving] = useState(false);
  const { showToast } = useUIStore();

  const hasContent = memo.task || memo.must_payoff || memo.prohibitions;

  const handleSave = async () => {
    setSaving(true);
    try {
      await outlinesApi.updateChapter(chapterOutlineId, {
        chapter_memo: JSON.stringify(memo),
      });
      showToast('success', '备忘录已保存');
    } catch {
      showToast('error', '保存失败');
    }
    setSaving(false);
  };

  return (
    <details className="mt-3" open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
      <summary className="text-[11px] text-ink/40 cursor-pointer hover:text-ink/60 transition-colors flex items-center gap-1.5">
        <span>章节备忘录</span>
        {hasContent && !expanded && (
          <span className="w-1.5 h-1.5 rounded-full bg-ink/40" />
        )}
      </summary>
      <div className="mt-2 space-y-2">
        <div>
          <label className="block text-[10px] text-parchment-dim/40 uppercase tracking-wider mb-1">本章任务</label>
          <textarea
            className="w-full text-xs text-parchment-dim/70 bg-study-surface/50 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ink/20 border border-study-border/20"
            rows={2}
            placeholder="本章必须完成的具体动作..."
            value={memo.task}
            onChange={(e) => setMemo({ ...memo, task: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] text-parchment-dim/40 uppercase tracking-wider mb-1">必须兑现的伏笔</label>
          <textarea
            className="w-full text-xs text-parchment-dim/70 bg-study-surface/50 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ink/20 border border-study-border/20"
            rows={2}
            placeholder="本章需要回收或推进的伏笔..."
            value={memo.must_payoff}
            onChange={(e) => setMemo({ ...memo, must_payoff: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] text-parchment-dim/40 uppercase tracking-wider mb-1">禁止事项</label>
          <textarea
            className="w-full text-xs text-parchment-dim/70 bg-study-surface/50 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ink/20 border border-study-border/20"
            rows={2}
            placeholder="本章绝对不能出现的内容..."
            value={memo.prohibitions}
            onChange={(e) => setMemo({ ...memo, prohibitions: e.target.value })}
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-[11px] text-ink hover:underline disabled:text-parchment-dim/30"
        >
          {saving ? '保存中...' : '保存备忘录'}
        </button>
      </div>
    </details>
  );
}
