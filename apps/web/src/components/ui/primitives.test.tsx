import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChipGroup } from "./ChipGroup";
import { ConfirmDialog } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import { Field, Select } from "./Field";
import { StatusBadge } from "./StatusBadge";

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

// Dialog is a thin wrapper over AppDialog (Radix); AppDialog.test.tsx covers sizes, close paths and focus.
describe("Dialog (compat wrapper)", () => {
  it("opens modal, is labelled by its title, and returns focus on close", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Claim this shift?" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.getAttribute("data-size")).toBe("md");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("maps the deprecated variant to a size", async () => {
    render(<Dialog open onClose={() => {}} title="Wide" variant="panel" />);
    expect((await screen.findByRole("dialog")).getAttribute("data-size")).toBe("lg");
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
    expect(select.className).toContain("aria-invalid:border-destructive");
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
