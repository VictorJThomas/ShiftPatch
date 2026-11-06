// Guards cross-package consumption: api typechecks contracts' TS source under NodeNext
// (so contracts' relative imports, if ever added, need `.js` extensions) and vitest resolves it.
import { describe, expect, it } from "vitest";
import { ErrorBody, ErrorMessage, type Shift } from "@shiftpatch/contracts";

describe("@shiftpatch/contracts from api", () => {
  it("resolves and validates", () => {
    const claimedBy: Shift["claimedBy"] = null;
    expect(claimedBy).toBeNull();
    expect(ErrorBody.parse({ error: ErrorMessage.unauthorized })).toEqual({ error: "Unauthorized" });
  });
});
