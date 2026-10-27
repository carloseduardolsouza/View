import type { ViewState, WindowPreset } from "@view/viewer-core";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../ui/Icon";

export interface MeasureItem {
  uid: string;
  tool: string;
  title: string;
  value: string;
  calibrated: boolean;
  /** "Im 12" when the slice is known */
  where: string | null;
  author: string | null;
  authorId: string | null;
  at: string | null;
}

export type SaveStatus = "idle" | "saving" | "error";

export interface InspectorProps {
  state: ViewState | null;
  presets: WindowPreset[];
  onPreset: (p: WindowPreset) => void;
  onDefaultWindow: () => void;
  onWindow: (ww: number, wc: number) => void;
  onInvert: () => void;
  showOverlay: boolean;
  onOverlay: (v: boolean) => void;
  items: MeasureItem[];
  saveStatus: SaveStatus;
  onJump: (it: MeasureItem) => void;
  onDelete: (it: MeasureItem) => void;
  onExport: () => void;
  /** extension point: extra tabs (e.g. SR export, MPR) appended after "Medidas" */
  extraTabs?: { id: string; label: string; content: ReactNode }[];
}

const range = (v: number, min: number, max: number) => `${((v - min) / (max - min)) * 100}%`;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const STATUS: Record<SaveStatus, string> = { idle: "Salvo", saving: "Salvando…", error: "Erro ao salvar" };

export function Inspector(p: InspectorProps) {
  const [tab, setTab] = useState<string>("adj");
  const s = p.state;
  const ww = s?.ww != null ? clamp(Math.round(s.ww), 1, 4000) : 400;
  const wc = s?.wc != null ? clamp(Math.round(s.wc), -1100, 3000) : 40;
  const disabled = !s || s.count === 0;

  return (
    <aside className="side right">
      <section className="card" style={{ "--i": 2 } as CSSProperties}>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "adj"} className={tab === "adj" ? "on" : ""} onClick={() => setTab("adj")}>Ajustes</button>
          <button role="tab" aria-selected={tab === "med"} className={tab === "med" ? "on" : ""} onClick={() => setTab("med")}>
            Medidas{p.items.length > 0 && <span className="count">{p.items.length}</span>}
          </button>
          {p.extraTabs?.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === "adj" && (
          <div className="pane">
            <div className="sec">
              <div className="row between"><h3>Janelamento</h3><span className="mono">{s?.ww != null ? `J ${Math.round(s.ww)} · N ${Math.round(s.wc ?? 0)}` : "—"}</span></div>
              <div className="chips-row">
                <button className="chip pill" disabled={disabled} onClick={p.onDefaultWindow}>Padrão</button>
                {p.presets.map((pr) => (
                  <button key={pr.id} className="chip pill" disabled={disabled} onClick={() => p.onPreset(pr)}>{pr.label}</button>
                ))}
              </div>
              <div className="slide">
                <span className="lbl">Largura</span>
                <input type="range" min={1} max={4000} value={ww} disabled={disabled} aria-label="Largura da janela" style={{ "--f": range(ww, 1, 4000) } as CSSProperties} onChange={(e) => p.onWindow(Number(e.target.value), wc)} />
                <output>{ww}</output>
              </div>
              <div className="slide">
                <span className="lbl">Centro</span>
                <input type="range" min={-1100} max={3000} value={wc} disabled={disabled} aria-label="Centro da janela" style={{ "--f": range(wc, -1100, 3000) } as CSSProperties} onChange={(e) => p.onWindow(ww, Number(e.target.value))} />
                <output>{wc}</output>
              </div>
            </div>
            <div className="sec">
              <h3>Exibição</h3>
              <label className="tg">Inverter tons<input type="checkbox" checked={!!s?.invert} disabled={disabled} onChange={p.onInvert} /><i /></label>
              <label className="tg">Informações nos cantos<input type="checkbox" checked={p.showOverlay} onChange={(e) => p.onOverlay(e.target.checked)} /><i /></label>
            </div>
          </div>
        )}

        {p.extraTabs?.find((t) => t.id === tab)?.content}

        {tab === "med" && (
          <div className="pane">
            <div className="row between">
              <h3>Medidas</h3>
              <span className={`save ${p.saveStatus}`} role="status">{STATUS[p.saveStatus]}</span>
            </div>
            {p.items.length === 0 ? (
              <div className="empty-s">Escolha uma ferramenta de medição e desenhe sobre a imagem. As medidas ficam salvas no estudo.</div>
            ) : (
              <div className="list">
                {p.items.map((it) => (
                  <div key={it.uid} className="item" role="button" tabIndex={0} onClick={() => p.onJump(it)} onKeyDown={(e) => e.key === "Enter" && p.onJump(it)}>
                    <div>
                      <b>{it.value}</b>
                      <small>{it.title}{it.where ? ` · ${it.where}` : ""}</small>
                      {!it.calibrated && <small className="warn">sem calibração (px)</small>}
                      {it.author && <small>{it.author}</small>}
                    </div>
                    <button title="Excluir medida" aria-label={`Excluir ${it.title}`} onClick={(e) => { e.stopPropagation(); p.onDelete(it); }}><Icon name="trash" size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn" disabled={p.items.length === 0} onClick={p.onExport}><Icon name="download" size={16} />Exportar JSON</button>
          </div>
        )}
      </section>
    </aside>
  );
}
