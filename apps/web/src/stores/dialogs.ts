import { create } from "zustand";

/**
 * How many modal `<dialog>`s are open. A modal dialog makes the rest of the page inert (no clicks, no live-region
 * announcements), so while one is open the Toaster renders inside it instead of in the page (see `Toaster`).
 */
export const useOpenDialogs = create<{ count: number }>()(() => ({ count: 0 }));

export const dialogOpened = () => useOpenDialogs.setState((s) => ({ count: s.count + 1 }));
export const dialogClosed = () => useOpenDialogs.setState((s) => ({ count: Math.max(0, s.count - 1) }));
