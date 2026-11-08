// QA tool: real local app + API, 5 viewports per role. Usage (from apps/web): QA_PASSWORD=<spec password> node scripts/qa-responsive.mjs <outDir>. Logs in once per role (refresh limiter: 30/min/IP).
/* global process, console, document, getComputedStyle */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = process.argv[2];
if (!OUT || !process.env.QA_PASSWORD) {
  console.error("usage (from apps/web): QA_PASSWORD=<spec password> node scripts/qa-responsive.mjs <outDir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const VIEWPORTS = [
  ["360", 360, 800],
  ["390", 390, 844],
  ["768", 768, 1024],
  ["1440", 1440, 900],
  ["1920", 1920, 1080],
];
const PASSWORD = process.env.QA_PASSWORD; // spec password, passed via env, never logged
const ROLES = [
  { role: "login", email: null, pages: ["/login"] },
  { role: "nurse", email: "maria.lopez@example.com", pages: ["/nurse/shifts", "/nurse/my-shifts", "/nurse/credentials", "/nurse/profile"] },
  { role: "agency", email: "admin@sunrisehealth.example", pages: ["/agency/shifts", "/agency/profile"] },
  { role: "admin", email: "alex.kim@example.com", pages: ["/admin/dashboard", "/admin/audit", "/admin/timesheets"] },
];

const measure = () => {
  const vw = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth - vw;
  const offenders = [...document.querySelectorAll("body *")]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; })
    .slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`);
  const small = [...document.querySelectorAll("a[href],button,input,select,[role=button],[role=tab]")]
    .filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && s.visibility !== "hidden" && (r.width < 44 || r.height < 44) && !(e.tagName === "INPUT" && r.height >= 44); })
    .map((e) => `${(e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
  const main = document.querySelector("main");
  const mr = main?.getBoundingClientRect();
  const nav = [...document.querySelectorAll("nav")].filter((n) => n.getBoundingClientRect().width > 0).map((n) => `${n.getAttribute("aria-label")}@${Math.round(n.getBoundingClientRect().top)}`);
  const minFont = Math.min(...[...document.querySelectorAll("body *")].filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()) && e.getBoundingClientRect().width > 0).map((e) => parseFloat(getComputedStyle(e).fontSize)));
  return { vw, overflow, offenders, small, main: mr ? { x: Math.round(mr.x), w: Math.round(mr.width) } : null, nav, minFont, h1: document.querySelector("h1")?.textContent?.trim() ?? null, title: document.title };
};

const results = [];
const browser = await chromium.launch();
for (const r of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  if (r.email) {
    await page.getByTestId("login-email-input").fill(r.email);
    await page.getByTestId("login-password-input").fill(PASSWORD);
    await page.getByTestId("login-submit-button").click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  }
  for (const [label, width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const p of r.pages) {
      if (p !== "/login") await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const m = await page.evaluate(measure);
      const file = `${r.role}${p.replaceAll("/", "-")}-${label}.png`;
      await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
      results.push({ role: r.role, page: p, viewport: `${width}x${height}`, ...m, consoleErrors: [...consoleErrors], file });
      consoleErrors.length = 0;
    }
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}/metrics.json`, JSON.stringify(results, null, 2));
console.log(`done ${results.length} captures`);
