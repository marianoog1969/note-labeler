import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export type PdfDoc = pdfjs.PDFDocumentProxy;

/** Resolución a la que se renderiza y analiza cada página. */
export const DPI = 200;

export async function loadPdf(b64: string): Promise<PdfDoc> {
  const bin = atob(b64);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return pdfjs.getDocument({ data }).promise;
}

export interface Rendered {
  canvas: HTMLCanvasElement;
  view: [number, number, number, number];
  rotate: number;
}

export async function renderPage(doc: PdfDoc, n: number): Promise<Rendered> {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: DPI / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const v = page.view;
  return { canvas, view: [v[0], v[1], v[2], v[3]], rotate: page.rotate };
}

export function canvasToPngB64(c: HTMLCanvasElement): string {
  return c.toDataURL("image/png").split(",")[1];
}
