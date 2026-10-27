import type { FastifyInstance } from "fastify";
import { audit } from "./audit.js";
import { config } from "./config.js";

export const STOW_LIMIT = 32 * 1024 * 1024;

/** True for a Part10 file: 128-byte preamble + "DICM". */
export const isPart10 = (b: Buffer) => b.length > 132 && b.toString("latin1", 128, 132) === "DICM";

/** Wraps one DICOM file into the multipart/related body STOW-RS requires. */
export function multipartRelated(file: Buffer, boundary: string) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/dicom\r\n\r\n`),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

// STOW-RS proxy: the browser sends ONE raw application/dicom instance; Orthanc credentials stay server-side.
export function registerStowRoutes(app: FastifyInstance) {
  app.register(async (s) => {
    s.addContentTypeParser("application/dicom", { parseAs: "buffer", bodyLimit: STOW_LIMIT }, (_req, body, done) => done(null, body));
    s.post("/dicomweb/studies", { bodyLimit: STOW_LIMIT }, async (req, reply) => {
      const body = req.body;
      if (!Buffer.isBuffer(body) || !isPart10(body)) return reply.code(415).send({ error: "expected_application_dicom_part10" });
      const boundary = `view-${Date.now().toString(36)}`;
      const upstream = await fetch(`${config.orthancUrl}/dicom-web/studies`, {
        method: "POST",
        headers: { authorization: config.orthancAuth, "content-type": `multipart/related; type="application/dicom"; boundary=${boundary}`, accept: "application/dicom+json" },
        body: multipartRelated(body, boundary),
      }).catch(() => null);
      if (!upstream) return reply.code(502).send({ error: "pacs_unavailable" });
      const text = await upstream.text();
      await audit({ userId: req.user.id, action: "stow", allowed: upstream.ok, ip: req.ip });
      return reply.code(upstream.status).header("content-type", "application/dicom+json").send(text);
    });
  });
}
