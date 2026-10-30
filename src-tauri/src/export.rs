//! Escribe los nombres de nota sobre el PDF original (lopdf).
//! El contenido original no se toca: se añade un flujo de contenido propio al final
//! de cada página, con texto Helvetica-Bold y las alteraciones dibujadas como trazos
//! vectoriales (así no dependen de ninguna fuente).

use lopdf::{dictionary, Dictionary, Document, Object, ObjectId, Stream};
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct Label {
    /// Centro horizontal, en píxeles de la imagen renderizada.
    pub x: f32,
    /// Línea base del texto, en píxeles de la imagen renderizada.
    pub y: f32,
    pub text: String,
    /// "b" bemol, "n" becuadro, "#" sostenido.
    pub acc: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct PageLabels {
    /// Número de página (1 = primera).
    pub page: u32,
    /// `page.view` de pdf.js: [x0, y0, x1, y1] en puntos.
    pub view: [f32; 4],
    /// Resolución a la que se renderizó la imagen analizada.
    pub dpi: f32,
    /// Tamaño de letra, en píxeles de la imagen.
    pub font_px: f32,
    pub labels: Vec<Label>,
}

#[derive(Deserialize, Debug)]
pub struct ExportReq {
    pub src: String,
    pub dst: String,
    pub color: [f32; 3],
    pub pages: Vec<PageLabels>,
}

fn helv_bold_width(c: char) -> f32 {
    let w = match c {
        'A' | 'B' | 'C' | 'D' | 'H' | 'K' | 'N' | 'R' | 'U' => 722,
        'E' | 'P' | 'S' | 'V' | 'X' | 'Y' => 667,
        'F' | 'T' | 'Z' | 'L' => 611,
        'G' | 'O' | 'Q' => 778,
        'I' => 278,
        'J' => 556,
        'M' => 833,
        'W' => 944,
        'a' | 'c' | 'e' | 'k' | 's' | 'v' | 'x' | 'y' => 556,
        'b' | 'd' | 'g' | 'h' | 'n' | 'o' | 'p' | 'q' | 'u' => 611,
        'f' | 't' => 333,
        'i' | 'j' | 'l' => 278,
        'm' => 889,
        'r' => 389,
        'w' => 778,
        'z' => 500,
        _ => 556,
    };
    w as f32 / 1000.0
}

fn text_width(t: &str, fs: f32) -> f32 {
    t.chars().map(helv_bold_width).sum::<f32>() * fs
}

fn pdf_escape(t: &str) -> String {
    t.chars()
        .filter(|c| c.is_ascii() && !c.is_control())
        .flat_map(|c| match c {
            '(' | ')' | '\\' => vec!['\\', c],
            _ => vec![c],
        })
        .collect()
}

/// Operadores de trazo para una alteración con origen (ox, oy) en la línea base.
fn acc_ops(kind: &str, ox: f32, oy: f32, fs: f32) -> String {
    let p = |u: f32, v: f32| (ox + u * fs, oy + v * fs);
    let mut s = String::new();
    let mv = |s: &mut String, (x, y): (f32, f32)| s.push_str(&format!("{:.2} {:.2} m\n", x, y));
    let ln = |s: &mut String, (x, y): (f32, f32)| s.push_str(&format!("{:.2} {:.2} l\n", x, y));
    let cv = |s: &mut String, a: (f32, f32), b: (f32, f32), c: (f32, f32)| {
        s.push_str(&format!("{:.2} {:.2} {:.2} {:.2} {:.2} {:.2} c\n", a.0, a.1, b.0, b.1, c.0, c.1))
    };
    match kind {
        "b" => {
            s.push_str(&format!("{:.2} w\n", 0.09 * fs));
            mv(&mut s, p(0.12, -0.02));
            ln(&mut s, p(0.12, 0.98));
            s.push_str("S\n");
            mv(&mut s, p(0.12, 0.40));
            cv(&mut s, p(0.30, 0.62), p(0.58, 0.52), p(0.52, 0.27));
            cv(&mut s, p(0.47, 0.10), p(0.28, 0.02), p(0.12, -0.02));
            s.push_str("S\n");
        }
        "n" => {
            s.push_str(&format!("{:.2} w\n", 0.08 * fs));
            mv(&mut s, p(0.12, 0.22));
            ln(&mut s, p(0.12, 0.95));
            s.push_str("S\n");
            mv(&mut s, p(0.40, -0.05));
            ln(&mut s, p(0.40, 0.68));
            s.push_str("S\n");
            s.push_str(&format!("{:.2} w\n", 0.13 * fs));
            mv(&mut s, p(0.12, 0.25));
            ln(&mut s, p(0.40, 0.33));
            s.push_str("S\n");
            mv(&mut s, p(0.12, 0.60));
            ln(&mut s, p(0.40, 0.68));
            s.push_str("S\n");
        }
        "#" => {
            s.push_str(&format!("{:.2} w\n", 0.07 * fs));
            mv(&mut s, p(0.18, -0.05));
            ln(&mut s, p(0.18, 0.88));
            s.push_str("S\n");
            mv(&mut s, p(0.42, 0.02));
            ln(&mut s, p(0.42, 0.95));
            s.push_str("S\n");
            s.push_str(&format!("{:.2} w\n", 0.12 * fs));
            mv(&mut s, p(0.08, 0.27));
            ln(&mut s, p(0.52, 0.40));
            s.push_str("S\n");
            mv(&mut s, p(0.08, 0.55));
            ln(&mut s, p(0.52, 0.68));
            s.push_str("S\n");
        }
        _ => {}
    }
    s
}

fn build_content(pg: &PageLabels, color: [f32; 3]) -> Vec<u8> {
    let k = 72.0 / pg.dpi;
    let fs = pg.font_px * k;
    let mut s = String::new();
    // Se cierra el estado gráfico abierto por el flujo "q" inicial y se parte de la CTM por defecto.
    s.push_str("Q\nq\n");
    s.push_str(&format!("{:.3} {:.3} {:.3} rg\n{:.3} {:.3} {:.3} RG\n1 J 1 j\n", color[0], color[1], color[2], color[0], color[1], color[2]));
    for l in &pg.labels {
        let x = pg.view[0] + l.x * k;
        let y = pg.view[3] - l.y * k;
        let tw = text_width(&l.text, fs);
        let acc_w = if l.acc.is_some() { 0.58 * fs } else { 0.0 };
        let gap = if l.acc.is_some() { 0.03 * fs } else { 0.0 };
        let xs = x - (tw + gap + acc_w) / 2.0;
        s.push_str(&format!("BT\n/FNote {:.2} Tf\n{:.2} {:.2} Td\n({}) Tj\nET\n", fs, xs, y, pdf_escape(&l.text)));
        if let Some(a) = &l.acc {
            s.push_str(&acc_ops(a, xs + tw + gap, y, fs));
        }
    }
    s.push_str("Q\n");
    s.into_bytes()
}

fn merged_resources(doc: &Document, page_id: ObjectId) -> Dictionary {
    let (direct, refs) = doc.get_page_resources(page_id).unwrap_or((None, vec![]));
    let mut res = direct.cloned().unwrap_or_default();
    for rid in refs {
        if let Ok(d) = doc.get_dictionary(rid) {
            for (k, v) in d.iter() {
                if !res.has(k) {
                    res.set(k.clone(), v.clone());
                }
            }
        }
    }
    res
}

pub fn export(req: &ExportReq) -> Result<(), String> {
    let mut doc = Document::load(&req.src).map_err(|e| format!("Could not open the PDF: {e}"))?;
    let pages = doc.get_pages();
    let font_id = doc.add_object(dictionary! {
        "Type" => "Font",
        "Subtype" => "Type1",
        "BaseFont" => "Helvetica-Bold",
        "Encoding" => "WinAnsiEncoding",
    });

    for pg in &req.pages {
        if pg.labels.is_empty() {
            continue;
        }
        let page_id = *pages.get(&pg.page).ok_or_else(|| format!("Page {} does not exist", pg.page))?;

        // Recursos: copia de los efectivos + nuestra fuente
        let mut res = merged_resources(&doc, page_id);
        let mut fonts = match res.get(b"Font") {
            Ok(Object::Dictionary(d)) => d.clone(),
            Ok(Object::Reference(r)) => doc.get_dictionary(*r).cloned().unwrap_or_default(),
            _ => Dictionary::new(),
        };
        fonts.set("FNote", Object::Reference(font_id));
        res.set("Font", Object::Dictionary(fonts));

        // Contenido: q + original + (Q + nuestro dibujo)
        let existing = doc.get_page_contents(page_id);
        let q_id = doc.add_object(Stream::new(Dictionary::new(), b"q\n".to_vec()));
        let ours = doc.add_object(Stream::new(Dictionary::new(), build_content(pg, req.color)));
        let mut arr: Vec<Object> = vec![Object::Reference(q_id)];
        arr.extend(existing.into_iter().map(Object::Reference));
        arr.push(Object::Reference(ours));

        let page = doc.get_dictionary_mut(page_id).map_err(|e| e.to_string())?;
        page.set("Resources", Object::Dictionary(res));
        page.set("Contents", Object::Array(arr));
    }
    doc.save(&req.dst).map_err(|e| format!("Could not save the PDF: {e}"))?;
    Ok(())
}
