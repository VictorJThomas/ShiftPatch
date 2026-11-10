import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notify, useToastStore } from "@/stores/toasts";
import { AppDialog } from "./AppDialog";
import { Toaster } from "./Toaster";

afterEach(() => {
  cleanup();
  act(() => useToastStore.getState().clear());
  vi.useRealTimers();
});

function Stack({ top = true, bottom = true }: { top?: boolean; bottom?: boolean }) {
  return (
    <>
      <Toaster />
      <AppDialog open={bottom} onClose={() => {}} title="Shift details" testId="bottom" />
      <AppDialog open={top} onClose={() => {}} title="Nurse" testId="top" />
    </>
  );
}

const liveText = () =>
  screen
    .getAllByRole("status", { hidden: true })
    .map((r) => r.textContent)
    .filter(Boolean);

describe("stacked AppDialogs and toasts", () => {
  it("renders exactly one banner and one announcement, in the top dialog", () => {
    render(<Stack />);
    act(() => void notify.success("Saved"));
    const banners = screen.getAllByTestId("notification-banner");
    expect(banners).toHaveLength(1);
    expect(within(screen.getByTestId("top")).getByTestId("notification-banner")).toBe(banners[0]);
    expect(liveText()).toEqual(["Success: Saved"]);
  });

  it("moves the toast back to the lower dialog when the top one closes", () => {
    const { rerender } = render(<Stack />);
    act(() => void notify.success("Saved"));
    rerender(<Stack top={false} />);
    expect(screen.getAllByTestId("notification-banner")).toHaveLength(1);
    expect(within(screen.getByTestId("bottom")).getByTestId("notification-banner")).toBeTruthy();
    // The top dialog already announced it; the lower one must not announce it again.
    expect(liveText()).toEqual([]);
  });

  it("does not re-announce a toast on the page Toaster after the dialogs close", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Stack />);
    act(() => void notify.success("Saved"));
    expect(liveText()).toEqual(["Success: Saved"]);
    rerender(<Stack top={false} bottom={false} />);
    // Only the page Toaster remains: its live region must stay empty (the dialog already announced it).
    expect(screen.getByRole("status", { hidden: true }).textContent).toBe("");
    // The banner itself is still visible inside its 5 s window.
    expect(screen.getAllByTestId("notification-banner")).toHaveLength(1);
  });
});
