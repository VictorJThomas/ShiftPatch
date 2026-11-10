import { describe, expect, expectTypeOf, it } from "vitest";
import {
  AgencyIdParams,
  AgencyShiftsResponse,
  CancelShiftRequest,
  CancelShiftResponse,
  ClaimShiftRequest,
  ClaimShiftResponse,
  CreateShiftRequest,
  CreateShiftResponse,
  ErrorBody,
  ErrorMessage,
  HhMm,
  IsoDate,
  ListShiftsResponse,
  LoginRequest,
  LoginResponse,
  Shift,
  ShiftIdParams,
} from "./index";

// Fixtures copied verbatim from docs/original/ShiftPatch-Technical-Spec.md.
const shift1 = {
  id: "shift-1",
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "RN",
  date: "2026-10-02",
  startTime: "19:00",
  endTime: "07:00",
  status: "open",
  claimedBy: null,
} as const;
const shift2 = {
  id: "shift-2",
  agencyId: "agency-a",
  agencyName: "Sunrise Health Staffing",
  role: "LPN",
  date: "2026-10-03",
  startTime: "07:00",
  endTime: "19:00",
  status: "filled",
  claimedBy: "nurse-1",
} as const;
const shift3 = {
  id: "shift-3",
  agencyId: "agency-b",
  agencyName: "Metro Care Partners",
  role: "RN",
  date: "2026-10-04",
  startTime: "19:00",
  endTime: "07:00",
  status: "open",
  claimedBy: null,
} as const;

const SHIFT_KEYS = ["id", "agencyId", "agencyName", "role", "date", "startTime", "endTime", "status", "claimedBy"];

describe("shift shape", () => {
  it("has exactly the 9 mandatory keys", () => {
    expect(Object.keys(Shift.shape)).toEqual(SHIFT_KEYS);
  });

  it("accepts the spec examples", () => {
    for (const s of [shift1, shift2, shift3]) expect(Shift.parse(s)).toEqual(s);
  });

  it("rejects an unexpected property (no leaking past the spec shape)", () => {
    const r = Shift.safeParse({ ...shift1, networkId: "n-1" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.code).toBe("unrecognized_keys");
  });

  it.each(SHIFT_KEYS)("rejects a missing %s", (key) => {
    const s: Record<string, unknown> = { ...shift1 };
    delete s[key];
    expect(Shift.safeParse(s).success).toBe(false);
  });

  it("requires claimedBy to be present as null, not undefined", () => {
    expect(Shift.safeParse({ ...shift1, claimedBy: undefined }).success).toBe(false);
  });

  it.each([
    ["role", "MD"],
    ["status", "deleted"],
    ["status", "OPEN"],
    ["agencyId", ""],
    ["agencyName", ""],
    ["claimedBy", 1],
  ])("rejects invalid %s = %j", (key, value) => {
    expect(Shift.safeParse({ ...shift1, [key]: value }).success).toBe(false);
  });
});

describe("date and time formats", () => {
  it.each(["2026-10-02", "2028-02-29"])("accepts date %s", (d) => {
    expect(IsoDate.safeParse(d).success).toBe(true);
  });
  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-2", "02/10/2026", "2026-10-02T00:00:00Z", ""])(
    "rejects date %j",
    (d) => {
      expect(IsoDate.safeParse(d).success).toBe(false);
    },
  );
  it.each(["00:00", "07:00", "19:00", "23:59"])("accepts time %s", (t) => {
    expect(HhMm.safeParse(t).success).toBe(true);
  });
  it.each(["24:00", "7:00", "19:60", "19:00:00", "19:00:00.000", "7pm", ""])("rejects time %j", (t) => {
    expect(HhMm.safeParse(t).success).toBe(false);
  });
});

describe("errors", () => {
  it("accepts exactly { error }", () => {
    expect(ErrorBody.parse({ error: ErrorMessage.invalidCredentials })).toEqual({
      error: "Invalid email or password",
    });
  });
  it("rejects extra keys, missing or empty error", () => {
    expect(ErrorBody.safeParse({ error: "x", code: 401 }).success).toBe(false);
    expect(ErrorBody.safeParse({ message: "x" }).success).toBe(false);
    expect(ErrorBody.safeParse({ error: "" }).success).toBe(false);
  });
  it("keeps the exact spec texts", () => {
    expect(ErrorMessage.invalidCredentials).toBe("Invalid email or password");
    expect(ErrorMessage.credentialExpired).toBe("Credential expired, cannot claim shift");
    expect(ErrorMessage.noValidCredential).toBe("No valid credential on file, cannot claim shift");
    expect(ErrorMessage.licenseRoleMismatch).toBe("License type does not match shift role");
    expect(ErrorMessage.unauthorized).toBe("Unauthorized");
    expect(ErrorMessage.forbidden).toBe("Forbidden");
    expect(ErrorMessage.shiftNotFound).toBe("Shift not found");
    expect(ErrorMessage.shiftNotOpen).toBe("Shift is no longer open");
    expect(ErrorMessage.shiftNotFilled).toBe("Shift is not filled");
  });
});

describe("1. POST /api/auth/login", () => {
  const body = { email: "maria.lopez@example.com", password: "Trial2026!" };

  it("accepts the spec request and strips unknown keys", () => {
    expect(LoginRequest.parse({ ...body, role: "admin" })).toEqual(body);
  });
  it.each([
    [{ email: body.email }],
    [{ password: body.password }],
    [{ ...body, email: "not-an-email" }],
    [{ ...body, password: "" }],
    [{ ...body, password: "x".repeat(257) }],
    [{ ...body, email: 42 }],
  ])("rejects %j", (b) => {
    expect(LoginRequest.safeParse(b).success).toBe(false);
  });

  it.each([
    ["nurse-1", "Maria Lopez", "nurse"],
    ["agency-a", "Sunrise Health Staffing", "agency"],
    ["admin-1", "Alex Kim", "admin"],
  ])("accepts the 200 shape for %s", (id, name, role) => {
    const res = { token: "eyJ.a.b", user: { id, name, role } };
    expect(LoginResponse.parse(res)).toEqual(res);
  });
  it("rejects extra keys at both levels and unknown roles", () => {
    const user = { id: "nurse-1", name: "Maria Lopez", role: "nurse" };
    expect(LoginResponse.safeParse({ token: "t", user, refreshToken: "r" }).success).toBe(false);
    expect(LoginResponse.safeParse({ token: "t", user: { ...user, email: "m@x.com" } }).success).toBe(false);
    expect(LoginResponse.safeParse({ token: "t", user: { ...user, role: "owner" } }).success).toBe(false);
    expect(LoginResponse.safeParse({ user }).success).toBe(false);
  });
  it("401 body matches the error contract", () => {
    expect(ErrorBody.safeParse({ error: ErrorMessage.invalidCredentials }).success).toBe(true);
  });
});

describe("2. GET /api/shifts", () => {
  it("accepts the spec response and an empty list", () => {
    expect(ListShiftsResponse.parse({ shifts: [shift1, shift2] }).shifts).toHaveLength(2);
    expect(ListShiftsResponse.safeParse({ shifts: [] }).success).toBe(true);
  });
  it("rejects envelope extras, a bad item, or a bare array", () => {
    expect(ListShiftsResponse.safeParse({ shifts: [shift1], nextCursor: null }).success).toBe(false);
    expect(ListShiftsResponse.safeParse({ shifts: [{ ...shift1, extra: 1 }] }).success).toBe(false);
    expect(ListShiftsResponse.safeParse([shift1]).success).toBe(false);
  });
});

describe("3. POST /api/shifts", () => {
  const body = { role: "RN", date: "2026-10-05", startTime: "07:00", endTime: "19:00" };

  it("accepts the spec request and strips a client-supplied agencyId/status", () => {
    expect(CreateShiftRequest.parse({ ...body, agencyId: "agency-b", status: "filled" })).toEqual(body);
  });
  it("accepts an overnight shift", () => {
    expect(CreateShiftRequest.safeParse({ ...body, startTime: "19:00", endTime: "07:00" }).success).toBe(true);
  });
  it.each(["role", "date", "startTime", "endTime"])("rejects a missing %s", (key) => {
    const b: Record<string, unknown> = { ...body };
    delete b[key];
    expect(CreateShiftRequest.safeParse(b).success).toBe(false);
  });
  it.each([
    ["role", "rn"],
    ["date", "2026-10-5"],
    ["startTime", "7:00"],
    ["endTime", "19:00:00"],
  ])("rejects invalid %s = %j", (key, value) => {
    expect(CreateShiftRequest.safeParse({ ...body, [key]: value }).success).toBe(false);
  });

  it("201 response: the spec example (illustrative id) passes", () => {
    const res = { ...shift1, id: "shift-7", date: "2026-10-05", startTime: "07:00", endTime: "19:00" };
    expect(CreateShiftResponse.parse(res)).toEqual(res);
  });
  it("201 response must be open and unclaimed, with no extra keys", () => {
    expect(CreateShiftResponse.safeParse(shift2).success).toBe(false);
    expect(CreateShiftResponse.safeParse({ ...shift1, createdAt: "x" }).success).toBe(false);
  });
});

describe("params", () => {
  it("accept spec ids and strip extras", () => {
    expect(ShiftIdParams.parse({ id: "shift-1", x: 1 })).toEqual({ id: "shift-1" });
    expect(AgencyIdParams.parse({ agencyId: "agency-a" })).toEqual({ agencyId: "agency-a" });
  });
  it.each(["", "shift 1", "shift-1;drop", "../etc", "x".repeat(65)])("reject id %j", (id) => {
    expect(ShiftIdParams.safeParse({ id }).success).toBe(false);
    expect(AgencyIdParams.safeParse({ agencyId: id }).success).toBe(false);
  });
});

describe("4. POST /api/shifts/:id/claim", () => {
  it("accepts an absent or empty body, stripping any keys (nurse comes from the token)", () => {
    expect(ClaimShiftRequest.parse(undefined)).toBeUndefined();
    expect(ClaimShiftRequest.parse({})).toEqual({});
    expect(ClaimShiftRequest.parse({ nurseId: "nurse-2" })).toEqual({});
  });
  it("rejects a non-object body", () => {
    expect(ClaimShiftRequest.safeParse("nurse-1").success).toBe(false);
    expect(ClaimShiftRequest.safeParse(null).success).toBe(false);
  });
  it("200 response: the spec example passes", () => {
    const res = { ...shift1, status: "filled", claimedBy: "nurse-1" };
    expect(ClaimShiftResponse.parse(res)).toEqual(res);
  });
  it("200 response must be filled with a claimant", () => {
    expect(ClaimShiftResponse.safeParse(shift1).success).toBe(false);
    expect(ClaimShiftResponse.safeParse({ ...shift1, status: "filled" }).success).toBe(false);
  });
  it("403 body matches the error contract with the exact spec text", () => {
    expect(ErrorBody.parse({ error: ErrorMessage.credentialExpired })).toEqual({
      error: "Credential expired, cannot claim shift",
    });
  });
});

describe("5. POST /api/shifts/:id/cancel", () => {
  it.each(["no-show", "advance"])("accepts reason %s", (reason) => {
    expect(CancelShiftRequest.parse({ reason, extra: true })).toEqual({ reason });
  });
  it.each([[{}], [{ reason: "sick" }], [{ reason: "No-Show" }], [{ reason: null }]])("rejects %j", (b) => {
    expect(CancelShiftRequest.safeParse(b).success).toBe(false);
  });

  const specRes = {
    ...shift2,
    status: "open",
    claimedBy: null,
    cancellation: { reason: "no-show", previousNurseId: "nurse-1" },
  } as const;

  it("200 response: the spec example passes, keys = shift keys + cancellation", () => {
    expect(CancelShiftResponse.parse(specRes)).toEqual(specRes);
    expect(Object.keys(CancelShiftResponse.shape)).toEqual([...SHIFT_KEYS, "cancellation"]);
  });
  it("rejects a missing or loose cancellation object", () => {
    const noCancellation = { ...shift2, status: "open", claimedBy: null };
    expect(CancelShiftResponse.safeParse(noCancellation).success).toBe(false);
    expect(
      CancelShiftResponse.safeParse({ ...specRes, cancellation: { reason: "no-show" } }).success,
    ).toBe(false);
    expect(
      CancelShiftResponse.safeParse({ ...specRes, cancellation: { ...specRes.cancellation, at: "x" } }).success,
    ).toBe(false);
    expect(CancelShiftResponse.safeParse({ ...specRes, cancelledBy: "agency-a" }).success).toBe(false);
  });
  it("200 response must be reopened (open, claimedBy null)", () => {
    expect(CancelShiftResponse.safeParse({ ...specRes, status: "filled" }).success).toBe(false);
    expect(CancelShiftResponse.safeParse({ ...specRes, claimedBy: "nurse-1" }).success).toBe(false);
  });
});

describe("6. GET /api/agencies/:agencyId/shifts", () => {
  it("accepts agency-a (shift-1, shift-2) and agency-b (shift-3)", () => {
    expect(AgencyShiftsResponse.safeParse({ agencyId: "agency-a", shifts: [shift1, shift2] }).success).toBe(true);
    expect(AgencyShiftsResponse.safeParse({ agencyId: "agency-b", shifts: [shift3] }).success).toBe(true);
  });
  it("rejects the abbreviated items the spec uses for brevity (full shape is required)", () => {
    const r = AgencyShiftsResponse.safeParse({
      agencyId: "agency-a",
      shifts: [{ id: "shift-1", status: "open", claimedBy: null }],
    });
    expect(r.success).toBe(false);
  });
  it("rejects missing agencyId or extra envelope keys", () => {
    expect(AgencyShiftsResponse.safeParse({ shifts: [shift3] }).success).toBe(false);
    expect(AgencyShiftsResponse.safeParse({ agencyId: "agency-b", shifts: [], total: 1 }).success).toBe(false);
  });
});

describe("type inference", () => {
  it("infers the spec shapes", () => {
    expectTypeOf<Shift>().toEqualTypeOf<{
      id: string;
      agencyId: string;
      agencyName: string;
      role: "RN" | "LPN" | "CNA";
      date: string;
      startTime: string;
      endTime: string;
      status: "open" | "filled" | "cancelled" | "completed";
      claimedBy: string | null;
    }>();
    expectTypeOf<LoginRequest>().toEqualTypeOf<{ email: string; password: string }>();
    expectTypeOf<LoginResponse["user"]["role"]>().toEqualTypeOf<"nurse" | "agency" | "admin">();
    expectTypeOf<CreateShiftResponse["status"]>().toEqualTypeOf<"open">();
    expectTypeOf<CreateShiftResponse["claimedBy"]>().toEqualTypeOf<null>();
    expectTypeOf<ClaimShiftResponse["claimedBy"]>().toEqualTypeOf<string>();
    expectTypeOf<CancelShiftRequest>().toEqualTypeOf<{ reason: "no-show" | "advance" }>();
    expectTypeOf<CancelShiftResponse["cancellation"]>().toEqualTypeOf<{
      reason: "no-show" | "advance";
      previousNurseId: string;
    }>();
    expectTypeOf<AgencyShiftsResponse>().toEqualTypeOf<{ agencyId: string; shifts: Shift[] }>();
    expectTypeOf<ErrorBody>().toEqualTypeOf<{ error: string }>();
    expectTypeOf<ErrorMessage>().toEqualTypeOf<
      | "Invalid email or password"
      | "Credential expired, cannot claim shift"
      | "No valid credential on file, cannot claim shift"
      | "License type does not match shift role"
      | "Unauthorized"
      | "Forbidden"
      | "Agency not available"
      | "Select an agency"
      | "Facility not found in this network"
      | "Shift not found"
      | "Shift is no longer open"
      | "Shift is not filled"
      | "Attach a file to upload"
      | "File is larger than 10 MB"
      | "Unsupported file type. Upload a PDF, JPEG, PNG or HEIC file"
      | "Not found"
      | "No nurse has claimed this shift"
      | "Credential already has this status"
    >();
  });
  it("specialised responses are assignable to the base Shift", () => {
    expectTypeOf<CreateShiftResponse>().toExtend<Shift>();
    expectTypeOf<ClaimShiftResponse>().toExtend<Shift>();
    expectTypeOf<CancelShiftResponse>().toExtend<Shift>(); // superset: + cancellation
  });
});
