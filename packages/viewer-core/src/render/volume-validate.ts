// Pure geometry checks, kept free of Cornerstone imports so they run under node (vitest). A refusal message is shown to the user as is.
import { frameGeometry } from "@view/dicom-client";
type Tag = { Value?: unknown[] } | undefined;
export interface VolumeFrame { instance: Record<string, Tag> }

export interface VolumeLimits {
  minSlices: number;
  /** estimated voxel buffer; exceeding it refuses the build (the browser tab would die otherwise) */
  maxBytes: number;
  /** largest acceptable median slice spacing (mm): thicker stacks make poor coronal/sagittal planes */
  maxSpacingMm: number;
  /** allowed deviation of any gap from the median, relative */
  gapTolerance: number;
}

export const DEFAULT_LIMITS: VolumeLimits = { minSlices: 3, maxBytes: 1.2 * 1024 ** 3, maxSpacingMm: 10, gapTolerance: 0.1 };

/** Relaxation steps tried in order when only the slice spacing is refused: full quality first, then a little less until it opens. */
const SPACING_LADDER: Pick<VolumeLimits, "gapTolerance" | "maxSpacingMm">[] = [
  { gapTolerance: 0.1, maxSpacingMm: 10 },
  { gapTolerance: 0.15, maxSpacingMm: 12 },
  { gapTolerance: 0.2, maxSpacingMm: 14 },
  { gapTolerance: 0.25, maxSpacingMm: 16 },
  { gapTolerance: 0.3, maxSpacingMm: 18 },
  { gapTolerance: 0.4, maxSpacingMm: 22 },
  { gapTolerance: 0.5, maxSpacingMm: 25 },
];

export interface VolumeGeometry {
  slices: number;
  rows: number;
  columns: number;
  spacing: [number, number, number]; // x (column), y (row), z (slice) in mm
  normal: [number, number, number];
  estimatedBytes: number;
}
export type VolumeCheck = { ok: true; geometry: VolumeGeometry } | { ok: false; reason: string; spacing?: boolean };

const nums = (t: Tag, n: number): number[] | null => {
  const v = t?.Value;
  return Array.isArray(v) && v.length >= n && v.slice(0, n).every((x) => typeof x === "number" && Number.isFinite(x)) ? (v.slice(0, n) as number[]) : null;
};
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: number[], b: number[]): [number, number, number] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const mb = (b: number) => `${Math.round(b / 1024 ** 2)} MB`;

export function validateVolumeSeries(frames: VolumeFrame[], limits: Partial<VolumeLimits> = {}): VolumeCheck {
  const first = checkVolumeSeries(frames, limits);
  if (first.ok || !first.spacing || limits.gapTolerance !== undefined || limits.maxSpacingMm !== undefined) return first;
  for (const step of SPACING_LADDER.slice(1)) {
    const r = checkVolumeSeries(frames, { ...limits, ...step });
    if (r.ok) return r;
    if (!r.spacing) break;
  }
  return first; // keep the strict refusal message
}

function checkVolumeSeries(frames: VolumeFrame[], limits: Partial<VolumeLimits>): VolumeCheck {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const refuse = (reason: string, spacing = false): VolumeCheck => ({ ok: false, reason, spacing });
  if (frames.length < L.minSlices)
    return refuse(`A série tem ${frames.length} imagem(ns); são necessárias ao menos ${L.minSlices} cortes para reconstruir um volume.`);

  const iop: number[][] = [];
  const ipp: number[][] = [];
  for (const [i, f] of frames.entries()) {
    // instance tags, or the functional groups of an enhanced (CT/MR) object that holds a single frame
    const g = frameGeometry(f.instance as never, 0);
    const o = g ? [...g.row, ...g.col] : nums(f.instance["00200037"], 6);
    const p = g ? g.pos : nums(f.instance["00200032"], 3);
    if (!o) return refuse(`A imagem ${i + 1} não informa a orientação (ImageOrientationPatient); sem ela não há como posicionar os cortes no espaço.`);
    if (!p) return refuse(`A imagem ${i + 1} não informa a posição (ImagePositionPatient); sem ela não há como posicionar os cortes no espaço.`);
    iop.push(o);
    ipp.push(p);
  }
  if (frames.some((f) => (nums(f.instance["00280008"], 1)?.[0] ?? 1) > 1))
    return refuse("Imagens multiquadro (um arquivo com vários cortes) não são suportadas na reconstrução; use uma série com um corte por arquivo.");

  const size = (f: VolumeFrame) => `${nums(f.instance["00280010"], 1)?.[0]}x${nums(f.instance["00280011"], 1)?.[0]}`;
  const rows = nums(frames[0]!.instance["00280010"], 1)?.[0];
  const columns = nums(frames[0]!.instance["00280011"], 1)?.[0];
  if (!rows || !columns) return refuse("A série não informa o tamanho da imagem (linhas/colunas).");
  if (frames.some((f) => size(f) !== size(frames[0]!)))
    return refuse("Os cortes têm tamanhos diferentes (linhas x colunas); não é possível empilhá-los em um volume.");

  const o0 = iop[0]!;
  if (iop.some((o) => o.some((v, k) => Math.abs(v - o0[k]!) > 1e-3)))
    return refuse("Os cortes têm orientações diferentes (ImageOrientationPatient); a série mistura planos e não forma um volume único.");

  const normal = cross(o0.slice(0, 3), o0.slice(3, 6));
  const pos = ipp.map((p) => dot(p, normal)).sort((a, b) => a - b);
  const gaps = pos.slice(1).map((v, i) => v - pos[i]!);
  if (gaps.some((g) => g < 1e-3)) return refuse("Há cortes na mesma posição (duplicados); a série não forma um volume.");
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  if (gaps.some((g) => Math.abs(g - median) > L.gapTolerance * median))
    return refuse(`O espaçamento entre cortes não é uniforme (mediana ${median.toFixed(2)} mm, de ${sorted[0]!.toFixed(2)} a ${sorted.at(-1)!.toFixed(2)} mm); há cortes faltando ou a série tem gantry inclinado.`, true);
  if (median > L.maxSpacingMm)
    return refuse(`Os cortes estão muito espaçados (${median.toFixed(1)} mm; o limite é ${L.maxSpacingMm} mm); as reformatações coronal e sagital ficariam inutilizáveis.`, true);

  const ps = nums(frames[0]!.instance["00280030"], 2) ?? [1, 1]; // [row spacing, column spacing]
  const bits = nums(frames[0]!.instance["00280100"], 1)?.[0] ?? 16;
  // rescale or >16 bit data become Float32 in the volume buffer
  const bytesPer = frames[0]!.instance["00281053"] || bits > 16 ? 4 : Math.max(1, bits / 8);
  const estimatedBytes = rows * columns * frames.length * bytesPer;
  if (estimatedBytes > L.maxBytes)
    return refuse(`O volume ocuparia cerca de ${mb(estimatedBytes)} de memória (${columns}x${rows}x${frames.length}); o limite é ${mb(L.maxBytes)}.`);

  return { ok: true, geometry: { slices: frames.length, rows, columns, spacing: [ps[1]!, ps[0]!, median], normal, estimatedBytes } };
}
