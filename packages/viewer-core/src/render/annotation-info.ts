// Pure formatting of Cornerstone annotations for the measurement list (no Cornerstone import: easy to test).
type Stats = Record<string, unknown>;
export interface AnnotationLike {
  annotationUID?: string;
  metadata?: { toolName?: string; referencedImageId?: string };
  data?: { label?: string; text?: string; cachedStats?: unknown };
}

export interface Described { title: string; value: string; calibrated: boolean }

const TITLES: Record<string, string> = {
  Length: "Comprimento", Angle: "Ângulo", CobbAngle: "Ângulo de Cobb", RectangleROI: "Retângulo",
  EllipticalROI: "Elipse", PlanarFreehandROI: "Mão livre", ArrowAnnotate: "Seta", Label: "Texto",
};
export const toolTitle = (tool: string) => TITLES[tool] ?? tool;

const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d).replace(".", ",") : "—");
const num = (v: unknown): number | null => (typeof v === "number" ? v : Array.isArray(v) && typeof v[0] === "number" ? v[0] : null);

/** True once Cornerstone has computed measurements (it does so after the "completed" event for some tools). */
export const hasStats = (a: AnnotationLike) => {
  const st = Object.values((a.data?.cachedStats ?? {}) as Record<string, Stats>)[0];
  return !!st && Object.keys(st).some((k) => k !== "Modality");
};

export function describeAnnotation(a: AnnotationLike): Described {
  const tool = a.metadata?.toolName ?? "";
  const title = toolTitle(tool);
  const stats = Object.values((a.data?.cachedStats ?? {}) as Record<string, Stats>)[0];
  if (tool === "ArrowAnnotate" || tool === "Label") return { title, value: a.data?.label ?? a.data?.text ?? "—", calibrated: true };
  if (!stats) return { title, value: "—", calibrated: true };

  const unit = typeof stats.unit === "string" ? stats.unit : null;
  // Cornerstone reports "px" when PixelSpacing/ImagerPixelSpacing is missing: never present that as millimetres.
  const calibrated = unit !== "px" && unit !== null;
  const length = num(stats.length);
  const angle = num(stats.angle);
  const area = num(stats.area);

  if (tool === "Length" && length != null) return { title, value: `${fmt(length)} ${unit ?? "px"}`, calibrated };
  if ((tool === "Angle" || tool === "CobbAngle") && angle != null) return { title, value: `${fmt(angle)}°`, calibrated: true };
  if (area != null) {
    const areaUnit = typeof stats.areaUnit === "string" ? stats.areaUnit : unit ? `${unit}²` : "px²";
    const mean = num(stats.mean);
    return { title, value: `${fmt(area)} ${areaUnit}${mean != null ? ` · média ${fmt(mean, 0)}` : ""}`, calibrated: !areaUnit.startsWith("px") };
  }
  return { title, value: "—", calibrated: true };
}
