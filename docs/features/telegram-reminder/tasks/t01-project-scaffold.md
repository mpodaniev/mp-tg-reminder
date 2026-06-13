---
id: T01
title: "Bootstrap project scaffold (package.json, tsconfig, directory structure, .env.example)"
layer: "wiring"
deps: []
acs: []
files_hint:
  - package.json
  - tsconfig.json
  - .env.example
  - src/domain/
  - src/app/
  - src/infra/
  - src/ports/
  - src/scheduler/
  - src/main.ts
owner: "Mykhailo Podaniev"
estimate: "S"
status: "todo"
---

# T01 — Bootstrap project scaffold

## Why

Greenfield project — no `src/`, no `package.json` exists (verified 2026-06-13). All subsequent tasks depend on a compilable TypeScript project with the directory skeleton declared by [sad.md §5](../sad.md).

## What

1. `package.json` — `"type": "module"`, scripts (`build`, `start`, `test`, `migrate:up`, `migrate:down`), deps: `grammy`, `better-sqlite3`; devDeps: `typescript`, `@types/node`, `@types/better-sqlite3`, `vitest`.
2. `tsconfig.json` — `strict: true`, `moduleResolution: Bundler`, `target: ES2022`, `outDir: dist`.
3. Directory skeleton: `src/{domain,app,infra,ports,scheduler}/index.ts` (barrel stubs) + `src/main.ts` (empty).
4. `.env.example` — `BOT_TOKEN=`, `OWNER_TELEGRAM_ID=`, `DB_PATH=./data/reminders.db`, `SCHEDULER_INTERVAL_MS=15000`.
5. `.gitignore` additions: `dist/`, `data/`, `.env`.

No implementation code — only types, stubs, and project config.

## Definition of Done

- [ ] `npm install` completes without errors
- [ ] `tsc --noEmit` passes (zero type errors on empty stubs)
- [ ] `npm test` exits 0 with "no test files found" or equivalent
- [ ] Directory tree matches `sad.md §5` decomposition
- [ ] lint + vet clean

## Notes

Stack locked by [ADR-0001](../adr/0001-node-typescript-grammy-runtime.md) (Node 22 / TypeScript / grammY) and [ADR-0002](../adr/0002-sqlite-embedded-store.md) (better-sqlite3). Do not introduce additional runtime deps beyond these two.
