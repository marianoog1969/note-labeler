// Reproducción de las notas detectadas: una nota tras otra a un tempo fijo; los acordes suenan a la vez.
import { Bank, DEFAULT_INSTRUMENT, Instrument, getBank, loadInstrument, pickSample } from "./sampler";

function voice(ctx: AudioContext, bank: Bank, midi: number, t: number, dur: number) {
  const s = pickSample(bank, midi);
  if (!s) return;
  const g = ctx.createGain();
  g.connect(ctx.destination);
  const end = t + dur;
  const src = ctx.createBufferSource();
  src.buffer = s.buf;
  src.playbackRate.value = s.rate;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.9, t + 0.004);
  g.gain.setValueAtTime(0.9, Math.max(t + 0.01, end - 0.01));
  g.gain.linearRampToValueAtTime(0.0001, end + 0.14);
  src.connect(g);
  src.start(t);
  src.stop(end + 0.16);
}

export interface PlayNote { id: number; midi: number; staff: number; x: number; dur: number; tied: boolean }
export interface PlayRest { staff: number; x: number; dur: number }
/** dur en semicorcheas (1 negra = 4); `notes[].len` es lo que suena (más si está ligada) */
export interface Slot { ids: number[]; notes: { midi: number; len: number }[]; dur: number; staff: number; x: number }

/** Agrupa notas y silencios en instantes: por pentagrama y de izquierda a derecha; las que están en la misma x forman un acorde. */
export function buildSlots(notes: PlayNote[], rests: PlayRest[], sp: (staff: number) => number): Slot[] {
  type It = { staff: number; x: number; note?: PlayNote; rest?: PlayRest };
  const items: It[] = [
    ...notes.map((n) => ({ staff: n.staff, x: n.x, note: n })),
    ...rests.map((r) => ({ staff: r.staff, x: r.x, rest: r })),
  ].sort((a, b) => a.staff - b.staff || a.x - b.x);
  const slots: Slot[] = [];
  const tiedFlags: boolean[][] = []; // por slot, por nota
  let last: It | null = null;
  for (const it of items) {
    const cur = slots[slots.length - 1];
    if (last && cur && last.staff === it.staff && Math.abs(it.x - last.x) < 0.5 * sp(it.staff)) {
      if (it.note) {
        cur.ids.push(it.note.id);
        cur.notes.push({ midi: it.note.midi, len: it.note.dur });
        tiedFlags[tiedFlags.length - 1].push(it.note.tied);
        cur.dur = Math.min(cur.dur, it.note.dur);
      }
    } else {
      const d = it.note ? it.note.dur : it.rest!.dur;
      slots.push({ ids: it.note ? [it.note.id] : [], notes: it.note ? [{ midi: it.note.midi, len: d }] : [], dur: d, staff: it.staff, x: it.x });
      tiedFlags.push(it.note ? [it.note.tied] : []);
    }
    last = it;
  }
  // ligaduras: la nota siguiente de la misma altura no se vuelve a tocar y alarga a la primera
  for (let i = 0; i < slots.length; i++) {
    for (let k = 0; k < slots[i].notes.length; k++) {
      let cur = slots[i].notes[k];
      let ci = i;
      let tied = tiedFlags[i][k];
      while (tied && ci + 1 < slots.length && slots[ci + 1].staff === slots[i].staff) {
        const nx = slots[ci + 1];
        const j = nx.notes.findIndex((q) => q.midi === cur.midi);
        if (j < 0) break;
        const cont = nx.notes[j];
        slots[i].notes[k].len += nx.dur;
        tied = tiedFlags[ci + 1][j];
        nx.notes.splice(j, 1);
        tiedFlags[ci + 1].splice(j, 1);
        ci += 1;
        cur = cont;
        if (!tied) break;
      }
    }
  }
  return slots;
}

export class Player {
  private ctx: AudioContext | null = null;
  private timers: number[] = [];
  playing = false;
  instrument: Instrument = DEFAULT_INSTRUMENT;

  private ensure(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  async setInstrument(id: Instrument): Promise<void> {
    this.instrument = id;
    await loadInstrument(id);
  }

  /** Una nota suelta (al seleccionarla). */
  beep(midi: number) {
    if (this.playing) return;
    const bank = getBank(this.instrument);
    if (!bank) return;
    try {
      const ctx = this.ensure();
      voice(ctx, bank, midi, ctx.currentTime + 0.01, 0.6);
    } catch { /* sin audio */ }
  }

  /** Reproduce desde el instante `from`. Devuelve false si no hay nada que sonar o el instrumento no está cargado. */
  play(slots: Slot[], from: number, bpm: number, onNote: (ids: number[] | null) => void, onEnd: () => void): boolean {
    const bank = getBank(this.instrument);
    if (!slots.length || !bank) return false;
    this.stop();
    const ctx = this.ensure();
    const unit = 60 / bpm / 4; // segundos por semicorchea (bpm = negras por minuto)
    const t0 = ctx.currentTime + 0.08;
    this.playing = true;
    const start = Math.min(Math.max(0, from), slots.length - 1);
    let acc = 0;
    for (let i = start; i < slots.length; i++) {
      const t = t0 + acc * unit;
      slots[i].notes.forEach((q) => { const l = q.len * unit; voice(ctx, bank, q.midi, t, Math.max(0.05, Math.min(l * 0.95, l - 0.03))); });
      this.timers.push(window.setTimeout(() => onNote(slots[i].ids), Math.max(0, (t - ctx.currentTime) * 1000)));
      acc += slots[i].dur;
    }
    const totalSec = acc * unit;
    this.timers.push(
      window.setTimeout(() => {
        this.playing = false;
        this.timers = [];
        onNote(null);
        onEnd();
      }, (t0 - ctx.currentTime + totalSec) * 1000 + 150),
    );
    return true;
  }

  stop() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.playing = false;
    if (this.ctx) {
      void this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
