# Changelog

Versionado: **PATCH** (0.0.x) para corrección de errores, **MINOR** (0.x.0) para mejoras
y **MAJOR** (x.0.0) cada 10 MINOR. Ejemplo: 0.9.2 → 0.10.0 se escribe como 1.0.0.

## 0.7.0
- Mejora: se puede cambiar la altura de la nota seleccionada (▲▼ o Mayús+↑/↓).

## 0.6.0
- Mejora: detecta pentagramas de línea muy fina (PDFs de MuseScore/Sibelius con líneas tenues).
- Mejora: tolera plicas finas con cortes de 1-2 px, que antes hacían perder notas.
- Mejora: descarta restos de barras de corchea que se confundían con notas.

## 0.5.1
- Corrección: las cifras del compás (p. ej. el «8» de 6/8) se marcaban como notas.
- Corrección: posible desbordamiento al medir el encabezado de un pentagrama.

## 0.5.0
- Mejora: detección de clave (Sol / Fa en 4.ª) y armadura automáticas por pentagrama.
- Mejora: menos falsas notas (óvalos de las dinámicas p / pp, bucle de la clave de Sol).
- Mejora: reconoce notas huecas sobre líneas adicionales.

## 0.4.0
- Mejora: interfaz en inglés y español (botón EN/ES).

## 0.3.0
- Mejora: detecta notas huecas (blancas y redondas).

## 0.2.0
- Mejora: botón Donar con PayPal y código QR.

## 0.1.0
- Primera versión: detección de notas negras y alteraciones, vista previa con corrección manual y exportación a PDF.
