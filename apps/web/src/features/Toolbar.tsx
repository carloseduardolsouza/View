import type { ToolId } from "@view/viewer-core";
import type { ReactNode } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { keyLabel, type Keymap } from "../lib/keymap";

interface ToolDef { id: ToolId; icon: IconName; label: string }

const NAV: ToolDef[] = [
  { id: "scroll", icon: "scroll", label: "Rolar cortes" },
  { id: "windowLevel", icon: "wl", label: "Janela / nível" },
  { id: "zoom", icon: "zoom", label: "Zoom" },
  { id: "pan", icon: "pan", label: "Mover" },
];
const MEASURE: ToolDef[] = [
  { id: "length", icon: "len", label: "Comprimento" },
  { id: "angle", icon: "ang", label: "Ângulo" },
  { id: "cobb", icon: "cobb", label: "Ângulo de Cobb" },
  { id: "rect", icon: "rect", label: "Retângulo (ROI)" },
  { id: "ellipse", icon: "roi", label: "Elipse (ROI)" },
  { id: "freehand", icon: "free", label: "Mão livre" },
  { id: "arrow", icon: "arrow", label: "Seta com texto" },
  { id: "label", icon: "text", label: "Texto" },
];

export interface ToolbarProps {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  keymap: Keymap;
  layout: 1 | 2 | 4;
  onLayout: (n: 1 | 2 | 4) => void;
  invertOn: boolean;
  onCommand: (id: string) => void;
  /** extension point: extra button groups (comparison, undo/redo, snapshot, MPR...) rendered before the shortcuts button */
  extra?: ReactNode;
}

export function Toolbar(p: ToolbarProps) {
  const tip = (label: string, cmd: string) => `${label} (${keyLabel(p.keymap[cmd] ?? "")})`;
  const toolBtn = (t: ToolDef) => (
    <button key={t.id} className={`tool${p.tool === t.id ? " on" : ""}`} title={tip(t.label, `tool.${t.id}`)} aria-label={t.label} aria-pressed={p.tool === t.id} onClick={() => p.onTool(t.id)}>
      <Icon name={t.icon} />
    </button>
  );
  const act = (icon: IconName, label: string, cmd: string, on = false) => (
    <button className={`tool${on ? " on" : ""}`} title={tip(label, cmd)} aria-label={label} onClick={() => p.onCommand(cmd)}><Icon name={icon} /></button>
  );
  return (
    <div className="card toolbar" role="toolbar" aria-label="Ferramentas">
      <div className="grp">{NAV.map(toolBtn)}</div>
      <div className="grp">{MEASURE.map(toolBtn)}</div>
      <div className="grp">
        {act("rotL", "Girar à esquerda", "view.rotateLeft")}
        {act("rotR", "Girar à direita", "view.rotateRight")}
        {act("flipH", "Espelhar na horizontal", "view.flipH")}
        {act("flipV", "Espelhar na vertical", "view.flipV")}
        {act("inv", "Inverter tons", "view.invert", p.invertOn)}
        {act("reset", "Restaurar imagem", "view.reset")}
      </div>
      <div className="grp">
        <div className="seg" role="group" aria-label="Layout">
          {([[1, "l1"], [2, "l2"], [4, "l4"]] as const).map(([n, icon]) => (
            <button key={n} className={p.layout === n ? "on" : ""} title={tip(`Layout ${n}`, `layout.${n}`)} aria-label={`Layout com ${n} imagem${n > 1 ? "s" : ""}`} aria-pressed={p.layout === n} onClick={() => p.onLayout(n)}>
              <Icon name={icon} size={16} />
            </button>
          ))}
        </div>
      </div>
      {p.extra}
      <div className="grp">{act("keys", "Atalhos de teclado", "app.shortcuts")}</div>
    </div>
  );
}
