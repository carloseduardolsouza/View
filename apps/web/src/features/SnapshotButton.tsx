import { useState } from "react";
import { downloadBlob, exportSnapshot, type OverlayText, type StackView } from "@view/viewer-core";
import { Icon } from "../ui/Icon";

/** Saves the active viewport as PNG (image + annotations, optionally corner text). Errors show inline, never in a dialog. */
export function SnapshotButton({ view, overlay, withOverlay = true, name = "captura" }: { view: StackView | null; overlay?: OverlayText; withOverlay?: boolean; name?: string }) {
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!view) return;
    try {
      setErr(null);
      downloadBlob(await exportSnapshot(view, { withAnnotations: true, withOverlay, overlay }), `${name}.png`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao exportar a imagem.");
    }
  };
  return (
    <button className="tool" title={err ?? "Salvar imagem (PNG)"} aria-label="Salvar imagem (PNG)" disabled={!view} onClick={run}>
      <Icon name="download" />
    </button>
  );
}
