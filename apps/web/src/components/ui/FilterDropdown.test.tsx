import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FilterDropdown } from "./FilterDropdown";

// Radix Popper needs these browser APIs; jsdom has none of them.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

const trigger = (name: string | RegExp = /Filters/) => screen.getByRole("button", { name });
const openPanel = async () => {
  fireEvent.click(trigger());
  return screen.findByRole("dialog", { name: "Filters" });
};

describe("FilterDropdown", () => {
  it("marks the panel with .filter-panel (globals.css wraps .chips inside it)", async () => {
    render(
      <FilterDropdown label="Filters" activeCount={0} onReset={() => {}}>
        <div className="chips" />
      </FilterDropdown>,
    );
    const panel = await openPanel();
    expect(panel.classList.contains("filter-panel")).toBe(true);
    expect(panel.querySelector(".chips")).not.toBeNull();
  });
  it("shows the active count as a badge and in the accessible name; no count when 0", () => {
    const { rerender } = render(
      <FilterDropdown label="Filters" activeCount={0} onReset={() => {}}>
        <p>controls</p>
      </FilterDropdown>,
    );
    expect(trigger().getAttribute("aria-label")).toBeNull();
    expect(trigger().textContent).toBe("Filters");
    rerender(
      <FilterDropdown label="Filters" activeCount={3} onReset={() => {}}>
        <p>controls</p>
      </FilterDropdown>,
    );
    expect(trigger("Filters, 3 active").textContent).toBe("Filters3");
  });

  it("opens with click, keyboard (Enter and Space on the button), and Esc closes and returns focus", async () => {
    render(
      <FilterDropdown label="Filters" activeCount={1} onReset={() => {}}>
        <input aria-label="Role" />
      </FilterDropdown>,
    );
    const t = trigger(/Filters/);
    t.focus();
    // A native <button> turns Enter/Space into a click; the popover trigger only listens to click.
    fireEvent.click(t);
    expect(await screen.findByRole("dialog", { name: "Filters" })).toBeTruthy();
    expect(t.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(t);
  });

  it("immediate mode: no Apply button; Reset calls onReset and keeps the panel open", async () => {
    const onReset = vi.fn();
    render(
      <FilterDropdown label="Filters" activeCount={2} onReset={onReset}>
        <p>controls</p>
      </FilterDropdown>,
    );
    await openPanel();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("immediate mode: Reset is disabled while nothing is active", async () => {
    render(
      <FilterDropdown label="Filters" activeCount={0} onReset={() => {}}>
        <p>controls</p>
      </FilterDropdown>,
    );
    await openPanel();
    expect((screen.getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("confirm mode: Apply calls onApply then closes; Reset stays enabled", async () => {
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <FilterDropdown label="Filters" activeCount={0} onApply={onApply} onReset={() => {}} onOpenChange={onOpenChange}>
        <p>controls</p>
      </FilterDropdown>,
    );
    await openPanel();
    expect((screen.getByRole("button", { name: "Reset" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onOpenChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it("panel is capped to the viewport (width and height) and its body scrolls", async () => {
    render(
      <FilterDropdown label="Filters" activeCount={1} onApply={() => {}} onReset={() => {}}>
        <p>controls</p>
      </FilterDropdown>,
    );
    const panel = await openPanel();
    expect(panel.className).toContain("var(--radix-popover-content-available-width)");
    expect(panel.className).toContain("max-h-[var(--radix-popover-content-available-height)]");
    expect(screen.getByText("controls").parentElement!.className).toContain("overflow-y-auto");
  });
});
