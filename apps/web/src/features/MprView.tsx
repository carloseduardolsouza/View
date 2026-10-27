import type { StudySummary } from "@view/dicom-client";
import {
  CT_PRESETS, MprSession, VR_PRESETS, type Cam3d, type MprState, type MprTool, type PlaneId, type SlabMode, type VolumeInfo,
} from "@view/viewer-core";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DICOMWEB } from "../api";
import { personName } from "../format";
import { Icon } from "../ui/Icon";
import { Topbar } from "./Topbar";
import "../styles/mpr.css";

type Layout = "quad" | PlaneId | "vr";
const PLANES: Array<{ id: PlaneId; label: string; color: string }> = [
  { id: "axial", label: "Axial", color: "#ff7a7a" },
  { id: "sagittal", label: "Sagital", color: "#ffd24a" },
  { id: "coronal", label: "Coronal", color: "#5fe08e" },
];
const CELLS = [...PLANES, { id: "vr" as const, label: "3D", color: "#62e0ff" }];
const TOOLS: Array<[MprTool, string]> = [["crosshairs", "Cruz"], ["windowLevel", "Janela"], ["zoom", "Zoom"], ["pan", "Mover"]];
const SLABS: Array<[SlabMode, string]> = [["none", "Nenhum"], ["mip", "MIP"], ["minip", "MinIP"], ["avg", "Média"]];
const CAMS: Array<[Cam3d, string]> = [["anterior", "Anterior"], ["posterior", "Posterior"], ["left", "Esquerda"], ["right", "Direita"], ["superior", "Superior"], ["inferior", "Inferior"]];

export function MprView({ study, seriesUid, onClose }: { study: StudySummary; seriesUid: string; onClose: () => void }) {
  const refs = { axial: useRef<HTMLDivElement>(null), coronal: useRef<HTMLDivElement>(null), sagittal: useRef<HTMLDivElement>(null), vr: useRef<HTMLDivElement>(null) };
  const session = useRef<MprSession | null>(null);
  const [state, setState] = useState<MprState | null>(null);
  const [info, setInfo] = useState<VolumeInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<Layout>("quad");
  const [tool, setTool] = useState<MprTool>("crosshairs");
  const [slab, setSlab] = useState<SlabMode>("none");
  const [thick, setThick] = useState(10);
  const [vrPreset, setVrPreset] = useState<string>(VR_PRESETS[0].id);
  const [spin, setSpin] = useState(false);
  const [views, setViews] = useState<Array<{ name: string; cam: ReturnType<MprSession["getCamera3d"]> }>>([]);

  useEffect(() => {
    const ac = new AbortController();
    let mine: MprSession | null = null;
    const els = { axial: refs.axial.current!, coronal: refs.coronal.current!, sagittal: refs.sagittal.current!, vr: refs.vr.current! };
    (async () => {
      mine = await MprSession.create(els, ac.signal);
      session.current = mine;
      mine.subscribe(setState);
      const v = await mine.load(DICOMWEB, study.studyUid, seriesUid, setProgress);
      setInfo(v);
    })().catch((e: unknown) => {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Falha ao montar o volume.");
    });
    return () => {
      ac.abort();
      mine?.destroy();
      session.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable; the volume is rebuilt only for another series
  }, [study.studyUid, seriesUid]);

  const s = session.current;
  const ready = !!info;
  const pickSlab = (m: SlabMode) => { setSlab(m); s?.setSlab(m, thick); };
  const toggleSpin = () => { const on = !spin; setSpin(on); s?.spin(on ? 30 : 0); };

  return (
    <div className="app">
      <Topbar chip={<div className="study-chip"><i /><span>{personName(study.patientName)}</span><em>MPR / 3D</em></div>}>
        <div className="seg" role="group" aria-label="Layout">
          <button className={layout === "quad" ? "on" : ""} onClick={() => setLayout("quad")} aria-pressed={layout === "quad"} title="3 planos + 3D"><Icon name="l4" size={16} /></button>
          {CELLS.map((c) => (
            <button key={c.id} className={layout === c.id ? "on" : ""} onClick={() => setLayout(c.id)} aria-pressed={layout === c.id}>{c.label}</button>
          ))}
        </div>
        <button className="btn" onClick={onClose}><Icon name="out" size={16} />Fechar MPR</button>
      </Topbar>
      <div className="mpr-main">
        <div className="mpr-stage">
          <div className="mpr-grid" data-l={layout}>
            {CELLS.map((c) => {
              const st = c.id === "vr" ? null : state?.planes[c.id];
              return (
                <div key={c.id} className={`vp ${c.id === "vr" ? "vr" : ""}`} data-off={layout !== "quad" && layout !== c.id} style={{ "--c": c.color } as CSSProperties} onContextMenu={(e) => e.preventDefault()}>
                  <div className="vp-host" ref={refs[c.id]} aria-label={c.label} />
                  <span className="vp-tag">{c.label}</span>
                  <button className="vp-max" title={layout === c.id ? "Mostrar todos" : "Maximizar"} aria-label={layout === c.id ? "Mostrar todos" : `Maximizar ${c.label}`} onClick={() => setLayout(layout === c.id ? "quad" : c.id)}><Icon name="full" size={14} /></button>
                  {st?.orient && ready && (<>
                    <span className="ori t">{st.orient.top}</span><span className="ori b">{st.orient.bottom}</span>
                    <span className="ori l">{st.orient.left}</span><span className="ori r">{st.orient.right}</span>
                    {st.slices > 0 && <div className="ov bl">Corte <b>{st.slice + 1}</b> / {st.slices}</div>}
                  </>)}
                </div>
              );
            })}
          </div>
          {!ready && (
            <div className={`mpr-load ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
              {error ? (<>
                <strong>Não foi possível abrir o MPR</strong>
                <span style={{ maxWidth: "56ch" }}>{error}</span>
                <button className="btn" onClick={onClose}>Voltar ao visualizador</button>
              </>) : (<>
                <span>Montando volume… {Math.round(progress * 100)}%</span>
                <div className="mpr-bar"><i style={{ width: `${progress * 100}%` }} /></div>
              </>)}
            </div>
          )}
        </div>

        <aside className="mpr-side">
          <section className="card pane" style={{ "--i": 0 } as CSSProperties}>
            <div className="sec"><h3>Botão esquerdo</h3>
              <div className="seg" role="group">
                {TOOLS.map(([id, label]) => <button key={id} className={tool === id ? "on" : ""} disabled={!ready} onClick={() => { setTool(id); s?.setTool(id); }}>{label}</button>)}
              </div>
              <p className="mpr-note">Cruz: arraste o centro para mover; arraste as linhas para girar o plano (MPR oblíquo). Roda rola o corte; botão direito dá zoom; central move.</p>
            </div>
            <div className="sec"><h3>Janela</h3>
              <div className="chips-row">
                {CT_PRESETS.map((p) => <button key={p.id} className="chip pill" disabled={!ready} onClick={() => s?.setWindow(p.ww, p.wc)}>{p.label}</button>)}
              </div>
              <div className="mono">{state?.ww != null ? `W ${Math.round(state.ww)}  L ${Math.round(state.wc!)}` : "—"}</div>
            </div>
            <div className="sec"><h3>Projeção (espessura)</h3>
              <div className="seg" role="group">
                {SLABS.map(([m, label]) => <button key={m} className={slab === m ? "on" : ""} disabled={!ready} onClick={() => pickSlab(m)}>{label}</button>)}
              </div>
              <label className="slide"><span className="lbl">Espessura</span>
                <input type="range" min={1} max={80} value={thick} disabled={!ready || slab === "none"} onChange={(e) => { const t = +e.target.value; setThick(t); s?.setSlab(slab, t); }} />
                <output>{thick} mm</output>
              </label>
            </div>
            <button className="btn" disabled={!ready} onClick={() => { setSlab("none"); setTool("crosshairs"); s?.setTool("crosshairs"); s?.setSlab("none", thick); s?.resetPlanes(); }}><Icon name="reset" size={16} />Reiniciar planos</button>
          </section>

          <section className="card pane" style={{ "--i": 1 } as CSSProperties}>
            <div className="sec"><h3>Volume 3D</h3>
              <div className="chips-row">
                {VR_PRESETS.map((p) => <button key={p.id} className={`chip pill ${vrPreset === p.id ? "on" : ""}`} disabled={!ready} onClick={() => { setVrPreset(p.id); s?.setVrPreset(p.id); }}>{p.label}</button>)}
              </div>
            </div>
            <div className="sec"><h3>Vistas</h3>
              <div className="chips-row">
                {CAMS.map(([id, label]) => <button key={id} className="chip pill" disabled={!ready} onClick={() => s?.setCamera3d(id)}>{label}</button>)}
              </div>
              <div className="row">
                <button className="btn" disabled={!ready} onClick={toggleSpin}><Icon name={spin ? "pause" : "play"} size={14} />{spin ? "Parar giro" : "Girar"}</button>
                <button className="btn" disabled={!ready} onClick={() => { s?.resetCamera3d(); }}><Icon name="reset" size={14} />Câmera</button>
              </div>
              <div className="row">
                <button className="btn" disabled={!ready || views.length >= 4} onClick={() => s && setViews([...views, { name: `Vista ${views.length + 1}`, cam: s.getCamera3d() }])}>Salvar vista</button>
              </div>
              {views.length > 0 && <div className="chips-row">{views.map((v) => <button key={v.name} className="chip pill" onClick={() => s?.restoreCamera3d(v.cam)}>{v.name}</button>)}</div>}
              <p className="mpr-note">Arraste para girar; roda ou botão direito dá zoom; central move.</p>
            </div>
          </section>

          {info && (
            <div className="mpr-info">
              {info.columns}×{info.rows}×{info.slices} · {info.spacing.map((v) => v.toFixed(2)).join("×")} mm<br />
              ~{Math.round(info.estimatedBytes / 1024 ** 2)} MB · montado em {(info.loadMs / 1000).toFixed(1)} s
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
