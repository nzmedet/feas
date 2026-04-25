# FEAS

Local release automation for Expo and React Native apps.

FEAS gives you:
- CLI (`feas`)
- Local dashboard (`feas open`)
- Local metadata/build/release tooling with your own machine credentials

## Install

```bash
npm install -g @nzmedet/feas
```

Check install:

```bash
feas --version
feas --help
```

## Requirements

- Node.js 20+
- A project with `package.json` and `eas.json`

For real build/submit/metadata sync (`--real` or non-dry-run), you also need:
- Fastlane
- iOS: Xcode + App Store Connect API key
- Android: SDK/Gradle + Play service account

## Quick Start

Run inside your app project root:

```bash
cd /path/to/your/app
feas init
```

Inspect setup:

```bash
feas config --json
feas doctor
```

## Common Commands

### Build

```bash
# safe preview
feas build all --dry-run

# real build
feas build ios
feas build android
```

### Submit

```bash
# dry-run submit
feas submit ios --path dist/app.ipa --dry-run

# real submit
feas submit ios --path dist/app.ipa
```

### Release

```bash
# dry-run release
feas release ios --dry-run --skip-submit

# real release
feas release ios
```

### Metadata

```bash
# local placeholders / validation workflow
feas metadata pull ios
feas metadata validate ios

# real App Store / Play metadata sync
feas metadata pull --real ios
feas metadata push --real ios
```

Notes:
- FEAS does not force a specific locale folder (for example, `en-AU`, `en-US`, etc. are handled dynamically).
- Metadata files may be empty if store fields are empty/optional.

### Credentials

```bash
feas credentials ios
feas credentials android
feas credentials validate
```

Reusable local profiles:

```bash
feas credentials ios --key-id <KEY_ID> --issuer-id <ISSUER_ID> --private-key-path <PATH_TO_P8> --save-as personal-apple
feas credentials android --service-account-path <PATH_TO_JSON> --save-as personal-google
feas credentials list
feas credentials ios --use personal-apple
feas credentials android --use personal-google
```

### Logs and Cleanup

```bash
feas logs --latest --raw
feas clean
```

## Dashboard

Start local API + dashboard:

```bash
feas open --port 4545
```

Open the printed URL (includes required token query parameter).

## Troubleshooting

### `@prisma/client did not initialize yet`

If your npm setup skipped install scripts, run:

```bash
prisma generate --schema "$(npm root -g)/@nzmedet/feas/packages/db/prisma/schema.prisma"
```

### Version mismatch after publish

Force specific install:

```bash
npm install -g @nzmedet/feas@<version> --force
```

## Development

Contributor instructions are in [DEVELOPMENT.md](./DEVELOPMENT.md).
