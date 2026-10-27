import { useEffect, useState } from "react";
import { AI_DISCLAIMER, listAiModules, registerAiModule, runAiModule, sliceCounterModule, type AiContext, type AiResult } from "@view/viewer-core";
import "../styles/advanced.css";

// the demo module is registered once, when the panel is first used (not at import time)
let demoRegistered = false;

/** Runs registered assistive modules on the current series. Output is always labelled as auxiliary, not a report. */
export function AiPanel({ context }: { context: AiContext | null }) {
  const [moduleId, setModuleId] = useState("");
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!demoRegistered) { demoRegistered = true; registerAiModule(sliceCounterModule); } }, []);
  useEffect(() => { setResult(null); setError(null); }, [context?.seriesUid]);

  const mods = context ? listAiModules(context.modality) : [];
  const chosen = moduleId || mods[0]?.id || "";
  const run = async () => {
    if (!context || !chosen) return;
    setBusy(true); setError(null);
    try { setResult(await runAiModule(chosen, context)); }
    catch (e) { setResult(null); setError(e instanceof Error ? e.message : "Falha ao executar o módulo."); }
    finally { setBusy(false); }
  };

  return (
    <section className="card" aria-label="Análise assistida">
      <h3>Análise assistida</h3>
      <p className="adv-badge">{AI_DISCLAIMER}</p>
      {!mods.length ? <p className="adv-note">Nenhum módulo disponível para esta série.</p> : (
        <div className="adv-actions">
          <select value={chosen} onChange={(e) => setModuleId(e.target.value)} aria-label="Módulo">
            {mods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="btn" disabled={busy || !context} onClick={run}>{busy ? "Executando…" : "Executar"}</button>
        </div>
      )}
      {error && <p className="adv-warn" role="alert">{error}</p>}
      {result && (
        <div role="status">
          <p className="adv-badge">{AI_DISCLAIMER}</p>
          <ul className="adv-list">
            {result.findings.map((f, i) => <li key={i}><strong>{f.title}</strong>{f.detail && <div className="adv-note">{f.detail}</div>}</li>)}
          </ul>
          <p className="adv-note">{result.moduleName} v{result.version} · {new Date(result.ranAt).toLocaleString("pt-BR")}</p>
        </div>
      )}
    </section>
  );
}
