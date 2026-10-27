import { AnnotationPut, Preferences, type AnnotationRecord } from "@view/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { audit } from "./audit.js";
import { pool } from "./db.js";

const STUDY_RE = /^[0-9.]{1,64}$/;
const UID_RE = /^[\w-]{8,64}$/;
const MAX_DATA_BYTES = 64 * 1024;

const toRecord = (r: any): AnnotationRecord => ({
  uid: r.uid,
  studyUid: r.study_uid,
  seriesUid: r.series_uid,
  imageId: r.image_id,
  tool: r.tool,
  data: r.data,
  authorId: r.author_id,
  authorEmail: r.author_email,
  version: r.version,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const SELECT = `SELECT a.*, u.email AS author_email FROM annotations a JOIN users u ON u.id = a.author_id`;

/** Validates the study uid and records the access. There is no per-study permission: all studies in Orthanc are open. */
async function authorize(req: FastifyRequest, reply: FastifyReply, studyUid: string, action: string): Promise<boolean> {
  if (!STUDY_RE.test(studyUid)) { reply.code(400).send({ error: "invalid_study" }); return false; }
  await audit({ userId: req.user.id, action, studyUid, allowed: true, ip: req.ip });
  return true;
}

export function registerAnnotationRoutes(app: FastifyInstance) {
  const auth = {};

  app.get("/annotations/:studyUid", auth, async (req, reply) => {
    const { studyUid } = req.params as { studyUid: string };
    if (!(await authorize(req, reply, studyUid, "annotations_read"))) return;
    const { rows } = await pool.query(`${SELECT} WHERE a.study_uid = $1 AND a.deleted_at IS NULL ORDER BY a.created_at`, [studyUid]);
    return rows.map(toRecord);
  });

  app.put("/annotations/:studyUid/:uid", auth, async (req, reply) => {
    const { studyUid, uid } = req.params as { studyUid: string; uid: string };
    if (!UID_RE.test(uid)) return reply.code(400).send({ error: "invalid_uid" });
    const body = AnnotationPut.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_request" });
    if (JSON.stringify(body.data.data).length > MAX_DATA_BYTES) return reply.code(413).send({ error: "too_large" });
    if (!(await authorize(req, reply, studyUid, "annotation_write"))) return;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const cur = (await client.query("SELECT study_uid, author_id, version, deleted_at FROM annotations WHERE uid = $1 FOR UPDATE", [uid])).rows[0];
      if (cur && cur.study_uid !== studyUid) { await client.query("ROLLBACK"); return reply.code(409).send({ error: "uid_conflict" }); }
      if (cur && cur.author_id !== req.user.id && req.user.role !== "admin") {
        await client.query("ROLLBACK");
        return reply.code(403).send({ error: "not_author" });
      }
      const { tool, seriesUid, imageId, data } = body.data;
      const version = cur ? cur.version + 1 : 1;
      if (cur) {
        await client.query(
          `UPDATE annotations SET tool=$2, series_uid=$3, image_id=$4, data=$5, version=$6, updated_at=now(), deleted_at=NULL WHERE uid=$1`,
          [uid, tool, seriesUid ?? null, imageId ?? null, data, version],
        );
      } else {
        await client.query(
          `INSERT INTO annotations(uid, study_uid, series_uid, image_id, tool, data, author_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uid, studyUid, seriesUid ?? null, imageId ?? null, tool, data, req.user.id],
        );
      }
      await client.query("INSERT INTO annotation_history(annotation_uid, version, op, data, user_id) VALUES ($1,$2,$3,$4,$5)", [
        uid, version, cur ? "update" : "create", data, req.user.id,
      ]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    const { rows } = await pool.query(`${SELECT} WHERE a.uid = $1`, [uid]);
    return toRecord(rows[0]);
  });

  app.delete("/annotations/:studyUid/:uid", auth, async (req, reply) => {
    const { studyUid, uid } = req.params as { studyUid: string; uid: string };
    if (!UID_RE.test(uid)) return reply.code(400).send({ error: "invalid_uid" });
    if (!(await authorize(req, reply, studyUid, "annotation_delete"))) return;
    const cur = (await pool.query("SELECT author_id, version FROM annotations WHERE uid=$1 AND study_uid=$2 AND deleted_at IS NULL", [uid, studyUid])).rows[0];
    if (!cur) return reply.code(204).send(); // already gone: deleting twice is not an error
    if (cur.author_id !== req.user.id && req.user.role !== "admin") return reply.code(403).send({ error: "not_author" });
    await pool.query("UPDATE annotations SET deleted_at=now(), version=version+1, updated_at=now() WHERE uid=$1", [uid]);
    await pool.query("INSERT INTO annotation_history(annotation_uid, version, op, user_id) VALUES ($1,$2,'delete',$3)", [uid, cur.version + 1, req.user.id]);
    return reply.code(204).send();
  });

  app.get("/preferences", auth, async (req) => {
    const { rows } = await pool.query("SELECT doc FROM user_preferences WHERE user_id = $1", [req.user.id]);
    return rows[0]?.doc ?? {};
  });

  app.put("/preferences", auth, async (req, reply) => {
    const body = Preferences.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_request" });
    await pool.query(
      "INSERT INTO user_preferences(user_id, doc) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET doc = EXCLUDED.doc",
      [req.user.id, body.data],
    );
    return body.data;
  });
}
