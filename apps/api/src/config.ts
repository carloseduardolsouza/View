function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // 127.0.0.1 in dev; containers set HOST=0.0.0.0 (the port is then only reachable on the compose network)
  host: process.env.HOST ?? "127.0.0.1",
  trustProxy: process.env.TRUST_PROXY === "true",
  // per client IP per minute; a 700-slice CT scrolled quickly easily exceeds 1200 frame requests/min
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 30000),
  databaseUrl: req("DATABASE_URL"),
  orthancUrl: req("ORTHANC_URL"),
  orthancAuth: "Basic " + Buffer.from(`${req("ORTHANC_USER")}:${req("ORTHANC_PASSWORD")}`).toString("base64"),
  webOrigin: req("WEB_ORIGIN"),
};
