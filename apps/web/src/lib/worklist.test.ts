import { beforeEach, expect, it } from "vitest";
import { buildQuery, EMPTY_FILTERS, getRecents, getResume, rememberResume, rememberStudy, sortStudies } from "./worklist";

const st = (uid: string, date = "20260101", name = "A") => ({ studyUid: uid, patientName: name, patientId: "", accession: "", date, description: "", modalities: [] });

beforeEach(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
});

it("builds QIDO params", () => {
  expect(buildQuery(EMPTY_FILTERS)).toEqual({});
  expect(buildQuery({ ...EMPTY_FILTERS, name: " ana ", modality: "CT", from: "2026-01-02", to: "2026-02-03", desc: "tor?x" })).toEqual({
    PatientName: "*ana*", ModalitiesInStudy: "CT", StudyDate: "20260102-20260203", StudyDescription: "tor?x",
  });
  expect(buildQuery({ ...EMPTY_FILTERS, from: "2026-01-02" }).StudyDate).toBe("20260102-");
  expect(buildQuery({ ...EMPTY_FILTERS, to: "2026-01-02" }).StudyDate).toBe("-20260102");
});

it("sorts without mutating", () => {
  const rows = [st("1", "20250101", "B"), st("2", "20260101", "A")];
  expect(sortStudies(rows, "date-desc").map((s) => s.studyUid)).toEqual(["2", "1"]);
  expect(sortStudies(rows, "name").map((s) => s.studyUid)).toEqual(["2", "1"]);
  expect(rows[0]!.studyUid).toBe("1");
});

it("recents: dedupe, cap 10, keep resume", () => {
  rememberStudy(st("a"));
  rememberResume("a", { seriesUid: "s", index: 3 });
  rememberStudy(st("b"));
  rememberStudy(st("a")); // re-open keeps resume
  expect(getResume("a")).toEqual({ seriesUid: "s", index: 3 });
  for (let i = 0; i < 12; i++) rememberStudy(st(`x${i}`));
  const r = getRecents();
  expect(r).toHaveLength(10);
  expect(r.filter((x) => x.study.studyUid === "a")).toHaveLength(0);
  rememberStudy(st("x5"));
  expect(getRecents()[0]!.study.studyUid).toBe("x5");
  expect(getRecents()).toHaveLength(10);
});
