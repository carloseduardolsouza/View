import { getJson } from "./http.js";

type Tag = Record<string, { Value?: unknown[] } | undefined>;

export interface StudySummary {
  studyUid: string;
  patientName: string;
  patientId: string;
  accession: string;
  date: string;
  description: string;
  modalities: string[];
}

export interface SeriesSummary {
  seriesUid: string;
  modality: string;
  number: number | null;
  description: string;
  instanceCount: number | null;
}

const str = (t: Tag, tag: string): string => {
  const v = t[tag]?.Value?.[0];
  if (v && typeof v === "object") return String((v as { Alphabetic?: string }).Alphabetic ?? ""); // PN
  return v == null ? "" : String(v);
};

export function parseStudy(t: Tag): StudySummary {
  return {
    studyUid: str(t, "0020000D"),
    patientName: str(t, "00100010"),
    patientId: str(t, "00100020"),
    accession: str(t, "00080050"),
    date: str(t, "00080020"),
    description: str(t, "00081030"),
    modalities: (t["00080061"]?.Value ?? []).map(String),
  };
}

export function parseSeries(t: Tag): SeriesSummary {
  const n = t["00200011"]?.Value?.[0];
  const c = t["00201209"]?.Value?.[0];
  return {
    seriesUid: str(t, "0020000E"),
    modality: str(t, "00080060"),
    number: typeof n === "number" ? n : null,
    description: str(t, "0008103E"),
    instanceCount: typeof c === "number" ? c : null,
  };
}

export async function searchStudies(base: string, params: Record<string, string> = {}, signal?: AbortSignal) {
  const qs = new URLSearchParams({ includefield: "00080061", limit: "500", ...params });
  return (await getJson<Tag[]>(`${base}/studies?${qs}`, { signal })).map(parseStudy);
}

export async function searchSeries(base: string, studyUid: string, signal?: AbortSignal) {
  const qs = new URLSearchParams({ includefield: "00201209" });
  const rows = await getJson<Tag[]>(`${base}/studies/${encodeURIComponent(studyUid)}/series?${qs}`, { signal });
  return rows.map(parseSeries).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
}

const normName = (n: string) => n.split("=")[0]!.replace(/\^+$/, "").trim().toUpperCase();

/** Other studies of the same patient (PatientID; PatientName when the ID is empty), newest first. */
export async function findPriorStudies(base: string, current: StudySummary, signal?: AbortSignal): Promise<StudySummary[]> {
  const byId = current.patientId.trim() !== "";
  const name = normName(current.patientName);
  if (!byId && !name) return [];
  // Orthanc names may differ only by trailing "^" padding, so query by prefix and filter exactly below.
  const rows = await searchStudies(base, byId ? { PatientID: current.patientId } : { PatientName: `${name}*` }, signal);
  return rows
    .filter((s) => s.studyUid !== current.studyUid && (byId ? s.patientId === current.patientId : normName(s.patientName) === name))
    .sort((a, b) => b.date.localeCompare(a.date));
}
