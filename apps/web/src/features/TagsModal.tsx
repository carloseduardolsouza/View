import { getInstanceMetadata, searchInstances, searchSeries, type InstanceSummary, type SeriesSummary } from "@view/dicom-client";
import { flattenTags, type DicomJsonObj } from "@view/viewer-core";
import { useEffect, useMemo, useState } from "react";
import { DICOMWEB } from "../api";
import { useEscape } from "./Modals";
import "../styles/tags.css";

export interface TagsTarget { studyUid: string; seriesUid?: string; sopUid?: string; title?: string }

/** Every DICOM tag of one instance. Opens on the given instance, or lets the user pick series and image. */
export function TagsModal({ target, onClose }: { target: TagsTarget; onClose: () => void }) {
  const [series, setSeries] = useState<SeriesSummary[] | null>(null);
  const [seriesUid, setSeriesUid] = useState(target.seriesUid ?? "");
  const [instances, setInstances] = useState<InstanceSummary[] | null>(null);
  const [sopUid, setSopUid] = useState(target.sopUid ?? "");
  const [meta, setMeta] = useState<DicomJsonObj | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  useEscape(onClose);

  useEffect(() => {
    const ac = new AbortController();
    searchSeries(DICOMWEB, target.studyUid, ac.signal)
      .then((s) => { setSeries(s); setSeriesUid((cur) => cur || s[0]?.seriesUid || ""); })
      .catch(() => !ac.signal.aborted && setError("Não foi possível listar as séries."));
    return () => ac.abort();
  }, [target.studyUid]);

  useEffect(() => {
    if (!seriesUid) return;
    const ac = new AbortController();
    setInstances(null);
    searchInstances(DICOMWEB, target.studyUid, seriesUid, ac.signal)
      .then((l) => { setInstances(l); setSopUid((cur) => (l.some((i) => i.sopUid === cur) ? cur : l[0]?.sopUid ?? "")); })
      .catch(() => !ac.signal.aborted && setError("Não foi possível listar as imagens da série."));
    return () => ac.abort();
  }, [target.studyUid, seriesUid]);

  useEffect(() => {
    if (!seriesUid || !sopUid) return;
    const ac = new AbortController();
    setMeta(null);
    setError("");
    getInstanceMetadata(DICOMWEB, target.studyUid, seriesUid, sopUid, ac.signal)
      .then((m) => setMeta(m as DicomJsonObj))
      .catch(() => !ac.signal.aborted && setError("Não foi possível ler as tags desta imagem."));
    return () => ac.abort();
  }, [target.studyUid, seriesUid, sopUid]);

  const rows = useMemo(() => (meta ? flattenTags(meta) : []), [meta]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.tag} ${r.name} ${r.value} ${r.vr}`.toLowerCase().includes(needle)) : rows;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" }));
    a.download = `tags-${sopUid.slice(-12)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="modal on" role="dialog" aria-modal="true" aria-label="Tags DICOM">
      <div className="sheet tags-sheet">
        <div className="row between">
          <h2>Tags DICOM{target.title && <small> · {target.title}</small>}</h2>
          <button className="btn sq" aria-label="Fechar" title="Fechar (Esc)" onClick={onClose}>×</button>
        </div>
        <div className="tags-bar">
          <label>Série
            <select className="inp" value={seriesUid} disabled={!series} onChange={(e) => { setSeriesUid(e.target.value); setSopUid(""); }}>
              {series?.map((s) => <option key={s.seriesUid} value={s.seriesUid}>#{s.number ?? "?"} · {s.modality} · {s.description || "Sem descrição"}</option>)}
            </select>
          </label>
          <label>Imagem
            <select className="inp" value={sopUid} disabled={!instances?.length} onChange={(e) => setSopUid(e.target.value)}>
              {instances?.map((i, k) => <option key={i.sopUid} value={i.sopUid}>Imagem {i.number ?? k + 1}</option>)}
            </select>
          </label>
          <label className="grow">Filtrar
            <input className="inp" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, tag (0010,0010) ou valor" autoFocus />
          </label>
          <button className="btn" disabled={!meta} onClick={download}>Baixar JSON</button>
        </div>
        {error ? <div role="alert" className="err">{error}</div>
          : !meta ? <p className="lbl" role="status">Carregando tags…</p>
          : (
            <>
              <span className="lbl">{shown.length} de {rows.length} tags</span>
              <div className="tags-wrap">
                <table className="tags">
                  <thead><tr><th>Tag</th><th>Nome</th><th>VR</th><th>Valor</th></tr></thead>
                  <tbody>
                    {shown.map((r, i) => (
                      <tr key={i} className={r.tag ? "" : "item"}>
                        <td className="mono">{r.tag}</td>
                        <td style={{ paddingLeft: 10 + r.depth * 14 }}>{r.name}</td>
                        <td className="mono">{r.vr}</td>
                        <td className="v">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
      </div>
    </div>
  );
}
