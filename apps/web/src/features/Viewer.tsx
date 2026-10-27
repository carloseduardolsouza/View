import type { Preferences } from "@view/contracts";
import { DicomHttpError, searchSeries, type SeriesSummary, type StudySummary } from "@view/dicom-client";
import {
  allAnnotations, BUILTIN_PROTOCOLS, clearAnnotations, createAnnotationHistory, clearSeriesCache, compatibility, crossing, describeAnnotation, getAnnotationByUid, hasStats, initRender, NO_SYNC,
  presetsFor, protocolFromLayout, removeAnnotation, resolveProtocol, restore, selectAnnotation, serialize, ToolSession, upsertProtocol, ViewSync, watchAnnotations,
  type Compat, type Protocol, type StackView, type SyncSettings, type ToolId, type ViewState,
} from "@view/viewer-core";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { deleteAnnotation, DICOMWEB, fetchAnnotations, fetchPreferences, putAnnotation, savePreferences } from "../api";
import { dicomDate, initials, personName } from "../format";
import { COMMANDS, commandForKey, defaultKeymap, effectiveKeymap, keyOf, type Keymap } from "../lib/keymap";
import { Icon } from "../ui/Icon";
import { CompareBar, CompareNote, type CompareInfo } from "./CompareBar";
import { getResume, rememberResume } from "../lib/worklist";
import { AiPanel } from "./AiPanel";
import { Inspector, type MeasureItem, type SaveStatus } from "./Inspector";
import { Overlays } from "./Overlays";
import { SnapshotButton } from "./SnapshotButton";
import { SrExport } from "./SrExport";
import { InlineText, PriorStudiesModal, ProtocolsModal, ShortcutsModal } from "./Modals";
import { Toolbar } from "./Toolbar";
import { Topbar } from "./Topbar";
import { Thumb } from "./Thumb";
import { SERIES_MIME, ViewportCell, type CellRef } from "./ViewportCell";

const serName = (s: SeriesSummary) => s.description || `Série ${s.number ?? "?"}`;
type Layout = 1 | 2 | 4;
type Cells = (CellRef | null)[];
/** series of other studies shown in cells (prior exams) */
type Extra = Record<string, { study: StudySummary; series: SeriesSummary[] }>;
const isCell = (c: CellRef | null | undefined, studyUid: string, seriesUid: string) => !!c && c.studyUid === studyUid && c.seriesUid === seriesUid;

function loadPanel(side: "left" | "right"): boolean {
  try { return localStorage.getItem(`panel-${side}`) !== "closed"; } catch { return true; }
}
function savePanel(side: "left" | "right", open: boolean) {
  try { localStorage.setItem(`panel-${side}`, open ? "open" : "closed"); } catch { /* storage blocked */ }
}
type Meta = { authorId: string; authorEmail: string; createdAt: string; seriesUid: string | null };

/** Empty cells among the first `n` get the next series of the current study that is not on screen yet. */
function fillFree(cells: Cells, n: number, studyUid: string, series: SeriesSummary[]): Cells {
  const next = [...cells];
  const used = new Set(next.slice(0, n).filter(Boolean).map((c) => c!.seriesUid));
  for (let i = 0; i < n; i++) {
    if (next[i]) continue;
    const free = series.find((s) => !used.has(s.seriesUid));
    next[i] = free ? { studyUid, seriesUid: free.seriesUid } : null;
    if (free) used.add(free.seriesUid);
  }
  return next;
}

interface ViewerProps {
  study: StudySummary;
  onClose: () => void;
  /** opens the MPR / 3D screen for a series (App swaps the screens) */
  onOpenMpr: (seriesUid: string) => void;
  onOpenFusion: (ctSeriesUid: string, ptSeriesUid: string) => void;
}

export function Viewer({ study, onClose, onOpenMpr, onOpenFusion }: ViewerProps) {
  const studyUid = study.studyUid;
  const patient = personName(study.patientName);

  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [extra, setExtra] = useState<Extra>({});
  const [seriesError, setSeriesError] = useState("");
  const [layout, setLayout] = useState<Layout>(1);
  const [cells, setCells] = useState<Cells>([null, null, null, null]);
  const [active, setActive] = useState(0);
  const [tool, setTool] = useState<ToolId>("windowLevel");
  const [states, setStates] = useState<Record<number, ViewState>>({});
  const [session, setSession] = useState<ToolSession | null>(null);
  const [fatal, setFatal] = useState("");
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [fps, setFps] = useState(10);
  const [leftOpen, setLeftOpen] = useState(() => loadPanel("left"));
  const [rightOpen, setRightOpen] = useState(() => loadPanel("right"));
  const focus = !leftOpen && !rightOpen;
  const [showOv, setShowOv] = useState(true);
  const [keymap, setKeymap] = useState<Keymap>(defaultKeymap);
  const [showKeys, setShowKeys] = useState(false);
  const [modal, setModal] = useState<"prior" | "protocols" | "sr" | null>(null);
  const [showScale, setShowScale] = useState(true);
  const [history] = useState(() => createAnnotationHistory());
  const [, setHistoryTick] = useState(0); // re-render when undo/redo availability changes
  const [textPrompt, setTextPrompt] = useState<{ initial: string; x: number; y: number; resolve: (t: string | null) => void } | null>(null);
  const [items, setItems] = useState<MeasureItem[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [jump, setJump] = useState<{ imageId: string; cell: number } | null>(null);
  const [sync, setSync] = useState<SyncSettings>(NO_SYNC);
  const [refLines, setRefLines] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null); // null until the first fetch settles

  const views = useRef<Record<number, StackView>>({});
  const [syncCtl] = useState(() => new ViewSync(() => views.current));
  syncCtl.settings = sync;
  const imageIndex = useRef(new Map<string, { studyUid: string; seriesUid: string; index: number }>());
  const meta = useRef(new Map<string, Meta>());
  const annStudy = useRef(new Map<string, string>()); // annotation uid -> study it is stored under
  const loadedStudies = useRef(new Set<string>());
  const gen = useRef(0); // bumps when annotations are torn down, so late fetches are dropped
  const known = useRef(new Set<string>()); // annotation uids that exist on the server
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(0);
  const cellsRef = useRef<Cells>([null, null, null, null]);
  const resume = useRef(getResume(studyUid)); // where the user stopped last time; consumed once
  const pointer = useRef({ x: 200, y: 200 }); // last mouse position: where the text box opens

  cellsRef.current = cells;
  const activeView = () => views.current[active];
  const activeState = states[active] ?? null;
  const infoOf = (c: CellRef | null) => {
    const src = !c || c.studyUid === studyUid ? { study, series } : extra[c.studyUid];
    return { study: src?.study ?? study, series: c ? src?.series.find((s) => s.seriesUid === c.seriesUid) : undefined };
  };
  const activeSeries = infoOf(cells[active] ?? null).series;

  useEffect(() => savePanel("left", leftOpen), [leftOpen]);
  useEffect(() => savePanel("right", rightOpen), [rightOpen]);
  useEffect(() => clearSeriesCache, []);
  useEffect(() => history.subscribe(() => setHistoryTick((t) => t + 1)), [history]);

  // ---- series list (the default layout/assignment comes from the hanging protocol effect below) ----
  useEffect(() => {
    const ac = new AbortController();
    searchSeries(DICOMWEB, studyUid, ac.signal)
      .then((s) => {
        setSeries(s);
        if (!s.length) setSeriesError("Este estudo não tem séries.");
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setSeriesError(e instanceof DicomHttpError && e.status === 403 ? "Você não tem permissão para este estudo."
          : e instanceof DicomHttpError && e.status >= 500 ? "PACS indisponível. Tente novamente." : "Não foi possível carregar o estudo.");
      });
    return () => ac.abort();
  }, [studyUid]);

  // ---- tool session (needs the engine initialised) ----
  useEffect(() => {
    let cancelled = false;
    let s: ToolSession | null = null;
    initRender()
      .then(() => {
        if (cancelled) return;
        s = new ToolSession((initial) => new Promise((resolve) => setTextPrompt({ initial, ...pointer.current, resolve })));
        setSession(s);
      })
      .catch((e) => !cancelled && setFatal(e instanceof Error ? e.message : "Falha ao iniciar o visualizador."));
    return () => { cancelled = true; s?.dispose(); setSession(null); };
  }, []);
  useEffect(() => { session?.setActive(tool); }, [session, tool]);

  useEffect(() => {
    const h = (e: PointerEvent) => { pointer.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointerdown", h, true);
    window.addEventListener("pointerup", h, true);
    return () => { window.removeEventListener("pointerdown", h, true); window.removeEventListener("pointerup", h, true); };
  }, []);

  // ---- user preferences: ONE document (PUT replaces it), so every setting must go through updatePrefs ----
  const prefsRef = useRef<Preferences>({});
  const prefsOk = useRef(false); // never write back a document we failed to read: it would erase the other settings
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    fetchPreferences()
      .then((p) => { prefsRef.current = p; prefsOk.current = true; setKeymap(effectiveKeymap(p.keymap)); setPrefs(p); })
      .catch(() => setPrefs({}));
  }, []);
  const updatePrefs = useCallback((patch: Partial<Preferences>) => {
    prefsRef.current = { ...prefsRef.current, ...patch };
    setPrefs(prefsRef.current);
    if (!prefsOk.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void savePreferences(prefsRef.current).catch(() => {}), 500);
  }, []);
  const changeKeymap = useCallback((km: Keymap) => { setKeymap(km); updatePrefs({ keymap: km }); }, [updatePrefs]);

  // ---- hanging protocol: applied once per study, when both the series and the user's protocols are known ----
  const userProtocols: Protocol[] = prefs?.protocols ?? [];
  const hpStudy = { description: study.description, modalities: study.modalities };
  const applied = useRef("");
  useEffect(() => {
    if (!series.length || !prefs || applied.current === studyUid) return;
    applied.current = studyUid;
    const r = resolveProtocol([...userProtocols, ...BUILTIN_PROTOCOLS], hpStudy, series);
    const n = r?.layout ?? 1;
    const base: Cells = r ? r.cells.map((uid) => (uid ? { studyUid, seriesUid: uid } : null)) : [{ studyUid, seriesUid: series[0]!.seriesUid }, null, null, null];
    const r0 = resume.current;
    if (r0 && series.some((s) => s.seriesUid === r0.seriesUid)) {
      for (let i = 1; i < base.length; i++) if (base[i]?.seriesUid === r0.seriesUid) base[i] = null; // the series resumed in cell 0 must not repeat
      base[0] = { studyUid, seriesUid: r0.seriesUid };
    } else resume.current = undefined;
    setLayout(n);
    setCells(fillFree(base, n, studyUid, series));
    setActive(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, prefs, studyUid]);

  function saveProtocol(name: string) {
    const mine = cells.map((c) => (c && c.studyUid === studyUid ? c.seriesUid : null)); // cells of other studies stay "any series"
    updatePrefs({ protocols: upsertProtocol(userProtocols, protocolFromLayout(crypto.randomUUID(), name, hpStudy, series, layout, mine)) });
  }

  // ---- measurements: load, restore, persist ----
  const refreshItems = useCallback(() => {
    setItems(
      allAnnotations()
        .filter((a) => a.annotationUID && known.current.has(a.annotationUID))
        .map((a) => {
          const uid = a.annotationUID!;
          const m = meta.current.get(uid);
          const imageId = a.metadata?.referencedImageId ?? null;
          const at = imageId ? imageIndex.current.get(imageId) : undefined;
          const d = describeAnnotation(a);
          return {
            uid, tool: a.metadata?.toolName ?? "", title: d.title, value: d.value, calibrated: d.calibrated,
            where: at ? `Im ${at.index + 1}` : null,
            author: m ? `${m.authorEmail} · ${new Date(m.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : null,
            authorId: m?.authorId ?? null,
            at: imageId,
          };
        }),
    );
  }, []);

  const track = useCallback(<T,>(p: Promise<T>) => {
    pending.current++;
    setSaveStatus("saving");
    return p.then(
      (v) => { pending.current--; if (!pending.current) setSaveStatus((s) => (s === "error" ? s : "idle")); return v; },
      (e) => { pending.current--; setSaveStatus("error"); throw e; },
    );
  }, []);

  // annotations are stored per study: the current one on open, a prior exam's when its series is first shown
  const loadAnnotations = useCallback((uid: string) => {
    if (loadedStudies.current.has(uid)) return;
    loadedStudies.current.add(uid);
    const g = gen.current;
    initRender()
      .then(() => fetchAnnotations(uid))
      .then((recs) => {
        if (g !== gen.current) return;
        for (const r of recs) {
          known.current.add(r.uid);
          annStudy.current.set(r.uid, uid);
          meta.current.set(r.uid, { authorId: r.authorId, authorEmail: r.authorEmail, createdAt: r.createdAt, seriesUid: r.seriesUid });
        }
        restore(recs.map((r) => ({ uid: r.uid, tool: r.tool, imageId: r.imageId, seriesUid: r.seriesUid, data: r.data })));
        history.seed(allAnnotations()); // edits of stored annotations must count as modify for undo
        refreshItems();
        Object.values(views.current).forEach((v) => v.render());
        setTimeout(refreshItems, 400); // stats of restored annotations are recomputed by the next render
      })
      .catch(() => g === gen.current && setSaveStatus("error"));
  }, [refreshItems, history]);

  useEffect(() => {
    const save = (a: Parameters<typeof serialize>[0]) => {
      const uid = a.annotationUID;
      if (!uid) return;
      const imageId = a.metadata?.referencedImageId ?? null;
      const at = imageId ? imageIndex.current.get(imageId) : undefined;
      const owner = at?.studyUid ?? annStudy.current.get(uid) ?? studyUid;
      known.current.add(uid);
      annStudy.current.set(uid, owner);
      clearTimeout(timers.current.get(uid));
      timers.current.delete(uid);
      void track(putAnnotation(owner, uid, {
        tool: a.metadata?.toolName ?? "unknown",
        imageId,
        seriesUid: at?.seriesUid ?? null,
        data: serialize(a),
      })).then((rec) => {
        meta.current.set(uid, { authorId: rec.authorId, authorEmail: rec.authorEmail, createdAt: rec.createdAt, seriesUid: rec.seriesUid });
        refreshItems();
      }).catch(() => {});
    };

    const drop = (uid: string) => {
      const owner = annStudy.current.get(uid) ?? studyUid;
      known.current.delete(uid);
      annStudy.current.delete(uid);
      clearTimeout(timers.current.get(uid));
      void track(deleteAnnotation(owner, uid)).catch(() => {});
    };
    // undo/redo are persisted here and only here (the watch handlers ignore events while history.applying)
    history.onApplied = (c) => {
      if (c.type === "remove") return drop(c.uid);
      const live = getAnnotationByUid(c.uid);
      if (live) save(live);
    };

    const unwatch = watchAnnotations({
      // some tools (e.g. ellipse) compute their stats just after "completed": wait for them so the saved copy is useful
      completed: (a) => {
        const uid = a.annotationUID;
        if (!uid || history.applying) return;
        history.recordCompleted(a);
        if (hasStats(a)) return save(a);
        known.current.add(uid);
        setTimeout(() => { const live = getAnnotationByUid(uid); if (live) save(live); }, 600);
      },
      // edits (e.g. dragging a handle, changing text) are saved after a short pause, only for saved annotations
      modified: (a) => {
        const uid = a.annotationUID;
        if (!uid || history.applying || !known.current.has(uid)) return;
        clearTimeout(timers.current.get(uid));
        timers.current.set(uid, setTimeout(() => save(a), 800));
      },
      removed: (a) => {
        const uid = a.annotationUID;
        if (!uid || history.applying) return;
        history.recordRemoved(a);
        if (known.current.has(uid)) drop(uid);
      },
      changed: refreshItems,
    });

    loadAnnotations(studyUid);

    return () => {
      gen.current++;
      history.onApplied = null;
      history.clear();
      unwatch(); // must go first: clearing below fires "removed" for every annotation and would delete them on the server
      timers.current.forEach(clearTimeout);
      timers.current.clear();
      known.current.clear();
      meta.current.clear();
      annStudy.current.clear();
      loadedStudies.current.clear();
      clearAnnotations();
    };
  }, [studyUid, refreshItems, track, loadAnnotations, history]);

  // ---- viewports ----
  const onView = useCallback((i: number, v: StackView | null) => {
    if (v) views.current[i] = v; else { delete views.current[i]; syncCtl.forget(i); }
  }, [syncCtl]);
  const onState = useCallback((i: number, s: ViewState) => {
    syncCtl.onState(i, s);
    const r = resume.current;
    if (r && cellsRef.current[i]?.seriesUid === r.seriesUid && s.count > r.index && s.index === 0) {
      resume.current = undefined;
      if (r.index > 0) views.current[i]?.goTo(r.index);
    }
    setStates((st) => ({ ...st, [i]: s }));
  }, [syncCtl]);
  const onLoaded = useCallback((uid: string, seriesUid: string, ids: string[]) => {
    ids.forEach((id, index) => imageIndex.current.set(id, { studyUid: uid, seriesUid, index }));
    loadAnnotations(uid);
    refreshItems();
  }, [refreshItems, loadAnnotations]);

  function changeLayout(n: Layout) {
    setLayout(n);
    setCells((c) => fillFree(c, n, studyUid, series));
    setActive((a) => Math.min(a, n - 1));
  }

  function assignSeries(ref: CellRef, cell = active) {
    setPlaying(false);
    syncCtl.forget(cell);
    setCells((c) => c.map((v, i) => (i === cell ? ref : v)));
  }

  // dropping a series card on a cell shows it there and makes that cell the active one
  const dropSeries = useCallback((cell: number, ref: CellRef) => {
    setActive(cell);
    assignSeries(ref, cell);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- prior exam: first series of the chosen study goes to a free cell (or beside the active one) ----
  async function openPrior(prior: StudySummary) {
    setModal(null);
    try {
      const ss = await searchSeries(DICOMWEB, prior.studyUid);
      const first = ss[0];
      if (!first) { setSeriesError("O exame anterior não tem séries."); return; }
      const free = cells.slice(0, layout).findIndex((c) => !c);
      const target = layout === 1 ? 1 : free >= 0 ? free : (active + 1) % layout;
      setExtra((x) => ({ ...x, [prior.studyUid]: { study: prior, series: ss } }));
      if (layout === 1) setLayout(2);
      assignSeries({ studyUid: prior.studyUid, seriesUid: first.seriesUid }, target);
      setActive(target);
    } catch {
      setSeriesError("Não foi possível abrir o exame anterior.");
    }
  }

  // remember where the reader is, so the worklist can offer to continue there
  const here = cells[active];
  const hereIndex = activeState?.index ?? 0;
  useEffect(() => {
    if (!here || here.studyUid !== studyUid || resume.current) return;
    const t = setTimeout(() => rememberResume(studyUid, { seriesUid: here.seriesUid, index: hereIndex }), 600);
    return () => clearTimeout(t);
  }, [studyUid, here?.seriesUid, here?.studyUid, hereIndex]);

  // ---- cine (active viewport) ----
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const v = views.current[active];
      if (!v) return;
      if (v.index >= v.count - 1) { if (!loop) setPlaying(false); else v.goTo(0); } else v.scrollBy(1);
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [playing, loop, fps, active]);

  // ---- comparison: can the active viewport be linked / crossed with the others? ----
  const compare = useMemo<CompareInfo>(() => {
    const a = views.current[active];
    const others = [0, 1, 2, 3].slice(0, layout).filter((i) => i !== active && views.current[i] && (states[i]?.count ?? 0) > 0);
    if (!a || !(states[active]?.count) || !others.length) return { scrollIssue: null, refs: { ok: false, reason: "abra duas imagens para comparar" } };
    const ga = a.geometry();
    const links = others.map((i) => compatibility(ga, views.current[i]!.geometry()));
    const cuts = others.map((i) => crossing(ga, views.current[i]!.geometry()));
    const bad = links.find((c): c is Extract<Compat, { ok: false }> => !c.ok);
    return { scrollIssue: bad?.reason ?? null, refs: cuts.find((c) => c.ok) ?? cuts[0]! };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states, active, layout, cells]);

  const refsOn = refLines && compare.refs.ok;
  const cellsKey = cells.slice(0, layout).map((c) => c?.seriesUid ?? "").join();
  useEffect(() => {
    session?.setReferenceLines(refsOn, views.current[active]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, refsOn, active, layout, cellsKey]);

  // ---- measurement list actions ----
  function jumpTo(it: MeasureItem) {
    selectAnnotation(it.uid);
    if (!it.at) return;
    const loc = imageIndex.current.get(it.at);
    const holder = loc ? cells.slice(0, layout).findIndex((c) => isCell(c, loc.studyUid, loc.seriesUid)) : -1;
    if (loc && holder >= 0 && views.current[holder]) {
      setActive(holder);
      views.current[holder]!.goTo(loc.index);
      return;
    }
    const target = loc ?? (meta.current.get(it.uid)?.seriesUid ? { studyUid: annStudy.current.get(it.uid) ?? studyUid, seriesUid: meta.current.get(it.uid)!.seriesUid! } : null);
    if (!target) return;
    setJump({ imageId: it.at, cell: active });
    assignSeries({ studyUid: target.studyUid, seriesUid: target.seriesUid });
  }

  function deleteItem(it: MeasureItem) {
    removeAnnotation(it.uid);
    Object.values(views.current).forEach((v) => v.render());
  }

  function exportJson() {
    const out = {
      exportedAt: new Date().toISOString(),
      study: { uid: studyUid, patientId: study.patientId, accession: study.accession, date: study.date },
      measurements: items.map((i) => ({ uid: i.uid, tool: i.tool, type: i.title, value: i.value, calibrated: i.calibrated, imageId: i.at, author: meta.current.get(i.uid)?.authorEmail ?? null })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = `medidas-${study.accession || studyUid.slice(-8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---- commands (toolbar buttons and keyboard share one entry point; add new ids to COMMANDS in lib/keymap.ts and a case here) ----
  const run = useCallback((id: string) => {
    const v = views.current[active];
    if (id.startsWith("tool.")) return setTool(id.slice(5) as ToolId);
    if (id.startsWith("layout.")) return changeLayout(Number(id.slice(7)) as Layout);
    switch (id) {
      case "view.rotateLeft": return v?.rotate(-90);
      case "view.rotateRight": return v?.rotate(90);
      case "view.flipH": return v?.flip("h");
      case "view.flipV": return v?.flip("v");
      case "view.invert": return v?.toggleInvert();
      case "view.fit": return v?.fit();
      case "view.reset": return v?.reset();
      case "slice.next": return v?.scrollBy(1);
      case "slice.prev": return v?.scrollBy(-1);
      case "slice.first": return v?.goTo(0);
      case "slice.last": return v?.goTo(v.count - 1);
      case "cine.toggle": return setPlaying((p) => !p);
      case "sync.scroll": return setSync((s) => ({ ...s, scroll: !s.scroll }));
      case "sync.zoomPan": return setSync((s) => ({ ...s, zoomPan: !s.zoomPan }));
      case "sync.wl": return setSync((s) => ({ ...s, wl: !s.wl }));
      case "sync.auto": return setSync((s) => ({ ...s, auto: !s.auto }));
      case "view.refLines": return setRefLines((r) => !r);
      case "study.prior": return setModal("prior");
      case "edit.undo": case "edit.redo": {
        if (id === "edit.undo") history.undo(); else history.redo();
        Object.values(views.current).forEach((x) => x.render());
        refreshItems();
        return;
      }
      case "view.scale": return setShowScale((x) => !x);
      case "study.mpr": if (mprOk) onOpenMpr(activeSeries!.seriesUid); return;
      case "protocol.manage": return setModal("protocols");
      case "app.focus": { const open = focus; setLeftOpen(open); setRightOpen(open); return; }
      case "app.toggleLeft": return setLeftOpen((o) => !o);
      case "app.toggleRight": return setRightOpen((o) => !o);
      case "app.shortcuts": return setShowKeys(true);
      case "app.back": return onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, series, onClose, focus, history]);
  const runRef = useRef(run);
  runRef.current = run;
  const keymapRef = useRef(keymap);
  keymapRef.current = keymap;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (showKeys || modal || textPrompt || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      const cmd = commandForKey(keymapRef.current, keyOf(e));
      if (!cmd || !COMMANDS.some((c) => c.id === cmd)) return;
      e.preventDefault();
      runRef.current(cmd);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showKeys, modal, textPrompt]);

  const mprOk = !!activeSeries && /^(CT|MR)$/.test(activeSeries.modality) && (activeSeries.instanceCount ?? 3) > 2;
  const pt = series.find((s) => s.modality === "PT");
  const base = series.find((s) => /^(CT|MR)$/.test(s.modality));
  const overlayText = (() => {
    const s = activeState;
    const c = infoOf(cells[active] ?? null);
    return s
      ? { tl: [personName(c.study.patientName), c.study.patientId], tr: [dicomDate(c.study.date), c.study.description], bl: [`Im ${s.index + 1}/${s.count}`, s.ww != null ? `J ${Math.round(s.ww)} N ${Math.round(s.wc ?? 0)}` : ""], br: [c.series?.modality ?? ""] }
      : undefined;
  })();
  const presets = useMemo(() => presetsFor(activeSeries?.modality), [activeSeries?.modality]);
  const ready = !!activeState && activeState.count > 0;
  const frac = activeState && activeState.count > 1 ? activeState.index / (activeState.count - 1) : 0;
  const visible = cells.slice(0, layout);

  const seriesCard = (owner: string, s: SeriesSummary) => (
    <button key={`${owner}/${s.seriesUid}`} className="ser" draggable
      onDragStart={(e) => { e.dataTransfer.setData(SERIES_MIME, JSON.stringify({ studyUid: owner, seriesUid: s.seriesUid } satisfies CellRef)); e.dataTransfer.effectAllowed = "copy"; }}
      title="Clique para abrir na imagem ativa ou arraste para uma imagem da grade"
      aria-current={visible.some((c) => isCell(c, owner, s.seriesUid))} data-active={isCell(cells[active], owner, s.seriesUid)}
      onClick={() => assignSeries({ studyUid: owner, seriesUid: s.seriesUid })}>
      <Thumb studyUid={owner} seriesUid={s.seriesUid} modality={s.modality} />
      <span>
        <b>{serName(s)}</b>
        <span className="m">#{s.number ?? "?"}{s.instanceCount != null && ` · ${s.instanceCount} imagens`}</span>
      </span>
    </button>
  );

  return (
    <div className={`app${leftOpen ? "" : " hide-left"}${rightOpen ? "" : " hide-right"}`}>
      <Topbar
        chip={<div className="study-chip"><i /><span>{patient}</span>{study.modalities[0] && <em>{study.modalities.join(" ")}</em>}</div>}
      >
      <Toolbar
        tool={tool} onTool={setTool} keymap={keymap} layout={layout} onLayout={changeLayout} invertOn={!!activeState?.invert} onCommand={run}
        extra={
          <>
            <CompareBar sync={sync} refLines={refLines} info={compare} keymap={keymap} onCommand={run} />
            <div className="grp">
              <button className="tool" title="Desfazer medida (Ctrl+Z)" aria-label="Desfazer medida" disabled={!history.canUndo} onClick={() => run("edit.undo")}><Icon name="undo" /></button>
              <button className="tool" title="Refazer medida (Ctrl+Y)" aria-label="Refazer medida" disabled={!history.canRedo} onClick={() => run("edit.redo")}><Icon name="redo" /></button>
              <SnapshotButton view={ready ? activeView() ?? null : null} overlay={overlayText} withOverlay={showOv} name={`captura-${study.accession || studyUid.slice(-6)}`} />
              <button className={`tool${showScale ? " on" : ""}`} title="Régua de escala (U)" aria-label="Régua de escala" aria-pressed={showScale} onClick={() => run("view.scale")}><Icon name="ruler" /></button>
              <button className="tool" title="Exportar relatório DICOM SR" aria-label="Exportar relatório DICOM SR" onClick={() => setModal("sr")}><Icon name="report" /></button>
              <button className="tool" title={mprOk ? "Abrir MPR / 3D (3)" : "MPR / 3D: escolha uma série de CT ou RM com mais de 2 cortes"} aria-label="Abrir MPR e 3D" disabled={!mprOk} onClick={() => run("study.mpr")}><Icon name="cube" /></button>
              {pt && base && <button className="tool" title="Fusão PET/CT" aria-label="Abrir fusão PET/CT" onClick={() => onOpenFusion(base.seriesUid, pt.seriesUid)}><Icon name="fusion" /></button>}
            </div>
          </>
        }
      />
        <button className="btn" onClick={onClose}><Icon name="prev" />Estudos</button>
        <button className="btn sq" onClick={() => run("app.toggleLeft")} title="Painel esquerdo (estudo e séries)" aria-label="Alternar painel esquerdo" aria-pressed={leftOpen}><Icon name="panelL" /></button>
        <button className="btn sq" onClick={() => run("app.toggleRight")} title="Painel direito (ajustes e medidas)" aria-label="Alternar painel direito" aria-pressed={rightOpen}><Icon name="panelR" /></button>
        <button className="btn pri" onClick={() => run("app.focus")} title="Modo foco: esconde os dois painéis" aria-pressed={focus}><Icon name="full" />Foco</button>
      </Topbar>

      <div className="main">
        <aside className="side left">
          <section className="card pad study" style={{ "--i": 1 } as CSSProperties}>
            <h3>Estudo</h3>
            <div className="who">
              <span className="avatar"><span>{initials(patient)}</span></span>
              <div><b>{patient}</b><small>{study.patientId || "—"}</small></div>
            </div>
            <dl className="kv">
              <dt>Data</dt><dd>{dicomDate(study.date)}</dd>
              <dt>Accession</dt><dd>{study.accession || "—"}</dd>
              <dt>Descrição</dt><dd>{study.description || "—"}</dd>
            </dl>
          </section>
          <section className="card pad" style={{ "--i": 2 } as CSSProperties}>
            <h3>Séries</h3>
            {seriesError && <div role="alert" className="err" style={{ marginTop: 8 }}>{seriesError}</div>}
            <div className="series-list">{series.map((s) => seriesCard(studyUid, s))}</div>
            {Object.values(extra).map((e) => (
              <div key={e.study.studyUid}>
                <h4 className="ser-head">Exame de {dicomDate(e.study.date)}{e.study.description && ` · ${e.study.description}`}</h4>
                <div className="series-list">{e.series.map((s) => seriesCard(e.study.studyUid, s))}</div>
              </div>
            ))}
          </section>
        </aside>

        <section className="center">
          <CompareNote sync={sync} refLines={refLines} info={compare} onSync={(p) => setSync((s) => ({ ...s, ...p }))} />
          <div className="vpgrid" data-n={layout}>
            {visible.map((cell, i) => {
              const info = infoOf(cell);
              return (
                <ViewportCell
                  key={i}
                  index={i}
                  active={active === i}
                  cell={cell}
                  series={info.series}
                  study={info.study}
                  foreign={!!cell && cell.studyUid !== studyUid}
                  patient={personName(info.study.patientName)}
                  session={session}
                  showOverlay={showOv}
                  showScale={showScale}
                  jumpTo={jump && jump.cell === i ? jump.imageId : null}
                  onActivate={() => setActive(i)}
                  onDropSeries={dropSeries}
                  onView={onView}
                  onState={onState}
                  onLoaded={onLoaded}
                  onJumped={() => setJump(null)}
                  onFatal={setFatal}
                />
              );
            })}
            {fatal && <div role="alert" className="vp-msg error fatal">{fatal}</div>}
          </div>

          <div className="card dock">
            <button className="tool" title="Primeira imagem" aria-label="Primeira imagem" disabled={!ready} onClick={() => run("slice.first")}><Icon name="first" /></button>
            <button className="tool" title="Imagem anterior" aria-label="Imagem anterior" disabled={!ready} onClick={() => run("slice.prev")}><Icon name="prev" /></button>
            <button className={`tool${playing ? " on" : ""}`} title="Reproduzir cine" aria-label={playing ? "Pausar cine" : "Reproduzir cine"} aria-pressed={playing} disabled={!ready || (activeState?.count ?? 0) < 2} onClick={() => setPlaying((v) => !v)}>
              <Icon name={playing ? "pause" : "play"} />
            </button>
            <button className="tool" title="Próxima imagem" aria-label="Próxima imagem" disabled={!ready} onClick={() => run("slice.next")}><Icon name="next" /></button>
            <button className="tool" title="Última imagem" aria-label="Última imagem" disabled={!ready} onClick={() => run("slice.last")}><Icon name="last" /></button>
            <input type="range" className="grow" aria-label="Imagem" min={0} max={Math.max(0, (activeState?.count ?? 1) - 1)} value={activeState?.index ?? 0} disabled={!ready}
              style={{ "--f": `${frac * 100}%` } as CSSProperties} onChange={(e) => activeView()?.goTo(Number(e.target.value))} />
            <span className="mono">Im {ready ? activeState!.index + 1 : 0}/{activeState?.count ?? 0}</span>
            <span className="lbl">FPS</span>
            <input type="range" aria-label="Quadros por segundo" min={1} max={30} value={fps} style={{ width: 90, "--f": `${((fps - 1) / 29) * 100}%` } as CSSProperties} onChange={(e) => setFps(Number(e.target.value))} />
            <span className="mono">{fps}</span>
            <button className={`chip pill${loop ? " on" : ""}`} aria-pressed={loop} onClick={() => setLoop((v) => !v)}>Ciclo</button>
          </div>
        </section>

        <Inspector
          state={activeState}
          presets={presets}
          onPreset={(p) => activeView()?.setWindow(p.ww, p.wc)}
          onDefaultWindow={() => activeView()?.reset()}
          onWindow={(ww, wc) => activeView()?.setWindow(ww, wc)}
          onInvert={() => activeView()?.toggleInvert()}
          showOverlay={showOv}
          onOverlay={setShowOv}
          items={items}
          saveStatus={saveStatus}
          onJump={jumpTo}
          onDelete={deleteItem}
          onExport={exportJson}
          extraTabs={[{
            id: "adv",
            label: "Avançado",
            content: (
              <div className="pane">
                <Overlays studyUid={studyUid} series={series} stack={activeView() ?? null} />
                <AiPanel context={activeSeries && activeView() ? { studyUid, seriesUid: activeSeries.seriesUid, modality: activeSeries.modality, imageIds: activeView()!.imageIds } : null} />
              </div>
            ),
          }]}
        />
      </div>

      {textPrompt && <InlineText initial={textPrompt.initial} x={textPrompt.x} y={textPrompt.y} onDone={(t) => { textPrompt.resolve(t); setTextPrompt(null); }} />}
      {showKeys && <ShortcutsModal keymap={keymap} onChange={changeKeymap} onReset={() => changeKeymap(defaultKeymap())} onClose={() => setShowKeys(false)} />}
      {modal === "sr" && <SrExport study={study} onClose={() => setModal(null)} />}
      {modal === "prior" && <PriorStudiesModal current={study} onPick={(s) => void openPrior(s)} onClose={() => setModal(null)} />}
      {modal === "protocols" && <ProtocolsModal protocols={userProtocols} onSave={saveProtocol} onDelete={(id) => updatePrefs({ protocols: userProtocols.filter((p) => p.id !== id) })} onClose={() => setModal(null)} />}
    </div>
  );
}
