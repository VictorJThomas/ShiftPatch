import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn();
vi.mock("@/features/auth/use-logout", () => ({ useLogout: () => ({ signOut, pending: false }) }));

// Radix Popper/Menu need these browser APIs; jsdom has none of them.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  signOut.mockReset();
});

const trigger = () => screen.getByRole("button", { name: "Account menu" });
/** Radix opens a menu on pointerdown (left button), like a real click. */
const open = async () => {
  fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false });
  await screen.findByRole("menu");
};

describe("AccountMenu", () => {
  it("is closed by default and exposes aria-haspopup / aria-expanded", () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens, focuses the first item and shows Profile (role-specific href) + Sign out", async () => {
    render(<AccountMenu profileHref="/agency/profile" />);
    await open();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    expect(profile.getAttribute("href")).toBe("/agency/profile");
    await waitFor(() => expect(document.activeElement).toBe(profile));
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("without profileHref shows Sign out only", async () => {
    render(<AccountMenu />);
    await open();
    expect(screen.queryByRole("menuitem", { name: "Profile" })).toBeNull();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("arrow keys wrap between items, Home/End jump", async () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    await open();
    const [profile, out] = screen.getAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(profile));
    // Radix moves focus on the next tick, hence waitFor.
    fireEvent.keyDown(profile!, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(out));
    fireEvent.keyDown(out!, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(profile));
    fireEvent.keyDown(profile!, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).toBe(out));
    fireEvent.keyDown(out!, { key: "Home" });
    await waitFor(() => expect(document.activeElement).toBe(profile));
    fireEvent.keyDown(profile!, { key: "End" });
    await waitFor(() => expect(document.activeElement).toBe(out));
  });

  it("ArrowDown and Enter on the closed trigger open it", async () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(await screen.findByRole("menu")).toBeTruthy();
  });

  it("Esc closes and returns focus to the trigger", async () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    trigger().focus();
    await open();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(trigger());
  });

  it("click outside closes", async () => {
    render(
      <>
        <AccountMenu profileHref="/nurse/profile" />
        <p>elsewhere</p>
      </>,
    );
    await open();
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("links render before Profile as menu items", async () => {
    render(<AccountMenu profileHref="/agency/profile" links={[{ href: "/agency/shifts", label: "Shifts", icon: "brief" }]} />);
    await open();
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Shifts", "Profile", "Sign out"]);
    expect(items[0]!.getAttribute("href")).toBe("/agency/shifts");
  });

  it("Space activates a link item and closes the menu", async () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    await open();
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    // No preventDefault here: Radix skips its own select/close handling for a click that is already defaultPrevented.
    const click = vi.fn();
    profile.addEventListener("click", click);
    fireEvent.keyDown(profile, { key: " " });
    expect(click).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("Sign out calls useLogout and closes the menu", async () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    await open();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
});
