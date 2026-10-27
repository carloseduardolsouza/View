import { describe, expect, it } from "vitest";
import { validateVolumeSeries, type VolumeFrame } from "./volume-validate";

const slice = (z: number, extra: Record<string, unknown[]> = {}): VolumeFrame => {
  const t = (...Value: unknown[]) => ({ Value });
  return { instance: { "00200037": t(1, 0, 0, 0, 1, 0), "00200032": t(0, 0, z), "00280010": t(512), "00280011": t(512), "00280030": t(0.5, 0.5), "00280100": t(16),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { Value: v }])) } };
};
const stack = (n: number, step = 1) => Array.from({ length: n }, (_, i) => slice(i * step));
const reason = (f: VolumeFrame[], l = {}) => { const r = validateVolumeSeries(f, l); return r.ok ? "" : r.reason; };

describe("validateVolumeSeries", () => {
  it("accepts a uniform stack and reports spacing", () => {
    const r = validateVolumeSeries(stack(10, 2));
    expect(r.ok && r.geometry.spacing).toEqual([0.5, 0.5, 2]);
  });
  it("refuses fewer than 3 slices", () => expect(reason(stack(2))).toMatch(/ao menos 3/));
  it("refuses missing orientation / position", () => {
    const f = stack(5); delete f[1]!.instance["00200037"];
    expect(reason(f)).toMatch(/imagem 2.*orientação/);
    const g = stack(5); delete g[3]!.instance["00200032"];
    expect(reason(g)).toMatch(/imagem 4.*posição/);
  });
  it("refuses mixed orientations", () => {
    const f = stack(5); f[2] = slice(2, { "00200037": [1, 0, 0, 0, 0, -1] });
    expect(reason(f)).toMatch(/orientações diferentes/);
  });
  it("refuses non-uniform spacing", () => {
    const f = stack(5); f[3] = slice(5);
    expect(reason(f)).toMatch(/não é uniforme/);
  });
  it("refuses spacing above the limit", () => expect(reason(stack(5, 12))).toMatch(/muito espaçados/));
  it("refuses duplicates", () => expect(reason([slice(0), slice(0), slice(1), slice(2)])).toMatch(/duplicados/));
  it("refuses inconsistent in-plane size", () => {
    const f = stack(5); f[1] = slice(1, { "00280011": [256] });
    expect(reason(f)).toMatch(/tamanhos diferentes/);
  });
  it("refuses multiframe", () => expect(reason([slice(0, { "00280008": [20] }), slice(1), slice(2)])).toMatch(/multiquadro/));
  it("refuses when the memory estimate exceeds the configurable limit", () => {
    expect(reason(stack(100), { maxBytes: 1024 ** 2 })).toMatch(/memória/);
    expect(validateVolumeSeries(stack(100), { maxBytes: 1024 ** 3 }).ok).toBe(true);
  });
});
