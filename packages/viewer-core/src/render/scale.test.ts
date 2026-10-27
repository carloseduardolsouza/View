import { expect, it } from "vitest";
import { niceScale, spacingOf } from "./scale";

it("picks the largest nice length that fits", () => {
  expect(niceScale(2)).toMatchObject({ mm: 50, px: 100, label: "5 cm" });
  expect(niceScale(10)).toMatchObject({ mm: 10, label: "1 cm" });
  expect(niceScale(100)).toMatchObject({ mm: 1, label: "1 mm" });
  expect(niceScale(500)?.label).toBe("0,2 mm");
  expect(niceScale(0.5)?.label).toBe("20 cm");
});

it("returns null without usable scale", () => {
  for (const v of [0, -1, NaN, Infinity, 5000]) expect(niceScale(v)).toBeNull();
});

it("spacing: PixelSpacing, then ImagerPixelSpacing as proj, else null", () => {
  expect(spacingOf({ "00280030": { Value: [0.5, 0.7] } })).toEqual({ row: 0.5, col: 0.7, kind: "pixel" });
  expect(spacingOf({ "00181164": { Value: [0.2, 0.2] }, "00280030": { Value: [] } })).toEqual({ row: 0.2, col: 0.2, kind: "proj" });
  expect(spacingOf({ "00280030": { Value: [0, 0] } })).toBeNull();
  expect(spacingOf(undefined)).toBeNull();
});
