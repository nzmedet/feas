# FEAS Project Status

Last updated: 2026-04-24

## Current Snapshot
- Monorepo: `pnpm` workspace with services under `packages/`
- Stack: TypeScript, Prisma/SQLite, Fastlane integration, local API, React dashboard
- Latest commit: use `git log --oneline -n 1`

## Checklist

### Foundation
- [x] Monorepo scaffolded (`packages/cli`, `packages/core`, `packages/api`, `packages/db`, `packages/dashboard`)
- [x] `pnpm` workspace setup and scripts
- [x] TypeScript project wiring across packages

### Core CLI
- [x] `feas init` (project detection + local FEAS state)
- [x] `feas doctor` (checks + persistence)
- [x] `feas build` (dry-run + real lane execution)
- [x] `feas submit` (dry-run + real submission paths)
- [x] `feas release` (build + submit orchestration)
- [x] `feas logs`
- [x] `feas metadata` (`pull/push/validate/open`)
- [x] `feas credentials` (`ios/android/validate`)
- [x] `feas clean`
- [x] `feas open`

### Persistence / Data
- [x] Prisma schema for projects/builds/submissions/releases/doctor checks
- [x] SQLite migration + runtime migration application
- [x] Build/submission/release/doctor records persisted

### Local API
- [x] Token-protected local API server
- [x] Project/build/release/submission read endpoints
- [x] Doctor run endpoint
- [x] Build/release run endpoints
- [x] Submit run endpoint
- [x] Metadata read/write/pull/push/validate endpoints
- [x] Credentials read/configure endpoints
- [x] Logs list/read/stream endpoints

### Dashboard
- [x] Vite + React dashboard package
- [x] API-backed views: overview/builds/releases/submissions/doctor/metadata/credentials/logs
- [x] Quick actions: run doctor/build/submit/release
- [x] Metadata editor + metadata pull/push/validate actions
- [x] Credentials forms (iOS + Android)
- [x] EAS-inspired layout and interaction structure (not a clone)

### Verification
- [x] Monorepo `typecheck` passes
- [x] Monorepo `build` passes
- [x] CLI smoke test added (`node:test` over init/config/build/submit/release/metadata dry-run flow)
- [x] GitHub Actions CI added (`typecheck` + `build` + test suite)
- [x] API integration test added (`node:test` against running local API server)

## In Progress / Next
- [ ] Expand automated tests (unit + dashboard smoke)
- [ ] Improve dashboard action feedback (streaming/progress states)
- [ ] Add richer release history drill-down and links between run artifacts
- [ ] Harden credential UX (validation hints + safer path checks)
- [ ] Expand metadata locale handling beyond current defaults

## Notes
- This file is intended as the live progress checklist for the repo.
- Update checkboxes as work lands so project state is always visible at a glance.
