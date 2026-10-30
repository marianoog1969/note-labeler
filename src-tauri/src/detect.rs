//! Detección de pentagramas, cabezas de nota y barras de compás en una página
//! de partitura renderizada a escala de grises.
//!
//! Método: localizar las 5 líneas de cada pentagrama, aislar las cabezas de nota
//! con una apertura morfológica elíptica (quita líneas, plicas y barras) y
//! convertir la posición vertical de cada cabeza en un "paso" diatónico
//! (0 = línea inferior del pentagrama, 1 = primer espacio, 2 = segunda línea...).

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct Staff {
    pub top: f32,
    pub bottom: f32,
    pub sp: f32,
    pub x0: f32,
    pub x1: f32,
    pub barlines: Vec<f32>,
    /// grosor de las líneas del pentagrama, en píxeles
    pub line_px: f32,
    /// clave detectada: "treble" (Sol) o "bass" (Fa en 4.ª); None si no se reconoce
    pub clef: Option<String>,
    /// armadura detectada: -7..-1 bemoles, 0 ninguna, 1..7 sostenidos; None si no se reconoce
    pub key: Option<i32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Note {
    pub staff: usize,
    pub x: f32,
    pub y: f32,
    /// 0 = línea inferior del pentagrama; +1 por cada línea/espacio hacia arriba.
    pub step: i32,
    /// Alteración escrita justo delante de la nota: "b", "n" o "#" (None si no hay).
    pub acc: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Analysis {
    pub width: u32,
    pub height: u32,
    pub staves: Vec<Staff>,
    pub notes: Vec<Note>,
}

const DARK: u8 = 140;
const DARK_LINE: u8 = 205;

pub fn analyze(gray: &[u8], w: usize, h: usize) -> Analysis {
    let bin: Vec<u8> = gray.iter().map(|&v| (v < DARK) as u8).collect();
    // las líneas del pentagrama pueden ser muy finas y quedar en gris claro: se buscan con un umbral más tolerante
    let bin_line: Vec<u8> = gray.iter().map(|&v| (v < DARK_LINE) as u8).collect();
    let mut staves = find_staves(&bin_line, w, h);
    if staves.is_empty() {
        return Analysis { width: w as u32, height: h as u32, staves, notes: vec![] };
    }
    let mut sps: Vec<f32> = staves.iter().map(|s| s.sp).collect();
    sps.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let sp = sps[sps.len() / 2];

    let opened = open_ellipse(&bin, w, h, (0.85 * sp).round().max(3.0), (0.66 * sp).round().max(3.0));
    let comps = components(&opened, w, h);

    let mut notes: Vec<Note> = Vec::new();
    // cajas de cabezas aceptadas (para excluir sus plicas al buscar barras de compás)
    let mut head_boxes: Vec<(usize, usize, usize, usize)> = Vec::new();
    // (borde izquierdo de la cabeza, y central) de cada nota, en el mismo orden que `notes`
    let mut note_boxes: Vec<(usize, f32)> = Vec::new();

    for c in comps {
        let cw = (c.x1 - c.x0 + 1) as f32;
        let ch = (c.y1 - c.y0 + 1) as f32;
        if (c.area as f32) < 0.33 * sp * sp || cw < 1.0 * sp || cw > 2.0 * sp {
            continue;
        }
        let cx = c.sx / c.area as f32;
        let cy = c.sy / c.area as f32;
        // pentagrama más cercano dentro de su banda
        let mut best: Option<(usize, f32)> = None;
        for (i, s) in staves.iter().enumerate() {
            if cx < s.x0 || cx > s.x1 {
                continue;
            }
            if cy < s.top - 4.0 * s.sp || cy > s.bottom + 4.0 * s.sp {
                continue;
            }
            let d = (cy - (s.top + s.bottom) / 2.0).abs();
            if best.map_or(true, |(_, bd)| d < bd) {
                best = Some((i, d));
            }
        }
        let Some((si, _)) = best else { continue };
        let is_chord = ch >= 1.7 * sp;
        if !is_chord && ch < 0.78 * sp {
            continue; // demasiado aplanado para ser una cabeza: trozo de barra
        }
        if !is_chord && !has_stem(&bin_line, w, h, &c, cy, sp) {
            continue;
        }
        let s = &staves[si];
        let n_heads = if is_chord {
            (((ch - 0.9 * sp) / sp).round() as i32 + 1).max(2) as usize
        } else {
            1
        };
        for k in 0..n_heads {
            let yy = if n_heads == 1 {
                cy
            } else {
                let first = c.y0 as f32 + 0.45 * sp;
                let last = c.y1 as f32 - 0.45 * sp;
                first + (last - first) * k as f32 / (n_heads - 1) as f32
            };
            let step = ((s.bottom - yy) / (s.sp / 2.0)).round() as i32;
            notes.push(Note { staff: si, x: cx, y: s.bottom - step as f32 * s.sp / 2.0, step, acc: None });
            note_boxes.push((c.x0, yy));
        }
        head_boxes.push((c.x0, c.y0, c.x1, c.y1));
    }

    // Cabezas huecas (blancas y redondas)
    let clean0 = remove_staff_lines(&bin, w, h, &staves);
    let header_ends: Vec<Option<usize>> = staves.iter().map(|st| header_end(&clean0, w, h, st)).collect();
    for hh in detect_hollow(&bin, &bin_line, w, h, &staves, sp) {
        let Some(si) = staff_of(&staves, hh.cx, hh.cy) else { continue };
        let s = &staves[si];
        let step = ((s.bottom - hh.cy) / (s.sp / 2.0)).round() as i32;
        let ny = s.bottom - step as f32 * s.sp / 2.0;
        if notes.iter().any(|n| n.staff == si && (n.x - hh.cx).abs() < 0.7 * sp && (n.y - ny).abs() < 0.7 * sp) {
            continue;
        }
        if !has_ledger(&bin, w, h, s, step, hh.cx) {
            continue;
        }
        if let Some(hx) = header_ends[si] {
            if hh.cx <= hx as f32 + 0.3 * s.sp {
                continue; // clave, armadura o compás: sus óvalos no son notas
            }
        }
        notes.push(Note { staff: si, x: hh.cx, y: ny, step, acc: None });
        note_boxes.push((hh.x0, hh.cy));
        head_boxes.push((hh.x0, hh.y0, hh.x1, hh.y1));
    }

    for (i, s) in staves.iter_mut().enumerate() {
        let _ = i;
        s.barlines = find_barlines(&bin, w, h, s, &head_boxes);
    }

    // Clave y armadura de cada pentagrama
    let clean = remove_staff_lines(&bin, w, h, &staves);
    for si in 0..staves.len() {
        let first_x = notes
            .iter()
            .filter(|n| n.staff == si)
            .map(|n| n.x)
            .fold(f32::INFINITY, f32::min);
        let (clef, key) = detect_clef_key(&bin, &clean, w, h, &staves[si], first_x);
        staves[si].clef = clef;
        staves[si].key = key;
    }

    // Alteraciones: cada signo se asigna a la nota cuya altura esté más cerca de su centro
    // (importa en los acordes, donde varias notas comparten la misma ventana de búsqueda).
    let found: Vec<Option<(String, f32)>> = notes
        .iter()
        .zip(note_boxes.iter())
        .map(|(n, &(hx0, hy))| detect_accidental(&bin, w, h, hx0, hy, &staves[n.staff], &head_boxes))
        .collect();
    for i in 0..notes.len() {
        let Some((kind, center)) = &found[i] else { continue };
        let rival = (0..notes.len()).any(|j| {
            j != i
                && note_boxes[j].0 == note_boxes[i].0
                && notes[j].staff == notes[i].staff
                && found[j].is_some()
                && (notes[j].y - center).abs() < (notes[i].y - center).abs()
        });
        if !rival {
            notes[i].acc = Some(kind.clone());
        }
    }

    notes.sort_by(|a, b| {
        a.staff
            .cmp(&b.staff)
            .then(a.x.partial_cmp(&b.x).unwrap())
            .then(b.step.cmp(&a.step))
    });
    Analysis { width: w as u32, height: h as u32, staves, notes }
}

// ---------------------------------------------------------------- pentagramas

fn find_staves(bin: &[u8], w: usize, h: usize) -> Vec<Staff> {
    // filas con una línea horizontal larga
    let mut rows: Vec<(usize, usize, usize)> = Vec::new(); // (y, x_ini, x_fin) de la racha más larga
    for y in 0..h {
        let row = &bin[y * w..(y + 1) * w];
        let (mut best, mut bs) = (0usize, 0usize);
        let (mut cur, mut cs) = (0usize, 0usize);
        let mut gap = 0usize;
        for (x, &v) in row.iter().enumerate() {
            if v == 1 {
                if cur == 0 {
                    cs = x;
                }
                cur += 1 + gap;
                gap = 0;
                if cur > best {
                    best = cur;
                    bs = cs;
                }
            } else if cur > 0 && gap < 2 {
                gap += 1; // se toleran huecos de hasta 2 px (línea muy fina o anti-alias)
            } else {
                cur = 0;
                gap = 0;
            }
        }
        if best as f32 >= 0.3 * w as f32 {
            rows.push((y, bs, bs + best - 1));
        }
    }
    // agrupar filas consecutivas -> líneas
    let mut lines: Vec<(f32, usize, usize, usize)> = Vec::new(); // (y medio, x0, x1, grosor)
    let mut i = 0;
    while i < rows.len() {
        let mut j = i;
        while j + 1 < rows.len() && rows[j + 1].0 - rows[j].0 <= 2 {
            j += 1;
        }
        let ym = rows[i..=j].iter().map(|r| r.0 as f32).sum::<f32>() / (j - i + 1) as f32;
        let x0 = rows[i..=j].iter().map(|r| r.1).min().unwrap();
        let x1 = rows[i..=j].iter().map(|r| r.2).max().unwrap();
        lines.push((ym, x0, x1, j - i + 1));
        i = j + 1;
    }
    // secuencias de 5 líneas equidistantes
    let mut staves = Vec::new();
    let mut i = 0;
    while i + 5 <= lines.len() {
        let d: Vec<f32> = (0..4).map(|k| lines[i + k + 1].0 - lines[i + k].0).collect();
        let m = d.iter().sum::<f32>() / 4.0;
        if m >= 5.0 && m <= 80.0 && d.iter().all(|&v| v >= 0.85 * m && v <= 1.15 * m) {
            let x0 = lines[i..i + 5].iter().map(|l| l.1).min().unwrap() as f32;
            let x1 = lines[i..i + 5].iter().map(|l| l.2).max().unwrap() as f32;
            staves.push(Staff {
                top: lines[i].0,
                bottom: lines[i + 4].0,
                sp: m,
                x0,
                x1,
                barlines: vec![],
                line_px: lines[i..i + 5].iter().map(|l| l.3 as f32).sum::<f32>() / 5.0,
                clef: None,
                key: None,
            });
            i += 5;
        } else {
            i += 1;
        }
    }
    staves
}

// ------------------------------------------------------------------ morfología

fn prefix_rows(img: &[u8], w: usize, h: usize) -> Vec<u32> {
    let mut p = vec![0u32; (w + 1) * h];
    for y in 0..h {
        let mut acc = 0u32;
        for x in 0..w {
            acc += img[y * w + x] as u32;
            p[y * (w + 1) + x + 1] = acc;
        }
    }
    p
}

#[inline]
fn row_sum(p: &[u32], w: usize, y: usize, xa: isize, xb: isize) -> u32 {
    let a = xa.max(0) as usize;
    let b = (xb.min(w as isize - 1)) as usize + 1;
    p[y * (w + 1) + b] - p[y * (w + 1) + a]
}

/// Apertura (erosión + dilatación) con elemento estructurante elíptico kw × kh.
fn open_ellipse(bin: &[u8], w: usize, h: usize, kw: f32, kh: f32) -> Vec<u8> {
    let ry = kh / 2.0;
    let rx = kw / 2.0;
    let mut offs: Vec<(isize, isize)> = Vec::new(); // (dy, semiancho)
    let iry = ry.floor() as isize;
    for dy in -iry..=iry {
        let t = (dy as f32 / ry).abs();
        if t > 1.0 {
            continue;
        }
        let hw = (rx * (1.0 - t * t).sqrt()).floor() as isize;
        offs.push((dy, hw));
    }
    // erosión
    let p = prefix_rows(bin, w, h);
    let mut er = vec![0u8; w * h];
    for y in 0..h {
        for x in 0..w {
            if bin[y * w + x] == 0 {
                continue;
            }
            let mut ok = true;
            for &(dy, hw) in &offs {
                let yy = y as isize + dy;
                if yy < 0 || yy >= h as isize {
                    ok = false;
                    break;
                }
                let xa = x as isize - hw;
                let xb = x as isize + hw;
                if xa < 0 || xb >= w as isize || row_sum(&p, w, yy as usize, xa, xb) != (2 * hw + 1) as u32 {
                    ok = false;
                    break;
                }
            }
            if ok {
                er[y * w + x] = 1;
            }
        }
    }
    // dilatación
    let pe = prefix_rows(&er, w, h);
    let mut out = vec![0u8; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut hit = false;
            for &(dy, hw) in &offs {
                let yy = y as isize + dy;
                if yy < 0 || yy >= h as isize {
                    continue;
                }
                if row_sum(&pe, w, yy as usize, x as isize - hw, x as isize + hw) > 0 {
                    hit = true;
                    break;
                }
            }
            if hit {
                out[y * w + x] = 1;
            }
        }
    }
    out
}

// ---------------------------------------------------------------- componentes

struct Comp {
    x0: usize,
    y0: usize,
    x1: usize,
    y1: usize,
    area: usize,
    sx: f32,
    sy: f32,
    /// cabeza hueca: la plica puede estar algo más lejos del hueco
    wide_scan: bool,
}

fn components(img: &[u8], w: usize, h: usize) -> Vec<Comp> {
    let mut seen = vec![false; w * h];
    let mut out = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for start in 0..w * h {
        if img[start] == 0 || seen[start] {
            continue;
        }
        seen[start] = true;
        stack.push(start);
        let mut c = Comp { x0: usize::MAX, y0: usize::MAX, x1: 0, y1: 0, area: 0, sx: 0.0, sy: 0.0, wide_scan: false };
        while let Some(i) = stack.pop() {
            let (x, y) = (i % w, i / w);
            c.x0 = c.x0.min(x);
            c.x1 = c.x1.max(x);
            c.y0 = c.y0.min(y);
            c.y1 = c.y1.max(y);
            c.area += 1;
            c.sx += x as f32;
            c.sy += y as f32;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 {
                        continue;
                    }
                    let ni = ny as usize * w + nx as usize;
                    if img[ni] == 1 && !seen[ni] {
                        seen[ni] = true;
                        stack.push(ni);
                    }
                }
            }
        }
        out.push(c);
    }
    out
}

// ---------------------------------------------------------------------- plicas

/// ¿Tiene la cabeza una plica (racha vertical larga pegada a su borde)?
fn has_stem(bin: &[u8], w: usize, h: usize, c: &Comp, cy: f32, sp: f32) -> bool {
    let need = (2.4 * sp) as usize;
    let reach = (4.5 * sp) as isize;
    let cols: Vec<usize> = (0..3)
        .map(|k| c.x0 + k)
        .chain((0..4).map(|k| c.x1.saturating_sub(k)))
        .chain(std::iter::once(c.x1 + 1))
        .chain(if c.wide_scan {
            (0..=((0.5 * sp) as usize)).flat_map(|k| [c.x0.saturating_sub(k), c.x1 + k]).collect::<Vec<_>>()
        } else {
            vec![]
        })
        .collect();
    for x in cols {
        if x >= w {
            continue;
        }
        let ya = (cy as isize - reach).max(0) as usize;
        let yb = ((cy as isize + reach) as usize).min(h - 1);
        // rachas verticales; se toleran huecos de 1–2 px (plicas finas con anti-alias)
        let (mut s, mut e, mut gap) = (0usize, 0usize, 0usize);
        let mut active = false;
        for y in ya..=yb + 1 {
            let dark = y <= yb && bin[y * w + x] == 1;
            if dark {
                if !active {
                    s = y;
                    active = true;
                }
                e = y;
                gap = 0;
            } else if active {
                gap += 1;
                if gap > 2 || y > yb {
                    let run = e + 1 - s;
                    if run >= need && (s as f32) <= cy + 0.75 * sp && (e as f32) >= cy - 0.75 * sp {
                        return true;
                    }
                    active = false;
                    gap = 0;
                }
            }
        }
    }
    false
}

// ------------------------------------------------------------- barras de compás

fn find_barlines(bin: &[u8], w: usize, h: usize, s: &Staff, heads: &[(usize, usize, usize, usize)]) -> Vec<f32> {
    let ya = s.top.round() as usize + 1;
    let yb = (s.bottom.round() as usize).saturating_sub(1).min(h - 1);
    let mut cols: Vec<usize> = Vec::new();
    for x in (s.x0 as usize)..=(s.x1 as usize).min(w - 1) {
        let full = (ya..=yb).all(|y| bin[y * w + x] == 1);
        if !full {
            continue;
        }
        // una plica larga sobre la línea inferior puede casi cubrir el pentagrama: se descarta
        // si el pixel está pegado a una cabeza de nota aceptada
        let m = 3usize;
        let near_head = heads.iter().any(|&(hx0, hy0, hx1, hy1)| {
            x + m >= hx0 && x <= hx1 + m && hy1 + (2.0 * s.sp) as usize >= ya && hy0 <= yb + (2.0 * s.sp) as usize
        });
        if !near_head {
            cols.push(x);
        }
    }
    // agrupar columnas adyacentes
    let mut out = Vec::new();
    let mut i = 0;
    while i < cols.len() {
        let mut j = i;
        while j + 1 < cols.len() && cols[j + 1] - cols[j] <= 2 {
            j += 1;
        }
        out.push((cols[i] + cols[j]) as f32 / 2.0);
        i = j + 1;
    }
    out
}

// ----------------------------------------------------------------- alteraciones

/// Busca el signo de alteración a la izquierda de una cabeza. Los signos ♮ y ♯ tienen
/// dos plicas verticales; el ♭ una sola. Entre ♮ y ♯ se distingue porque en el becuadro
/// la plica derecha está desplazada hacia abajo respecto a la izquierda.
fn detect_accidental(
    bin: &[u8],
    w: usize,
    h: usize,
    head_x0: usize,
    cy: f32,
    st: &Staff,
    heads: &[(usize, usize, usize, usize)],
) -> Option<(String, f32)> {
    let sp = st.sp;
    let xb = head_x0 as isize - (0.15 * sp) as isize;
    let xa = head_x0 as isize - (1.55 * sp) as isize;
    if xa < 0 || xb <= xa {
        return None;
    }
    let ya = (cy - 2.5 * sp).max(0.0) as usize;
    let yb = ((cy + 2.1 * sp) as usize).min(h - 1);
    let need = (1.5 * sp) as usize;

    // columnas con racha vertical larga (y su extensión)
    let mut stems: Vec<(usize, usize, usize)> = Vec::new(); // (x, y_ini, y_fin)
    for x in xa..=xb {
        let x = x as usize;
        if x >= w {
            continue;
        }
        // ignorar columnas de otras cabezas (y sus plicas) y de barras de compás
        if heads.iter().any(|&(a, b, c, d)| {
            x >= a && x <= c && (cy as usize) + (3.0 * sp) as usize >= b && (cy as usize) <= d + (3.0 * sp) as usize
        }) {
            // la propia cabeza queda fuera de la ventana; las ajenas se excluyen aquí
            if !(x >= head_x0) {
                continue;
            }
        }
        if st.barlines.iter().any(|&bx| (bx - x as f32).abs() <= 4.0) {
            continue;
        }
        let (mut best_len, mut best_s, mut best_e) = (0usize, 0usize, 0usize);
        let (mut run, mut rs) = (0usize, 0usize);
        for y in ya..=yb + 1 {
            let dark = y <= yb && bin[y * w + x] == 1;
            if dark {
                if run == 0 {
                    rs = y;
                }
                run += 1;
            } else {
                if run > best_len {
                    best_len = run;
                    best_s = rs;
                    best_e = y - 1;
                }
                run = 0;
            }
        }
        if best_len >= need {
            stems.push((x, best_s, best_e));
        }
    }
    // agrupar columnas adyacentes en plicas
    let mut groups: Vec<(usize, usize)> = Vec::new(); // (y_ini medio, y_fin medio) por plica
    let mut i = 0;
    while i < stems.len() {
        let mut j = i;
        while j + 1 < stems.len() && stems[j + 1].0 - stems[j].0 <= 1 {
            j += 1;
        }
        let ys: usize = stems[i..=j].iter().map(|t| t.1).sum::<usize>() / (j - i + 1);
        let ye: usize = stems[i..=j].iter().map(|t| t.2).sum::<usize>() / (j - i + 1);
        groups.push((ys, ye));
        i = j + 1;
    }
    match groups.len() {
        1 => {
            // bemol: una plica larga que acaba cerca de la cabeza
            let (_, e) = groups[0];
            let (sy, _) = groups[0];
            if (e as f32) >= cy - 0.2 * sp && (e as f32) <= cy + 1.3 * sp {
                Some(("b".into(), (sy + e) as f32 / 2.0))
            } else {
                None
            }
        }
        2 => {
            let (t1, b1) = groups[0];
            let (t2, b2) = groups[1];
            let d = (0.5 * sp) as isize;
            let center = (t1 + b1 + t2 + b2) as f32 / 4.0;
            if t2 as isize - t1 as isize >= d && b2 as isize - b1 as isize >= d {
                Some(("n".into(), center))
            } else {
                Some(("#".into(), center))
            }
        }
        _ => None,
    }
}

// ------------------------------------------------------------------ cabezas huecas

struct Hollow {
    cx: f32,
    cy: f32,
    x0: usize,
    y0: usize,
    x1: usize,
    y1: usize,
}

fn staff_of(staves: &[Staff], cx: f32, cy: f32) -> Option<usize> {
    let mut best: Option<(usize, f32)> = None;
    for (i, s) in staves.iter().enumerate() {
        if cx < s.x0 || cx > s.x1 || cy < s.top - 4.0 * s.sp || cy > s.bottom + 4.0 * s.sp {
            continue;
        }
        let d = (cy - (s.top + s.bottom) / 2.0).abs();
        if best.map_or(true, |(_, bd)| d < bd) {
            best = Some((i, d));
        }
    }
    best.map(|b| b.0)
}

/// Quita las líneas del pentagrama donde no hay otra tinta por encima y por debajo.
/// Así el interior de una cabeza hueca que cae sobre una línea queda como un solo hueco.
fn remove_staff_lines(bin: &[u8], w: usize, h: usize, staves: &[Staff]) -> Vec<u8> {
    let mut out = bin.to_vec();
    for s in staves {
        // las 5 líneas del pentagrama y hasta 4 líneas adicionales por arriba y por abajo
        for k in -4i32..=8 {
            let ledger = !(0..=4).contains(&k);
            let tb = {
                let t = (((s.line_px - 1.0) / 2.0).ceil().max(0.0)) as isize;
                if ledger { t.max(1) } else { t }
            };
            let off = tb + 1;
            let yc = (s.top + k as f32 * s.sp).round() as isize;
            for x in 0..w {
                let ya = yc - off;
                let yb = yc + off;
                if ya < 0 || yb >= h as isize {
                    continue;
                }
                if bin[ya as usize * w + x] == 0 && bin[yb as usize * w + x] == 0 {
                    for y in (yc - tb)..=(yc + tb) {
                        out[y as usize * w + x] = 0;
                    }
                }
            }
        }
    }
    out
}

fn detect_hollow(bin: &[u8], stem_bin: &[u8], w: usize, h: usize, staves: &[Staff], sp: f32) -> Vec<Hollow> {
    let clean = remove_staff_lines(bin, w, h, staves);
    let mut seen = vec![false; w * h];
    let mut out = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for s in staves {
        let ya = (s.top - 4.0 * s.sp).max(0.0) as usize;
        let yb = ((s.bottom + 4.0 * s.sp) as usize).min(h - 1);
        let xa = s.x0 as usize;
        let xb = (s.x1 as usize).min(w - 1);
        for y0 in ya..=yb {
            for x0 in xa..=xb {
                let i0 = y0 * w + x0;
                if clean[i0] == 1 || seen[i0] {
                    continue;
                }
                // componente blanca (agujero candidato) dentro de la banda del pentagrama
                seen[i0] = true;
                stack.push(i0);
                let (mut bx0, mut by0, mut bx1, mut by1) = (usize::MAX, usize::MAX, 0usize, 0usize);
                let (mut area, mut sx, mut sy) = (0usize, 0f32, 0f32);
                let mut pix: Vec<usize> = Vec::new();
                let mut touches_edge = false;
                while let Some(i) = stack.pop() {
                    let (x, y) = (i % w, i / w);
                    if x <= xa || x >= xb || y <= ya || y >= yb {
                        touches_edge = true;
                    }
                    bx0 = bx0.min(x);
                    bx1 = bx1.max(x);
                    by0 = by0.min(y);
                    by1 = by1.max(y);
                    area += 1;
                    sx += x as f32;
                    sy += y as f32;
                    if !touches_edge && area <= 4000 {
                        pix.push(i);
                    }
                    for (dx, dy) in [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)] {
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx < xa as i32 || ny < ya as i32 || nx > xb as i32 || ny > yb as i32 {
                            continue;
                        }
                        let ni = ny as usize * w + nx as usize;
                        if clean[ni] == 0 && !seen[ni] {
                            seen[ni] = true;
                            stack.push(ni);
                        }
                    }
                }
                if touches_edge {
                    continue;
                }
                let bw = (bx1 - bx0 + 1) as f32;
                let bh = (by1 - by0 + 1) as f32;
                if bw < 0.3 * sp || bw > 1.3 * sp || bh < 0.2 * sp || bh > 0.9 * sp {
                    continue;
                }
                if (area as f32) < 0.13 * sp * sp || (area as f32) / (bw * bh) < 0.28 || bw / bh < 0.55 {
                    continue;
                }
                // anillo oscuro alrededor del hueco
                let mut ring = 0usize;
                let mut dark = 0usize;
                let mut inhole = std::collections::HashSet::with_capacity(pix.len());
                for &p in &pix {
                    inhole.insert(p);
                }
                let r = 3isize;
                let mut seen_ring = std::collections::HashSet::new();
                for &p in &pix {
                    let (x, y) = ((p % w) as isize, (p / w) as isize);
                    for dy in -r..=r {
                        for dx in -r..=r {
                            let (nx, ny) = (x + dx, y + dy);
                            if nx < 0 || ny < 0 || nx >= w as isize || ny >= h as isize {
                                continue;
                            }
                            let ni = ny as usize * w + nx as usize;
                            if inhole.contains(&ni) || !seen_ring.insert(ni) {
                                continue;
                            }
                            ring += 1;
                            if clean[ni] == 1 {
                                dark += 1;
                            }
                        }
                    }
                }
                if ring == 0 || (dark as f32) / (ring as f32) < 0.75 {
                    continue;
                }
                let cx = sx / area as f32;
                let cy = sy / area as f32;
                let e = 3usize;
                let hd = Hollow {
                    cx,
                    cy,
                    x0: bx0.saturating_sub(e),
                    y0: by0.saturating_sub(e),
                    x1: bx1 + e,
                    y1: by1 + e,
                };
                // blancas: con plica; redondas: sin plica (el hueco es una elipse achatada)
                let comp = Comp { x0: hd.x0, y0: hd.y0, x1: hd.x1, y1: hd.y1, area, sx, sy, wide_scan: true };
                let aspect = bw / bh;
                // redonda: sin plica, pero el cuerpo oscuro que rodea al hueco mide 1.2–2 sp de ancho
                let whole = {
                    let row = cy.round() as usize;
                    let mut l = 0usize;
                    while bx0 > l + 1 && clean[row * w + bx0 - 1 - l] == 1 && l < (2.0 * sp) as usize {
                        l += 1;
                    }
                    let mut r = 0usize;
                    while bx1 + 1 + r < w && clean[row * w + bx1 + 1 + r] == 1 && r < (2.0 * sp) as usize {
                        r += 1;
                    }
                    let span = (l + r) as f32 + bw;
                    (span, l as f32 > 0.25 * sp && r as f32 > 0.25 * sp)
                };
                let _ = aspect;
                let _ = &comp;
                let (span, thick) = whole;
                let span_ok = span >= 1.0 * sp && span <= 2.0 * sp;
                if span_ok && (has_stem(stem_bin, w, h, &comp, cy, sp) || thick) {
                    out.push(hd);
                }
            }
        }
    }
    out
}

// ------------------------------------------------------------------ clave y armadura

/// Reconoce la clave (Sol / Fa en 4.ª) y la armadura al comienzo de un pentagrama.
/// `first_x`: x de la primera nota del pentagrama (infinito si no hay ninguna).
fn detect_clef_key(bin: &[u8], clean: &[u8], w: usize, h: usize, st: &Staff, first_x: f32) -> (Option<String>, Option<i32>) {
    let sp = st.sp;
    let ya = ((st.top - 3.6 * sp).max(0.0)) as usize;
    let yb = (((st.bottom + 3.6 * sp) as usize).min(h - 1)).max(ya);
    let xa = st.x0.max(0.0) as usize;
    let xmax = if first_x.is_finite() { first_x - 0.4 * sp } else { st.x0 + 12.0 * sp };
    let xe = (xmax.min(st.x1).min(st.x0 + 14.0 * sp) as usize).min(w - 1);
    if xe <= xa + (3.0 * sp) as usize {
        return (None, None);
    }
    // columnas con tinta -> grupos separados por huecos
    let col = |x: usize| -> bool { (ya..=yb).any(|y| clean[y * w + x] == 1) };
    let gap = ((0.12 * sp) as usize).max(2);
    let mut groups: Vec<(usize, usize)> = Vec::new();
    let mut x = xa;
    while x <= xe {
        if col(x) {
            let s = x;
            let mut e = x;
            let mut miss = 0;
            while x <= xe && miss <= gap {
                if col(x) {
                    e = x;
                    miss = 0;
                } else {
                    miss += 1;
                }
                x += 1;
            }
            groups.push((s, e));
        } else {
            x += 1;
        }
    }
    // alto de tinta de cada grupo
    let rows = |(a, b): (usize, usize)| -> (usize, usize) {
        let mut y0 = usize::MAX;
        let mut y1 = 0;
        for y in ya..=yb {
            if (a..=b).any(|x| clean[y * w + x] == 1) {
                y0 = y0.min(y);
                y1 = y;
            }
        }
        (y0, y1)
    };
    // grupos útiles: se descartan barras finas (barra de sistema) y puntos sueltos
    let mut it = groups.into_iter().filter(|&(a, b)| {
        let width = (b - a + 1) as f32;
        let (y0, y1) = rows((a, b));
        let height = (y1.saturating_sub(y0) + 1) as f32;
        !(width < 0.45 * sp && height > 3.0 * sp) && !(height < 1.7 * sp)
    });
    let Some(cg) = it.next() else { return (None, None) };
    let (cy0, cy1) = rows(cg);
    let ch = ((cy1 - cy0 + 1) as f32) / sp;
    let clef = if ch >= 5.2 {
        Some("treble".to_string())
    } else if (2.4..=3.9).contains(&ch) && (cg.1 - cg.0 + 1) as f32 >= 1.0 * sp {
        Some("bass".to_string())
    } else {
        None
    };
    if clef.is_none() {
        return (None, None);
    }

    // armadura: plicas verticales (≥1.3 sp) agrupadas por columnas. Dos plicas muy juntas son un
    // sostenido; una plica aislada y larga (≥2.2 sp) es un bemol. Una plica corta aislada
    // (el «4» de un compás) o un grupo sin plicas cierran la armadura.
    let need = (1.3 * sp) as usize;
    let flat_need = (2.2 * sp) as usize;
    let mut sharp_kind: Option<bool> = None;
    let mut n = 0i32;
    let mut prev_end = cg.1;
    'outer: for g in it {
        let gap_px = g.0 as f32 - prev_end as f32;
        let max_gap = if n == 0 { 2.0 * sp } else { 0.9 * sp };
        if gap_px > max_gap || (g.1 - g.0 + 1) as f32 > 1.8 * sp {
            break;
        }
        prev_end = g.1;
        let mut cl: Vec<(f32, usize)> = Vec::new(); // (x, longitud máxima)
        let mut cur: Option<(usize, usize, usize)> = None; // (x inicial, x final, mejor)
        for x in g.0..=g.1 + 1 {
            let mut run = 0;
            let mut best = 0;
            if x <= g.1 {
                for y in ya..=yb {
                    if bin[y * w + x] == 1 {
                        run += 1;
                        best = best.max(run);
                    } else {
                        run = 0;
                    }
                }
            }
            if best >= need {
                cur = Some(match cur {
                    Some((a, _, b0)) => (a, x, b0.max(best)),
                    None => (x, x, best),
                });
            } else if let Some((a, e, b0)) = cur.take() {
                cl.push(((a + e) as f32 / 2.0, b0));
            }
        }
        // compás (cifras apiladas que ocupan justo el pentagrama)
        let (gy0, gy1) = rows(g);
        if (gy0 as f32 - st.top).abs() < 0.3 * sp && (gy1 as f32 - st.bottom).abs() < 0.3 * sp {
            break;
        }
        if cl.is_empty() {
            break;
        }
        let mut i = 0;
        while i < cl.len() {
            let pair = i + 1 < cl.len() && cl[i + 1].0 - cl[i].0 < 0.65 * sp;
            let sharp = if pair {
                true
            } else if cl[i].1 >= flat_need {
                false
            } else {
                break 'outer;
            };
            match sharp_kind {
                None => sharp_kind = Some(sharp),
                Some(k) if k != sharp => break 'outer,
                _ => {}
            }
            n += 1;
            i += if pair { 2 } else { 1 };
            if n >= 7 {
                break 'outer;
            }
        }
    }
    let key = match sharp_kind {
        Some(true) => n,
        Some(false) => -n,
        None => 0,
    };
    (clef, Some(key))
}

/// Una nota fuera del pentagrama necesita una línea adicional entre ella y el pentagrama
/// (o atravesándola). Descarta óvalos sueltos como los de las dinámicas p / pp.
fn has_ledger(bin: &[u8], w: usize, h: usize, st: &Staff, step: i32, cx: f32) -> bool {
    let line_step = if step <= -2 {
        if step % 2 == 0 { step } else { step + 1 }
    } else if step >= 10 {
        if step % 2 == 0 { step } else { step - 1 }
    } else {
        return true;
    };
    let y = st.bottom - line_step as f32 * st.sp / 2.0;
    let half = (0.9 * st.sp) as isize;
    let x0 = (cx as isize - half).max(0) as usize;
    let x1 = ((cx as isize + half) as usize).min(w - 1);
    for dy in -1isize..=1 {
        let yy = y as isize + dy;
        if yy < 0 || yy >= h as isize {
            continue;
        }
        let mut run = 0usize;
        let mut best = 0usize;
        for x in x0..=x1 {
            if bin[yy as usize * w + x] == 1 {
                run += 1;
                best = best.max(run);
            } else {
                run = 0;
            }
        }
        if best as f32 >= 1.1 * st.sp {
            return true;
        }
    }
    false
}

/// x donde termina el encabezado del pentagrama (clave, armadura y compás), o None.
fn header_end(clean: &[u8], w: usize, h: usize, st: &Staff) -> Option<usize> {
    let sp = st.sp;
    let ya = ((st.top - 3.6 * sp).max(0.0)) as usize;
    let yb = (((st.bottom + 3.6 * sp) as usize).min(h - 1)).max(ya);
    let xa = st.x0.max(0.0) as usize;
    let xe = ((st.x0 + 14.0 * sp) as usize).min(st.x1 as usize).min(w - 1);
    let ink = |x: usize| (ya..=yb).any(|y| clean[y * w + x] == 1);
    let gap = ((0.12 * sp) as usize).max(2);
    let mut groups: Vec<(usize, usize)> = Vec::new();
    let mut x = xa;
    while x <= xe {
        if ink(x) {
            let s0 = x;
            let mut e = x;
            let mut miss = 0;
            while x <= xe && miss <= gap {
                if ink(x) {
                    e = x;
                    miss = 0;
                } else {
                    miss += 1;
                }
                x += 1;
            }
            groups.push((s0, e));
        } else {
            x += 1;
        }
    }
    // solo se mira la franja del pentagrama (±0.5 sp): texto o dinámicas fuera no cuentan
    let ya = ((st.top - 0.5 * sp).max(0.0)) as usize;
    let yb = (((st.bottom + 0.5 * sp) as usize).min(h - 1)).max(ya);
    let rows = |(a, b): (usize, usize)| -> (usize, usize) {
        let mut y0 = usize::MAX;
        let mut y1 = 0;
        for y in ya..=yb {
            if (a..=b).any(|x| clean[y * w + x] == 1) {
                y0 = y0.min(y);
                y1 = y;
            }
        }
        (y0, y1)
    };
    let mut it = groups.into_iter().filter(|&(a, b)| (b - a + 1) as f32 >= 0.45 * sp || rows((a, b)).1.saturating_sub(rows((a, b)).0) as f32 <= 3.0 * sp);
    let clef = it.next()?;
    if ((clef.1 - clef.0 + 1) as f32) < 0.8 * sp {
        return None;
    }
    let mut end = clef.1;
    let mut prev = clef.1;
    for g in it {
        if g.0 as f32 - prev as f32 > 2.0 * sp {
            break;
        }
        let (y0, y1) = rows(g);
        if y0 == usize::MAX {
            break; // sin tinta en la franja del pentagrama
        }
        let height = (y1 - y0 + 1) as f32 / sp;
        let width = (g.1 - g.0 + 1) as f32 / sp;
        let time_sig = height >= 3.4 && (y0 as f32 - st.top).abs() < 0.4 * sp && (y1 as f32 - st.bottom).abs() < 0.4 * sp && width < 2.2;
        if time_sig {
            end = g.1;
            break;
        }
        if (1.7..=4.6).contains(&height) && width < 1.8 {
            end = g.1;
            prev = g.1;
            continue;
        }
        break;
    }
    Some(end)
}
