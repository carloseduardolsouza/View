// Minimal Prometheus text exposition; label values come only from route patterns / fixed enums (low cardinality).
const BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const counters = new Map<string, Map<string, number>>();
const hist = new Map<string, { buckets: number[]; sum: number; count: number }>();
const help: Record<string, string> = {
  http_requests_total: "HTTP requests by method, route and status",
  http_request_duration_seconds: "HTTP request latency by method and route",
  proxy_upstream_errors_total: "Orthanc proxy failures by reason",
  audit_write_failures_total: "Failed audit_log inserts",
  client_telemetry_total: "Browser telemetry events by type",
  breaker_open: "1 when the Orthanc circuit breaker is not closed",
};

const lbl = (l: Record<string, string>) => {
  const s = Object.entries(l).map(([k, v]) => `${k}="${v.replace(/[\\"\n]/g, "_")}"`).join(",");
  return s ? `{${s}}` : "";
};

export function inc(name: string, labels: Record<string, string> = {}, by = 1) {
  const m = counters.get(name) ?? counters.set(name, new Map()).get(name)!;
  const k = lbl(labels);
  m.set(k, (m.get(k) ?? 0) + by);
}

export function observe(name: string, labels: Record<string, string>, seconds: number) {
  const k = name + lbl(labels);
  const h = hist.get(k) ?? hist.set(k, { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 }).get(k)!;
  BUCKETS.forEach((b, i) => { if (seconds <= b) h.buckets[i]!++; });
  h.sum += seconds;
  h.count++;
}

export function render(gauges: Record<string, number> = {}): string {
  const out: string[] = [];
  for (const [name, m] of counters) {
    out.push(`# HELP ${name} ${help[name] ?? name}`, `# TYPE ${name} counter`);
    for (const [k, v] of m) out.push(`${name}${k} ${v}`);
  }
  const seen = new Set<string>();
  for (const [key, h] of hist) {
    const i = key.indexOf("{");
    const name = i < 0 ? key : key.slice(0, i), labels = i < 0 ? "" : key.slice(i + 1, -1);
    if (!seen.has(name)) { seen.add(name); out.push(`# HELP ${name} ${help[name] ?? name}`, `# TYPE ${name} histogram`); }
    const sep = labels ? "," : "";
    BUCKETS.forEach((b, j) => out.push(`${name}_bucket{${labels}${sep}le="${b}"} ${h.buckets[j]!}`));
    out.push(`${name}_bucket{${labels}${sep}le="+Inf"} ${h.count}`, `${name}_sum{${labels}} ${h.sum}`, `${name}_count{${labels}} ${h.count}`);
  }
  for (const [name, v] of Object.entries(gauges)) out.push(`# HELP ${name} ${help[name] ?? name}`, `# TYPE ${name} gauge`, `${name} ${v}`);
  out.push(`# TYPE process_uptime_seconds gauge`, `process_uptime_seconds ${process.uptime()}`);
  return out.join("\n") + "\n";
}
