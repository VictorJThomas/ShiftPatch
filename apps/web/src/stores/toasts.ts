import { create } from "zustand";

export type ToastKind = "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  // An identical banner replaces the previous one instead of stacking (e.g. repeated failed sign-ins).
  push: (toast) => {
    const id = nextId++;
    set((s) => ({
      toasts: [...s.toasts.filter((t) => !(t.kind === toast.kind && t.title === toast.title && t.message === toast.message)), { ...toast, id }],
    }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export const notify = {
  success: (title: string, message?: string) => useToastStore.getState().push({ kind: "success", title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ kind: "error", title, message }),
};
