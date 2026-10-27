import { useEffect, useRef, useState } from "react";
import { isOverlaySeries, loadOverlayObject, OverlayLayer, type StackView } from "@view/viewer-core";
import type { SeriesSummary } from "@view/dicom-client";
import { DICOMWEB } from "../api";
import "../styles/advanced.css";

const hex = (c: number[]) => "#" + c.map((x) => x.toString(16).padStart(2, "0")).join("");
const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/** Lists the study's SEG/RTSTRUCT series and overlays the chosen one on the given stack viewport. */
export function Overlays({ studyUid, series, stack }: { studyUid: string; series: SeriesSummary[]; stack: StackView | null }) {
  const candidates = series.filter((s) => isOverlaySeries(s.modality));
  const layer = useRef<OverlayLayer | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [state, setState] = useState<Record<number, { on: boolean; color: string }>>({});
  const [alpha, setAlpha] = useState(0.5);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const drop = () => { layer.current?.dispose(); layer.current = null; setActive(null); setState({}); };
  useEffect(() => drop, []); // unmount
  useEffect(() => { drop(); setMsg(null); }, [stack, studyUid]); // another viewport/study: the old labelmap no longer applies

  if (!candidates.length) return null;

  const load = async (s: SeriesSummary) => {
    if (!stack) return setMsg("Abra uma série de imagens primeiro.");
    drop(); setBusy(true); setMsg(null);
    try {
      const obj = await loadOverlayObject(DICOMWEB, studyUid, s.seriesUid, s.modality);
      layer.current = new OverlayLayer(stack, obj);
      setActive(s.seriesUid);
      setState(Object.fromEntries(obj.segments.map((g) => [g.index, { on: true, color: hex(g.color) }])));
      if (layer.current.warnings.length) setMsg(layer.current.warnings.join(" "));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao carregar o objeto.");
    } finally { setBusy(false); }
  };

  const segs = layer.current?.object.segments ?? [];
  return (
    <section className="card" aria-label="Segmentações e contornos">
      <h3>Segmentações / RTSTRUCT</h3>
      <ul className="adv-list">
        {candidates.map((s) => (
          <li key={s.seriesUid} className="adv-row">
            <span className="adv-badge">{s.modality}</span>
            <span>{s.description || `Série ${s.number ?? ""}`}</span>
            {active === s.seriesUid
              ? <button className="btn" onClick={drop}>Ocultar</button>
              : <button className="btn" disabled={busy} onClick={() => load(s)}>{busy ? "Carregando…" : "Mostrar"}</button>}
          </li>
        ))}
      </ul>
      {msg && <p className="adv-note" role="status">{msg}</p>}
      {active && (
        <>
          <label className="adv-row"><span>Opacidade</span>
            <input type="range" min={0} max={1} step={0.05} value={alpha} onChange={(e) => { setAlpha(+e.target.value); layer.current?.setOpacity(+e.target.value); }} />
            <span>{Math.round(alpha * 100)}%</span></label>
          <ul className="adv-list">
            {segs.map((g) => (
              <li key={g.index} className="adv-row">
                <input type="checkbox" aria-label={`Mostrar ${g.label}`} checked={state[g.index]?.on ?? true}
                  onChange={(e) => { layer.current?.setVisible(g.index, e.target.checked); setState((p) => ({ ...p, [g.index]: { on: e.target.checked, color: p[g.index]?.color ?? hex(g.color) } })); }} />
                <span>{g.label}</span>
                <input type="color" aria-label={`Cor de ${g.label}`} value={state[g.index]?.color ?? hex(g.color)}
                  onChange={(e) => { layer.current?.setColor(g.index, rgb(e.target.value)); setState((p) => ({ ...p, [g.index]: { on: p[g.index]?.on ?? true, color: e.target.value } })); }} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
