import { getJson } from "./http.js";

export type DicomJson = Record<string, { Value?: unknown[] } | undefined>;

export interface FrameRef {
  imageId: string;
  instance: DicomJson;
}

const num = (t: DicomJson, tag: string): number | null => {
  const v = t[tag]?.Value?.[0];
  return typeof v === "number" ? v : null;
};

const nums = (t: DicomJson | undefined, tag: string, n: number): number[] | null => {
  const v = t?.[tag]?.Value;
  if (!Array.isArray(v) || v.length < n) return null;
  const out = v.slice(0, n).map(Number);
  return out.every(Number.isFinite) ? out : null;
};
const seq = (t: DicomJson | undefined, tag: string): DicomJson | undefined => t?.[tag]?.Value?.[0] as DicomJson | undefined;

type Vec = [number, number, number];
interface Geo { pos: Vec; row: Vec; col: Vec }

/** Per-frame geometry: PerFrameFunctionalGroups item first, then SharedFunctionalGroups, then the instance's own tags. */
function frameGeometry(instance: DicomJson, frame: number): Geo | null {
  const perFrame = instance["52009230"]?.Value?.[frame] as DicomJson | undefined;
  const shared = seq(instance, "52009229");
  const pos = nums(seq(perFrame, "00209113"), "00200032", 3) ?? nums(seq(shared, "00209113"), "00200032", 3) ?? (instance["52009230"] ? null : nums(instance, "00200032", 3));
  const ori = nums(seq(perFrame, "00209116"), "00200037", 6) ?? nums(seq(shared, "00209116"), "00200037", 6) ?? nums(instance, "00200037", 6);
  if (!pos || !ori) return null;
  return { pos: pos as Vec, row: ori.slice(0, 3) as Vec, col: ori.slice(3) as Vec };
}

const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Orders frames along the slice normal (projection of ImagePositionPatient). Falls back to InstanceNumber/frame order
 * for the whole series if any frame lacks geometry, so a half-sorted stack never happens.
 */
export function orderFrames<T extends { instance: DicomJson; frame: number }>(items: T[]): T[] {
  const byNumber = [...items].sort((a, b) => (num(a.instance, "00200013") ?? 0) - (num(b.instance, "00200013") ?? 0) || a.frame - b.frame);
  const geos = byNumber.map((f) => frameGeometry(f.instance, f.frame));
  if (geos.length === 0 || geos.some((g) => !g)) return byNumber;
  // shortcut: one normal (first frame's) for the whole series; split mixed-orientation series upstream if that ever matters
  const normal = cross(geos[0]!.row, geos[0]!.col);
  const key = new Map(byNumber.map((f, i) => [f, dot(geos[i]!.pos, normal)]));
  return byNumber.sort((a, b) => key.get(a)! - key.get(b)!); // stable: ties keep InstanceNumber order
}

/** Series metadata -> one entry per frame, in geometric order (InstanceNumber when geometry is missing). */
export async function getSeriesFrames(base: string, studyUid: string, seriesUid: string, signal?: AbortSignal): Promise<FrameRef[]> {
  const root = `${base}/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(seriesUid)}`;
  const instances = await getJson<DicomJson[]>(`${root}/metadata`, { signal });
  const items = instances.flatMap((instance) => {
    const sop = instance["00080018"]?.Value?.[0];
    if (typeof sop !== "string") return []; // skip non-conformant instance without SOPInstanceUID
    const frames = num(instance, "00280008") ?? 1;
    return Array.from({ length: frames }, (_, frame) => ({ sop, frame, instance }));
  });
  return orderFrames(items).map((f) => ({ imageId: `wadors:${root}/instances/${f.sop}/frames/${f.frame + 1}`, instance: f.instance }));
}
