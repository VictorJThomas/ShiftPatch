import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Button, buttonVariants } from "./button";

afterEach(cleanup);

describe("Button", () => {
  it("defaults to type=button and passes data-testid through", () => {
    render(<Button data-testid="b">Go</Button>);
    const b = screen.getByTestId("b");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("data-slot")).toBe("button");
  });
  it("loading disables and sets aria-busy", () => {
    render(<Button loading>Save</Button>);
    const b = screen.getByRole("button") as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
  });
  it("asChild renders the child element with button classes", () => {
    render(<Button asChild><a href="/x">Link</a></Button>);
    expect(screen.getByRole("link").className).toContain("inline-flex");
  });
});

describe("buttonVariants touch targets (QA-011)", () => {
  it("size sm keeps a 44px min height and only compacts for fine pointers on wide screens", () => {
    const cls = buttonVariants({ size: "sm" }).split(" ");
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("lg:pointer-fine:min-h-9");
    expect(cls).not.toContain("min-h-9");
  });
  it("size icon is 44px", () => {
    expect(buttonVariants({ size: "icon" })).toContain("size-11");
  });
});
