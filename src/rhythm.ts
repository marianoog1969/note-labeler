// Duraciones a partir de lo detectado (cabeza hueca, plica, barras, puntillos) y exportación a MIDI.
import type { NoteState } from "./types";
import type { Slot } from "./player";

/** Duración en semicorcheas: redonda 16, blanca 8, negra 4, corchea 2, semicorchea 1; el puntillo suma la mitad. */
export function durOf(n: Pick<NoteState, "hollow" | "stem" | "beams" | "dots" | "tuplet">): number {
  let base: number;
  if (n.hollow) base = n.stem ? 8 : 16;
  else base = [4, 2, 1, 1][Math.min(Math.max(n.beams, 0), 3)];
  return (n.dots ? base * 1.5 : base) * (n.tuplet ? 2 / 3 : 1);
}

const REST_BASE: Record<string, number> = { whole: 16, half: 8, quarter: 4, eighth: 2, sixteenth: 1 };
export function restDur(r: { kind: string; dots: number; tuplet: number }): number {
  return REST_BASE[r.kind] * (r.dots ? 1.5 : 1) * (r.tuplet ? 2 / 3 : 1);
}

export type DurKind = "whole" | "half" | "quarter" | "eighth" | "sixteenth";
export const DUR_KINDS: DurKind[] = ["whole", "half", "quarter", "eighth", "sixteenth"];

export function kindOf(n: Pick<NoteState, "hollow" | "stem" | "beams">): DurKind {
  if (n.hollow) return n.stem ? "half" : "whole";
  return n.beams >= 2 ? "sixteenth" : n.beams === 1 ? "eighth" : "quarter";
}

export function withKind(k: DurKind): Pick<NoteState, "hollow" | "stem" | "beams"> {
  switch (k) {
    case "whole": return { hollow: true, stem: false, beams: 0 };
    case "half": return { hollow: true, stem: true, beams: 0 };
    case "quarter": return { hollow: false, stem: true, beams: 0 };
    case "eighth": return { hollow: false, stem: true, beams: 1 };
    default: return { hollow: false, stem: true, beams: 2 };
  }
}

/** Compases que se ofrecen: etiqueta, semicorcheas por compás, numerador y denominador. */
export const METERS = [
  { id: "2/4", sixteenths: 8, num: 2, den: 4 },
  { id: "3/4", sixteenths: 12, num: 3, den: 4 },
  { id: "4/4", sixteenths: 16, num: 4, den: 4 },
  { id: "3/8", sixteenths: 6, num: 3, den: 8 },
  { id: "6/8", sixteenths: 12, num: 6, den: 8 },
  { id: "9/8", sixteenths: 18, num: 9, den: 8 },
  { id: "12/8", sixteenths: 24, num: 12, den: 8 },
] as const;
export type MeterId = (typeof METERS)[number]["id"];

/** Compás más probable a partir de la suma de cada compás de la partitura (la más repetida). */
export function guessMeter(barSums: number[]): MeterId {
  const c = new Map<number, number>();
  for (const s of barSums) if (s >= 4) c.set(s, (c.get(s) ?? 0) + 1);
  let best = 0, bn = 0;
  c.forEach((n, s) => { if (n > bn) { bn = n; best = s; } });
  const pick: Record<number, MeterId> = { 6: "3/8", 8: "2/4", 12: "6/8", 16: "4/4", 18: "9/8", 24: "12/8" };
  return pick[best] ?? "4/4";
}

export const MIDI_PROGRAM: Record<string, number> = { acoustic_grand_piano: 0, alto_sax: 65, clarinet: 71, bagpipe: 109 };

function vlq(v: number): number[] {
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}

/** Archivo MIDI (formato 0, una pista) con las notas una tras otra. bpm = negras por minuto. */
export function buildMidi(slots: Slot[], bpm: number, program: number, meter: MeterId): Uint8Array {
  const PPQ = 480;
  const tick = PPQ / 4; // por semicorchea
  const m = METERS.find((x) => x.id === meter) ?? METERS[2];
  const us = Math.round(60_000_000 / bpm);
  const evs: Array<{ t: number; on: boolean; n: number }> = [];
  let t = 0;
  for (const s of slots) {
    for (const nt of s.notes) {
      const len = Math.round(nt.len * tick);
      const gap = Math.min(12, Math.floor(len / 8));
      const midi = Math.min(127, Math.max(0, nt.midi));
      evs.push({ t, on: true, n: midi }, { t: t + len - gap, on: false, n: midi });
    }
    t += Math.round(s.dur * tick);
  }
  evs.sort((a, b) => a.t - b.t || (a.on ? 1 : 0) - (b.on ? 1 : 0)); // al mismo instante suenan antes los «off»
  const ev: number[] = [];
  ev.push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
  ev.push(0, 0xff, 0x58, 4, m.num, Math.log2(m.den), 24, 8);
  ev.push(0, 0xc0, program & 127);
  let last = 0;
  for (const e of evs) {
    ev.push(...vlq(e.t - last), e.on ? 0x90 : 0x80, e.n, e.on ? 80 : 0);
    last = e.t;
  }
  ev.push(...vlq(Math.max(0, t - last)), 0xff, 0x2f, 0);
  const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255];
  const L = ev.length;
  const trk = [0x4d, 0x54, 0x72, 0x6b, (L >>> 24) & 255, (L >>> 16) & 255, (L >>> 8) & 255, L & 255];
  return new Uint8Array([...head, ...trk, ...ev]);
}

/** Suma de duraciones de cada compás de cada pentagrama, para adivinar el compás. */
export function barSums(slots: Slot[], barlines: Record<number, number[]>): number[] {
  const sums = new Map<string, number>();
  for (const s of slots) {
    const b = (barlines[s.staff] ?? []).filter((x) => x < s.x).length;
    const k = `${s.staff}|${b}`;
    sums.set(k, (sums.get(k) ?? 0) + s.dur);
  }
  return [...sums.values()];
}
