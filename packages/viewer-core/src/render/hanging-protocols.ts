// Hanging protocols: rules that turn "what is in this study" into a layout plus a series per cell. Pure, no Cornerstone.
// Every rule field is a case-insensitive regex source; a missing field matches anything.

export interface CellRule { seriesDescription?: string; modality?: string; bodyPart?: string }
export interface Protocol {
  id: string;
  name: string;
  match: { modality?: string; studyDescription?: string; bodyPart?: string };
  layout: 1 | 2 | 4;
  cells: CellRule[];
}
export interface HpStudy { description: string; modalities: string[] }
export interface HpSeries { seriesUid: string; modality: string; description: string; bodyPart?: string }

/** Tried after the user's own protocols; first one that fits wins. */
export const BUILTIN_PROTOCOLS: Protocol[] = [
  {
    id: "builtin-ct", name: "TC: axial, coronal e scout", match: { modality: "^CT$" }, layout: 4,
    cells: [{ seriesDescription: "axial|^vol" }, { seriesDescription: "coronal|\\bcor\\b" }, { seriesDescription: "scout|topograma|localizer" }, {}],
  },
  { id: "builtin-cr", name: "Radiografia: uma imagem", match: { modality: "^(CR|DX)$" }, layout: 1, cells: [{}] },
];

function test(rx: string | undefined, value: string | undefined): boolean {
  if (!rx) return true;
  try { return new RegExp(rx, "i").test(value ?? ""); } catch { return false; } // an invalid saved regex never matches
}

const seriesFits = (r: CellRule, s: HpSeries) => test(r.modality, s.modality) && test(r.seriesDescription, s.description) && test(r.bodyPart, s.bodyPart);

export function matchesStudy(p: Protocol, study: HpStudy, series: HpSeries[]): boolean {
  const mods = study.modalities.length ? study.modalities : series.map((s) => s.modality);
  return (!p.match.modality || mods.some((m) => test(p.match.modality, m)))
    && test(p.match.studyDescription, study.description)
    && (!p.match.bodyPart || series.some((s) => test(p.match.bodyPart, s.bodyPart)));
}

export interface Applied { protocol: Protocol; layout: 1 | 2 | 4; /** seriesUid per cell, always 4 entries */ cells: (string | null)[] }

/** First protocol that matches the study and puts at least one series in a cell. */
export function resolveProtocol(protocols: Protocol[], study: HpStudy, series: HpSeries[]): Applied | null {
  for (const p of protocols) {
    if (!matchesStudy(p, study, series)) continue;
    const used = new Set<string>();
    const cells: (string | null)[] = [null, null, null, null];
    p.cells.slice(0, p.layout).forEach((rule, i) => {
      const s = series.find((x) => !used.has(x.seriesUid) && seriesFits(rule, x));
      if (s) { used.add(s.seriesUid); cells[i] = s.seriesUid; }
    });
    if (!used.size) continue;
    // rules that matched nothing leave holes: pack the shown series to the front and use the smallest layout that fits them
    const shown = cells.filter((c): c is string => !!c);
    const layout = shown.length <= 1 ? 1 : shown.length === 2 ? 2 : 4;
    return { protocol: p, layout, cells: [...shown, null, null, null, null].slice(0, 4) };
  }
  return null;
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Snapshot of the current layout as a reusable protocol (matches studies like this one). */
export function protocolFromLayout(id: string, name: string, study: HpStudy, series: HpSeries[], layout: 1 | 2 | 4, cells: (string | null)[]): Protocol {
  const mods = [...new Set(study.modalities)];
  return {
    id, name: name.trim().slice(0, 60),
    match: {
      ...(mods.length ? { modality: `^(${mods.map(esc).join("|")})$` } : {}),
      ...(study.description ? { studyDescription: `^${esc(study.description)}$` } : {}),
    },
    layout,
    cells: cells.slice(0, layout).map((uid) => {
      const s = series.find((x) => x.seriesUid === uid);
      return s?.description ? { seriesDescription: `^${esc(s.description)}$` } : s ? { modality: `^${esc(s.modality)}$` } : {};
    }),
  };
}

/** Same name (case-insensitive) replaces; newest first; capped like the API schema. */
export function upsertProtocol(list: Protocol[], p: Protocol): Protocol[] {
  return [p, ...list.filter((x) => x.name.toLowerCase() !== p.name.toLowerCase())].slice(0, 50);
}
