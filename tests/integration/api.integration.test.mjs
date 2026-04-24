import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import net from "node:net";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const apiDistPath = path.join(repoRoot, "packages", "api", "dist", "index.js");

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

async function findFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to resolve free port")));
        return;
      }
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function requestJson(baseUrl, token, pathname, init) {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set("token", token);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-feas-token": token,
      "content-type": "application/json",
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  return { status: response.status, payload };
}

test("api integration: auth + core endpoints", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "feas-api-int-"));
  const appDir = path.join(sandbox, "app");
  const feasHome = path.join(sandbox, "feas-home");
  const token = "api-test-token";
  const originalFeasHome = process.env.FEAS_HOME;

  let server;

  try {
    await mkdir(appDir, { recursive: true });
    await mkdir(path.join(appDir, "dist"), { recursive: true });

    await writeFile(path.join(appDir, "package.json"), JSON.stringify({ name: "api-int-app", private: true }, null, 2), "utf8");
    await writeFile(
      path.join(appDir, "eas.json"),
      JSON.stringify(
        {
          build: { production: { ios: {}, android: {} } },
          submit: { production: { ios: {}, android: {} } },
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
            name: "API Integration App",
            ios: { bundleIdentifier: "com.example.apiint" },
            android: { package: "com.example.apiint" },
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

    process.env.FEAS_HOME = feasHome;
    const { startLocalApiServer } = await import(pathToFileURL(apiDistPath).href);

    const port = await findFreePort();
    server = await startLocalApiServer({ port, token });
    const baseUrl = new URL(server.url);

    const unauthorizedRes = await fetch(new URL("/api/projects", baseUrl));
    assert.equal(unauthorizedRes.status, 401);

    const projectsRes = await requestJson(baseUrl, token, "/api/projects");
    assert.equal(projectsRes.status, 200);
    assert.equal(Array.isArray(projectsRes.payload.projects), true);
    assert.equal(projectsRes.payload.projects.length, 1);

    const projectId = projectsRes.payload.projects[0].id;
    assert.ok(projectId);

    const buildRes = await requestJson(baseUrl, token, `/api/projects/${projectId}/builds`, {
      method: "POST",
      body: JSON.stringify({ platform: "ios", profile: "production", dryRun: true }),
    });
    assert.equal(buildRes.status, 200);
    assert.equal(buildRes.payload.builds.length, 1);
    assert.equal(buildRes.payload.builds[0].platform, "ios");

    const badSubmitRes = await requestJson(baseUrl, token, `/api/projects/${projectId}/submissions`, {
      method: "POST",
      body: JSON.stringify({ platform: "ios" }),
    });
    assert.equal(badSubmitRes.status, 400);
    assert.equal(badSubmitRes.payload.error, "platform_and_path_required");

    const submitRes = await requestJson(baseUrl, token, `/api/projects/${projectId}/submissions`, {
      method: "POST",
      body: JSON.stringify({ platform: "ios", path: "dist/app.ipa", profile: "production", dryRun: true }),
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.payload.submission.platform, "ios");
    assert.equal(submitRes.payload.submission.status, "success");

    const logsRes = await requestJson(baseUrl, token, `/api/projects/${projectId}/logs`);
    assert.equal(logsRes.status, 200);
    assert.equal(Array.isArray(logsRes.payload.logs), true);
    assert.equal(logsRes.payload.logs.length > 0, true);

    const firstLogId = logsRes.payload.logs[0].id;
    const logDetailRes = await requestJson(baseUrl, token, `/api/projects/${projectId}/logs/${encodeURIComponent(firstLogId)}`);
    assert.equal(logDetailRes.status, 200);
    assert.equal(typeof logDetailRes.payload.content, "string");

    const badMetadataWrite = await requestJson(baseUrl, token, `/api/projects/${projectId}/metadata`, {
      method: "PUT",
      body: JSON.stringify({ files: { "../../../../escape.txt": "owned" } }),
    });
    assert.equal(badMetadataWrite.status, 400);
    assert.equal(badMetadataWrite.payload.error, "invalid_metadata_path");

    const goodMetadataWrite = await requestJson(baseUrl, token, `/api/projects/${projectId}/metadata`, {
      method: "PUT",
      body: JSON.stringify({ files: { "ios/en-NZ/name.txt": "API Integration App" } }),
    });
    assert.equal(goodMetadataWrite.status, 200);
    assert.equal(goodMetadataWrite.payload.updated, 1);
  } finally {
    if (server) {
      await server.close();
    }
    if (originalFeasHome === undefined) {
      delete process.env.FEAS_HOME;
    } else {
      process.env.FEAS_HOME = originalFeasHome;
    }
    await rm(sandbox, { recursive: true, force: true });
  }
});
