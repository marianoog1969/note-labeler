export interface Staff {
  top: number;
  bottom: number;
  sp: number;
  x0: number;
  x1: number;
  barlines: number[];
  /** clave detectada (null si no se reconoce) */
  clef?: "treble" | "bass" | null;
  /** armadura detectada: -7..7 (null si no se reconoce) */
  key?: number | null;
}

export interface RawNote {
  staff: number;
  x: number;
  y: number;
  step: number;
  /** alteración detectada delante de la nota */
  acc?: "b" | "n" | "#" | null;
}

export interface Analysis {
  width: number;
  height: number;
  staves: Staff[];
  notes: RawNote[];
}

/** auto = lo que dicen la armadura y el compás; b/n/# = alteración puesta a mano */
export type Acc = "auto" | "b" | "n" | "#";

export interface NoteState extends Omit<RawNote, "acc"> {
  id: number;
  acc: Acc;
}

export interface PageData {
  analysis: Analysis;
  notes: NoteState[];
  view: [number, number, number, number];
}

export interface Label {
  id?: number;
  x: number;
  y: number;
  text: string;
  acc: "b" | "n" | "#" | null;
}
