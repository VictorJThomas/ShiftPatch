import { create } from "zustand";

/**
 * Open modal `<dialog>`s, oldest first. A modal dialog makes the rest of the page inert (no clicks, no live-region
 * announcements), so while one is open the Toaster renders inside it instead of in the page (see `Toaster`).
 * Dialogs can stack (details + a nested dialog on top): only the TOP one (`stack.at(-1)`) renders the inline Toaster,
 * so a toast yields one `notification-banner` and one live-region announcement.
 */
export const useOpenDialogs = create<{ count: number; stack: string[] }>()(() => ({ count: 0, stack: [] }));

export const dialogOpened = (id: string) =>
  useOpenDialogs.setState((s) => ({ count: s.stack.length + 1, stack: [...s.stack.filter((x) => x !== id), id] }));
export const dialogClosed = (id: string) =>
  useOpenDialogs.setState((s) => {
    const stack = s.stack.filter((x) => x !== id);
    return { count: stack.length, stack };
  });
