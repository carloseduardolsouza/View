// Client telemetry: JS errors, WebGL problems, decode errors, timings. Never patient data:
// URLs lose their query string and any DICOM UID is masked before leaving the browser.
type Kind = "error" | "webgl" | "decode" | "timing";

const UID_RE = /\b\d+(?:\.\d+){3,}\b/g;
const MAX_EVENTS = 20; // per page load: a render loop must not flood the API
let sent = 0;
let started = false;

const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/\?[^\s"')]*/g, "").replace(UID_RE, "<uid>").slice(0, max);

function send(type: Kind, fields: { name?: string; message?: string; url?: string; ms?: number }) {
  if (sent >= MAX_EVENTS) return;
  sent++;
  const body = JSON.stringify({
    type,
    name: clean(fields.name, 64),
    message: clean(fields.message, 300),
    url: clean(fields.url ?? location.pathname, 200),
    ms: fields.ms,
  });
  // fire-and-forget: telemetry must never throw into the app
  try { void fetch("/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {}); } catch { /* ignore */ }
}

/** Call from the image loading path when a frame fails to decode/load (pass the Error). */
export const reportDecodeError = (err: unknown, transferSyntax?: string) =>
  send("decode", { name: transferSyntax ?? "decode", message: err instanceof Error ? err.message : String(err) });

/** e.g. reportTiming("time_to_first_image", performance.now() - t0) when the first viewport renders. */
export const reportTiming = (name: string, ms: number) => send("timing", { name, ms });

export function startTelemetry() {
  if (started) return;
  started = true;
  window.addEventListener("error", (e) => send("error", { name: "window.error", message: e.message, url: e.filename }));
  window.addEventListener("unhandledrejection", (e) =>
    send("error", { name: "unhandledrejection", message: e.reason instanceof Error ? e.reason.message : String(e.reason) }));
  // webgl context events do not bubble: capture on the document catches every canvas
  document.addEventListener("webglcontextlost", () => send("webgl", { name: "context_lost" }), true);
  document.addEventListener("webglcontextrestored", () => send("webgl", { name: "context_restored" }), true);
  try {
    if (!document.createElement("canvas").getContext("webgl2")) send("webgl", { name: "unsupported" });
  } catch { send("webgl", { name: "unsupported" }); }
}

startTelemetry(); // started on import so main.tsx needs a single side-effect import
