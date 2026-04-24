# FEAS

Local release automation for Expo/React Native apps with a CLI, local API, and dashboard.

## Current Status
- Project progress checklist: [docs/status.md](./docs/status.md)
- Spec: [docs/spec.md](./docs/spec.md)

## Monorepo Layout
- `packages/cli`: `feas` command-line interface
- `packages/core`: core workflows (init/build/submit/release/doctor/metadata/credentials)
- `packages/api`: token-protected local API server
- `packages/db`: Prisma + SQLite persistence helpers
- `packages/dashboard`: Vite + React dashboard UI
- `tests/`: smoke and integration tests

## Requirements
- Node.js 22+
- pnpm 10+
- macOS/Linux shell (tested in zsh)

For real (non-dry-run) native/release actions you also need:
- Fastlane
- iOS toolchain/Xcode (for iOS real builds/submits)
- Android SDK/Gradle setup (for Android real builds/submits)
- Valid App Store Connect / Google Play credentials

## Install
```bash
pnpm install
```

After npm publishing:
```bash
npm install -g feas
feas --help
```

## Build + Validate
```bash
pnpm typecheck
pnpm build
pnpm test
```

## CLI Usage
Run via dev script:
```bash
pnpm dev
```

Or run built CLI directly:
```bash
node packages/cli/dist/index.js --help
```

### Initialize a project
Run inside your Expo/React Native app repository (must contain `package.json` and `eas.json`):
```bash
node packages/cli/dist/index.js init
```

FEAS reads `app.json`, simple static `app.config.ts`, and simple static `app.config.js` values. It detects Expo, React Native, or hybrid projects from dependencies and config files.

Optional environment variable:
- `FEAS_HOME`: override local FEAS state directory (default: `~/.feas`)

### Core commands
```bash
# inspect
node packages/cli/dist/index.js config --json
node packages/cli/dist/index.js doctor --json

# build / submit / release
node packages/cli/dist/index.js build all --dry-run --json
node packages/cli/dist/index.js submit ios --path dist/app.ipa --dry-run --json
node packages/cli/dist/index.js release ios --dry-run --skip-submit --json

# Expo CNG / managed projects
# FEAS will not regenerate ios/ or android/ unless this flag is explicit.
node packages/cli/dist/index.js build ios --profile production --prebuild
node packages/cli/dist/index.js release ios --profile production --prebuild

# metadata
node packages/cli/dist/index.js metadata pull ios
node packages/cli/dist/index.js metadata validate ios
node packages/cli/dist/index.js metadata push ios

# real store metadata sync after credentials are configured
node packages/cli/dist/index.js metadata pull ios --real
node packages/cli/dist/index.js metadata push ios --real

# credentials
node packages/cli/dist/index.js credentials ios
node packages/cli/dist/index.js credentials android
node packages/cli/dist/index.js credentials validate

# reusable local credential profiles
node packages/cli/dist/index.js credentials ios --key-id <KEY_ID> --issuer-id <ISSUER_ID> --private-key-path <PATH_TO_P8> --save-as personal-apple
node packages/cli/dist/index.js credentials android --service-account-path <PATH_TO_JSON> --save-as personal-google
node packages/cli/dist/index.js credentials list
node packages/cli/dist/index.js credentials ios --use personal-apple
node packages/cli/dist/index.js credentials android --use personal-google

# logs and cleanup
node packages/cli/dist/index.js logs --latest --raw
node packages/cli/dist/index.js clean
```

## Dashboard Usage
Start local API + dashboard:
```bash
node packages/cli/dist/index.js open --port 4545
```

You will get a URL with a token query parameter (required for API calls), for example:
- `http://localhost:4545/?token=...`

Dashboard supports:
- Overview/builds/releases/submissions/doctor/metadata/credentials/logs views
- Initializing FEAS by entering an existing mobile project path
- Quick actions for doctor/build/submit/release
- Explicit `Allow Expo prebuild` control for CNG projects without native folders
- Metadata pull/validate/push and file editing
- Credentials configuration forms for iOS/Android

## Testing
### Smoke test
```bash
pnpm test:smoke
```

### API integration tests
```bash
pnpm test:integration
```

### Full suite
```bash
pnpm test
```

## Notes and Limitations
- Dry-run flows are the safest way to verify setup quickly.
- Real releases require the selected `eas.json` build profile, usually `build.production`; FEAS stops if it is missing.
- FEAS does not run Expo prebuild automatically. Use `--prebuild` or the dashboard checkbox only when regenerating native folders is acceptable.
- Real store submission and native build behavior depends on your local machine/toolchain and credential correctness.
- Metadata reading currently focuses on locale path `en-NZ`.
- Dynamic `app.config.ts` files are only partially parsed. If values are computed, verify `feas config --json` before real release.

## Publishing
The npm package is split into `feas` plus internal public packages. Publish with the same version in dependency order:

```bash
pnpm typecheck
pnpm build
pnpm test

cd packages/db && pnpm publish --tag beta
cd ../dashboard && pnpm publish --tag beta
cd ../core && pnpm publish --tag beta
cd ../api && pnpm publish --tag beta
cd ../cli && pnpm publish --tag beta
cd ../.. && pnpm publish --tag beta
```
