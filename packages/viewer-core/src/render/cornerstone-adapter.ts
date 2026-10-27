// The only file (with tools.ts) that imports Cornerstone: swap the render engine here without touching the UI.
import { cache, Enums, eventTarget, imageLoader, init as csInit, metaData, RenderingEngine, type Types } from "@cornerstonejs/core";
import dicomImageLoader from "@cornerstonejs/dicom-image-loader";
import { init as toolsInit } from "@cornerstonejs/tools";
import { utilities as metadataUtils } from "@cornerstonejs/metadata";
import { getSeriesFrames, type FrameRef } from "@view/dicom-client";
import { orientation, type Orient } from "./orientation";
import type { SeriesGeometry } from "./sync";
import { fromWindow, toWindow } from "./presets";
import { describeLoadError } from "./load-error";
import { spacingOf, type PixelSpacing } from "./scale";

let ready: Promise<void> | null = null;

const CACHE_BYTES = 1024 * 1024 * 1024; // decoded-image LRU ceiling; Cornerstone evicts least-recently-used beyond it
const PREFETCH_AHEAD = 3;

function assertWebGL2() {
  if (!document.createElement("canvas").getContext("webgl2"))
    throw new Error("Este navegador/GPU não suporta WebGL2, necessário para exibir imagens.");
}

/** Idempotent engine bootstrap. */
export function initRender(): Promise<void> {
  ready ??= (async () => {
    assertWebGL2();
    await csInit();
    toolsInit();
    dicomImageLoader.init();
    cache.setMaxCacheSize(CACHE_BYTES);
  })().catch((e) => {
    ready = null; // allow retry after a failed init
    throw e;
  });
  return ready;
}

// Raw DICOM-JSON per imageId: source of PixelSpacing/ImagerPixelSpacing (read directly so we never guess a default).
const instanceOf = new Map<string, FrameRef["instance"]>();

// Series metadata is needed by both the viewport and its sidebar thumbnail: fetch it once per series.
const framesCache = new Map<string, Promise<FrameRef[]>>();

function seriesFrames(base: string, studyUid: string, seriesUid: string): Promise<FrameRef[]> {
  const key = `${studyUid}/${seriesUid}`;
  let p = framesCache.get(key);
  if (!p) {
    p = getSeriesFrames(base, studyUid, seriesUid).then(async (all) => {
      // drop non-image instances (SR, PR, KO...): no Rows/Columns means nothing to draw
      const frames = all.filter((f) => f.instance["00280010"] && f.instance["00280011"]);
      frames.forEach((f) => instanceOf.set(f.imageId, f.instance));
      await Promise.all(frames.map((f) => metadataUtils.addDicomWebInstance(f.imageId, f.instance as Record<string, unknown>)));
      return frames;
    });
    p.catch(() => framesCache.delete(key)); // do not cache failures
    framesCache.set(key, p);
  }
  return p;
}

export const clearSeriesCache = () => framesCache.clear();

/** Registers metadata for the series and returns its ordered imageIds. */
export async function loadSeries(base: string, studyUid: string, seriesUid: string, signal?: AbortSignal): Promise<string[]> {
  await initRender();
  const frames = await seriesFrames(base, studyUid, seriesUid);
  signal?.throwIfAborted();
  if (frames.length === 0) throw new Error("A série não contém imagens exibíveis (pode ser relatório, apresentação ou outro objeto não-imagem).");
  return frames.map((f) => f.imageId);
}

/** Grayscale thumbnail pixels: window = 1st..99th percentile, so it works whatever window the DICOM carries. */
export function windowToBytes(values: ArrayLike<number>, invert: boolean): Uint8ClampedArray {
  const n = values.length;
  const step = Math.max(1, Math.floor(n / 4096));
  const sample: number[] = [];
  for (let i = 0; i < n; i += step) sample.push(values[i]!);
  sample.sort((x, y) => x - y);
  const lo = sample[Math.floor(sample.length * 0.01)] ?? 0;
  let hi = sample[Math.floor(sample.length * 0.99)] ?? lo + 1;
  if (hi <= lo) hi = lo + 1;
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const g = ((values[i]! - lo) / (hi - lo)) * 255;
    out[i] = invert ? 255 - g : g;
  }
  return out;
}

/** Paints the middle image of a series into `canvas` (sidebar preview). Rejects for non-image series. */
export async function renderThumbnail(base: string, studyUid: string, seriesUid: string, canvas: HTMLCanvasElement): Promise<void> {
  await initRender();
  const frames = await seriesFrames(base, studyUid, seriesUid);
  const f = frames[Math.floor(frames.length / 2)];
  if (!f) throw new Error("Série sem imagens.");
  const img = await imageLoader.loadAndCacheImage(f.imageId);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  const { width: W, height: H } = canvas;
  const scale = Math.min(W / img.columns, H / img.rows);
  const dw = Math.max(1, Math.round(img.columns * scale));
  const dh = Math.max(1, Math.round(img.rows * scale));
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (img.color) {
    ctx.drawImage(img.getCanvas(), (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }
  const px = img.getPixelData();
  const scaled = !!img.preScale?.scaled; // already in modality units (e.g. HU)
  const slope = scaled ? 1 : img.slope ?? 1;
  const intercept = scaled ? 0 : img.intercept ?? 0;
  const values = new Float32Array(px.length);
  for (let i = 0; i < px.length; i++) values[i] = px[i]! * slope + intercept;
  const bytes = windowToBytes(values, !!img.invert);
  const out = ctx.createImageData(dw, dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(img.rows - 1, Math.floor(y / scale));
    for (let x = 0; x < dw; x++) {
      const g = bytes[sy * img.columns + Math.min(img.columns - 1, Math.floor(x / scale))]!;
      const o = (y * dw + x) * 4;
      out.data[o] = out.data[o + 1] = out.data[o + 2] = g;
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, Math.round((W - dw) / 2), Math.round((H - dh) / 2));
}

export interface ViewState {
  index: number;
  count: number;
  /** window width/center; null until the first image is rendered */
  ww: number | null;
  wc: number | null;
  zoom: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  invert: boolean;
  orient: Orient | null;
  /** canvas-pixel pan, for synchronisation */
  pan: [number, number];
  imageId: string | null;
  /** mm per pixel of the current image; null = uncalibrated (never show mm). kind "proj" = ImagerPixelSpacing (detector plane) */
  spacing: PixelSpacing | null;
  /** on-screen pixels per mm along rows (for the scale bar); null when spacing is null or the viewport has no size */
  pxPerMm: number | null;
}

const EMPTY: ViewState = { index: 0, count: 0, ww: null, wc: null, zoom: 1, rotation: 0, flipH: false, flipV: false, invert: false, orient: null, pan: [0, 0], imageId: null, spacing: null, pxPerMm: null };

// One RenderingEngine for every viewport (what Cornerstone expects): one engine per cell breaks vtk's shared GL state
// and leaves some viewports blank. Reference-counted so it is released when the last viewport goes away.
const ENGINE_ID = "view-engine";
let sharedEngine: RenderingEngine | null = null;
let engineRefs = 0;

function acquireEngine(): RenderingEngine {
  sharedEngine ??= new RenderingEngine(ENGINE_ID);
  engineRefs++;
  return sharedEngine;
}

function releaseEngine() {
  if (--engineRefs > 0) return;
  engineRefs = 0;
  sharedEngine?.destroy();
  sharedEngine = null;
  cache.purgeCache(); // last viewport closed: free decoded images
}

export class StackView {
  private engine: RenderingEngine;
  private viewport!: Types.IStackViewport;
  readonly viewportId = `vp-${crypto.randomUUID()}`;
  readonly engineId = ENGINE_ID;
  private listeners = new Set<(s: ViewState) => void>();
  private off: Array<() => void> = [];
  // own counter: the viewport's index lags behind while a slice is still loading
  private idx = 0;
  private lastDir = 1;
  private ids: string[] = [];

  /** Use instead of `new`: Cornerstone must be initialised before a RenderingEngine exists. */
  static async create(element: HTMLDivElement): Promise<StackView> {
    await initRender();
    return new StackView(element);
  }

  private constructor(private element: HTMLDivElement) {
    this.engine = acquireEngine();
    this.engine.enableElement({ viewportId: this.viewportId, type: Enums.ViewportType.STACK, element });
    this.viewport = this.engine.getViewport(this.viewportId) as Types.IStackViewport;

    const onImage = (e: Event) => {
      const d = (e as CustomEvent<{ imageIdIndex?: number }>).detail;
      if (typeof d?.imageIdIndex === "number") { this.idx = d.imageIdIndex; this.prefetch(); }
      this.emit();
    };
    const onView = () => this.emit();
    const evs: Array<[string, (e: Event) => void]> = [
      [Enums.Events.STACK_NEW_IMAGE, onImage],
      [Enums.Events.VOI_MODIFIED, onView],
      [Enums.Events.CAMERA_MODIFIED, onView],
    ];
    for (const [n, f] of evs) {
      element.addEventListener(n, f);
      this.off.push(() => element.removeEventListener(n, f));
    }

    // Cornerstone does not watch the element size: without this the canvas is stretched by CSS while its drawing
    // buffer keeps the old size, which deforms the image. Resize on the next frame and keep zoom/pan so it stays proportional.
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (element.clientWidth > 0 && element.clientHeight > 0) {
          this.engine.resize(true, true);
          this.engine.render(); // resizing clears the canvases of every viewport
        }
      });
    });
    ro.observe(element);
    this.off.push(() => { cancelAnimationFrame(frame); ro.disconnect(); });
  }

  subscribe(fn: (s: ViewState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  state(): ViewState {
    if (!this.ids.length) return EMPTY;
    const imageId = this.ids[this.idx] ?? null;
    const props = this.viewport.getProperties();
    const cam = this.viewport.getCamera();
    const voi = props.voiRange ? toWindow(props.voiRange.lower, props.voiRange.upper) : null;
    const plane = imageId ? (metaData.get("imagePlaneModule", imageId) as { rowCosines?: number[]; columnCosines?: number[] } | undefined) : undefined;
    const rotation = this.viewport.getRotation?.() ?? 0;
    const pan = this.viewport.getPan?.() ?? [0, 0];
    const flipH = !!cam.flipHorizontal;
    const flipV = !!cam.flipVertical;
    const orient = plane?.rowCosines?.length === 3 && plane.columnCosines?.length === 3
      ? orientation(plane.rowCosines as [number, number, number], plane.columnCosines as [number, number, number], rotation, flipH, flipV)
      : null;
    const spacing = imageId ? spacingOf(instanceOf.get(imageId)) : null;
    return {
      index: this.idx, count: this.ids.length, ww: voi?.ww ?? null, wc: voi?.wc ?? null,
      zoom: this.viewport.getZoom?.() ?? 1, rotation, flipH, flipV, invert: !!props.invert, orient, pan: [pan[0] ?? 0, pan[1] ?? 0], imageId,
      spacing, pxPerMm: spacing ? this.pxPerMm(cam, spacing) : null,
    };
  }

  // Screen px per world unit = height / (2 * parallelScale); a row is imageData.spacing[1] world units, spacing.row mm.
  private pxPerMm(cam: { parallelScale?: number }, sp: PixelSpacing): number | null {
    const world = this.viewport.getImageData?.()?.spacing?.[1];
    const h = this.element.clientHeight;
    if (!cam.parallelScale || !world || !h) return null;
    return ((h / (2 * cam.parallelScale)) * world) / sp.row;
  }

  /** Subscribes to image decode/download failures of this stack, already worded in Portuguese. */
  onLoadError(fn: (message: string, imageId: string) => void): () => void {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ imageId?: string; error?: unknown }>).detail;
      if (d?.imageId && this.ids.includes(d.imageId)) fn(describeLoadError(d.error), d.imageId);
    };
    eventTarget.addEventListener(Enums.Events.IMAGE_LOAD_FAILED, h);
    return () => eventTarget.removeEventListener(Enums.Events.IMAGE_LOAD_FAILED, h);
  }

  private emit() {
    const s = this.state();
    this.listeners.forEach((l) => l(s));
  }

  async show(imageIds: string[]) {
    this.ids = imageIds;
    try {
      await this.viewport.setStack(imageIds, 0);
    } catch (e) {
      this.ids = [];
      throw new Error(describeLoadError(e));
    }
    this.idx = 0;
    this.viewport.render();
    this.prefetch();
    this.emit();
  }

  get index() { return this.idx; }
  get count() { return this.ids.length; }
  get imageIds() { return this.ids; }
  get currentElement() { return this.element; }

  /** Jumps to a slice (clamped) and returns the index actually shown. */
  goTo(i: number): number {
    const n = Math.max(0, Math.min(this.count - 1, Math.round(i)));
    if (n !== this.idx) {
      this.lastDir = n > this.idx ? 1 : -1;
      this.idx = n;
      void this.viewport.setImageIdIndex(n);
      this.prefetch();
      this.emit();
    }
    return n;
  }

  scrollBy(delta: number): number {
    return this.goTo(this.idx + delta);
  }

  /** Warm the cache a few slices ahead in the scroll direction (bounded; Cornerstone's LRU caps memory). */
  private prefetch() {
    for (let k = 1; k <= PREFETCH_AHEAD; k++) {
      const id = this.ids[this.idx + k * this.lastDir];
      if (id) void imageLoader.loadAndCacheImage(id).catch(() => {});
    }
  }

  setWindow(ww: number, wc: number) {
    this.viewport.setProperties({ voiRange: fromWindow(ww, wc) });
    this.viewport.render();
    this.emit();
  }

  toggleInvert() {
    this.viewport.setProperties({ invert: !this.viewport.getProperties().invert });
    this.viewport.render();
    this.emit();
  }

  rotate(deltaDeg: number) {
    const p = this.viewport.getViewPresentation();
    this.viewport.setViewPresentation({ ...p, rotation: (((p.rotation ?? 0) + deltaDeg) % 360 + 360) % 360 });
    this.viewport.render();
    this.emit();
  }

  flip(axis: "h" | "v") {
    const c = this.viewport.getCamera();
    this.viewport.setCamera(axis === "h" ? { flipHorizontal: !c.flipHorizontal } : { flipVertical: !c.flipVertical });
    this.viewport.render();
    this.emit();
  }

  /** Back to the default window, zoom, pan, rotation and flips. */
  reset() {
    this.viewport.resetProperties();
    this.viewport.resetCamera();
    const c = this.viewport.getCamera();
    if (c.flipHorizontal || c.flipVertical) this.viewport.setCamera({ flipHorizontal: false, flipVertical: false });
    this.viewport.setViewPresentation({ ...this.viewport.getViewPresentation(), rotation: 0 });
    this.viewport.render();
    this.emit();
  }

  setZoomPan(zoom: number, pan: [number, number]) {
    this.viewport.setZoom(zoom);
    this.viewport.setPan(pan);
    this.viewport.render();
    this.emit();
  }

  private geom: { ids: string[]; g: SeriesGeometry | null } | null = null;
  /** Patient-space geometry of the shown series (cached per stack); null when the metadata lacks orientation. */
  geometry(): SeriesGeometry | null {
    if (this.geom?.ids === this.ids) return this.geom.g;
    type Plane = { rowCosines?: number[]; columnCosines?: number[]; imagePositionPatient?: number[]; frameOfReferenceUID?: string };
    const planes = this.ids.map((id) => metaData.get("imagePlaneModule", id) as Plane | undefined);
    const p0 = planes[0];
    const v3 = (a?: number[]) => (a?.length === 3 && a.every(Number.isFinite) ? ([a[0]!, a[1]!, a[2]!] as [number, number, number]) : null);
    const row = v3(p0?.rowCosines), col = v3(p0?.columnCosines);
    const g = row && col ? { frameOfReference: p0?.frameOfReferenceUID || null, row, col, positions: planes.map((p) => v3(p?.imagePositionPatient)) } : null;
    this.geom = { ids: this.ids, g };
    return g;
  }

  /** Fit to the viewport without touching window/level. */
  fit() {
    this.viewport.resetCamera();
    this.viewport.render();
    this.emit();
  }

  render() { this.viewport.render(); }

  /** Releases GL resources and decoded images so the next study starts clean. */
  destroy() {
    this.off.forEach((f) => f());
    this.listeners.clear();
    this.engine.disableElement(this.viewportId);
    releaseEngine();
  }
}
