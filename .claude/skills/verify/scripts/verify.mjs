#!/usr/bin/env node
// Run the ShiftPatch quality gates in order (cheapest first) and print a pass/fail table.
// Sequential on purpose: this machine is memory-constrained, parallel tsc + vitest can exhaust the pagefile.
//
// Usage (from repo root):  node .claude/skills/verify/scripts/verify.mjs [--only a,b] [--skip a,b]
// Steps map to root package.json scripts:
//   typecheck -> "typecheck"   lint -> "lint"   test -> "test"   contract -> "test:contract"
// A step whose script is missing is reported SKIP (not FAIL) so the gate works before code exists.
// Exit code: 0 if nothing failed, 1 otherwise.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const STEPS = [
  { id: "typecheck", script: "typecheck" },
  { id: "lint", script: "lint" },
  { id: "test", script: "test" },
  { id: "contract", script: "test:contract" },
];
const TAIL = 40;

const args = process.argv.slice(2);
const list = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1].split(",").map((s) => s.trim()) : null;
};
const only = list("--only");
const skip = list("--skip") ?? [];

let scripts = {};
if (existsSync("package.json")) {
  scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {};
} else {
  console.log("No package.json at repo root - no code yet, every step SKIP.\n");
}

const results = [];
for (const step of STEPS) {
  if ((only && !only.includes(step.id)) || skip.includes(step.id)) {
    results.push({ ...step, status: "SKIP", note: "excluded by flag" });
    continue;
  }
  if (!scripts[step.script]) {
    results.push({ ...step, status: "SKIP", note: `no "${step.script}" script` });
    continue;
  }
  process.stdout.write(`> pnpm run ${step.script} ... `);
  const t0 = Date.now();
  const r = spawnSync("pnpm", ["run", step.script], {
    encoding: "utf8",
    shell: true, // pnpm is a .cmd shim on Windows
    env: { ...process.env, CI: "true", FORCE_COLOR: "0" }, // CI=true: vitest runs once, no watch mode
    maxBuffer: 64 * 1024 * 1024,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"} (${secs}s)`);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trimEnd();
  results.push({ ...step, status: ok ? "PASS" : "FAIL", note: `${secs}s`, tail: ok ? "" : out.split("\n").slice(-TAIL).join("\n") });
}

console.log("\n| Step | Result | Note |\n|---|---|---|");
for (const r of results) console.log(`| ${r.id} | ${r.status} | ${r.note} |`);

for (const r of results.filter((x) => x.status === "FAIL")) {
  console.log(`\n--- ${r.id}: last ${TAIL} lines ---\n${r.tail}`);
}

const failed = results.filter((r) => r.status === "FAIL").length;
const passed = results.filter((r) => r.status === "PASS").length;
console.log(`\nVERDICT: ${failed ? "RED" : passed ? "GREEN" : "NOTHING RAN"} - ${passed} pass, ${failed} fail, ${results.length - passed - failed} skip`);
process.exit(failed ? 1 : 0);
