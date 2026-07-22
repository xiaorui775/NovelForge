import type { ReactNode } from 'react';

interface SidePanelModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** 内容区最大宽度 tailwind class，按面板规模选择。 */
  maxWidth?: string;
  /** 右上角自定义操作（如一致性检查的"开始检查"按钮）。 */
  headerActions?: ReactNode;
  children: ReactNode;
}

export default function SidePanelModal({
  open,
  title,
  subtitle,
  onClose,
  maxWidth = 'max-w-2xl',
  headerActions,
  children,
}: SidePanelModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-16 pb-10 overflow-y-auto animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`card w-full ${maxWidth} mx-4 flex flex-col max-h-[75vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-study-border/40">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-parchment truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-parchment-dim/45 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {headerActions}
            <button
              onClick={onClose}
              className="text-parchment-dim/40 hover:text-ink transition-colors"
              title="关闭 (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
