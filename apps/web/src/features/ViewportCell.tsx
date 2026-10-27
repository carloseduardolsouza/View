import type { SeriesSummary, StudySummary } from "@view/dicom-client";
import { loadSeries, StackView, type ToolSession, type ViewState } from "@view/viewer-core";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { DICOMWEB } from "../api";
import { dicomDate, modalityColor } from "../format";
import { reportDecodeError, reportTiming } from "../telemetry";
import { ScaleRuler } from "./ScaleRuler";

export const SERIES_MIME = "application/x-view-series";
/** A viewport shows one series of any study (so a prior exam can sit beside the current one). */
export interface CellRef { studyUid: string; seriesUid: string }

export interface CellProps {
  index: number;
  active: boolean;
  cell: CellRef | null;
  series: SeriesSummary | undefined;
  /** study that owns the cell's series */
  study: StudySummary;
  /** shown study differs from the one being read: label the cell with its date */
  foreign: boolean;
  patient: string;
  session: ToolSession | null;
  showOverlay: boolean;
  showScale: boolean;
  /** imageId to scroll to once the series is loaded (from the measurement list) */
  jumpTo: string | null;
  onActivate: () => void;
  onDropSeries: (index: number, ref: CellRef) => void;
  onView: (index: number, v: StackView | null) => void;
  onState: (index: number, s: ViewState) => void;
  onLoaded: (studyUid: string, seriesUid: string, ids: string[]) => void;
  onJumped: () => void;
  onFatal: (message: string) => void;
}

export function parseRef(raw: string): CellRef | null {
  try {
    const r = JSON.parse(raw) as Partial<CellRef>;
    return typeof r.studyUid === "string" && typeof r.seriesUid === "string" ? { studyUid: r.studyUid, seriesUid: r.seriesUid } : null;
  } catch { return null; }
}

const serName = (s: SeriesSummary) => s.description || `Série ${s.number ?? "?"}`;

export function ViewportCell(p: CellProps) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<StackView | null>(null);
  const [s, setS] = useState<ViewState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  // callbacks change identity every render; effects must not re-run because of that
  const cb = useRef(p);
  cb.current = p;

  useEffect(() => {
    if (!p.session) return;
    const session = p.session;
    let cancelled = false;
    let created: StackView | null = null;
    let unsub = () => {};
    let unsubErr = () => {};
    StackView.create(host.current!)
      .then((v) => {
        if (cancelled) { v.destroy(); return; }
        created = v;
        session.addView(v);
        unsub = v.subscribe((st) => { setS(st); cb.current.onState(cb.current.index, st); });
        unsubErr = v.onLoadError((msg) => { setError(msg); reportDecodeError(msg); });
        setView(v);
        cb.current.onView(cb.current.index, v);
      })
      .catch((e) => !cancelled && cb.current.onFatal(e instanceof Error ? e.message : "Falha ao iniciar o visualizador."));
    return () => {
      cancelled = true;
      unsub();
      unsubErr();
      if (created) { session.removeView(created); created.destroy(); }
      cb.current.onView(cb.current.index, null);
      setView(null);
    };
  }, [p.session]);

  useEffect(() => {
    if (!view) return;
    if (!p.cell) { setS(null); setError(""); setLoading(false); return; }
    const ac = new AbortController();
    const { studyUid, seriesUid: uid } = p.cell;
    setError("");
    setLoading(true);
    const t0 = performance.now();
    loadSeries(DICOMWEB, studyUid, uid, ac.signal)
      .then(async (ids) => {
        if (ac.signal.aborted) return;
        await view.show(ids);
        reportTiming("time_to_first_image", Math.round(performance.now() - t0));
        cb.current.onLoaded(studyUid, uid, ids);
        const j = cb.current.jumpTo;
        if (j && ids.includes(j)) { view.goTo(ids.indexOf(j)); cb.current.onJumped(); }
        setLoading(false);
      })
      .catch((e) => { if (!ac.signal.aborted) { setError(e instanceof Error ? e.message : "Falha ao carregar a imagem."); setLoading(false); } });
    return () => ac.abort();
  }, [view, p.cell?.seriesUid, p.cell?.studyUid]);

  function onRail(e: PointerEvent<HTMLDivElement>) {
    if (!view || !s || (e.type === "pointermove" && e.buttons !== 1)) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    view.goTo(((e.clientY - r.top) / r.height) * (s.count - 1));
  }

  const ready = !!s && s.count > 0 && !loading;
  const frac = s && s.count > 1 ? s.index / (s.count - 1) : 0;
  const o = s?.orient;
  const mod = p.series?.modality;

  return (
    <div
      className={`vp${p.active ? " active" : ""}${over ? " drop" : ""}${p.foreign ? " foreign" : ""}`}
      onPointerDownCapture={p.onActivate}
      tabIndex={0}
      aria-label={`Viewport ${p.index + 1}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes(SERIES_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(SERIES_MIME);
        setOver(false);
        const ref = parseRef(raw);
        if (ref) { e.preventDefault(); p.onDropSeries(p.index, ref); }
      }}
    >
      <div className="vp-host" ref={host} onContextMenu={(e) => e.preventDefault()} />
      {p.series && (
        <div className="vp-chip" style={{ "--c": modalityColor(mod ?? "") } as CSSProperties}>
          <i /><span>{mod} · {serName(p.series)}{p.foreign && ` · ${dicomDate(p.study.date)}`}</span>
        </div>
      )}
      {ready && p.showOverlay && (
        <>
          <div className="ov tl"><b>{p.patient}</b><br />{p.study.patientId}</div>
          <div className="ov tr">{dicomDate(p.study.date)}<br />{p.study.description}</div>
          <div className="ov bl">
            Im <b>{s.index + 1}</b>/{s.count}
            {s.ww != null && s.wc != null && <><br />J <b>{Math.round(s.ww)}</b> N <b>{Math.round(s.wc)}</b></>}
            <br />Zoom <b>{Math.round(s.zoom * 100)}%</b>
          </div>
          <div className="ov br">{mod}{s.rotation ? <><br />{Math.round(s.rotation)}°</> : null}</div>
          {o && (
            <>
              <span className="ori t">{o.top}</span><span className="ori b">{o.bottom}</span>
              <span className="ori l">{o.left}</span><span className="ori r">{o.right}</span>
            </>
          )}
        </>
      )}
      {ready && p.showScale && <ScaleRuler state={s} />}
      {ready && s.count > 1 && (
        <div className="rail" style={{ "--p": frac } as CSSProperties} onPointerDown={onRail} onPointerMove={onRail} role="slider" aria-label="Imagem" aria-valuemin={1} aria-valuemax={s.count} aria-valuenow={s.index + 1}>
          <i /><b />
        </div>
      )}
      {!p.cell && !error && <div className="vp-msg"><span>Arraste uma série para cá</span></div>}
      {over && <div className="vp-drop" aria-hidden="true">Solte para abrir aqui</div>}
      {loading && !error && <div className="vp-msg"><div className="spinner" /><span>Carregando imagens…</span></div>}
      {error && <div role="alert" className="vp-msg error">{error}</div>}
    </div>
  );
}
