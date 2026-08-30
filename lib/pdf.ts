import type { PdfTextItem } from './parsers';
import { extraerTextoPdf } from './pdftext';

/**
 * Polyfill mínimo de DOMMatrix: Node (y los serverless de Vercel) no lo trae,
 * y pdfjs-dist >= 4 lo requiere aunque solo se extraiga texto. Cubre lo que
 * pdfjs usa en getTextContent (matrices 2D).
 */
class DOMMatrixPolyfill {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length === 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
  }
  translate(x = 0, y = 0) { return new DOMMatrixPolyfill([this.a, this.b, this.c, this.d, this.e + this.a * x + this.c * y, this.f + this.b * x + this.d * y]); }
  scale(x = 1, y = x) { return new DOMMatrixPolyfill([this.a * x, this.b * x, this.c * y, this.d * y, this.e, this.f]); }
  multiply(o: DOMMatrixPolyfill) { return new DOMMatrixPolyfill([this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b, this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d, this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f]); }
  transformPoint(p: { x?: number; y?: number } = {}) { const x = p.x ?? 0, y = p.y ?? 0; return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f }; }
  invertSelf() {
    const det = this.a * this.d - this.b * this.c;
    const { a, b, c, d, e, f } = this;
    this.a = d / det; this.b = -b / det; this.c = -c / det; this.d = a / det;
    this.e = (c * f - d * e) / det; this.f = (b * e - a * f) / det;
    return this;
  }
}
if (typeof (globalThis as any).DOMMatrix === 'undefined') (globalThis as any).DOMMatrix = DOMMatrixPolyfill;

/**
 * Extrae los fragmentos de texto con su posición (x, y) de la primera página del PDF.
 * Usa pdfjs-dist (build legacy, funciona en Node sin canvas).
 */
export async function extractPdfItems(pdf: Uint8Array): Promise<PdfTextItem[]> {
  // Lector propio (sin dependencias): es el que funciona en serverless.
  try {
    const propios = extraerTextoPdf(pdf);
    if (propios.length >= 5) return propios;
    console.warn(`[pdf] el lector propio solo sacó ${propios.length} fragmentos; se intenta con pdfjs`);
  } catch (e: any) {
    console.warn('[pdf] lector propio falló:', e.message);
  }
  return extraerConPdfjs(pdf);
}

/** Respaldo con pdfjs, por si algún PDF trae algo que el lector propio no cubre. */
async function extraerConPdfjs(pdf: Uint8Array): Promise<PdfTextItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // En Node, pdfjs carga el "worker falso" haciendo un import dinámico del
  // archivo del worker. Ese import es invisible para el empaquetador, así que
  // se resuelve la ruta real y se le indica explícitamente; además se importa
  // literalmente para que el archivo quede incluido en el despliegue.
  try {
    const { createRequire } = await import('node:module');
    const require_ = createRequire(import.meta.url);
    const ruta = require_.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    const { pathToFileURL } = await import('node:url');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(ruta).href;
  } catch {
    // si no se pudo resolver, se deja que pdfjs lo intente por su cuenta
    await import('pdfjs-dist/legacy/build/pdf.worker.mjs').catch(() => {});
  }

  const doc = await pdfjs.getDocument({
    data: pdf,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  } as Parameters<typeof pdfjs.getDocument>[0]).promise;
  const items: PdfTextItem[] = [];
  const pages = Math.min(doc.numPages, 3);
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as any[]) {
      if (typeof it.str !== 'string') continue;
      // en páginas siguientes desplazamos Y para que no se mezclen con la primera
      items.push({ s: it.str, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]) - (p - 1) * 10000 });
    }
  }
  await doc.destroy();
  return items;
}
