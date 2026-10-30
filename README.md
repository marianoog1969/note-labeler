# Note Labeler

Abre una partitura en PDF, detecta las notas y escribe su nombre (Do, Re, Mi…) debajo de cada una.
Tauri 2 + Rust + React/TypeScript. El PDF original no se modifica: se guarda una copia nueva.

Manual de usuario: `docs/manual.html` (ábrelo con el navegador).

## Compilar

```
npm install
npm run tauri build -- --no-bundle
```

El ejecutable queda en `src-tauri/target/release/`. Para desarrollo: `npm run tauri dev`.

## Uso

1. **Abrir** un PDF (botón, arrastrándolo a la ventana o desde «Recientes»). Se analiza la página automáticamente.
2. En el panel izquierdo revisa la **armadura** y la **clave** (por defecto automáticas; p. ej. «3 ♭ · Mi♭ M / Do m»), la notación
   (Do Re Mi o C D E), y el tamaño y color del texto. Los ajustes se recuerdan.
3. Revisa: los ♭ ♮ ♯ escritos delante de las notas se detectan solos y se marcan con un círculo naranja.
   Con **↑ ↓** saltas de una alteración a otra. Si alguna falla: clic en la nota (o en su nombre) y `B` bemol,
   `N` becuadro, `S` sostenido, `A` automático, `Supr` eliminar. «+» añade una nota que no se haya detectado.
4. **Exportar PDF** guarda una copia con los nombres (todas las páginas).

`Ctrl+Z` / `Ctrl+Y` deshacen y rehacen. `Ctrl + rueda` hace zoom. `?` muestra todos los atajos.
Una alteración puesta a mano se arrastra hasta la siguiente barra de compás a las notas de la misma altura
(como en una partitura). Las notas sin marcar usan la armadura.

## Cómo funciona

- `src-tauri/src/detect.rs`: localiza los pentagramas (5 líneas equidistantes), aísla las cabezas de nota con una
  apertura morfológica elíptica, exige plica para descartar restos de barras, y convierte la altura en nota. También
  detecta las barras de compás y los signos ♭ ♮ ♯ (por el número y la posición de sus plicas). Acordes en columna: se apilan.
- `src-tauri/src/export.rs` (lopdf): añade un flujo de contenido al final de cada página con Helvetica-Bold; las
  alteraciones se dibujan como trazos vectoriales.
- `src/names.ts`: armadura, clave, arrastre de alteraciones y etiquetas.

## Versiones

PATCH para errores, MINOR para mejoras y MAJOR cada 10 MINOR. Ver `CHANGELOG.md`.

## Idioma

La interfaz está en inglés y en español (botón EN/ES de la cabecera; por defecto, el idioma del sistema). Los textos están en `src/i18n.ts`.

## Límites

- La **clave** (Sol / Fa en 4.ª) y la **armadura** se detectan solas en cada pentagrama; puedes forzarlas en el panel izquierdo. Las claves de Do y los cambios a mitad de pentagrama no se reconocen. Los ajustes se recuerdan entre sesiones.
- Las alteraciones se leen de la imagen: becuadros y sostenidos están comprobados con una partitura real
  (17 de 17, sin falsos positivos); los bemoles accidentales, no se han podido probar todavía.
- Las notas huecas (blancas y redondas) se detectan con menos fiabilidad que las negras; añade las que falten con «+ Añadir nota».
- Páginas rotadas y PDF escaneados torcidos o de baja calidad no están soportados.
- Pensado para PDF vectoriales exportados desde un editor (Finale, MuseScore, Sibelius…).
