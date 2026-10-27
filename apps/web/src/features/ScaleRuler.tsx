import { niceScale, type ViewState } from "@view/viewer-core";
import "../styles/scale-ruler.css";

/** Scale bar for one viewport. Mount inside the (position: relative) viewport cell; never claims mm without spacing. */
export function ScaleRuler({ state }: { state: Pick<ViewState, "spacing" | "pxPerMm"> }) {
  const { spacing, pxPerMm } = state;
  if (!spacing || !pxPerMm) return <div className="scale-ruler" role="note"><span className="hint">Sem escala: espaçamento de pixel ausente</span></div>;
  const s = niceScale(pxPerMm);
  if (!s) return null; // zoomed so far in/out that no round length fits
  const proj = spacing.kind === "proj";
  return (
    <div className="scale-ruler" role="img" aria-label={`Escala: ${s.label}${proj ? " (aproximada)" : ""}`} title={proj ? "Calibrado pelo detector (ImagerPixelSpacing): medida projetada, sem correção de magnificação." : undefined}>
      <svg width={s.px + 2} height={8}>
        <line x1={1} y1={4} x2={s.px + 1} y2={4} />
        <line x1={1} y1={0} x2={1} y2={8} />
        <line x1={s.px + 1} y1={0} x2={s.px + 1} y2={8} />
      </svg>
      <span>{proj ? "≈ " : ""}{s.label}{proj ? " (proj.)" : ""}</span>
    </div>
  );
}
