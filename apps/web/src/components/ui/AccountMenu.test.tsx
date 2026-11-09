import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

const signOut = vi.fn();
vi.mock("@/features/auth/use-logout", () => ({ useLogout: () => ({ signOut, pending: false }) }));

afterEach(() => {
  cleanup();
  signOut.mockReset();
});

const trigger = () => screen.getByRole("button", { name: "Account menu" });

describe("AccountMenu", () => {
  it("is closed by default and exposes aria-haspopup / aria-expanded", () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens on click, focuses the first item and shows Profile (role-specific href) + Sign out", () => {
    render(<AccountMenu profileHref="/agency/profile" />);
    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    expect(profile.getAttribute("href")).toBe("/agency/profile");
    expect(document.activeElement).toBe(profile);
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  });

  it("without profileHref shows Sign out only", () => {
    render(<AccountMenu />);
    fireEvent.click(trigger());
    expect(screen.queryByRole("menuitem", { name: "Profile" })).toBeNull();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("arrow keys wrap between items, Home/End jump", () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    fireEvent.click(trigger());
    const [profile, out] = screen.getAllByRole("menuitem");
    fireEvent.keyDown(profile!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(out);
    fireEvent.keyDown(out!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(profile);
    fireEvent.keyDown(profile!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(out);
    fireEvent.keyDown(out!, { key: "Home" });
    expect(document.activeElement).toBe(profile);
    fireEvent.keyDown(profile!, { key: "End" });
    expect(document.activeElement).toBe(out);
  });

  it("ArrowDown on the closed trigger opens it", () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    fireEvent.keyDown(trigger(), { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("Esc closes and returns focus to the trigger", () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("click outside closes", () => {
    render(
      <>
        <AccountMenu profileHref="/nurse/profile" />
        <p>elsewhere</p>
      </>,
    );
    fireEvent.click(trigger());
    act(() => {
      fireEvent.pointerDown(screen.getByText("elsewhere"));
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("links render before Profile as menu items", () => {
    render(<AccountMenu profileHref="/agency/profile" links={[{ href: "/agency/shifts", label: "Shifts", icon: "brief" }]} />);
    fireEvent.click(trigger());
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Shifts", "Profile", "Sign out"]);
    expect(items[0]!.getAttribute("href")).toBe("/agency/shifts");
  });

  it("Space activates a link item and closes the menu", () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    fireEvent.click(trigger());
    const profile = screen.getByRole("menuitem", { name: "Profile" });
    const click = vi.fn((e: Event) => e.preventDefault());
    profile.addEventListener("click", click);
    fireEvent.keyDown(profile, { key: " " });
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Sign out calls useLogout and closes the menu", () => {
    render(<AccountMenu profileHref="/nurse/profile" />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
