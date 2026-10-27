// Undo/redo for annotations. Pure (no Cornerstone import): the engine is reached through `AnnotationOps`.
//
// Web wiring (history = createAnnotationHistory() from annotations.ts):
//   watchAnnotations({ completed: a => { if (history.applying) return; history.recordCompleted(a); save(a) },
//                      removed:   a => { if (history.applying) return; history.recordRemoved(a);   del(a.annotationUID) }, ... })
//   history.onApplied = (c) => c.type === "upsert" ? save(getAnnotationByUid(c.uid)) : del(c.uid)   // undo/redo persist HERE only
// While undo()/redo() mutate the engine, `applying` is true so the normal watch handlers must ignore the events
// they trigger; otherwise the change would be recorded again and saved twice.
// After loading stored annotations call history.clear() then history.seed(allAnnotations()).

export interface Snap { annotationUID: string; [k: string]: unknown }
type Op = { uid: string; before: string | null; after: string | null }; // JSON snapshots; null = absent
export type Change = { type: "upsert" | "remove"; uid: string };

export interface AnnotationOps {
  serialize(a: unknown): Snap;
  /** insert or replace */
  put(snap: Snap): void;
  remove(uid: string): void;
}

export class AnnotationHistory {
  applying = false;
  /** fired after each undo/redo step so the web layer can persist it */
  onApplied: ((c: Change) => void) | null = null;
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];
  private known = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor(private ops: AnnotationOps, private limit = 100) {}

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Marks annotations that already exist (loaded from the API) so editing them records a modify, not a create. */
  seed(list: unknown[]) {
    for (const a of list) {
      const s = this.ops.serialize(a);
      this.known.set(s.annotationUID, JSON.stringify(s));
    }
  }

  /** Forget everything (study change). */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.known.clear();
    this.emit();
  }

  /** Drawn or edited by the user. */
  recordCompleted(a: unknown) {
    const s = this.ops.serialize(a);
    const after = JSON.stringify(s);
    const before = this.known.get(s.annotationUID) ?? null;
    if (before === after) return; // selection / no-op
    this.known.set(s.annotationUID, after);
    this.push({ uid: s.annotationUID, before, after });
  }

  recordRemoved(a: unknown) {
    const uid = this.ops.serialize(a).annotationUID;
    const before = this.known.get(uid);
    this.known.delete(uid);
    if (before) this.push({ uid, before, after: null });
  }

  undo(): boolean {
    const op = this.undoStack.pop();
    if (!op) return false;
    this.apply(op.uid, op.before);
    this.redoStack.push(op);
    this.emit();
    return true;
  }

  redo(): boolean {
    const op = this.redoStack.pop();
    if (!op) return false;
    this.apply(op.uid, op.after);
    this.undoStack.push(op);
    this.emit();
    return true;
  }

  private push(op: Op) {
    this.undoStack.push(op);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.emit();
  }

  private apply(uid: string, state: string | null) {
    this.applying = true;
    try {
      if (state === null) {
        this.known.delete(uid);
        this.ops.remove(uid);
        this.onApplied?.({ type: "remove", uid });
      } else {
        this.known.set(uid, state);
        this.ops.put(JSON.parse(state) as Snap);
        this.onApplied?.({ type: "upsert", uid });
      }
    } finally {
      this.applying = false;
    }
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}
