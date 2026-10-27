import { expect, it } from "vitest";
import { BUILTIN_PROTOCOLS, protocolFromLayout, resolveProtocol, upsertProtocol, type HpSeries } from "./hanging-protocols";

const ser = (uid: string, modality: string, description: string): HpSeries => ({ seriesUid: uid, modality, description });
const ct = [ser("a", "CT", "SCOUT"), ser("b", "CT", "VOL PM"), ser("c", "CT", "VOL OSSO")];

it("built-in CT protocol shows axial volume, scout and the rest; the missing coronal leaves no hole", () => {
  const r = resolveProtocol(BUILTIN_PROTOCOLS, { description: "", modalities: ["CT"] }, ct)!;
  expect(r.layout).toBe(4);
  expect(r.cells).toEqual(["b", "a", "c", null]);
});
it("CR gets a single image; unknown modality gets nothing", () => {
  const r = resolveProtocol(BUILTIN_PROTOCOLS, { description: "", modalities: ["CR"] }, [ser("x", "CR", "TORAX")])!;
  expect(r).toMatchObject({ layout: 1, cells: ["x", null, null, null] });
  expect(resolveProtocol(BUILTIN_PROTOCOLS, { description: "", modalities: ["MR"] }, [ser("y", "MR", "T1")])).toBeNull();
});
it("a saved protocol round-trips, wins over built-ins and escapes regex characters", () => {
  const series = [ser("1", "CT", "Cor (osso) 1.5"), ser("2", "CT", "Axial")];
  const study = { description: "TC CRANIO", modalities: ["CT"] };
  const p = protocolFromLayout("u1", " Meu ", study, series, 2, ["2", "1"]);
  expect(p.name).toBe("Meu");
  const r = resolveProtocol([p, ...BUILTIN_PROTOCOLS], study, series)!;
  expect(r.protocol.id).toBe("u1");
  expect(r.cells.slice(0, 2)).toEqual(["2", "1"]);
  expect(resolveProtocol([p], { description: "OUTRO", modalities: ["CT"] }, series)).toBeNull();
});
it("invalid regex never matches; body part and series description rules work", () => {
  const bad = { id: "b", name: "x", match: { studyDescription: "(" }, layout: 1 as const, cells: [{}] };
  expect(resolveProtocol([bad], { description: "a", modalities: [] }, ct)).toBeNull();
  const bp = { id: "p", name: "p", match: { bodyPart: "chest" }, layout: 1 as const, cells: [{ seriesDescription: "osso" }] };
  const s = [{ ...ser("c", "CT", "VOL OSSO"), bodyPart: "CHEST" }];
  expect(resolveProtocol([bp], { description: "", modalities: ["CT"] }, s)?.cells[0]).toBe("c");
  expect(resolveProtocol([bp], { description: "", modalities: ["CT"] }, ct)).toBeNull();
});
it("upsert replaces by name", () => {
  const p = (id: string, name: string) => ({ id, name, match: {}, layout: 1 as const, cells: [] });
  expect(upsertProtocol([p("1", "A"), p("2", "B")], p("3", "a")).map((x) => x.id)).toEqual(["3", "2"]);
});

it("a lone series that only matches a late rule is not left in the last cell of a 4-up layout", () => {
  const r = resolveProtocol(BUILTIN_PROTOCOLS, { description: "", modalities: ["CT"] }, [{ seriesUid: "s1", modality: "CT", description: "Imagens" }]);
  expect(r).toMatchObject({ layout: 1, cells: ["s1", null, null, null] });
});
