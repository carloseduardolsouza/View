// Synchronisation between viewports. Geometry maths is pure (tested); ViewSync only applies it to live views.
import type { StackView, ViewState } from "./cornerstone-adapter";

export type Vec3 = [number, number, number];
export interface SeriesGeometry {
  frameOfReference: string | null;
  row: Vec3;
  col: Vec3;
  /** ImagePositionPatient of each image, null where missing */
  positions: Array<Vec3 | null>;
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
export const normalOf = (g: SeriesGeometry) => unit(cross(g.row, g.col));

/** cos(~8°): slightly tilted acquisitions still count as the same plane orientation */
const PARALLEL = 0.99;

export type Compat = { ok: true } | { ok: false; reason: string };

function sameFrame(a: SeriesGeometry | null, b: SeriesGeometry | null): Compat {
  if (!a || !b) return { ok: false, reason: "sem informação de posição" };
  if (!a.frameOfReference || !b.frameOfReference) return { ok: false, reason: "sem referencial de coordenadas" };
  if (a.frameOfReference !== b.frameOfReference) return { ok: false, reason: "referenciais de coordenadas diferentes" };
  return { ok: true };
}

/** Can slices be matched by anatomical position? Same frame of reference, parallel planes, known positions. */
export function compatibility(a: SeriesGeometry | null, b: SeriesGeometry | null): Compat {
  const f = sameFrame(a, b);
  if (!f.ok) return f;
  if (Math.abs(dot(normalOf(a!), normalOf(b!))) < PARALLEL) return { ok: false, reason: "orientações diferentes" };
  if (!a!.positions.length || !b!.positions.length || b!.positions.some((p) => !p)) return { ok: false, reason: "sem posição dos cortes" };
  return { ok: true };
}

/** Reference lines need the same frame of reference and planes that actually cross. */
export function crossing(a: SeriesGeometry | null, b: SeriesGeometry | null): Compat {
  const f = sameFrame(a, b);
  if (!f.ok) return f;
  return Math.abs(dot(normalOf(a!), normalOf(b!))) > PARALLEL ? { ok: false, reason: "planos paralelos" } : { ok: true };
}

/** Index of the slice of `to` closest (along its normal) to slice `fromIndex` of `from`; null if outside `to`'s coverage. */
export function nearestSlice(from: SeriesGeometry, fromIndex: number, to: SeriesGeometry): number | null {
  const p = from.positions[fromIndex];
  if (!p || !to.positions.length) return null;
  const n = normalOf(to);
  const d = dot(p, n);
  const proj = to.positions.map((q) => (q ? dot(q, n) : NaN));
  let best = -1;
  proj.forEach((v, i) => { if (!Number.isNaN(v) && (best < 0 || Math.abs(v - d) < Math.abs(proj[best]! - d))) best = i; });
  if (best < 0) return null;
  if (proj.length > 1) {
    const spacing = Math.abs(proj[proj.length - 1]! - proj[0]!) / (proj.length - 1);
    if (Math.abs(proj[best]! - d) > Math.max(spacing, 0.5)) return null; // that position is not covered by `to`
  }
  return best;
}

export interface SyncSettings {
  scroll: boolean;
  zoomPan: boolean;
  wl: boolean;
  /** position sync only for compatible series, whatever the manual scroll toggle says */
  auto: boolean;
  /** with manual scroll on: sync incompatible series by plain slice index */
  indexFallback: boolean;
}
export const NO_SYNC: SyncSettings = { scroll: false, zoomPan: false, wl: false, auto: false, indexFallback: false };

/** Slice of `to` that should follow `fromIndex`, or null to leave it alone. */
export function scrollTarget(s: SyncSettings, from: SeriesGeometry | null, fromIndex: number, to: SeriesGeometry | null, toCount: number): number | null {
  if (!s.scroll && !s.auto) return null;
  if (from && compatibility(from, to).ok) return nearestSlice(from, fromIndex, to!);
  if (s.scroll && !s.auto && s.indexFallback && toCount > 0) return Math.min(toCount - 1, fromIndex);
  return null;
}

type Views = () => Record<number, StackView | undefined>;

/** Mirrors what the user changes in one viewport onto the others, according to the current settings. */
export class ViewSync {
  settings: SyncSettings = NO_SYNC;
  private prev = new Map<number, ViewState>();
  private busy = false;
  constructor(private views: Views) {}

  forget(i: number) { this.prev.delete(i); }

  onState(src: number, s: ViewState) {
    const before = this.prev.get(src);
    this.prev.set(src, s);
    const cfg = this.settings;
    // a new stack (count changed) is a load, not a user action: never drag the others along
    if (this.busy || !before || before.count !== s.count || s.count === 0) return;
    const all = this.views();
    const from = all[src];
    if (!from) return;
    const idx = s.index !== before.index && (cfg.scroll || cfg.auto);
    const win = cfg.wl && s.ww != null && s.wc != null && (Math.abs((s.ww ?? 0) - (before.ww ?? 0)) > 0.5 || Math.abs((s.wc ?? 0) - (before.wc ?? 0)) > 0.5);
    const view = cfg.zoomPan && (Math.abs(s.zoom - before.zoom) > 1e-3 || Math.abs(s.pan[0] - before.pan[0]) > 0.5 || Math.abs(s.pan[1] - before.pan[1]) > 0.5);
    if (!idx && !win && !view) return;
    this.busy = true;
    try {
      const g = idx ? from.geometry() : null;
      for (const [k, t] of Object.entries(all)) {
        if (!t || Number(k) === src || t.count === 0) continue;
        if (idx) {
          const j = scrollTarget(cfg, g, s.index, t.geometry(), t.count);
          if (j != null) t.goTo(j);
        }
        if (win) t.setWindow(s.ww!, s.wc!);
        if (view) t.setZoomPan(s.zoom, s.pan);
        this.prev.set(Number(k), t.state()); // what we just set must not echo back
      }
    } finally {
      this.busy = false;
    }
  }
}
