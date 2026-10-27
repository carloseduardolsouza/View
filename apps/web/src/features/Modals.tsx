import { findPriorStudies, type StudySummary } from "@view/dicom-client";
import { BUILTIN_PROTOCOLS, type Protocol } from "@view/viewer-core";
import { useEffect, useRef, useState } from "react";
import { DICOMWEB } from "../api";
import { dicomDate } from "../format";
import { COMMANDS, keyLabel, keyOf, rebind, type Keymap } from "../lib/keymap";
import "../styles/compare.css";

/** Photoshop-style text box: appears where the user clicked on the image. Enter commits, Shift+Enter adds a line, Esc cancels. */
export function InlineText({ initial, x, y, onDone }: { initial: string; x: number; y: number; onDone: (text: string | null) => void }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const born = useRef(0);
  const finish = (text: string | null) => { if (done.current) return; done.current = true; onDone(text); };

  useEffect(() => {
    born.current = performance.now();
    // the click that opened the editor is still finishing: take focus after it
    const t = setTimeout(() => { box.current?.focus(); box.current?.select(); }, 0);
    return () => clearTimeout(t);
  }, []);

  const left = Math.max(8, Math.min(x, window.innerWidth - 220));
  const top = Math.max(8, Math.min(y - 14, window.innerHeight - 60));
  return (
    <textarea
      ref={box}
      className="inline-text"
      style={{ left, top }}
      defaultValue={initial}
      rows={1}
      maxLength={200}
      spellCheck={false}
      aria-label="Texto da anotação"
      placeholder="Digite o texto"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finish(box.current?.value.trim() || null); }
        else if (e.key === "Escape") { e.preventDefault(); finish(null); }
      }}
      // ignore the blur caused by the opening click; afterwards leaving the box commits what was typed
      onBlur={() => { if (performance.now() - born.current > 300) finish(box.current?.value.trim() || null); }}
    />
  );
}

export function ShortcutsModal({ keymap, onChange, onReset, onClose }: { keymap: Keymap; onChange: (km: Keymap) => void; onReset: () => void; onClose: () => void }) {
  const [capturing, setCapturing] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!capturing) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return; // wait for the real key
      if (e.key === "Escape") { setCapturing(null); setMessage(""); return; }
      const r = rebind(keymap, capturing, keyOf(e));
      if (r.conflict) setMessage(`Essa tecla já é usada em "${COMMANDS.find((c) => c.id === r.conflict)?.label}".`);
      else { onChange(r.keymap); setCapturing(null); setMessage(""); }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [capturing, keymap, onChange]);

  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  return (
    <div className="modal on" role="dialog" aria-modal="true" aria-label="Atalhos de teclado" onKeyDown={(e) => !capturing && e.key === "Escape" && onClose()}>
      <div className="sheet">
        <h2>Atalhos de teclado</h2>
        <p className="lbl" role="status">{capturing ? message || "Pressione a nova tecla (Esc cancela)." : message || "Clique em uma tecla para trocá-la."}</p>
        {groups.map((g) => (
          <div key={g} className="keygroup">
            <h3>{g}</h3>
            <div className="keys">
              {COMMANDS.filter((c) => c.group === g).map((c) => (
                <div key={c.id}>
                  <span>{c.label}</span>
                  <button className={`kbdbtn${capturing === c.id ? " on" : ""}`} onClick={() => { setCapturing(c.id); setMessage(""); }} aria-label={`Alterar atalho de ${c.label}`}>
                    <kbd>{capturing === c.id ? "…" : keyLabel(keymap[c.id] ?? "")}</kbd>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="row end">
          <button className="btn" onClick={onReset}>Restaurar padrão</button>
          <button className="btn pri" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
}

/** Other studies of the same patient, newest first; picking one loads its first series next to the current image. */
export function PriorStudiesModal({ current, onPick, onClose }: { current: StudySummary; onPick: (s: StudySummary) => void; onClose: () => void }) {
  const [list, setList] = useState<StudySummary[] | null>(null);
  const [error, setError] = useState("");
  useEscape(onClose);
  useEffect(() => {
    const ac = new AbortController();
    findPriorStudies(DICOMWEB, current, ac.signal).then(setList).catch(() => !ac.signal.aborted && setError("Não foi possível buscar outros exames deste paciente."));
    return () => ac.abort();
  }, [current]);
  return (
    <div className="modal on" role="dialog" aria-modal="true" aria-label="Abrir exame anterior">
      <div className="sheet small">
        <h2>Abrir exame anterior</h2>
        {error ? <div role="alert" className="err">{error}</div>
          : !list ? <p className="lbl" role="status">Buscando exames…</p>
          : list.length === 0 ? <p className="lbl">Nenhum outro exame encontrado para este paciente.</p>
          : (
            <div className="cmp-list">
              {list.map((s) => (
                <button key={s.studyUid} className="cmp-row" onClick={() => onPick(s)}>
                  <span><b>{dicomDate(s.date)} · {s.modalities.join(" ") || "—"}</b><small>{s.description || "Sem descrição"}{s.accession && ` · ${s.accession}`}</small></span>
                </button>
              ))}
            </div>
          )}
        <div className="row end"><button className="btn pri" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}

/** Saves the current layout as a named protocol and lists/deletes the user's protocols. */
export function ProtocolsModal({ protocols, onSave, onDelete, onClose }: { protocols: Protocol[]; onSave: (name: string) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  useEscape(onClose);
  const save = () => { if (name.trim()) { onSave(name); setName(""); } };
  return (
    <div className="modal on" role="dialog" aria-modal="true" aria-label="Protocolos de exibição">
      <div className="sheet small">
        <h2>Protocolos de exibição</h2>
        <p className="lbl">Aplicados ao abrir um exame que combine com a regra. Os seus vêm antes dos padrões.</p>
        <div className="row">
          <input className="cmp-input" value={name} maxLength={60} placeholder="Nome para o layout atual" aria-label="Nome do protocolo" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button className="btn pri" disabled={!name.trim()} onClick={save}>Salvar</button>
        </div>
        <div className="cmp-list">
          {protocols.map((p) => (
            <div key={p.id} className="cmp-row"><span><b>{p.name}</b><small>{p.layout} imagem{p.layout > 1 ? "s" : ""}{p.match.modality ? ` · ${p.match.modality}` : ""}</small></span>
              <button className="btn sq" title="Excluir protocolo" aria-label={`Excluir protocolo ${p.name}`} onClick={() => onDelete(p.id)}>×</button></div>
          ))}
          {BUILTIN_PROTOCOLS.map((p) => (
            <div key={p.id} className="cmp-row"><span><b>{p.name}</b><small>Padrão · {p.layout} imagem{p.layout > 1 ? "s" : ""}</small></span></div>
          ))}
        </div>
        <div className="row end"><button className="btn pri" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}
