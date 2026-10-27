// Extracts the StudyInstanceUID from a DICOMweb sub-path like "studies/1.2.3/series/..."; null = not a study-scoped path.
export function studyUidFromPath(path: string): string | null {
  const m = /^studies\/([0-9.]{1,64})(?:\/|$)/.exec(path);
  return m?.[1] ?? null;
}
