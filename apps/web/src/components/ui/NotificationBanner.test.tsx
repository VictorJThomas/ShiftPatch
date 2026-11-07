import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationBanner } from "./NotificationBanner";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NotificationBanner", () => {
  it("success is a polite status and auto-dismisses after 5 s", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<NotificationBanner kind="success" title="Shift claimed" onDismiss={onDismiss} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByTestId("notification-banner")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(4999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("error is an alert and persists until dismissed", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<NotificationBanner kind="error" title="Invalid email or password" message="Check your details." onDismiss={onDismiss} />);
    expect(screen.getByRole("alert").textContent).toContain("Invalid email or password");
    act(() => void vi.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("inline variant has no close button and never auto-dismisses", () => {
    render(<NotificationBanner kind="error" title="Heads up" toast={false} />);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
});
