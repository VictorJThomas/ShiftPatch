---
source: docs/original/Designli Trial Challenge - Product Engineer.docx
note: plain-text extraction of the original docx (tables flattened with " | "); the docx is the source of truth
---


Product Engineer · Trial Challenge
How would you build a product in one week
We believe that the best way to gauge a candidate's fit for a role is through practical experience. This trial project is designed to provide us with insights into your skill set and working style while also giving you a glimpse into the kind of tasks you would have at Designli.
Here are some general guidelines before you start:
Your approach matters more than the finish line.
The scope below is a full product. It's far more than any Product Engineer could build by hand in eight hours, and that is on purpose. What we want to see:
How you handle building something too big for the time you have.
your call: how you empower yourself with AI tools.

Better to have something small that works than something big and incomplete.


Key details:
Expected Effort: ~8 hours of focused work.
Submission window: 7 days from receiving this brief.
Work at your own pace within the week: Prioritize quality over extra hours.
Use any IA tool of your preference, as long as you can export transcripts.
$250 completion reward: upon submission of a good-faith effort.
"Completion" does not mean that you finalized on a 100% every item in the challenge, instead, it means that your work includes everything on the deliverables list.
Payment goes out once the opening closes.
Your work is used only to evaluate your candidacy: We don't ship it, reuse it, or share it outside the hiring panel.
We answer clarifying questions; we don't review work in progress.
If you have any questions: reach out to your recruiter by email.
THE PROJECT
What is it about?
ShiftPatch
Healthcare facilities post open nursing shifts when they need someone on short notice. Nurses browse those openings and pick up the ones that work for them. Meanwhile, an administrator keeps an eye on everything as it happens, tracking which shifts are still open and which have been filled.

Founder’s brief:

 | My name is Juan, and I run operations for a large hospital network in Florida. Over the past few years we've grown fast, and problems that used to be simple are now a real headache—with nursing staffing being the biggest one.

Currently, when we're short-staffed, filling shifts is a manual, time-consuming nightmare. To solve this, we are exploring a new pre-launch software concept called ShiftPatch. The idea is a platform where available shifts are posted to a real-time dashboard so our team always knows which shifts are covered and by whom.

Before we invest in building this software, we need to validate the demand. We want to know if other hospital operations managers and healthcare staffing directors (our target customers) experience this same pain point and would be interested in buying this solution. We will use public state nursing registries and hospital directories as our public dataset for prospect verification.

The founder's full wish list looks like this: 
Three roles with real permissions: agency, nurse, admin
 | Authentication
 | Credential upload with expiry dates
 | Shift matching that blocks nurses with lapsed credentials
 | Cancellation and no-show handling
 | Email notifications
 | Timesheets
 | Admin dashboard with reporting
 | Audit log
 | One-click export of nurses' license documents and TB test results, so we can hand it to the state inspector when they ask.
 | PostHog analytics set up.
 | Deployed to a real URL



What to build?
What's fixed, and what's yours to decide
Build your product outlined in the founder brief.
The Brand: Use a fictional, neutral brand. Never use Designli's name or assets.
The Output: Deliver all the specific materials listed under "Your packet".
Starting Point
So our automated checks can run on any submission.
Sample data. Two agencies and one nurse roster. Load exactly these.
Required API routes. Login plus five shift routes, with exact request and response formats. We give you the spec.
About 15 test IDs on key UI elements, so our scripts can find the buttons.
TypeScript. 
 | Up to you
We care about the result and the reasoning, not the stack.
How the code is organized and which TypeScript frameworks you use
The entire UI beyond the required test IDs
Any API route beyond the required ones
What to build first and what to leave out

DELIVERABLES
Send these five things by the deadline
Send everything to your recruiter by email. If a piece is partial, send it anyway and say so.
☐
 | Deployed app at a real URL
Loaded with the sample data and working. A URL we can't open counts as no submission.
 | ☐
 | Repo with passing CI
Type checks, lint, and your own tests all green. Keep secrets out of git history.
 | ☐
 | Your agentic setup, as you actually use it
CLAUDE.md, AGENTS.md, custom skills or commands, a second brain, whatever you really work with. Not a writeup made for us.
 | ☐
 | A 5-minute Loom video for the founder
Explain what you built and what you didn't, to a non-technical person. No jargon.
 | ☐
 | Full AI session transcripts
Every session, unedited. This is the deliverable we read most closely.


Where do I start?
Three things to get right
NON-NEGOTIABLE
The app deploys and runs.
Not every request in the founder brief should be built as asked. If you escalate something, see below.
 | COMMIT YOUR SCOPE 
Within your first day, email your recruiter two or three lines: "By the deadline I'll deliver up to here."
Pick a goal ambitious enough to say something about your judgment, then hit it. A commitment you're sure to finish because it's trivial doesn't show us that, and neither does one so large you can't.
 | TOOLING

Any AI tools you like, as long as you can export full session logs.
Use your own subscription. We don't provide seats for the trial.
AI is not just allowed, it's the point. Directing it well is the job.

How will I be evaluated?
What we look at, and how
Most of the grade comes from tooling we run, not opinions. Each dimension is scored 1 to 5.
DIMENSION
 | MEASURED BY
 | Automated testing
 | Scripts click through the main flows using your test IDs and check the required API routes return the right data.
 | Hands-on click-through
 | A senior engineer uses the app like a client would. Tests miss how it actually feels.
 | Security posture
 | We try to misuse the app and run static analysis: OWASP rules, dependency audit, type check.
 | Code health
 | Our codebase audit scores the repo across seven categories.
 | AI direction quality
 | We read your transcripts. See below.
 | Founder communication
 | The Loom video.

Professional recommendations
Strong transcripts look like
A plan written before generating
Independent work running in parallel
A verification loop that you actually use
Reusable commands or skills created mid-task
 | Weak transcripts look like
One request at a time, first output accepted
Errors pasted back in, round after round
No verification beyond "it looks right"
Copy-paste ping-pong doesn't pass even when the output ships. That way of working doesn't survive the pace a pod runs at.

AFTER YOU SUBMIT
What happens next
1.  Automated review runs first: we run your tests plus our own automated checks, static analysis, security scans, and code health audit.
2.  Human review, about an hour: our team clicks through your deployed app like a client would, reads your full transcripts, and watches your presentation Loom video.
3.  If everything meets expectation, we schedule a final presentation
Live session, about an hour on a screen share.
Ten minutes presenting the kit to us as the founder. 
Questions to understand your decisions. 
Small change we name on the spot, so we can watch you direct AI in real time. Bring your project and your session history.



Thank you for investing your time in this process and this technical test. 
We deeply appreciate your effort and look forward to seeing your expertise in action!



LOGISTICS
Your packet, your questions, your work
Your packet arrives when the clock starts: the ShiftPatch founder brief, the sample data (two agencies and the nurse roster), the required API routes with exact formats, the required test IDs.
Questions during the week go to your recruiter by email. We answer clarifying questions; we don't review work in progress.
Your work is used only to evaluate your candidacy. We don't ship it, reuse it, or share it outside the hiring panel.

If you escalate something
Add an ESCALATION.md to your repo.
Include: Problem, Root cause, Alternative solutions considered, Recommended solution, Impact/urgency.
Commit it as soon as you hit it, not at the end; we can see the timestamp.
Only add this file if something genuinely warrants it, not as a defensive habit.
