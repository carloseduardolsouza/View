import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { SessionUser } from "@view/contracts";
import Fastify from "fastify";
import { Readable } from "node:stream";
import { registerAnnotationRoutes } from "./annotations.js";
import { audit } from "./audit.js";
import { config } from "./config.js";
import { studyUidFromPath } from "./dicomweb-path.js";
import { registerStowRoutes } from "./stow.js";
import { ensureLocalUser } from "./local-user.js";
import { genReqId, loggerOptions } from "./logger.js";
import { registerOps } from "./ops.js";
import { pool } from "./db.js";
import { orthancGet } from "./upstream.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser;
  }
}

const localUser = await ensureLocalUser();
const app = Fastify({ logger: loggerOptions, genReqId, trustProxy: config.trustProxy });

await app.register(cors, { origin: config.webOrigin });
await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: "1 minute" });
registerOps(app);
app.decorateRequest("user", undefined as unknown as SessionUser);
app.addHook("onRequest", async (req) => { req.user = localUser; });

async function proxy(req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply, subPath: string) {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const r = await orthancGet(`/dicom-web/${subPath}${qs}`, String(req.headers.accept ?? "*/*"));
  if ("error" in r) return reply.code(503).header("retry-after", "10").send({ error: r.error });
  const upstream = r.res;
  reply.code(upstream.status);
  const ct = upstream.headers.get("content-type");
  if (ct) reply.header("content-type", ct);
  return reply.send(upstream.body ? Readable.fromWeb(upstream.body as any) : undefined);
}

// Orthanc credentials stay on the server; the browser only talks to this proxy. Every study in Orthanc is visible.
app.get("/dicomweb/*", async (req, reply) => {
  const subPath = (req.params as { "*": string })["*"];
  if (subPath === "studies") return proxy(req, reply, subPath);
  const studyUid = studyUidFromPath(subPath);
  if (!studyUid) return reply.code(404).send({ error: "not_found" });
  await audit({ userId: req.user.id, action: "wado", studyUid, allowed: true, ip: req.ip });
  return proxy(req, reply, subPath);
});

registerAnnotationRoutes(app);
registerStowRoutes(app);

await app.listen({ port: config.port, host: config.host });

// graceful shutdown: stop accepting, drain in-flight requests, close the pool
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, async () => {
    app.log.info({ sig }, "shutting down");
    await app.close().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  });
}
