import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { notify, useToastStore } from "@/stores/toasts";
import { Toaster } from "./Toaster";

afterEach(() => {
  cleanup();
  act(() => useToastStore.getState().clear());
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("dismisses a success toast 5 s after it appeared, even when another toast is pushed meanwhile", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => void notify.success("Shift claimed"));
    act(() => void vi.advanceTimersByTime(4000));
    act(() => void notify.success("Shift released"));
    expect(screen.getAllByTestId("notification-banner")).toHaveLength(2);
    act(() => void vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Shift claimed")).toBeNull();
    expect(screen.getByText("Shift released")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(4000));
    expect(screen.queryByTestId("notification-banner")).toBeNull();
  });

  it("keeps one persistent polite region that announces success once; errors stay alerts (QA-003)", () => {
    render(<Toaster />);
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
    act(() => void notify.success("Shift claimed", "RN · Fri, Oct 2"));
    // Same node as before content arrived, and the only status on the page (the visible banner has no role).
    expect(screen.getAllByRole("status")).toEqual([region]);
    expect(region.textContent).toBe("Success: Shift claimed. RN · Fri, Oct 2");
    act(() => void notify.error("Credential expired, cannot claim shift"));
    expect(screen.getByRole("alert").textContent).toContain("Credential expired, cannot claim shift");
    expect(region.textContent).toBe("Success: Shift claimed. RN · Fri, Oct 2");
  });

  it("keeps a success toast's timer running when another toast is dismissed", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    let errId = 0;
    act(() => {
      errId = notify.error("Could not load shifts");
      notify.success("Shift claimed");
    });
    act(() => void vi.advanceTimersByTime(3000));
    act(() => useToastStore.getState().dismiss(errId));
    act(() => void vi.advanceTimersByTime(2001));
    expect(screen.queryByText("Shift claimed")).toBeNull();
  });
});
