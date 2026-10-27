// DICOM JSON -> flat, readable rows for the "all tags" table. Names come from dcmjs' dictionary.
import dcmjs from "dcmjs";

type El = { vr?: string; Value?: unknown[]; BulkDataURI?: string; InlineBinary?: string };
export type DicomJsonObj = Record<string, El | undefined>;
export interface TagRow { tag: string; name: string; vr: string; value: string; depth: number }

const DICT = (dcmjs as { data: { DicomMetaDictionary: { dictionary: Record<string, { name?: string }> } } }).data.DicomMetaDictionary.dictionary;
const MAX = 400;

/** "00100010" -> "Patient Name"; private (odd group) tags are labelled as such. */
export function tagName(tag: string): string {
  const n = DICT[`(${tag.slice(0, 4)},${tag.slice(4)})`.toUpperCase()]?.name;
  if (n) return n.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return parseInt(tag.slice(3, 4), 16) % 2 ? "Tag privada" : "Desconhecida";
}

/** "00100010" -> "(0010,0010)" */
export const tagLabel = (tag: string) => `(${tag.slice(0, 4)},${tag.slice(4)})`.toUpperCase();

function show(el: El): string {
  if (el.BulkDataURI || el.InlineBinary) return "[dados binários]";
  const v = (el.Value ?? []).map((x) => (x && typeof x === "object" ? String((x as { Alphabetic?: string }).Alphabetic ?? JSON.stringify(x)) : String(x))).join(" \ ");
  return v.length > MAX ? `${v.slice(0, MAX)}… (${v.length} caracteres)` : v;
}

/** Rows in tag order; sequence items follow their sequence with a deeper `depth`. */
export function flattenTags(obj: DicomJsonObj, depth = 0): TagRow[] {
  const rows: TagRow[] = [];
  for (const tag of Object.keys(obj).sort()) {
    const el = obj[tag];
    if (!el) continue;
    const vr = el.vr ?? "";
    if (vr === "SQ") {
      const items = (el.Value ?? []) as DicomJsonObj[];
      rows.push({ tag: tagLabel(tag), name: tagName(tag), vr, value: `${items.length} ${items.length === 1 ? "item" : "itens"}`, depth });
      items.forEach((it, i) => {
        rows.push({ tag: "", name: `Item ${i + 1}`, vr: "", value: "", depth: depth + 1 });
        rows.push(...flattenTags(it, depth + 2));
      });
    } else rows.push({ tag: tagLabel(tag), name: tagName(tag), vr, value: show(el), depth });
  }
  return rows;
}

/** UIDs of the instance behind a wadors imageId (…/studies/S/series/X/instances/I/frames/n). */
export function instanceOfImageId(imageId: string): { studyUid: string; seriesUid: string; sopUid: string } | null {
  const m = /\/studies\/([^/]+)\/series\/([^/]+)\/instances\/([^/]+)/.exec(imageId);
  return m ? { studyUid: decodeURIComponent(m[1]!), seriesUid: decodeURIComponent(m[2]!), sopUid: decodeURIComponent(m[3]!) } : null;
}
