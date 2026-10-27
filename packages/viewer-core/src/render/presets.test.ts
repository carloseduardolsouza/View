import { expect, it } from "vitest";
import { CT_PRESETS, fromWindow, presetsFor, toWindow } from "./presets";

it("window width/center round-trips through the VOI range", () => {
  for (const p of CT_PRESETS) expect(toWindow(fromWindow(p.ww, p.wc).lower, fromWindow(p.ww, p.wc).upper)).toEqual({ ww: p.ww, wc: p.wc });
  expect(fromWindow(400, 40)).toEqual({ lower: -160, upper: 240 });
});
it("only CT gets named presets", () => {
  expect(presetsFor("CT")).toHaveLength(7);
  expect(presetsFor("CR")).toEqual([]);
});
