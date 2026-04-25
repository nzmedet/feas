import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(repoRoot, "packages", "cli", "dist", "index.js");

function runFeas(args, options) {
  const result = spawnSync("node", [cliPath, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      FEAS_HOME: options.feasHome,
    },
    encoding: "utf8",
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

test("cli smoke: init/config/build/submit/release/metadata", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "feas-smoke-"));
  const appDir = path.join(sandbox, "app");
  const feasHome = path.join(sandbox, "feas-home");

  try {
    await mkdir(appDir, { recursive: true });
    await mkdir(path.join(appDir, "dist"), { recursive: true });
    await mkdir(path.join(appDir, "ios", "SmokeApp"), { recursive: true });
    await mkdir(path.join(appDir, "android", "app"), { recursive: true });

    await writeFile(
      path.join(appDir, "package.json"),
      JSON.stringify({ name: "smoke-app", private: true }, null, 2),
      "utf8",
    );

    await writeFile(
      path.join(appDir, "eas.json"),
      JSON.stringify(
        {
          cli: { version: ">= 10.0.0" },
          build: {
            production: {
              env: {
                EXPO_PUBLIC_ENVIRONMENT: "production",
              },
              ios: {},
              android: {},
            },
          },
          submit: {
            production: {
              ios: {},
              android: {},
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(
      path.join(appDir, "app.json"),
      JSON.stringify(
        {
          expo: {
            name: "Smoke App",
            version: "1.0.0",
            ios: { bundleIdentifier: "com.example.smoke", buildNumber: "7" },
            android: { package: "com.example.smoke", versionCode: 11 },
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(appDir, "app.config.ts"),
      `export default {
  expo: {
    name: "Smoke App",
    ios: { buildNumber: "3" },
    android: { versionCode: 10 },
  },
};
`,
      "utf8",
    );
    await writeFile(
      path.join(appDir, "ios", "SmokeApp", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleVersion</key>
  <string>12</string>
</dict>
</plist>
`,
      "utf8",
    );
    await writeFile(
      path.join(appDir, "android", "app", "build.gradle"),
      `android {
    defaultConfig {
        versionCode 21
    }
}
`,
      "utf8",
    );

    await writeFile(path.join(appDir, "dist", "app.ipa"), "fake-ipa", "utf8");
    await writeFile(path.join(appDir, "AuthKey_TEST.p8"), "fake-p8", "utf8");

    const initResult = runFeas(["init"], { cwd: appDir, feasHome });
    assert.equal(initResult.status, 0, `init failed: ${initResult.stderr}`);
    assert.match(initResult.stdout, /Initialized FEAS project:/);

    const configResult = runFeas(["config", "--json"], { cwd: appDir, feasHome });
    assert.equal(configResult.status, 0, `config failed: ${configResult.stderr}`);
    const config = JSON.parse(configResult.stdout);
    assert.equal(config.project.displayName, "Smoke App");
    assert.equal(config.project.platforms.ios, true);
    assert.equal(config.project.platforms.android, true);

    const metadataPullResult = runFeas(["metadata", "pull", "ios"], { cwd: appDir, feasHome });
    assert.equal(metadataPullResult.status, 0, `metadata pull failed: ${metadataPullResult.stderr}`);

    const iosMetadataRoot = path.join(feasHome, "projects", config.projectId, "metadata", "ios");
    const localeEntries = await readdir(iosMetadataRoot, { withFileTypes: true });
    const localeDirName = localeEntries.find(
      (entry) => entry.isDirectory() && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/i.test(entry.name),
    )?.name;
    assert.ok(localeDirName, "Expected at least one iOS metadata locale directory.");
    const metadataDir = path.join(iosMetadataRoot, localeDirName);
    const metadataFiles = await readdir(metadataDir);
    assert.equal(metadataFiles.length > 0, true);

    const credentialsResult = runFeas(
      [
        "credentials",
        "ios",
        "--key-id",
        "KEY123",
        "--issuer-id",
        "ISSUER123",
        "--private-key-path",
        "AuthKey_TEST.p8",
        "--save-as",
        "personal-ios",
      ],
      { cwd: appDir, feasHome },
    );
    assert.equal(credentialsResult.status, 0, `credentials failed: ${credentialsResult.stderr}`);
    const credentialListResult = runFeas(["credentials", "list"], { cwd: appDir, feasHome });
    assert.equal(credentialListResult.status, 0, `credentials list failed: ${credentialListResult.stderr}`);
    assert.match(credentialListResult.stdout, /personal-ios/);
    const encryptedSecrets = await readFile(path.join(feasHome, "secrets.enc.json"), "utf8");
    assert.match(encryptedSecrets, /"version": 1/);
    assert.doesNotMatch(encryptedSecrets, /KEY123|ISSUER123|AuthKey_TEST/);

    const buildResult = runFeas(["build", "all", "--dry-run", "--json"], { cwd: appDir, feasHome });
    assert.equal(buildResult.status, 0, `build failed: ${buildResult.stderr}`);
    const buildPayload = JSON.parse(buildResult.stdout);
    assert.equal(Array.isArray(buildPayload.builds), true);
    assert.equal(buildPayload.builds.length, 2);

    const latestBuildLog = runFeas(["logs", "--latest", "--raw"], { cwd: appDir, feasHome });
    assert.equal(latestBuildLog.status, 0, `logs failed: ${latestBuildLog.stderr}`);
    assert.match(latestBuildLog.stdout, /env keys:/);

    const submitResult = runFeas(["submit", "ios", "--path", "dist/app.ipa", "--dry-run", "--json"], {
      cwd: appDir,
      feasHome,
    });
    assert.equal(submitResult.status, 0, `submit failed: ${submitResult.stderr}`);
    const submitPayload = JSON.parse(submitResult.stdout);
    assert.equal(submitPayload.submission.status, "success");

    const releaseResult = runFeas(["release", "ios", "--dry-run", "--skip-submit", "--json"], { cwd: appDir, feasHome });
    assert.equal(releaseResult.status, 0, `release failed: ${releaseResult.stderr}`);
    const releasePayload = JSON.parse(releaseResult.stdout);
    assert.equal(Array.isArray(releasePayload.releases), true);
    assert.equal(releasePayload.releases.length, 1);
    assert.equal(releasePayload.releases[0].platform, "ios");
    assert.equal(releasePayload.releases[0].version, "1.0.0");
    assert.equal(releasePayload.releases[0].buildNumber, "13");
    assert.equal(releasePayload.releases[0].changedFiles.length, 3);

    const appJsonAfterDryRun = JSON.parse(await readFile(path.join(appDir, "app.json"), "utf8"));
    assert.equal(appJsonAfterDryRun.expo.ios.buildNumber, "7");
    const appConfigAfterDryRun = await readFile(path.join(appDir, "app.config.ts"), "utf8");
    assert.match(appConfigAfterDryRun, /buildNumber: "3"/);
    const plistAfterDryRun = await readFile(path.join(appDir, "ios", "SmokeApp", "Info.plist"), "utf8");
    assert.equal(plistAfterDryRun.includes("<string>12</string>"), true);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("cli smoke: app.config-only hybrid detection and missing release profile", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "feas-config-smoke-"));
  const appDir = path.join(sandbox, "app");
  const feasHome = path.join(sandbox, "feas-home");

  try {
    await mkdir(appDir, { recursive: true });

    await writeFile(
      path.join(appDir, "package.json"),
      JSON.stringify(
        {
          name: "config-only-app",
          private: true,
          dependencies: {
            expo: "^53.0.0",
            "react-native": "0.79.0",
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(
      path.join(appDir, "eas.json"),
      JSON.stringify(
        {
          build: {
            production: {
              ios: {},
              android: {},
            },
          },
          submit: {
            production: {
              ios: {},
              android: {},
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(
      path.join(appDir, "app.config.ts"),
      `export default {
  expo: {
    name: "Config Only App",
    version: "2.3.4",
    ios: {
      bundleIdentifier: "com.example.configonly",
      buildNumber: "5",
    },
    android: {
      package: "com.example.configonly",
      versionCode: 9,
    },
  },
};
`,
      "utf8",
    );
    await writeFile(path.join(appDir, "AuthKey_CONFIG_ONLY.p8"), "fake-p8", "utf8");

    const initResult = runFeas(["init"], { cwd: appDir, feasHome });
    assert.equal(initResult.status, 0, `init failed: ${initResult.stderr}`);

    const configResult = runFeas(["config", "--json"], { cwd: appDir, feasHome });
    assert.equal(configResult.status, 0, `config failed: ${configResult.stderr}`);
    const config = JSON.parse(configResult.stdout);
    assert.equal(config.project.displayName, "Config Only App");
    assert.equal(config.project.projectType, "hybrid");
    assert.equal(config.project.nativeFolders.ios, false);
    assert.equal(config.project.nativeFolders.android, false);
    assert.equal(config.project.configSources.length, 1);
    assert.equal(config.project.bundleIdentifiers.ios, "com.example.configonly");
    assert.equal(config.project.bundleIdentifiers.android, "com.example.configonly");

    const saveProfileResult = runFeas(
      [
        "credentials",
        "ios",
        "--key-id",
        "CONFIGKEY",
        "--issuer-id",
        "CONFIGISSUER",
        "--private-key-path",
        "AuthKey_CONFIG_ONLY.p8",
        "--save-as",
        "shared-apple",
      ],
      { cwd: appDir, feasHome },
    );
    assert.equal(saveProfileResult.status, 0, `save profile failed: ${saveProfileResult.stderr}`);

    const attachProfileResult = runFeas(["credentials", "ios", "--use", "shared-apple"], { cwd: appDir, feasHome });
    assert.equal(attachProfileResult.status, 0, `attach profile failed: ${attachProfileResult.stderr}`);

    const missingProfileResult = runFeas(["release", "ios", "--profile", "staging", "--dry-run", "--skip-submit", "--json"], {
      cwd: appDir,
      feasHome,
    });
    assert.notEqual(missingProfileResult.status, 0);
    assert.match(missingProfileResult.stderr, /Build profile 'staging' not found in eas\.json\. Create build\.staging before running release\./);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
