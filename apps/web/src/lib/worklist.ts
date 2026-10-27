import type { StudySummary } from "@view/dicom-client";

export interface Filters { name: string; pid: string; acc: string; desc: string; modality: string; from: string; to: string }
export const EMPTY_FILTERS: Filters = { name: "", pid: "", acc: "", desc: "", modality: "", from: "", to: "" };
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
  if (f.from || f.to) q.StudyDate = `${ymd(f.from)}-${ymd(f.to)}`;
  return q;
}

export const hasFilters = (f: Filters) => Object.values(f).some((v) => v.trim() !== "");

export type SortKey = "date-desc" | "date-asc" | "name";
export function sortStudies(rows: StudySummary[], key: SortKey): StudySummary[] {
  const cmp: Record<SortKey, (a: StudySummary, b: StudySummary) => number> = {
    "date-desc": (a, b) => b.date.localeCompare(a.date),
    "date-asc": (a, b) => a.date.localeCompare(b.date),
    name: (a, b) => a.patientName.localeCompare(b.patientName, "pt"),
  };
  return [...rows].sort(cmp[key]); // stable: ties keep server order
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
