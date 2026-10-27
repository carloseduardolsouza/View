import { expect, it } from "vitest";
import { buildMeasurementReport, parseImageId, readDicom, COMPREHENSIVE_SR, type SrAnnotation } from "./sr";

const S = "1.2.3", SER = "1.2.3.4", SOP = "1.2.3.4.5", CLS = "1.2.840.10008.5.1.4.1.1.2";
const id = `wadors:/dicomweb/studies/${S}/series/${SER}/instances/${SOP}/frames/1`;
const base = { imageId: id, sopClassUid: CLS, frameOfReferenceUid: "1.9.9" };
const anns: SrAnnotation[] = [
  { ...base, uid: "a", tool: "Length", points: [[0, 0, 0], [30, 40, 0]], stats: { length: 50, unit: "mm" } },
  { ...base, uid: "b", tool: "Angle", points: [[0, 0, 0], [1, 0, 0], [1, 1, 0]], stats: { angle: 90 } },
  { ...base, uid: "c", tool: "EllipticalROI", points: [[0, 0, 0], [10, 0, 0], [5, -2, 0], [5, 2, 0]], stats: { area: 62.8, areaUnit: "mm²", mean: 40, unit: "mm" } },
  { ...base, imageId: id.replace(S, "9.9"), uid: "d", tool: "Length", stats: { length: 1, unit: "mm" } }, // other study: ignored
];
const arr = (x: any): any[] => [x].flat();

it("parses wadors imageIds", () => {
  expect(parseImageId(id)).toEqual({ studyUid: S, seriesUid: SER, sopUid: SOP, frame: 1 });
  expect(parseImageId("nope")).toBeNull();
});

it("builds a re-parseable Comprehensive SR with measurements, units and references", () => {
  const ds = readDicom(buildMeasurementReport({ studyUid: S, patientId: "P1", patientName: "Doe^J" }, anns, { author: "Dr X" }));
  expect(ds.SOPClassUID).toBe(COMPREHENSIVE_SR);
  expect(ds.Modality).toBe("SR");
  expect(ds.StudyInstanceUID).toBe(S);
  expect(ds.ContentTemplateSequence.TemplateIdentifier).toBe("1500");
  const top = arr(ds.ContentSequence);
  const meas = top.find((c) => c.ConceptNameCodeSequence.CodeValue === "126010");
  const groups = arr(meas.ContentSequence);
  expect(groups).toHaveLength(3);
  const nums = groups.flatMap((g) => arr(g.ContentSequence).filter((c) => c.ValueType === "NUM"));
  const got = nums.map((n) => `${n.ConceptNameCodeSequence.CodeMeaning}:${n.MeasuredValueSequence.NumericValue}${n.MeasuredValueSequence.MeasurementUnitsCodeSequence.CodeValue}`);
  expect(got).toEqual(["Length:50mm", "Angle:90deg", "Area:62.8mm2", "Mean:40[hnsf'U]"]);
  const g0 = arr(groups[0].ContentSequence);
  expect(g0.find((c) => c.ValueType === "IMAGE").ReferencedSOPSequence.ReferencedSOPInstanceUID).toBe(SOP);
  const sc = g0.find((c) => c.ValueType === "SCOORD3D");
  expect(sc.GraphicType).toBe("POLYLINE");
  expect(sc.GraphicData).toEqual([0, 0, 0, 30, 40, 0]);
  expect(sc.ReferencedFrameOfReferenceUID).toBe("1.9.9");
  expect(JSON.stringify(top.find((c) => c.ValueType === "PNAME").PersonName)).toContain("Dr X");
  expect(ds.CurrentRequestedProcedureEvidenceSequence.ReferencedSeriesSequence.ReferencedSOPSequence.ReferencedSOPClassUID).toBe(CLS);
});

it("refuses to export when nothing belongs to the study", () => {
  expect(() => buildMeasurementReport({ studyUid: "7.7" }, anns)).toThrow(/Nenhuma/);
});

it("declares UTF-8 so accented text survives the roundtrip", () => {
  const ds = readDicom(buildMeasurementReport({ studyUid: S, patientName: "José^Ação" }, anns));
  expect(ds.SeriesDescription).toBe("Relatório de medidas");
  expect(JSON.stringify(ds.PatientName)).toContain("José");
});
