import Fastify from "fastify";

export function createApiServer() {
  const app = Fastify();

  app.get("/health", async () => {
    return { ok: true };
  });

  return app;
}
