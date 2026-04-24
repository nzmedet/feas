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
- [x] Release preflight gates (doctor, clean-git enforcement for real releases, metadata validation)
- [x] Build-number/versionCode bumping for Expo `app.json`, simple `app.config.*`, iOS `Info.plist`, and Android Gradle files
- [x] Project detection for Expo, React Native, and hybrid apps
- [x] Safe Expo CNG behavior: native folders are not regenerated unless `--prebuild` is explicit
- [x] Release stops with an actionable message when the requested `eas.json` build profile is missing
- [x] `feas logs`
- [x] `feas metadata` (`pull/push/validate/open`)
- [x] `feas credentials` (`ios/android/list/validate`, interactive prompts, reusable local profiles)
- [x] `feas clean`
- [x] `feas open`
- [x] npm packaging metadata for `feas` and workspace packages

### Persistence / Data
- [x] Prisma schema for projects/builds/submissions/releases/doctor checks
- [x] SQLite migration + runtime migration application
- [x] Build/submission/release/doctor records persisted

### Local API
- [x] Token-protected local API server
- [x] Project/build/release/submission read endpoints
- [x] Project initialization endpoint for dashboard-entered mobile project paths
- [x] Doctor run endpoint
- [x] Build/release run endpoints
- [x] Submit run endpoint
- [x] Metadata read/write/pull/push/validate endpoints
- [x] Optional real metadata pull/push path through internal Fastlane lanes
- [x] Metadata write path traversal protection
- [x] Credentials read/configure endpoints
- [x] Logs list/read/stream endpoints

### Dashboard
- [x] Vite + React dashboard package
- [x] API-backed views: overview/builds/releases/submissions/doctor/metadata/credentials/logs
- [x] Initialize project by mobile project path
- [x] Quick actions: run doctor/build/submit/release
- [x] Explicit Expo prebuild opt-in control
- [x] Dashboard action feedback distinguishes running/success/error states
- [x] Metadata editor + metadata pull/push/validate actions
- [x] Credentials forms (iOS + Android)
- [x] EAS-inspired layout and interaction structure (not a clone)
- [x] Distinct success/warn/fail status treatment
- [x] Build/submission/release tables expose artifact/log/version context where available

### Verification
- [x] Monorepo `typecheck` passes
- [x] Monorepo `build` passes
- [x] CLI smoke test added (`node:test` over init/config/build/submit/release/metadata dry-run flow)
- [x] GitHub Actions CI added (`typecheck` + `build` + test suite)
- [x] API integration test added (`node:test` against running local API server)
- [x] Regression coverage for metadata path traversal, encrypted credential storage, EAS env propagation, release dry-run version bumping, app.config-only detection, and missing release profiles
- [x] npm pack verification for publishable package contents

## In Progress / Next
- [ ] Real App Store / Play metadata pull/push requires validation against credentialed store apps
- [ ] macOS Keychain backend for secrets (encrypted local file is the current default)
- [ ] Version bumping for complex dynamic `app.config.ts` logic and Xcode project build settings beyond `Info.plist`
- [ ] Expand automated tests (unit + dashboard browser smoke)
- [ ] Streaming dashboard progress for long-running real builds
- [ ] Add richer release history drill-down and links between run artifacts
- [ ] Dashboard selector for reusable credential profiles
- [ ] Expand metadata locale handling beyond current defaults

## Notes
- This file is intended as the live progress checklist for the repo.
- Update checkboxes as work lands so project state is always visible at a glance.
