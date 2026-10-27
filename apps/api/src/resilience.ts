export type BreakerState = "closed" | "open" | "half-open";

/** Opens after `threshold` consecutive failures; after `resetMs` lets one probe through (half-open). */
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  constructor(private threshold = 5, private resetMs = 10_000, private now: () => number = Date.now) {}

  get state(): BreakerState {
    if (this.failures < this.threshold) return "closed";
    return this.now() - this.openedAt >= this.resetMs ? "half-open" : "open";
  }

  /** false = fail fast. In half-open only one caller gets to probe. */
  allow(): boolean {
    const s = this.state;
    if (s === "closed") return true;
    if (s === "open" || this.probing) return false;
    this.probing = true;
    return true;
  }

  success() { this.failures = 0; this.probing = false; }

  failure() {
    this.failures++;
    this.probing = false;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}

export const backoffMs = (attempt: number, base = 100) => base * 2 ** attempt + Math.floor(Math.random() * base);

/** Runs `fn` up to retries+1 times; `fn` returns {retry:true} to ask for another attempt. The last result is returned as is. */
export async function withRetry<T extends { retry: boolean }>(fn: () => Promise<T>, retries = 2, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fn();
    if (!r.retry || i >= retries) return r;
    await sleep(backoffMs(i));
  }
}
