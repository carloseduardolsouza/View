import { DicomHttpError, searchStudies, type StudySummary } from "@view/dicom-client";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { DICOMWEB } from "../api";
import { ageAt, dicomDate, dicomTime, initials, modalityColor, personName, SEX } from "../format";
import { buildQuery, dateRange, EMPTY_FILTERS, getRecents, hasFilters, MODALITIES, PAGE, sortStudies, type Filters, type SortCol, type SortKey } from "../lib/worklist";
import { sfx } from "../lib/sound";
import { Icon } from "../ui/Icon";
import { TagsModal, type TagsTarget } from "./TagsModal";
import { Topbar } from "./Topbar";
import "../styles/worklist.css";

const errText = (e: unknown) => (e instanceof DicomHttpError && e.status === 502 ? "PACS indisponível. Tente novamente em instantes." : "Não foi possível listar os estudos.");

const PRESETS = [["today", "Hoje"], ["yesterday", "Ontem"], ["7d", "7 dias"], ["30d", "30 dias"], ["1y", "1 ano"]] as const;
const COLS: Array<[SortCol | null, string, string]> = [
  ["name", "Paciente", "c-name"], ["birth", "Idade / sexo", "c-age"], ["date", "Data", "c-date"], ["mod", "Modalidade", "c-mod"],
  ["desc", "Descrição", "c-desc"], ["acc", "Accession", "c-acc"], [null, "Solicitante", "c-ref"], ["series", "Séries / imagens", "c-cnt"], [null, "", "c-act"],
];

export function Worklist(p: { onOpen: (s: StudySummary) => void }) {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [more, setMore] = useState(false);
  const [rows, setRows] = useState<StudySummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState<SortKey>("date-desc");
  const [retry, setRetry] = useState(0);
  const [tags, setTags] = useState<TagsTarget | null>(null);
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
      .catch((e) => { if (!ac.signal.aborted) { setError(errText(e)); sfx("error"); } });
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
  /** chips and selects search right away; text fields wait for Enter / Buscar */
  const applyNow = (patch: Partial<Filters>) => { const f = { ...draft, ...patch }; setDraft(f); setApplied(f); sfx("tick"); };
  const search = (e: FormEvent) => { e.preventDefault(); setApplied({ ...draft }); };
  const clear = () => { setDraft(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); sfx("tick"); };
  const sorted = useMemo(() => (rows ? sortStudies(rows, sort) : []), [rows, sort]);
  const [sortCol, sortDir] = sort.split("-") as [SortCol, string];
  const sortBy = (c: SortCol) => setSort(sortCol === c ? `${c}-${sortDir === "asc" ? "desc" : "asc"}` : `${c}-${c === "date" ? "desc" : "asc"}`);
  const preset = PRESETS.find(([id]) => { const [f, t] = dateRange(id); return applied.from === f && applied.to === t; })?.[0] ?? (applied.from || applied.to ? "custom" : "");
  const images = rows?.reduce((n, s) => n + (s.instanceCount ?? 0), 0) ?? 0;
  const advancedCount = [applied.pid, applied.acc, applied.desc, applied.sex].filter((v) => v.trim()).length;

  function onKeys(e: KeyboardEvent<HTMLDivElement>) {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>(".s-row")];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0 && d < 0) return;
    e.preventDefault();
    list[Math.max(0, Math.min(list.length - 1, i + d))]?.focus();
  }
  const open = (s: StudySummary) => { sfx("swap"); p.onOpen(s); };

  return (
    <div className="app pacs">
      <Topbar />

      <main className="scroll">
        <div className="wl">
          <form className="card filters" onSubmit={search} role="search" aria-label="Filtrar estudos">
            <div className="f-main">
              <label className="f-search">
                <Icon name="search" />
                <input value={draft.name} onChange={set("name")} placeholder="Buscar paciente pelo nome" aria-label="Nome do paciente" />
              </label>
              <button type="button" className={`btn${more ? " on" : ""}`} aria-expanded={more} onClick={() => setMore((m) => !m)}>
                <Icon name="filter" />Mais filtros{advancedCount > 0 && <span className="count">{advancedCount}</span>}
              </button>
              {(hasFilters(draft) || hasFilters(applied)) && <button type="button" className="btn" onClick={clear}>Limpar</button>}
              <button type="submit" className="btn pri"><Icon name="search" />Buscar</button>
            </div>

            <div className="f-chips">
              <span className="lbl">Período</span>
              <button type="button" className={`chip pill${!preset ? " on" : ""}`} onClick={() => applyNow({ from: "", to: "" })}>Todos</button>
              {PRESETS.map(([id, label]) => {
                const [from, to] = dateRange(id);
                return <button key={id} type="button" className={`chip pill${preset === id ? " on" : ""}`} onClick={() => applyNow({ from, to })}>{label}</button>;
              })}
              {preset === "custom" && <span className="chip pill on">{dicomDate(applied.from.replaceAll("-", ""))} – {dicomDate(applied.to.replaceAll("-", ""))}</span>}
              <span className="f-sep" />
              <span className="lbl">Modalidade</span>
              <button type="button" className={`chip pill${!applied.modality ? " on" : ""}`} onClick={() => applyNow({ modality: "" })}>Todas</button>
              {MODALITIES.map((m) => (
                <button key={m} type="button" className={`chip pill mod${applied.modality === m ? " on" : ""}`} style={{ "--c": modalityColor(m) } as CSSProperties}
                  onClick={() => applyNow({ modality: applied.modality === m ? "" : m })}>{m}</button>
              ))}
            </div>

            {more && (
              <div className="f-adv">
                <label>ID do paciente<input className="inp" value={draft.pid} onChange={set("pid")} placeholder="ID" /></label>
                <label>Accession<input className="inp" value={draft.acc} onChange={set("acc")} placeholder="Accession" /></label>
                <label>Descrição<input className="inp" value={draft.desc} onChange={set("desc")} placeholder="Ex.: tórax" /></label>
                <label>Sexo
                  <select className="inp" value={draft.sex} onChange={(e) => applyNow({ sex: e.target.value })}>
                    <option value="">Todos</option>
                    {Object.entries(SEX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label>Data de<input className="inp" type="date" value={draft.from} max={draft.to || undefined} onChange={set("from")} /></label>
                <label>Data até<input className="inp" type="date" value={draft.to} min={draft.from || undefined} onChange={set("to")} /></label>
              </div>
            )}
          </form>

          {recents.length > 0 && !hasFilters(applied) && (
            <section className="recents" aria-label="Estudos recentes">
              <h3>Recentes</h3>
              <div className="r-list">
                {recents.map((r) => (
                  <button key={r.study.studyUid} className="r-item" onClick={() => open(r.study)}>
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
          {!rows && !error && <div className="studies" aria-busy="true" aria-label="Carregando estudos">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skel" />)}</div>}
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
                <span><b>{rows.length}</b> {rows.length === 1 ? "estudo" : "estudos"}{images > 0 && <> · <b>{images}</b> imagens</>}{hasMore ? " · há mais no PACS" : ""}</span>
                <span className="lbl">Clique no cabeçalho para ordenar · ↑↓ navega · Enter abre</span>
              </div>
              <div className="studies" role="table" aria-label="Estudos" onKeyDown={onKeys}>
                <div className="s-head" role="row">
                  {COLS.map(([col, label, cls]) => col ? (
                    <button key={cls} role="columnheader" className={`${cls}${sortCol === col ? " on" : ""}`} aria-sort={sortCol === col ? (sortDir === "asc" ? "ascending" : "descending") : "none"} onClick={() => sortBy(col)}>
                      {label}{sortCol === col && <i>{sortDir === "asc" ? "▲" : "▼"}</i>}
                    </button>
                  ) : <span key={cls} role="columnheader" className={cls}>{label}</span>)}
                </div>
                {sorted.map((s, i) => {
                  const name = personName(s.patientName);
                  const age = ageAt(s.birthDate, s.date);
                  return (
                    <div key={s.studyUid} className="s-row" role="row" tabIndex={0} style={{ "--i": Math.min(i, 12) } as CSSProperties}
                      onClick={() => open(s)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(s); }}>
                      <span className="c-name who" role="cell">
                        <span className="avatar"><span>{initials(name)}</span></span>
                        <span><b>{name}</b><small>ID {s.patientId || "—"}</small></span>
                      </span>
                      <span className="c-age dim cell" role="cell">{age != null ? `${age} anos` : "—"}{s.sex ? ` · ${s.sex}` : ""}{s.birthDate && <small>{dicomDate(s.birthDate)}</small>}</span>
                      <span className="c-date cell" role="cell">{dicomDate(s.date)}<small>{dicomTime(s.time)}</small></span>
                      <span className="c-mod chips" role="cell">
                        {s.modalities.length
                          ? s.modalities.map((m) => <span key={m} className="chip" style={{ "--c": modalityColor(m) } as CSSProperties}>{m}</span>)
                          : <span className="dim">—</span>}
                      </span>
                      <span className="c-desc cell" role="cell">{s.description || <span className="dim">Sem descrição</span>}</span>
                      <span className="c-acc dim cell" role="cell">{s.accession || "—"}</span>
                      <span className="c-ref cell" role="cell">{s.referrer ? personName(s.referrer) : <span className="dim">—</span>}</span>
                      <span className="c-cnt dim cell" role="cell">{s.seriesCount ?? "—"} / {s.instanceCount ?? "—"}</span>
                      <span className="c-act" role="cell">
                        <button className="tool" title="Ver todas as tags DICOM" aria-label={`Tags DICOM de ${name}`}
                          onClick={(e) => { e.stopPropagation(); sfx("open"); setTags({ studyUid: s.studyUid, title: `${name} · ${dicomDate(s.date)}` }); }}>
                          <Icon name="tag" />
                        </button>
                        <button className="btn pri sm" onClick={(e) => { e.stopPropagation(); open(s); }}>Abrir</button>
                      </span>
                    </div>
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
      {tags && <TagsModal target={tags} onClose={() => setTags(null)} />}
    </div>
  );
}
