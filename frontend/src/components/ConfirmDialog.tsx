import { useState, useCallback, useRef } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: (value: boolean) => void;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<(value: boolean) => void>();

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ ...options, open: true, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    setState(null);
  }, []);

  const handleCancel = useCallback(() => {
    resolveRef.current?.(false);
    setState(null);
  }, []);

  const Dialog = state?.open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in"
      onClick={handleCancel}
    >
      <div
        className="card w-full max-w-sm mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {state.title && (
          <h3 className="font-display text-lg font-bold text-parchment mb-2">{state.title}</h3>
        )}
        <p className="text-sm text-parchment-dim/70 leading-relaxed mb-6">{state.message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={handleCancel} className="btn-secondary text-sm">
            {state.cancelText || '取消'}
          </button>
          <button
            onClick={handleConfirm}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-all ${
              state.variant === 'danger'
                ? 'bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30'
                : 'btn-primary'
            }`}
          >
            {state.confirmText || '确认'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, Dialog };
}
