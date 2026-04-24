# FEAS Technical Specification

## 1. Product Summary

**FEAS** is a local-first, open-source CLI and local dashboard for building, submitting, and managing Expo / React Native app releases without using paid cloud build infrastructure.

FEAS is not a cloud build service. It runs on the developer’s machine, wraps proven native tooling, hides Fastlane complexity from the normal user experience, and provides an EAS-like workflow for solo developers.

### Core promise

```bash
feas init
feas release ios --profile production
feas release android --profile production
feas open
```

The user should not need to understand Fastlane, `xcodebuild`, Gradle, provisioning profiles, App Store Connect upload commands, or Play Console upload mechanics to ship a release.

---

## 2. Scope

### In scope for MVP

* Local CLI tool named `feas`
* Local-only dashboard opened via `feas open`
* Expo / React Native app detection
* Reuse existing `eas.json` build profiles
* No user-facing `feas.config.ts`
* Internal FEAS state stored under `~/.feas`
* Fastlane used internally but hidden from normal UX
* iOS local release builds
* Android local release builds
* App Store Connect submission
* Google Play submission
* Build number / version code bumping
* Build logs
* Artifact storage
* Release history
* Store metadata editing and syncing
* Basic credential validation
* Human-readable error translation

### Permanently out of scope

FEAS is intentionally local-first. The following features are not planned for MVP or later versions because they conflict with the product direction:

* Hosted cloud builds
* Hosted user accounts
* Team collaboration
* OTA updates
* Expo update branches/channels
* Webhook system
* Hosted artifact sharing links
* Remote dashboard
* Multi-tenant SaaS infrastructure

The following is not a product goal, but may be revisited only if Fastlane becomes a blocker:

* Full replacement of Fastlane internals

---

## 3. Design Principles

### 3.1 Local-first

All builds, submissions, logs, artifacts, and dashboard data live locally.

No FEAS cloud account is required.

### 3.2 Hide implementation details

Users interact with:

```bash
feas release ios
```

They should not normally see:

```bash
bundle exec fastlane ios release
xcodebuild archive
./gradlew bundleRelease
```

However, raw logs must remain accessible for debugging.

### 3.3 Reuse `eas.json`

FEAS should read existing `eas.json` profiles instead of introducing another required config file.

Example:

```json
{
  "build": {
    "development": {},
    "preview": {},
    "production": {
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "app-bundle"
      },
      "env": {
        "EXPO_PUBLIC_ENVIRONMENT": "production"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {},
      "android": {}
    }
  }
}
```

FEAS ignores unsupported EAS-cloud-only fields where needed and uses compatible fields for local release orchestration.

### 3.4 Internal config is hidden

FEAS may maintain internal config under:

```txt
~/.feas/
```

Users edit internal config through the dashboard, not by hand.

### 3.5 Debuggability over magic

Normal mode should be clean.

Verbose mode should expose everything.

```bash
feas release ios --verbose
feas logs --raw
```

---

## 4. High-Level Architecture

```txt
FEAS CLI
  ├─ command layer
  ├─ project detector
  ├─ eas.json reader
  ├─ profile resolver
  ├─ version manager
  ├─ credential manager
  ├─ metadata manager
  ├─ build orchestrator
  ├─ submit orchestrator
  ├─ log manager
  ├─ artifact manager
  ├─ local database
  ├─ local dashboard API
  └─ internal Fastlane adapter
```

### Main technologies

* CLI: Node.js + TypeScript
* CLI framework: oclif or Commander
* Local API: Fastify
* Dashboard: Vite + React + HeroUI + Tailwind
* Styling: Tailwind CSS
* Local database: SQLite
* ORM/query layer: Prisma
* Internal release engine: Fastlane
* iOS build engine: Fastlane + Xcode / `xcodebuild`
* Android build engine: Fastlane + Gradle
* Package manager support: npm, pnpm, yarn, bun detection

---

## 5. Directory Structure

### 5.1 User project

FEAS should avoid polluting the app repository.

Expected project:

```txt
my-app/
  app.json | app.config.ts
  eas.json
  package.json
  ios/
  android/
```

FEAS should not introduce new ignore files.

If present, reuse:

```txt
.easignore
```

Do not generate visible `feas.config.ts` in MVP.

### 5.2 Global FEAS directory

```txt
~/.feas/
  config.json
  projects/
    <projectHash>/
      project.json
      internal.config.json
      database.sqlite
      fastlane/
        Fastfile
        Appfile
        Pluginfile
      metadata/
        ios/
        android/
      artifacts/
        ios/
        android/
      logs/
        builds/
        submissions/
        releases/
      credentials/
        references.json
      cache/
```

### 5.3 Project identity

A project is identified by a stable hash of:

```txt
absolute project root path + package name + bundle identifier
```

Store mapping in:

```txt
~/.feas/config.json
```

Example:

```json
{
  "projects": {
    "a13f...": {
      "name": "MyDay",
      "root": "/Users/medet/dev/myday",
      "lastOpenedAt": "2026-04-24T01:00:00.000Z"
    }
  }
}
```

---

## 6. Configuration Model

### 6.1 User-facing config

Primary config source:

```txt
eas.json
```

FEAS reads:

* `build.<profile>.env`
* `build.<profile>.ios`
* `build.<profile>.android`
* `submit.<profile>.ios`
* `submit.<profile>.android`
* `cli.version` where relevant

FEAS should tolerate unknown EAS fields.

### 6.2 Internal FEAS config

Stored at:

```txt
~/.feas/projects/<projectHash>/internal.config.json
```

Example:

```json
{
  "schemaVersion": 1,
  "projectRoot": "/Users/medet/dev/myday",
  "displayName": "MyDay",
  "platforms": {
    "ios": {
      "bundleIdentifier": "nz.medett.myday",
      "scheme": "MyDay",
      "workspacePath": "ios/MyDay.xcworkspace",
      "exportMethod": "app-store",
      "appleTeamId": "ABCDE12345",
      "appStoreConnectAppId": "1234567890"
    },
    "android": {
      "applicationId": "nz.medett.myday",
      "gradleTask": ":app:bundleRelease",
      "playPackageName": "nz.medett.myday"
    }
  },
  "release": {
    "defaultProfile": "production",
    "bumpStrategy": "build-number",
    "requireCleanGit": true,
    "autoCommitVersionBump": false
  },
  "metadata": {
    "localPath": "metadata",
    "syncMode": "explicit"
  },
  "dashboard": {
    "port": 4545
  }
}
```

This file is not intended to be edited manually.

Dashboard writes to it.

---

## 7. Secrets and Credentials Strategy

The challenge: FEAS must support macOS/iOS and Android workflows without making Keychain mandatory for everything.

### 7.1 Secret storage abstraction

Create a `SecretStore` interface:

```ts
interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
```

Implementations:

```txt
MacOSKeychainSecretStore
EncryptedFileSecretStore
EnvSecretStore
```

### 7.2 Default behavior

On macOS:

* Use macOS Keychain by default for secrets
* Fall back to encrypted file if user explicitly chooses

On Linux:

* Android-only workflows supported
* Use encrypted file or environment variables

On Windows:

* Android-only workflows supported initially
* Use encrypted file or environment variables

### 7.3 Secret types

Secrets include:

* App Store Connect API key metadata
* `.p8` key file content or path
* Google Play service account JSON path/content
* Android keystore passwords
* Android key alias password
* Optional Fastlane session values if ever supported

### 7.4 Non-secrets

Stored in internal config:

* Team ID
* Bundle ID
* App Store Connect app ID
* Package name
* Paths
* Preferred profile

---

## 8. Fastlane Integration

### 8.1 Principle

Fastlane is an internal implementation detail.

Users should not need to know Fastlane exists.

### 8.2 Internal Fastlane files

Generated under:

```txt
~/.feas/projects/<projectHash>/fastlane/
```

Not inside the user project by default.

### 8.3 Running Fastlane

FEAS invokes Fastlane from the project root but points to internal lanes.

Options:

1. Use `FASTLANE_FASTFILE_PATH` if viable
2. Run Fastlane with working directory set to internal project fastlane folder while passing project root paths explicitly
3. Generate temporary Fastlane execution directory per run

### 8.4 Dependency handling

MVP:

* Require Ruby and Fastlane installed locally
* `feas doctor` detects missing Ruby/Fastlane and gives installation instructions

Later:

* Optional bundled Ruby/Fastlane runtime

### 8.5 Fastlane lanes

Internal lanes:

```ruby
platform :ios do
  lane :build do
    # archive and export ipa
  end

  lane :submit do
    # upload to TestFlight / App Store Connect
  end

  lane :release do
    build
    submit
  end
end

platform :android do
  lane :build do
    # gradle bundleRelease
  end

  lane :submit do
    # upload to Google Play
  end

  lane :release do
    build
    submit
  end
end
```

### 8.6 Log handling

FEAS captures:

* stdout
* stderr
* Fastlane log output
* build artifacts
* raw command
* exit code
* duration

Logs are stored in:

```txt
~/.feas/projects/<projectHash>/logs/
```

FEAS redacts secrets before writing UI-readable logs.

---

## 9. CLI Commands

### 9.1 Final MVP command list

```txt
feas init
feas doctor
feas config
feas build
feas submit
feas release
feas metadata
feas credentials
feas logs
feas open
feas clean
feas help
```

### 9.2 `feas init`

Purpose:

* Detect project type
* Read `eas.json`
* Detect iOS/Android config
* Create internal FEAS project state
* Generate internal Fastlane files
* Prepare local database
* Optionally import metadata

Usage:

```bash
feas init
feas init --profile production
feas init --force
```

Flow:

1. Find project root
2. Validate `package.json`
3. Detect Expo config
4. Detect `eas.json`
5. Detect platforms
6. Create `~/.feas/projects/<projectHash>`
7. Generate internal config
8. Generate internal Fastlane files
9. Create SQLite DB
10. Run initial doctor checks

### 9.3 `feas doctor`

Purpose:

Check if the machine and project are release-ready.

Usage:

```bash
feas doctor
feas doctor ios
feas doctor android
feas doctor --profile production
```

Checks:

General:

* Node version
* package manager
* Git status
* project root
* Expo config validity
* `eas.json` validity
* required scripts

IOS:

* macOS
* Xcode installed
* command line tools selected
* CocoaPods installed
* Ruby installed
* Fastlane installed
* iOS workspace/scheme detected
* bundle identifier detected
* Apple API key configured
* provisioning profile available
* distribution certificate available

Android:

* Java installed
* Android SDK installed
* Gradle available
* Android project exists
* package name detected
* keystore configured
* Google service account configured

Store:

* App Store Connect app exists
* Play Console app exists
* metadata completeness
* privacy URL/support URL present
* release notes present

### 9.4 `feas config`

Purpose:

Show resolved config.

Usage:

```bash
feas config
feas config --profile production
feas config --json
```

Displays:

* resolved project identity
* selected profile
* merged env vars
* iOS settings
* Android settings
* metadata paths
* artifact paths

### 9.5 `feas build`

Purpose:

Build local binary only.

Usage:

```bash
feas build ios --profile production
feas build android --profile production
feas build all --profile production
```

Outputs:

* `.ipa` for iOS
* `.aab` for Android
* dSYM where available
* logs
* build record in SQLite

### 9.6 `feas submit`

Purpose:

Submit existing binary.

Usage:

```bash
feas submit ios --path ./dist/app.ipa
feas submit android --path ./dist/app.aab
```

### 9.7 `feas release`

Purpose:

Main command: bump, build, submit.

Usage:

```bash
feas release ios --profile production
feas release android --profile production
feas release all --profile production
```

Flow:

1. Resolve profile
2. Run preflight doctor subset
3. Check Git state
4. Pull/validate metadata if configured
5. Bump build number/versionCode
6. Build binary
7. Submit binary
8. Persist release record
9. Show dashboard link/log path

Options:

```bash
--profile production
--skip-submit
--skip-build
--no-bump
--verbose
--dry-run
--notes "Release notes"
```

### 9.8 `feas metadata`

Purpose:

Manage local and remote store metadata.

Usage:

```bash
feas metadata pull ios
feas metadata push ios
feas metadata validate
feas metadata open
```

### 9.9 `feas credentials`

Purpose:

Configure and validate credentials.

Usage:

```bash
feas credentials ios
feas credentials android
feas credentials validate
```

### 9.10 `feas logs`

Purpose:

Show logs.

Usage:

```bash
feas logs
feas logs --latest
feas logs --raw
feas logs --id <id>
```

### 9.11 `feas open`

Purpose:

Start local dashboard.

Usage:

```bash
feas open
feas open --port 4545
```

---

## 10. Dashboard

### 10.1 Purpose

The dashboard is a local web interface for inspecting and controlling release workflows.

It should feel similar in category to an EAS dashboard but must be visually distinct.

### 10.2 Stack

* Vite
* React
* TypeScript
* HeroUI React
* Tailwind CSS
* TanStack Query
* React Router
* Monaco editor or CodeMirror for metadata/logs

HeroUI is a React UI library built on Tailwind CSS and React Aria, making it suitable for accessible dashboard components.
Use only built-in Tailwind classes.
Do NOT use arbitrary values like text-[12px], px-[10px], bg-white/80.
Always prefer predefined classes (e.g. text-xs, text-sm, text-base, bg-background, px-2).

### 10.3 Pages

```txt
Dashboard
Projects
Project Overview
Builds
Build Detail
Releases
Release Detail
Artifacts
Logs
Metadata
Credentials
Settings
Doctor
```

### 10.4 Project overview

Shows:

* app name
* project path
* current version
* iOS build number
* Android versionCode
* selected profile
* last release status
* latest build artifacts
* doctor status summary

### 10.5 Builds page

Shows:

* build ID
* platform
* profile
* status
* duration
* artifact path
* date

Actions:

* open artifact folder
* copy artifact path
* view logs
* submit build

### 10.6 Logs page

Features:

* live log stream during active build
* raw logs
* filtered logs
* error highlights
* copied command output
* secret redaction

### 10.7 Metadata page

Allows editing:

IOS:

* app name
* subtitle
* promotional text
* description
* keywords
* support URL
* marketing URL
* privacy policy URL
* release notes
* copyright

Android:

* title
* short description
* full description
* release notes
* contact email
* privacy policy URL

Actions:

```txt
Pull from store
Validate locally
Push to store
View diff
Revert local changes
```

Important rule:

Dashboard edits local metadata first. Remote sync happens only when user clicks push/sync.

### 10.8 Credentials page

Shows status only by default:

* configured/missing
* expiry date where applicable
* team ID
* app ID
* package name

Secrets must never be shown directly after being saved.

### 10.9 Doctor page

Shows grouped checks:

```txt
General
IOS
Android
Store
Metadata
Credentials
```

Each check has:

* status
* explanation
* fix command
* documentation link if needed

---

## 11. Local API

### 11.1 Server

Started by:

```bash
feas open
```

Runs on:

```txt
localhost:4545
```

Only binds to localhost by default.

### 11.2 API endpoints

```txt
GET  /api/projects
GET  /api/projects/:id
GET  /api/projects/:id/config
GET  /api/projects/:id/doctor
POST /api/projects/:id/doctor/run

GET  /api/projects/:id/builds
GET  /api/projects/:id/builds/:buildId
POST /api/projects/:id/builds

GET  /api/projects/:id/releases
POST /api/projects/:id/releases

GET  /api/projects/:id/logs
GET  /api/projects/:id/logs/:logId
GET  /api/projects/:id/logs/:logId/stream

GET  /api/projects/:id/metadata
PUT  /api/projects/:id/metadata
POST /api/projects/:id/metadata/pull
POST /api/projects/:id/metadata/push
POST /api/projects/:id/metadata/validate

GET  /api/projects/:id/credentials
POST /api/projects/:id/credentials/ios
POST /api/projects/:id/credentials/android
```

### 11.3 Security

Because dashboard is local:

* bind to `127.0.0.1`
* random session token per server start
* dashboard URL includes token
* reject requests without token
* do not expose secret values

Example:

```txt
http://localhost:4545?token=abc123
```

---

## 12. Database Schema

SQLite database per project.

### 12.1 `projects`

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 12.2 `builds`

```sql
CREATE TABLE builds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  version TEXT,
  build_number TEXT,
  artifact_path TEXT,
  log_path TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT
);
```

### 12.3 `submissions`

```sql
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  build_id TEXT,
  platform TEXT NOT NULL,
  store TEXT NOT NULL,
  status TEXT NOT NULL,
  remote_id TEXT,
  log_path TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_code TEXT,
  error_message TEXT
);
```

### 12.4 `releases`

```sql
CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  version TEXT,
  build_number TEXT,
  build_id TEXT,
  submission_id TEXT,
  release_notes TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_message TEXT
);
```

### 12.5 `doctor_checks`

```sql
CREATE TABLE doctor_checks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  fix_command TEXT,
  checked_at TEXT NOT NULL
);
```

---

## 13. Metadata Storage Format

Stored under:

```txt
~/.feas/projects/<projectHash>/metadata/
```

### 13.1 iOS metadata

```txt
metadata/ios/en-NZ/name.txt
metadata/ios/en-NZ/subtitle.txt
metadata/ios/en-NZ/promotional_text.txt
metadata/ios/en-NZ/description.txt
metadata/ios/en-NZ/keywords.txt
metadata/ios/en-NZ/support_url.txt
metadata/ios/en-NZ/marketing_url.txt
metadata/ios/en-NZ/privacy_url.txt
metadata/ios/en-NZ/release_notes.txt
```

### 13.2 Android metadata

```txt
metadata/android/en-NZ/title.txt
metadata/android/en-NZ/short_description.txt
metadata/android/en-NZ/full_description.txt
metadata/android/en-NZ/release_notes.txt
metadata/android/en-NZ/privacy_policy_url.txt
```

### 13.3 Metadata sync

FEAS supports:

```bash
feas metadata pull ios
feas metadata push ios
feas metadata pull android
feas metadata push android
```

Dashboard uses the same internal APIs.

---

## 14. Versioning and Build Numbering

### 14.1 Supported strategies

```txt
build-number     increment iOS build number / Android versionCode only
patch            increment semver patch and build number
minor            increment semver minor and build number
major            increment semver major and build number
manual           user provides values
```

MVP default:

```txt
build-number
```

### 14.2 Files FEAS may update

Expo:

* `app.json`
* `app.config.ts` where possible

IOS native:

* `ios/*/Info.plist`
* Xcode project build settings where needed

Android native:

* `android/app/build.gradle`

### 14.3 Safety

Before version bump:

* detect dirty Git state
* show files that will be modified
* support `--dry-run`
* write rollback snapshot

---

## 15. Build Flow

### 15.1 iOS build flow

```txt
resolve profile
load env
validate Xcode
install pods if needed
prepare Fastlane lane
run Fastlane iOS build
capture artifact
capture dSYM
write build record
```

### 15.2 Android build flow

```txt
resolve profile
load env
validate Java/Android SDK
prepare signing config
run Fastlane Android build or Gradle task
capture AAB/APK
write build record
```

### 15.3 Expo prebuild

For Expo projects:

FEAS should detect whether native folders exist.

If missing:

```bash
npx expo prebuild
```

If present:

* default: do not run prebuild automatically
* option: `--prebuild`

Reason: prebuild can modify native folders unexpectedly.

---

## 16. Submit Flow

### 16.1 iOS submit

```txt
resolve App Store Connect API key
validate ipa exists
run Fastlane pilot/upload
capture remote build ID if available
write submission record
```

Use App Store Connect API key when available because it avoids 2FA and is the recommended Fastlane auth path.

### 16.2 Android submit

```txt
resolve Google service account
validate aab exists
run Fastlane supply/upload
select track
commit edit
write submission record
```

Tracks:

```txt
internal
alpha
beta
production
```

MVP default:

```txt
internal
```

---

## 17. Error Translation System

### 17.1 Purpose

Raw tool errors are often unusable. FEAS should map known errors to actionable messages.

### 17.2 Error model

```ts
interface FeasError {
  code: string;
  title: string;
  message: string;
  cause?: string;
  fix?: string;
  rawLogPath?: string;
}
```

### 17.3 Examples

Raw:

```txt
No profiles for 'nz.medett.app' were found
```

FEAS:

```txt
Provisioning profile missing for nz.medett.app.
Run: feas credentials ios repair
```

Raw:

```txt
No matching provisioning profiles found
```

FEAS:

```txt
Your selected signing certificate does not match the provisioning profile.
Run: feas doctor ios --fix
```

Raw:

```txt
Google Api Error: forbidden
```

FEAS:

```txt
Google Play service account does not have permission to upload this package.
Check Play Console > Users and permissions.
```

---

## 18. Logging and Artifacts

### 18.1 Logs

Log types:

```txt
build
submit
release
doctor
metadata
credentials
```

Each log stores:

* timestamp
* platform
* profile
* command
* env summary
* redacted output
* raw output path
* result

### 18.2 Artifacts

Stored under:

```txt
~/.feas/projects/<projectHash>/artifacts/
```

Example:

```txt
artifacts/ios/MyDay-1.0.7-42.ipa
artifacts/ios/MyDay-1.0.7-42.dSYM.zip
artifacts/android/MyDay-1.0.7-42.aab
```

---

## 19. Platform Support

### 19.1 macOS

Supported:

* iOS builds
* Android builds
* iOS submission
* Android submission
* dashboard

### 19.2 Linux

Supported:

* Android builds
* Android submission
* dashboard

Not supported:

* iOS builds

### 19.3 Windows

MVP support:

* Android builds may work
* dashboard works

Not supported:

* iOS builds

---

## 20. Security Requirements

* Never print secret values
* Redact `.p8` contents
* Redact Google service account JSON private key
* Redact keystore passwords
* Redact Apple sessions
* Dashboard must not expose secret values
* Local API must bind to localhost only
* Local API must use per-session token
* Internal config must avoid storing raw secrets where possible

---

## 21. Testing Strategy

### 21.1 Unit tests

Test:

* profile resolver
* eas.json parser
* project detector
* version bumping
* error translation
* metadata validation
* secret store abstraction

### 21.2 Integration tests

Use fixture projects:

```txt
fixtures/expo-managed
fixtures/expo-prebuild
fixtures/rn-bare
fixtures/android-only
```

Test:

* init
* config resolution
* doctor checks
* fake build command execution
* metadata read/write

### 21.3 End-to-end tests

Manual or CI with macOS runner:

* iOS build dry-run
* Android build dry-run
* dashboard starts
* logs stream

Full real store submission tests should use sandbox/test apps.

---

## 22. MVP Milestones

### Milestone 1: CLI skeleton

* Package setup
* `feas init`
* `feas config`
* project detection
* eas.json parsing

### Milestone 2: Doctor

* general checks
* iOS checks
* Android checks
* readable output

### Milestone 3: Internal Fastlane adapter

* generate internal Fastlane files
* run lanes
* capture logs

### Milestone 4: Local builds

* `feas build ios`
* `feas build android`
* artifact capture

### Milestone 5: Submissions

* `feas submit ios`
* `feas submit android`

### Milestone 6: Release command

* version bump
* build
* submit
* release history

### Milestone 7: Dashboard

* local Fastify API
* HeroUI dashboard
* builds page
* logs page
* release history

### Milestone 8: Metadata

* local metadata files
* dashboard editor
* pull/push store metadata

---

## 23. Permanent Non-Goals

FEAS must not become:

* a full EAS cloud clone
* a cloud build provider
* a hosted user-account platform
* a team management platform
* an OTA update platform
* a hosted artifact distribution platform
* a remote dashboard product
* a multi-tenant SaaS platform
* a replacement for Apple/Google review systems

FEAS must remain:

```txt
local release automation for solo Expo/RN developers
```

---

## 24. Product Positioning

Do not market as:

```txt
Free EAS clone
```

Better:

```txt
Open-source local release automation for Expo and React Native apps.
```

Good tagline:

```txt
Ship Expo and React Native apps from your own machine.
```

---

## 25. Final MVP Definition

FEAS MVP is successful when a solo developer can run:

```bash
feas init
feas doctor
feas release ios --profile production
feas release android --profile production
feas open
```

And get:

* local iOS `.ipa`
* local Android `.aab`
* upload to TestFlight
* upload to Play internal track
* logs in dashboard
* artifacts in dashboard
* metadata editing in dashboard
* useful errors when something breaks

No cloud. No account. No visible Fastlane hustle.

---

# Appendix A: Implementation Blueprint

## A1. Monorepo Structure

Use a pnpm workspace.

```txt
feas/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  README.md
  LICENSE

  apps/
    cli/
      package.json
      src/
        index.ts
        commands/
          init.ts
          doctor.ts
          config.ts
          build.ts
          submit.ts
          release.ts
          metadata.ts
          credentials.ts
          logs.ts
          open.ts
          clean.ts
        ui/
          logger.ts
          spinner.ts
          table.ts
        bootstrap.ts

    dashboard/
      package.json
      index.html
      vite.config.ts
      src/
        main.tsx
        App.tsx
        routes.tsx
        components/
          AppShell.tsx
          StatusBadge.tsx
          LogViewer.tsx
          MetadataEditor.tsx
          DoctorCheckList.tsx
          ArtifactCard.tsx
        pages/
          ProjectsPage.tsx
          ProjectOverviewPage.tsx
          BuildsPage.tsx
          BuildDetailPage.tsx
          ReleasesPage.tsx
          ReleaseDetailPage.tsx
          LogsPage.tsx
          MetadataPage.tsx
          CredentialsPage.tsx
          DoctorPage.tsx
          SettingsPage.tsx
        api/
          client.ts
          queries.ts

  packages/
    core/
      package.json
      src/
        project/
          detectProject.ts
          resolveProjectId.ts
          readExpoConfig.ts
          readEasJson.ts
          resolveProfile.ts
        config/
          internalConfig.ts
          schema.ts
        env/
          resolveEnv.ts
        versioning/
          bumpVersion.ts
          detectVersion.ts
          rollbackVersion.ts
        doctor/
          runDoctor.ts
          checks/
            general.ts
            ios.ts
            android.ts
            store.ts
            metadata.ts
        errors/
          FeasError.ts
          translateError.ts
          patterns.ts
        logs/
          logManager.ts
          redactSecrets.ts
        artifacts/
          artifactManager.ts
        metadata/
          metadataStore.ts
          validators.ts
        credentials/
          secretStore.ts
          macosKeychainStore.ts
          encryptedFileStore.ts
          envSecretStore.ts
        fastlane/
          generateFastlaneProject.ts
          runFastlane.ts
          lanes.ts
        build/
          buildIos.ts
          buildAndroid.ts
        submit/
          submitIos.ts
          submitAndroid.ts
        release/
          release.ts
        utils/
          exec.ts
          fs.ts
          platform.ts
          git.ts

    api/
      package.json
      src/
        createServer.ts
        routes/
          projects.ts
          builds.ts
          releases.ts
          logs.ts
          metadata.ts
          credentials.ts
          doctor.ts
        middleware/
          authToken.ts
          errorHandler.ts

    db/
      package.json
      prisma/
        schema.prisma
      src/
        client.ts
        migrations.ts

    shared/
      package.json
      src/
        types.ts
        constants.ts
        schemas.ts

  fixtures/
    expo-managed/
    expo-prebuild/
    rn-bare/
    android-only/
```

---

## A2. Package Responsibilities

### `apps/cli`

Owns command parsing and terminal UX only.

Must not contain build logic directly.

### `apps/dashboard`

Local React dashboard using HeroUI.

Talks only to the local API server.

### `packages/core`

Main domain logic:

* project detection
* profile resolution
* doctor checks
* build orchestration
* submit orchestration
* metadata handling
* Fastlane adapter
* logging
* error translation

### `packages/api`

Local-only Fastify API used by dashboard.

### `packages/db`

Prisma client and database schema.

### `packages/shared`

Shared types and Zod schemas.

---

## A3. Prisma Schema

Use SQLite.

`packages/db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

enum Platform {
  ios
  android
  all
}

enum RunStatus {
  pending
  running
  success
  failed
  cancelled
}

enum LogType {
  build
  submit
  release
  doctor
  metadata
  credentials
}

enum StoreType {
  app_store
  google_play
}

model Project {
  id          String   @id
  name        String
  rootPath    String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  builds      Build[]
  submissions Submission[]
  releases    Release[]
  doctorChecks DoctorCheck[]
  logs        LogEntry[]
}

model Build {
  id           String    @id
  projectId    String
  platform     Platform
  profile      String
  status       RunStatus
  version      String?
  buildNumber  String?
  artifactPath String?
  dsymPath      String?
  logPath       String?
  startedAt    DateTime
  finishedAt   DateTime?
  durationMs   Int?
  errorCode    String?
  errorMessage String?

  project      Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  submissions  Submission[]
  releases     Release[]

  @@index([projectId])
  @@index([platform])
  @@index([status])
  @@index([startedAt])
}

model Submission {
  id           String    @id
  projectId    String
  buildId      String?
  platform     Platform
  store        StoreType
  status       RunStatus
  remoteId     String?
  track        String?
  logPath      String?
  startedAt    DateTime
  finishedAt   DateTime?
  durationMs   Int?
  errorCode    String?
  errorMessage String?

  project      Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  build        Build?  @relation(fields: [buildId], references: [id], onDelete: SetNull)
  releases     Release[]

  @@index([projectId])
  @@index([buildId])
  @@index([status])
}

model Release {
  id           String    @id
  projectId    String
  platform     Platform
  profile      String
  status       RunStatus
  version      String?
  buildNumber  String?
  buildId      String?
  submissionId String?
  releaseNotes String?
  startedAt    DateTime
  finishedAt   DateTime?
  durationMs   Int?
  errorCode    String?
  errorMessage String?

  project      Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  build        Build?      @relation(fields: [buildId], references: [id], onDelete: SetNull)
  submission   Submission? @relation(fields: [submissionId], references: [id], onDelete: SetNull)

  @@index([projectId])
  @@index([platform])
  @@index([status])
  @@index([startedAt])
}

model DoctorCheck {
  id         String    @id
  projectId  String
  category   String
  name       String
  status     RunStatus
  message    String?
  fixCommand String?
  checkedAt  DateTime

  project    Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([category])
  @@index([status])
}

model LogEntry {
  id        String   @id
  projectId String
  type      LogType
  title     String
  path      String
  rawPath   String?
  createdAt DateTime @default(now())

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([type])
  @@index([createdAt])
}

model MetadataRevision {
  id          String   @id
  projectId   String
  platform    Platform
  locale      String
  source      String   // local | app_store | google_play
  checksum    String
  createdAt   DateTime @default(now())
  description String?

  @@index([projectId])
  @@index([platform])
  @@index([locale])
}
```

---

## A4. Runtime and Dependency Strategy

### MVP dependency policy

FEAS does not bundle Ruby or Fastlane in MVP.

`feas doctor` must detect and explain missing dependencies.

Required for iOS:

```txt
macOS
Xcode
Xcode command line tools
CocoaPods
Ruby
Fastlane
```

Required for Android:

```txt
Java
Android SDK
Gradle or Gradle wrapper
Fastlane
```

### Doctor output example

```txt
✖ Fastlane is not installed

FEAS uses Fastlane internally for App Store and Play Store delivery.
Install it with:

  brew install fastlane

or:

  gem install fastlane
```

### Long-term option

Later versions may provide:

```bash
feas runtime install
```

This can install or manage a FEAS-controlled Ruby/Fastlane runtime under:

```txt
~/.feas/runtime/
```

But this is not part of MVP.

---

## A5. Fastlane Internal Implementation

### Generated internal Fastlane root

```txt
~/.feas/projects/<projectHash>/fastlane/
  Fastfile
  Appfile
  .env.production
  .env.preview
```

### Invocation

FEAS must run Fastlane with:

* project root passed explicitly
* artifact output path passed explicitly
* metadata path passed explicitly
* credentials referenced through environment variables or secret store temporary files

Example internal call:

```bash
fastlane ios feas_release \
  project_root:/Users/me/dev/myapp \
  workspace:/Users/me/dev/myapp/ios/MyApp.xcworkspace \
  scheme:MyApp \
  output_directory:/Users/me/.feas/projects/hash/artifacts/ios \
  profile:production
```

### User-facing output

Normal output:

```txt
Building iOS app using profile production...
Uploading to TestFlight...
Done.
```

Verbose output:

```txt
Running: fastlane ios feas_release ...
<raw Fastlane logs>
```

---

## A6. Dashboard UI Specification

### A6.1 Layout

Use HeroUI components.

Global shell:

```txt
Sidebar
  Overview
  Builds
  Releases
  Metadata
  Credentials
  Doctor
  Logs
  Settings

Top bar
  Project selector
  Profile selector
  Run release button
```

### A6.2 Overview page

Cards:

* Current app version
* iOS build number
* Android versionCode
* Last release status
* Doctor health summary
* Latest artifacts

Primary actions:

```txt
Run Doctor
Build iOS
Build Android
Release iOS
Release Android
```

### A6.3 Builds page

Table columns:

```txt
Status | Platform | Profile | Version | Build # | Duration | Date | Artifact
```

Actions:

* View logs
* Open artifact path
* Submit artifact

### A6.4 Build detail page

Sections:

* summary
* artifact paths
* environment summary
* raw command if verbose
* log viewer
* related submission/release

### A6.5 Releases page

Table columns:

```txt
Status | Platform | Profile | Version | Build # | Submission | Date
```

### A6.6 Metadata page

Tabs:

```txt
iOS
Android
```

Locale selector:

```txt
en-NZ
en-US
```

Editor fields:

IOS:

* name
* subtitle
* promotional text
* description
* keywords
* support URL
* marketing URL
* privacy policy URL
* release notes

Android:

* title
* short description
* full description
* release notes
* privacy policy URL

Actions:

```txt
Pull from store
Validate
Show diff
Push to store
Save local changes
```

### A6.7 Credentials page

Show status, not secrets.

Sections:

* Apple
* Google Play
* Android signing

Fields:

```txt
Configured: yes/no
Team ID
App ID
Bundle ID
Package name
Expiry date where available
```

Actions:

```txt
Configure
Validate
Repair
```

### A6.8 Doctor page

Grouped checklist:

```txt
General
Expo/RN
IOS
Android
Store
Metadata
Credentials
```

Each row:

```txt
Status | Check | Message | Fix
```

### A6.9 Logs page

Features:

* list logs
* filter by type/platform/status
* view raw log
* copy log
* open log file
* highlight translated error

---

## A7. Local API Contract

Use Zod schemas shared between API and dashboard.

### Project response

```ts
interface ProjectDto {
  id: string;
  name: string;
  rootPath: string;
  platforms: Array<'ios' | 'android'>;
  currentVersion?: string;
  iosBuildNumber?: string;
  androidVersionCode?: string;
}
```

### Build response

```ts
interface BuildDto {
  id: string;
  platform: 'ios' | 'android';
  profile: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  version?: string;
  buildNumber?: string;
  artifactPath?: string;
  startedAt: string;
  finishedAt?: string;
  errorMessage?: string;
}
```

### Create build request

```ts
interface CreateBuildRequest {
  platform: 'ios' | 'android';
  profile: string;
  skipPrebuild?: boolean;
  verbose?: boolean;
}
```

### Create release request

```ts
interface CreateReleaseRequest {
  platform: 'ios' | 'android';
  profile: string;
  skipBuild?: boolean;
  skipSubmit?: boolean;
  noBump?: boolean;
  releaseNotes?: string;
}
```

---

## A8. Acceptance Criteria

### `feas init`

Must:

* detect project root
* detect Expo config
* detect `eas.json`
* create project directory under `~/.feas`
* create SQLite database
* generate internal Fastlane files
* print next command recommendation

Must not:

* create `feas.config.ts`
* create `.feasignore`
* require cloud login

### `feas doctor`

Must:

* check required dependencies
* return non-zero exit code on critical failure
* show clear fix command
* write check results to SQLite

### `feas build ios`

Must:

* run only on macOS
* resolve profile from `eas.json`
* produce `.ipa` or clear failure
* save logs
* save build record

### `feas build android`

Must:

* resolve profile from `eas.json`
* produce `.aab` or clear failure
* save logs
* save build record

### `feas release`

Must:

* bump build number unless disabled
* build binary
* submit binary
* save release record
* show artifact path and log path

### `feas open`

Must:

* start local API
* start/open dashboard
* bind only to localhost
* protect API with session token

---

## A9. Codex Implementation Plan

### Task 1: Create monorepo scaffold

Deliver:

* pnpm workspace
* TypeScript config
* package skeletons
* CLI entrypoint
* dashboard Vite app
* core package
* db package
* api package

Acceptance:

```bash
pnpm install
pnpm build
pnpm --filter @feas/cli dev --help
```

### Task 2: Implement project detection

Deliver:

* detect project root
* read `package.json`
* detect Expo config
* read `eas.json`
* resolve project ID

Acceptance:

```bash
feas config --json
```

prints resolved project data.

### Task 3: Implement Prisma database

Deliver:

* Prisma schema
* SQLite initialization
* migration command
* DB client wrapper

Acceptance:

`feas init` creates database under `~/.feas/projects/<hash>/database.sqlite`.

### Task 4: Implement `feas init`

Deliver:

* project directory creation
* internal config generation
* internal Fastlane template generation
* initial DB record

Acceptance:

No files are created in user repo except optional cache-safe files if explicitly required.

### Task 5: Implement doctor checks

Deliver:

* general checks
* iOS checks
* Android checks
* Fastlane/Ruby detection
* readable output

Acceptance:

`feas doctor` gives actionable pass/fail results.

### Task 6: Implement log manager

Deliver:

* run log directory
* raw log capture
* redacted log capture
* log DB entries

Acceptance:

Every command creates a readable log record.

### Task 7: Implement Fastlane adapter

Deliver:

* internal Fastfile generator
* Fastlane runner
* environment injection
* verbose/raw output mode

Acceptance:

Can run a fake lane from FEAS and capture logs.

### Task 8: Implement iOS build

Deliver:

* profile resolution
* workspace/scheme detection
* Fastlane iOS build lane
* artifact capture

Acceptance:

`feas build ios --profile production` produces an `.ipa` on a valid project.

### Task 9: Implement Android build

Deliver:

* Gradle task detection
* signing env support
* Fastlane Android build lane
* artifact capture

Acceptance:

`feas build android --profile production` produces an `.aab`.

### Task 10: Implement submit commands

Deliver:

* iOS TestFlight upload via Fastlane
* Android Play upload via Fastlane
* secret resolution
* submission records

Acceptance:

Can upload valid artifacts to store test apps.

### Task 11: Implement release command

Deliver:

* preflight
* build number bump
* build
* submit
* release DB record

Acceptance:

`feas release ios --profile production` performs full local release.

### Task 12: Implement local API

Deliver:

* Fastify server
* token auth
* project/build/release/log routes
* dashboard API integration

Acceptance:

`feas open` starts API and dashboard.

### Task 13: Implement dashboard overview/builds/logs

Deliver:

* app shell
* overview page
* builds page
* build detail page
* logs page

Acceptance:

User can inspect builds and logs locally.

### Task 14: Implement metadata system

Deliver:

* local metadata file storage
* dashboard editor
* validation
* Fastlane metadata push/pull wrappers

Acceptance:

User can edit metadata in dashboard and push to App Store / Play Store.

### Task 15: Error translation

Deliver:

* known error pattern registry
* user-friendly messages
* fix commands

Acceptance:

Known signing/build/store errors are translated in CLI and dashboard.

---

## A10. First Public Version Definition

Version:

```txt
0.1.0
```

Must include:

* `feas init`
* `feas doctor`
* `feas config`
* `feas build ios`
* `feas build android`
* `feas logs`
* internal Fastlane generator
* SQLite/Prisma release records

Version:

```txt
0.2.0
```

Must include:

* `feas submit ios`
* `feas submit android`
* `feas release ios`
* `feas release android`

Version:

```txt
0.3.0
```

Must include:

* `feas open`
* local dashboard
* build/release/log viewer

Version:

```txt
0.4.0
```

Must include:

* metadata pull/push
* dashboard metadata editor
* credential status page

---

## A11. Main Risks

### Fastlane dependency risk

Risk:

* user has broken Ruby/Fastlane setup

Mitigation:

* excellent doctor checks
* clear install instructions
* later optional managed runtime

### Apple signing risk

Risk:

* provisioning/certificate errors are hard to explain

Mitigation:

* error translation
* credential validation
* raw log access

### Expo prebuild risk

Risk:

* prebuild mutates native folders

Mitigation:

* do not run prebuild automatically if native folders exist
* require explicit `--prebuild`

### Dashboard scope creep

Risk:

* dashboard becomes product instead of support surface

Mitigation:

* local-only
* no accounts
* no remote collaboration
* no hosted artifacts

### EAS comparison risk

Risk:

* users expect full EAS cloud behavior

Mitigation:

* clear positioning: local release automation, not cloud build service

---

## A12. Final Engineering Rule

When in doubt, FEAS should prefer:

```txt
local over cloud
explicit over magical
logs over silence
eas.json over new config
raw tool compatibility over custom reinvention
```
