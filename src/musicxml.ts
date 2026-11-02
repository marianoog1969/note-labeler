// Exportación a MusicXML (score-partwise 3.1): una parte, un compás por cada compás de la partitura.
import { METERS, durOf, kindOf, restDur, type MeterId } from "./rhythm";
import type { Resolved } from "./names";
import type { NoteState, Rest, Staff } from "./types";

export interface XmlPage {
  staves: Staff[];
  notes: NoteState[];
  rests: Rest[];
  resolved: Resolved[];
  setup: Array<{ key: number; clef: "treble" | "bass" }>;
}

const TYPE: Record<string, string> = { whole: "whole", half: "half", quarter: "quarter", eighth: "eighth", sixteenth: "16th" };
const STEP = ["C", "D", "E", "F", "G", "A", "B"];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DIV = 12; // divisiones por negra (1 semicorchea = 3)

interface Item {
  x: number;
  dur: number;
  rest?: Rest;
  notes: Array<{ n: NoteState; r: Resolved }>;
}

export function buildMusicXml(pages: XmlPage[], title: string, bpm: number, meter: MeterId): string {
  const m = METERS.find((x) => x.id === meter) ?? METERS[2];
  let out = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="3.1">\n`;
  out += `<work><work-title>${esc(title)}</work-title></work>\n<identification><encoding><software>Note Labeler</software></encoding></identification>\n`;
  out += `<part-list><score-part id="P1"><part-name>Melodía</part-name></score-part></part-list>\n<part id="P1">\n`;
  let mnum = 0;
  let lastKey: number | null = null;
  let lastClef: string | null = null;
  const tiePending = new Set<number>(); // alturas MIDI que llegan ligadas desde la nota anterior

  for (const pg of pages) {
    pg.staves.forEach((st, si) => {
      const bl = [...st.barlines].sort((a, b) => a - b);
      const sp = st.sp;
      const raw: Item[] = [];
      const push = (x: number, dur: number, rest?: Rest, note?: { n: NoteState; r: Resolved }) => {
        const last = raw[raw.length - 1];
        if (last && Math.abs(last.x - x) < 0.5 * sp && !!note && last.notes.length > 0) {
          last.notes.push(note);
          last.dur = Math.min(last.dur, dur);
        } else raw.push({ x, dur, rest, notes: note ? [note] : [] });
      };
      const merged: Array<{ x: number; dur: number; rest?: Rest; note?: { n: NoteState; r: Resolved } }> = [
        ...pg.resolved.filter((r) => r.note.staff === si).map((r) => ({ x: r.note.x, dur: durOf(r.note), note: { n: r.note, r } })),
        ...pg.rests.filter((r) => r.staff === si).map((r) => ({ x: r.x, dur: restDur(r), rest: r })),
      ].sort((a, b) => a.x - b.x);
      merged.forEach((q) => push(q.x, q.dur, q.rest, q.note));
      const bars = new Map<number, Item[]>();
      raw.forEach((it) => {
        const b = bl.filter((x) => x < it.x).length;
        bars.set(b, [...(bars.get(b) ?? []), it]);
      });
      const setup = pg.setup[si];
      [...bars.keys()].sort((a, b) => a - b).forEach((b, bi) => {
        mnum += 1;
        out += `<measure number="${mnum}">\n`;
        const needKey = lastKey !== setup.key;
        const needClef = lastClef !== setup.clef;
        if (mnum === 1 || (bi === 0 && (needKey || needClef))) {
          out += `<attributes>`;
          if (mnum === 1) out += `<divisions>${DIV}</divisions>`;
          if (needKey) out += `<key><fifths>${setup.key}</fifths></key>`;
          if (mnum === 1) out += `<time><beats>${m.num}</beats><beat-type>${m.den}</beat-type></time>`;
          if (needClef) out += setup.clef === "treble" ? `<clef><sign>G</sign><line>2</line></clef>` : `<clef><sign>F</sign><line>4</line></clef>`;
          out += `</attributes>\n`;
          lastKey = setup.key;
          lastClef = setup.clef;
        }
        if (mnum === 1) out += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>\n`;
        for (const it of bars.get(b)!) {
          const ticks = Math.max(1, Math.round(it.dur * (DIV / 4)));
          if (it.rest) {
            out += `<note><rest/><duration>${ticks}</duration><type>${TYPE[it.rest.kind]}</type>${it.rest.dots ? "<dot/>" : ""}${it.rest.tuplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : ""}</note>\n`;
            continue;
          }
          const nextPending = new Set<number>();
          it.notes.forEach(({ n, r }, k) => {
            const kind = kindOf(n);
            const stop = tiePending.has(r.midi);
            if (n.tied) nextPending.add(r.midi);
            out += `<note>${k > 0 ? "<chord/>" : ""}<pitch><step>${STEP[r.letter]}</step>${r.alter ? `<alter>${r.alter}</alter>` : ""}<octave>${r.octave}</octave></pitch><duration>${ticks}</duration>`;
            if (stop) out += `<tie type="stop"/>`;
            if (n.tied) out += `<tie type="start"/>`;
            out += `<type>${TYPE[kind]}</type>${n.dots ? "<dot/>" : ""}${n.tuplet ? "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" : ""}`;
            if (stop || n.tied) out += `<notations>${stop ? `<tied type="stop"/>` : ""}${n.tied ? `<tied type="start"/>` : ""}</notations>`;
            out += `</note>\n`;
          });
          tiePending.clear();
          nextPending.forEach((v) => tiePending.add(v));
        }
        out += `</measure>\n`;
      });
    });
  }
  out += `</part>\n</score-partwise>\n`;
  return out;
}
