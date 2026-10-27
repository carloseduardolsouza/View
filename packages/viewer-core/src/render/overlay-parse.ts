// Pure parsing of DICOM SEG / RTSTRUCT into per-image masks (no Cornerstone import: testable in node).
import dcmjs from "dcmjs";

const { DicomMessage, DicomMetaDictionary, Colors } = dcmjs.data;

export type RGB = [number, number, number];
export interface OverlaySegment { index: number; label: string; color: RGB }
export interface Plane { ipp: number[]; rowCos: number[]; colCos: number[]; rowSpacing: number; colSpacing: number; rows: number; cols: number }
export interface Contour { segment: number; sopUid: string; points: number[] } // flat x,y,z in patient mm
export interface OverlayObject {
  kind: "SEG" | "RTSTRUCT";
  label: string;
  segments: OverlaySegment[];
  /** SEG: ready masks per referenced SOPInstanceUID (value = segment index, 0 = none). */
  masks: Map<string, { rows: number; cols: number; data: Uint8Array }>;
  /** RTSTRUCT: polygons, rasterised against each image plane when applied. */
  contours: Contour[];
  warnings: string[];
}

const PALETTE: RGB[] = [[230, 57, 70], [42, 157, 143], [244, 162, 97], [69, 123, 157], [155, 93, 229], [241, 196, 15], [46, 204, 113], [231, 111, 190]];
export const paletteColor = (i: number): RGB => PALETTE[(i - 1 + PALETTE.length) % PALETTE.length]!;

export const OVERLAY_MODALITIES = ["SEG", "RTSTRUCT"];
export const isOverlaySeries = (modality: string) => OVERLAY_MODALITIES.includes(modality);

const arr = (x: unknown): any[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const nums = (x: unknown): number[] => arr(x).map(Number);

function labToRgb(lab: unknown): RGB | null {
  const v = nums(lab);
  if (v.length !== 3 || v.some((n) => !Number.isFinite(n))) return null;
  try {
    const c = Colors.dicomlab2RGB(v) as number[];
    return c.map((x) => Math.max(0, Math.min(255, Math.round(x * 255)))) as RGB;
  } catch { return null; }
}

const read = (buf: ArrayBuffer): Record<string, any> => DicomMetaDictionary.naturalizeDataset(DicomMessage.readFile(buf).dict);

// dcmjs 0.52 decodes strings inside sequences as latin1 even when SpecificCharacterSet is UTF-8: undo that for labels.
const utf8 = (ds: Record<string, any>) => (s: unknown) => {
  const t = String(s ?? "");
  if (ds.SpecificCharacterSet !== "ISO_IR 192" || /[^\u0000-ÿ]/.test(t)) return t;
  return new TextDecoder().decode(Uint8Array.from(t, (c) => c.charCodeAt(0)));
};

const bytesOf =(px: unknown): Uint8Array => {
  const b = arr(px)[0];
  return b instanceof ArrayBuffer ? new Uint8Array(b) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(0);
};

/** Parses a SEG (BINARY bit-packed or FRACTIONAL 8-bit, uncompressed). Compressed transfer syntaxes are refused. */
export function parseSeg(buf: ArrayBuffer): OverlayObject {
  const ds = read(buf);
  const meta = DicomMessage.readFile(buf).meta as Record<string, { Value?: unknown[] }>;
  const ts = String(meta?.["00020010"]?.Value?.[0] ?? "");
  if (ts && !["1.2.840.10008.1.2", "1.2.840.10008.1.2.1"].includes(ts)) throw new Error("SEG comprimido (RLE/JPEG) ainda não é suportado.");
  const rows = Number(ds.Rows), cols = Number(ds.Columns), bits = Number(ds.BitsAllocated);
  if (!rows || !cols) throw new Error("SEG sem dimensões.");
  const fractional = ds.SegmentationType === "FRACTIONAL";
  const half = fractional ? (Number(ds.MaximumFractionalValue) || 255) / 2 : 0;
  const px = bytesOf(ds.PixelData);
  const size = rows * cols;
  const on = (f: number, p: number) => (bits === 1 ? ((px[(f * size + p) >> 3] ?? 0) >> ((f * size + p) & 7)) & 1 : (px[f * size + p] ?? 0) > half);

  const fix = utf8(ds);
  const segments: OverlaySegment[] = arr(ds.SegmentSequence).map((s, i) => ({
    index: Number(s.SegmentNumber), label: s.SegmentLabel ? fix(s.SegmentLabel) : `Segmento ${i + 1}`,
    color: labToRgb(s.RecommendedDisplayCIELabValue) ?? paletteColor(i + 1),
  }));
  const shared = arr(ds.SharedFunctionalGroupsSequence)[0];
  const masks: OverlayObject["masks"] = new Map();
  const warnings: string[] = [];
  const frames = arr(ds.PerFrameFunctionalGroupsSequence);
  let skipped = 0;
  frames.forEach((g, f) => {
    const sop = arr(arr((g.DerivationImageSequence ?? shared?.DerivationImageSequence))[0]?.SourceImageSequence)[0]?.ReferencedSOPInstanceUID;
    const seg = Number(arr(g.SegmentIdentificationSequence ?? shared?.SegmentIdentificationSequence)[0]?.ReferencedSegmentNumber);
    if (!sop || !seg) { skipped++; return; }
    let m = masks.get(sop);
    if (!m) masks.set(sop, (m = { rows, cols, data: new Uint8Array(size) }));
    for (let p = 0; p < size; p++) if (on(f, p)) m.data[p] = seg; // shortcut: overlapping segments on one image: the last wins
  });
  if (skipped) warnings.push(`${skipped} quadro(s) sem imagem de referência foram ignorados.`);
  return { kind: "SEG", label: String(ds.SeriesDescription ?? "Segmentação"), segments, masks, contours: [], warnings };
}

/** Parses an RTSTRUCT's closed planar contours; one overlay segment per ROI. */
export function parseRtstruct(buf: ArrayBuffer): OverlayObject {
  const ds = read(buf);
  const fix = utf8(ds);
  const names = new Map<number, string>(arr(ds.StructureSetROISequence).map((r) => [Number(r.ROINumber), fix(r.ROIName)]));
  const segments: OverlaySegment[] = [];
  const contours: Contour[] = [];
  const warnings: string[] = [];
  arr(ds.ROIContourSequence).forEach((roi, i) => {
    const index = i + 1;
    const c = nums(roi.ROIDisplayColor);
    segments.push({ index, label: names.get(Number(roi.ReferencedROINumber)) || `ROI ${index}`, color: c.length === 3 ? (c as RGB) : paletteColor(index) });
    for (const ct of arr(roi.ContourSequence)) {
      const sopUid = arr(ct.ContourImageSequence)[0]?.ReferencedSOPInstanceUID;
      if (ct.ContourGeometricType !== "CLOSED_PLANAR" || !sopUid) { warnings.push(`Contorno não planar/fechado ou sem imagem em "${segments[index - 1]!.label}" ignorado.`); continue; }
      contours.push({ segment: index, sopUid, points: nums(ct.ContourData) });
    }
  });
  return { kind: "RTSTRUCT", label: String(ds.StructureSetLabel ?? ds.SeriesDescription ?? "RTSTRUCT"), segments, masks: new Map(), contours, warnings: [...new Set(warnings)] };
}

/** Even-odd scanline fill of a patient-space polygon onto the image grid; writes `value` into `out`. */
export function rasterizeContour(points: number[], plane: Plane, value: number, out: Uint8Array) {
  const n = Math.floor(points.length / 3);
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const d = [points[3 * i]! - plane.ipp[0]!, points[3 * i + 1]! - plane.ipp[1]!, points[3 * i + 2]! - plane.ipp[2]!];
    xs.push((d[0]! * plane.rowCos[0]! + d[1]! * plane.rowCos[1]! + d[2]! * plane.rowCos[2]!) / plane.colSpacing);
    ys.push((d[0]! * plane.colCos[0]! + d[1]! * plane.colCos[1]! + d[2]! * plane.colCos[2]!) / plane.rowSpacing);
  }
  if (n < 3) return;
  for (let y = Math.max(0, Math.ceil(Math.min(...ys))); y <= Math.min(plane.rows - 1, Math.floor(Math.max(...ys))); y++) {
    const cuts: number[] = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if ((ys[i]! <= y && ys[j]! > y) || (ys[j]! <= y && ys[i]! > y)) cuts.push(xs[i]! + ((y - ys[i]!) / (ys[j]! - ys[i]!)) * (xs[j]! - xs[i]!));
    }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2)
      for (let x = Math.max(0, Math.ceil(cuts[k]!)); x <= Math.min(plane.cols - 1, Math.floor(cuts[k + 1]!)); x++) out[y * plane.cols + x] = value;
  }
}

/** First part of a multipart/related WADO-RS response (the instance bytes). */
export function firstMultipartPart(body: Uint8Array, contentType: string): Uint8Array {
  const m = /boundary="?([^";]+)"?/i.exec(contentType);
  if (!m) return body; // not multipart: assume the raw instance
  const dec = (a: number, b: number) => new TextDecoder("latin1").decode(body.subarray(a, b));
  const delim = `--${m[1]}`;
  const text = dec(0, body.length); // latin1 keeps 1 char = 1 byte so offsets match
  const start = text.indexOf(delim);
  const headEnd = start < 0 ? -1 : text.indexOf("\r\n\r\n", start);
  if (headEnd < 0) throw new Error("Resposta multipart inválida.");
  const end = text.indexOf(`\r\n${delim}`, headEnd + 4);
  return body.subarray(headEnd + 4, end < 0 ? body.length : end);
}
