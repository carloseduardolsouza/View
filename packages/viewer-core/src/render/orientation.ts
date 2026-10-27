// Patient orientation letters from DICOM direction cosines (LPS: +x = Left, +y = Posterior, +z = Superior).
type V3 = readonly [number, number, number];
export interface Orient { top: string; right: string; bottom: string; left: string }

const AXES = [["L", "R"], ["P", "A"], ["S", "I"]] as const;
const OPP: Record<string, string> = { L: "R", R: "L", P: "A", A: "P", S: "I", I: "S" };

function dominant(v: V3): string {
  const i = v.map(Math.abs).indexOf(Math.max(...v.map(Math.abs)));
  return AXES[i]![v[i]! >= 0 ? 0 : 1];
}

/** Letters shown at each image edge. Rotation is clockwise degrees (multiples of 90); flips are applied before rotation. */
export function orientation(row: V3, col: V3, rotation = 0, flipH = false, flipV = false): Orient {
  const right = dominant(row);
  const bottom = dominant(col);
  let o: Orient = { top: OPP[bottom]!, right, bottom, left: OPP[right]! };
  if (flipH) o = { ...o, left: o.right, right: o.left };
  if (flipV) o = { ...o, top: o.bottom, bottom: o.top };
  for (let k = (((Math.round(rotation / 90) % 4) + 4) % 4); k > 0; k--) {
    o = { top: o.left, right: o.top, bottom: o.right, left: o.bottom };
  }
  return o;
}
