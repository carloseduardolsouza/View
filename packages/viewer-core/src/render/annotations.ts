import { eventTarget } from "@cornerstonejs/core";
import { annotation, ToolEnums } from "./tools";
import type { AnnotationLike } from "./annotation-info";
import { AnnotationHistory, type Snap } from "./annotation-history";

export interface AnnotationRecordIn {
  uid: string;
  tool: string;
  imageId: string | null;
  seriesUid?: string | null;
  data: Record<string, unknown>;
}

type CsAnnotation = Parameters<typeof annotation.state.addAnnotation>[0];

/** JSON-safe copy of a live annotation (drops the enabledElement and transient UI flags). */
export function serialize(a: CsAnnotation): Record<string, unknown> {
  const { metadata, data, annotationUID } = a;
  const { enabledElement: _el, ...meta } = (metadata ?? {}) as Record<string, unknown>;
  return JSON.parse(JSON.stringify({ annotationUID, metadata: meta, data }));
}

export function allAnnotations(): Array<CsAnnotation & AnnotationLike> {
  return annotation.state.getAllAnnotations() as Array<CsAnnotation & AnnotationLike>;
}

/** Adds stored annotations back into Cornerstone. Existing UIDs are skipped, so reopening never duplicates. */
export function restore(records: AnnotationRecordIn[]) {
  for (const r of records) {
    if (annotation.state.getAnnotation(r.uid)) continue;
    const a = r.data as unknown as CsAnnotation;
    const forUid = (a.metadata as { FrameOfReferenceUID?: string } | undefined)?.FrameOfReferenceUID;
    if (!forUid) continue; // cannot be anchored to a viewport without its frame of reference
    annotation.state.addAnnotation({ ...a, annotationUID: r.uid, invalidated: true, highlighted: false, isSelected: false }, forUid);
  }
}

export const getAnnotationByUid = (uid: string) => annotation.state.getAnnotation(uid) as (CsAnnotation & AnnotationLike) | undefined;

export function removeAnnotation(uid: string) {
  annotation.state.removeAnnotation(uid);
}

export function clearAnnotations() {
  annotation.state.removeAllAnnotations();
}

export function selectAnnotation(uid: string) {
  annotation.selection.setAnnotationSelected(uid, true);
}

/** completed = drawn or edited by the user; removed = deleted (also fires for programmatic removal). */
export function watchAnnotations(h: { completed: (a: CsAnnotation) => void; removed: (a: CsAnnotation) => void; modified?: (a: CsAnnotation) => void; changed: () => void }) {
  const E = ToolEnums.Events;
  const onDone = (e: Event) => { const a = (e as CustomEvent<{ annotation?: CsAnnotation }>).detail?.annotation; if (a) { h.completed(a); h.changed(); } };
  const onRem = (e: Event) => { const a = (e as CustomEvent<{ annotation?: CsAnnotation }>).detail?.annotation; if (a) { h.removed(a); h.changed(); } };
  const onAny = () => h.changed();
  const onMod = (e: Event) => { const a = (e as CustomEvent<{ annotation?: CsAnnotation }>).detail?.annotation; if (a) h.modified?.(a); h.changed(); };
  eventTarget.addEventListener(E.ANNOTATION_COMPLETED, onDone);
  eventTarget.addEventListener(E.ANNOTATION_REMOVED, onRem);
  eventTarget.addEventListener(E.ANNOTATION_MODIFIED, onMod);
  eventTarget.addEventListener(E.ANNOTATION_ADDED, onAny);
  return () => {
    eventTarget.removeEventListener(E.ANNOTATION_COMPLETED, onDone);
    eventTarget.removeEventListener(E.ANNOTATION_REMOVED, onRem);
    eventTarget.removeEventListener(E.ANNOTATION_MODIFIED, onMod);
    eventTarget.removeEventListener(E.ANNOTATION_ADDED, onAny);
  };
}

/** Undo/redo bound to the live Cornerstone annotation state (see annotation-history.ts for the web wiring). */
export function createAnnotationHistory(limit = 100) {
  return new AnnotationHistory({
    serialize: (a) => serialize(a as CsAnnotation) as Snap,
    put: (snap) => {
      const uid = snap.annotationUID;
      if (annotation.state.getAnnotation(uid)) annotation.state.removeAnnotation(uid);
      const meta = snap.metadata as { referencedImageId?: string; toolName?: string } | undefined;
      restore([{ uid, tool: meta?.toolName ?? "", imageId: meta?.referencedImageId ?? null, data: snap }]);
    },
    remove: (uid) => annotation.state.removeAnnotation(uid),
  }, limit);
}
