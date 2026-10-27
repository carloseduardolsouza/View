import { expect, it } from "vitest";
import { checkRegistration, geometryFromInstance, type FusionGeom } from "./fusion";

const ct: FusionGeom = { modality: "CT", forUid: "1.2", iop: [1, 0, 0, 0, 1, 0], pixelSpacing: [1, 1], rows: 512, columns: 512 };
const pt: FusionGeom = { ...ct, modality: "PT", pixelSpacing: [4, 4], rows: 128, columns: 128 };

it("accepts same frame of reference and warns about resolution", () => {
  expect(checkRegistration(ct, pt)).toEqual({ ok: true, warnings: [expect.stringContaining("resolução")] });
  expect(checkRegistration(ct, { ...pt, rows: 512, columns: 512, pixelSpacing: [1, 1] })).toEqual({ ok: true, warnings: [] });
});
it("refuses different frames of reference, tilted stacks, wrong modality and missing geometry", () => {
  expect(checkRegistration(ct, { ...pt, forUid: "9.9" })).toMatchObject({ ok: false, reason: expect.stringContaining("FrameOfReferenceUID") });
  expect(checkRegistration(ct, { ...pt, iop: [1, 0, 0, 0, 0.9, 0.43589] })).toMatchObject({ ok: false, reason: expect.stringContaining("orientações") });
  expect(checkRegistration(ct, { ...pt, modality: "CT" })).toMatchObject({ ok: false });
  expect(checkRegistration(ct, null)).toMatchObject({ ok: false });
});
it("reads geometry from instance JSON", () => {
  const g = geometryFromInstance({
    "00080060": { Value: ["PT"] }, "00200052": { Value: ["1.2"] }, "00200037": { Value: [1, 0, 0, 0, 1, 0] },
    "00280010": { Value: [128] }, "00280011": { Value: [128] }, "00280030": { Value: [4, 4] },
  });
  expect(g).toMatchObject({ modality: "PT", forUid: "1.2", rows: 128, pixelSpacing: [4, 4] });
  expect(geometryFromInstance({})).toBeNull();
});
