import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar, FilterGroup } from "./FilterBar";
import { SearchInput } from "./SearchInput";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const options = [
  { value: "all", label: "All", count: 4 },
  { value: "open", label: "Open", count: 0 },
];

describe("FilterBar", () => {
  it("renders labelled groups; zero-count chips are dimmed (data-zero) but still operable", () => {
    const onChange = vi.fn();
    render(
      <FilterBar>
        <FilterGroup label="Status" value="all" onChange={onChange} options={options} />
        <FilterGroup label="Role" value="all" onChange={() => {}} options={options} />
      </FilterBar>,
    );
    expect(screen.getByRole("group", { name: "Filters" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Status" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Role" })).toBeTruthy();
    const [open] = screen.getAllByRole("button", { name: "Open 0" });
    expect(open!.hasAttribute("data-zero")).toBe(true);
    expect((open as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(open!);
    expect(onChange).toHaveBeenCalledWith("open");
  });
});

describe("SearchInput", () => {
  it("debounces onChange and clears with Esc", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput label="Search shifts" value="" onChange={onChange} delay={300} />);
    const input = screen.getByLabelText("Search shifts");
    fireEvent.change(input, { target: { value: "ma" } });
    fireEvent.change(input, { target: { value: "mar" } });
    expect(onChange).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("mar");
    fireEvent.keyDown(input, { key: "Escape" });
    act(() => void vi.advanceTimersByTime(0));
    expect(onChange).toHaveBeenLastCalledWith("");
  });
});
