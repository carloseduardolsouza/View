// Ramped load test against the running API (no deps). Hits /dicomweb/studies, series metadata and frame retrieval.
//   node scripts/load-test.mjs [--url http://127.0.0.1:3000] [--steps 1,4,8,16] [--seconds 10] [--max-error 0.02]
// Stops the ramp as soon as a step exceeds --max-error (non-2xx rate) so it never hammers a struggling PACS.
// The API rate limit (RATE_LIMIT_MAX, default 1200/min per IP) will answer 429 first: raise it on the instance under test.
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const base = arg("url", "http://127.0.0.1:3000");
const steps = arg("steps", "1,4,8,16").split(",").map(Number);
const seconds = Number(arg("seconds", 10));
const maxError = Number(arg("max-error", 0.02));

const JSON_ACCEPT = "application/dicom+json", FRAME_ACCEPT = 'multipart/related; type="application/octet-stream"';
const get = (p) => fetch(base + p, { headers: { accept: p.includes("/frames/") ? FRAME_ACCEPT : JSON_ACCEPT } });
const json = async (p) => (await get(p)).json();

// pick the biggest study so frame retrieval is realistic
const studies = await json("/dicomweb/studies?limit=50");
const num = (s) => s["00201208"]?.Value?.[0] ?? 0;
const study = studies.sort((a, b) => num(b) - num(a))[0]["0020000D"].Value[0];
const series = (await json(`/dicomweb/studies/${study}/series`))[0]["0020000E"].Value[0];
const meta = await json(`/dicomweb/studies/${study}/series/${series}/metadata`);
const sops = meta.map((m) => m["00080018"].Value[0]);
console.log(`study with ${sops.length} instances in first series; ramp ${steps} x ${seconds}s`);

const scenarios = [
  ["studies", 1, () => "/dicomweb/studies?limit=50"],
  ["series_metadata", 2, () => `/dicomweb/studies/${study}/series/${series}/metadata`],
  ["frame", 7, () => `/dicomweb/studies/${study}/series/${series}/instances/${sops[Math.floor(Math.random() * sops.length)]}/frames/1`],
];
const pick = () => { let r = Math.random() * 10; for (const s of scenarios) { if ((r -= s[1]) < 0) return s; } return scenarios[2]; };
const pct = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0;

for (const n of steps) {
  const stats = Object.fromEntries(scenarios.map(([k]) => [k, { lat: [], bytes: 0, codes: {} }]));
  let total = 0, bad = 0;
  const end = Date.now() + seconds * 1000;
  await Promise.all(Array.from({ length: n }, async () => {
    while (Date.now() < end) {
      const [name, , path] = pick();
      const t = performance.now();
      let code = 0, bytes = 0;
      try { const r = await get(path()); code = r.status; bytes = (await r.arrayBuffer()).byteLength; } catch { code = -1; }
      const s = stats[name];
      s.lat.push(performance.now() - t); s.bytes += bytes; s.codes[code] = (s.codes[code] ?? 0) + 1;
      total++; if (code < 200 || code >= 300) bad++;
    }
  }));
  console.log(`\n== ${n} concurrent clients: ${total} requests, ${(total / seconds).toFixed(1)} req/s, errors ${bad}`);
  for (const [k, s] of Object.entries(stats)) {
    const l = s.lat.sort((a, b) => a - b);
    if (!l.length) continue;
    console.log(`  ${k.padEnd(16)} n=${String(l.length).padStart(5)} p50=${pct(l, .5).toFixed(0)}ms p95=${pct(l, .95).toFixed(0)}ms p99=${pct(l, .99).toFixed(0)}ms max=${l.at(-1).toFixed(0)}ms ${(s.bytes / 1e6 / seconds).toFixed(1)} MB/s codes=${JSON.stringify(s.codes)}`);
  }
  if (bad / total > maxError) { console.log(`\nSTOP: error rate ${(100 * bad / total).toFixed(1)}% > ${100 * maxError}%`); process.exitCode = 1; break; }
}
