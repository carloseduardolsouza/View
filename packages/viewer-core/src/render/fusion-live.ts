// PET/CT fusion in one axial volume viewport. Own RenderingEngine ("fusion-engine"): like MprSession, the stack
// viewer's engine must be gone while this is open (several live engines break vtk's shared GL state).
import { cache, Enums, getRenderingEngine, RenderingEngine, volumeLoader, type Types } from "@cornerstonejs/core";
import { addTool, StackScrollTool, ToolGroupManager, Enums as ToolEnums } from "@cornerstonejs/tools";
import { getSeriesFrames } from "@view/dicom-client";
import { checkRegistration, geometryFromInstance } from "./fusion";
import { initRender, loadSeries } from "./cornerstone-adapter";
import { validateVolumeSeries } from "./volume-validate";

const ENGINE = "fusion-engine";
/** vtk.js preset names; Cornerstone resolves them by name. shortcut: unverified in a browser here. */
export const PET_COLORMAPS = [
  { id: "Black-Body Radiation", label: "Corpo negro" },
  { id: "Inferno (matplotlib)", label: "Inferno" },
  { id: "jet", label: "Jet" },
  { id: "hsv", label: "HSV" },
] as const;

let toolsRegistered = false;

export class FusionSession {
  private engine: RenderingEngine;
  private viewportId = `fusion-${crypto.randomUUID()}`;
  private groupId = `fusion-g-${crypto.randomUUID()}`;
  private ids = { ct: `cornerstoneStreamingImageVolume:fct-${crypto.randomUUID()}`, pt: `cornerstoneStreamingImageVolume:fpt-${crypto.randomUUID()}` };
  private colormap: string = PET_COLORMAPS[0].id;
  private opacity = 0.5;
  private cacheBefore = 0;
  private destroyed = false;
  private loaded = false;
  private ro: ResizeObserver;

  static async create(el: HTMLDivElement, signal?: AbortSignal): Promise<FusionSession> {
    await initRender();
    signal?.throwIfAborted();
    return new FusionSession(el);
  }

  private constructor(el: HTMLDivElement) {
    if (!toolsRegistered) { addTool(StackScrollTool); toolsRegistered = true; }
    this.engine = new RenderingEngine(ENGINE);
    this.engine.enableElement({ viewportId: this.viewportId, type: Enums.ViewportType.ORTHOGRAPHIC, element: el, defaultOptions: { orientation: Enums.OrientationAxis.AXIAL, background: [0, 0, 0] as Types.Point3 } });
    const g = ToolGroupManager.createToolGroup(this.groupId);
    g?.addViewport(this.viewportId, ENGINE);
    g?.addTool(StackScrollTool.toolName);
    g?.setToolActive(StackScrollTool.toolName, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }] });
    this.ro = new ResizeObserver(() => { if (!this.destroyed && el.clientWidth > 0) { this.engine.resize(true, true); this.engine.render(); } });
    this.ro.observe(el);
  }

  private get vp() { return this.engine.getViewport(this.viewportId) as Types.IVolumeViewport; }

  /** Validates the registration BEFORE downloading pixels; throws the Portuguese refusal. Returns non-fatal warnings. */
  async load(base: string, studyUid: string, ctSeriesUid: string, ptSeriesUid: string, onProgress: (f: number) => void): Promise<string[]> {
    const [ctFrames, ptFrames] = await Promise.all([getSeriesFrames(base, studyUid, ctSeriesUid), getSeriesFrames(base, studyUid, ptSeriesUid)]);
    const check = checkRegistration(geometryFromInstance(ctFrames[0]?.instance ?? {}), geometryFromInstance(ptFrames[0]?.instance ?? {}));
    if (!check.ok) throw new Error(check.reason);
    for (const f of [ctFrames, ptFrames]) {
      const v = validateVolumeSeries(f);
      if (!v.ok) throw new Error(v.reason);
    }
    const [ctIds, ptIds] = [await loadSeries(base, studyUid, ctSeriesUid), await loadSeries(base, studyUid, ptSeriesUid)];
    this.cacheBefore = cache.getMaxCacheSize();
    cache.setMaxCacheSize(Math.max(this.cacheBefore, 2 * 1024 ** 3));
    const progress = [0, 0];
    const build = async (volumeId: string, imageIds: string[], k: number) => {
      const vol = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
      await new Promise<void>((resolve, reject) => {
        type Evt = { framesProcessed: number; totalNumFrames: number; success?: boolean };
        (vol as unknown as { load: (cb: (e: Evt) => void) => void }).load((e) => {
          progress[k] = Math.min(1, e.framesProcessed / e.totalNumFrames);
          onProgress((progress[0]! + progress[1]!) / 2);
          if (e.success === false) reject(new Error("Falha ao baixar um dos cortes."));
          else if (e.framesProcessed >= e.totalNumFrames) resolve();
        });
      });
    };
    await Promise.all([build(this.ids.ct, ctIds, 0), build(this.ids.pt, ptIds, 1)]);
    if (this.destroyed) throw new Error("cancelado");
    await this.vp.setVolumes([{ volumeId: this.ids.ct }, { volumeId: this.ids.pt }]);
    this.loaded = true;
    this.applyPet();
    return check.warnings;
  }

  private applyPet() {
    if (!this.loaded) return;
    this.vp.setProperties({ colormap: { name: this.colormap, opacity: this.opacity } }, this.ids.pt);
    this.vp.render();
  }
  setOpacity(a: number) { this.opacity = Math.max(0, Math.min(1, a)); this.applyPet(); }
  setColormap(name: string) { this.colormap = name; this.applyPet(); }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ro.disconnect();
    ToolGroupManager.destroyToolGroup(this.groupId);
    getRenderingEngine(ENGINE)?.destroy();
    for (const id of Object.values(this.ids)) {
      (cache.getVolume(id) as { cancelLoading?: () => void } | undefined)?.cancelLoading?.();
      if (cache.getVolumeLoadObject(id)) cache.removeVolumeLoadObject(id);
    }
    cache.purgeCache();
    if (this.cacheBefore) cache.setMaxCacheSize(this.cacheBefore);
  }
}
