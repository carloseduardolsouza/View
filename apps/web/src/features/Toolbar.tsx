import type { ToolId } from "@view/viewer-core";
import type { ReactNode } from "react";
import { useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { Popover } from "../ui/Popover";
import { keyLabel, type Keymap } from "../lib/keymap";

interface ToolDef { id: ToolId; icon: IconName; label: string }

const NAV: ToolDef[] = [
  { id: "scroll", icon: "scroll", label: "Rolar cortes" },
  { id: "windowLevel", icon: "wl", label: "Janela / nível" },
  { id: "zoom", icon: "zoom", label: "Zoom" },
  { id: "pan", icon: "pan", label: "Mover" },
  { id: "magnify", icon: "magnify", label: "Lupa" },
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

interface Item { id: string; icon: IconName; label: string; tip: string; run: () => void; on?: boolean }

/** Primary button + dropdown with the sibling options; the main button shows the active (or last picked) one. */
function Split({ name, items }: { name: string; items: Item[] }) {
  const [last, setLast] = useState(items[0]!.id);
  const main = items.find((i) => i.on) ?? items.find((i) => i.id === last) ?? items[0]!;
  const pick = (i: Item) => { setLast(i.id); i.run(); };
  return (
    <div className="split">
      <button className={`tool${items.some((i) => i.on) ? " on" : ""}`} title={main.tip} aria-label={main.label} aria-pressed={main.on} onClick={() => pick(main)}><Icon name={main.icon} /></button>
      <Popover label={`Mais opções: ${name}`}>
        {(close) => items.map((i) => (
          <button key={i.id} role="menuitem" className={`pop-item${i.on ? " on" : ""}`} title={i.tip} aria-label={i.label} onClick={() => { pick(i); close(); }}>
            <Icon name={i.icon} size={16} /><span>{i.label}</span>
          </button>
        ))}
      </Popover>
    </div>
  );
}

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

/** Rendered inside the Topbar. */
export function Toolbar(p: ToolbarProps) {
  const tip = (label: string, cmd: string) => `${label} (${keyLabel(p.keymap[cmd] ?? "")})`;
  const toolItem = (t: ToolDef): Item => ({ id: t.id, icon: t.icon, label: t.label, tip: tip(t.label, `tool.${t.id}`), on: p.tool === t.id, run: () => p.onTool(t.id) });
  const cmdItem = (id: string, icon: IconName, label: string): Item => ({ id, icon, label, tip: tip(label, id), run: () => p.onCommand(id) });
  const act = (icon: IconName, label: string, cmd: string, on = false) => (
    <button className={`tool${on ? " on" : ""}`} title={tip(label, cmd)} aria-label={label} onClick={() => p.onCommand(cmd)}><Icon name={icon} /></button>
  );
  const layouts: Item[] = ([[1, "l1"], [2, "l2"], [4, "l4"]] as const).map(([n, icon]) => ({
    id: `layout.${n}`, icon, label: `Layout com ${n} imagem${n > 1 ? "s" : ""}`, tip: tip(`Layout ${n}`, `layout.${n}`), on: p.layout === n, run: () => p.onLayout(n),
  }));
  return (
    <div className="tbar" role="toolbar" aria-label="Ferramentas">
      <div className="grp"><Split name="navegação" items={NAV.map(toolItem)} /></div>
      <div className="grp"><Split name="medidas" items={MEASURE.map(toolItem)} /></div>
      <div className="grp">
        <Split name="girar e espelhar" items={[
          cmdItem("view.rotateRight", "rotR", "Girar à direita"),
          cmdItem("view.rotateLeft", "rotL", "Girar à esquerda"),
          cmdItem("view.flipH", "flipH", "Espelhar na horizontal"),
          cmdItem("view.flipV", "flipV", "Espelhar na vertical"),
        ]} />
        {act("inv", "Inverter tons", "view.invert", p.invertOn)}
        {act("reset", "Restaurar imagem", "view.reset")}
      </div>
      <div className="grp"><Split name="layout" items={layouts} /></div>
      {p.extra}
      <div className="grp">{act("keys", "Atalhos de teclado", "app.shortcuts")}</div>
    </div>
  );
}
