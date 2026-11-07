import { create } from "zustand";
import type { Role } from "@/lib/routes";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  email?: string;
}

export interface AgencyMembership {
  agencyId: string;
  name: string;
  role: "owner" | "manager" | "viewer";
}

export type SessionStatus = "idle" | "restoring" | "authenticated" | "anonymous";

/** The ONLY value that ever touches browser storage. The access token lives in memory. */
export const ACTIVE_AGENCY_KEY = "sp.activeAgencyId";

function readActiveAgency(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(ACTIVE_AGENCY_KEY);
  } catch {
    return null; // storage blocked / private window
  }
}

function writeActiveAgency(id: string | null): void {
  try {
    if (typeof window === "undefined") return;
    if (id) window.localStorage.setItem(ACTIVE_AGENCY_KEY, id);
    else window.localStorage.removeItem(ACTIVE_AGENCY_KEY);
  } catch {
    // best effort: the selection just won't survive a reload
  }
}

export interface SessionState {
  user: SessionUser | null;
  accessToken: string | null;
  agencies: AgencyMembership[];
  activeAgencyId: string | null;
  status: SessionStatus;
  /** `agencies` / `activeAgencyId` are left untouched when omitted (e.g. after a token refresh). */
  setSession: (next: { user: SessionUser; accessToken: string; agencies?: AgencyMembership[]; activeAgencyId?: string | null }) => void;
  clearSession: () => void;
  /** Store a fresh token (+ user) WITHOUT changing status: used mid-restore, before /api/me has run. */
  applyToken: (accessToken: string, user: SessionUser) => void;
  setActiveAgency: (id: string | null) => void;
  setStatus: (status: SessionStatus) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  user: null,
  accessToken: null,
  agencies: [],
  activeAgencyId: readActiveAgency(),
  status: "idle",
  setSession: ({ user, accessToken, agencies, activeAgencyId }) => {
    if (activeAgencyId !== undefined) writeActiveAgency(activeAgencyId);
    set((s) => ({
      user,
      accessToken,
      status: "authenticated",
      agencies: agencies ?? s.agencies,
      activeAgencyId: activeAgencyId === undefined ? s.activeAgencyId : activeAgencyId,
    }));
  },
  clearSession: () => {
    writeActiveAgency(null);
    set({ user: null, accessToken: null, agencies: [], activeAgencyId: null, status: "anonymous" });
  },
  applyToken: (accessToken, user) => set({ accessToken, user }),
  setActiveAgency: (id) => {
    writeActiveAgency(id);
    set({ activeAgencyId: id });
  },
  setStatus: (status) => set({ status }),
}));

/** Stored selection if it is still a membership, else the only membership, else null (show the switcher prompt). */
export function pickActiveAgency(stored: string | null, agencies: AgencyMembership[]): string | null {
  if (stored && agencies.some((a) => a.agencyId === stored)) return stored;
  if (agencies.length === 1) return agencies[0]?.agencyId ?? null;
  return null;
}
