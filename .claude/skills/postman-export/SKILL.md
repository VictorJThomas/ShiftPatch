---
name: postman-export
description: Export ShiftPatch's backend API (zod contract schemas from packages/contracts + the routes registered in apps/api) as an importable Postman v2.1 collection with local/prod environments in docs/postman/, and check it is current. Use whenever the user says "postman", "export the API", "API collection", "share the endpoints", "regenerate the collection", "insomnia/bruno/hoppscotch import", wants graders or the founder to try the API by hand, or after adding/changing a route or a schema in packages/contracts (the committed collection goes stale otherwise).
---

# /postman-export — API as a Postman collection

`docs/postman/` holds a generated, committed Postman collection so anyone (graders, founder, Victor) can import the API and call it without reading code. It is generated, never hand-edited: the schemas come from `@shiftpatch/contracts` and the route list from the real Fastify app, so it can't silently disagree with what the API enforces.

## Run

From repo root (`tsx` is needed to import the TS sources, it lives in `apps/api`):

```
pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs           # regenerate
pnpm --filter api exec tsx ../../.claude/skills/postman-export/scripts/export.mjs --check   # verify only
```

`--check` writes nothing and exits 1 if the committed files differ from a fresh export or a self-test fails. Use it before committing route/schema changes; use the plain run to fix it.

On any non-zero exit pnpm appends `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "tsx" not found`. That line is pnpm noise, not the cause: read the script's own `FAIL` list above it.

Output (all three are committed):
- `docs/postman/ShiftPatch.postman_collection.json`
- `docs/postman/ShiftPatch-local.postman_environment.json` (`baseUrl` = `http://localhost:3001`)
- `docs/postman/ShiftPatch-prod.postman_environment.json` (`baseUrl` = Vercel origin; `/api/*` is rewritten to Railway)

## What the collection contains

- **1. Auth**: one login per seeded user (spec seed data, password `Trial2026!` is public spec data). A test script stores `token` in the active environment, and the collection's bearer auth sends `{{token}}` on every other request.
- **2. Shifts / 3. Agencies**: the 6 required spec routes with example bodies and path variables (`:id`, `:agencyId`).
- **4. Other routes**: anything else registered in `apps/api` (e.g. `/api/health`), listed without schemas.
- Every required request carries a **contract test**: a success body must match the route's JSON Schema (generated from the zod response schema, `additionalProperties: false` = exact keys); an error body must be exactly `{ "error": "..." }`. The request schema is in each request's description.
- Required routes with no handler yet are marked **Not implemented yet** in their description, and the script prints them. That's expected before stages 3-4, not a failure.

## When routes or schemas change

The required routes live in the `REQUIRED` table at the top of `scripts/export.mjs`, each mapped to its contract schemas. That table is the only hand-maintained part:
- A schema changed in `packages/contracts` → just regenerate; nothing to edit.
- A new spec-like route that should get a schema + contract test → add a row to `REQUIRED` (folder, name, method, path, `req`/`res` schema, example `body`/`params`, short `doc`).
- A new non-spec route → nothing to do; it shows up under "4. Other routes" automatically.

Then regenerate, run `--check`, and commit the `docs/postman/` diff with the code change so the two never drift.

## Report

One line: files written/checked, request count, routes still not implemented, `OK`/`FAIL` with the listed problems. If the script warns that the Fastify app could not be built (e.g. it later needs a DB at startup), the export still runs from the `REQUIRED` table, but say the route check was skipped.

## Limits

- Route discovery parses `app.printRoutes()` text (Fastify has no route-list API). If a Fastify upgrade changes that format, "Other routes" goes empty: fix the regex in `export.mjs`.
- The Postman test scripts use `pm.response.to.have.jsonSchema` (Postman's built-in Ajv). The schemas target draft-07, which that supports.
