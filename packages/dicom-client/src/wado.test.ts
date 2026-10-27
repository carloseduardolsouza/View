import { afterEach, expect, it, vi } from "vitest";
import { getSeriesFrames, orderFrames } from "./wado.js";

afterEach(() => vi.unstubAllGlobals());

it("orders by InstanceNumber, expands multiframe, skips instances without SOP UID", async () => {
  const inst = (sop: string | null, n: number, frames?: number) => ({
    ...(sop ? { "00080018": { Value: [sop] } } : {}),
    "00200013": { Value: [n] },
    ...(frames ? { "00280008": { Value: [frames] } } : {}),
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([inst("b", 2, 2), inst(null, 3), inst("a", 1)]))));
  const r = await getSeriesFrames("/dicomweb", "1.2", "3.4");
  expect(r.map((f) => f.imageId)).toEqual([
    "wadors:/dicomweb/studies/1.2/series/3.4/instances/a/frames/1",
    "wadors:/dicomweb/studies/1.2/series/3.4/instances/b/frames/1",
    "wadors:/dicomweb/studies/1.2/series/3.4/instances/b/frames/2",
  ]);
});

const geo = (n: number, z: number, extra: Record<string, unknown> = {}) => ({
  "00200013": { Value: [n] },
  "00200032": { Value: [0, 0, z] },
  "00200037": { Value: [1, 0, 0, 0, 1, 0] },
  ...extra,
});

it("orders by slice position even when InstanceNumber is reversed", () => {
  const items = [geo(1, 30), geo(2, 20), geo(3, 10)].map((instance, i) => ({ instance, frame: 0, i }));
  expect(orderFrames(items).map((f) => f.i)).toEqual([2, 1, 0]);
});

it("follows the normal for flipped orientation and falls back to InstanceNumber if any geometry is missing", () => {
  const flipped = (n: number, z: number) => geo(n, z, { "00200037": { Value: [0, 1, 0, 1, 0, 0] } }); // normal = -z
  expect(orderFrames([flipped(1, 0), flipped(2, 10)].map((instance, i) => ({ instance, frame: 0, i }))).map((f) => f.i)).toEqual([1, 0]);
  const noGeo = { "00200013": { Value: [1] } };
  expect(orderFrames([geo(2, 0), noGeo].map((instance, i) => ({ instance, frame: 0, i }))).map((f) => f.i)).toEqual([1, 0]);
});

it("uses per-frame geometry of multiframe, else frame order", () => {
  const pf = (z: number) => ({ "00209113": { Value: [{ "00200032": { Value: [0, 0, z] } }] } });
  const mf = {
    "00200013": { Value: [1] },
    "52009229": { Value: [{ "00209116": { Value: [{ "00200037": { Value: [1, 0, 0, 0, 1, 0] } }] } }] },
    "52009230": { Value: [pf(5), pf(1), pf(3)] },
  };
  expect(orderFrames([0, 1, 2].map((frame) => ({ instance: mf, frame }))).map((f) => f.frame)).toEqual([1, 2, 0]);
  const plain = { "00200013": { Value: [1] } };
  expect(orderFrames([2, 0, 1].map((frame) => ({ instance: plain, frame }))).map((f) => f.frame)).toEqual([0, 1, 2]);
});
