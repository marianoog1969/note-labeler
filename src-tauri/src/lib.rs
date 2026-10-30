mod detect;
mod export;

use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Lee un fichero y lo devuelve en base64 (para pasarlo a pdf.js).
#[tauri::command]
async fn read_file_b64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    Ok(STANDARD.encode(bytes))
}

/// Recibe la página renderizada como PNG (base64) y detecta pentagramas y notas.
#[tauri::command]
async fn analyze_page(png_b64: String) -> Result<detect::Analysis, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let data = STANDARD.decode(png_b64.as_bytes()).map_err(|e| e.to_string())?;
        let img = image::load_from_memory(&data).map_err(|e| e.to_string())?.to_luma8();
        let (w, h) = img.dimensions();
        Ok(detect::analyze(img.as_raw(), w as usize, h as usize))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Escribe los nombres de nota sobre el PDF original y guarda una copia nueva.
#[tauri::command]
async fn export_pdf(req: export::ExportReq) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || export::export(&req))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_file_b64, analyze_page, export_pdf])
        .run(tauri::generate_context!())
        .expect("error al iniciar la aplicación");
}
