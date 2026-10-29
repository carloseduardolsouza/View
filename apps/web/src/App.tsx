import { searchStudies, type StudySummary } from "@view/dicom-client";
import { useEffect, useState } from "react";
import { DICOMWEB } from "./api";
import { FusionView } from "./features/FusionView";
import { MprView } from "./features/MprView";
import { Viewer } from "./features/Viewer";
import { rememberStudy } from "./lib/worklist";

// MPR and fusion create their own render engine and replace the stack viewer while open: they never coexist.
type Mode = { kind: "mpr"; seriesUid: string } | { kind: "fusion"; ct: string; pt: string } | null;

// The host app opens us as ?StudyInstanceUIDs=<uid>: the viewer goes straight to that study (no worklist).
const studyUidFromUrl = () => new URLSearchParams(location.search).get("StudyInstanceUIDs")?.split(",")[0]?.trim() || null;

export function App() {
  const [study, setStudy] = useState<StudySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    const uid = studyUidFromUrl();
    if (!uid) return setError("Nenhum estudo informado (StudyInstanceUIDs).");
    const ac = new AbortController();
    searchStudies(DICOMWEB, { StudyInstanceUID: uid, limit: "1" }, ac.signal)
      .then((rows) => {
        if (!rows[0]) return setError("Estudo não encontrado.");
        rememberStudy(rows[0]);
        setStudy(rows[0]);
      })
      .catch(() => !ac.signal.aborted && setError("Não foi possível carregar o estudo. Reabra o visualizador pelo sistema."));
    return () => ac.abort();
  }, []);

  if (!study) return <div role="status" style={{ padding: 24 }}>{error ?? "Carregando estudo…"}</div>;
  if (mode?.kind === "mpr") return <MprView study={study} seriesUid={mode.seriesUid} onClose={() => setMode(null)} />;
  if (mode?.kind === "fusion") return <FusionView study={study} ctSeriesUid={mode.ct} ptSeriesUid={mode.pt} onClose={() => setMode(null)} />;
  return <Viewer study={study} onOpenMpr={(seriesUid) => setMode({ kind: "mpr", seriesUid })} onOpenFusion={(ct, pt) => setMode({ kind: "fusion", ct, pt })} />;
}
