import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
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
            ios: { bundleIdentifier: "com.example.smoke" },
            android: { package: "com.example.smoke" },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeFile(path.join(appDir, "dist", "app.ipa"), "fake-ipa", "utf8");

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

    const metadataDir = path.join(feasHome, "projects", config.projectId, "metadata", "ios", "en-NZ");
    const metadataFiles = await readdir(metadataDir);
    assert.equal(metadataFiles.length > 0, true);

    const buildResult = runFeas(["build", "all", "--dry-run", "--json"], { cwd: appDir, feasHome });
    assert.equal(buildResult.status, 0, `build failed: ${buildResult.stderr}`);
    const buildPayload = JSON.parse(buildResult.stdout);
    assert.equal(Array.isArray(buildPayload.builds), true);
    assert.equal(buildPayload.builds.length, 2);

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
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
