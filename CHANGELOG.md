# Changelog

Versionado: **PATCH** (0.0.x) para corrección de errores, **MINOR** (0.x.0) para mejoras
y **MAJOR** (x.0.0) cada 10 MINOR. Ejemplo: 0.9.2 → 0.10.0 se escribe como 1.0.0.

## 1.2.1
- Corrección: una plica pegada a una barra de repetición o a un bemol vecino se contaba como semicorchea o fusa.
- Con tus 6 partituras, 661 de 679 compases suman exactamente el compás.

## 1.2.0
- Mejora: detecta blancas inclinadas o finas que antes se escapaban.
- Mejora: detecta el tresillo «3» también cuando está dentro del pentagrama.
- Mejora: cuenta bien las dobles barras (semicorcheas) cuando quedan muy juntas.
- Con tus 6 partituras, 656 de 679 compases suman exactamente el compás (antes 506 de 653).

## 1.1.0
- Mejora: detecta silencios (redonda, blanca, negra, corchea, semicorchea y puntillo); se ven marcados en verde y cuentan en el tiempo.
- Mejora: detecta ligaduras de unión (la segunda nota no se vuelve a tocar y alarga a la primera).
- Mejora: detecta tresillos por la cifra «3» y ajusta su duración.
- Mejora: exportar a MusicXML (MuseScore, Finale, Sibelius…), con compases, silencios, ligaduras, tresillos, armadura y clave.
- Mejora: botones Ligada y Tresillo para corregir a mano.
- Corrección: las barras con plicas largas se contaban mal (muchas corcheas salían como semicorcheas).
- Corrección: el «8» del compás 3/8 aparecía como nota hueca en algunas partituras.
- Con tus 6 partituras, 506 de 653 compases suman exactamente el compás (antes 468).

## 1.0.0
- Mejora: detecta el ritmo de cada nota (blanca, negra, corchea, semicorchea, redonda y puntillo) a partir de la cabeza, la plica, las barras y los puntos.
- Mejora: la reproducción respeta las duraciones; el tempo se da en negras por minuto.
- Mejora: exportar a MIDI (botón MIDI) con el instrumento y el tempo elegidos, y el compás detectado o elegido.
- Mejora: se puede cambiar la duración y el puntillo de la nota seleccionada.
- Límites: aún no se detectan silencios, ligaduras ni tresillos.

## 0.9.0
- Mejora: reproducción de las notas detectadas (▶ o Espacio) con Piano, Saxo, Clarinete y Gaita gallega, y tempo ajustable. Sonidos FluidR3_GM (CC BY 3.0).

## 0.8.0
- Mejora: aviso de nueva versión al arrancar (consulta la última release en GitHub).

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
