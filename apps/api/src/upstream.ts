import { config } from "./config.js";
import { inc } from "./metrics.js";
import { CircuitBreaker, withRetry } from "./resilience.js";

export const orthancBreaker = new CircuitBreaker(5, 10_000);
const HEADER_TIMEOUT_MS = Number(process.env.ORTHANC_TIMEOUT_MS ?? 15_000);
const TRANSIENT = new Set([502, 503, 504]);

export type UpstreamResult = { res: Response } | { error: "pacs_circuit_open" | "pacs_unavailable" };

/** GET against Orthanc with timeout, retry+backoff on transient failures and a circuit breaker (fast 503 while the PACS is down). */
export async function orthancGet(path: string, accept: string): Promise<UpstreamResult> {
  if (!orthancBreaker.allow()) { inc("proxy_upstream_errors_total", { reason: "circuit_open" }); return { error: "pacs_circuit_open" }; }
  const r = await withRetry(async () => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), HEADER_TIMEOUT_MS); // headers only: cleared before the body streams
    try {
      const res = await fetch(`${config.orthancUrl}${path}`, { headers: { authorization: config.orthancAuth, accept }, signal: ctl.signal });
      return { res, retry: TRANSIENT.has(res.status) };
    } catch (e) {
      inc("proxy_upstream_errors_total", { reason: ctl.signal.aborted ? "timeout" : "network" });
      return { res: null, retry: true, e };
    } finally {
      clearTimeout(timer);
    }
  });
  // 5xx counts against the breaker; 4xx is the client's problem
  if (!r.res || r.res.status >= 500) {
    if (r.res) inc("proxy_upstream_errors_total", { reason: "status_" + r.res.status });
    orthancBreaker.failure();
    if (!r.res) return { error: "pacs_unavailable" };
  } else orthancBreaker.success();
  return { res: r.res };
}

/** Readiness probe: bypasses the breaker so it reflects the PACS right now. */
export async function orthancPing(): Promise<boolean> {
  try {
    const res = await fetch(`${config.orthancUrl}/system`, { headers: { authorization: config.orthancAuth }, signal: AbortSignal.timeout(2000) });
    await res.body?.cancel();
    return res.ok;
  } catch { return false; }
}
