import { expect, it } from "vitest";
import { listAiModules, registerAiModule, runAiModule, sliceCounterModule } from "./ai";

const ctx = { studyUid: "1", seriesUid: "2", modality: "CT", imageIds: ["a", "b", "c"] };

it("registers, filters by modality and runs with provenance", async () => {
  const off = registerAiModule(sliceCounterModule);
  registerAiModule({ id: "mr-only", name: "MR", version: "0", modalities: ["MR"], run: async () => [] });
  expect(listAiModules("CT").map((m) => m.id)).toEqual(["example.slice-counter"]);
  const r = await runAiModule("example.slice-counter", ctx);
  expect(r.findings[0]!.title).toBe("3 corte(s) na série");
  expect(r).toMatchObject({ moduleId: "example.slice-counter", version: "1.0.0" });
  expect(Date.parse(r.ranAt)).not.toBeNaN();
  await expect(runAiModule("mr-only", ctx)).rejects.toThrow(/modalidade CT/);
  expect(() => registerAiModule(sliceCounterModule)).toThrow(/já registrado/);
  off();
  await expect(runAiModule("example.slice-counter", ctx)).rejects.toThrow(/não encontrado/);
});
