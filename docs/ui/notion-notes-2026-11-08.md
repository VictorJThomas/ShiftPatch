Here is the result of "fetch" for the Page with URL https://app.notion.com/p/412c822db4ad80bd8070f5a905d4b90d as of 2026-11-08T14:52:49.145Z:
<page url="https://app.notion.com/p/412c822db4ad80bd8070f5a905d4b90d">
<ancestor-path></ancestor-path>
<properties>
{"title":"Notes"}
</properties>
<iconMetadata>null</iconMetadata>
<content>
- Nurse view
  - Credentials screen <code>/nurse/credentials</code>:
    <toggle>
    Gemini design:

    ### 1. Color Palette (Linear / Vercel / Stripe Dark Aesthetic)

    Designed around a high-contrast, zinc-monochrome base with precision accents tailored for a modern medical workspace.

    <table>
    <tr>
    <td>
    <b>Token / Role</b>
    </td>
    <td>
    <b>HEX Value</b>
    </td>
    <td>
    <b>Tailwind Class</b>
    </td>
    <td>
    <b>Usage</b>
    </td>
    </tr>
    <tr>
    <td>
    <b>Background (Base)</b>
    </td>
    <td>
    <code>#09090B</code>
    </td>
    <td>
    <code>bg-zinc-950</code>
    </td>
    <td>
    Root app background
    </td>
    </tr>
    <tr>
    <td>
    <b>Surface (Card / Modal)</b>
    </td>
    <td>
    <code>#121215</code>
    </td>
    <td>
    <code>bg-zinc-900/80</code>
    </td>
    <td>
    Modals, cards, dropdown menus with backdrop blur
    </td>
    </tr>
    <tr>
    <td>
    <b>Border (Subtle)</b>
    </td>
    <td>
    <code>#27272A</code>
    </td>
    <td>
    <code>border-zinc-800</code>
    </td>
    <td>
    Card borders, dividers, inputs
    </td>
    </tr>
    <tr>
    <td>
    <b>Border (Interactive)</b>
    </td>
    <td>
    <code>#3F3F46</code>
    </td>
    <td>
    <code>border-zinc-700</code>
    </td>
    <td>
    Hover states for inputs and cards
    </td>
    </tr>
    <tr>
    <td>
    <b>Text (Primary)</b>
    </td>
    <td>
    <code>#FAFAFA</code>
    </td>
    <td>
    <code>text-zinc-50</code>
    </td>
    <td>
    Headers, primary data labels
    </td>
    </tr>
    <tr>
    <td>
    <b>Text (Secondary)</b>
    </td>
    <td>
    <code>#A1A1AA</code>
    </td>
    <td>
    <code>text-zinc-400</code>
    </td>
    <td>
    Form labels, descriptions, metadata
    </td>
    </tr>
    <tr>
    <td>
    <b>Text (Muted)</b>
    </td>
    <td>
    <code>#71717A</code>
    </td>
    <td>
    <code>text-zinc-500</code>
    </td>
    <td>
    Empty states, placeholders, captions
    </td>
    </tr>
    <tr>
    <td>
    <b>Accent (Primary Action)</b>
    </td>
    <td>
    <code>#14B8A6</code>
    </td>
    <td>
    <code>bg-teal-500</code> / <code>text-teal-400</code>
    </td>
    <td>
    Active submit button, verified badges, focus rings
    </td>
    </tr>
    <tr>
    <td>
    <b>Accent (Hover)</b>
    </td>
    <td>
    <code>#0D9488</code>
    </td>
    <td>
    <code>bg-teal-600</code>
    </td>
    <td>
    Button hover state
    </td>
    </tr>
    <tr>
    <td>
    <b>Destructive / Error</b>
    </td>
    <td>
    <code>#EF4444</code>
    </td>
    <td>
    <code>text-red-500</code> / <code>bg-red-500/10</code>
    </td>
    <td>
    Error messages, sign out destructive hover
    </td>
    </tr>
    </table>

    ### 2. Typographic Hierarchy & Spacing Scale

    - <b>Font Family:</b> <code>Geist, Inter, system-ui, -apple-system, sans-serif</code>
    - <b>Letter Spacing:</b> Tight tracking for headings (<code>tracking-tight</code>), crisp normal tracking for body text.

    <table>
    <tr>
    <td>
    <b>Level</b>
    </td>
    <td>
    <b>Size / Weight / Line Height</b>
    </td>
    <td>
    <b>Tailwind Classes</b>
    </td>
    </tr>
    <tr>
    <td>
    <b>Page Title</b>
    </td>
    <td>
    24px / SemiBold (600) / 32px
    </td>
    <td>
    <code>text-2xl font-semibold tracking-tight text-zinc-50</code>
    </td>
    </tr>
    <tr>
    <td>
    <b>Modal Heading</b>
    </td>
    <td>
    18px / Medium (500) / 24px
    </td>
    <td>
    <code>text-lg font-medium text-zinc-100</code>
    </td>
    </tr>
    <tr>
    <td>
    <b>Card Title / Label</b>
    </td>
    <td>
    14px / Medium (500) / 20px
    </td>
    <td>
    <code>text-sm font-medium text-zinc-200</code>
    </td>
    </tr>
    <tr>
    <td>
    <b>Body / Input Text</b>
    </td>
    <td>
    14px / Regular (400) / 20px
    </td>
    <td>
    <code>text-sm text-zinc-300</code>
    </td>
    </tr>
    <tr>
    <td>
    <b>Meta / Helper Text</b>
    </td>
    <td>
    12px / Regular (400) / 16px
    </td>
    <td>
    <code>text-xs text-zinc-500</code>
    </td>
    </tr>
    </table>

    #### Spacing Scale (4px Base Grid)

    - <b>Micro padding / gaps:</b> <code>p-1.5</code> (6px) or <code>p-2</code> (8px)
    - <b>Input inner padding:</b> <code>px-3.5 py-2.5</code> (14px horizontal, 10px vertical for enhanced select readability)
    - <b>Card padding:</b> <code>p-5</code> (20px)
    - <b>Layout container margins:</b> Centered container with <code>max-w-5xl mx-auto px-6 py-10</code>

    ### 3. Visual Breakdown & UI/UX Specifications

    #### A. Layout & Navigation Header

    - <b>Web Alignment:</b> Main container centered on screen (<code>max-w-5xl mx-auto w-full</code>).
    - <b>Avatar & Profile Dropdown:</b> The top-right avatar is interactive (<code>cursor-pointer</code>). Clicking it opens a minimalist floating dropdown menu (<code>bg-zinc-900 border border-zinc-800 shadow-xl rounded-xl p-1.5 w-48</code>) containing two options: <b>Profile</b> (navigates to profile screen) and <b>Sign Out</b> (with subtle red hover state). On mobile view, profile is completely omitted from the bottom navigation tab, routing all user actions through this same avatar dropdown.

    #### B. Credentials List & Empty States

    - <b>Interactive Cards:</b> Each credential item in the list features <code>cursor-pointer</code>, a subtle border (<code>border-zinc-800</code>), and a smooth transition (<code>transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-900/50</code>). Clicking anywhere on the card opens the credential details.
    - <b>Empty State:</b> If the list has no items, display a centered layout containing a minimal outline icon (e.g., <code>Inbox</code> or <code>ShieldAlert</code> from Lucide in <code>text-zinc-600</code>), accompanied by a muted message: <i>"No credentials found. Add your first license or screening."</i>
    - <b>Loaders:</b> Apply skeleton loaders (<code>animate-pulse bg-zinc-800/60 rounded-md</code>) when fetching list states.

    #### C. Modal & Dynamic Form Experience

    - <b>Glassmorphism Backdrop & Modal:</b> The modal floats over a backdrop blur (<code>backdrop-blur-md bg-black/60</code>). The modal container uses <code>bg-zinc-900 border border-zinc-800 shadow-2xl rounded-2xl</code>.
    - <b>Dynamic Fields:</b> Selecting the credential type cleanly mounts/unmounts conditional fields using a smooth transition without layout jitter.
    - <b>Select Inputs:</b> Styled with internal padding (<code>px-3.5 py-2.5</code>) to keep text aligned cleanly away from borders.
    - <b>Submit Button State:</b>
      - <i>Disabled (Default):</i> <code>bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-60</code> until all required fields are completely validated.
      - <i>Submittable:</i> <code>bg-teal-500 hover:bg-teal-400 text-zinc-950 font-medium cursor-pointer shadow-sm transition-all</code>.
    - <b>Confirmation Toast:</b> Upon successful submission, trigger a bottom-right floating toast (<code>bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-2xl rounded-xl px-4 py-3 flex items-center gap-3</code>) featuring a teal check icon to ensure the user verifies their entered information.

    ### 4. Semantic HTML / JSX Structure

    JavaScript

    # 

    ```txt
    export default function NurseCredentialsView(){
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased selection:bg-teal-500 selection:text-zinc-950">
          {/* Top Navigation */}
          <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
            <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-semibold text-sm">
                  NC
                </div>
                <span className="font-medium text-sm tracking-tight">Credential Manager</span>
              </div>

              {/* Avatar & Dropdown Trigger */}
              <div className="relative group">
                <button
                  className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center cursor-pointer hover:border-zinc-600 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                  aria-label="User menu"
                >
                  <img src="/avatar-placeholder.png" alt="Nurse Avatar" className="w-full h-full object-cover" />
                </button>

                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  <a href="/profile" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-50 rounded-lg cursor-pointer transition-colors">
                    Profile
                  </a>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors">
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content Layer (Centered on Web) */}
          <main className="max-w-5xl mx-auto px-6 py-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Credentials & Licenses</h1>
                <p className="text-sm text-zinc-400 mt-1">Manage your active nursing licenses and health screenings.</p>
              </div>
              <button className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-medium text-sm px-4 py-2 rounded-lg cursor-pointer transition-all shadow-sm">
                Add Credential
              </button>
            </div>

            {/* Credentials List Container */}
            <div className="space-y-3">
              {/* Example List Item (Clickable) */}
              <div className="group border border-zinc-800 bg-zinc-900/40 rounded-xl p-5 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/80 transition-all flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">Registered Nurse (RN) License</span>
                    <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full">Verified</span>
                  </div>
                  <p className="text-xs text-zinc-500">State: California • Expires: Oct 2028</p>
                </div>
                <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">View details →</span>
              </div>

              {/* Empty state alternative layout if no items */}
              {/*
              <div className="border border-dashed border-zinc-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 mb-3">
                  <ShieldAlert size={20} />
                </div>
                <p className="text-sm font-medium text-zinc-300">No credentials added</p>
                <p className="text-xs text-zinc-500 mt-1">Get started by adding your first license or screening record.</p>
              </div>
              */}
            </div>
          </main>

          {/* Modal Overlay & Form */}
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
                <h2 className="text-lg font-medium text-zinc-100">Add New Credential</h2>
                <button className="text-zinc-500 hover:text-zinc-300 text-sm cursor-pointer">✕</button>
              </div>

              <form className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Credential Type</label>
                  <select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 cursor-pointer">
                    <option>Nursing License</option>
                    <option>TB Screening</option>
                    <option>BLS Certification</option>
                  </select>
                </div>

                {/* Dynamic Fields Container */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">License Number</label>
                    <input
                      type="text"
                      placeholder="e.g. RN-982734"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button type="button" className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer">
                    Cancel
                  </button>
                  {/* Submit button dynamically disabled until fields are valid */}
                  <button
                    type="submit"
                    disabled
                    className="bg-zinc-800 text-zinc-500 text-xs font-medium px-4 py-2 rounded-lg cursor-not-allowed opacity-60 transition-all"
                  >
                    Save Credential
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Confirm Toast Notification */}
          <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-800 text-zinc-100 shadow-2xl rounded-xl px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
            <div className="w-5 h-5 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center text-xs font-bold">✓</div>
            <div>
              <p className="text-xs font-medium text-zinc-200">Credential successfully submitted</p>
              <p className="text-[11px] text-zinc-500">Please verify your details are correct.</p>
            </div>
          </div>
        </div>
      );
    }
    ```
    </toggle>

    <image source="notion-file-block://412c822d-b4ad-8018-9a4b-f034209b533b/f132c7e6-24ae-4945-8d45-0a5a05110d57?space_id=9a78137e-88f4-4e86-9348-427197c77e2b&name=image.png" />

    <ul>
    <li>
    The form should be within a modal. Since it’s fields change based on credential type, the UX should be based on that.
    </li>
    <li>
    Currently the form stays all the time. 
    </li>
    <li>
    The submit button must be offline until all the required inputs are filled and its submittable.
    </li>
    <li>
    \[To confirm\]: Can a nurse have two nursing license Verified at the same time? Same as TB Screening
    </li>
    <li>
    Credentials list should have the option to be clickable, so the user can see its details. 
    </li>
    <li>
    When submitting the form, add a confirm toast so user make sure it filled the right information.
    </li>
    </ul>
  - My shifts screen <code>/nurse/my-shifts</code>:
    <toggle>
    Gemini design:

    JavaScript

    # 

    ````txt
    export default function MyShiftsView(){
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased selection:bg-teal-500 selection:text-zinc-950 flex">
          {/* Sidebar Navigation */}
          <aside className="w-64 border-r border-zinc-800/60 bg-zinc-950 flex flex-col justify-between hidden md:flex sticky top-0 h-screen">
            <div>
              {/* Logo Area */}
              <div className="h-16 px-6 flex items-center gap-3 border-b border-zinc-800/40">
                <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-xs">
                  SP
                </div>
                <span className="font-semibold text-sm tracking-tight text-zinc-100">ShiftPatch</span>
              </div>

              {/* Nav Links */}
              <nav className="p-4 space-y-1">
                <a href="/shifts" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors">
                  <span className="text-zinc-500">💼</span> Shifts
                </a>
                <a href="/my-shifts" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium bg-zinc-900/80 text-teal-400 border border-zinc-800/80 shadow-sm">
                  <span className="text-teal-400">📋</span> My shifts
                </a>
                <a href="/credentials" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors">
                  <span className="text-zinc-500">🛡️</span> Credentials
                </a>
                <a href="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors">
                  <span className="text-zinc-500">👤</span> Profile
                </a>
              </nav>
            </div>

            {/* Sidebar User Footer with Clickable Avatar Dropdown */}
            <div className="p-4 border-t border-zinc-800/40">
              <div className="relative group">
                <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/40 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-medium text-xs text-zinc-200">
                      ML
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-200">Maria Lopez</p>
                      <p className="text-[10px] text-zinc-500">Nurse</p>
                    </div>
                  </div>
                  <span className="text-zinc-500 text-xs">•••</span>
                </div>

                {/* Dropdown Menu */}
                <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  <a href="/profile" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-50 rounded-lg cursor-pointer transition-colors">
                    Profile
                  </a>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors">
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 max-w-5xl mx-auto px-6 py-10">
            {/* Header Section */}
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">My shifts</h1>

              {/* Mobile Top-Right Avatar Dropdown (Replaces nav tab profile) */}
              <div className="relative group md:hidden">
                <button className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-medium text-xs text-zinc-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40">
                  ML
                </button>
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  <a href="/profile" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-50 rounded-lg cursor-pointer transition-colors">
                    Profile
                  </a>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors">
                    Sign out
                  </button>
                </div>
              </div>
            </div>

            {/* Shift Category Section: Upcoming Shifts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-zinc-300">Upcoming <span className="text-zinc-500 ml-1">3</span></h2>
              </div>

              {/* Separated Notice Banner for Advance Cancellation */}
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 flex items-start gap-3">
                <span className="text-teal-400 text-sm mt-0.5">ℹ️</span>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  <strong className="text-zinc-200 font-medium">Cancellation policy:</strong> Cancelling is an advance cancellation. The agency is notified right away and the shift reopens for other nurses.
                </p>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Shift Card 1 */}
                <div className="border border-zinc-800 bg-zinc-900/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-200">Sunrise Health Staffing</h3>
                      </div>
                      <span className="text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 px-2 py-0.5 rounded-md">RN</span>
                    </div>

                    <div className="text-xs text-zinc-400 font-medium">
                      Fri, Oct 2 • 19:00 → Sat 07:00
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] font-medium bg-zinc-800/80 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-800">
                        🌙 Overnight • 12 h
                      </span>
                      {/* Status update based on claim-request workflow spec */}
                      <span className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                        ⏳ Requested
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                    <button className="flex-1 bg-transparent hover:bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium py-2 rounded-xl cursor-pointer transition-all">
                      Cancel shift
                    </button>
                    <button className="flex-1 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs font-medium py-2 rounded-xl cursor-pointer transition-all">
                      Details
                    </button>
                  </div>
                </div>

                {/* Shift Card 2 */}
                <div className="border border-zinc-800 bg-zinc-900/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-200">Sunrise Health Staffing</h3>
                      </div>
                      <span className="text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 px-2 py-0.5 rounded-md">LPN</span>
                    </div>

                    <div className="text-xs text-zinc-400 font-medium">
                      Sat, Oct 3 • 07:00 → 19:00
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] font-medium bg-zinc-800/80 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-800">
                        ☀️ Day • 12 h
                      </span>
                      <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                        ✓ Confirmed by Agency
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                    <button className="flex-1 bg-transparent hover:bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium py-2 rounded-xl cursor-pointer transition-all">
                      Cancel shift
                    </button>
                    <button className="flex-1 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs font-medium py-2 rounded-xl cursor-pointer transition-all">
                      Details
                    </button>
                  </div>
                </div>

                {/* Shift Card 3 */}
                <div className="border border-zinc-800 bg-zinc-900/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-200">Metro Care Partners</h3>
                      </div>
                      <span className="text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 px-2 py-0.5 rounded-md">RN</span>
                    </div>

                    <div className="text-xs text-zinc-400 font-medium">
                      Sun, Oct 4 • 19:00 → Mon 07:00
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] font-medium bg-zinc-800/80 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-800">
                        🌙 Overnight • 12 h
                      </span>
                      <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                        ✓ Confirmed by Agency
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                    <button className="flex-1 bg-transparent hover:bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium py-2 rounded-xl cursor-pointer transition-all">
                      Cancel shift
                    </button>
                    <button className="flex-1 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs font-medium py-2 rounded-xl cursor-pointer transition-all">
                      Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      );
    }
    ```[cite: 1]
    ````
    </toggle>

    <image source="notion-file-block://412c822d-b4ad-80c2-a4e4-dc2a3ebddd62/eeaa7633-8a9f-4444-be7d-0efaee211f33?space_id=9a78137e-88f4-4e86-9348-427197c77e2b&name=image.png" />

    <ul>
    <li>
    UI should be enhanced.

    - <b>upcoming, Cancelling is an advance cancellation: the agency is notified right away and the shift reopens for other nurses </b>message & <b>cards grid</b> should be separated.
    </li>
    <li>
    To confirm against spec files: Currently nurse can just claim a shift and will be rolled instantly. On real scenario, many nurses can click to claim same shift, so agency must see a list of nurses who requested to claim the shift, then it would be up to the agency to choose which nurse can take the shift. 
    </li>
    </ul>
  - Shifts screen <code>/nurse/shifts</code>:
    <toggle>
    Gemini design:

    ### UI/UX Filter Enhancement Strategy

    The existing filter layout mixes category groupings (Dates vs. Roles) into a single unorganized horizontal scroll. The design upgrades split these into distinct, structured filter components while retaining fast pill-based toggles:

    1. <b>Segmented Filter Groups:</b> Separate <b>Date Range</b> selectors from <b>Role Chips</b> to avoid confusion.
    2. <b>Interactive Pill Design:</b> Active state uses <code>bg-teal-500/10 text-teal-400 border-teal-500/30</code>, inactive state uses <code>bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200</code>. Zero-count badges (<code>0</code>) are styled with lower opacity (<code>opacity-40</code>) to highlight available options visually.
    3. <b>Claim Workflow UX Update:</b> Replaced "Claim shift" with <b>"Request shift"</b> to align with the multi-nurse application model (where the agency approves candidates).

    ### Enhanced HTML/JSX Code

    JavaScript

    # 

    ````txt
    export default function AvailableShiftsView(){
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased selection:bg-teal-500 selection:text-zinc-950 flex">
          {/* Sidebar Navigation */}
          <aside className="w-64 border-r border-zinc-800/60 bg-zinc-950 flex flex-col justify-between hidden md:flex sticky top-0 h-screen">
            <div>
              {/* Logo Area */}
              <div className="h-16 px-6 flex items-center gap-3 border-b border-zinc-800/40">
                <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-xs">
                  SP
                </div>
                <span className="font-semibold text-sm tracking-tight text-zinc-100">ShiftPatch</span>
              </div>

              {/* Nav Links */}
              <nav className="p-4 space-y-1">
                <a href="/shifts" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium bg-zinc-900/80 text-teal-400 border border-zinc-800/80 shadow-sm">
                  <span className="text-teal-400">💼</span> Shifts
                </a>
                <a href="/my-shifts" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors">
                  <span className="text-zinc-500">📋</span> My shifts
                </a>
                <a href="/credentials" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors">
                  <span className="text-zinc-500">🛡️</span> Credentials
                </a>
                <a href="/profile" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors">
                  <span className="text-zinc-500">👤</span> Profile
                </a>
              </nav>
            </div>

            {/* User Dropdown Footer */}
            <div className="p-4 border-t border-zinc-800/40">
              <div className="relative group">
                <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/40 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-medium text-xs text-zinc-200">
                      ML
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-200">Maria Lopez</p>
                      <p className="text-[10px] text-zinc-500">Nurse</p>
                    </div>
                  </div>
                  <span className="text-zinc-500 text-xs">•••</span>
                </div>

                {/* Dropdown Menu */}
                <div className="absolute bottom-full left-0 mb-2 w-full rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  <a href="/profile" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-50 rounded-lg cursor-pointer transition-colors">
                    Profile
                  </a>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors">
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 max-w-5xl mx-auto px-6 py-10">
            {/* Header Section */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Available shifts</h1>

              {/* Mobile Top-Right Avatar Dropdown */}
              <div className="relative group md:hidden">
                <button className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-medium text-xs text-zinc-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40">
                  ML
                </button>
                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                  <a href="/profile" className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-50 rounded-lg cursor-pointer transition-colors">
                    Profile
                  </a>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer transition-colors">
                    Sign out
                  </button>
                </div>
              </div>
            </div>

            {/* Enhanced Filter Section */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 mb-8 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Filter Group: Date Selection */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                  <span className="text-xs font-medium text-zinc-500 mr-1">Date:</span>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/30 transition-all cursor-pointer">
                    <span>All dates</span>
                    <span className="bg-teal-500/20 px-1.5 py-0.5 rounded-full text-[10px]">1</span>
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 transition-all cursor-pointer">
                    <span>Sat, Oct 3</span>
                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px] text-zinc-400">1</span>
                  </button>
                </div>

                {/* Divider */}
                <div className="hidden lg:block w-px h-6 bg-zinc-800" />

                {/* Filter Group: Role Selection */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                  <span className="text-xs font-medium text-zinc-500 mr-1">Role:</span>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-teal-500/10 text-teal-400 border border-teal-500/30 transition-all cursor-pointer">
                    <span>All roles</span>
                    <span className="bg-teal-500/20 px-1.5 py-0.5 rounded-full text-[10px]">1</span>
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 text-zinc-500 border border-zinc-800/60 opacity-60 hover:opacity-100 transition-all cursor-pointer">
                    <span>RN</span>
                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px] text-zinc-500">0</span>
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-200 transition-all cursor-pointer">
                    <span>LPN</span>
                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px] text-zinc-400">1</span>
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-900 text-zinc-500 border border-zinc-800/60 opacity-60 hover:opacity-100 transition-all cursor-pointer">
                    <span>CNA</span>
                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px] text-zinc-500">0</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Results Metadata Header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-medium text-zinc-400">
                <span className="text-zinc-200 font-semibold">1 shift</span> available to request
              </p>
            </div>

            {/* Available Shifts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Shift Card */}
              <div className="border border-zinc-800 bg-zinc-900/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all">
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-zinc-200">Sunrise Health Staffing</h3>
                    </div>
                    <span className="text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60 px-2 py-0.5 rounded-md">LPN</span>
                  </div>

                  <div className="text-xs text-zinc-400 font-medium">
                    Sat, Oct 3 • 07:00 → 19:00
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-medium bg-zinc-800/80 text-zinc-400 px-2.5 py-1 rounded-full border border-zinc-800">
                      ☀️ Day • 12 h
                    </span>
                    <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                      • Open
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
                  {/* Updated CTA to request shift for agency approval */}
                  <button className="flex-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-semibold py-2 rounded-xl cursor-pointer transition-all shadow-sm">
                    Request shift
                  </button>
                  <button className="flex-1 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 text-xs font-medium py-2 rounded-xl cursor-pointer transition-all">
                    Details
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      );
    }
    ```[cite: 2]
    ````
    </toggle>

    <image source="notion-file-block://412c822d-b4ad-80a0-bc97-f7f9bf166576/aff2483a-1467-4a9a-ba4b-785eb1682f19?space_id=9a78137e-88f4-4e86-9348-427197c77e2b&name=image.png" />

    - Enhance the filters section.
- Agency view
  <ul>
  <li>
  Shifts screen <code>/agency/shifts</code> :

  <toggle>
  Gemini design

  JavaScript

  # 

  ````txt
  export default function AgencyShiftsManagementView(){
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased selection:bg-teal-500 selection:text-zinc-950">
        {/* Top Header */}
        <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-xs">
                  SP
                </div>
                <span className="font-semibold text-sm tracking-tight text-zinc-100">ShiftPatch</span>
              </div>
              <nav className="hidden md:flex items-center gap-1">
                <a href="/agency/shifts" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-teal-400 border border-zinc-800">Shifts</a>
                <a href="/agency/profile" className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200">Agency profile</a>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 hidden sm:inline">admin@sunrisehealth.com</span>
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-200">
                SH
              </div>
            </div>
          </div>
        </header>

        {/* Agency Hero Banner */}
        <div className="bg-gradient-to-r from-amber-950/40 via-zinc-900/40 to-zinc-950 border-b border-zinc-800/60 py-8 px-6">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-base">
              SH
            </div>
            <div>
              <span className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Active Agency</span>
              <h1 className="text-xl font-semibold text-zinc-100 mt-1">Sunrise Health Staffing</h1>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Shifts</h2>
              <p className="text-xs text-zinc-400 mt-0.5">2 shifts • Facility-local time, 24-hour.</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium px-3.5 py-2 rounded-xl cursor-pointer transition-all">
                <span>🔄</span> Refresh
              </button>
              <button className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer transition-all shadow-sm">
                <span>+</span> Post shift
              </button>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
              <span className="text-xs text-zinc-400 font-medium">Open</span>
              <p className="text-3xl font-semibold text-zinc-100 mt-2">2</p>
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
              <span className="text-xs text-zinc-400 font-medium">Filled</span>
              <p className="text-3xl font-semibold text-zinc-100 mt-2">0</p>
            </div>
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-5">
              <span className="text-xs text-zinc-400 font-medium">Cancelled</span>
              <p className="text-3xl font-semibold text-zinc-100 mt-2">0</p>
            </div>
          </div>

          {/* Shifts Data Table */}
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-medium rounded-full cursor-pointer">All (2)</span>
                <span className="px-3 py-1 bg-zinc-900 text-zinc-400 text-xs font-medium rounded-full cursor-pointer hover:text-zinc-200">Open (2)</span>
                <span className="px-3 py-1 bg-zinc-900 text-zinc-500 text-xs font-medium rounded-full cursor-pointer">Filled (0)</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] font-medium text-zinc-500 uppercase tracking-wider bg-zinc-900/50">
                    <th className="py-3.5 px-6">Role</th>
                    <th className="py-3.5 px-6">Date / time</th>
                    <th className="py-3.5 px-6">Status</th>
                    <th className="py-3.5 px-6">Claim requests</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-xs">
                  {/* Row 1 */}
                  <tr className="hover:bg-zinc-900/50 transition-colors">
                    <td className="py-4 px-6 font-medium">
                      <span className="bg-zinc-800 border border-zinc-700/60 text-zinc-300 px-2 py-1 rounded-md text-[10px]">RN</span>
                    </td>
                    <td className="py-4 px-6 text-zinc-300 font-medium">
                      Fri, Oct 2 • 19:00 → Sat 07:00 <span className="text-zinc-500 block text-[11px]">🌙 Overnight • 12 h</span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20">
                        ● Open
                      </span>
                    </td>
                    <td className="py-4 px-6 text-zinc-400">
                      —
                    </td>
                  </tr>
                  {/* Row 2 - Showing Claim Requests from Nurses */}
                  <tr className="hover:bg-zinc-900/50 transition-colors">
                    <td className="py-4 px-6 font-medium">
                      <span className="bg-zinc-800 border border-zinc-700/60 text-zinc-300 px-2 py-1 rounded-md text-[10px]">LPN</span>
                    </td>
                    <td className="py-4 px-6 text-zinc-300 font-medium">
                      Sat, Oct 3 • 07:00 → 19:00 <span className="text-zinc-500 block text-[11px]">☀️ Day • 12 h</span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        ⏳ Pending Assignment
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {/* Clickable nurse list who requested the shift */}
                      <div className="flex items-center gap-2">
                        <button className="bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer transition-all flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] flex items-center justify-center font-bold">1</span>
                          <span>Maria Lopez (LPN)</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </main>

        {/* MODAL: Post a Shift (With formatted date inputs & clean UX) */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium text-zinc-100">Post a shift</h2>
                <p className="text-xs text-zinc-400 mt-0.5">For Sunrise Health Staffing. Nurses who match see it right away.</p>
              </div>
              <button className="text-zinc-500 hover:text-zinc-300 text-sm cursor-pointer">✕</button>
            </div>

            <form className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Role</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" className="p-2.5 rounded-xl border border-teal-500/40 bg-teal-500/10 text-teal-400 text-xs font-medium cursor-pointer">
                    RN <span className="block text-[10px] text-zinc-400">Registered</span>
                  </button>
                  <button type="button" className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 text-xs font-medium hover:border-zinc-700 cursor-pointer">
                    LPN <span className="block text-[10px] text-zinc-500">Practical</span>
                  </button>
                  <button type="button" className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-400 text-xs font-medium hover:border-zinc-700 cursor-pointer">
                    CNA <span className="block text-[10px] text-zinc-500">Assistant</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Date (MM/DD/YYYY)</label>
                <div className="relative">
                  <input
                    type="text"
                    defaultValue="11/09/2026"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                  />
                  <span className="absolute right-3.5 top-3 text-zinc-500 text-xs">📅</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Start time</label>
                  <input
                    type="text"
                    defaultValue="07:00 a.m."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">End time</label>
                  <input
                    type="text"
                    defaultValue="19:00 p.m."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3.5 text-xs text-zinc-400 flex items-center gap-3">
                <span>ℹ️</span>
                <span>Facility-local time, 24-hour. Ending earlier than start is overnight shift.</span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-800">
                <button type="button" className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer transition-all shadow-sm">
                  Post shift
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* MODAL: Nurse Information & Credentials (Triggered when clicking a nurse claim request) */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-medium text-xs text-zinc-200">
                  ML
                </div>
                <div>
                  <h2 className="text-base font-medium text-zinc-100">Maria Lopez</h2>
                  <p className="text-xs text-zinc-400">Requested Claim • LPN Role</p>
                </div>
              </div>
              <button className="text-zinc-500 hover:text-zinc-300 text-sm cursor-pointer">✕</button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Verified Credentials</h3>
                <div className="space-y-2.5">
                  <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-200">Licensed Practical Nurse (LPN)</span>
                        <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full">Verified</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">License #LPN-44920 • Expires: Aug 2027</p>
                    </div>
                  </div>

                  <div className="border border-zinc-800 bg-zinc-950 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-200">TB Screening</span>
                        <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2 py-0.5 rounded-full">Verified</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">Negative Result • Expires: Jan 2027</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-800">
                <button type="button" className="px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 rounded-xl cursor-pointer transition-colors">
                  Decline request
                </button>
                <button type="button" className="bg-teal-500 hover:bg-teal-400 text-zinc-950 text-xs font-semibold px-4 py-2.5 rounded-xl cursor-pointer transition-all shadow-sm">
                  Assign shift to nurse
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  ```[cite: 3, 4]
  ````
  </toggle>

  <image source="notion-file-block://412c822d-b4ad-8091-b0b8-c969bfb427a3/3c482073-c393-4f70-90ab-57a6819e976c?space_id=9a78137e-88f4-4e86-9348-427197c77e2b&name=image.png" />

  - The date must be formatted in the form.
  - The form must be within a modal.
  </li>
  <li>
  Reflect nurses changes so agency can see the list of nurses who requested to claim a shift. 

  - This view must allow each nurse to be clickable, display a modal with nurse information and credentials.
  </li>
  <li>
  Shifts modal

  - The shift modal is showing the shift and nurse Id’s (It cannot be at all). Instead, should display nurse name and an option to see the nurse details in the same screen. Don’t show row Shift ID.

  <image source="notion-file-block://412c822d-b4ad-80d9-a490-d9da1911bcee/3b2ad6e0-0d1e-4631-8fe1-f8f11a6fc685?space_id=9a78137e-88f4-4e86-9348-427197c77e2b&name=image.png" />
  </li>
  <li>
  Agency profile screen <code>/agency/profile</code>:

  <toggle>
  Gemini design

  JavaScript

  # 

  ````txt
  export default function AgencyProfileView(){
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased selection:bg-teal-500 selection:text-zinc-950">
        {/* Top Navigation */}
        <header className="border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-xs">
                  SP
                </div>
                <span className="font-semibold text-sm tracking-tight text-zinc-100">ShiftPatch</span>
              </div>
              <nav className="hidden md:flex items-center gap-1">
                <a href="/agency/shifts" className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">Shifts</a>
                <a href="/agency/profile" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-teal-400 border border-zinc-800 shadow-sm">Agency profile</a>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 hidden sm:inline font-medium">admin@metrocare.example</span>
              <div className="relative group">
                <button className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/40">
                  MC
                </button>
              </div>
              <button className="text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-900 transition-colors cursor-pointer" aria-label="Sign out">
                🚪
              </button>
            </div>
          </div>
        </header>

        {/* Agency Hero Banner */}
        <div className="bg-gradient-to-r from-amber-950/30 via-zinc-900/40 to-zinc-950 border-b border-zinc-800/60 py-8 px-6">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-base shadow-sm">
              MC
            </div>
            <div>
              <span className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">Active Agency</span>
              <h1 className="text-xl font-semibold text-zinc-100 mt-1 tracking-tight">Metro Care Partners</h1>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="max-w-7xl mx-auto px-6 py-10 space-y-8">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">Agency profile</h2>
            <p className="text-xs text-zinc-400 mt-1">Signed in as <span className="text-zinc-200 font-medium">admin@metrocare.example</span>.</p>
          </div>

          {/* Grid of Profile Details & Agencies */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Active Agency Card */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover:border-zinc-700/80 transition-all">
              <div>
                <h3 className="text-sm font-medium text-zinc-200 mb-4 flex items-center gap-2">
                  <span>🏢</span> Active agency details
                </h3>
                <div className="space-y-3.5 text-xs">
                  <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                    <span className="text-zinc-500">Name</span>
                    <span className="font-medium text-zinc-200">Metro Care Partners</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                    <span className="text-zinc-500">Agency ID</span>
                    <span className="font-mono text-zinc-400 text-[11px] bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">agency-b</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-zinc-500">Your role</span>
                    <span className="font-medium text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 text-[10px]">Owner</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Your Agencies List Card */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover:border-zinc-700/80 transition-all">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                    <span>📋</span> Your agencies
                  </h3>
                  <span className="text-[10px] font-medium bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full border border-zinc-700/60">1 Connected</span>
                </div>

                <div className="border border-zinc-800/80 bg-zinc-950/60 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center font-medium text-xs text-amber-400">
                      MC
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-zinc-200">Metro Care Partners</h4>
                      <p className="text-[11px] text-zinc-500">Owner</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-medium bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                    ✓ Current
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-end">
            <button className="flex items-center gap-2 bg-transparent hover:bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium px-4 py-2.5 rounded-xl cursor-pointer transition-all">
              <span>🚪</span> Sign out
            </button>
          </div>
        </main>
      </div>
    );
  }
  ```[cite: 5]
  ````
  </toggle>

  <image source="notion-file-block://412c822d-b4ad-80ca-9b29-d5ce96929c01/2a2be8d3-23dc-4713-8113-d195866bb3ce?space_id=9a78137e-88f4-4e86-9348-427197c77e2b&name=image.png" />

  - Enhance agency profile screen.
  </li>
  </ul>
- Admin view
  <ul>
  <li>
  Enhance dashboard view UI/UX.
  </li>
  <li>
  For all shifts include a view details option to see all the details it has. 
  </li>
  <li>
  The all shifts search is filtering by agency name but not for nurse, it is a lie.
  </li>
  <li>
  Admin needs a screen to watch all users (agencies & nurses) to manage credentials, information, etc.
  </li>
  </ul>
- Global
  <ul>
  <li>
  Apply lazy loaders & loaders.
  </li>
  <li>
  If a list has no items, display a message with an icon of no content.
  </li>
  <li>
  The options within the select inputs should have padding-x to enhance readability, text appears to next to the option corner. 
  </li>
  <li>
  When submitting the form, add a confirm toast so user make sure it filled the right information.
  </li>
  <li>
  Apply cursor pointer on clickable items.
  </li>
  <li>
  Enhance avatar icon at top right 
  </li>
  <li>
  \[Mobile screen\]: Avoid profile on nav tab, instead, allow the avatar icon to be clickable, display a dropdown with two options: Profile (navs to profile screen) & Sign out.
  </li>
  <li>
  \[Web screen\]: The content displayed on main layer is positioned to the left, re-position it to the center.

  <image source="notion-file-block://412c822d-b4ad-8033-9611-faac47ee8c5b/39107e98-cd5d-4dd2-81fe-dda8355c666b?space_id=9a78137e-88f4-4e86-9348-427197c77e2b&name=image.png" />
  </li>
  <li>
  All filters must filter server-side by making the request again using params instead of filtering locally.
  </li>
  </ul>

<p />
</content>
</page>