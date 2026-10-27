// MPR / slab / 3D over one cached volume. Uses its OWN RenderingEngine ("mpr-engine"): the stack viewer's engine is
// destroyed while this screen is open, and several live engines break vtk's shared GL state.
import { cache, Enums, getRenderingEngine, RenderingEngine, setVolumesForViewports, volumeLoader, type Types } from "@cornerstonejs/core";
import {
  addTool, CrosshairsTool, Enums as ToolEnums, PanTool, StackScrollTool, ToolGroupManager, TrackballRotateTool, WindowLevelTool, ZoomTool,
} from "@cornerstonejs/tools";
import { getSeriesFrames } from "@view/dicom-client";
import { initRender, loadSeries } from "./cornerstone-adapter";
import { orientation, type Orient } from "./orientation";
import { fromWindow, toWindow } from "./presets";
import { validateVolumeSeries, type VolumeGeometry, type VolumeLimits } from "./volume-validate";

export { validateVolumeSeries, DEFAULT_LIMITS } from "./volume-validate";
export type { VolumeCheck, VolumeGeometry, VolumeLimits, VolumeFrame } from "./volume-validate";

export type PlaneId = "axial" | "coronal" | "sagittal";
export type SlabMode = "none" | "mip" | "minip" | "avg";
export type MprTool = "crosshairs" | "windowLevel" | "zoom" | "pan";
export type Cam3d = "anterior" | "posterior" | "left" | "right" | "superior" | "inferior";

/** Volume-rendering presets, mapped to the library's transfer functions. */
export const VR_PRESETS = [
  { id: "CT-Bones", label: "Osso" },
  { id: "CT-Soft-Tissue", label: "Tecido mole" },
  { id: "CT-Lung", label: "Pulmão" },
  { id: "CT-Chest-Vessels", label: "Angio" },
  { id: "CT-MIP", label: "MIP" },
  { id: "CT-Fat", label: "Gordura" },
  { id: "CT-Muscle", label: "Músculo" },
] as const;

const PLANES: PlaneId[] = ["axial", "coronal", "sagittal"];
const ORIENT = { axial: Enums.OrientationAxis.AXIAL, coronal: Enums.OrientationAxis.CORONAL, sagittal: Enums.OrientationAxis.SAGITTAL };
const BLEND = { none: Enums.BlendModes.COMPOSITE, mip: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND, minip: Enums.BlendModes.MINIMUM_INTENSITY_BLEND, avg: Enums.BlendModes.AVERAGE_INTENSITY_BLEND };
const LINE_COLOR: Record<string, string> = { axial: "rgb(255,90,90)", coronal: "rgb(80,220,120)", sagittal: "rgb(255,210,70)" };
// LPS camera for each anatomical snapshot: the normal points from the patient toward the camera
const CAMS: Record<Cam3d, { n: Types.Point3; up: Types.Point3 }> = {
  anterior: { n: [0, -1, 0], up: [0, 0, 1] }, posterior: { n: [0, 1, 0], up: [0, 0, 1] },
  left: { n: [1, 0, 0], up: [0, 0, 1] }, right: { n: [-1, 0, 0], up: [0, 0, 1] },
  superior: { n: [0, 0, 1], up: [0, -1, 0] }, inferior: { n: [0, 0, -1], up: [0, 1, 0] },
};

export interface PlaneState { orient: Orient | null; slice: number; slices: number }
export interface MprState {
  planes: Record<PlaneId, PlaneState>;
  ww: number | null;
  wc: number | null;
}
export interface VolumeInfo extends VolumeGeometry { loadMs: number }
export interface MprElements { axial: HTMLDivElement; coronal: HTMLDivElement; sagittal: HTMLDivElement; vr: HTMLDivElement }

let toolsRegistered = false;
function registerTools() {
  if (toolsRegistered) return;
  [CrosshairsTool, WindowLevelTool, ZoomTool, PanTool, StackScrollTool, TrackballRotateTool].forEach((c) => addTool(c));
  toolsRegistered = true;
}

const M = ToolEnums.MouseBindings;

/** Fetches series metadata, validates the geometry and throws a Portuguese reason when a volume cannot be built. */
export async function checkSeries(base: string, studyUid: string, seriesUid: string, limits?: Partial<VolumeLimits>): Promise<VolumeGeometry> {
  const frames = await getSeriesFrames(base, studyUid, seriesUid);
  const r = validateVolumeSeries(frames, limits);
  if (!r.ok) throw new Error(r.reason);
  return r.geometry;
}

type Group = NonNullable<ReturnType<typeof ToolGroupManager.createToolGroup>>;

export class MprSession {
  private static ENGINE = "mpr-engine";
  private engine: RenderingEngine;
  private ids: Record<PlaneId | "vr", string>;
  private group: Group;
  private group3d: Group;
  private volumeId = `cornerstoneStreamingImageVolume:mpr-${crypto.randomUUID()}`;
  private listeners = new Set<(s: MprState) => void>();
  private off: Array<() => void> = [];
  private tool: MprTool = "crosshairs";
  private spinning = 0;
  private syncing = false;
  private cacheBefore = 0;
  private destroyed = false;
  private loaded = false;

  /** `signal` guards React StrictMode's mount/unmount/mount: a stale call must not build a second engine. */
  static async create(el: MprElements, signal?: AbortSignal): Promise<MprSession> {
    await initRender();
    signal?.throwIfAborted();
    return new MprSession(el);
  }

  private constructor(el: MprElements) {
    registerTools();
    const uid = crypto.randomUUID();
    this.ids = { axial: `mpr-axial-${uid}`, coronal: `mpr-coronal-${uid}`, sagittal: `mpr-sagittal-${uid}`, vr: `mpr-vr-${uid}` };
    this.engine = new RenderingEngine(MprSession.ENGINE);
    this.engine.setViewports([
      ...PLANES.map((p) => ({ viewportId: this.ids[p], type: Enums.ViewportType.ORTHOGRAPHIC, element: el[p], defaultOptions: { orientation: ORIENT[p], background: [0, 0, 0] as Types.Point3 } })),
      { viewportId: this.ids.vr, type: Enums.ViewportType.VOLUME_3D, element: el.vr, defaultOptions: { background: [0.02, 0.05, 0.12] as Types.Point3 } },
    ]);

    const g = ToolGroupManager.createToolGroup(`mpr-${uid}`);
    const g3 = ToolGroupManager.createToolGroup(`mpr3d-${uid}`);
    if (!g || !g3) throw new Error("Não foi possível criar o grupo de ferramentas.");
    this.group = g;
    this.group3d = g3;
    PLANES.forEach((p) => g.addViewport(this.ids[p], MprSession.ENGINE));
    g3.addViewport(this.ids.vr, MprSession.ENGINE);
    g.addTool(CrosshairsTool.toolName, { getReferenceLineColor: (id: string) => LINE_COLOR[PLANES.find((p) => this.ids[p] === id) ?? "axial"] });
    [WindowLevelTool, ZoomTool, PanTool, StackScrollTool].forEach((c) => g.addTool(c.toolName));
    g.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: M.Wheel }] });
    g.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: M.Auxiliary }] });
    g.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: M.Secondary }] });
    g.setToolActive(CrosshairsTool.toolName, { bindings: [{ mouseButton: M.Primary }] });
    [TrackballRotateTool, ZoomTool, PanTool].forEach((c) => g3.addTool(c.toolName));
    g3.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: M.Primary }] });
    g3.setToolActive(PanTool.toolName, { bindings: [{ mouseButton: M.Auxiliary }] });
    g3.setToolActive(ZoomTool.toolName, { bindings: [{ mouseButton: M.Secondary }, { mouseButton: M.Wheel }] });

    // keep W/L equal in the three planes; the guard stops the echo of our own setProperties
    for (const p of PLANES) {
      const onVoi = () => {
        if (this.syncing || !this.loaded) return;
        const r = this.vp(p).getProperties()?.voiRange;
        if (r) this.applyVoi(r.lower, r.upper, p);
        this.emit();
      };
      const onCam = () => this.emit();
      el[p].addEventListener(Enums.Events.VOI_MODIFIED, onVoi);
      el[p].addEventListener(Enums.Events.CAMERA_MODIFIED, onCam);
      this.off.push(() => { el[p].removeEventListener(Enums.Events.VOI_MODIFIED, onVoi); el[p].removeEventListener(Enums.Events.CAMERA_MODIFIED, onCam); });
    }

    // Cornerstone does not watch element size (see StackView): resize on the next frame, keeping zoom/pan
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (this.destroyed) return;
        this.engine.resize(true, true);
        this.engine.render();
      });
    });
    Object.values(el).forEach((e) => ro.observe(e));
    this.off.push(() => { cancelAnimationFrame(frame); ro.disconnect(); });
  }

  private vp(id: PlaneId | "vr") { return this.engine.getViewport(this.ids[id]) as Types.IVolumeViewport; }

  subscribe(fn: (s: MprState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  state(): MprState {
    const planes = {} as Record<PlaneId, PlaneState>;
    for (const p of PLANES) {
      let o: Orient | null = null;
      let slice = 0;
      let slices = 0;
      try {
        const v = this.vp(p);
        const c = v.getCamera();
        const up = c.viewUp!, n = c.viewPlaneNormal!;
        const right: [number, number, number] = [up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]];
        o = orientation(right, [-up[0], -up[1], -up[2]]);
        if (this.loaded) {
          const info = v as unknown as { getSliceIndex?: () => number; getNumberOfSlices?: () => number };
          slice = info.getSliceIndex?.() ?? 0;
          slices = info.getNumberOfSlices?.() ?? 0;
        }
      } catch { /* viewport not ready yet */ }
      planes[p] = { orient: o, slice, slices };
    }
    let ww: number | null = null;
    let wc: number | null = null;
    const r = this.loaded ? this.vp("axial").getProperties()?.voiRange : undefined;
    if (r) ({ ww, wc } = toWindow(r.lower, r.upper));
    return { planes, ww, wc };
  }

  private emit() {
    if (this.destroyed) return;
    const s = this.state();
    this.listeners.forEach((l) => l(s));
  }

  /** Builds the volume; `onProgress` gets 0..1. Throws a Portuguese message when the geometry is not a valid volume. */
  async load(base: string, studyUid: string, seriesUid: string, onProgress: (f: number) => void, limits?: Partial<VolumeLimits>): Promise<VolumeInfo> {
    const t0 = performance.now();
    const imageIds = await loadSeries(base, studyUid, seriesUid);
    const geometry = await checkSeries(base, studyUid, seriesUid, limits);
    if (this.destroyed) throw new Error("cancelado");
    // the shared decoded-image cache is capped at 1 GB; the volume must fit with headroom or it is evicted mid-load
    this.cacheBefore = cache.getMaxCacheSize();
    cache.setMaxCacheSize(Math.max(this.cacheBefore, geometry.estimatedBytes * 2));
    const volume = await volumeLoader.createAndCacheVolume(this.volumeId, { imageIds });
    await new Promise<void>((resolve, reject) => {
      type Evt = { framesProcessed: number; totalNumFrames: number; success?: boolean };
      (volume as unknown as { load: (cb: (e: Evt) => void) => void }).load((e) => {
        onProgress(Math.min(1, e.framesProcessed / e.totalNumFrames));
        if (e.success === false) reject(new Error("Falha ao baixar um dos cortes do volume."));
        else if (e.framesProcessed >= e.totalNumFrames) resolve();
      });
    });
    if (this.destroyed) throw new Error("cancelado");
    await setVolumesForViewports(this.engine, [{ volumeId: this.volumeId }], [this.ids.axial, this.ids.coronal, this.ids.sagittal, this.ids.vr]);
    this.loaded = true;
    this.vp("vr").setProperties({ preset: "CT-Bones" } as never);
    this.setTool(this.tool);
    this.engine.render();
    this.emit();
    return { ...geometry, loadMs: Math.round(performance.now() - t0) };
  }

  private applyVoi(lower: number, upper: number, except?: PlaneId) {
    this.syncing = true;
    try {
      const rest = PLANES.filter((p) => p !== except);
      for (const p of rest) this.vp(p).setProperties({ voiRange: { lower, upper } });
      this.engine.renderViewports(rest.map((p) => this.ids[p]));
    } finally { this.syncing = false; }
  }

  setWindow(ww: number, wc: number) {
    const r = fromWindow(ww, wc);
    this.applyVoi(r.lower, r.upper);
    this.emit();
  }

  /** Left-button tool: reference lines (crosshairs) or one of the image tools. */
  setTool(t: MprTool) {
    const names = { crosshairs: CrosshairsTool.toolName, windowLevel: WindowLevelTool.toolName, zoom: ZoomTool.toolName, pan: PanTool.toolName };
    const g = this.group;
    // zoom/pan keep their secondary/auxiliary bindings when not primary
    const keep: Partial<Record<MprTool, number>> = { zoom: M.Secondary, pan: M.Auxiliary };
    const prev = this.tool;
    if (prev !== t) {
      if (prev === "crosshairs") g.setToolPassive(names.crosshairs);
      else if (prev === "windowLevel") g.setToolDisabled(names.windowLevel);
      else g.setToolActive(names[prev], { bindings: [{ mouseButton: keep[prev]! }] });
    }
    g.setToolActive(names[t], { bindings: [{ mouseButton: M.Primary }, ...(keep[t] ? [{ mouseButton: keep[t]! }] : [])] });
    this.tool = t;
  }

  /** MIP / MinIP / average projection through `thicknessMm` around the crosshair; "none" restores the plain slice. */
  setSlab(mode: SlabMode, thicknessMm: number) {
    for (const p of PLANES) {
      const v = this.vp(p);
      v.setBlendMode(BLEND[mode]);
      if (mode === "none") v.resetSlabThickness(); else v.setSlabThickness(Math.max(0.1, thicknessMm));
    }
    this.engine.renderViewports(PLANES.map((p) => this.ids[p]));
    this.emit();
  }

  /** Back to the three default orthogonal planes with the crosshair at the volume center. */
  resetPlanes() {
    for (const p of PLANES) {
      this.vp(p).resetCamera();
      this.vp(p).resetProperties();
    }
    (this.group.getToolInstance(CrosshairsTool.toolName) as unknown as { resetCrosshairs?: () => void } | undefined)?.resetCrosshairs?.();
    this.engine.renderViewports(PLANES.map((p) => this.ids[p]));
    this.emit();
  }

  setVrPreset(id: string) {
    const v = this.vp("vr");
    v.setProperties({ preset: id } as never);
    v.render();
  }

  setCamera3d(c: Cam3d) {
    const v = this.vp("vr");
    v.setCamera({ viewPlaneNormal: CAMS[c].n, viewUp: CAMS[c].up });
    v.resetCamera();
    v.render();
  }

  getCamera3d(): Types.ICamera { return structuredClone(this.vp("vr").getCamera()); }
  restoreCamera3d(c: Types.ICamera) { const v = this.vp("vr"); v.setCamera(c); v.render(); }
  resetCamera3d() { const v = this.vp("vr"); v.resetCamera(); v.render(); }

  /** Turntable cine around the vertical axis, degrees per second (0 stops). */
  spin(degPerSec: number) {
    cancelAnimationFrame(this.spinning);
    this.spinning = 0;
    if (!degPerSec) return;
    let last = performance.now();
    const tick = (now: number) => {
      if (this.destroyed) return;
      const v = this.vp("vr");
      const cam = (v as unknown as { getVtkActiveCamera: () => { azimuth: (d: number) => void; orthogonalizeViewUp: () => void } }).getVtkActiveCamera();
      cam.azimuth((degPerSec * (now - last)) / 1000);
      cam.orthogonalizeViewUp();
      last = now;
      v.setCamera(v.getCamera()); // pushes the vtk camera into Cornerstone (clipping range, events) and renders
      this.spinning = requestAnimationFrame(tick);
    };
    this.spinning = requestAnimationFrame(tick);
  }

  render() { this.engine.render(); }

  /** Releases viewports, tool groups, listeners, textures and the volume. Safe to call twice. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.spin(0);
    this.off.forEach((f) => f());
    this.listeners.clear();
    const vol = cache.getVolume(this.volumeId) as { cancelLoading?: () => void } | undefined;
    vol?.cancelLoading?.();
    // destroying the group alone leaves CrosshairsTool's new-volume listeners on the elements
    this.group.setToolDisabled(CrosshairsTool.toolName);
    ToolGroupManager.destroyToolGroup(this.group.id);
    ToolGroupManager.destroyToolGroup(this.group3d.id);
    getRenderingEngine(MprSession.ENGINE)?.destroy();
    if (cache.getVolumeLoadObject(this.volumeId)) cache.removeVolumeLoadObject(this.volumeId);
    cache.purgeCache();
    if (this.cacheBefore) cache.setMaxCacheSize(this.cacheBefore);
  }
}
