import { create } from 'zustand';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  action?: ToastAction;
}

interface UIState {
  toasts: Toast[];

  showToast: (type: Toast['type'], message: string, action?: ToastAction) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  toasts: [],

  showToast: (type, message, action) => {
    const id = crypto.randomUUID();
    const MAX_TOASTS = 5;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, action }].slice(-MAX_TOASTS),
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, action ? 8000 : 3000);
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
