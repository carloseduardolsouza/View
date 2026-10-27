import type { StudySummary } from "@view/dicom-client";
import { useState } from "react";
import { FusionView } from "./features/FusionView";
import { MprView } from "./features/MprView";
import { Viewer } from "./features/Viewer";
import { Worklist } from "./features/Worklist";
import { rememberStudy } from "./lib/worklist";

// MPR and fusion create their own render engine and replace the stack viewer while open: they never coexist.
type Mode = { kind: "mpr"; seriesUid: string } | { kind: "fusion"; ct: string; pt: string } | null;

export function App() {
  const [study, setStudy] = useState<StudySummary | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const open = (s: StudySummary) => { rememberStudy(s); setStudy(s); };
  if (study && mode?.kind === "mpr") return <MprView study={study} seriesUid={mode.seriesUid} onClose={() => setMode(null)} />;
  if (study && mode?.kind === "fusion") return <FusionView study={study} ctSeriesUid={mode.ct} ptSeriesUid={mode.pt} onClose={() => setMode(null)} />;
  if (study) {
    return <Viewer study={study} onClose={() => setStudy(null)} onOpenMpr={(seriesUid) => setMode({ kind: "mpr", seriesUid })} onOpenFusion={(ct, pt) => setMode({ kind: "fusion", ct, pt })} />;
  }
  return <Worklist onOpen={open} />;
}
