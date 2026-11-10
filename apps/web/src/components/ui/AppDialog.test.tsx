import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOpenDialogs } from "@/stores/dialogs";
import { notify, useToastStore } from "@/stores/toasts";
import { AppDialog, type AppDialogSize } from "./AppDialog";
import { Toaster } from "./Toaster";

afterEach(() => {
  cleanup();
  act(() => useToastStore.getState().clear());
  act(() => useOpenDialogs.setState({ count: 0 }));
});

const overlay = () => document.querySelector<HTMLElement>("[data-slot=dialog-overlay]")!;
const dialog = () => screen.getByRole("dialog");

describe("AppDialog", () => {
  it.each<[AppDialogSize, string]>([
    ["sm", "max-w-[400px]"],
    ["md", "max-w-[520px]"],
    ["lg", "max-w-[720px]"],
    ["xl", "max-w-[960px]"],
    ["full", "h-dvh"],
  ])("size %s sets its width/height class", (size, cls) => {
    render(<AppDialog open onClose={() => {}} title="T" size={size} />);
    expect(dialog().getAttribute("data-size")).toBe(size);
    expect(dialog().className).toContain(cls);
  });

  it("defaults to md, caps height with dvh, pins header/footer and scrolls only the body", () => {
    render(
      <AppDialog open onClose={() => {}} title="Post a shift" description="For Sunrise" footer={<button>Save</button>}>
        <p>Body</p>
      </AppDialog>,
    );
    expect(dialog().getAttribute("data-size")).toBe("md");
    expect(dialog().className).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
    expect(dialog().className).toContain("max-[719px]:max-h-[92dvh]");
    expect(dialog().className).toContain("overflow-hidden");
    const body = screen.getByText("Body").parentElement!;
    expect(body.className).toContain("overflow-y-auto");
    expect(body.className).toContain("overflow-x-hidden");
    // Footer sits after the body and is not inside the scroller.
    const foot = screen.getByRole("button", { name: "Save" }).parentElement!;
    expect(foot.className).toContain("shrink-0");
    expect(body.contains(foot)).toBe(false);
    expect(dialog().getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog().getAttribute("aria-describedby")).toBeTruthy();
  });

  it("without a description it does not point aria-describedby at a missing node", () => {
    render(<AppDialog open onClose={() => {}} title="T" />);
    expect(dialog().hasAttribute("aria-describedby")).toBe(false);
  });

  it("mounts content only while open", async () => {
    const { rerender } = render(
      <AppDialog open onClose={() => {}} title="T" testId="dlg">
        <i data-testid="inner" />
      </AppDialog>,
    );
    expect(screen.getAllByTestId("inner")).toHaveLength(1);
    expect(screen.getByTestId("dlg")).toBeTruthy();
    rerender(
      <AppDialog open={false} onClose={() => {}} title="T" testId="dlg">
        <i data-testid="inner" />
      </AppDialog>,
    );
    await waitFor(() => expect(screen.queryByTestId("inner")).toBeNull());
  });

  it("X button, Esc and overlay click all call onClose", async () => {
    const onClose = vi.fn();
    render(<AppDialog open onClose={onClose} title="T" />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    // Radix arms outside-click detection on the next tick, and dismisses on pointerdown + click (a real press).
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.pointerDown(overlay());
    fireEvent.click(overlay());
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("a click inside does not close", async () => {
    const onClose = vi.fn();
    render(
      <AppDialog open onClose={onClose} title="T">
        <p>Body</p>
      </AppDialog>,
    );
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.pointerDown(screen.getByText("Body"));
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("blockClose ignores Esc, overlay and X (upload in flight)", async () => {
    const onClose = vi.fn();
    render(<AppDialog open blockClose onClose={onClose} title="T" />);
    await new Promise((r) => setTimeout(r, 10));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.pointerDown(overlay());
    fireEvent.click(overlay());
    const x = screen.getByRole("button", { name: "Close" }) as HTMLButtonElement;
    expect(x.disabled).toBe(true);
    fireEvent.click(x);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
  });

  it("moves focus inside, traps it, and returns it to the opener on close", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <AppDialog open={open} onClose={() => setOpen(false)} title="T" footer={<button>Save</button>} />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole("dialog");
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));
    // Tab from the last control wraps inside the dialog (focus guards), never to the page behind.
    expect(document.querySelector("[data-radix-focus-guard]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Radix restores focus on the next tick.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("shows a toast once, inside the dialog, while the page Toaster yields (notification-banner is unique)", async () => {
    const { rerender } = render(
      <>
        <Toaster />
        <AppDialog open onClose={() => {}} title="T" />
      </>,
    );
    act(() => void notify.error("Could not save"));
    expect(screen.getAllByTestId("notification-banner")).toHaveLength(1);
    expect(dialog().contains(screen.getByTestId("notification-banner"))).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Could not save");

    rerender(
      <>
        <Toaster />
        <AppDialog open={false} onClose={() => {}} title="T" />
      </>,
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Closed: the page Toaster takes over, still exactly one banner.
    await waitFor(() => expect(screen.getAllByTestId("notification-banner")).toHaveLength(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
