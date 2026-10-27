// Cornerstone tool wiring. Mouse map (RadiAnt-like): left = active tool, wheel = scroll, middle = pan, right = zoom.
import {
  AngleTool, annotation, addTool, ArrowAnnotateTool, CobbAngleTool, Enums as ToolEnums, EllipticalROITool, LabelTool,
  LengthTool, MagnifyTool, PanTool, PlanarFreehandROITool, RectangleROITool, StackScrollTool, ToolGroupManager,
  ReferenceLinesTool, WindowLevelTool, ZoomTool,
} from "@cornerstonejs/tools";
import type { StackView } from "./cornerstone-adapter";

export const TOOLS = {
  windowLevel: WindowLevelTool.toolName,
  zoom: ZoomTool.toolName,
  pan: PanTool.toolName,
  scroll: StackScrollTool.toolName,
  length: LengthTool.toolName,
  angle: AngleTool.toolName,
  cobb: CobbAngleTool.toolName,
  rect: RectangleROITool.toolName,
  ellipse: EllipticalROITool.toolName,
  freehand: PlanarFreehandROITool.toolName,
  arrow: ArrowAnnotateTool.toolName,
  label: LabelTool.toolName,
  magnify: MagnifyTool.toolName,
} as const;
export type ToolId = keyof typeof TOOLS;

const ANNOTATION_TOOLS: ToolId[] = ["length", "angle", "cobb", "rect", "ellipse", "freehand", "arrow", "label"];
const CLASSES = [WindowLevelTool, ZoomTool, PanTool, StackScrollTool, LengthTool, AngleTool, CobbAngleTool, RectangleROITool, EllipticalROITool, PlanarFreehandROITool, ArrowAnnotateTool, LabelTool, MagnifyTool];

let registered = false;
function registerTools() {
  if (registered) return;
  CLASSES.forEach((c) => addTool(c));
  addTool(ReferenceLinesTool);
  registered = true;
}

export type AskText = (initial: string) => Promise<string | null>;

export class ToolSession {
  private group: NonNullable<ReturnType<typeof ToolGroupManager.createToolGroup>>;
  private active: ToolId = "windowLevel";

  /** `askText` replaces the browser's prompt() for arrow/label annotations. */
  constructor(askText: AskText) {
    registerTools();
    const g = ToolGroupManager.createToolGroup(`view-${crypto.randomUUID()}`);
    if (!g) throw new Error("Não foi possível criar o grupo de ferramentas.");
    this.group = g;
    const text = {
      // new annotation: empty text makes Cornerstone discard it; editing: cancelling keeps the old text
      getTextCallback: (done: (t: string) => void) => { void askText("").then((t) => done(t ?? "")); },
      changeTextCallback: (data: { data?: { label?: string; text?: string } }, _e: unknown, done: (t: string) => void) => {
        void askText(data?.data?.label ?? data?.data?.text ?? "").then((t) => t && done(t));
      },
    };
    for (const c of CLASSES) {
      const isText = c === ArrowAnnotateTool || c === LabelTool;
      // the 2nd argument IS the tool configuration (not wrapped in { configuration }): a wrapper silently keeps the default window.prompt()
      g.addTool(c.toolName, isText ? text : undefined);
    }
    g.setToolActive(TOOLS.scroll, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }] });
    g.setToolActive(TOOLS.pan, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }] });
    g.setToolActive(TOOLS.zoom, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }] });
    this.setActive("windowLevel");
  }

  private refLines = false;
  /** Lines where the `source` viewport's plane cuts the other viewports (same frame of reference only). */
  setReferenceLines(on: boolean, source?: StackView) {
    const name = ReferenceLinesTool.toolName;
    if (!on || !source) {
      if (this.refLines) this.group.setToolDisabled(name);
      this.refLines = false;
      return;
    }
    if (!this.group.hasTool?.(name)) this.group.addTool(name, { sourceViewportId: source.viewportId });
    else this.group.setToolConfiguration(name, { sourceViewportId: source.viewportId });
    this.group.setToolEnabled(name);
    this.refLines = true;
  }

  addView(v: StackView) {
    this.group.addViewport(v.viewportId, v.engineId);
  }

  removeView(v: StackView) {
    this.group.removeViewports(v.engineId, v.viewportId);
  }

  setActive(id: ToolId) {
    const primary = { bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }] };
    // the previous primary tool must go passive/disabled so only one owns the left button
    const prev = TOOLS[this.active];
    if (this.active !== id) {
      if (ANNOTATION_TOOLS.includes(this.active)) this.group.setToolPassive(prev);
      else if (this.active === "windowLevel" || this.active === "magnify") this.group.setToolDisabled(prev);
      else if (this.active === "zoom" || this.active === "pan") this.group.setToolActive(prev, { bindings: [{ mouseButton: this.active === "pan" ? ToolEnums.MouseBindings.Auxiliary : ToolEnums.MouseBindings.Secondary }] });
    }
    if (id === "scroll") {
      this.group.setToolActive(TOOLS.scroll, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }, { mouseButton: ToolEnums.MouseBindings.Wheel }] });
    } else {
      if (this.active === "scroll") this.group.setToolActive(TOOLS.scroll, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }] });
      this.group.setToolActive(TOOLS[id], primary);
    }
    this.active = id;
  }

  dispose() {
    ToolGroupManager.destroyToolGroup(this.group.id);
  }
}

export { annotation, ToolEnums };
