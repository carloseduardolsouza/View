// Runs against the REAL API (localhost:3000) and its DB. Start `npm run dev` first. Cleans up what it creates.
import http from "node:http";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.loadEnvFile(new URL("../../../.env", import.meta.url));
const API = process.env.API_URL ?? "http://localhost:3000";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const run = Date.now().toString();
const STUDY = `9.9.${run}`;
const uids = [`inttest-${run}-a`, `inttest-${run}-b`];
const body = (data: object = { v: 1 }) => ({ tool: "Length", seriesUid: "1.2.3", imageId: "wadors:x", data });
const put = (study: string, uid: string, b: unknown) =>
  fetch(`${API}/annotations/${study}/${uid}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const list = async (study = STUDY) => (await fetch(`${API}/annotations/${study}`)).json() as Promise<any[]>;
const history = async (uid: string) => (await db.query("SELECT version, op FROM annotation_history WHERE annotation_uid=$1 ORDER BY version", [uid])).rows;

let originalPrefs: unknown;
beforeAll(async () => { originalPrefs = await (await fetch(`${API}/preferences`)).json(); });
afterAll(async () => {
  await db.query("DELETE FROM annotation_history WHERE annotation_uid = ANY($1)", [uids]);
  await db.query("DELETE FROM annotations WHERE uid = ANY($1)", [uids]);
  await fetch(`${API}/preferences`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(originalPrefs) });
  await db.end();
});

describe("annotations", () => {
  it("create -> update -> delete keeps versions and history", async () => {
    const [uid] = uids as [string];
    let r = await put(STUDY, uid, body({ v: 1 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ uid, studyUid: STUDY, version: 1, authorEmail: "local@view.local", data: { v: 1 } });

    r = await put(STUDY, uid, body({ v: 2 }));
    expect(await r.json()).toMatchObject({ version: 2, data: { v: 2 } });
    expect(await list()).toHaveLength(1); // update must not duplicate

    const del = await fetch(`${API}/annotations/${STUDY}/${uid}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(await list()).toHaveLength(0);
    expect((await fetch(`${API}/annotations/${STUDY}/${uid}`, { method: "DELETE" })).status).toBe(204); // idempotent
    expect(await history(uid)).toEqual([{ version: 1, op: "create" }, { version: 2, op: "update" }, { version: 3, op: "delete" }]);
  });

  it("rejects bad input", async () => {
    const [, uid] = uids as [string, string];
    expect((await put(STUDY, "abc", body())).status).toBe(400); // uid too short
    expect((await put("not-a-uid", uid, body())).status).toBe(400); // study must be digits and dots
    expect((await put(STUDY, uid, { data: {} })).status).toBe(400); // tool missing
    expect((await put(STUDY, uid, { tool: "Length", data: "x" })).status).toBe(400);
    expect((await fetch(`${API}/annotations/not-a-uid`)).status).toBe(400);
    expect((await put(STUDY, uid, body({ big: "x".repeat(70_000) }))).status).toBe(413);
    expect((await fetch(`${API}/annotations/${STUDY}/abc`, { method: "DELETE" })).status).toBe(400);
  });

  it("a uid cannot be moved to another study", async () => {
    const [, uid] = uids as [string, string];
    expect((await put(STUDY, uid, body())).status).toBe(200);
    expect((await put(`${STUDY}.1`, uid, body())).status).toBe(409);
    expect((await fetch(`${API}/annotations/${STUDY}.1/${uid}`, { method: "DELETE" })).status).toBe(204); // no-op: not in that study
    expect(await list()).toHaveLength(1);
  });

  it("unknown routes are 404", async () => {
    expect((await fetch(`${API}/nope`)).status).toBe(404);
    expect((await fetch(`${API}/annotations`)).status).toBe(404);
  });
});

describe("preferences", () => {
  it("round trips and validates", async () => {
    const prefs = { keymap: { "tool.length": "k" } };
    const r = await fetch(`${API}/preferences`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(prefs) });
    expect(r.status).toBe(200);
    expect(await (await fetch(`${API}/preferences`)).json()).toEqual(prefs);
    const bad = await fetch(`${API}/preferences`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ keymap: { a: 1 } }) });
    expect(bad.status).toBe(400);
    expect(await (await fetch(`${API}/preferences`)).json()).toEqual(prefs); // failed write changed nothing
  });
});

describe("/dicomweb path validation", () => {
  const raw = (path: string) =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      // http.request does not normalise ".." the way fetch/URL does
      http.get({ host: "localhost", port: 3000, path }, (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      }).on("error", reject);
    });

  it("only study-scoped paths and the study list pass", async () => {
    expect((await fetch(`${API}/dicomweb/studies`)).status).toBe(200);
    for (const p of ["series", "studies/abc/series", "studies//series", "instances", "../system"]) {
      expect((await fetch(`${API}/dicomweb/${p}`)).status, p).toBe(404);
    }
  });

  it("cannot escape /dicom-web with dot segments", async () => {
    for (const p of ["/dicomweb/studies/1.2.3/../../system", "/dicomweb/studies/1.2.3/%2e%2e/%2e%2e/system", "/dicomweb/studies/1.2.3/..%2f..%2fsystem"]) {
      const r = await raw(p);
      expect(r.text, p).not.toContain("DicomAet");
      expect(r.text, p).not.toContain("OrthancVersion");
    }
  });
});
