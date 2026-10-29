import type { AnnotationPut, AnnotationRecord, Preferences } from "@view/contracts";

// Served under /genusvisualizador by the web-laudos API (vite `base`); DICOMWEB is proxied to the company's PACS.
export const DICOMWEB = `${import.meta.env.BASE_URL}dicomweb`;

// ---- annotations & preferences: browser-only (localStorage), no backend in the embedded build ----
const read = <T>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, v: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota/private mode: keep working unsaved */ }
};
const annKey = (studyUid: string) => `view.annotations.${studyUid}`;
const LOCAL_AUTHOR = { authorId: "00000000-0000-0000-0000-000000000000", authorEmail: "local" };

export const fetchAnnotations = async (studyUid: string) => read<AnnotationRecord[]>(annKey(studyUid), []);

export const putAnnotation = async (studyUid: string, uid: string, body: AnnotationPut) => {
  const all = read<AnnotationRecord[]>(annKey(studyUid), []);
  const prev = all.find((r) => r.uid === uid);
  const now = new Date().toISOString();
  const rec: AnnotationRecord = {
    uid, studyUid, seriesUid: body.seriesUid ?? null, imageId: body.imageId ?? null, tool: body.tool, data: body.data,
    ...LOCAL_AUTHOR, version: (prev?.version ?? 0) + 1, createdAt: prev?.createdAt ?? now, updatedAt: now,
  };
  write(annKey(studyUid), [...all.filter((r) => r.uid !== uid), rec]);
  return rec;
};

export const deleteAnnotation = async (studyUid: string, uid: string) =>
  write(annKey(studyUid), read<AnnotationRecord[]>(annKey(studyUid), []).filter((r) => r.uid !== uid));

export const fetchPreferences = async () => read<Preferences>("view.preferences", {});
export const savePreferences = async (p: Preferences) => { write("view.preferences", p); return p; };
