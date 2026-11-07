import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ChipGroup } from "./ChipGroup";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import { Field, Select } from "./Field";
import { StatusBadge } from "./StatusBadge";

// jsdom has no showModal/close; the browser provides them (plus focus trap and Esc).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Claim this shift?" description="It is yours right away.">
        <p>Body</p>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("opens modal, is labelled by its title, and returns focus on close", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Claim this shift?" });
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Esc (cancel) and backdrop click close; clicks inside do not", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByText("Body"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ConfirmDialog", () => {
  it("confirms, and while pending is busy and cannot be dismissed", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<ConfirmDialog open title="Cancel this shift?" confirmLabel="Cancel shift" tone="danger" confirmTestId="x-confirm" onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("x-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    rerender(<ConfirmDialog open pending title="Cancel this shift?" confirmLabel="Cancel shift" tone="danger" confirmTestId="x-confirm" onConfirm={onConfirm} onClose={onClose} />);
    const confirm = screen.getByTestId("x-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Field", () => {
  it("wires label, hint and error to the control", () => {
    render(
      <Field label="Role" hint="RN, LPN or CNA" error="Pick a role">
        {(p) => (
          <Select {...p} defaultValue="">
            <option value="">Select a role</option>
          </Select>
        )}
      </Field>,
    );
    const select = screen.getByLabelText("Role");
    expect(select.tagName).toBe("SELECT");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    const described = (select.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(["RN, LPN or CNA", "Pick a role"]);
    expect(select.parentElement?.className).toContain("err");
  });
});

describe("StatusBadge + ChipGroup", () => {
  it("badge has label text and test id; chips expose aria-pressed", () => {
    const onChange = vi.fn();
    render(
      <>
        <StatusBadge status="cancelled" testId="admin-shift-status-badge" />
        <ChipGroup label="Status" value="all" onChange={onChange} options={[{ value: "all", label: "All", count: 3 }, { value: "open", label: "Open" }]} />
      </>,
    );
    expect(screen.getByTestId("admin-shift-status-badge").textContent).toBe("Cancelled");
    expect(screen.getByRole("button", { name: "All 3" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onChange).toHaveBeenCalledWith("open");
  });
});
