import type { StudySummary } from "@view/dicom-client";

export interface Filters { name: string; pid: string; acc: string; desc: string; modality: string; from: string; to: string; sex: string }
export const EMPTY_FILTERS: Filters = { name: "", pid: "", acc: "", desc: "", modality: "", from: "", to: "", sex: "" };
export const MODALITIES = ["CT", "MR", "CR", "DX", "US", "PT", "NM", "XA", "MG", "RF", "OT"];
export const PAGE = 50;

// Orthanc QIDO: case-insensitive, `*` and `?` wildcards; StudyDate accepts `A-B`, `A-` and `-B`.
const wrap = (v: string) => (/[*?]/.test(v) ? v : `*${v}*`);
const ymd = (iso: string) => iso.replaceAll("-", "");

export function buildQuery(f: Filters): Record<string, string> {
  const q: Record<string, string> = {};
  const set = (k: string, v: string) => { if (v.trim()) q[k] = v.trim(); };
  if (f.name.trim()) q.PatientName = wrap(f.name.trim());
  set("PatientID", f.pid);
  set("AccessionNumber", f.acc);
  if (f.desc.trim()) q.StudyDescription = wrap(f.desc.trim());
  set("ModalitiesInStudy", f.modality);
  set("PatientSex", f.sex);
  if (f.from || f.to) q.StudyDate = `${ymd(f.from)}-${ymd(f.to)}`;
  return q;
}

export const hasFilters = (f: Filters) => Object.values(f).some((v) => v.trim() !== "");

export type SortCol = "name" | "date" | "pid" | "acc" | "desc" | "mod" | "birth" | "series";
/** "<col>-asc" | "<col>-desc"; a bare column sorts ascending */
export type SortKey = SortCol | `${SortCol}-${"asc" | "desc"}`;
const SORT_VALUE: Record<SortCol, (s: StudySummary) => string | number> = {
  name: (s) => s.patientName, date: (s) => `${s.date}${s.time ?? ""}`, pid: (s) => s.patientId, acc: (s) => s.accession,
  desc: (s) => s.description, mod: (s) => s.modalities.join(","), birth: (s) => s.birthDate ?? "", series: (s) => s.instanceCount ?? -1,
};
export function sortStudies(rows: StudySummary[], key: SortKey): StudySummary[] {
  const [col, dir] = key.split("-") as [SortCol, string | undefined];
  const f = SORT_VALUE[col];
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => { // stable: ties keep server order
    const x = f(a), y = f(b);
    return sign * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt"));
  });
}

/** Quick date ranges for the filter chips: [from, to] as yyyy-mm-dd ("" = open). */
export function dateRange(preset: "today" | "yesterday" | "7d" | "30d" | "1y", now = new Date()): [string, string] {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const back = (days: number) => { const d = new Date(now); d.setDate(d.getDate() - days); return iso(d); };
  if (preset === "today") return [iso(now), iso(now)];
  if (preset === "yesterday") return [back(1), back(1)];
  return [back({ "7d": 6, "30d": 29, "1y": 364 }[preset]), iso(now)];
}

// --- Recent studies (per browser) ---
const KEY = "view.recents";
const MAX = 10;
export interface Resume { seriesUid: string; index: number }
export interface Recent { study: StudySummary; at: number; resume?: Resume }

function load(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((r) => r?.study?.studyUid) : [];
  } catch { return []; }
}
function save(list: Recent[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* quota/private mode */ } }

export const getRecents = load;

/** Call when a study is opened. Moves it to the front, keeping any saved resume point. */
export function rememberStudy(study: StudySummary, now = Date.now()) {
  const list = load();
  const prev = list.find((r) => r.study.studyUid === study.studyUid);
  save([{ study, at: now, resume: prev?.resume }, ...list.filter((r) => r.study.studyUid !== study.studyUid)]);
}

/** Viewer may call this (debounced) with the current series/slice so "Continuar" can restore it. */
export function rememberResume(studyUid: string, resume: Resume) {
  const list = load();
  const r = list.find((x) => x.study.studyUid === studyUid);
  if (r) { r.resume = resume; save(list); }
}

export const getResume = (studyUid: string) => load().find((r) => r.study.studyUid === studyUid)?.resume;
