import dcmjs from "dcmjs";
import { expect, it } from "vitest";
import { firstMultipartPart, isOverlaySeries, parseRtstruct, parseSeg, rasterizeContour } from "./overlay-parse";

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

function write(cls: string, ds: Record<string, unknown>): ArrayBuffer {
  const meta = { FileMetaInformationVersion: new Uint8Array([0, 1]).buffer, MediaStorageSOPClassUID: cls, MediaStorageSOPInstanceUID: "1.2.3.9", TransferSyntaxUID: "1.2.840.10008.1.2.1", ImplementationClassUID: "1.2.3" };
  const d = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  d.dict = DicomMetaDictionary.denaturalizeDataset({ SOPClassUID: cls, SOPInstanceUID: "1.2.3.9", ...ds });
  return d.write();
}

// synthetic: no real SEG/RTSTRUCT exists in the local PACS
function syntheticSeg(): ArrayBuffer {
  const rows = 4, cols = 4, size = rows * cols;
  // frame 0 -> segment 1 on image A: pixels 0 and 5; frame 1 -> segment 2 on image B: pixel 15
  const bits = new Uint8Array(Math.ceil((2 * size) / 8));
  const set = (f: number, p: number) => { const i = f * size + p; bits[i >> 3]! |= 1 << (i & 7); };
  set(0, 0); set(0, 5); set(1, 15);
  const frame = (seg: number, sop: string) => ({
    SegmentIdentificationSequence: { ReferencedSegmentNumber: seg },
    DerivationImageSequence: { SourceImageSequence: { ReferencedSOPInstanceUID: sop } },
  });
  return write("1.2.840.10008.5.1.4.1.1.66.4", {
    SpecificCharacterSet: "ISO_IR 192", Modality: "SEG", Rows: rows, Columns: cols, BitsAllocated: 1, BitsStored: 1, HighBit: 0, SamplesPerPixel: 1, PixelRepresentation: 0,
    NumberOfFrames: 2, SegmentationType: "BINARY", SeriesDescription: "Teste",
    SegmentSequence: [{ SegmentNumber: 1, SegmentLabel: "Fígado" }, { SegmentNumber: 2, SegmentLabel: "Baço" }],
    PerFrameFunctionalGroupsSequence: [frame(1, "1.1.11"), frame(2, "1.1.22")],
    PixelData: bits.buffer,
  });
}

it("parses SEG frames into per-image masks with segment labels", () => {
  const o = parseSeg(syntheticSeg());
  expect(o.segments.map((s) => s.label)).toEqual(["Fígado", "Baço"]);
  expect([...o.masks.get("1.1.11")!.data].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([0, 5]);
  expect(o.masks.get("1.1.11")!.data[0]).toBe(1);
  expect(o.masks.get("1.1.22")!.data[15]).toBe(2);
  expect(o.warnings).toEqual([]);
});

it("parses RTSTRUCT ROIs and contours", () => {
  const o = parseRtstruct(write("1.2.840.10008.5.1.4.1.1.481.3", {
    Modality: "RTSTRUCT", StructureSetLabel: "Plano",
    StructureSetROISequence: [{ ROINumber: 7, ROIName: "PTV" }],
    ROIContourSequence: [{
      ReferencedROINumber: 7, ROIDisplayColor: [255, 0, 0],
      ContourSequence: [{ ContourGeometricType: "CLOSED_PLANAR", NumberOfContourPoints: 4, ContourImageSequence: { ReferencedSOPInstanceUID: "1.1.11" }, ContourData: [0, 0, 0, 3, 0, 0, 3, 3, 0, 0, 3, 0] }],
    }],
  }));
  expect(o.segments).toEqual([{ index: 1, label: "PTV", color: [255, 0, 0] }]);
  expect(o.contours).toEqual([{ segment: 1, sopUid: "1.1.11", points: [0, 0, 0, 3, 0, 0, 3, 3, 0, 0, 3, 0] }]);
});

it("rasterises a polygon in image pixel space (spacing and origin applied)", () => {
  const plane = { ipp: [10, 10, 0], rowCos: [1, 0, 0], colCos: [0, 1, 0], rowSpacing: 2, colSpacing: 2, rows: 6, cols: 6 };
  const out = new Uint8Array(36);
  // square from patient (11,11) to (17,17) => pixels x,y in 1..3
  rasterizeContour([11, 11, 0, 17, 11, 0, 17, 17, 0, 11, 17, 0], plane, 3, out);
  const hit = [...out].flatMap((v, i) => (v ? [[i % 6, Math.floor(i / 6)]] : []));
  expect(hit).toHaveLength(9);
  expect(hit.every(([x, y]) => x! >= 1 && x! <= 3 && y! >= 1 && y! <= 3)).toBe(true);
});

it("extracts the first multipart part and detects overlay modalities", () => {
  const body = new TextEncoder().encode("--b\r\nContent-Type: application/dicom\r\n\r\nPAYLOAD\r\n--b--\r\n");
  expect(new TextDecoder().decode(firstMultipartPart(body, 'multipart/related; type="application/dicom"; boundary=b'))).toBe("PAYLOAD");
  expect(isOverlaySeries("SEG") && isOverlaySeries("RTSTRUCT") && !isOverlaySeries("CT")).toBe(true);
});
