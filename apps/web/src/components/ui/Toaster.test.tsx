import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOpenDialogs } from "@/stores/dialogs";
import { notify, useToastStore } from "@/stores/toasts";
import { Toaster } from "./Toaster";

afterEach(() => {
  cleanup();
  act(() => useToastStore.getState().clear());
  act(() => useOpenDialogs.setState({ count: 0 }));
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("dismisses a success toast 5 s after it appeared, even when another toast is pushed meanwhile", () => {
    vi.useFakeTimers();
    const { container } = render(<Toaster />);
    act(() => void notify.success("Shift claimed"));
    act(() => void vi.advanceTimersByTime(4000));
    act(() => void notify.success("Shift released"));
    expect(container.querySelectorAll(".banner")).toHaveLength(2);
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

  it("puts notification-banner on the newest toast only, so strict locators find exactly one", () => {
    render(<Toaster />);
    act(() => void notify.success("Shift claimed"));
    act(() => void notify.error("Credential expired, cannot claim shift"));
    const banners = screen.getAllByTestId("notification-banner");
    expect(banners).toHaveLength(1);
    expect(banners[0]?.textContent).toContain("Credential expired, cannot claim shift");
    expect(screen.getByText("Shift claimed")).toBeTruthy(); // the older one is still visible
  });

  it("yields to the inline Toaster while a modal dialog is open (the page is inert behind it)", () => {
    const { container } = render(
      <>
        <Toaster />
        <div data-dialog>
          <Toaster inline />
        </div>
      </>,
    );
    act(() => useOpenDialogs.setState({ count: 1 }));
    act(() => void notify.error("File is larger than 10 MB"));
    const banner = screen.getByTestId("notification-banner");
    expect(container.querySelector("[data-dialog]")?.contains(banner)).toBe(true);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    act(() => useOpenDialogs.setState({ count: 0 }));
    expect(container.querySelector("[data-dialog]")?.contains(screen.getAllByTestId("notification-banner")[0]!)).toBe(false);
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
