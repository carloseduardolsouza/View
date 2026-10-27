// Bridge between live Cornerstone annotations and the pure SR builder.
import { metaData } from "@cornerstonejs/core";
import { allAnnotations } from "./annotations";
import { buildMeasurementReport, parseImageId, toSrAnnotation, type SrAnnotation, type SrOptions, type SrStudy } from "./sr";

/** Annotations of the open study that can be exported (need a calibrated reference image with a SOP class). */
export function collectSrAnnotations(studyUid: string): SrAnnotation[] {
  const out: SrAnnotation[] = [];
  for (const a of allAnnotations()) {
    const id = a.metadata?.referencedImageId;
    if (!id || parseImageId(id)?.studyUid !== studyUid) continue;
    const cls = (metaData.get("sopCommonModule", id) as { sopClassUID?: string } | undefined)?.sopClassUID;
    const s = cls ? toSrAnnotation(a as never, cls) : null;
    if (s) out.push(s);
  }
  return out;
}

export const exportMeasurementReport = (study: SrStudy, opts?: SrOptions) => buildMeasurementReport(study, collectSrAnnotations(study.studyUid), opts);
