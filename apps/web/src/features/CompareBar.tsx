import type { Compat, SyncSettings } from "@view/viewer-core";
import { keyLabel, type Keymap } from "../lib/keymap";
import type { ReactNode } from "react";
import "../styles/compare.css";

export interface CompareInfo {
  /** why position-based scroll cannot link the active viewport with another one (null: fine, or nothing to compare) */
  scrollIssue: string | null;
  /** can reference lines be drawn (active viewport crosses some other one)? */
  refs: Compat;
}

interface Props { sync: SyncSettings; refLines: boolean; info: CompareInfo; keymap: Keymap; onCommand: (id: string) => void }

/** Toolbar group; goes in Toolbar's `extra` slot. */
export function CompareBar({ sync, refLines, info, keymap, onCommand }: Props) {
  const btn = (cmd: string, text: string, label: string, on: boolean, dim = false, why = "") => (
    <button key={cmd} className={`chip pill${on ? " on" : ""}${dim ? " dim" : ""}`} aria-pressed={on} aria-disabled={dim || undefined}
      title={`${label} (${keyLabel(keymap[cmd] ?? "")})${why ? `: ${why}` : ""}`} onClick={() => onCommand(cmd)}>{text}</button>
  );
  return (
    <div className="grp" role="group" aria-label="Comparação">
      <span className="lbl">Sincronizar</span>
      {btn("sync.scroll", "Rolagem", "Sincronizar rolagem", sync.scroll)}
      {btn("sync.zoomPan", "Zoom", "Sincronizar zoom e posição", sync.zoomPan)}
      {btn("sync.wl", "J/N", "Sincronizar janela e nível", sync.wl)}
      {btn("sync.auto", "Auto", "Sincronização automática (só séries compatíveis)", sync.auto)}
      {btn("view.refLines", "Linhas", "Linhas de referência", refLines && info.refs.ok, !info.refs.ok, info.refs.ok ? "" : info.refs.reason)}
      <button className="chip pill" title={`Abrir exame anterior (${keyLabel(keymap["study.prior"] ?? "")})`} onClick={() => onCommand("study.prior")}>Anterior</button>
      <button className="chip pill" title={`Protocolos de exibição (${keyLabel(keymap["protocol.manage"] ?? "")})`} onClick={() => onCommand("protocol.manage")}>Protocolos</button>
    </div>
  );
}

/** Explains, under the toolbar, why a synchronisation or reference-line request is not in effect. */
export function CompareNote({ sync, refLines, info, onSync }: { sync: SyncSettings; refLines: boolean; info: CompareInfo; onSync: (p: Partial<SyncSettings>) => void }) {
  const scrollOn = sync.scroll || sync.auto;
  const lines: ReactNode[] = [];
  if (scrollOn && info.scrollIssue) {
    lines.push(
      <span key="s"><span className="warn">Geometrias incompatíveis ({info.scrollIssue}):</span> a rolagem não é sincronizada por posição.</span>,
    );
    if (sync.scroll && !sync.auto)
      lines.push(<button key="i" className={`chip pill${sync.indexFallback ? " on" : ""}`} aria-pressed={sync.indexFallback} onClick={() => onSync({ indexFallback: !sync.indexFallback })}>Sincronizar por índice do corte</button>);
  }
  if (refLines && !info.refs.ok) lines.push(<span key="r"><span className="warn">Linhas de referência indisponíveis:</span> {info.refs.reason}.</span>);
  return lines.length ? <div className="cmp-note" role="status">{lines}</div> : null;
}
