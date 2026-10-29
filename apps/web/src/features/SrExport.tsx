import { useState } from "react";
import { exportMeasurementReport, collectSrAnnotations } from "@view/viewer-core";
import type { StudySummary } from "@view/dicom-client";
import "../styles/advanced.css";

/** Modal to export the open study's measurements as a DICOM SR (download). */
export function SrExport({ study, author, onClose }: { study: StudySummary; author?: string; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const count = collectSrAnnotations(study.studyUid).length;

  const build = () => exportMeasurementReport(
    { studyUid: study.studyUid, patientId: study.patientId, patientName: study.patientName, studyDate: study.date.replace(/\D/g, "").slice(0, 8), accessionNumber: study.accession },
    { author },
  );
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const bytes = build();
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/dicom" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `relatorio-medidas-${Date.now()}.dcm` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg("Arquivo gerado.");
    } catch (e) {
      setMsg(`Falha: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Exportar relatório de medidas" onClick={onClose}>
      <div className="sheet small" onClick={(e) => e.stopPropagation()}>
        <h2>Exportar medidas (DICOM SR)</h2>
        <p className="adv-note">{count ? `${count} medida(s) deste estudo serão incluídas.` : "Não há medidas neste estudo para exportar."} O relatório é gerado como PARCIAL e NÃO VERIFICADO.</p>
        {msg && <p role="status">{msg}</p>}
        <div className="adv-actions">
          <button className="btn" onClick={onClose}>Fechar</button>
          <button className="btn" disabled={!count || busy} onClick={() => run()}>Baixar .dcm</button>
        </div>
      </div>
    </div>
  );
}
