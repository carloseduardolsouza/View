// PNG export of a viewport: Cornerstone's canvas + its SVG annotation layer (+ optional corner text) at device resolution.
import type { StackView } from "./cornerstone-adapter";

export type OverlayText = Partial<Record<"tl" | "tr" | "bl" | "br", string[]>>;

export interface SnapshotOptions {
  withAnnotations: boolean;
  withOverlay: boolean;
  /** corner texts to burn in when withOverlay (the web overlay is HTML, so the caller supplies the lines) */
  overlay?: OverlayText;
}

type Surface = { width: number; height: number };
type Ctx = Pick<CanvasRenderingContext2D, "drawImage" | "fillText" | "fillStyle" | "font" | "textAlign" | "textBaseline" | "shadowColor" | "shadowBlur">;
interface Target extends Surface { getContext(id: "2d"): Ctx | null }

/** Draws base, then the annotation image scaled to the same size, then the corner texts. Pure over its inputs: testable with fakes. */
export function compose(make: (w: number, h: number) => Target, base: CanvasImageSource & Surface, svg: CanvasImageSource | null, overlay: OverlayText | null, cssWidth: number): Target {
  const out = make(base.width, base.height);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível para exportar a imagem.");
  ctx.drawImage(base, 0, 0);
  if (svg) ctx.drawImage(svg, 0, 0, out.width, out.height);
  if (overlay) {
    const k = cssWidth > 0 ? out.width / cssWidth : 1; // device pixels per CSS pixel
    const px = 12 * k;
    ctx.font = `${px}px system-ui, sans-serif`;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3 * k;
    const pad = 8 * k;
    const put = (lines: string[] | undefined, right: boolean, bottom: boolean) => {
      if (!lines?.length) return;
      ctx.textAlign = right ? "right" : "left";
      ctx.textBaseline = bottom ? "bottom" : "top";
      lines.forEach((t, i) => {
        const row = bottom ? lines.length - 1 - i : i;
        ctx.fillText(t, right ? out.width - pad : pad, bottom ? out.height - pad - row * px * 1.3 : pad + row * px * 1.3);
      });
    };
    put(overlay.tl, false, false); put(overlay.tr, true, false); put(overlay.bl, false, true); put(overlay.br, true, true);
  }
  return out;
}

/** Rasterises the SVG layer at the canvas' pixel size (inline styles are kept by the serializer; external CSS is not). */
async function svgImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `0 0 ${svg.clientWidth || w} ${svg.clientHeight || h}`);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportSnapshot(view: StackView, opts: SnapshotOptions): Promise<Blob> {
  const el = view.currentElement;
  view.render(); // make sure the canvas holds the current frame
  const canvas = el.querySelector("canvas");
  if (!canvas || canvas.width === 0) throw new Error("Não há imagem para exportar.");
  const svg = opts.withAnnotations ? el.querySelector<SVGSVGElement>("svg.svg-layer") : null;
  const img = svg ? await svgImage(svg, canvas.width, canvas.height) : null;
  const out = compose((w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h }), canvas, img, opts.withOverlay ? opts.overlay ?? {} : null, el.clientWidth) as HTMLCanvasElement;
  return new Promise((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar o PNG."))), "image/png"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
