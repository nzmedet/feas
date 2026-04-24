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

# metadata
node packages/cli/dist/index.js metadata pull ios
node packages/cli/dist/index.js metadata validate ios
node packages/cli/dist/index.js metadata push ios

# credentials
node packages/cli/dist/index.js credentials ios --key-id <KEY_ID> --issuer-id <ISSUER_ID> --private-key-path <PATH_TO_P8>
node packages/cli/dist/index.js credentials android --service-account-path <PATH_TO_JSON>
node packages/cli/dist/index.js credentials validate

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
- Quick actions for doctor/build/submit/release
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
- Real store submission and native build behavior depends on your local machine/toolchain and credential correctness.
- Metadata reading currently focuses on locale path `en-NZ`.
