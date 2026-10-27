import { expect, it } from "vitest";
import { flattenTags, instanceOfImageId, tagName } from "./dicom-tags";

it("names standard and private tags", () => {
  expect(tagName("00100010")).toBe("Patient Name");
  expect(tagName("00091001")).toBe("Tag privada");
});

it("flattens values, PN, bulk data and sequences", () => {
  const rows = flattenTags({
    "00100010": { vr: "PN", Value: [{ Alphabetic: "DOE^JOHN" }] },
    "00280030": { vr: "DS", Value: [0.5, 0.5] },
    "7FE00010": { vr: "OW", BulkDataURI: "http://x" },
    "00081140": { vr: "SQ", Value: [{ "00081155": { vr: "UI", Value: ["1.2"] } }] },
  });
  expect(rows.map((r) => [r.tag, r.value, r.depth])).toEqual([
    ["(0008,1140)", "1 item", 0], ["", "", 1], ["(0008,1155)", "1.2", 2],
    ["(0010,0010)", "DOE^JOHN", 0], ["(0028,0030)", "0.5 \ 0.5", 0], ["(7FE0,0010)", "[dados binários]", 0],
  ]);
});

it("parses the instance of a wadors imageId", () => {
  expect(instanceOfImageId("wadors:/dicomweb/studies/1.2/series/3.4/instances/5.6/frames/1")).toEqual({ studyUid: "1.2", seriesUid: "3.4", sopUid: "5.6" });
  expect(instanceOfImageId("x")).toBeNull();
});
