// Reminder sweep S1-S5 against a real throwaway Postgres with a fixed clock. Seed: nurse-1 (Maria Lopez), nurse-2 (license expired
// 2026-06-01), admin-1 (alex.kim@example.com), agency-a owner (admin@sunrisehealth.example), agency-b owner (admin@metrocare.example).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agencyMemberships, credentials, notifications, nurseProfiles, shifts, userProfiles, users } from "../../db/schema/index.js";
import { seed } from "../../db/seed.js";
import { createTestDb } from "../../db/test-db.js";
import { addDays, createReminderSweep, SWEEP_LOCK_KEY } from "./reminders.js";

let t: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-12-01T15:00:00Z"); // 10:00 in America/New_York, today = 2026-12-01
const sweep = () => createReminderSweep({ db: t.db, now: () => NOW });

async function person(id: string, role: "nurse" | "agency", status: "active" | "suspended" = "active") {
  await t.db.insert(users).values({ id, email: `${id}@example.com`, role, status, passwordHash: "x" });
  await t.db.insert(userProfiles).values({ userId: id, fullName: `Name ${id}` });
}
async function nurse(id: string, status: "active" | "suspended" = "active") {
  await person(id, "nurse", status);
  await t.db.insert(nurseProfiles).values({ userId: id, networkId: "network-default" });
}
const license = (id: string, nurseId: string, expiresOn: string, over: Partial<typeof credentials.$inferInsert> = {}) =>
  t.db.insert(credentials).values({ id, nurseId, type: "license", expiresOn, status: "pending", ...over });
const shift = (id: string, over: Partial<typeof shifts.$inferInsert>) =>
  t.db.insert(shifts).values({ id, networkId: "network-default", agencyId: "agency-a", role: "RN", shiftDate: "2026-12-02", startTime: "07:00", endTime: "19:00", timezone: "America/New_York", status: "open", createdBy: "admin-1", ...over });
const mails = async (template?: string) => (await t.db.select().from(notifications)).filter((n) => !template || n.template === template);
const to = (rows: { recipientEmail: string }[]) => rows.map((r) => r.recipientEmail).sort();

beforeAll(async () => {
  t = await createTestDb();
  await seed(t.db);
  await person("mgr-a", "agency"); await t.db.insert(agencyMemberships).values({ id: "agm_mgr-a", userId: "mgr-a", agencyId: "agency-a", role: "manager" });
  await person("viewer-a", "agency"); await t.db.insert(agencyMemberships).values({ id: "agm_viewer-a", userId: "viewer-a", agencyId: "agency-a", role: "viewer" });
  // S1 30d only: nurse-1 expires in 19 days. S3: nurse-1 holds a filled shift after that date.
  await t.db.update(credentials).set({ expiresOn: "2026-12-20" }).where(eq(credentials.id, "cred-nurse-1"));
  await shift("shift-lapse", { status: "filled", claimedBy: "nurse-1", claimedAt: new Date("2026-11-01T00:00:00Z"), shiftDate: "2026-12-25" });
  // S2: expired 11 days ago (mailed). nurse-2 (license expired 2026-06-01) is past the 30 d window: no longer mailed.
  await nurse("nurse-7"); await license("cred-n7", "nurse-7", "2026-11-20");
  // S1 30d + 7d: expires in 4 days.
  await nurse("nurse-3"); await license("cred-n3", "nurse-3", "2026-12-05");
  // skipped: rejected, superseded (newer license of the same type), suspended
  await nurse("nurse-4"); await license("cred-n4", "nurse-4", "2026-12-05", { status: "rejected", reviewedBy: "admin-1", reviewedAt: new Date("2026-11-01T00:00:00Z") });
  await nurse("nurse-5");
  await license("cred-n5-old", "nurse-5", "2026-12-05", { createdAt: new Date("2026-01-01T00:00:00Z") });
  await license("cred-n5-new", "nurse-5", "2099-01-01", { createdAt: new Date("2026-06-01T00:00:00Z") });
  await nurse("nurse-6", "suspended"); await license("cred-n6", "nurse-6", "2026-12-05");
  // S4: filled, starts 2026-12-02 07:00 NY = 12:00Z (21 h away). S5: open, 08:00 NY (22 h).
  await shift("shift-remind", { status: "filled", claimedBy: "nurse-1", claimedAt: new Date("2026-11-01T00:00:00Z") });
  await shift("shift-unfilled", { startTime: "08:00", endTime: "20:00" });
  // timezone edge: 12:00 NY on 12-02 is 17:00Z, 26 h away. Read as UTC it would be 21 h away and wrongly fire.
  await shift("shift-tz-edge", { status: "filled", claimedBy: "nurse-1", claimedAt: new Date("2026-11-01T00:00:00Z"), startTime: "12:00", endTime: "23:00" });
  // not due: too far, other statuses, soft-deleted, already started
  await shift("shift-far", { shiftDate: "2026-12-10" });
  await shift("shift-done", { status: "completed", claimedBy: "nurse-1", claimedAt: new Date("2026-11-01T00:00:00Z") });
  await shift("shift-deleted", { deletedAt: new Date() });
  await shift("shift-started", { shiftDate: "2026-12-01", startTime: "08:00", endTime: "16:00" });
});
afterAll(async () => { await t?.drop(); });

describe("reminder sweep", () => {
  it("S1-S5 each fire once, to the right people, with no credential type or health data", async () => {
    expect(await sweep().tick()).toEqual({ inserted: 10, skipped: false });
    const expiring = await mails("credential.expiring");
    expect(expiring.map((n) => `${n.recipientEmail} ${n.dedupeKey}`).sort()).toEqual([
      "maria.lopez@example.com cred-exp:cred-nurse-1:30d", "nurse-3@example.com cred-exp:cred-n3:30d", "nurse-3@example.com cred-exp:cred-n3:7d",
    ]);
    // S2: nurse-7 (expired 2026-11-20): the nurse gets the date, the network admin only the name
    const expired = await mails("credential.expired");
    expect(to(expired)).toEqual(["alex.kim@example.com", "nurse-7@example.com"]);
    expect(expired.find((n) => n.recipientEmail === "alex.kim@example.com")!.payload).toEqual({ audience: "admin", nurseName: "Name nurse-7" });
    expect(expired.find((n) => n.recipientEmail === "nurse-7@example.com")!.payload).toEqual({ audience: "nurse", expiresOn: "2026-11-20" });
    expect(to(await mails())).not.toContain("james.cook@example.com");
    // S3: agency-a owner + manager, not the viewer
    const lapses = await mails("shift.nurse_license_lapses");
    expect(to(lapses)).toEqual(["admin@sunrisehealth.example", "mgr-a@example.com"]);
    expect(lapses[0]!.payload).toMatchObject({ shiftId: "shift-lapse", date: "2026-12-25", nurseName: "Maria Lopez" });
    // S4 / S5
    const reminder = await mails("shift.reminder");
    expect(reminder.map((n) => [n.recipientEmail, n.payload])).toEqual([
      ["maria.lopez@example.com", { shiftId: "shift-remind", role: "RN", date: "2026-12-02", startTime: "07:00", endTime: "19:00", agencyName: "Sunrise Health Staffing" }],
    ]);
    expect(to(await mails("shift.unfilled"))).toEqual(["admin@sunrisehealth.example", "mgr-a@example.com"]);
    const all = JSON.stringify(await mails());
    expect(all).not.toMatch(/shift-tz-edge|shift-far|shift-done|shift-deleted|shift-started/); // timezone edge + not-due shifts stay silent
    expect(all).not.toMatch(/tb_screening|tuberculosis|objectKey/i);
  });

  it("a second tick inserts nothing (dedupe keys), also from a fresh sweep instance", async () => {
    expect(await sweep().tick()).toEqual({ inserted: 0, skipped: false });
    expect(await mails()).toHaveLength(10);
  });

  it("rejected, superseded, suspended and viewer recipients never get mail", async () => {
    const recipients = to(await mails());
    for (const who of ["nurse-4", "nurse-5", "nurse-6", "viewer-a"]) expect(recipients).not.toContain(`${who}@example.com`);
  });

  it("a later tick picks up newly due items, once", async () => {
    await shift("shift-late", { startTime: "09:00", endTime: "21:00", agencyId: "agency-b" }); // agency-b owner only
    expect((await sweep().tick()).inserted).toBe(1);
    expect(to((await mails("shift.unfilled")).filter((n) => (n.payload as { shiftId: string }).shiftId === "shift-late"))).toEqual(["admin@metrocare.example"]);
    expect((await sweep().tick()).inserted).toBe(0);
  });

  it("another holder of the advisory lock: the tick is skipped and writes nothing", async () => {
    await t.db.delete(notifications);
    await t.sql.begin(async (other) => {
      await other`select pg_advisory_xact_lock(${SWEEP_LOCK_KEY})`;
      expect(await sweep().tick()).toEqual({ inserted: 0, skipped: true });
    });
    expect(await mails()).toHaveLength(0);
    expect((await sweep().tick()).skipped).toBe(false); // lock released with the other transaction
  });

  it("start() ticks on the interval and stop() waits for it", async () => {
    await t.db.delete(notifications);
    const s = createReminderSweep({ db: t.db, now: () => NOW, intervalMs: 30 });
    s.start(); s.start();
    await expect.poll(async () => (await mails()).length, { timeout: 3000 }).toBeGreaterThan(0);
    await s.stop();
  });
});

describe("addDays", () => {
  it("adds days across month and DST boundaries", () => {
    expect(addDays("2026-12-01", 30)).toBe("2026-12-31");
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
