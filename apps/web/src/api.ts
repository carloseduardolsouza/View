import type { AnnotationPut, AnnotationRecord, Preferences } from "@view/contracts";

export const DICOMWEB = "/dicomweb";

// ---- annotations & preferences ----
async function ok<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.status === 204 ? (undefined as T) : r.json();
}
const json = { "content-type": "application/json" };
const enc = encodeURIComponent;

export const fetchAnnotations = (studyUid: string) =>
  fetch(`/annotations/${enc(studyUid)}`, { credentials: "include" }).then((r) => ok<AnnotationRecord[]>(r));

export const putAnnotation = (studyUid: string, uid: string, body: AnnotationPut) =>
  fetch(`/annotations/${enc(studyUid)}/${enc(uid)}`, { method: "PUT", credentials: "include", headers: json, body: JSON.stringify(body) }).then((r) => ok<AnnotationRecord>(r));

export const deleteAnnotation = (studyUid: string, uid: string) =>
  fetch(`/annotations/${enc(studyUid)}/${enc(uid)}`, { method: "DELETE", credentials: "include" }).then((r) => ok<void>(r));

export const fetchPreferences = () => fetch("/preferences", { credentials: "include" }).then((r) => ok<Preferences>(r));
export const savePreferences = (p: Preferences) =>
  fetch("/preferences", { method: "PUT", credentials: "include", headers: json, body: JSON.stringify(p) }).then((r) => ok<Preferences>(r));
