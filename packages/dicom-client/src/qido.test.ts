import { afterEach, expect, it, vi } from "vitest";
import { getJson } from "./http.js";
import { parseStudy } from "./qido.js";

afterEach(() => vi.unstubAllGlobals());

it("parses PN, modalities and missing tags", () => {
  const s = parseStudy({
    "0020000D": { Value: ["1.2.3"] },
    "00100010": { Value: [{ Alphabetic: "DOE^JOHN" }] },
    "00080061": { Value: ["CT", "MR"] },
  });
  expect(s).toMatchObject({ studyUid: "1.2.3", patientName: "DOE^JOHN", modalities: ["CT", "MR"], accession: "" });
});

it("retries 503 then succeeds, but not 403", async () => {
  const f = vi.fn()
    .mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(new Response("[1]", { status: 200 }));
  vi.stubGlobal("fetch", f);
  expect(await getJson("/x", { baseDelayMs: 1 })).toEqual([1]);
  expect(f).toHaveBeenCalledTimes(2);

  const g = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
  vi.stubGlobal("fetch", g);
  await expect(getJson("/x", { baseDelayMs: 1 })).rejects.toMatchObject({ status: 403 });
  expect(g).toHaveBeenCalledTimes(1);
});

import { findPriorStudies } from "./qido.js";

const tag = (uid: string, name: string, id: string, date: string) => ({
  "0020000D": { Value: [uid] }, "00100010": { Value: [{ Alphabetic: name }] }, "00100020": { Value: [id] }, "00080020": { Value: [date] },
});
const cur = { studyUid: "C", patientName: "ANA^^^^", patientId: "", accession: "", date: "20260101", description: "", modalities: [] };

it("findPriorStudies: by ID, excludes current, newest first", async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    tag("A", "X", "7", "20240101"), tag("C", "X", "7", "20260101"), tag("B", "X", "7", "20250101"), tag("Z", "Y", "8", "20270101"),
  ])));
  vi.stubGlobal("fetch", f);
  const r = await findPriorStudies("/d", { ...cur, patientId: "7" });
  expect(r.map((s) => s.studyUid)).toEqual(["B", "A"]);
  expect(String(f.mock.calls[0]![0])).toContain("PatientID=7");
});

it("findPriorStudies: falls back to name ignoring ^ padding", async () => {
  const f = vi.fn().mockResolvedValue(new Response(JSON.stringify([
    tag("A", "ANA", "", "20240101"), tag("B", "ANA^^^^", "", "20250101"), tag("C", "ANA^^^^", "", "20260101"), tag("D", "ANABELA", "", "20250101"),
  ])));
  vi.stubGlobal("fetch", f);
  expect((await findPriorStudies("/d", cur)).map((s) => s.studyUid)).toEqual(["B", "A"]);
  expect(decodeURIComponent(String(f.mock.calls[0]![0]))).toContain("PatientName=ANA*");
});
