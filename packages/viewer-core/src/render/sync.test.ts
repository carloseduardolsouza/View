import { expect, it } from "vitest";
import { compatibility, crossing, nearestSlice, scrollTarget, NO_SYNC, type SeriesGeometry } from "./sync";

const slices = (z0: number, step: number, n: number, over: Partial<SeriesGeometry> = {}): SeriesGeometry => ({
  frameOfReference: "F", row: [1, 0, 0], col: [0, 1, 0], positions: Array.from({ length: n }, (_, i) => [0, 0, z0 + i * step]), ...over,
});
const axial = slices(0, 5, 20);
const coronal: SeriesGeometry = { frameOfReference: "F", row: [1, 0, 0], col: [0, 0, -1], positions: Array.from({ length: 10 }, (_, i) => [0, i * 3, 0]) };

it("nearest slice by projection on the normal, with different spacing and offset", () => {
  const fine = slices(2, 2.5, 40); // z = 2, 4.5, 7, ...
  expect(nearestSlice(axial, 4, fine)).toBe(7); // z=20 -> 19.5 is closest
  expect(nearestSlice(axial, 0, fine)).toBe(0);
});
it("returns null when the position is outside the other series", () => {
  const short = slices(100, 5, 5);
  expect(nearestSlice(axial, 2, short)).toBeNull();
});
it("compatible only with same frame of reference and parallel planes", () => {
  expect(compatibility(axial, slices(0, 2, 5)).ok).toBe(true);
  expect(compatibility(axial, slices(0, 2, 5, { frameOfReference: "G" }))).toMatchObject({ ok: false, reason: expect.stringContaining("referenciais") });
  expect(compatibility(axial, coronal)).toMatchObject({ ok: false, reason: "orientações diferentes" });
  expect(compatibility(axial, slices(0, 2, 5, { frameOfReference: null })).ok).toBe(false);
  expect(compatibility(axial, null).ok).toBe(false);
  expect(compatibility(axial, slices(0, 2, 5, { positions: [null, null] })).ok).toBe(false);
});
it("opposite normals (flipped acquisition) are still parallel", () => {
  expect(compatibility(axial, slices(0, 5, 20, { col: [0, -1, 0] })).ok).toBe(true);
});
it("reference lines need crossing planes of the same frame", () => {
  expect(crossing(axial, coronal).ok).toBe(true);
  expect(crossing(axial, slices(0, 2, 5))).toMatchObject({ ok: false, reason: "planos paralelos" });
  expect(crossing(axial, { ...coronal, frameOfReference: "G" }).ok).toBe(false);
});
it("scrollTarget: position when compatible, index only when the user opted in, never in auto", () => {
  const other = slices(0, 5, 10, { frameOfReference: "G" });
  const on = { ...NO_SYNC, scroll: true };
  expect(scrollTarget(NO_SYNC, axial, 3, slices(0, 5, 20), 20)).toBeNull();
  expect(scrollTarget(on, axial, 3, slices(0, 5, 20), 20)).toBe(3);
  expect(scrollTarget(on, axial, 3, other, 10)).toBeNull();
  expect(scrollTarget({ ...on, indexFallback: true }, axial, 15, other, 10)).toBe(9);
  expect(scrollTarget({ ...NO_SYNC, auto: true, indexFallback: true }, axial, 3, other, 10)).toBeNull();
  expect(scrollTarget({ ...NO_SYNC, auto: true }, axial, 3, slices(0, 10, 10), 10)).toBe(1); // z=15 -> 10 or 20: nearest is index 1 (tie broken low)
});

// ---- ViewSync with fake views ----
import { ViewSync } from "./sync";
import type { StackView, ViewState } from "./cornerstone-adapter";

function fake(geom: SeriesGeometry, count: number, onEmit: (s: ViewState) => void) {
  const st: ViewState = { index: 0, count, ww: 400, wc: 40, zoom: 1, rotation: 0, flipH: false, flipV: false, invert: false, orient: null, pan: [0, 0], spacing: null, pxPerMm: null, imageId: null };
  const v = {
    geometry: () => geom, count, state: () => ({ ...st }),
    goTo(i: number) { if (i !== st.index) { st.index = i; onEmit({ ...st }); } },
    setWindow(ww: number, wc: number) { st.ww = ww; st.wc = wc; onEmit({ ...st }); },
    setZoomPan(z: number, p: [number, number]) { st.zoom = z; st.pan = p; onEmit({ ...st }); },
  };
  return { v: v as unknown as StackView, st, user: (patch: Partial<ViewState>) => { Object.assign(st, patch); onEmit({ ...st }); } };
}

it("ViewSync mirrors scroll, window and zoom without echoing, and ignores loads", () => {
  const views: Record<number, StackView> = {};
  const ctl = new ViewSync(() => views);
  let calls = 0;
  const a = fake(axial, 20, (s) => { calls++; ctl.onState(0, s); });
  const b = fake(slices(0, 5, 20), 20, (s) => { calls++; ctl.onState(1, s); });
  views[0] = a.v; views[1] = b.v;
  ctl.onState(0, a.v.state()); ctl.onState(1, b.v.state());
  ctl.settings = { ...NO_SYNC, scroll: true, wl: true, zoomPan: true };
  a.user({ index: 7 });
  expect(b.st.index).toBe(7);
  a.user({ ww: 80, wc: 30 });
  expect([b.st.ww, b.st.wc]).toEqual([80, 30]);
  a.user({ zoom: 2, pan: [5, 6] });
  expect([b.st.zoom, b.st.pan]).toEqual([2, [5, 6]]);
  b.user({ index: 3 }); // works in the other direction, and the echo to `a` does not loop back
  expect(a.st.index).toBe(3);
  const before = calls;
  a.user({ count: 99 }); // a new stack is a load: nothing follows
  expect(calls).toBe(before + 1);
  ctl.settings = NO_SYNC;
  a.user({ index: 9 });
  expect(b.st.index).toBe(3);
});
