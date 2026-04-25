import Fastify from "fastify";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  configureAndroidCredentials,
  configureIosCredentials,
  initFeasProject,
  runBuild,
  runDoctor,
  runSubmit,
  runRelease,
  runMetadataPull,
  runMetadataPush,
  runMetadataValidate,
  validateCredentials,
} from "feas-core";
import {
  deleteBuildById,
  getBuildById,
  getProjectBuilds,
  getProjectDoctorChecks,
  getProjectReleases,
  getProjectSubmissions,
  getReleaseById,
} from "feas-db";

export interface StartLocalApiServerOptions {
  port: number;
  token?: string;
  dashboardDistPath?: string;
}

export interface LocalApiServerHandle {
  url: string;
  close: () => Promise<void>;
}

interface FeasGlobalConfig {
  projects?: Record<
    string,
    {
      name?: string;
      root?: string;
      lastOpenedAt?: string;
    }
  >;
}

interface ProjectPaths {
  root: string;
  projectFilePath: string;
  configFilePath: string;
  databasePath: string;
  logsRoot: string;
  metadataRoot: string;
}

function getFeasHomeDir(): string {
  const override = process.env.FEAS_HOME;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }

  return path.join(os.homedir(), ".feas");
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function createApiServer() {
  const app = Fastify();

  app.get("/health", async () => {
    return { ok: true };
  });

  return app;
}

function getProjectPaths(feasHome: string, projectId: string): ProjectPaths {
  const root = path.join(feasHome, "projects", projectId);
  return {
    root,
    projectFilePath: path.join(root, "project.json"),
    configFilePath: path.join(root, "internal.config.json"),
    databasePath: path.join(root, "database.sqlite"),
    logsRoot: path.join(root, "logs"),
    metadataRoot: path.join(root, "metadata"),
  };
}

async function readProjectRootFromProjectFile(paths: ProjectPaths): Promise<string | null> {
  if (!(await fileExists(paths.projectFilePath))) {
    return null;
  }
  const project = await readJsonFile<{ rootPath?: string }>(paths.projectFilePath);
  return project.rootPath ?? null;
}

async function readMetadataTree(metadataRoot: string): Promise<Record<string, { path: string; content: string }>> {
  const platforms: Array<"ios" | "android"> = ["ios", "android"];
  const result: Record<string, { path: string; content: string }> = {};

  for (const platform of platforms) {
    const platformRoot = path.join(metadataRoot, platform);
    if (!(await fileExists(platformRoot))) {
      continue;
    }

    const queue: string[] = [platformRoot];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        if (!entry.name.endsWith(".txt")) {
          continue;
        }
        const content = await fs.readFile(fullPath, "utf8");
        const key = path.relative(metadataRoot, fullPath).replace(/\\/g, "/");
        result[key] = { path: fullPath, content };
      }
    }
  }

  return result;
}

function resolveSafeChildPath(root: string, relativePath: string): string | null {
  if (path.isAbsolute(relativePath)) {
    return null;
  }

  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, relativePath);
  const relative = path.relative(normalizedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return resolved;
}

async function listLogFiles(logsRoot: string): Promise<Array<{ id: string; type: string; path: string; createdAt: string }>> {
  const targets = [
    { dir: path.join(logsRoot, "builds"), type: "build" },
    { dir: path.join(logsRoot, "submissions"), type: "submission" },
    { dir: path.join(logsRoot, "releases"), type: "release" },
    { dir: path.join(logsRoot, "metadata"), type: "metadata" },
  ];

  const logs: Array<{ id: string; type: string; path: string; createdAt: string }> = [];
  for (const target of targets) {
    if (!(await fileExists(target.dir))) {
      continue;
    }
    const entries = await fs.readdir(target.dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".log")) {
        continue;
      }
      const fullPath = path.join(target.dir, entry.name);
      const stat = await fs.stat(fullPath);
      logs.push({
        id: entry.name.slice(0, -4),
        type: target.type,
        path: fullPath,
        createdAt: stat.mtime.toISOString(),
      });
    }
  }

  return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function dashboardHtml(port: number, token: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FEAS Dashboard</title>
    <style>
      :root {
        --bg: #f4f6f8;
        --panel: #ffffff;
        --line: #d8dee4;
        --text: #0f1720;
        --muted: #52606d;
        --accent: #0a7ea4;
        --ok: #0f9d58;
        --bad: #d93025;
      }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system; background: linear-gradient(180deg, #edf2f7 0%, #f8fafc 100%); color: var(--text); }
      .shell { display: grid; grid-template-columns: 248px 1fr; min-height: 100vh; }
      .sidebar { border-right: 1px solid var(--line); background: #f8fafc; padding: 20px; }
      .brand { font-weight: 700; font-size: 18px; letter-spacing: .2px; margin-bottom: 20px; }
      .menu { display: grid; gap: 8px; }
      .menu button { border: 1px solid transparent; background: transparent; text-align: left; padding: 10px 12px; border-radius: 10px; color: var(--muted); cursor: pointer; }
      .menu button.active { border-color: var(--line); background: #ffffff; color: var(--text); font-weight: 600; }
      .main { padding: 24px; display: grid; gap: 18px; align-content: start; }
      .top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
      .title { font-size: 22px; font-weight: 700; }
      .muted { color: var(--muted); font-size: 13px; }
      .cards { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 12px; }
      .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
      .card .k { color: var(--muted); font-size: 12px; }
      .card .v { font-size: 22px; font-weight: 700; margin-top: 6px; }
      .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
      .panel h3 { margin: 0; padding: 12px 14px; border-bottom: 1px solid var(--line); font-size: 14px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { font-size: 13px; padding: 10px 12px; border-bottom: 1px solid #edf2f7; text-align: left; }
      th { color: var(--muted); font-weight: 600; background: #fbfdff; }
      .status-ok { color: var(--ok); font-weight: 600; }
      .status-bad { color: var(--bad); font-weight: 600; }
      .hidden { display: none; }
      pre { margin: 0; font-size: 12px; line-height: 1.5; background: #0b1220; color: #dbe7ff; padding: 12px; max-height: 420px; overflow: auto; }
      @media (max-width: 980px) {
        .shell { grid-template-columns: 1fr; }
        .sidebar { border-right: 0; border-bottom: 1px solid var(--line); }
        .cards { grid-template-columns: repeat(2, minmax(120px, 1fr)); }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">FEAS Dashboard</div>
        <div class="menu">
          <button data-view="overview" class="active">Overview</button>
          <button data-view="builds">Builds</button>
          <button data-view="releases">Releases</button>
          <button data-view="doctor">Doctor</button>
          <button data-view="logs">Logs</button>
        </div>
      </aside>
      <main class="main">
        <div class="top">
          <div>
            <div class="title" id="title">Project Overview</div>
            <div class="muted">Local FEAS runtime on localhost:${port}</div>
          </div>
          <div class="muted" id="projectLabel">Loading project...</div>
        </div>
        <section id="overview">
          <div class="cards" id="cards"></div>
          <div class="panel">
            <h3>Recent Builds</h3>
            <table id="buildsTable"></table>
          </div>
        </section>
        <section id="builds" class="hidden"><div class="panel"><h3>Builds</h3><table id="buildsFull"></table></div></section>
        <section id="releases" class="hidden"><div class="panel"><h3>Releases</h3><table id="releasesFull"></table></div></section>
        <section id="doctor" class="hidden"><div class="panel"><h3>Doctor Checks</h3><table id="doctorFull"></table></div></section>
        <section id="logs" class="hidden"><div class="panel"><h3>Latest Log</h3><pre id="logPreview">No log selected.</pre></div></section>
      </main>
    </div>
    <script>
      const token = ${JSON.stringify(token)};
      const headers = { "x-feas-token": token };
      const state = { projectId: null, builds: [], releases: [], doctor: [], logs: [] };

      function statusClass(status) {
        return status === "success" || status === "pass" ? "status-ok" : "status-bad";
      }

      function renderTable(el, columns, rows) {
        const head = "<thead><tr>" + columns.map(c => "<th>" + c.label + "</th>").join("") + "</tr></thead>";
        const body = "<tbody>" + rows.map(row => "<tr>" + columns.map(c => "<td>" + (c.render ? c.render(row[c.key], row) : (row[c.key] ?? "")) + "</td>").join("") + "</tr>").join("") + "</tbody>";
        el.innerHTML = head + body;
      }

      function attachMenu() {
        document.querySelectorAll(".menu button").forEach(btn => {
          btn.addEventListener("click", () => {
            document.querySelectorAll(".menu button").forEach(x => x.classList.remove("active"));
            btn.classList.add("active");
            const view = btn.dataset.view;
            document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
            document.getElementById(view).classList.remove("hidden");
            document.getElementById("title").textContent = btn.textContent;
          });
        });
      }

      async function load() {
        const projectsRes = await fetch("/api/projects?token=" + encodeURIComponent(token), { headers });
        const projectsPayload = await projectsRes.json();
        if (!projectsPayload.projects || projectsPayload.projects.length === 0) {
          document.getElementById("projectLabel").textContent = "No initialized projects";
          return;
        }

        const project = projectsPayload.projects[0];
        state.projectId = project.id;
        document.getElementById("projectLabel").textContent = project.name + " · " + project.root;

        const [builds, releases, doctor, logs] = await Promise.all([
          fetch("/api/projects/" + project.id + "/builds?token=" + encodeURIComponent(token), { headers }).then(r => r.json()),
          fetch("/api/projects/" + project.id + "/releases?token=" + encodeURIComponent(token), { headers }).then(r => r.json()),
          fetch("/api/projects/" + project.id + "/doctor?token=" + encodeURIComponent(token), { headers }).then(r => r.json()),
          fetch("/api/projects/" + project.id + "/logs?token=" + encodeURIComponent(token), { headers }).then(r => r.json())
        ]);

        state.builds = builds.builds || [];
        state.releases = releases.releases || [];
        state.doctor = doctor.checks || [];
        state.logs = logs.logs || [];

        const okBuilds = state.builds.filter(x => x.status === "success").length;
        const failedBuilds = state.builds.filter(x => x.status !== "success").length;
        const okDoctor = state.doctor.filter(x => x.status === "pass").length;
        const badDoctor = state.doctor.filter(x => x.status === "fail").length;

        document.getElementById("cards").innerHTML = [
          ["Builds", state.builds.length],
          ["Build Success", okBuilds],
          ["Build Failed", failedBuilds],
          ["Doctor Fail", badDoctor]
        ].map(([k,v]) => "<div class='card'><div class='k'>" + k + "</div><div class='v'>" + v + "</div></div>").join("");

        const buildColumns = [
          { key: "id", label: "ID" },
          { key: "platform", label: "Platform" },
          { key: "status", label: "Status", render: (v) => "<span class='" + statusClass(v) + "'>" + v + "</span>" },
          { key: "profile", label: "Profile" },
          { key: "startedAt", label: "Started" }
        ];
        renderTable(document.getElementById("buildsTable"), buildColumns, state.builds.slice(0, 8));
        renderTable(document.getElementById("buildsFull"), buildColumns, state.builds);

        const releaseColumns = [
          { key: "id", label: "ID" },
          { key: "platform", label: "Platform" },
          { key: "status", label: "Status", render: (v) => "<span class='" + statusClass(v) + "'>" + v + "</span>" },
          { key: "profile", label: "Profile" },
          { key: "startedAt", label: "Started" }
        ];
        renderTable(document.getElementById("releasesFull"), releaseColumns, state.releases);

        const doctorColumns = [
          { key: "category", label: "Category" },
          { key: "name", label: "Name" },
          { key: "status", label: "Status", render: (v) => "<span class='" + statusClass(v) + "'>" + v + "</span>" },
          { key: "message", label: "Message" }
        ];
        renderTable(document.getElementById("doctorFull"), doctorColumns, state.doctor);

        const latestLog = state.logs[0];
        if (latestLog) {
          const payload = await fetch("/api/projects/" + project.id + "/logs/" + encodeURIComponent(latestLog.id) + "?token=" + encodeURIComponent(token), { headers }).then(r => r.json());
          document.getElementById("logPreview").textContent = payload.content || "No content";
        }
      }

      attachMenu();
      load().catch((err) => {
        document.getElementById("projectLabel").textContent = "Failed to load dashboard data";
        document.getElementById("logPreview").textContent = String(err);
      });
    </script>
  </body>
</html>`;
}

export async function startLocalApiServer(options: StartLocalApiServerOptions): Promise<LocalApiServerHandle> {
  const app = createApiServer();
  const expectedToken = options.token?.trim();
  const dashboardDistPath = options.dashboardDistPath;
  const feasHome = getFeasHomeDir();
  const globalConfigPath = path.join(feasHome, "config.json");

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }

    const headerToken = request.headers["x-feas-token"];
    const queryToken = typeof request.query === "object" && request.query !== null ? (request.query as Record<string, unknown>).token : undefined;
    const providedToken = (typeof headerToken === "string" ? headerToken : undefined) ?? (typeof queryToken === "string" ? queryToken : undefined);

    if (!expectedToken) {
      return;
    }

    if (providedToken !== expectedToken) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
  });

  app.get("/", async (_request, reply) => {
    if (dashboardDistPath) {
      const indexFile = path.join(dashboardDistPath, "index.html");
      if (await fileExists(indexFile)) {
        const html = await fs.readFile(indexFile, "utf8");
        reply.type("text/html").send(html);
        return;
      }
    }

    reply.type("text/html").send(dashboardHtml(options.port, expectedToken ?? ""));
  });

  app.get("/assets/*", async (request, reply) => {
    if (!dashboardDistPath) {
      reply.code(404).send({ error: "asset_not_found" });
      return;
    }

    const wildcard = (request.params as { "*": string })["*"] ?? "";
    const fullPath = path.join(dashboardDistPath, "assets", wildcard);
    if (!(await fileExists(fullPath))) {
      reply.code(404).send({ error: "asset_not_found" });
      return;
    }

    const buffer = await fs.readFile(fullPath);
    if (fullPath.endsWith(".js")) {
      reply.type("text/javascript").send(buffer);
      return;
    }
    if (fullPath.endsWith(".css")) {
      reply.type("text/css").send(buffer);
      return;
    }
    reply.send(buffer);
  });

  app.get("/api/projects", async () => {
    if (!(await fileExists(globalConfigPath))) {
      return { projects: [] };
    }

    const config = await readJsonFile<FeasGlobalConfig>(globalConfigPath);
    const projects = Object.entries(config.projects ?? {}).map(([id, value]) => ({
      id,
      name: value.name ?? id,
      root: value.root ?? null,
      lastOpenedAt: value.lastOpenedAt ?? null,
    }));

    return { projects };
  });

  app.post("/api/projects", async (request, reply) => {
    const body = (request.body ?? {}) as { rootPath?: string; profile?: string; force?: boolean };
    if (!body.rootPath || body.rootPath.trim().length === 0) {
      reply.code(400).send({ error: "root_path_required" });
      return;
    }

    const result = await initFeasProject({
      cwd: body.rootPath,
      profile: body.profile,
      force: body.force,
    });
    return result;
  });

  app.get("/api/projects/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const projectFilePath = path.join(feasHome, "projects", params.id, "project.json");
    if (!(await fileExists(projectFilePath))) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    return readJsonFile<Record<string, unknown>>(projectFilePath);
  });

  app.get("/api/projects/:id/config", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.configFilePath))) {
      reply.code(404).send({ error: "project_config_not_found" });
      return;
    }

    return readJsonFile<Record<string, unknown>>(paths.configFilePath);
  });

  app.get("/api/projects/:id/builds", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }
    const builds = await getProjectBuilds(paths.databasePath);
    return { builds };
  });

  app.get("/api/projects/:id/builds/:buildId", async (request, reply) => {
    const params = request.params as { id: string; buildId: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }

    const build = await getBuildById(paths.databasePath, params.buildId);
    if (!build) {
      reply.code(404).send({ error: "build_not_found" });
      return;
    }
    return build;
  });

  app.post("/api/projects/:id/builds", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as {
      platform?: "ios" | "android" | "all";
      profile?: string;
      dryRun?: boolean;
      allowPrebuild?: boolean;
    };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    const result = await runBuild({
      cwd: projectRoot,
      platform: body.platform ?? "all",
      profile: body.profile,
      dryRun: body.dryRun,
      allowPrebuild: body.allowPrebuild,
    });
    return result;
  });

  app.post("/api/projects/:id/builds/:buildId/rebuild", async (request, reply) => {
    const params = request.params as { id: string; buildId: string };
    const body = (request.body ?? {}) as { dryRun?: boolean; allowPrebuild?: boolean };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }

    const build = await getBuildById(paths.databasePath, params.buildId);
    if (!build) {
      reply.code(404).send({ error: "build_not_found" });
      return;
    }

    const platform = build.platform === "ios" || build.platform === "android" ? build.platform : "all";
    const result = await runBuild({
      cwd: projectRoot,
      platform,
      profile: build.profile ?? undefined,
      dryRun: body.dryRun,
      allowPrebuild: body.allowPrebuild,
    });
    return result;
  });

  app.post("/api/projects/:id/builds/:buildId/submit", async (request, reply) => {
    const params = request.params as { id: string; buildId: string };
    const body = (request.body ?? {}) as { profile?: string; dryRun?: boolean };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }

    const build = await getBuildById(paths.databasePath, params.buildId);
    if (!build) {
      reply.code(404).send({ error: "build_not_found" });
      return;
    }

    if (!build.artifactPath) {
      reply.code(400).send({ error: "build_artifact_not_available" });
      return;
    }

    if (build.platform !== "ios" && build.platform !== "android") {
      reply.code(400).send({ error: "build_platform_not_supported" });
      return;
    }

    const result = await runSubmit({
      cwd: projectRoot,
      platform: build.platform,
      path: build.artifactPath,
      profile: body.profile ?? build.profile ?? undefined,
      dryRun: body.dryRun,
    });
    return result;
  });

  app.delete("/api/projects/:id/builds/:buildId", async (request, reply) => {
    const params = request.params as { id: string; buildId: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }

    const removed = await deleteBuildById(paths.databasePath, params.buildId);
    if (!removed) {
      reply.code(404).send({ error: "build_not_found" });
      return;
    }
    return { deleted: true, id: params.buildId };
  });

  app.get("/api/projects/:id/releases", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }
    const releases = await getProjectReleases(paths.databasePath);
    return { releases };
  });

  app.get("/api/projects/:id/releases/:releaseId", async (request, reply) => {
    const params = request.params as { id: string; releaseId: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }

    const release = await getReleaseById(paths.databasePath, params.releaseId);
    if (!release) {
      reply.code(404).send({ error: "release_not_found" });
      return;
    }
    return release;
  });

  app.post("/api/projects/:id/releases", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as {
      platform?: "ios" | "android" | "all";
      profile?: string;
      dryRun?: boolean;
      skipSubmit?: boolean;
      allowPrebuild?: boolean;
    };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    const result = await runRelease({
      cwd: projectRoot,
      platform: body.platform ?? "all",
      profile: body.profile,
      dryRun: body.dryRun,
      skipSubmit: body.skipSubmit,
      allowPrebuild: body.allowPrebuild,
    });
    return result;
  });

  app.get("/api/projects/:id/submissions", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }
    const submissions = await getProjectSubmissions(paths.databasePath);
    return { submissions };
  });

  app.post("/api/projects/:id/submissions", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as {
      platform?: "ios" | "android";
      profile?: string;
      path?: string;
      dryRun?: boolean;
    };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    if (!body.platform || !body.path) {
      reply.code(400).send({ error: "platform_and_path_required" });
      return;
    }

    const result = await runSubmit({
      cwd: projectRoot,
      platform: body.platform,
      path: body.path,
      profile: body.profile,
      dryRun: body.dryRun,
    });
    return result;
  });

  app.get("/api/projects/:id/doctor", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.databasePath))) {
      reply.code(404).send({ error: "project_database_not_found" });
      return;
    }
    const checks = await getProjectDoctorChecks(paths.databasePath);
    return { checks };
  });

  app.post("/api/projects/:id/doctor/run", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { platform?: "ios" | "android" | "all"; profile?: string };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    const result = await runDoctor({
      cwd: projectRoot,
      platform: body.platform ?? "all",
      profile: body.profile,
    });
    return result;
  });

  app.get("/api/projects/:id/metadata", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.root))) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    const metadata = await readMetadataTree(paths.metadataRoot);
    return { metadata };
  });

  app.put("/api/projects/:id/metadata", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { files?: Record<string, string> };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.root))) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    const files = body.files ?? {};
    for (const [relative, content] of Object.entries(files)) {
      const filePath = resolveSafeChildPath(paths.metadataRoot, relative);
      if (!filePath) {
        reply.code(400).send({ error: "invalid_metadata_path", path: relative });
        return;
      }
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
    }
    return { updated: Object.keys(files).length };
  });

  app.post("/api/projects/:id/metadata/pull", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { platform?: "ios" | "android"; real?: boolean };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    const previous = process.env.FEAS_METADATA_REAL;
    if (body.real) {
      process.env.FEAS_METADATA_REAL = "1";
    }
    try {
      const result = await runMetadataPull({
        cwd: projectRoot,
        platform: body.platform ?? "ios",
      });
      return result;
    } finally {
      if (previous === undefined) {
        delete process.env.FEAS_METADATA_REAL;
      } else {
        process.env.FEAS_METADATA_REAL = previous;
      }
    }
  });

  app.post("/api/projects/:id/metadata/push", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { platform?: "ios" | "android"; real?: boolean };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    const previous = process.env.FEAS_METADATA_REAL;
    if (body.real) {
      process.env.FEAS_METADATA_REAL = "1";
    }
    try {
      const result = await runMetadataPush({
        cwd: projectRoot,
        platform: body.platform ?? "ios",
      });
      return result;
    } finally {
      if (previous === undefined) {
        delete process.env.FEAS_METADATA_REAL;
      } else {
        process.env.FEAS_METADATA_REAL = previous;
      }
    }
  });

  app.post("/api/projects/:id/metadata/validate", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { platform?: "ios" | "android" };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    const result = await runMetadataValidate({
      cwd: projectRoot,
      platform: body.platform ?? "ios",
    });
    return result;
  });

  app.get("/api/projects/:id/credentials", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    return validateCredentials({ cwd: projectRoot });
  });

  app.post("/api/projects/:id/credentials/ios", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { keyId?: string; issuerId?: string; privateKeyPath?: string };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    return configureIosCredentials({
      cwd: projectRoot,
      keyId: body.keyId,
      issuerId: body.issuerId,
      privateKeyPath: body.privateKeyPath,
    });
  });

  app.post("/api/projects/:id/credentials/android", async (request, reply) => {
    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { serviceAccountPath?: string };
    const paths = getProjectPaths(feasHome, params.id);
    const projectRoot = await readProjectRootFromProjectFile(paths);
    if (!projectRoot) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }
    return configureAndroidCredentials({
      cwd: projectRoot,
      serviceAccountPath: body.serviceAccountPath,
    });
  });

  app.get("/api/projects/:id/logs", async (request, reply) => {
    const params = request.params as { id: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.root))) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    return { logs: await listLogFiles(paths.logsRoot) };
  });

  app.get("/api/projects/:id/logs/:logId", async (request, reply) => {
    const params = request.params as { id: string; logId: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.root))) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    const logs = await listLogFiles(paths.logsRoot);
    const match = logs.find((log) => log.id === params.logId);
    if (!match) {
      reply.code(404).send({ error: "log_not_found" });
      return;
    }

    const content = await fs.readFile(match.path, "utf8");
    return { ...match, content };
  });

  app.get("/api/projects/:id/logs/:logId/stream", async (request, reply) => {
    const params = request.params as { id: string; logId: string };
    const paths = getProjectPaths(feasHome, params.id);
    if (!(await fileExists(paths.root))) {
      reply.code(404).send({ error: "project_not_found" });
      return;
    }

    const logs = await listLogFiles(paths.logsRoot);
    const match = logs.find((log) => log.id === params.logId);
    if (!match) {
      reply.code(404).send({ error: "log_not_found" });
      return;
    }

    const content = await fs.readFile(match.path, "utf8");
    reply.type("text/plain").send(content);
  });

  await app.listen({
    host: "127.0.0.1",
    port: options.port,
  });

  return {
    url: expectedToken ? `http://localhost:${options.port}?token=${expectedToken}` : `http://localhost:${options.port}`,
    close: async () => {
      await app.close();
    },
  };
}
