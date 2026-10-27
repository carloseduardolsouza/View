import { describe, expect, it } from "vitest";
import { redactUrl, scrub } from "./logger.js";
import { CircuitBreaker, withRetry } from "./resilience.js";

describe("CircuitBreaker", () => {
  it("opens after threshold, probes once after reset, closes on success", () => {
    let t = 0;
    const b = new CircuitBreaker(2, 1000, () => t);
    b.failure(); expect(b.allow()).toBe(true);
    b.failure(); expect(b.state).toBe("open"); expect(b.allow()).toBe(false);
    t = 1000; expect(b.state).toBe("half-open");
    expect(b.allow()).toBe(true); expect(b.allow()).toBe(false); // single probe
    b.failure(); expect(b.state).toBe("open"); // failed probe reopens
    t = 2000; expect(b.allow()).toBe(true); b.success();
    expect(b.state).toBe("closed"); expect(b.allow()).toBe(true);
  });
});

describe("withRetry", () => {
  it("retries until ok, gives up after retries", async () => {
    let n = 0;
    const r = await withRetry(async () => ({ retry: ++n < 3, n }), 2, async () => {});
    expect(r.n).toBe(3);
    n = -10;
    expect((await withRetry(async () => ({ retry: true, n: ++n }), 2, async () => {})).n).toBe(-7);
  });
});

describe("redaction", () => {
  it("masks PHI query keys and UIDs, keeps paging params", () => {
    const u = redactUrl("/dicomweb/studies?PatientName=DOE%5EJOHN&00100020=123&limit=50&StudyInstanceUID=1.2.840.113619.2.55");
    expect(u).not.toMatch(/DOE|123&|840/);
    expect(u).toContain("limit=50");
    expect(redactUrl("/dicomweb/studies/1.2.3.4.5/series")).toBe("/dicomweb/studies/<uid>/series");
  });
  it("scrub drops query strings", () => {
    expect(scrub("fail at /s/1.2.3.4.5?PatientID=9")).toBe("fail at /s/<uid>");
  });
});
