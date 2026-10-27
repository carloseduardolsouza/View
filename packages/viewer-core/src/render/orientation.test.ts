import { expect, it } from "vitest";
import { orientation } from "./orientation";

it("axial CT (row +x, col +y) shows A on top, L on the right, as radiology convention", () => {
  expect(orientation([1, 0, 0], [0, 1, 0])).toEqual({ top: "A", right: "L", bottom: "P", left: "R" });
});
it("coronal (row +x, col -z) shows S on top", () => {
  expect(orientation([1, 0, 0], [0, 0, -1])).toMatchObject({ top: "S", bottom: "I" });
});
it("flip horizontal swaps left/right; 90deg clockwise moves the left edge to the top", () => {
  expect(orientation([1, 0, 0], [0, 1, 0], 0, true)).toMatchObject({ left: "L", right: "R" });
  expect(orientation([1, 0, 0], [0, 1, 0], 90).top).toBe("R");
  expect(orientation([1, 0, 0], [0, 1, 0], -90).top).toBe("L");
});
