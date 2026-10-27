// Fails when the inline script in apps/web/index.html no longer matches the CSP hash in infra/nginx/security-headers.conf.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../apps/web/index.html", import.meta.url), "utf8");
const csp = readFileSync(new URL("../infra/nginx/security-headers.conf", import.meta.url), "utf8");
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `sha256-${createHash("sha256").update(m[1]).digest("base64")}`);
const missing = inline.filter((h) => !csp.includes(`'${h}'`));
if (missing.length) {
  console.error("CSP hash missing for inline script(s):", missing.join(", "));
  process.exit(1);
}
console.log(`csp ok (${inline.length} inline script hash(es))`);
