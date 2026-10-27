import { expect, it } from "vitest";
import { COMMANDS, commandForKey, defaultKeymap, effectiveKeymap, keyOf, rebind } from "./keymap";

it("default keys are unique so no shortcut shadows another", () => {
  expect(new Set(COMMANDS.map((c) => c.key)).size).toBe(COMMANDS.length);
});
it("user overrides win; unknown commands and empty keys are ignored", () => {
  const km = effectiveKeymap({ "tool.length": "9", nope: "k", "tool.zoom": "" });
  expect(km["tool.length"]).toBe("9");
  expect(km["tool.zoom"]).toBe("z");
  expect("nope" in km).toBe(false);
});
it("rebind refuses a key owned by another command", () => {
  const km = defaultKeymap();
  expect(rebind(km, "tool.length", "w").conflict).toBe("tool.windowLevel");
  expect(rebind(km, "tool.length", "9").keymap["tool.length"]).toBe("9");
  expect(rebind(km, "tool.length", "l").conflict).toBeUndefined(); // same command, same key
});
it("normalises key events", () => {
  expect(keyOf({ key: "W" })).toBe("w");
  expect(keyOf({ key: "z", ctrlKey: true })).toBe("ctrl+z");
  expect(commandForKey(defaultKeymap(), "ArrowDown")).toBe("slice.next");
});
