export class DicomHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const RETRYABLE = new Set([502, 503, 504]);

/** GET with credentials, abort support and bounded exponential backoff on transient failures. */
export async function getJson<T>(url: string, opts: { signal?: AbortSignal; retries?: number; baseDelayMs?: number } = {}): Promise<T> {
  const { signal, retries = 2, baseDelayMs = 300 } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { credentials: "include", signal, headers: { accept: "application/dicom+json" } });
      if (res.ok) return (res.status === 204 ? [] : await res.json()) as T;
      if (!RETRYABLE.has(res.status) || attempt >= retries) throw new DicomHttpError(res.status, `HTTP ${res.status}`);
    } catch (e) {
      if (signal?.aborted || e instanceof DicomHttpError || attempt >= retries) throw e;
    }
    await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
  }
}
