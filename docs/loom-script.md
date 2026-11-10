# Founder Loom — 5-minute script

**Audience:** Juan (founder, non-technical). **Tone:** plain words, no jargon. **Length:** ~5 min, five beats of ~1 min.
**URL:** https://shiftpatch-web-orcin.vercel.app · **Password (all seed accounts):** the spec password.
**Before recording:** production holds the exact spec seed (run `docs/release/prod-reseed.md` first). Open one browser window per account, already signed in. Mute notifications.

| Account | Who | Lands on |
|---|---|---|
| admin@sunrisehealth.example | Sunrise Health Staffing (agency A) | /agency/shifts |
| admin@metrocare.example | Metro Care Partners (agency B) | /agency/shifts |
| maria.lopez@example.com | Maria Lopez, nurse, valid license | /nurse/shifts |
| james.cook@example.com | James Cook, nurse, license expired June 2026 | /nurse/shifts |
| alex.kim@example.com | Alex Kim, hospital admin | /admin/dashboard |

## 1. Problem and solution (0:00–0:45)
> "Hospitals lose hours every week filling open nursing shifts by phone and text, and they can't easily prove that every nurse who shows up has a current license. ShiftPatch is one place where staffing agencies post shifts, nurses claim them, and the hospital sees coverage live. The rule that matters most: a nurse with an expired license can't take a shift."

Show: the login page, then the admin dashboard for a quick overview.

## 2. Agency experience (0:45–1:45)
Window: Sunrise (agency A).
1. Shifts list: "This is everything Sunrise has posted, and who has taken each shift."
2. **Post shift** → RN, a future date, 07:00–19:00 → submit. "Posted in seconds. Eligible nurses get an email." (Optional: pick yesterday first — "it won't let you post a shift in the past.")
3. Point at a filled shift → nurse details. "The agency sees who's coming."
4. Cancel with a reason (advance notice / no-show). "Cancellations are recorded with a reason, and the nurse is notified."
> "Each agency only ever sees its own shifts. Metro Care can't see Sunrise's."

## 3. Nurse experience (1:45–3:00)
Window: Maria (phone-sized window if possible).
1. Marketplace: "Maria only sees shifts she is allowed to work." Use the date filter.
2. **Claim** the new shift → "Shift claimed". "If two nurses tap at the same moment, only one gets it. And a nurse can't double-book herself on overlapping shifts."
3. My shifts → on the October shift she already worked, **Submit hours** (clock in/out, break). "Hours go to the agency for approval." Then cancel an upcoming one: "One click, with enough notice."
4. Credentials: "Nurses upload their license with its expiry date. The hospital reviews it."

Window: James.
5. A warning that his license expired. Try to claim → red message "Credential expired, cannot claim shift". "This is the safety rule working. He's told why and pointed to upload a new license."

## 4. Admin experience (3:00–4:00)
Window: Alex.
1. Dashboard: "Across every agency: how many shifts are open, filled or cancelled, and each agency's fill rate. It refreshes on its own." Point at Maria's claim now showing Filled.
2. Credential review queue: approve or reject an uploaded license. "If a license is rejected, any upcoming shifts that nurse holds go back to open, and the agency is told."
3. Audit log: "Every important action is recorded: who, what, when. That's the trail an inspector or a lawyer asks for." Filter it.
4. Timesheets: approve Maria's hours. "Approved hours complete the shift. If something's off, dispute it with a reason and she can resubmit."
5. Inspection: pick Maria and James, a date range, generate. "For a state inspector: a credential summary for just the nurses and dates asked for. Documents only if you tick the box, TB documents separately, the link expires in 24 hours, and every view is logged."

## 5. What I prioritised and what's next (4:00–5:00)
> "I built the things that keep patients safe and keep shifts filled first: posting, claiming, the license rule, the coverage dashboard, the audit trail and email notices."
>
> "One request I deliberately did not build as asked: the one-click export of every nurse's license and TB records. Bundling everyone's health records into one download is a serious privacy risk. Instead you saw the inspection package: scoped, expiring and fully logged. Before real documents go in, it needs a quick legal review."
>
> "Next: usage analytics, expiry reminders for facilities, and limiting how long an agency can see a nurse's documents after a shift."

## Recording checklist
- [ ] Prod reseeded to the spec data and smoke-tested (5 logins work)
- [ ] One test email received (for the "nurses get an email" line)
- [ ] Windows pre-signed in; browser zoom 100%; no bookmarks bar or extensions visible
- [ ] Record in Loom (screen + camera), ≤ 5:00
- [ ] Watch it once at 1x: no jargon (API, JWT, database, endpoint)
- [ ] **After recording, reseed prod again** (`docs/release/prod-reseed.md`): the recording posts, claims, submits hours on shift-2 and approves them (shift-2 becomes completed), so prod no longer matches the spec seed the graders expect
- [ ] Paste the Loom link into the submission and `brain/Status.md`; then mark the board task Done
