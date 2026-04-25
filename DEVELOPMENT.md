# Development

Internal contributor docs for `@nzmedet/feas`.

## Monorepo Layout

- `packages/cli`: `feas` command
- `packages/core`: core workflows
- `packages/api`: local API server
- `packages/db`: Prisma + SQLite helpers
- `packages/dashboard`: dashboard UI
- `tests/`: smoke and integration tests

## Requirements

- Node.js 20+
- pnpm 10+

## Setup

```bash
pnpm install
```

## Build and Test

```bash
pnpm typecheck
pnpm build
pnpm test
```

Targeted runs:

```bash
pnpm test:smoke
pnpm test:integration
pnpm --filter feas-cli build
pnpm --filter feas-dashboard build
```

## Run CLI Locally

```bash
pnpm dev -- --help
pnpm dev -- init
pnpm dev -- doctor
```

Or run compiled CLI:

```bash
node packages/cli/dist/index.js --help
```

## Local Packaging

```bash
pnpm build
npm pack
npm install -g ./nzmedet-feas-<version>.tgz
```

## Publish

```bash
npm version patch   # or minor/major
pnpm typecheck
pnpm build
pnpm test
npm publish --access public
```

Verify:

```bash
npm view @nzmedet/feas version dist-tags --json
```

## Notes

- CLI version is resolved from package metadata at runtime.
- Metadata locale handling is dynamic (no hardcoded `en-NZ`).
- `--real` metadata commands use Fastlane + configured credentials.
