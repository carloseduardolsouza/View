export interface Command { id: string; label: string; group: "Ferramentas" | "Imagem" | "Navegação" | "Layout" | "Comparação" | "Geral"; key: string }

// Defaults; the user's overrides (command id -> key) are stored in the API as preferences.
export const COMMANDS: Command[] = [
  { id: "tool.scroll", label: "Rolar cortes", group: "Ferramentas", key: "s" },
  { id: "tool.windowLevel", label: "Janela / nível", group: "Ferramentas", key: "w" },
  { id: "tool.zoom", label: "Zoom", group: "Ferramentas", key: "z" },
  { id: "tool.pan", label: "Mover", group: "Ferramentas", key: "p" },
  { id: "tool.length", label: "Comprimento", group: "Ferramentas", key: "l" },
  { id: "tool.angle", label: "Ângulo", group: "Ferramentas", key: "a" },
  { id: "tool.cobb", label: "Ângulo de Cobb", group: "Ferramentas", key: "b" },
  { id: "tool.rect", label: "Retângulo (ROI)", group: "Ferramentas", key: "r" },
  { id: "tool.ellipse", label: "Elipse (ROI)", group: "Ferramentas", key: "e" },
  { id: "tool.freehand", label: "Mão livre", group: "Ferramentas", key: "h" },
  { id: "tool.arrow", label: "Seta com texto", group: "Ferramentas", key: "t" },
  { id: "tool.label", label: "Texto", group: "Ferramentas", key: "x" },
  { id: "tool.magnify", label: "Lupa", group: "Ferramentas", key: "7" },
  { id: "view.probe", label: "Sonda de valor (HU)", group: "Imagem", key: "8" },
  { id: "view.annotations", label: "Mostrar/ocultar medidas", group: "Imagem", key: "6" },
  { id: "view.tags", label: "Tags DICOM da imagem", group: "Imagem", key: "ctrl+i" },
  { id: "view.maximize", label: "Maximizar / restaurar imagem ativa", group: "Layout", key: "5" },
  { id: "view.rotateLeft", label: "Girar à esquerda", group: "Imagem", key: "[" },
  { id: "view.rotateRight", label: "Girar à direita", group: "Imagem", key: "]" },
  { id: "view.flipH", label: "Espelhar na horizontal", group: "Imagem", key: "m" },
  { id: "view.flipV", label: "Espelhar na vertical", group: "Imagem", key: "n" },
  { id: "view.invert", label: "Inverter tons", group: "Imagem", key: "i" },
  { id: "view.snapshot", label: "Capturar imagem", group: "Imagem", key: "q" },
  { id: "view.scale", label: "Mostrar/ocultar régua de escala", group: "Imagem", key: "u" },
  { id: "edit.undo", label: "Desfazer medida", group: "Geral", key: "ctrl+z" },
  { id: "edit.redo", label: "Refazer medida", group: "Geral", key: "ctrl+y" },
  { id: "study.mpr", label: "Abrir MPR / 3D", group: "Geral", key: "3" },
  { id: "view.fit", label: "Ajustar à janela", group: "Imagem", key: "v" },
  { id: "view.reset", label: "Restaurar imagem", group: "Imagem", key: "0" },
  { id: "slice.next", label: "Próximo corte", group: "Navegação", key: "ArrowDown" },
  { id: "slice.prev", label: "Corte anterior", group: "Navegação", key: "ArrowUp" },
  { id: "slice.first", label: "Primeiro corte", group: "Navegação", key: "Home" },
  { id: "slice.last", label: "Último corte", group: "Navegação", key: "End" },
  { id: "cine.toggle", label: "Reproduzir / pausar cine", group: "Navegação", key: " " },
  { id: "layout.1", label: "Layout 1 imagem", group: "Layout", key: "1" },
  { id: "layout.2", label: "Layout 2 imagens", group: "Layout", key: "2" },
  { id: "layout.4", label: "Layout 4 imagens", group: "Layout", key: "4" },
  { id: "sync.scroll", label: "Sincronizar rolagem", group: "Comparação", key: "c" },
  { id: "sync.zoomPan", label: "Sincronizar zoom e posição", group: "Comparação", key: "k" },
  { id: "sync.wl", label: "Sincronizar janela / nível", group: "Comparação", key: "j" },
  { id: "sync.auto", label: "Sincronização automática", group: "Comparação", key: "g" },
  { id: "view.refLines", label: "Linhas de referência", group: "Comparação", key: "d" },
  { id: "study.prior", label: "Abrir exame anterior", group: "Comparação", key: "o" },
  { id: "protocol.manage", label: "Protocolos de exibição", group: "Comparação", key: "y" },
  { id: "app.focus", label: "Modo foco", group: "Geral", key: "f" },
  { id: "app.toggleLeft", label: "Mostrar/ocultar painel esquerdo", group: "Geral", key: "," },
  { id: "app.toggleRight", label: "Mostrar/ocultar painel direito", group: "Geral", key: "." },
  { id: "app.shortcuts", label: "Mostrar atalhos", group: "Geral", key: "?" },
  { id: "app.back", label: "Voltar aos estudos", group: "Geral", key: "Escape" },
];

export type Keymap = Record<string, string>;

export const defaultKeymap = (): Keymap => Object.fromEntries(COMMANDS.map((c) => [c.id, c.key]));

/** Defaults overlaid with the user's overrides; unknown command ids are ignored. */
export function effectiveKeymap(overrides: Keymap | undefined): Keymap {
  const km = defaultKeymap();
  for (const [id, key] of Object.entries(overrides ?? {})) if (id in km && key) km[id] = key;
  return km;
}

export const keyOf = (e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }) =>
  `${e.ctrlKey || e.metaKey ? "ctrl+" : ""}${e.altKey ? "alt+" : ""}${e.key.length === 1 ? e.key.toLowerCase() : e.key}`;

export const commandForKey = (km: Keymap, key: string): string | undefined => Object.keys(km).find((id) => km[id] === key);

/** Rebind `id` to `key`. Returns the id that already owns the key (and leaves the map unchanged) on conflict. */
export function rebind(km: Keymap, id: string, key: string): { keymap: Keymap; conflict?: string } {
  const owner = commandForKey(km, key);
  if (owner && owner !== id) return { keymap: km, conflict: owner };
  return { keymap: { ...km, [id]: key } };
}

const NAMES: Record<string, string> = { " ": "Espaço", ArrowDown: "↓", ArrowUp: "↑", ArrowLeft: "←", ArrowRight: "→", Escape: "Esc" };
export const keyLabel = (k: string) => NAMES[k] ?? k.toUpperCase();
