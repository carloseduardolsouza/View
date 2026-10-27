// Pure scale-bar maths (no Cornerstone import: easy to test).
export interface PixelSpacing {
  /** mm between rows / between columns */
  row: number;
  col: number;
  /** "pixel" = PixelSpacing (patient plane, calibrated); "proj" = ImagerPixelSpacing (detector plane, not corrected for magnification) */
  kind: "pixel" | "proj";
}

const pair = (v: unknown): [number, number] | null => {
  if (!Array.isArray(v) || v.length < 2) return null;
  const [r, c] = [Number(v[0]), Number(v[1])];
  return r > 0 && c > 0 && Number.isFinite(r) && Number.isFinite(c) ? [r, c] : null;
};

/** DICOM-JSON instance -> spacing. PixelSpacing wins; ImagerPixelSpacing is flagged "proj"; neither -> null (never guess mm). */
export function spacingOf(instance: Record<string, { Value?: unknown[] } | undefined> | undefined): PixelSpacing | null {
  const ps = pair(instance?.["00280030"]?.Value);
  if (ps) return { row: ps[0], col: ps[1], kind: "pixel" };
  const ips = pair(instance?.["00181164"]?.Value);
  return ips ? { row: ips[0], col: ips[1], kind: "proj" } : null;
}

const STEPS_MM = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

const fmt = (n: number) => String(n).replace(".", ",");

/** Largest "nice" length (1/2/5 x 10^k mm) whose bar fits in `maxPx`; null when even the smallest does not. */
export function niceScale(pixelsPerMm: number, maxPx = 140): { mm: number; px: number; label: string } | null {
  if (!(pixelsPerMm > 0) || !Number.isFinite(pixelsPerMm)) return null;
  let best: number | null = null;
  for (const mm of STEPS_MM) if (mm * pixelsPerMm <= maxPx) best = mm;
  if (best === null) return null;
  return { mm: best, px: best * pixelsPerMm, label: best >= 10 ? `${fmt(best / 10)} cm` : `${fmt(best)} mm` };
}
