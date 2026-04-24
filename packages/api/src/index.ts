import Fastify from "fastify";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface StartLocalApiServerOptions {
  port: number;
  token: string;
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

export async function startLocalApiServer(options: StartLocalApiServerOptions): Promise<{ url: string }> {
  const app = createApiServer();
  const expectedToken = options.token;
  const feasHome = getFeasHomeDir();
  const globalConfigPath = path.join(feasHome, "config.json");

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) {
      return;
    }

    const headerToken = request.headers["x-feas-token"];
    const queryToken = typeof request.query === "object" && request.query !== null ? (request.query as Record<string, unknown>).token : undefined;
    const providedToken = (typeof headerToken === "string" ? headerToken : undefined) ?? (typeof queryToken === "string" ? queryToken : undefined);

    if (providedToken !== expectedToken) {
      reply.code(401).send({ error: "unauthorized" });
    }
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
    const configFilePath = path.join(feasHome, "projects", params.id, "internal.config.json");
    if (!(await fileExists(configFilePath))) {
      reply.code(404).send({ error: "project_config_not_found" });
      return;
    }

    return readJsonFile<Record<string, unknown>>(configFilePath);
  });

  await app.listen({
    host: "127.0.0.1",
    port: options.port,
  });

  return {
    url: `http://localhost:${options.port}?token=${expectedToken}`,
  };
}
