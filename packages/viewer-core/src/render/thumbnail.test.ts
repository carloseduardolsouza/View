import { expect, it } from "vitest";
import { windowToBytes } from "./cornerstone-adapter";

it("maps the 1st..99th percentile range to 0..255 and ignores outliers", () => {
  const v = Array.from({ length: 1000 }, (_, i) => -1000 + i); // -1000..-1
  v[0] = -3000; // air outlier must not crush the contrast
  const b = windowToBytes(v, false);
  expect(b[500]).toBeGreaterThan(100);
  expect(b[500]).toBeLessThan(160);
  expect(b[999]).toBe(255);
  expect(windowToBytes(v, true)[999]).toBe(0);
});
it("a flat image does not divide by zero", () => {
  expect(Array.from(windowToBytes([5, 5, 5], false))).toEqual([0, 0, 0]);
});
