import type { FastifyInstance } from "fastify";
import { pool } from "./db.js";
import { inc, observe, render } from "./metrics.js";
import { scrub } from "./logger.js";
import { orthancBreaker, orthancPing } from "./upstream.js";

const TYPES = new Set(["error", "webgl", "decode", "timing"]);
const str = (v: unknown, max: number) => (typeof v === "string" ? scrub(v).slice(0, max) : "");

/** Liveness/readiness, Prometheus metrics, request metrics hooks and the client telemetry sink. */
export function registerOps(app: FastifyInstance) {
  app.addHook("onResponse", async (req, reply) => {
    const route = req.routeOptions?.url ?? "unmatched";
    inc("http_requests_total", { method: req.method, route, status: String(reply.statusCode) });
    observe("http_request_duration_seconds", { method: req.method, route }, reply.elapsedTime / 1000);
  });
  // lets nginx/clients correlate a failure with a log line
  app.addHook("onSend", async (req, reply) => { reply.header("x-request-id", req.id); });

  app.get("/healthz", { logLevel: "silent" }, async () => ({ status: "ok" }));

  app.get("/readyz", { logLevel: "silent" }, async (_req, reply) => {
    const [db, pacs] = await Promise.all([
      pool.query("SELECT 1").then(() => true, () => false),
      orthancPing(),
    ]);
    const ok = db && pacs;
    return reply.code(ok ? 200 : 503).send({ status: ok ? "ready" : "not_ready", postgres: db, orthanc: pacs, breaker: orthancBreaker.state });
  });

  // shortcut: unauthenticated like the rest of the API; nginx only exposes it on the internal network (see infra/nginx)
  app.get("/metrics", { logLevel: "silent" }, async (_req, reply) =>
    reply.type("text/plain; version=0.0.4").send(render({ breaker_open: orthancBreaker.state === "closed" ? 0 : 1 })));

  app.post("/telemetry", { bodyLimit: 4096, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.type !== "string" || !TYPES.has(b.type)) return reply.code(400).send({ error: "invalid_request" });
    const ev = {
      type: b.type,
      name: str(b.name, 64),
      message: str(b.message, 300),
      url: str(b.url, 200),
      ms: typeof b.ms === "number" && Number.isFinite(b.ms) ? Math.round(b.ms) : undefined,
    };
    inc("client_telemetry_total", { type: ev.type });
    req.log.info({ clientTelemetry: ev }, "client telemetry");
    return reply.code(204).send();
  });
}
