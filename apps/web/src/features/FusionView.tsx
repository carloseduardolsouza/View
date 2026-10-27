import { useEffect, useRef, useState } from "react";
import { FusionSession, PET_COLORMAPS } from "@view/viewer-core";
import type { StudySummary } from "@view/dicom-client";
import { DICOMWEB } from "../api";
import "../styles/advanced.css";

/** Full-screen PET/CT fusion. Replaces the stack viewer while open: the parent must unmount it first (one GL engine at a time). */
export function FusionView({ study, ctSeriesUid, ptSeriesUid, onClose }: { study: StudySummary; ctSeriesUid: string; ptSeriesUid: string; onClose: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const session = useRef<FusionSession | null>(null);
  const [opacity, setOpacity] = useState(0.5);
  const [cmap, setCmap] = useState<string>(PET_COLORMAPS[0].id);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ac = new AbortController(); // StrictMode mounts twice: the stale run must not keep an engine
    let mine: FusionSession | null = null;
    (async () => {
      try {
        mine = await FusionSession.create(el.current!, ac.signal);
        session.current = mine;
        const w = await mine.load(DICOMWEB, study.studyUid, ctSeriesUid, ptSeriesUid, setProgress);
        if (!ac.signal.aborted) { setWarnings(w); setReady(true); }
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Falha na fusão.");
      }
    })();
    return () => { ac.abort(); mine?.destroy(); session.current = null; };
  }, [study.studyUid, ctSeriesUid, ptSeriesUid]);

  return (
    <div className="adv-fusion" role="dialog" aria-label="Fusão PET/CT">
      <div className="adv-fusion-bar card">
        <strong>Fusão PET/CT</strong>
        <label>Opacidade do PET{" "}
          <input type="range" min={0} max={1} step={0.05} value={opacity} disabled={!ready}
            onChange={(e) => { setOpacity(+e.target.value); session.current?.setOpacity(+e.target.value); }} />
        </label>
        <label>Cores{" "}
          <select value={cmap} disabled={!ready} onChange={(e) => { setCmap(e.target.value); session.current?.setColormap(e.target.value); }}>
            {PET_COLORMAPS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        {!ready && !error && <span className="adv-note">Carregando {Math.round(progress * 100)}%</span>}
        <button className="btn" onClick={onClose}>Fechar</button>
      </div>
      {error && <p className="adv-warn" role="alert">{error}</p>}
      {warnings.map((w) => <p key={w} className="adv-note">{w}</p>)}
      <div ref={el} className="adv-fusion-view" />
    </div>
  );
}
