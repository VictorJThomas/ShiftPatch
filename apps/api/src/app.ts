import Fastify from "fastify";

export function buildApp() {
  const app = Fastify();

  app.get("/api/health", () => ({ status: "ok" }));

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: "Not found" }));
  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode ?? 500;
    reply.code(status).send({ error: status >= 500 ? "Internal server error" : err.message });
  });

  return app;
}
