import { randomUUID } from "node:crypto";

const UID_RE = /\b\d+(?:\.\d+){3,}\b/g;
// PHI-bearing DICOMweb search keys (keyword or tag form); everything else in the query string is kept.
const PHI_KEY = /^(patient\w*|00100[0-9a-f]{3}|accession\w*|00080050|referring\w*|institution\w*|fuzzymatching|other\w*)$/i;

/** Masks study UIDs in paths and values of PHI query keys, so a URL is safe to log. */
export function redactUrl(url: string): string {
  const q = url.indexOf("?");
  const path = (q < 0 ? url : url.slice(0, q)).replace(UID_RE, "<uid>");
  if (q < 0) return path;
  const qs = url.slice(q + 1).split("&").map((kv) => {
    const [k = "", v = ""] = kv.split("=");
    let key = k;
    try { key = decodeURIComponent(k); } catch { /* keep raw */ }
    return PHI_KEY.test(key) ? `${k}=<redacted>` : `${k}=${v.replace(UID_RE, "<uid>")}`;
  });
  return `${path}?${qs.join("&")}`;
}

/** Removes the query string entirely and masks UIDs (used for client-supplied URLs/messages). */
export const scrub = (s: string) => s.replace(/\?[^\s"']*/g, "").replace(UID_RE, "<uid>");

export const loggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["req.headers.authorization", "req.headers.cookie", "res.headers['set-cookie']"],
  serializers: {
    req: (r: { method: string; url: string; id: string; ip?: string }) => ({ method: r.method, url: redactUrl(r.url), id: r.id, ip: r.ip }),
  },
};

// x-request-id from the reverse proxy is reused for correlation, but only if it looks sane (no log injection)
export const genReqId = (req: { headers: Record<string, unknown> }) => {
  const h = req.headers["x-request-id"];
  return typeof h === "string" && /^[\w.-]{8,64}$/.test(h) ? h : randomUUID();
};
