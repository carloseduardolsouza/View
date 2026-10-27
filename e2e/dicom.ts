// Minimal DICOM Part 10 writer (Explicit VR Little Endian) for synthetic phantoms. Only what a single CT slice needs.
const pad = (s: string, ch = " ") => (s.length % 2 ? s + ch : s);
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

function el(group: number, elem: number, vr: string, value: Buffer): Buffer {
  const head = Buffer.concat([u16(group), u16(elem), Buffer.from(vr)]);
  const long = vr === "OW" || vr === "OB" || vr === "UN";
  return Buffer.concat(long ? [head, u16(0), u32(value.length), value] : [head, u16(value.length), value]);
}
const str = (g: number, e: number, vr: string, s: string) => el(g, e, vr, Buffer.from(pad(s, vr === "UI" ? "\0" : " ")));
const us = (g: number, e: number, n: number) => el(g, e, "US", u16(n));

export interface Phantom {
  name: string;
  pixelSpacing?: [number, number];
  size: number; // image is size x size
  square: { x: number; y: number; w: number }; // bright square, in pixels
}

const ROOT = "1.2.826.0.1.3680043.8.498"; // pydicom's public test root; unique suffix below
const uid = (n: number) => `${ROOT}.${Date.now()}.${n}.${Math.floor(Math.random() * 1e6)}`;

export function buildPhantom(p: Phantom): Buffer {
  const sop = uid(1), studyUid = uid(2), seriesUid = uid(3);
  const px = Buffer.alloc(p.size * p.size * 2); // background 0, object 1000
  for (let y = p.square.y; y < p.square.y + p.square.w; y++)
    for (let x = p.square.x; x < p.square.x + p.square.w; x++) px.writeUInt16LE(1000, (y * p.size + x) * 2);
  const meta = Buffer.concat([
    el(2, 1, "OB", Buffer.from([0, 1])),
    str(2, 2, "UI", "1.2.840.10008.5.1.4.1.1.2"),
    str(2, 3, "UI", sop),
    str(2, 0x10, "UI", "1.2.840.10008.1.2.1"),
  ]);
  const data = Buffer.concat([
    str(8, 0x16, "UI", "1.2.840.10008.5.1.4.1.1.2"),
    str(8, 0x18, "UI", sop),
    str(8, 0x20, "DA", "20260101"),
    str(8, 0x50, "SH", "PHANTOM"),
    str(8, 0x60, "CS", "CT"),
    str(0x10, 0x10, "PN", p.name),
    str(0x10, 0x20, "LO", p.name),
    str(0x20, 0x0d, "UI", studyUid),
    str(0x20, 0x0e, "UI", seriesUid),
    str(0x20, 0x10, "SH", "1"),
    str(0x20, 0x11, "IS", "1"),
    str(0x20, 0x13, "IS", "1"),
    us(0x28, 2, 1),
    str(0x28, 4, "CS", "MONOCHROME2"),
    us(0x28, 0x10, p.size),
    us(0x28, 0x11, p.size),
    ...(p.pixelSpacing ? [str(0x28, 0x30, "DS", p.pixelSpacing.join("\\"))] : []),
    us(0x28, 0x100, 16),
    us(0x28, 0x101, 16),
    us(0x28, 0x102, 15),
    us(0x28, 0x103, 0),
    str(0x28, 0x1050, "DS", "500"),
    str(0x28, 0x1051, "DS", "1000"),
    str(0x28, 0x1052, "DS", "0"),
    str(0x28, 0x1053, "DS", "1"),
    el(0x7fe0, 0x10, "OW", px),
  ]);
  return Buffer.concat([Buffer.alloc(128), Buffer.from("DICM"), el(2, 0, "UL", u32(meta.length)), meta, data]);
}
