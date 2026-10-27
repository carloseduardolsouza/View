import { expect, it } from "vitest";
import { AnnotationHistory, type Change, type Snap } from "./annotation-history";

function setup(limit?: number) {
  const store = new Map<string, Snap>();
  const applied: Change[] = [];
  const h = new AnnotationHistory(
    { serialize: (a) => a as Snap, put: (s) => void store.set(s.annotationUID, s), remove: (u) => void store.delete(u) },
    limit,
  );
  h.onApplied = (c) => applied.push(c);
  const draw = (s: Snap) => { store.set(s.annotationUID, s); h.recordCompleted(s); };
  return { store, applied, h, draw };
}

it("undo/redo of create, modify and delete", () => {
  const { store, h, draw, applied } = setup();
  draw({ annotationUID: "a", v: 1 });
  draw({ annotationUID: "a", v: 2 });
  store.delete("a"); h.recordRemoved({ annotationUID: "a", v: 2 });

  expect(h.undo()).toBe(true); // delete undone
  expect(store.get("a")).toEqual({ annotationUID: "a", v: 2 });
  h.undo(); // modify undone
  expect(store.get("a")).toEqual({ annotationUID: "a", v: 1 });
  h.undo(); // create undone
  expect(store.has("a")).toBe(false);
  expect(h.undo()).toBe(false);
  expect(applied.map((c) => c.type)).toEqual(["upsert", "upsert", "remove"]);

  h.redo(); h.redo(); h.redo();
  expect(store.has("a")).toBe(false);
  expect(h.canRedo).toBe(false);
});

it("a new action clears redo; no-op completions are ignored; seeded annotations record modify", () => {
  const { store, h, draw } = setup();
  h.seed([{ annotationUID: "s", v: 0 }]);
  store.set("s", { annotationUID: "s", v: 0 });
  draw({ annotationUID: "s", v: 0 }); // unchanged
  expect(h.canUndo).toBe(false);
  draw({ annotationUID: "s", v: 1 });
  h.undo();
  expect(store.get("s")).toEqual({ annotationUID: "s", v: 0 }); // restored, not removed
  draw({ annotationUID: "b", v: 1 });
  expect(h.canRedo).toBe(false);
});

it("is bounded and exposes `applying` during a step", () => {
  const { h, draw } = setup(2);
  for (let i = 0; i < 5; i++) draw({ annotationUID: `u${i}` });
  let n = 0;
  while (h.undo()) n++;
  expect(n).toBe(2);
  const seen: boolean[] = [];
  h.onApplied = () => seen.push(h.applying);
  h.redo();
  expect(seen).toEqual([true]);
  expect(h.applying).toBe(false);
});
