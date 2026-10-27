// Shows SEG / RTSTRUCT on a stack viewport as a Cornerstone labelmap (RTSTRUCT contours are rasterised per slice).
import { imageLoader, metaData } from "@cornerstonejs/core";
import { Enums, segmentation } from "@cornerstonejs/tools";
import { getJson } from "@view/dicom-client";
import type { StackView } from "./cornerstone-adapter";
import {
  firstMultipartPart, isOverlaySeries, parseRtstruct, parseSeg, rasterizeContour, type OverlayObject, type Plane, type RGB,
} from "./overlay-parse";
import { parseImageId } from "./sr";

export { isOverlaySeries } from "./overlay-parse";
export type { OverlayObject, OverlaySegment, RGB } from "./overlay-parse";

const LABELMAP = Enums.SegmentationRepresentations.Labelmap;

/** Downloads and parses every instance of a SEG/RTSTRUCT series (the first instance wins; one object per series is the norm). */
export async function loadOverlayObject(base: string, studyUid: string, seriesUid: string, modality: string, signal?: AbortSignal): Promise<OverlayObject> {
  if (!isOverlaySeries(modality)) throw new Error("A série não é SEG nem RTSTRUCT.");
  const root = `${base}/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(seriesUid)}`;
  const list = await getJson<Array<Record<string, { Value?: unknown[] } | undefined>>>(`${root}/instances`, { signal });
  const sop = String(list[0]?.["00080018"]?.Value?.[0] ?? "");
  if (!sop) throw new Error("Série sem instâncias.");
  const res = await fetch(`${root}/instances/${encodeURIComponent(sop)}`, { signal, credentials: "include", headers: { accept: 'multipart/related; type="application/dicom"' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const part = firstMultipartPart(new Uint8Array(await res.arrayBuffer()), res.headers.get("content-type") ?? "");
  const buf = part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer;
  return modality === "SEG" ? parseSeg(buf) : parseRtstruct(buf);
}

const planeOf = (imageId: string): Plane | null => {
  const p = metaData.get("imagePlaneModule", imageId) as
    | { imagePositionPatient?: number[]; rowCosines?: number[]; columnCosines?: number[]; rowPixelSpacing?: number; columnPixelSpacing?: number; rows: number; columns: number }
    | undefined;
  if (!p?.imagePositionPatient || !p.rowCosines || !p.columnCosines || !p.rowPixelSpacing || !p.columnPixelSpacing) return null;
  return { ipp: p.imagePositionPatient, rowCos: p.rowCosines, colCos: p.columnCosines, rowSpacing: p.rowPixelSpacing, colSpacing: p.columnPixelSpacing, rows: p.rows, cols: p.columns };
};

/** One overlay object attached to one stack viewport. Call dispose() before the viewport goes away. */
export class OverlayLayer {
  readonly segmentationId = `ov-${crypto.randomUUID()}`;
  readonly warnings: string[];
  private alpha = 0.5;

  /** Throws (Portuguese message) when the object does not reference any image of the stack. */
  constructor(private stack: StackView, readonly object: OverlayObject) {
    this.warnings = [...object.warnings];
    const ids = stack.imageIds;
    const derived = imageLoader.createAndCacheDerivedLabelmapImages(ids);
    let hits = 0;
    derived.forEach((img, i) => {
      const imageId = ids[i]!;
      const sop = parseImageId(imageId)?.sopUid;
      const px = img.getPixelData() as Uint8Array | undefined;
      if (!sop || !px) return;
      const m = object.masks.get(sop);
      if (m) {
        if (m.data.length === px.length) { px.set(m.data); hits++; } else this.warnings.push("Dimensões da segmentação diferem da imagem: quadro ignorado.");
      }
      const plane = object.contours.some((c) => c.sopUid === sop) ? planeOf(imageId) : null;
      if (plane) {
        for (const c of object.contours) if (c.sopUid === sop) rasterizeContour(c.points, plane, c.segment, px);
        hits++;
      } else if (object.contours.some((c) => c.sopUid === sop)) this.warnings.push("Imagem sem geometria: contornos ignorados.");
    });
    if (!hits) throw new Error("Este objeto não referencia as imagens da série exibida.");

    const lut: number[][] = [[0, 0, 0, 0]];
    for (const s of object.segments) lut[s.index] = [...s.color, 255];
    for (let i = 0; i < lut.length; i++) lut[i] ??= [0, 0, 0, 0];
    segmentation.addSegmentations([{
      segmentationId: this.segmentationId,
      representation: { type: LABELMAP, data: { imageIds: derived.map((d) => d.imageId) } },
      config: {
        label: object.label,
        segments: Object.fromEntries(object.segments.map((s) => [s.index, { segmentIndex: s.index, label: s.label, locked: true, cachedStats: {}, active: false }])),
      },
    }]);
    segmentation.addSegmentationRepresentations(stack.viewportId, [{ segmentationId: this.segmentationId, type: LABELMAP, config: { colorLUTOrIndex: lut as never } }]);
    this.setOpacity(this.alpha);
  }

  setOpacity(a: number) {
    this.alpha = Math.max(0, Math.min(1, a));
    segmentation.segmentationStyle.setStyle(
      { viewportId: this.stack.viewportId, segmentationId: this.segmentationId, type: LABELMAP },
      { fillAlpha: this.alpha, fillAlphaInactive: this.alpha, renderFill: true, renderFillInactive: true },
    );
  }

  setVisible(segmentIndex: number, visible: boolean) {
    segmentation.config.visibility.setSegmentIndexVisibility(this.stack.viewportId, { segmentationId: this.segmentationId, type: LABELMAP }, segmentIndex, visible);
  }

  setColor(segmentIndex: number, color: RGB) {
    segmentation.config.color.setSegmentIndexColor(this.stack.viewportId, this.segmentationId, segmentIndex, [...color, 255]);
  }

  dispose() {
    try { segmentation.removeSegmentationRepresentations(this.stack.viewportId, { segmentationId: this.segmentationId }); } catch { /* viewport already gone */ }
    segmentation.removeSegmentation(this.segmentationId);
  }
}
