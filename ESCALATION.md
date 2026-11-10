# ESCALATION: One-click export of nurse license documents and TB test results

- **Raised:** 2026-11-06
- **Raised by:** Victor Jose (engineering)
- **For:** Juan (founder, operations)
- **Status:** Decided 2026-11-10: **Option D** (Victor, for the founder). Built as the scoped inspection package: admin or agency owner only, selected nurses + period, 24-hour expiry, TB documents opt-in, every generation / view / document link / revoke audit-logged. The one-click bulk export is still not built. Legal and clinical review (step 4 below) remain before real nurse documents go in.
- **Background:** see `docs/market-research.md` §6.

---

## Problem

The wish list asks for a **one-click export of every nurse's license documents and TB test results**, so the team can hand it to a state inspector when asked.

Built as written, it puts every nurse's identity documents and health records into a single file, downloadable with one click. Anyone who gets into an admin account, or anyone who receives a mis-sent email, gets the whole roster's sensitive records at once. The inspection need is real. The bulk one-click form of it is the problem.

## Root cause

1. **The request describes a solution, not the need.** The underlying need is to show an inspector, quickly, that each nurse's credentials were checked and are current. A bulk download of raw files is one way to do that, and the riskiest one.
2. **The data is legally sensitive.**
   - Florida's Information Protection Act (Fla. Stat. § 501.171) treats medical information combined with a person's name as personal information.
   - A breach triggers notice to the affected people within 30 days.
   - If 500 or more Floridians are affected, the state must also be notified.
   - The law requires "reasonable measures" to secure this data.
   - Whether HIPAA applies is unclear. HHS says employment records aren't covered by the HIPAA Privacy Rule, but that needs legal confirmation, and Florida law applies either way.
3. **Inspectors usually need proof, not everything.** Florida staffing agencies must verify and keep documentation of each worker's licensure (Fla. Stat. § 400.980). What an inspector typically checks is whether that verification exists and is current. TB *results* are clinical information the platform shouldn't be interpreting or bundling.
4. **The TB "expiry" assumption is shaky.** CDC no longer recommends routine annual TB testing for health care staff without an exposure. Facility policies vary, so a bulk "TB results" export implies a uniform rule that doesn't exist.

## Alternative solutions considered

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Build as asked | One button, zip of all license and TB files for all nurses | Exactly what was requested; fast to demo | Highest breach impact; no scoping; encourages emailing sensitive bundles; hard to defend after an incident |
| B. Don't build any export | Inspectors view records in person or by screen share | Zero export risk | Doesn't meet the real inspection need; frustrating under time pressure |
| C. Credential summary report | Per nurse: license number, state, expiry, verified by and on date, TB screening on file (yes/no and date). No documents, no results. | Answers most inspector questions; low sensitivity | Some inspectors may still ask for the underlying documents |
| **D. Scoped inspection package (recommended)** | C, plus the option to attach source documents for **selected** nurses and a date range; role-restricted, expiring link, every generation and download audit-logged | Meets the need; limits blast radius; leaves an audit trail an inspector would also value | More work than A; requires a short workflow instead of one click |

## Recommended solution

Build **Option D in stages:**

1. **Now (this build):**
   - Store credential records with expiry dates and "verified by and on" data.
   - Log every document view in the audit log.
   - Serve documents only through permission-checked, short-lived links. No public files.
2. **Next:** the **credential summary report** (Option C), as a printable or exportable table for an agency or the hospital admin.
3. **Then:** the **scoped inspection package**, with these rules:
   - **Scope:** the user picks which nurses and which period.
   - **Permissions:** only admin or agency-owner roles can generate it, and only within their own scope.
   - **Expiry:** the download link expires (e.g. after 24 hours).
   - **Audit:** generation and every download are logged with the user, time, and contents.
   - **TB content:** TB attachments are opt-in and default to "screening on file + date", not the raw result.
4. **Before go-live:** legal review of Florida inspection requirements and HIPAA applicability, plus clinical review of how TB status is shown.

**Decision needed from the founder:**
- Is the summary report (C) enough for the first release, or are full documents needed in the package from day one?
- Who at the hospital or agency is allowed to generate packages?

## Impact / urgency

- **Impact if built as asked:** One compromised account or one mis-sent file exposes every nurse's identity and health records. That creates legal notification duties, reputational damage with both nurses and agencies, and a weak position with the inspector the feature was meant to satisfy.
- **Impact of the recommendation:** Inspection readiness still improves. The summary report covers most questions, and the scoped package covers the rest, with a smaller exposure and a full audit trail.
- **Urgency:** Medium-high.
  - It doesn't block the core product (posting, claiming, coverage dashboard), so work continues.
  - It must be decided before any real nurse documents are uploaded, because the storage and access rules depend on it.
  - The building blocks (private storage, signed links, audit logging) are in the current build, so neither choice is ruled out.
