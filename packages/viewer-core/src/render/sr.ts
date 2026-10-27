// Pure builder of a DICOM Comprehensive SR "Imaging Measurement Report" (TID 1500 skeleton) from viewer annotations.
// No Cornerstone import: testable in node. Output is a Part10 buffer.
import dcmjs from "dcmjs";
import type { AnnotationLike } from "./annotation-info";
import { toolTitle } from "./annotation-info";

const { DicomDict, DicomMessage, DicomMetaDictionary } = dcmjs.data;

export const COMPREHENSIVE_SR = "1.2.840.10008.5.1.4.1.1.88.33";
const EXPLICIT_LE = "1.2.840.10008.1.2.1";

export interface SrStudy {
  studyUid: string;
  patientId?: string;
  patientName?: string;
  studyDate?: string; // YYYYMMDD
  accessionNumber?: string;
}
export interface SrAnnotation {
  uid: string;
  tool: string;
  imageId: string; // wadors:.../studies/X/series/Y/instances/Z/frames/N
  sopClassUid: string; // the imageId carries no SOP class: the caller reads it from the image metadata
  frameOfReferenceUid?: string;
  points?: number[][]; // world (patient, mm) handle points
  label?: string;
  stats?: { length?: number; angle?: number; area?: number; mean?: number; unit?: string; areaUnit?: string };
}
export interface SrOptions { author?: string; now?: Date; seriesNumber?: number }

type Code = { CodeValue: string; CodingSchemeDesignator: string; CodeMeaning: string };
const code = (v: string, s: string, m: string): Code => ({ CodeValue: v, CodingSchemeDesignator: s, CodeMeaning: m });
const dcm = (v: string, m: string) => code(v, "DCM", m);
const seq = (c: Code) => [c];

const C = {
  report: dcm("126000", "Imaging Measurement Report"),
  language: dcm("121049", "Language of Content Item and Descendants"),
  observerType: dcm("121005", "Observer Type"),
  person: dcm("121006", "Person"),
  observerName: dcm("121008", "Person Observer Name"),
  library: dcm("111028", "Image Library"),
  libraryGroup: dcm("126200", "Image Library Group"),
  measurements: dcm("126010", "Imaging Measurements"),
  group: dcm("125007", "Measurement Group"),
  trackingId: dcm("112039", "Tracking Identifier"),
  trackingUid: dcm("112040", "Tracking Unique Identifier"),
  source: dcm("121112", "Source of Measurement"),
  region: dcm("111030", "Image Region"),
  finding: dcm("121071", "Finding"),
  image: dcm("260753009", "Image"),
  // shortcut: SNOMED CT codes written from memory of the CID 7469/7470 usage; review before clinical use.
  length: code("410668003", "SCT", "Length"),
  area: code("42798000", "SCT", "Area"),
  angle: code("131190003", "SCT", "Angle"),
  mean: code("373098007", "SCT", "Mean"),
};
const ucum = (v: string, m: string) => code(v, "UCUM", m);
const UNITS: Record<string, Code> = {
  mm: ucum("mm", "mm"), "mm²": ucum("mm2", "mm²"), cm: ucum("cm", "cm"), "cm²": ucum("cm2", "cm²"),
  deg: ucum("deg", "degree"), HU: ucum("[hnsf'U]", "Hounsfield unit"), px: ucum("{px}", "pixel"), "px²": ucum("{px}2", "pixel²"),
};
const unit = (u: string) => UNITS[u] ?? ucum(u, u);

export const newUid = () => {
  const b = new Uint8Array(16);
  globalThis.crypto.getRandomValues(b);
  return "2.25." + BigInt("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")).toString();
};

/** Parses study/series/instance UIDs and frame number from a wadors imageId. */
export function parseImageId(imageId: string) {
  const m = /studies\/([0-9.]+)\/series\/([0-9.]+)\/instances\/([0-9.]+)(?:\/frames\/(\d+))?/.exec(imageId);
  if (!m) return null;
  return { studyUid: m[1]!, seriesUid: m[2]!, sopUid: m[3]!, frame: m[4] ? Number(m[4]) : 1 };
}

const item = (rel: string, type: string, name: Code, extra: Record<string, unknown>) => ({
  RelationshipType: rel, ValueType: type, ConceptNameCodeSequence: seq(name), ...extra,
});
const num = (name: Code, value: number, u: string) =>
  item("CONTAINS", "NUM", name, { MeasuredValueSequence: [{ NumericValue: Number(value.toFixed(4)), MeasurementUnitsCodeSequence: seq(unit(u)) }] });

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

function region(a: SrAnnotation) {
  const p = a.points;
  if (!p?.length || !a.frameOfReferenceUid || p.some((q) => q.length < 3)) return null;
  let pts = p, type = "POLYLINE";
  if (a.tool === "EllipticalROI" && p.length >= 4) {
    // DICOM ELLIPSE wants the major axis first; Cornerstone's handle order does not guarantee it.
    const swap = dist(p[2]!, p[3]!) > dist(p[0]!, p[1]!);
    pts = swap ? [p[2]!, p[3]!, p[0]!, p[1]!] : p.slice(0, 4);
    type = "ELLIPSE";
  } else if (a.tool === "RectangleROI" && p.length >= 4) {
    pts = [...p.slice(0, 4), p[0]!]; // closed polyline
  }
  return item("CONTAINS", "SCOORD3D", C.region, {
    GraphicType: type, GraphicData: pts.flat(), ReferencedFrameOfReferenceUID: a.frameOfReferenceUid,
  });
}

function measurementGroup(a: SrAnnotation) {
  const ref = parseImageId(a.imageId)!;
  const s = a.stats ?? {};
  const u = !s.unit ? "px" : s.unit;
  const content: object[] = [
    item("CONTAINS", "TEXT", C.trackingId, { TextValue: a.label || toolTitle(a.tool) }),
    item("CONTAINS", "UIDREF", C.trackingUid, { UID: newUid() }),
    item("CONTAINS", "IMAGE", C.source, {
      ReferencedSOPSequence: [{
        ReferencedSOPClassUID: a.sopClassUid, ReferencedSOPInstanceUID: ref.sopUid,
        ...(ref.frame > 1 ? { ReferencedFrameNumber: ref.frame } : {}),
      }],
    }),
  ];
  const r = region(a);
  if (r) content.push(r);
  if (a.tool === "ArrowAnnotate" || a.tool === "Label") content.push(item("CONTAINS", "TEXT", C.finding, { TextValue: a.label ?? "" }));
  if (s.length != null) content.push(num(C.length, s.length, u));
  if (s.angle != null) content.push(num(C.angle, s.angle, "deg"));
  if (s.area != null) content.push(num(C.area, s.area, s.areaUnit ?? (u === "px" ? "px²" : `${u}²`)));
  if (s.mean != null) content.push(num(C.mean, s.mean, "HU")); // shortcut: assumes CT; the ROI stats unit for other modalities is not carried
  return item("CONTAINS", "CONTAINER", C.group, { ContinuityOfContent: "SEPARATE", ContentSequence: content });
}

/** Builds the Part10 bytes of a Comprehensive SR with one Measurement Group per annotation of this study. */
export function buildMeasurementReport(study: SrStudy, annotations: SrAnnotation[], opts: SrOptions = {}): ArrayBuffer {
  const items = annotations.filter((a) => parseImageId(a.imageId)?.studyUid === study.studyUid);
  if (!items.length) throw new Error("Nenhuma anotação deste estudo para exportar.");
  const now = opts.now ?? new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const sopUid = newUid();

  // Evidence + image library: unique referenced instances, grouped by series.
  const bySeries = new Map<string, Map<string, string>>();
  for (const a of items) {
    const r = parseImageId(a.imageId)!;
    if (!bySeries.has(r.seriesUid)) bySeries.set(r.seriesUid, new Map());
    bySeries.get(r.seriesUid)!.set(r.sopUid, a.sopClassUid);
  }
  const evidence = [{
    StudyInstanceUID: study.studyUid,
    ReferencedSeriesSequence: [...bySeries].map(([SeriesInstanceUID, m]) => ({
      SeriesInstanceUID,
      ReferencedSOPSequence: [...m].map(([u, c]) => ({ ReferencedSOPClassUID: c, ReferencedSOPInstanceUID: u })),
    })),
  }];
  const library = item("CONTAINS", "CONTAINER", C.library, {
    ContinuityOfContent: "SEPARATE",
    ContentSequence: [item("CONTAINS", "CONTAINER", C.libraryGroup, {
      ContinuityOfContent: "SEPARATE",
      ContentSequence: [...bySeries.values()].flatMap((m) => [...m].map(([u, c]) =>
        item("CONTAINS", "IMAGE", C.image, { ReferencedSOPSequence: [{ ReferencedSOPClassUID: c, ReferencedSOPInstanceUID: u }] }))),
    })],
  });

  const ds = {
    SpecificCharacterSet: "ISO_IR 192", SOPClassUID: COMPREHENSIVE_SR, SOPInstanceUID: sopUid,
    StudyInstanceUID: study.studyUid, SeriesInstanceUID: newUid(), SeriesNumber: opts.seriesNumber ?? 900, InstanceNumber: 1,
    Modality: "SR", PatientID: study.patientId ?? "", PatientName: study.patientName ?? "",
    StudyDate: study.studyDate ?? "", AccessionNumber: study.accessionNumber ?? "", StudyID: "",
    ContentDate: date, ContentTime: time, InstanceCreationDate: date, InstanceCreationTime: time,
    SeriesDescription: "Relatório de medidas", Manufacturer: "View", CompletionFlag: "PARTIAL", VerificationFlag: "UNVERIFIED",
    ValueType: "CONTAINER", ConceptNameCodeSequence: seq(C.report), ContinuityOfContent: "SEPARATE",
    ContentTemplateSequence: [{ MappingResource: "DCMR", TemplateIdentifier: "1500" }],
    CurrentRequestedProcedureEvidenceSequence: evidence,
    ContentSequence: [
      item("HAS CONCEPT MOD", "CODE", C.language, { ConceptCodeSequence: seq(code("pt-BR", "RFC5646", "Portuguese (Brazil)")) }),
      item("HAS OBS CONTEXT", "CODE", C.observerType, { ConceptCodeSequence: seq(C.person) }),
      item("HAS OBS CONTEXT", "PNAME", C.observerName, { PersonName: opts.author ?? "Visualizador" }),
      library,
      item("CONTAINS", "CONTAINER", C.measurements, { ContinuityOfContent: "SEPARATE", ContentSequence: items.map(measurementGroup) }),
    ],
  };
  const meta = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: COMPREHENSIVE_SR, MediaStorageSOPInstanceUID: sopUid,
    TransferSyntaxUID: EXPLICIT_LE, ImplementationClassUID: "2.25.1",
  };
  const dict = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  dict.dict = DicomMetaDictionary.denaturalizeDataset(ds);
  return dict.write();
}

export const readDicom = (buf: ArrayBuffer): Record<string, any> =>
  DicomMetaDictionary.naturalizeDataset(DicomMessage.readFile(buf).dict);

/** Adapter from a live Cornerstone annotation; `sopClassUid` comes from image metadata (sopCommonModule). */
export function toSrAnnotation(
  a: AnnotationLike & { annotationUID?: string; metadata?: { FrameOfReferenceUID?: string }; data?: { handles?: { points?: number[][] } } },
  sopClassUid: string,
): SrAnnotation | null {
  const imageId = a.metadata?.referencedImageId;
  const tool = a.metadata?.toolName;
  if (!imageId || !tool || !parseImageId(imageId)) return null;
  const st = Object.values((a.data?.cachedStats ?? {}) as Record<string, Record<string, unknown>>)[0] ?? {};
  const n = (v: unknown) => (typeof v === "number" ? v : Array.isArray(v) && typeof v[0] === "number" ? v[0] : undefined);
  return {
    uid: a.annotationUID ?? newUid(), tool, imageId, sopClassUid,
    frameOfReferenceUid: a.metadata?.FrameOfReferenceUID, points: a.data?.handles?.points,
    label: a.data?.label ?? a.data?.text,
    stats: { length: n(st.length), angle: n(st.angle), area: n(st.area), mean: n(st.mean), unit: st.unit as string | undefined, areaUnit: st.areaUnit as string | undefined },
  };
}
