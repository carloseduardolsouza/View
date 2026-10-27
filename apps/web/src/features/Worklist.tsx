import { DicomHttpError, searchStudies, type StudySummary } from "@view/dicom-client";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { DICOMWEB } from "../api";
import { dicomDate, initials, modalityColor, personName } from "../format";
import { buildQuery, EMPTY_FILTERS, getRecents, hasFilters, MODALITIES, PAGE, sortStudies, type Filters, type SortKey } from "../lib/worklist";
import { Icon } from "../ui/Icon";
import { Topbar } from "./Topbar";
import "../styles/worklist.css";

const errText = (e: unknown) => (e instanceof DicomHttpError && e.status === 502 ? "PACS indisponível. Tente novamente em instantes." : "Não foi possível listar os estudos.");

export function Worklist(p: { onOpen: (s: StudySummary) => void }) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<StudySummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState<SortKey>("date-desc");
  const [retry, setRetry] = useState(0);
  const recents = useMemo(getRecents, []);

  // Fetch PAGE+1 rows: the extra one proves there is more, even if Orthanc caps `limit` on its own.
  const fetchPage = useCallback((offset: number, signal: AbortSignal) =>
    searchStudies(DICOMWEB, { ...buildQuery(applied), limit: String(PAGE + 1), offset: String(offset) }, signal), [applied]);

  useEffect(() => {
    const ac = new AbortController();
    setRows(null);
    setError("");
    fetchPage(0, ac.signal)
      .then((r) => { setRows(r.slice(0, PAGE)); setHasMore(r.length > PAGE); })
      .catch((e) => { if (!ac.signal.aborted) setError(errText(e)); });
    return () => ac.abort();
  }, [fetchPage, retry]);

  async function loadMore() {
    if (!rows) return;
    setLoadingMore(true);
    setError("");
    try {
      const r = await fetchPage(rows.length, new AbortController().signal);
      const seen = new Set(rows.map((s) => s.studyUid));
      setRows([...rows, ...r.slice(0, PAGE).filter((s) => !seen.has(s.studyUid))]);
      setHasMore(r.length > PAGE);
    } catch (e) { setError(errText(e)); }
    setLoadingMore(false);
  }

  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const search = (e: FormEvent) => { e.preventDefault(); setApplied({ ...draft }); };
  const clear = () => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };
  const sorted = useMemo(() => (rows ? sortStudies(rows, sort) : []), [rows, sort]);

  function onKeys(e: KeyboardEvent<HTMLDivElement>) {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>(".s-row")];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0 && d < 0) return;
    e.preventDefault();
    list[Math.max(0, Math.min(list.length - 1, i + d))]?.focus();
  }

  return (
    <div className="app">
      <Topbar />

      <main className="scroll">
        <div className="wl">
          <form className="card filters" style={{ "--i": 1 } as CSSProperties} onSubmit={search} role="search" aria-label="Filtrar estudos">
            <label>Paciente<input className="inp" value={draft.name} onChange={set("name")} placeholder="Nome" /></label>
            <label>ID do paciente<input className="inp" value={draft.pid} onChange={set("pid")} placeholder="ID" /></label>
            <label>Accession<input className="inp" value={draft.acc} onChange={set("acc")} placeholder="Accession" /></label>
            <label>Descrição<input className="inp" value={draft.desc} onChange={set("desc")} placeholder="Ex.: tórax" /></label>
            <label>Modalidade
              <select className="inp" value={draft.modality} onChange={set("modality")}>
                <option value="">Todas</option>
                {MODALITIES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>Data de<input className="inp" type="date" value={draft.from} max={draft.to || undefined} onChange={set("from")} /></label>
            <label>Data até<input className="inp" type="date" value={draft.to} min={draft.from || undefined} onChange={set("to")} /></label>
            <div className="f-actions">
              {(hasFilters(draft) || hasFilters(applied)) && <button type="button" className="btn" onClick={clear}>Limpar filtros</button>}
              <button type="submit" className="btn pri"><Icon name="search" />Buscar</button>
            </div>
          </form>

          {recents.length > 0 && !hasFilters(applied) && (
            <section className="recents" aria-label="Estudos recentes">
              <h3>Recentes</h3>
              <div className="r-list">
                {recents.map((r) => (
                  <button key={r.study.studyUid} className="r-item" onClick={() => p.onOpen(r.study)}>
                    <b>{personName(r.study.patientName)}</b>
                    <small>{dicomDate(r.study.date)} · {r.study.modalities.join(", ") || "—"}</small>
                    {r.resume && <small className="resume">Continuar de onde parou</small>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="empty">
              <strong className="err">{error}</strong>
              <span>Verifique a conexão com o PACS.</span>
              <button className="btn" onClick={() => (rows ? void loadMore() : setRetry((n) => n + 1))}>Tentar novamente</button>
            </div>
          )}
          {!rows && !error && <div className="studies" aria-busy="true" aria-label="Carregando estudos">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" />)}</div>}
          {rows && rows.length === 0 && !error && (
            <div className="empty">
              <strong>Nenhum estudo encontrado</strong>
              <span>{hasFilters(applied) ? "Nenhum exame combina com estes filtros. Tente ampliar o período ou limpar a busca." : "O PACS ainda não tem estudos. Envie exames ao Orthanc para vê-los aqui."}</span>
              {hasFilters(applied) && <button className="btn" onClick={clear}>Limpar filtros</button>}
            </div>
          )}

          {rows && rows.length > 0 && (
            <>
              <div className="meta" aria-live="polite">
                <span>{rows.length} {rows.length === 1 ? "estudo" : "estudos"}{hasMore ? " carregados (há mais)" : ""}</span>
                <label>Ordenar por{" "}
                  <select className="inp" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="date-desc">Data (mais recente)</option>
                    <option value="date-asc">Data (mais antigo)</option>
                    <option value="name">Nome do paciente</option>
                  </select>
                </label>
              </div>
              <div className="studies" onKeyDown={onKeys}>
                <div className="s-head" aria-hidden="true"><span>Paciente</span><span className="c-id">ID</span><span className="c-date">Data</span><span>Tipo</span><span className="c-desc">Descrição</span></div>
                {sorted.map((s, i) => {
                  const name = personName(s.patientName);
                  return (
                    <button key={s.studyUid} className="s-row" style={{ "--i": Math.min(i, 12) } as CSSProperties} onClick={() => p.onOpen(s)}>
                      <span className="who">
                        <span className="avatar"><span>{initials(name)}</span></span>
                        <span><b>{name}</b><small>Accession {s.accession || "—"}</small></span>
                      </span>
                      <span className="c-id dim cell">{s.patientId || "—"}</span>
                      <span className="c-date dim cell">{dicomDate(s.date)}</span>
                      <span className="chips">
                        {s.modalities.length
                          ? s.modalities.map((m) => <span key={m} className="chip" style={{ "--c": modalityColor(m) } as CSSProperties}>{m}</span>)
                          : <span className="dim">—</span>}
                      </span>
                      <span className="c-desc cell" style={{ color: "var(--ink-2)" }}>{s.description || "Sem descrição"}</span>
                    </button>
                  );
                })}
              </div>
              {hasMore && (
                <div className="more">
                  <span>Podem existir mais estudos. A ordenação vale só para os já carregados.</span>
                  <button className="btn" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Carregando…" : "Carregar mais"}</button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
