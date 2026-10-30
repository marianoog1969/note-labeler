import type { Acc, Label, NoteState, Staff } from "./types";

export type Clef = "treble" | "bass";
export type Notation = "latin" | "anglo";

const LATIN = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
const ANGLO = ["C", "D", "E", "F", "G", "A", "B"];
// Índices de letra (C=0 … B=6) en el orden de aparición en la armadura
const FLATS_ORDER = [6, 2, 5, 1, 4, 0, 3]; // Si Mi La Re Sol Do Fa
const SHARPS_ORDER = [3, 0, 4, 1, 5, 2, 6]; // Fa Do Sol Re La Mi Si

/** Letra (0=Do … 6=Si) de la línea inferior: Mi (clave de Sol) o Sol (clave de Fa). */
const CLEF_BASE: Record<Clef, number> = { treble: 2, bass: 4 };

export function keyAccidentals(key: number): Array<"b" | "#" | null> {
  const res: Array<"b" | "#" | null> = [null, null, null, null, null, null, null];
  if (key < 0) for (let i = 0; i < -key; i++) res[FLATS_ORDER[i]] = "b";
  if (key > 0) for (let i = 0; i < key; i++) res[SHARPS_ORDER[i]] = "#";
  return res;
}

export function letterOf(step: number, clef: Clef): number {
  return (((CLEF_BASE[clef] + step) % 7) + 7) % 7;
}

export interface Resolved {
  note: NoteState;
  letter: number;
  /** alteración efectiva ("b", "#", "n") o null si es natural sin signo */
  shown: "b" | "#" | "n" | null;
  text: string;
}

export interface Options {
  /** "auto" = la detectada en cada pentagrama (si falta, la del anterior) */
  key: number | "auto";
  clef: Clef | "auto";
  notation: Notation;
  showKey: boolean;
}

/** Clave y armadura efectivas de cada pentagrama según el ajuste elegido. */
export function effectiveStaffSetup(staves: Staff[], key: number | "auto", clef: Clef | "auto"): Array<{ key: number; clef: Clef }> {
  let lastKey = 0;
  let lastClef: Clef = "treble";
  return staves.map((s) => {
    if (s.key != null) lastKey = s.key;
    if (s.clef != null) lastClef = s.clef;
    return { key: key === "auto" ? lastKey : key, clef: clef === "auto" ? lastClef : clef };
  });
}

/**
 * Resuelve el nombre de cada nota. Las alteraciones puestas a mano se arrastran
 * hasta la siguiente barra de compás a las notas de la misma altura, como en una
 * partitura; la armadura se aplica al resto.
 */
export function resolveNames(notes: NoteState[], staves: Staff[], o: Options): Resolved[] {
  const setup = effectiveStaffSetup(staves, o.key, o.clef);
  const keyAccs = setup.map((s) => keyAccidentals(s.key));
  const sorted = [...notes].sort((a, b) => a.staff - b.staff || a.x - b.x || b.step - a.step);
  const carry = new Map<string, Acc>(); // "staff|compás|paso" -> alteración
  const out: Resolved[] = [];
  const names = o.notation === "latin" ? LATIN : ANGLO;

  for (const n of sorted) {
    const st = staves[n.staff];
    const bar = st ? st.barlines.filter((b) => b < n.x).length : 0;
    const ck = `${n.staff}|${bar}|${n.step}`;
    const keyAcc = keyAccs[n.staff] ?? keyAccidentals(0);
    const letter = letterOf(n.step, setup[n.staff]?.clef ?? "treble");
    let eff: Acc = n.acc;
    if (eff === "auto") {
      const c = carry.get(ck);
      if (c) eff = c;
    } else {
      carry.set(ck, eff);
    }
    let shown: Resolved["shown"] = null;
    if (eff === "auto") {
      shown = o.showKey ? keyAcc[letter] : null;
    } else if (eff === "n") {
      shown = keyAcc[letter] ? "n" : null; // un becuadro sobre una nota natural no aporta nada
    } else {
      shown = eff;
    }
    // Si la alteración arrastrada coincide con la de la armadura y no se muestran las de armadura
    if (eff !== "auto" && eff === keyAcc[letter] && !o.showKey) shown = null;
    out.push({ note: n, letter, shown, text: names[letter] });
  }
  return out;
}

export const ACC_SYMBOL: Record<string, string> = { b: "♭", n: "♮", "#": "♯" };

/** Etiquetas para exportar. Los acordes se apilan hacia abajo (nota aguda primero). */
export function buildLabels(resolved: Resolved[], staves: Staff[]): Label[] {
  const labels: Label[] = [];
  const groups = new Map<string, Resolved[]>();
  for (const r of resolved) {
    const st = staves[r.note.staff];
    const key = `${r.note.staff}|${Math.round(r.note.x / (0.4 * st.sp))}`;
    const g = groups.get(key) ?? [];
    g.push(r);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.sort((a, b) => b.note.step - a.note.step);
    g.forEach((r, i) => {
      const st = staves[r.note.staff];
      labels.push({
        id: r.note.id,
        x: r.note.x,
        y: st.bottom + 3.1 * st.sp + i * 1.35 * st.sp,
        text: r.text,
        acc: r.shown,
      });
    });
  }
  return labels;
}
