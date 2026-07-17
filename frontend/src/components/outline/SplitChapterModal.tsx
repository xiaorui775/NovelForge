import { useState } from 'react';

/**
 * 拆分章节弹窗：选在第几段之后拆分，前半段留当前章、后半段成新章。
 * 从 OutlineManager 抽出。
 */
interface Props {
  chapterOutlineId: string;
  onConfirm: (chapterOutlineId: string, position: number) => void;
  onClose: () => void;
}

export default function SplitChapterModal({ chapterOutlineId, onConfirm, onClose }: Props) {
  const [position, setPosition] = useState(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="card border border-ink/20 w-96" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-semibold text-parchment mb-3">拆分章节</h3>
        <p className="text-sm text-parchment-dim/60 mb-3">在第几段之后拆分？前半段留在当前章节，后半段成为新章节。</p>
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-parchment-dim/70">拆分位置</label>
          <input
            type="number"
            className="input w-24 text-sm py-2"
            min={1}
            value={position}
            onChange={(e) => setPosition(parseInt(e.target.value) || 1)}
          />
          <span className="text-xs text-parchment-dim/40">段之后</span>
        </div>
        <div className="flex gap-3">
          <button onClick={() => onConfirm(chapterOutlineId, position)} className="btn-primary text-sm">确认拆分</button>
          <button onClick={onClose} className="btn-ghost text-sm">取消</button>
        </div>
      </div>
    </div>
  );
}
