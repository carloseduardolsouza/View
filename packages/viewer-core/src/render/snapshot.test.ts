import { expect, it } from "vitest";
import { compose } from "./snapshot";

function fake() {
  const calls: unknown[][] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k === "drawImage" || k === "fillText" ? (...a: unknown[]) => calls.push([k, ...a]) : t[k]),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  const make = (width: number, height: number) => ({ width, height, getContext: () => ctx as never });
  return { calls, make };
}

it("draws canvas, then annotations at full size, then overlay corners", () => {
  const { calls, make } = fake();
  const base = { width: 200, height: 100 } as never;
  const svg = {} as never;
  compose(make, base, svg, { tl: ["A", "B"], br: ["Z"] }, 100);
  expect(calls[0]).toEqual(["drawImage", base, 0, 0]);
  expect(calls[1]).toEqual(["drawImage", svg, 0, 0, 200, 100]);
  const texts = calls.filter((c) => c[0] === "fillText");
  expect(texts.map((c) => c[1])).toEqual(["A", "B", "Z"]);
  expect(texts[0]![2]).toBe(16); // pad 8 css px * 2 device px/css px
  expect(texts[2]![2]).toBe(200 - 16); // bottom-right anchors at the right edge
});

it("skips annotations and overlay when not requested", () => {
  const { calls, make } = fake();
  compose(make, { width: 10, height: 10 } as never, null, null, 10);
  expect(calls).toHaveLength(1);
});
