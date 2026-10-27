import { expect, it } from "vitest";
import { studyUidFromPath } from "./dicomweb-path.js";

it("extracts study uid", () => {
  expect(studyUidFromPath("studies/1.2.840.1/series/1.2/metadata")).toBe("1.2.840.1");
  expect(studyUidFromPath("studies/1.2.840.1")).toBe("1.2.840.1");
});
it("rejects non-study or malicious paths", () => {
  expect(studyUidFromPath("studies")).toBeNull();
  expect(studyUidFromPath("series")).toBeNull();
  expect(studyUidFromPath("studies/..%2F..")).toBeNull();
  expect(studyUidFromPath("studies/abc")).toBeNull();
});
