// Instrumentos con muestras reales (FluidR3_GM, CC BY 3.0) guardadas en public/sf/<id>/<nota midi>.mp3

export const SAMPLE_LO = 45; // A2
export const SAMPLE_HI = 99; // D#7

export type Bank = Map<number, AudioBuffer>;

export const INSTRUMENT_IDS = ["acoustic_grand_piano", "alto_sax", "clarinet", "bagpipe"] as const;
export type Instrument = (typeof INSTRUMENT_IDS)[number];
export const DEFAULT_INSTRUMENT: Instrument = "acoustic_grand_piano";
export const isInstrument = (v: unknown): v is Instrument => (INSTRUMENT_IDS as readonly string[]).includes(v as string);

const cache = new Map<string, Bank>();
const pending = new Map<string, Promise<Bank>>();
let decoder: OfflineAudioContext | null = null;

const base = () => (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";

async function loadOne(id: string, midi: number): Promise<AudioBuffer | null> {
  try {
    const r = await fetch(`${base()}sf/${id}/${midi}.mp3`);
    if (!r.ok) return null;
    decoder ??= new OfflineAudioContext(1, 1, 44100);
    return await decoder.decodeAudioData(await r.arrayBuffer());
  } catch {
    return null;
  }
}

/** Carga (una sola vez) todas las notas de un instrumento. Lanza si no se pudo cargar casi nada. */
export function loadInstrument(id: Instrument): Promise<Bank> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      const bank: Bank = new Map();
      const midis = Array.from({ length: SAMPLE_HI - SAMPLE_LO + 1 }, (_, i) => SAMPLE_LO + i);
      await Promise.all(
        midis.map(async (m) => {
          const b = await loadOne(id, m);
          if (b) bank.set(m, b);
        }),
      );
      if (bank.size < 10) throw new Error(`no se pudo cargar el instrumento ${id}`);
      cache.set(id, bank);
      return bank;
    })().finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

export const getBank = (id: Instrument): Bank | null => cache.get(id) ?? null;

/** Muestra más cercana y velocidad de reproducción para afinar. */
export function pickSample(bank: Bank, midi: number): { buf: AudioBuffer; rate: number } | null {
  let best = -1;
  let dist = 1e9;
  for (const k of bank.keys()) {
    const d = Math.abs(k - midi);
    if (d < dist) {
      dist = d;
      best = k;
    }
  }
  const buf = bank.get(best);
  return buf ? { buf, rate: Math.pow(2, (midi - best) / 12) } : null;
}
