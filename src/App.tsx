import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { analyzePage, exportPdf, pickMidiPath, pickXmlPath, pickPdf, pickSavePath, readFileB64, writeFileB64, type PageLabels } from "./api";
import { DUR_KINDS, METERS, MIDI_PROGRAM, barSums, buildMidi, durOf, guessMeter, kindOf, restDur, withKind, type DurKind, type MeterId } from "./rhythm";
import { buildMusicXml, type XmlPage } from "./musicxml";
import type { Slot } from "./player";
import { Icon } from "./icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { checkUpdate, RELEASES_URL } from "./update";
import { Player, buildSlots } from "./player";
import { DEFAULT_INSTRUMENT, INSTRUMENT_IDS, Instrument, isInstrument } from "./sampler";
import { DONATE_URL, DONATE_CONFIGURED, DONATE_QR } from "./donate";
import { ACC_SYMBOL, buildLabels, effectiveStaffSetup, resolveNames, type Clef, type Notation } from "./names";
import { DPI, canvasToPngB64, loadPdf, renderPage, type PdfDoc } from "./pdf";
import type { Acc, NoteState, PageData } from "./types";
import { COLOR_NAMES, STR, defaultLang, type Lang } from "./i18n";

const COLORS = {
  azul: { name: "Azul", css: "#1a40bf", rgb: [0.1, 0.25, 0.75] as [number, number, number] },
  negro: { name: "Negro", css: "#111111", rgb: [0, 0, 0] as [number, number, number] },
  rojo: { name: "Rojo", css: "#c0262d", rgb: [0.75, 0.15, 0.18] as [number, number, number] },
  verde: { name: "Verde", css: "#1b7f3b", rgb: [0.1, 0.5, 0.23] as [number, number, number] },
};
type ColorKey = keyof typeof COLORS;

const BASE_WIDTH = 900;
const DUR_SYM: Record<string, string> = { whole: "𝅝", half: "𝅗𝅥", quarter: "♩", eighth: "♪", sixteenth: "𝅘𝅥𝅯" };
const SETTINGS_KEY = "note-labeler.ajustes";
const RECENT_KEY = "note-labeler.recientes";
const HISTORY_MAX = 100;

interface Settings {
  key: number | "auto";
  clef: Clef | "auto";
  notation: Notation;
  lang: Lang;
  showKey: boolean;
  scale: number;
  color: ColorKey;
  instrument: Instrument;
  tempo: number;
  meter: MeterId | "auto";
}
const DEFAULTS: Settings = { key: "auto", clef: "auto", notation: defaultLang() === "en" ? "anglo" : "latin", lang: defaultLang(), showKey: true, scale: 1, color: "azul", instrument: DEFAULT_INSTRUMENT, tempo: 100, meter: "auto" };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const c = { ...DEFAULTS, ...JSON.parse(raw) };
      if (!isInstrument(c.instrument)) c.instrument = DEFAULT_INSTRUMENT;
      if (!(c.tempo >= 40 && c.tempo <= 240)) c.tempo = DEFAULTS.tempo;
      if (c.meter !== "auto" && !METERS.some((m) => m.id === c.meter)) c.meter = "auto";
      return c;
    }
  } catch { /* sin ajustes guardados */ }
  return DEFAULTS;
}
function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* nada */ }
  return [];
}
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

interface Snapshot { page: number; notes: NoteState[] }
type Toast = { text: string; kind: "info" | "ok" | "error" } | null;

export default function App() {
  const [path, setPath] = useState<string | null>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pages, setPages] = useState<Record<number, PageData>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<"select" | "add">("select");
  const [cfg, setCfg] = useState<Settings>(loadSettings);
  const [pageW, setPageW] = useState(BASE_WIDTH);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [newVer, setNewVer] = useState<string | null>(null);
  useEffect(() => { void checkUpdate(__APP_VERSION__).then(setNewVer); }, []);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [help, setHelp] = useState(false);
  const [donate, setDonate] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { key, clef, notation, showKey, scale, color, lang, instrument, tempo, meter } = cfg;
  const L = STR[lang] ?? STR.en;
  const patchCfg = (p: Partial<Settings>) => setCfg((c) => ({ ...c, ...p }));
  const colorCss = COLORS[color]?.css ?? COLORS.azul.css;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const rendered = useRef(new Map<number, HTMLCanvasElement>());
  const pagesRef = useRef<Record<number, PageData>>({});
  const pending = useRef(new Map<number, Promise<PageData>>());
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const nextId = useRef(1);
  const toastTimer = useRef<number | undefined>(undefined);

  const data: PageData | undefined = pages[page];
  const numPages = doc?.numPages ?? 0;

  const notify = useCallback((text: string, kind: "info" | "ok" | "error" = "info") => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, kind });
    if (kind !== "error") toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); } catch { /* ignorar */ }
  }, [cfg]);
  useEffect(() => { setPageInput(String(page)); }, [page]);

  // ------------------------------------------------------------------ carga
  const ensurePage = useCallback((d: PdfDoc, n: number): Promise<PageData> => {
    const cached = pagesRef.current[n];
    if (cached) return Promise.resolve(cached);
    let p = pending.current.get(n);
    if (!p) {
      p = (async () => {
        const r = await renderPage(d, n);
        if (r.rotate !== 0) {
          throw new Error(L.rotated(n, r.rotate));
        }
        rendered.current.set(n, r.canvas);
        const analysis = await analyzePage(canvasToPngB64(r.canvas));
        const notes: NoteState[] = analysis.notes.map((rn) => ({
          ...rn,
          id: nextId.current++,
          acc: (rn.acc ?? "auto") as Acc,
        }));
        const pd: PageData = { analysis, notes, view: r.view };
        pagesRef.current = { ...pagesRef.current, [n]: pd };
        setPages(pagesRef.current);
        return pd;
      })().finally(() => pending.current.delete(n));
      pending.current.set(n, p);
    }
    return p;
  }, [L]);

  const fitWidth = useCallback(() => {
    const el = viewRef.current;
    if (el) setPageW(Math.max(400, Math.min(1800, el.clientWidth - 48)));
  }, []);

  const openPath = useCallback(
    async (p: string) => {
      try {
        setBusy(true);
        setBusyText(L.openingPdf);
        const b64 = await readFileB64(p);
        const d = await loadPdf(b64);
        rendered.current.clear();
        pending.current.clear();
        pagesRef.current = {};
        undoStack.current = [];
        redoStack.current = [];
        setUndoCount(0);
        setRedoCount(0);
        setPages({});
        setSelected(null);
        setMode("select");
        setPath(p);
        setDoc(d);
        setPage(1);
        setToast(null);
        setRecent((r) => {
          const nr = [p, ...r.filter((x) => x !== p)].slice(0, 5);
          try { localStorage.setItem(RECENT_KEY, JSON.stringify(nr)); } catch { /* ignorar */ }
          return nr;
        });
      } catch (e) {
        notify(L.openFail(baseName(p), String(e)), "error");
        setRecent((r) => {
          const nr = r.filter((x) => x !== p);
          try { localStorage.setItem(RECENT_KEY, JSON.stringify(nr)); } catch { /* ignorar */ }
          return nr;
        });
      } finally {
        setBusy(false);
      }
    },
    [notify, L]
  );

  const openPdf = async () => {
    try {
      const p = await pickPdf();
      if (p) await openPath(p);
    } catch (e) {
      notify(String(e), "error");
    }
  };

  // Arrastrar un PDF a la ventana
  useEffect(() => {
    let un: (() => void) | undefined;
    try {
      getCurrentWebview()
        .onDragDropEvent((e) => {
          const t = e.payload.type;
          if (t === "enter" || t === "over") setDragOver(true);
          else if (t === "leave") setDragOver(false);
          else if (t === "drop") {
            setDragOver(false);
            const f = e.payload.paths.find((x) => /\.pdf$/i.test(x));
            if (f) void openPath(f);
            else notify(L.onlyPdf, "error");
          }
        })
        .then((u) => { un = u; })
        .catch(() => { /* fuera de Tauri */ });
    } catch { /* fuera de Tauri */ }
    return () => { un?.(); };
  }, [openPath, notify, L]);

  // Al cambiar de página: analizar si hace falta
  useEffect(() => {
    if (!doc) return;
    let cancel = false;
    (async () => {
      try {
        setBusy(true);
        setBusyText(L.analyzingPage(page));
        await ensurePage(doc, page);
      } catch (e) {
        if (!cancel) notify(String(e), "error");
      } finally {
        if (!cancel) setBusy(false);
      }
    })();
    return () => { cancel = true; };
  }, [doc, page, ensurePage, notify, L]);

  useEffect(() => {
    const src = rendered.current.get(page);
    const cv = canvasRef.current;
    if (src && cv) {
      cv.width = src.width;
      cv.height = src.height;
      cv.getContext("2d")!.drawImage(src, 0, 0);
    }
  }, [data, page]);

  useEffect(() => { if (doc) fitWidth(); }, [doc, fitWidth]);

  // Ctrl + rueda = zoom
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setPageW((w) => Math.max(400, Math.min(2800, w * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---------------------------------------------------------------- nombres
  const resolved = useMemo(
    () => (data ? resolveNames(data.notes, data.analysis.staves, { key, clef, notation, showKey }) : []),
    [data, key, clef, notation, showKey]
  );
  const labels = useMemo(() => (data ? buildLabels(resolved, data.analysis.staves) : []), [data, resolved]);
  const sp = data?.analysis.staves[0]?.sp ?? 16.6;

  // ---------------------------------------------------------------- reproducción
  const player = useRef<Player | null>(null);
  if (!player.current) player.current = new Player();
  const [playing, setPlaying] = useState(false);
  const [instLoading, setInstLoading] = useState(false);
  const slots = useMemo(
    () =>
      buildSlots(
        resolved.map((r) => ({ id: r.note.id, midi: r.midi, staff: r.note.staff, x: r.note.x, dur: durOf(r.note), tied: r.note.tied })),
        (data?.analysis.rests ?? []).map((r) => ({ staff: r.staff, x: r.x, dur: restDur(r) })),
        (si) => data?.analysis.staves[si]?.sp ?? 16
      ),
    [resolved, data]
  );
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;

  useEffect(() => {
    let cancel = false;
    player.current!.instrument = instrument;
    setInstLoading(true);
    player.current!.setInstrument(instrument)
      .catch(() => { if (!cancel) notify(L.instError, "error"); })
      .finally(() => { if (!cancel) setInstLoading(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrument]);

  const stopPlay = useCallback(() => {
    player.current!.stop();
    setPlaying(false);
  }, []);

  const startPlay = useCallback(() => {
    const sl = slotsRef.current;
    if (!sl.length) return;
    let from = 0;
    if (selected !== null) {
      const i = sl.findIndex((s) => s.ids.includes(selected));
      if (i >= 0) from = i;
    }
    const ok = player.current!.play(
      sl,
      from,
      tempoRef.current,
      (ids) => { if (ids) setSelected(ids[ids.length - 1]); },
      () => setPlaying(false)
    );
    setPlaying(ok);
  }, [selected]);

  const togglePlay = useCallback(() => {
    if (player.current!.playing) stopPlay();
    else startPlay();
  }, [startPlay, stopPlay]);

  // parar al cambiar de página o cerrar
  useEffect(() => { stopPlay(); }, [page, stopPlay]);
  useEffect(() => () => player.current?.stop(), []);

  // ---------------------------------------------------------------- edición
  const updateNotes = useCallback(
    (fn: (n: NoteState[]) => NoteState[]) => {
      const cur = pagesRef.current[page];
      if (!cur) return;
      undoStack.current.push({ page, notes: cur.notes });
      if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
      redoStack.current = [];
      setUndoCount(undoStack.current.length);
      setRedoCount(0);
      pagesRef.current = { ...pagesRef.current, [page]: { ...cur, notes: fn(cur.notes) } };
      setPages(pagesRef.current);
    },
    [page]
  );

  const swap = useCallback((from: Snapshot[], to: Snapshot[]) => {
    const snap = from.pop();
    if (!snap) return;
    const cur = pagesRef.current[snap.page];
    if (!cur) return;
    to.push({ page: snap.page, notes: cur.notes });
    pagesRef.current = { ...pagesRef.current, [snap.page]: { ...cur, notes: snap.notes } };
    setPages(pagesRef.current);
    setPage(snap.page);
    setSelected(null);
    setUndoCount(undoStack.current.length);
    setRedoCount(redoStack.current.length);
  }, []);
  const undo = useCallback(() => swap(undoStack.current, redoStack.current), [swap]);
  const redo = useCallback(() => swap(redoStack.current, undoStack.current), [swap]);

  const setAcc = useCallback(
    (a: Acc) => {
      if (selected === null) return;
      updateNotes((ns) => ns.map((n) => (n.id === selected ? { ...n, acc: a } : n)));
    },
    [selected, updateNotes]
  );

  const setKind = useCallback(
    (k: DurKind) => {
      if (selected === null) return;
      updateNotes((ns) => ns.map((n) => (n.id === selected ? { ...n, ...withKind(k) } : n)));
    },
    [selected, updateNotes]
  );
  const toggleDot = useCallback(() => {
    if (selected === null) return;
    updateNotes((ns) => ns.map((n) => (n.id === selected ? { ...n, dots: n.dots ? 0 : 1 } : n)));
  }, [selected, updateNotes]);

  const toggleTied = useCallback(() => {
    if (selected === null) return;
    updateNotes((ns) => ns.map((n) => (n.id === selected ? { ...n, tied: !n.tied } : n)));
  }, [selected, updateNotes]);
  const toggleTuplet = useCallback(() => {
    if (selected === null) return;
    updateNotes((ns) => ns.map((n) => (n.id === selected ? { ...n, tuplet: n.tuplet ? 0 : 3 } : n)));
  }, [selected, updateNotes]);

  const shiftPitch = useCallback(
    (d: 1 | -1) => {
      if (selected === null || !data) return;
      updateNotes((ns) =>
        ns.map((n) => {
          if (n.id !== selected) return n;
          const sp = data.analysis.staves[n.staff]?.sp ?? 0;
          return { ...n, step: n.step + d, y: n.y - d * sp / 2 };
        })
      );
    },
    [selected, data, updateNotes]
  );

  const deleteSelected = useCallback(() => {
    if (selected === null) return;
    updateNotes((ns) => ns.filter((n) => n.id !== selected));
    setSelected(null);
  }, [selected, updateNotes]);

  const ordered = useMemo(
    () => (data ? [...data.notes].sort((a, b) => a.staff - b.staff || a.x - b.x || b.step - a.step) : []),
    [data]
  );

  const moveSelection = useCallback(
    (dir: 1 | -1, onlyMarked = false) => {
      const list = onlyMarked ? ordered.filter((n) => n.acc !== "auto") : ordered;
      if (!list.length) return;
      const pos = ordered.findIndex((n) => n.id === selected);
      let next: NoteState | undefined;
      if (pos < 0) next = dir === 1 ? list[0] : list[list.length - 1];
      else if (dir === 1) next = list.find((n) => ordered.indexOf(n) > pos) ?? list[list.length - 1];
      else next = [...list].reverse().find((n) => ordered.indexOf(n) < pos) ?? list[0];
      if (next) setSelected(next.id);
    },
    [ordered, selected]
  );

  // llevar la nota seleccionada a la vista
  useEffect(() => {
    if (selected === null) return;
    const el = svgRef.current?.querySelector(`[data-note="${selected}"]`);
    (el as SVGElement | null)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "SELECT" || t.tagName === "INPUT")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        shiftPitch(e.key === "ArrowUp" ? 1 : -1);
        return;
      }
      switch (e.key) {
        case "b": setAcc("b"); break;
        case "n": setAcc("n"); break;
        case "s": case "#": setAcc("#"); break;
        case "a": setAcc("auto"); break;
        case "Delete": case "Backspace": deleteSelected(); break;
        case "ArrowRight": e.preventDefault(); moveSelection(1); break;
        case "ArrowLeft": e.preventDefault(); moveSelection(-1); break;
        case "ArrowDown": e.preventDefault(); moveSelection(1, true); break;
        case "ArrowUp": e.preventDefault(); moveSelection(-1, true); break;
        case " ": e.preventDefault(); togglePlay(); break;
        case "PageDown": setPage((p) => Math.min(numPages || 1, p + 1)); break;
        case "PageUp": setPage((p) => Math.max(1, p - 1)); break;
        case "+": case "=": setMode("add"); break;
        case "v": setMode("select"); break;
        case "?": setHelp((h) => !h); break;
        case "Escape": setSelected(null); setMode("select"); setHelp(false); setDonate(false); break;
        default: return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setAcc, shiftPitch, togglePlay, deleteSelected, moveSelection, undo, redo, numPages]);

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!data || !svgRef.current) return;
    if (mode !== "add") { setSelected(null); return; }
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svgRef.current.getScreenCTM()!.inverse());
    let best = -1;
    let bd = Infinity;
    data.analysis.staves.forEach((s, i) => {
      if (p.x < s.x0 || p.x > s.x1 || p.y < s.top - 4 * s.sp || p.y > s.bottom + 4 * s.sp) return;
      const d = Math.abs(p.y - (s.top + s.bottom) / 2);
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) { notify(L.clickInStaff, "info"); return; }
    const s = data.analysis.staves[best];
    const step = Math.round((s.bottom - p.y) / (s.sp / 2));
    const n: NoteState = { id: nextId.current++, staff: best, x: p.x, y: s.bottom - (step * s.sp) / 2, step, acc: "auto", hollow: false, stem: true, beams: 0, dots: 0, tied: false, tuplet: 0 };
    updateNotes((ns) => [...ns, n]);
    setSelected(n.id);
  };

  // --------------------------------------------------------------- exportar
  /** Notas y silencios de todas las páginas como instantes, más los compases y el compás (métrica) deducido. */
  const gatherTimeline = async () => {
    if (!doc) return null;
    const all: Slot[] = [];
    const xmlPages: XmlPage[] = [];
    const bl: Record<number, number[]> = {};
    let staffBase = 0;
    for (let n = 1; n <= doc.numPages; n++) {
      setBusyText(L.preparing(n, doc.numPages));
      const pd = await ensurePage(doc, n);
      const res = resolveNames(pd.notes, pd.analysis.staves, { key, clef, notation, showKey });
      const sl = buildSlots(
        res.map((r) => ({ id: r.note.id, midi: r.midi, staff: r.note.staff + staffBase, x: r.note.x, dur: durOf(r.note), tied: r.note.tied })),
        pd.analysis.rests.map((r) => ({ staff: r.staff + staffBase, x: r.x, dur: restDur(r) })),
        (si) => pd.analysis.staves[si - staffBase]?.sp ?? 16
      );
      all.push(...sl);
      pd.analysis.staves.forEach((st, si) => { bl[si + staffBase] = st.barlines; });
      xmlPages.push({ staves: pd.analysis.staves, notes: pd.notes, rests: pd.analysis.rests, resolved: res, setup: effectiveStaffSetup(pd.analysis.staves, key, clef) });
      staffBase += pd.analysis.staves.length;
    }
    const m: MeterId = meter === "auto" ? guessMeter(barSums(all, bl)) : meter;
    return { all, xmlPages, m };
  };

  const doMidi = async () => {
    if (!doc || !path) return;
    try {
      const dst = await pickMidiPath(path.replace(/\.pdf$/i, "") + ".mid");
      if (!dst) return;
      setBusy(true);
      const tl = await gatherTimeline();
      if (!tl || !tl.all.some((s) => s.notes.length)) { notify(L.noNotes, "info"); return; }
      const bytes = buildMidi(tl.all, tempo, MIDI_PROGRAM[instrument] ?? 0, tl.m);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      await writeFileB64(dst, btoa(bin));
      notify(L.midiSaved(baseName(dst)), "ok");
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const doXml = async () => {
    if (!doc || !path) return;
    try {
      const dst = await pickXmlPath(path.replace(/\.pdf$/i, "") + ".musicxml");
      if (!dst) return;
      setBusy(true);
      const tl = await gatherTimeline();
      if (!tl || !tl.all.some((s) => s.notes.length)) { notify(L.noNotes, "info"); return; }
      const xml = buildMusicXml(tl.xmlPages, baseName(path).replace(/\.pdf$/i, ""), tempo, tl.m);
      const bytes = new TextEncoder().encode(xml);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      await writeFileB64(dst, btoa(bin));
      notify(L.xmlSaved(baseName(dst)), "ok");
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    if (!doc || !path) return;
    try {
      const def = path.replace(/\.pdf$/i, "") + L.suffix;
      const dst = await pickSavePath(def);
      if (!dst) return;
      setBusy(true);
      const out: PageLabels[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        setBusyText(L.preparing(n, doc.numPages));
        const pd = await ensurePage(doc, n);
        const res = resolveNames(pd.notes, pd.analysis.staves, { key, clef, notation, showKey });
        const lb = buildLabels(res, pd.analysis.staves);
        const fsp = pd.analysis.staves[0]?.sp ?? 16.6;
        out.push({ page: n, view: pd.view, dpi: DPI, font_px: 1.2 * fsp * scale, labels: lb });
      }
      setBusyText(L.writing);
      await exportPdf(path, dst, out, COLORS[color].rgb);
      notify(L.saved(baseName(dst)), "ok");
    } catch (e) {
      notify(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const goPage = (v: string) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 1 && n <= numPages) setPage(n);
    else setPageInput(String(page));
  };

  const selNote = data?.notes.find((n) => n.id === selected);
  const selRes = resolved.find((r) => r.note.id === selected);
  const total = data?.notes.length ?? 0;
  const marked = data?.notes.filter((n) => n.acc !== "auto").length ?? 0;
  const select = (id: number) => (e: React.MouseEvent) => {
    if (mode === "add") return;
    e.stopPropagation();
    setSelected(id);
  };
  const sym = (r: { text: string; shown: "b" | "n" | "#" | null }) => r.text + (r.shown ? ACC_SYMBOL[r.shown] : "");

  return (
    <div className="shell">
      {/* ---------------------------------------------------------- cabecera */}
      <header className="top">
        <div className="brand">
          <Icon name="music" size={22} />
          <div>
            <div className="brand-name">Note Labeler <span className="ver">v{__APP_VERSION__}</span></div>
            <div className="brand-sub">{path ? baseName(path) : L.tagline}</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn donate" onClick={() => setDonate(true)} title={L.donateTip}>
            <Icon name="heart" /> {L.donate}
          </button>
          <button
            className="btn"
            onClick={() => patchCfg({ lang: lang === "es" ? "en" : "es" })}
            title={L.language}
          >
            <Icon name="globe" /> {lang === "es" ? "EN" : "ES"}
          </button>
          <button className="btn" onClick={() => setHelp(true)} title={L.helpTip}>
            <Icon name="help" /> {L.help}
          </button>
          <button className="btn" onClick={openPdf} disabled={busy} title={L.openTip}>
            <Icon name="folder" /> {L.open}
          </button>
          <button className="btn" onClick={doMidi} disabled={!doc || busy} title={L.midiTip}>
            <Icon name="download" /> MIDI
          </button>
          <button className="btn" onClick={doXml} disabled={!doc || busy} title={L.xmlTip}>
            <Icon name="download" /> MusicXML
          </button>
          <button className="btn primary" onClick={doExport} disabled={!doc || busy} title={L.exportTip}>
            <Icon name="download" /> {L.exportPdf}
          </button>
        </div>
      </header>

      <div className="main">
        {/* ---------------------------------------------------- panel de ajustes */}
        <aside className="panel left">
          <h3>{L.score}</h3>
          <label className="field">
            <span>{L.keySig}</span>
            <select value={key} onChange={(e) => patchCfg({ key: e.target.value === "auto" ? "auto" : Number(e.target.value) })}>
              <option value="auto">{L.keyAuto}</option>
              {L.keys.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <div className="field">
            <span>{L.clef}</span>
            <div className="seg">
              <button className={clef === "auto" ? "on" : ""} onClick={() => patchCfg({ clef: "auto" })}>{L.auto}</button>
              <button className={clef === "treble" ? "on" : ""} onClick={() => patchCfg({ clef: "treble" })}>{L.treble}</button>
              <button className={clef === "bass" ? "on" : ""} onClick={() => patchCfg({ clef: "bass" })}>{L.bass}</button>
            </div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={showKey} onChange={(e) => patchCfg({ showKey: e.target.checked })} />
            <span className="track" />
            <span>{L.showKey}</span>
          </label>

          <h3>{L.sound}</h3>
          <label className="field">
            <span>{L.instrument}{instLoading ? ` · ${L.instLoading}` : ""}</span>
            <select value={instrument} onChange={(e) => patchCfg({ instrument: e.target.value as Instrument })}>
              {INSTRUMENT_IDS.map((id) => <option key={id} value={id}>{L.instNames[id]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{L.meter}</span>
            <select value={meter} onChange={(e) => patchCfg({ meter: e.target.value as MeterId | "auto" })}>
              <option value="auto">{L.auto}</option>
              {METERS.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{L.tempo} <b>{tempo}</b></span>
            <input type="range" min={40} max={240} step={5} value={tempo} onChange={(e) => patchCfg({ tempo: Number(e.target.value) })} />
          </label>

          <h3>{L.text}</h3>
          <div className="field">
            <span>{L.notation}</span>
            <div className="seg">
              <button className={notation === "latin" ? "on" : ""} onClick={() => patchCfg({ notation: "latin" })}>Do Re Mi</button>
              <button className={notation === "anglo" ? "on" : ""} onClick={() => patchCfg({ notation: "anglo" })}>C D E</button>
            </div>
          </div>
          <label className="field">
            <span>{L.size} <b>{Math.round(scale * 100)} %</b></span>
            <input type="range" min={0.7} max={1.6} step={0.05} value={scale} onChange={(e) => patchCfg({ scale: Number(e.target.value) })} />
          </label>
          <div className="field">
            <span>{L.color}</span>
            <div className="swatches">
              {(Object.keys(COLORS) as ColorKey[]).map((c) => (
                <button
                  key={c}
                  className={"swatch" + (color === c ? " on" : "")}
                  style={{ background: COLORS[c].css }}
                  title={COLOR_NAMES[lang][c]}
                  onClick={() => patchCfg({ color: c })}
                />
              ))}
            </div>
          </div>

          {doc && (
            <div className="card">
              <div className="card-row"><Icon name="file" size={16} /> <b>{baseName(path ?? "")}</b></div>
              <div className="muted">{numPages} {L.page(numPages)}</div>
              <div className="muted">{L.analyzedOnExport(numPages)}</div>
            </div>
          )}
        </aside>

        {/* ---------------------------------------------------------- partitura */}
        <section className="center">
          <div className="view" ref={viewRef}>
            {!doc && (
              <div className={"drop" + (dragOver ? " over" : "")}>
                <Icon name="upload" size={40} />
                <div className="big">{L.dropHere}</div>
                <div className="muted">{L.or}</div>
                <button className="btn primary lg" onClick={openPdf} disabled={busy}>
                  <Icon name="folder" /> {L.openPdf}
                </button>
                {recent.length > 0 && (
                  <div className="recent">
                    <div className="muted">{L.recent}</div>
                    {recent.map((r) => (
                      <button key={r} className="recent-item" onClick={() => void openPath(r)} title={r}>
                        <Icon name="file" size={16} /> {baseName(r)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {doc && (
              <div className="page" style={{ width: pageW }}>
                <canvas ref={canvasRef} />
                {!data && busy && (
                  <div className="loading"><Icon name="spinner" size={28} /> {busyText || L.analyzing}</div>
                )}
                {data && (
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${data.analysis.width} ${data.analysis.height}`}
                    onClick={onSvgClick}
                    style={{ cursor: mode === "add" ? "crosshair" : "default" }}
                  >
                    {labels.map((l, i) => (
                      <text
                        key={i}
                        x={l.x}
                        y={l.y}
                        textAnchor="middle"
                        fontSize={1.2 * sp * scale}
                        fontWeight={700}
                        fill={l.id === selected ? "#d6336c" : colorCss}
                        className="lbl"
                        style={{ cursor: mode === "add" ? "crosshair" : "pointer" }}
                        onClick={l.id !== undefined ? select(l.id) : undefined}
                      >
                        {l.text}
                        {l.acc ? ACC_SYMBOL[l.acc] : ""}
                      </text>
                    ))}
                    {data.analysis.rests.map((r, i) => (
                      <rect key={"r" + i} className="rest-mark" x={r.x - 0.6 * sp} y={r.y - 1.4 * sp} width={1.2 * sp} height={2.8 * sp} rx={3}>
                        <title>{L.restNames[r.kind]}</title>
                      </rect>
                    ))}
                    {data.notes.map((n) => (
                      <circle
                        key={n.id}
                        data-note={n.id}
                        className={"hit" + (n.id === selected ? " sel" : n.acc !== "auto" ? " marked" : "")}
                        cx={n.x}
                        cy={n.y}
                        r={0.8 * sp}
                        style={{ cursor: mode === "add" ? "crosshair" : "pointer" }}
                        onClick={select(n.id)}
                      />
                    ))}
                  </svg>
                )}
              </div>
            )}
          </div>

          {/* barra de herramientas flotante */}
          {doc && (
            <div className="float tools">
              <button className={"ic" + (mode === "select" ? " on" : "")} onClick={() => setMode("select")} title={L.select}>
                <Icon name="cursor" />
              </button>
              <button className={"ic" + (mode === "add" ? " on" : "")} onClick={() => setMode("add")} disabled={!data} title={L.add}>
                <Icon name="plus" />
              </button>
              <span className="vsep" />
              <button className={"ic" + (playing ? " on" : "")} onClick={togglePlay} disabled={!data || !slots.length || instLoading} title={playing ? L.stopTip : L.playTip}>
                <Icon name={playing ? "stop" : "play"} />
              </button>
              <span className="vsep" />
              <button className="ic" onClick={undo} disabled={undoCount === 0} title={L.undo}><Icon name="undo" /></button>
              <button className="ic" onClick={redo} disabled={redoCount === 0} title={L.redo}><Icon name="redo" /></button>
              <span className="vsep" />
              <button className="ic" onClick={() => setPageW((w) => Math.max(400, w / 1.2))} title={L.zoomOut}><Icon name="zoomOut" /></button>
              <span className="zoom">{Math.round((pageW / BASE_WIDTH) * 100)} %</span>
              <button className="ic" onClick={() => setPageW((w) => Math.min(2800, w * 1.2))} title={L.zoomIn}><Icon name="zoomIn" /></button>
              <button className="ic" onClick={fitWidth} title={L.fit}><Icon name="fit" /></button>
            </div>
          )}

          {/* navegación de páginas */}
          {doc && numPages > 1 && (
            <div className="float pager">
              <button className="ic" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} title={L.prevPage}>
                <Icon name="left" />
              </button>
              <span>{L.pageWord}</span>
              <input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={(e) => goPage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") goPage((e.target as HTMLInputElement).value); }}
                inputMode="numeric"
              />
              <span>{L.of} {numPages}</span>
              <button className="ic" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages} title={L.nextPage}>
                <Icon name="right" />
              </button>
            </div>
          )}

          {newVer && (
            <div className="toast ok update">
              <Icon name="globe" />
              <span>{L.newVersion} v{newVer}</span>
              <button className="btn" onClick={() => openUrl(RELEASES_URL).catch(() => window.open(RELEASES_URL, "_blank"))}>{L.download}</button>
              <button className="ic small" onClick={() => setNewVer(null)} title={L.close}><Icon name="x" size={14} /></button>
            </div>
          )}
          {/* avisos */}
          {busy && doc && data && (
            <div className="toast info"><Icon name="spinner" /> {busyText}</div>
          )}
          {toast && !busy && (
            <div className={"toast " + toast.kind}>
              <Icon name={toast.kind === "ok" ? "check" : toast.kind === "error" ? "alert" : "help"} />
              <span>{toast.text}</span>
              <button className="ic small" onClick={() => setToast(null)} title={L.close}><Icon name="x" size={14} /></button>
            </div>
          )}
        </section>

        {/* -------------------------------------------------------- panel de nota */}
        <aside className="panel right">
          {selNote && selRes ? (
            <>
              <h3>{L.selectedNote}</h3>
              <div className="bignote" style={{ color: colorCss }}>{sym(selRes)}</div>
              <div className="muted center-t">{L.staff} {selNote.staff + 1}{selNote.acc !== "auto" ? ` · ${L.marked}` : ""}</div>

              <div className="field">
                <span>{L.accidental}</span>
                <div className="seg four">
                  <button className={selNote.acc === "auto" ? "on" : ""} onClick={() => setAcc("auto")} title={L.accAutoTip}>{L.auto}</button>
                  <button className={selNote.acc === "b" ? "on" : ""} onClick={() => setAcc("b")} title={L.flat}>♭</button>
                  <button className={selNote.acc === "n" ? "on" : ""} onClick={() => setAcc("n")} title={L.natural}>♮</button>
                  <button className={selNote.acc === "#" ? "on" : ""} onClick={() => setAcc("#")} title={L.sharp}>♯</button>
                </div>
              </div>

              <div className="field">
                <span>{L.pitch}</span>
                <div className="seg">
                  <button onClick={() => shiftPitch(1)} title={L.pitchUp}>▲</button>
                  <button onClick={() => shiftPitch(-1)} title={L.pitchDown}>▼</button>
                </div>
              </div>

              <div className="field">
                <span>{L.duration}</span>
                <div className="seg five">
                  {DUR_KINDS.map((k) => (
                    <button key={k} className={kindOf(selNote) === k ? "on" : ""} onClick={() => setKind(k)} title={L.durNames[k]}>{DUR_SYM[k]}</button>
                  ))}
                </div>
                <div className="row">
                  <button className={"btn" + (selNote.dots ? " primary" : "")} onClick={toggleDot} title={L.dotTip}>{L.dot} ·</button>
                  <button className={"btn" + (selNote.tied ? " primary" : "")} onClick={toggleTied} title={L.tieTip}>{L.tie}</button>
                  <button className={"btn" + (selNote.tuplet ? " primary" : "")} onClick={toggleTuplet} title={L.tupletTip}>{L.tuplet}</button>
                </div>
              </div>

              <div className="row">
                <button className="btn" onClick={() => moveSelection(-1)}><Icon name="left" /> {L.prev}</button>
                <button className="btn" onClick={() => moveSelection(1)}>{L.next} <Icon name="right" /></button>
              </div>
              <button className="btn danger" onClick={deleteSelected}><Icon name="trash" /> {L.delete}</button>
            </>
          ) : (
            <>
              <h3>{L.fixNotes}</h3>
              <p className="muted">
                {data
                  ? L.clickHint
                  : L.openToStart}
              </p>
            </>
          )}

          {data && (
            <>
              <h3>{L.review(page)}</h3>
              <div className="stats">
                <div><b>{total}</b><span>{L.notes}</span></div>
                <div><b>{marked}</b><span>{L.withAcc}</span></div>
              </div>
              <div className="row">
                <button className="btn" onClick={() => moveSelection(-1, true)} disabled={marked === 0} title={L.prevAcc}>
                  <Icon name="left" /> {L.prev}
                </button>
                <button className="btn" onClick={() => moveSelection(1, true)} disabled={marked === 0} title={L.nextAcc}>
                  {L.next} <Icon name="right" />
                </button>
              </div>
              <p className="muted small">{L.reviewHint}</p>
            </>
          )}
        </aside>
      </div>

      {/* -------------------------------------------------------------- donar */}
      {donate && (
        <div className="modal-bg" onClick={() => setDonate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{L.supportTitle}</h2>
              <button className="ic" onClick={() => setDonate(false)} title={L.close}><Icon name="x" /></button>
            </div>
            <p className="donate-text">{L.supportText}</p>
            <button
              className="btn primary lg donate-go"
              disabled={!DONATE_CONFIGURED}
              onClick={() => openUrl(DONATE_URL).catch(() => window.open(DONATE_URL, "_blank"))}
            >
              <Icon name="heart" /> {L.donatePaypal}
            </button>
            {DONATE_QR && (
              <div className="donate-qr">
                <img src={DONATE_QR} alt={L.qrAlt} />
                <span>{L.qrText}</span>
              </div>
            )}
            {!DONATE_CONFIGURED && <p className="donate-note">Enlace sin configurar: edita <code>src/donate.ts</code>.</p>}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- ayuda */}
      {help && (
        <div className="modal-bg" onClick={() => setHelp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{L.shortcuts}</h2>
              <button className="ic" onClick={() => setHelp(false)} title={L.close}><Icon name="x" /></button>
            </div>
            <table>
              <tbody>
                {L.sc.map(([k, d]) => (
                  <tr key={k}><td>{k.split(" ").map((p, i) => <kbd key={i}>{p}</kbd>)}</td><td>{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
