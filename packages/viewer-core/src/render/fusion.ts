// Pure PET/CT registration check (no Cornerstone import). Without a REG object the only registration we trust is
// "same FrameOfReferenceUID", which means both series share one patient coordinate system.
type Tag = { Value?: unknown[] } | undefined;
export interface FusionGeom { modality: string; forUid: string; iop: number[]; pixelSpacing: [number, number] | null; rows: number; columns: number }
export type FusionCheck = { ok: true; warnings: string[] } | { ok: false; reason: string };

const first = (t: Tag) => t?.Value?.[0];
const numArr = (t: Tag, n: number) => (Array.isArray(t?.Value) && t!.Value!.length >= n && t!.Value!.slice(0, n).every((x) => typeof x === "number") ? (t!.Value!.slice(0, n) as number[]) : null);

/** Reads the fields the check needs from a QIDO/WADO-RS instance JSON; null when geometry is missing. */
export function geometryFromInstance(i: Record<string, Tag>): FusionGeom | null {
  const iop = numArr(i["00200037"], 6);
  const forUid = String(first(i["00200052"]) ?? "");
  const rows = Number(first(i["00280010"])), columns = Number(first(i["00280011"]));
  const ps = numArr(i["00280030"], 2);
  if (!iop || !forUid || !rows || !columns) return null;
  return { modality: String(first(i["00080060"]) ?? ""), forUid, iop, pixelSpacing: ps as [number, number] | null, rows, columns };
}

const normal = (o: number[]) => [o[1]! * o[5]! - o[2]! * o[4]!, o[2]! * o[3]! - o[0]! * o[5]!, o[0]! * o[4]! - o[1]! * o[3]!];

export function checkRegistration(ct: FusionGeom | null, pt: FusionGeom | null): FusionCheck {
  const no = (reason: string): FusionCheck => ({ ok: false, reason });
  if (!ct || !pt) return no("Uma das séries não informa orientação/referencial espacial; a fusão não pode ser validada.");
  if (pt.modality !== "PT") return no(`A série de PET selecionada é ${pt.modality || "de modalidade desconhecida"}, não PT.`);
  if (ct.modality === "PT") return no("A série base não pode ser PET; escolha uma série de CT ou MR.");
  if (ct.forUid !== pt.forUid)
    return no("As séries usam referenciais espaciais diferentes (FrameOfReferenceUID). Sem um objeto de registro (REG) não há como alinhá-las com segurança; a fusão foi recusada.");
  const a = normal(ct.iop), b = normal(pt.iop);
  if (Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) < 0.9998)
    return no("As séries têm orientações de corte diferentes (inclinadas entre si); a fusão foi recusada para não exibir uma sobreposição desalinhada.");
  const warnings: string[] = [];
  if (ct.rows !== pt.rows || ct.columns !== pt.columns || ct.pixelSpacing?.[0] !== pt.pixelSpacing?.[0] || ct.pixelSpacing?.[1] !== pt.pixelSpacing?.[1])
    warnings.push("As séries têm resolução diferente; o PET é reamostrado para sobrepor o CT.");
  return { ok: true, warnings };
}
