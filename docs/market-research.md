# ShiftPatch — Market, Competitive & Compliance Research

- **Date:** 2026-11-06 (all sources accessed on this date)
- **Status:** Approved direction. Positioning is a multi-agency coordination layer for hospital networks.
- **Scope:** Florida-first. Desk research only. Nothing here proves willingness to pay; see §7.

Evidence labels used below:
- **[Fact]**: stated by a cited source.
- **[Vendor claim]**: from a company's own marketing, unverified.
- **[Hypothesis]**: our inference, to be tested in interviews.

---

## 1. Summary

1. **Coordination is the stronger angle, not headcount.** [Hypothesis] The pain is coordinating open shifts across several agencies, with no real-time view of coverage, and paying premium rates when gaps fill late. Florida forecasts don't agree on an overall RN shortage, so the pitch shouldn't rest on one.
2. **Positioning.** ShiftPatch is a multi-agency coordination layer for hospital networks:
   - The hospital network is the tenant and the buyer.
   - Agencies are its approved vendors: they post and fill shifts with their own nurses.
   - The hospital's operations team sees coverage, cancellations, and credential status across all agencies in real time.
3. **Compliance points to a credential record with an audit trail.** Florida staffing agencies must verify and keep documentation of each worker's licensure, and that duty can't be delegated. Name plus medical information is "personal information" under Florida law, so TB documents need security, breach handling, and secure disposal.
4. **The founder's TB assumption needs correcting.** CDC no longer recommends annual TB testing for health care personnel without an exposure. The product should store screening documentation and support facility-specific re-check policies, not hard-code annual expiry.
5. **Escalate the export, don't build it.** A one-click bulk export of license and TB documents is a ready-made data-breach package. Recommend instead a scoped, audited package per inspection request.

---

## 2. Florida market signals

| Signal | Detail | Source | Label |
|---|---|---|---|
| Long-range shortage forecast | About 60,000 nurse shortfall projected by 2035 (IHS Markit for the Florida Hospital Association and the Safety Net Hospital Alliance of Florida, 2019 base year) | Florida Hospital Association; Becker's | Fact, older projection |
| More recent RN outlook | RN surplus of about 9,170 projected by 2030 (279,190 supply vs 270,020 needed) | Florida Center for Nursing via Becker's, Dec 2023 | Fact |
| LPN outlook | 23.6% LPN shortfall projected by 2030 | Same | Fact |
| Turnover easing | Hospital nurse turnover fell from 32% to 20% (2022 to 2023, 200 hospitals). Vacancy and turnover fell 38% | Becker's; Florida Hospital Association | Fact |
| Demand driver | Florida's population grows by more than 800 people a day, and over half are over 60 | Florida Hospital Association | Fact |
| Cost of open shifts | Open shifts spill into overtime, premium agency rates, and contracts. Rate gap of $15–30+ per hour vs local on-demand clinicians | ShiftMed 2026 report (press release) | Vendor claim |

**Reading:** The forecasts conflict, and the newest data shows the RN gap narrowing. A coordination and cost problem ("who's covering, how fast, at what rate") is more defensible than "there are no nurses." [Hypothesis]

**Market size:** Not estimated. Staffing Industry Analysts' segment figures are paywalled, and the vendor-published market-size reports are unreliable. No TAM, SAM, or SOM is claimed here.

---

## 3. Stakeholders: buyer vs user

| Stakeholder | Role | Primary concerns |
|---|---|---|
| Hospital operations / nursing administration | **Buyer**, decision-maker, admin user | Real-time coverage visibility, premium-labor spend, inspection and compliance risk |
| Hospital staffing coordinator | Daily user on the hospital side | Filling gaps fast, fewer phone calls and spreadsheets |
| Agency owner / scheduler | User, and must agree to adopt it | Keeping the hospital client, filling their roster, less admin |
| Nurse (agency per diem) | User | Pay, flexibility, fair cancellation rules, getting paid on time |

**Adoption risk:** Agencies may resist another client portal. [Hypothesis] Agencies adopt because the hospital requires the tool as a condition of doing business, and it is free for them. This is the vendor management system dynamic.

---

## 4. Competitive landscape

| Category | Players | Model | Relevance to ShiftPatch |
|---|---|---|---|
| Gig marketplaces | **ShiftKey**: 10,000+ facilities, 140,000+ professionals; facilities broadcast shifts to independent professionals [Vendor claim]. **Nursa**: 1099 model, facility sets the rate and pays per completed shift, 4,500+ facilities in 31 states [Vendor claim]. **Clipboard Health** | Facility posts directly to independent clinicians and bypasses agencies | Different model: they replace agencies, ShiftPatch keeps them. Crowded and well funded. |
| W-2 on-demand and float pools | **IntelyCare** (post-acute; acquired **CareRev**, acute care, Jan 2026). **ShiftMed** (employee model, internal float-pool tooling) | Employ the clinicians, or run hospital float pools | Heavier model, aimed at large systems |
| Vendor management systems | **AMN ShiftWise Flex** and similar | Enterprise layer for managing many staffing vendors, with credentialing and analytics | **Closest analog.** Same buyer, same multi-agency problem. ShiftPatch is the lighter alternative for mid-size networks. |
| Agency software | **NextCrew**, Bullhorn ecosystem | The agency's own scheduling and credentialing | Sells to agencies, not hospitals. Possible future integration. |

**Recurring complaints** about gig platforms (The Markup / The 19th, Oct 2023):
- **Punitive attendance points:** Clipboard deducts 85 of 100 points for one missed shift.
- **Wage disputes:** Some took weeks to resolve.
- **Unverified training:** Federal inspection reports cited temporary staff whose training wasn't verified.

**Opportunities:**
- Transparent, auditable cancellation and no-show handling.
- Credential verification records that are ready for inspectors.

**Not copied from competitors:** pay bidding, ratings marketplaces, and payroll. None of these is needed for the buyer's core job.

**Pricing:** Not public for any competitor except Nursa's per-shift model. Not estimated.

---

## 5. Positioning decision

**Chosen:** a multi-agency coordination layer for hospital networks.

| Option | Buyer | Verdict |
|---|---|---|
| Open marketplace (nurses ↔ facilities) | Facilities | Rejected. Bypasses agencies, which the spec makes first-class, and competes with well-funded incumbents. |
| Agency-focused software | Agencies | Rejected. Wrong buyer compared with the stated target customers. |
| Full vendor management system | Hospital networks | Same buyer, but enterprise-heavy. Position as the lightweight alternative. |
| **Multi-agency coordination layer** | **Hospital networks** | **Chosen.** Matches the spec's roles (agency, nurse, admin) and the founder's "real-time dashboard." |

**Domain model implications:**
- **Tenant = hospital network.** Every tenant-owned row carries a `tenantId`. The admin role is the hospital's operations team, scoped to its tenant.
- **Agency ↔ hospital network is many-to-many.** Agencies are approved vendors.
- **Nurse ↔ agency.** The agency is the employer of record and owns credential verification (Fla. Stat. § 400.980).
- **Isolation:** An agency can only read and change its own shifts and nurses. The hospital admin sees everything inside its tenant.
- **Trial build:** One seeded tenant linked to `agency-a` and `agency-b`. No tenant onboarding, billing, or switching.

**Mapping to the required spec (the spec is the contract and is not changed):**
- `POST /api/shifts`: the agency posts a shift on behalf of its hospital client.
- `GET /api/shifts`: the hospital's open board, visible to nurses from all approved agencies.
- `GET /api/agencies/:agencyId/shifts`: the agency's own view. This is the primary cross-agency access-control test point.

**Roadmap ideas (not MVP):**
- The hospital creates a staffing request and routes it to agencies.
- Tiered release: the posting agency's nurses get first access, then the shift opens to all approved agencies.
- Nursys e-Notify and MQA integration.

**Pricing hypothesis:** A per-facility monthly subscription paid by the hospital, free for agencies. [Hypothesis]

---

## 6. Compliance & credential management

### 6.1 Florida staffing agencies ("health care services pools")
- **Registration:** Pools must register with the Agency for Health Care Administration (AHCA). [Fact, § 400.980]
- **Background screening:** Personnel need level 2 background screening (ch. 435, s. 408.809). [Fact]
- **Licensure verification:** Pools must verify and keep documentation that each worker meets licensure, certification, and training requirements. This duty can't be delegated. [Fact]
- **Penalties:** Fines of up to $2,500 per violation, and registration can be suspended. [Fact]
- **What the MVP stores:**
  - credential type, number, issuing state, and expiry;
  - who verified it and when;
  - the document file.
  - Every verification and every change is audited.

### 6.2 License verification
- **Primary source:** Florida's MQA license search.
- **Ongoing monitoring:** NCSBN **Nursys e-Notify** is free for employers and sends licensure and discipline alerts. [Fact]
- **MVP:** An agency user records a manual "verified on date X." Integrations are post-MVP.

### 6.3 TB screening
CDC guidance (2019 recommendations; page last reviewed Dec 15, 2023): [Fact]
- **At hire:** a baseline risk assessment, a symptom evaluation, and one TB test (blood test/IGRA or skin test/TST).
- **No routine annual testing** unless there is a known exposure or ongoing transmission.
- **After a positive result:** treatment for latent infection is encouraged. If the person isn't treated, annual symptom screening applies.
- **Annual TB education** for all health care personnel.
- **State rules:** CDC guidance doesn't override state or local rules.

**Not verified:** Florida hospital-specific TB rules, and individual facility policies (many still require annual tests). This needs legal and clinical review.

**MVP representation:**
- Store a TB document with screening date and test type (IGRA, TST, or chest X-ray/evaluation), plus an optional **policy-set** re-check date.
- **Don't store or interpret clinical results**, and the platform makes no clinical judgments.
- **Only license expiry blocks claims**, as the spec requires. A configurable TB policy can be added later.

### 6.4 Privacy and security
- **HIPAA:** HHS states that the Privacy Rule does not cover employment records, even health-related ones. Nurse TB and credential records held by an agency or platform are therefore likely outside HIPAA. [Fact + legal review needed]
- **Florida Information Protection Act (Fla. Stat. § 501.171):** Medical history, condition, or diagnosis combined with a name is "personal information." It requires: [Fact]
  - reasonable security measures;
  - breach notice to individuals within 30 days;
  - notice to the Department of Legal Affairs if 500+ Floridians are affected;
  - a third-party agent to notify the covered entity within 10 days;
  - secure disposal.
- **Security architecture implications:**
  - Documents go in private storage, accessed only through short-lived signed URLs after a role check.
  - Every document view and download is logged in the audit trail.
  - Least-privilege roles.
  - Upload validation (type and size).
  - No documents in public buckets or logs.

### 6.5 Escalation: one-click export of license and TB documents
- **Problem:** Bulk one-click export of every nurse's sensitive documents.
- **Root cause:** An inspection-readiness need expressed as a bulk download feature.
- **Risk:** One compromised admin account or one mis-sent file becomes a breach under Florida law.
- **Recommendation:** A scoped inspection package:
  - selected nurses and date range;
  - role-restricted;
  - expiring link;
  - audit-logged;
  - optionally a credential **summary** (verified and expiry status) instead of the raw TB documents.
- **Action:** To be written up formally in `ESCALATION.md`.

---

## 7. Customer discovery plan

### 7.1 Targets (first round)
- **Hospital operations / nursing administration:** 5. Buyer.
- **Staffing coordinators:** 3.
- **Florida agency owners / schedulers:** 3. Sourced from AHCA's FloridaHealthFinder registry.
- **Agency per diem nurses:** 5.
- **Where to reach them:** LinkedIn, Florida Organization of Nurse Leaders and Florida Hospital Association events, and nursing communities.

### 7.2 Key assumptions to test
1. The hospital's pain is coordinating across multiple agencies and lacking real-time visibility, not headcount.
2. Hospitals already spend on this, through vendor management systems, agency premiums, or coordinator hours.
3. Agencies will adopt a tool their hospital client requires.
4. Credential and inspection readiness is a real recurring burden.
5. Nurses value fair, transparent cancellation rules.

### 7.3 Questions
Ask about past behavior, not the idea.

**Hospital operations and coordinators:**
- "Walk me through the last shift that went unfilled. Who did you call, how long did it take, and what did it cost?"
- "How many agencies do you work with? How do you know, right now, which shifts are covered?"
- "What tools do you pay for today for this? Who approved that purchase?"
- "When did an inspector last ask for staff credentials? What happened next?"

**Agencies:**
- "How do shift requests reach you today?"
- "Which client portals or vendor management systems do your hospitals already make you use? What do you dislike about them?"
- "How do you track license and TB expirations?"

**Nurses:**
- "Tell me about the last shift that was cancelled on you, or that you had to cancel. How was it handled?"
- "What made you leave or stay with an app or agency?"

### 7.4 Demand signals
- **Strong:**
  - existing spend on a vendor management system or agency premiums;
  - a named owner of the problem;
  - agreement to a paid pilot or letter of intent;
  - an intro to a procurement or IT contact.
- **Weak:** "Sounds useful" with no current spend; interest only from users, not buyers.

---

## 8. Known gaps and open questions
- Market size: segment figures are paywalled, so not estimated.
- Competitor pricing: not public, except Nursa's model.
- Florida hospital-specific TB screening rules: not verified.
- Florida per diem shift volume: no data found.
- HIPAA applicability: needs legal confirmation.

---

## Sources
- [Florida Hospital Association – Florida Workforce Projections](https://www.fha.org/FHA/FHA/Data-and-Research/Florida-Workforce.aspx)
- [Becker's – Florida's rebound from nurse shortage at risk (Dec 20, 2023)](https://www.beckershospitalreview.com/nursing/floridas-rebound-from-nurse-shortage-at-risk.html)
- [Becker's – Florida will be short nearly 60,000 nurses by 2035](https://www.beckershospitalreview.com/quality/nursing/florida-will-be-short-nearly-60-000-nurses-by-2035-report)
- [ShiftMed 2026 Open Shift Management Report (press release)](https://hrtechcube.com/?p=89230)
- [Staffing Industry Analysts – US Healthcare Staffing Market Growth Assessment 2025](https://www.staffingindustry.com/research/research-reports/healthcare/us-healthcare-staffing-market-growth-assessment-2025)
- [ShiftKey – Facilities](https://www.shiftkey.com/facilities)
- [Nursa – Facility](https://nursa.com/facility)
- [Nurse.org – IntelyCare acquires CareRev (Jan 13, 2026)](https://nurse.org/news/intelycare-carerev-acquisition-nurses)
- [AMN Healthcare – ShiftWise Flex](https://amnhealthcare.com/technology/workforce/vendor-management-systems/shiftwise-flex)
- [NextCrew – Healthcare staffing software](https://www.nextcrew.com/industries/healthcare-staffing-software)
- [The Markup / The 19th via Truthout – gig nursing (Oct 6, 2023)](https://truthout.org/articles/how-does-gig-nursing-work-affect-patients-nurses-and-health-care-facilities)
- [Fla. Stat. § 400.980 – Health care services pools](https://flsenate.gov/Laws/Statutes/2023/400.980)
- [AHCA – Health Care Services Pool](https://ahca.myflorida.com/health-quality-assurance/bureau-of-health-facility-regulation/long-term-care-services-unit/health-care-services-pool.html)
- [Florida Board of Nursing – Nursys e-Notify](https://floridasnursing.gov/learn-about-e-notify-an-ncsbn-nurse-licensure-notification-system)
- [Florida MQA – License verification](https://license-cert.mqa.flhealthsource.gov/)
- [CDC – TB screening and testing of health care personnel](https://www.cdc.gov/tb-healthcare-settings/hcp/screening-testing/index.html)
- [HHS – Employers and health information in the workplace](https://www.hhs.gov/guidance/document/employers-and-health-information-workplace)
- [Fla. Stat. § 501.171 – Security of confidential personal information](https://www.flsenate.gov/Laws/Statutes/2025/501.171)
