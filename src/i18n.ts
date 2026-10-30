export type Lang = "es" | "en";

export const COLOR_NAMES: Record<Lang, Record<string, string>> = {
  es: { azul: "Azul", negro: "Negro", rojo: "Rojo", verde: "Verde" },
  en: { azul: "Blue", negro: "Black", rojo: "Red", verde: "Green" },
};

const KEYS_ES: Array<[number, string]> = [
  [-7, "7 ♭ · Do♭ M"], [-6, "6 ♭ · Sol♭ M"], [-5, "5 ♭ · Re♭ M"], [-4, "4 ♭ · La♭ M"],
  [-3, "3 ♭ · Mi♭ M / Do m"], [-2, "2 ♭ · Si♭ M / Sol m"], [-1, "1 ♭ · Fa M / Re m"],
  [0, "Sin alteraciones · Do M / La m"],
  [1, "1 ♯ · Sol M / Mi m"], [2, "2 ♯ · Re M / Si m"], [3, "3 ♯ · La M / Fa♯ m"],
  [4, "4 ♯ · Mi M / Do♯ m"], [5, "5 ♯ · Si M / Sol♯ m"], [6, "6 ♯ · Fa♯ M"], [7, "7 ♯ · Do♯ M"],
];
const KEYS_EN: Array<[number, string]> = [
  [-7, "7 ♭ · C♭ major"], [-6, "6 ♭ · G♭ major"], [-5, "5 ♭ · D♭ major"], [-4, "4 ♭ · A♭ major / F minor"],
  [-3, "3 ♭ · E♭ major / C minor"], [-2, "2 ♭ · B♭ major / G minor"], [-1, "1 ♭ · F major / D minor"],
  [0, "No accidentals · C major / A minor"],
  [1, "1 ♯ · G major / E minor"], [2, "2 ♯ · D major / B minor"], [3, "3 ♯ · A major / F♯ minor"],
  [4, "4 ♯ · E major / C♯ minor"], [5, "5 ♯ · B major / G♯ minor"], [6, "6 ♯ · F♯ major"], [7, "7 ♯ · C♯ major"],
];

const es = {
  keys: KEYS_ES,
  tagline: "Pon nombre a las notas de un PDF",
  donate: "Donar", donateTip: "Apoyar el proyecto",
  help: "Ayuda", helpTip: "Atajos de teclado (?)",
  open: "Abrir", openTip: "Abrir una partitura en PDF",
  exportPdf: "Exportar PDF", exportTip: "Guardar una copia del PDF con los nombres de las notas",
  language: "Idioma",
  score: "Partitura", keySig: "Armadura", keyAuto: "Automática (detectada)", clef: "Clave", auto: "Auto",
  treble: "Sol", bass: "Fa en 4.ª", showKey: "Mostrar ♭/♯ de la armadura",
  text: "Texto", notation: "Notación", size: "Tamaño", color: "Color",
  page: (n: number): string => (n === 1 ? "página" : "páginas"),
  analyzedOnExport: (n: number) => `Las ${n > 1 ? "demás páginas se analizan al exportar" : "notas se detectan al abrir"}.`,
  dropHere: "Arrastra aquí una partitura en PDF", or: "o", openPdf: "Abrir PDF…", recent: "Recientes",
  analyzing: "Analizando…",
  select: "Seleccionar y corregir notas (V)", add: "Añadir una nota que no se haya detectado (+)",
  undo: "Deshacer (Ctrl+Z)", redo: "Rehacer (Ctrl+Y)", zoomOut: "Alejar (Ctrl + rueda)", zoomIn: "Acercar (Ctrl + rueda)",
  fit: "Ajustar al ancho", prevPage: "Página anterior (Re Pág)", nextPage: "Página siguiente (Av Pág)",
  pageWord: "Página", of: "de", close: "Cerrar",
  selectedNote: "Nota seleccionada", staff: "Pentagrama", marked: "alteración marcada",
  pitch: "Altura", pitchUp: "Subir un grado (Mayús+↑)", pitchDown: "Bajar un grado (Mayús+↓)",
  accidental: "Alteración", accAutoTip: "Según la armadura y el compás (A)", flat: "Bemol (B)", natural: "Becuadro (N)", sharp: "Sostenido (S)",
  prev: "Anterior", next: "Siguiente", delete: "Eliminar nota",
  fixNotes: "Corregir notas",
  clickHint: "Haz clic en una nota (o en su nombre) para cambiar su alteración o eliminarla.",
  openToStart: "Abre una partitura para empezar.",
  review: (p: number) => `Revisión · página ${p}`, notes: "notas", withAcc: "con alteración",
  prevAcc: "Alteración anterior (↑)", nextAcc: "Siguiente alteración (↓)",
  reviewHint: "Salta entre las alteraciones (círculos naranjas) para comprobar que se detectaron bien.",
  supportTitle: "Apoya el proyecto",
  supportText: "Note Labeler es gratuito y lo desarrolla una sola persona en su tiempo libre. Si te resulta útil, puedes invitar al creador a un café con una donación voluntaria por PayPal. ¡Gracias!",
  donatePaypal: "Donar con PayPal", qrAlt: "Código QR de PayPal", qrText: "o escanea el código con el móvil",
  shortcuts: "Atajos de teclado",
  sc: [
    ["← →", "Nota anterior / siguiente"], ["↑ ↓", "Alteración anterior / siguiente"],
    ["B N S", "Bemol, becuadro, sostenido"], ["A", "Alteración automática (armadura y compás)"],
    ["Supr", "Eliminar la nota"], ["+ / V", "Modo añadir nota / modo seleccionar"],
    ["Ctrl+Z / Y", "Deshacer / rehacer"], ["Ctrl + rueda", "Zoom"],
    ["Re Pág / Av Pág", "Cambiar de página"], ["Esc", "Deseleccionar"],
  ] as Array<[string, string]>,
  openingPdf: "Abriendo el PDF…",
  rotated: (n: number, r: number) => `La página ${n} está rotada (${r}°); de momento solo se admiten páginas sin rotar.`,
  openFail: (f: string, e: string) => `No se pudo abrir «${f}»: ${e}`,
  onlyPdf: "Solo se pueden abrir archivos PDF.",
  analyzingPage: (n: number) => `Analizando la página ${n}…`,
  clickInStaff: "Haz clic dentro de un pentagrama (o cerca de él).",
  preparing: (n: number, t: number) => `Preparando la página ${n} de ${t}…`,
  writing: "Escribiendo el PDF…", saved: (f: string) => `PDF guardado: ${f}`,
  suffix: "_notas.pdf",
};

const en: typeof es = {
  keys: KEYS_EN,
  tagline: "Write note names on a PDF score",
  donate: "Donate", donateTip: "Support the project",
  help: "Help", helpTip: "Keyboard shortcuts (?)",
  open: "Open", openTip: "Open a PDF score",
  exportPdf: "Export PDF", exportTip: "Save a copy of the PDF with the note names written on it",
  language: "Language",
  score: "Score", keySig: "Key signature", keyAuto: "Automatic (detected)", clef: "Clef", auto: "Auto",
  treble: "Treble", bass: "Bass", showKey: "Show ♭/♯ from the key signature",
  text: "Text", notation: "Notation", size: "Size", color: "Color",
  page: (n: number): string => (n === 1 ? "page" : "pages"),
  analyzedOnExport: (n: number) => (n > 1 ? "The other pages are analyzed when you export." : "Notes are detected when the file opens."),
  dropHere: "Drop a PDF score here", or: "or", openPdf: "Open PDF…", recent: "Recent",
  analyzing: "Analyzing…",
  select: "Select and correct notes (V)", add: "Add a note that was not detected (+)",
  undo: "Undo (Ctrl+Z)", redo: "Redo (Ctrl+Y)", zoomOut: "Zoom out (Ctrl + wheel)", zoomIn: "Zoom in (Ctrl + wheel)",
  fit: "Fit to width", prevPage: "Previous page (Page Up)", nextPage: "Next page (Page Down)",
  pageWord: "Page", of: "of", close: "Close",
  selectedNote: "Selected note", staff: "Staff", marked: "accidental set",
  pitch: "Pitch", pitchUp: "Up one step (Shift+↑)", pitchDown: "Down one step (Shift+↓)",
  accidental: "Accidental", accAutoTip: "From the key signature and the measure (A)", flat: "Flat (B)", natural: "Natural (N)", sharp: "Sharp (S)",
  prev: "Previous", next: "Next", delete: "Delete note",
  fixNotes: "Fix notes",
  clickHint: "Click a note (or its name) to change its accidental or delete it.",
  openToStart: "Open a score to get started.",
  review: (p: number) => `Review · page ${p}`, notes: "notes", withAcc: "with accidental",
  prevAcc: "Previous accidental (↑)", nextAcc: "Next accidental (↓)",
  reviewHint: "Jump between accidentals (orange circles) to check they were detected correctly.",
  supportTitle: "Support the project",
  supportText: "Note Labeler is free and built by one person in their spare time. If you find it useful, you can buy the author a coffee with a voluntary PayPal donation. Thank you!",
  donatePaypal: "Donate with PayPal", qrAlt: "PayPal QR code", qrText: "or scan the code with your phone",
  shortcuts: "Keyboard shortcuts",
  sc: [
    ["← →", "Previous / next note"], ["↑ ↓", "Previous / next accidental"],
    ["B N S", "Flat, natural, sharp"], ["A", "Automatic accidental (key signature and measure)"],
    ["Del", "Delete the note"], ["+ / V", "Add-note mode / select mode"],
    ["Ctrl+Z / Y", "Undo / redo"], ["Ctrl + wheel", "Zoom"],
    ["Page Up / Page Down", "Change page"], ["Esc", "Deselect"],
  ],
  openingPdf: "Opening the PDF…",
  rotated: (n: number, r: number) => `Page ${n} is rotated (${r}°); only unrotated pages are supported for now.`,
  openFail: (f: string, e: string) => `Could not open “${f}”: ${e}`,
  onlyPdf: "Only PDF files can be opened.",
  analyzingPage: (n: number) => `Analyzing page ${n}…`,
  clickInStaff: "Click inside a staff (or close to one).",
  preparing: (n: number, t: number) => `Preparing page ${n} of ${t}…`,
  writing: "Writing the PDF…", saved: (f: string) => `PDF saved: ${f}`,
  suffix: "_notes.pdf",
};

export const STR: Record<Lang, typeof es> = { es, en };

export function defaultLang(): Lang {
  try {
    return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
}
