import { inflateSync, inflateRawSync, unzipSync } from 'node:zlib';
import type { PdfTextItem } from './parsers';

/**
 * Lector de texto de PDF sin dependencias.
 *
 * Se escribió a propósito sin pdfjs: esa librería carga su "worker" con un
 * import dinámico que los empaquetadores serverless no ven, y la función
 * terminaba fallando en producción con "Cannot find module pdf.worker.mjs".
 * Aquí solo se usa zlib, que viene con Node.
 *
 * Cubre lo que traen las facturas de las distribuidoras: texto colocado con
 * los operadores estándar (Tj, TJ, Td, Tm…) en streams FlateDecode.
 */

type Dict = Record<string, any>;

interface Obj { dict: Dict; stream: Buffer | null }

const RE_OBJ = /(\d+)\s+(\d+)\s+obj\b/g;

/** Localiza todos los objetos del archivo sin depender de la tabla xref. */
function leerObjetos(buf: Buffer): Map<number, Obj> {
  const texto = buf.toString('latin1');
  const objetos = new Map<number, Obj>();
  RE_OBJ.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_OBJ.exec(texto))) {
    const num = Number(m[1]);
    const desde = m.index + m[0].length;
    const hasta = texto.indexOf('endobj', desde);
    if (hasta < 0) continue;
    const cuerpo = texto.slice(desde, hasta);
    const iStream = cuerpo.indexOf('stream');
    const dict = parseDict(iStream >= 0 ? cuerpo.slice(0, iStream) : cuerpo);

    let stream: Buffer | null = null;
    if (iStream >= 0) {
      // el contenido empieza tras el salto de línea que sigue a "stream"
      let ini = desde + iStream + 6;
      if (texto[ini] === '\r') ini++;
      if (texto[ini] === '\n') ini++;
      let fin = texto.indexOf('endstream', ini);
      if (fin < 0) fin = hasta;
      const largo = typeof dict.Length === 'number' ? dict.Length : fin - ini;
      const corte = Math.min(ini + largo, fin);
      stream = buf.subarray(ini, corte > ini ? corte : fin);
    }
    objetos.set(num, { dict, stream });
  }
  return objetos;
}

/** Diccionario PDF → objeto plano. Suficiente para las claves que se usan. */
function parseDict(s: string): Dict {
  const d: Dict = {};
  const ini = s.indexOf('<<');
  if (ini < 0) return d;
  const cuerpo = s.slice(ini + 2, cierre(s, ini + 2));
  const re = /\/([A-Za-z0-9#]+)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cuerpo))) {
    const clave = m[1].replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    const resto = cuerpo.slice(re.lastIndex);
    const ref = /^(\d+)\s+(\d+)\s+R\b/.exec(resto);
    if (ref) { d[clave] = { ref: Number(ref[1]) }; re.lastIndex += ref[0].length; continue; }
    const num = /^[-+]?[\d.]+/.exec(resto);
    if (num && !/^\/|^<|^\[/.test(resto)) { d[clave] = Number(num[0]); re.lastIndex += num[0].length; continue; }
    const nombre = /^\/([A-Za-z0-9#+-]+)/.exec(resto);
    if (nombre) { d[clave] = '/' + nombre[1]; re.lastIndex += nombre[0].length; continue; }
    if (resto.startsWith('[')) {
      const fin = pareja(resto, 0, '[', ']');
      d[clave] = resto.slice(0, fin + 1);
      re.lastIndex += fin + 1;
      continue;
    }
    if (resto.startsWith('<<')) {
      const fin = cierre(resto, 2);
      d[clave] = parseDict(resto.slice(0, fin + 2));
      re.lastIndex += fin + 2;
      continue;
    }
  }
  return d;
}

/** Índice del `>>` que cierra el diccionario abierto en `desde`. */
function cierre(s: string, desde: number): number {
  let nivel = 1;
  for (let i = desde; i < s.length - 1; i++) {
    if (s[i] === '<' && s[i + 1] === '<') { nivel++; i++; }
    else if (s[i] === '>' && s[i + 1] === '>') { nivel--; if (!nivel) return i; i++; }
  }
  return s.length;
}

function pareja(s: string, desde: number, abre: string, cierra: string): number {
  let nivel = 0;
  for (let i = desde; i < s.length; i++) {
    if (s[i] === abre) nivel++;
    else if (s[i] === cierra) { nivel--; if (!nivel) return i; }
  }
  return s.length - 1;
}

function descomprimir(o: Obj): Buffer {
  if (!o.stream) return Buffer.alloc(0);
  const filtro = String(o.dict.Filter ?? '');
  if (!filtro.includes('Flate')) return o.stream;
  for (const fn of [inflateSync, unzipSync, inflateRawSync]) {
    try { return fn(o.stream); } catch { /* siguiente intento */ }
  }
  return Buffer.alloc(0);
}

function resolver(objetos: Map<number, Obj>, v: any): any {
  let n = 0;
  while (v && typeof v === 'object' && 'ref' in v && n++ < 8) v = objetos.get(v.ref)?.dict;
  return v;
}

/** Mapa código → texto a partir del CMap /ToUnicode de una fuente. */
function leerToUnicode(cmap: string): Map<number, string> {
  const mapa = new Map<number, string>();
  const hexATexto = (h: string) => {
    let t = '';
    for (let i = 0; i + 3 < h.length + 1; i += 4) {
      const cod = parseInt(h.slice(i, i + 4), 16);
      if (!Number.isNaN(cod)) t += String.fromCharCode(cod);
    }
    return t;
  };
  for (const bloque of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const par of bloque.match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g) ?? []) {
      const [, a, b] = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/.exec(par)!;
      mapa.set(parseInt(a, 16), hexATexto(b));
    }
  }
  for (const bloque of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bloque))) {
      const desde = parseInt(m[1], 16), hasta = parseInt(m[2], 16), destino = parseInt(m[3], 16);
      for (let c = desde; c <= hasta && c - desde < 512; c++) mapa.set(c, String.fromCharCode(destino + (c - desde)));
    }
  }
  return mapa;
}

/** Convierte una cadena literal del stream a bytes reales. */
function literalABytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out.push(s.charCodeAt(i)); continue; }
    const sig = s[++i];
    if (sig === undefined) break;
    const oct = /[0-7]/.test(sig) ? s.slice(i, i + 3).match(/^[0-7]{1,3}/)?.[0] : null;
    if (oct) { out.push(parseInt(oct, 8)); i += oct.length - 1; continue; }
    const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
    if (sig in escapes) out.push(escapes[sig]);
    else if (sig === '\n') { /* continuación de línea */ }
    else out.push(sig.charCodeAt(0));
  }
  return out;
}

interface Fuente { unicode: Map<number, string> | null; dosBytes: boolean }

/** Recorre el stream de contenido y devuelve cada texto con su posición. */
function extraerDeContenido(contenido: string, fuentes: Map<string, Fuente>): PdfTextItem[] {
  const items: PdfTextItem[] = [];
  // matriz de transformación actual y la del texto: [a b c d e f]
  let ctm = [1, 0, 0, 1, 0, 0];
  const pila: number[][] = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let leading = 0;
  let fuente: Fuente | null = null;

  const mult = (m: number[], n: number[]) => [
    m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
  ];

  const decodificar = (bytes: number[]): string => {
    if (fuente?.unicode) {
      let t = '';
      if (fuente.dosBytes) {
        for (let i = 0; i + 1 < bytes.length; i += 2) {
          t += fuente.unicode.get((bytes[i] << 8) | bytes[i + 1]) ?? '';
        }
      } else {
        for (const b of bytes) t += fuente.unicode.get(b) ?? String.fromCharCode(b);
      }
      return t;
    }
    return Buffer.from(bytes).toString('latin1');
  };

  const emitir = (texto: string) => {
    if (!texto.trim()) return;
    const m = mult(tm, ctm);
    items.push({ s: texto, x: Math.round(m[4]), y: Math.round(m[5]) });
  };

  // separa el stream en tokens: cadenas, arreglos, números, nombres y operadores
  const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[[^\]]*\]|\/[^\s/<>[\]()]+|[-+]?[\d.]+|[A-Za-z'"*]+/g;
  const tokens = contenido.match(re) ?? [];
  const nums: number[] = [];
  let ultimoNombre = '';

  const textoDeToken = (t: string): number[] => {
    if (t.startsWith('(')) return literalABytes(t.slice(1, -1));
    const hex = t.slice(1, -1).replace(/\s/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt((hex.slice(i, i + 2) + '0').slice(0, 2), 16));
    return bytes;
  };

  for (const t of tokens) {
    if (/^[-+]?[\d.]+$/.test(t)) { nums.push(Number(t)); continue; }
    if (t.startsWith('/')) { ultimoNombre = t.slice(1); continue; }
    if (t.startsWith('(') || t.startsWith('<')) { nums.length = 0; emitir(decodificar(textoDeToken(t))); continue; }
    if (t.startsWith('[')) {
      // TJ: el arreglo mezcla cadenas y desplazamientos
      let texto = '';
      for (const p of t.match(/\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|[-+]?[\d.]+/g) ?? []) {
        if (p.startsWith('(') || p.startsWith('<')) texto += decodificar(textoDeToken(p));
        else if (Number(p) < -180) texto += ' '; // hueco grande = separación de palabras
      }
      emitir(texto);
      nums.length = 0;
      continue;
    }

    switch (t) {
      case 'q': pila.push([...ctm]); break;
      case 'Q': ctm = pila.pop() ?? ctm; break;
      case 'cm': if (nums.length >= 6) ctm = mult(nums.slice(-6), ctm); break;
      case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = [...tm]; break;
      case 'Tf': fuente = fuentes.get(ultimoNombre) ?? null; break;
      case 'TL': leading = nums[nums.length - 1] ?? 0; break;
      case 'Td':
        if (nums.length >= 2) { tlm = mult([1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]], tlm); tm = [...tlm]; }
        break;
      case 'TD':
        if (nums.length >= 2) {
          leading = -nums[nums.length - 1];
          tlm = mult([1, 0, 0, 1, nums[nums.length - 2], nums[nums.length - 1]], tlm); tm = [...tlm];
        }
        break;
      case 'Tm': if (nums.length >= 6) { tlm = nums.slice(-6); tm = [...tlm]; } break;
      case 'T*': tlm = mult([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm]; break;
      case "'": case '"': tlm = mult([1, 0, 0, 1, 0, -leading], tlm); tm = [...tlm]; break;
      default: break;
    }
    nums.length = 0;
  }
  return items;
}

/** Extrae el texto posicionado de las primeras páginas del PDF. */
export function extraerTextoPdf(pdf: Uint8Array, maxPaginas = 3): PdfTextItem[] {
  const buf = Buffer.from(pdf);
  const objetos = leerObjetos(buf);

  // páginas en el orden en que aparecen
  const paginas: Obj[] = [];
  for (const o of objetos.values()) {
    if (String(o.dict.Type) === '/Page') paginas.push(o);
  }
  if (!paginas.length) return [];

  const items: PdfTextItem[] = [];
  paginas.slice(0, maxPaginas).forEach((pag, idx) => {
    // fuentes de la página, para poder decodificar los códigos
    const fuentes = new Map<string, Fuente>();
    const recursos = resolver(objetos, pag.dict.Resources) ?? {};
    const fontDict = resolver(objetos, recursos.Font) ?? {};
    for (const [nombre, ref] of Object.entries(fontDict)) {
      const f = resolver(objetos, ref);
      if (!f || typeof f !== 'object') continue;
      let unicode: Map<number, string> | null = null;
      const tuRef = (f as Dict).ToUnicode;
      if (tuRef && typeof tuRef === 'object' && 'ref' in tuRef) {
        const tu = objetos.get(tuRef.ref);
        if (tu) unicode = leerToUnicode(descomprimir(tu).toString('latin1'));
      }
      const subtipo = String((f as Dict).Subtype ?? '');
      fuentes.set(nombre, { unicode, dosBytes: subtipo.includes('Type0') });
    }

    // contenido: puede ser un objeto o un arreglo de objetos
    const trozos: string[] = [];
    const c = pag.dict.Contents;
    if (c && typeof c === 'object' && 'ref' in c) {
      const o = objetos.get(c.ref);
      if (o) trozos.push(descomprimir(o).toString('latin1'));
    } else if (typeof c === 'string' && c.startsWith('[')) {
      for (const r of c.match(/(\d+)\s+\d+\s+R/g) ?? []) {
        const o = objetos.get(Number(/(\d+)/.exec(r)![1]));
        if (o) trozos.push(descomprimir(o).toString('latin1'));
      }
    }

    for (const it of extraerDeContenido(trozos.join('\n'), fuentes)) {
      // separa las páginas en el eje Y para que no se mezclen las líneas
      items.push({ ...it, y: it.y - idx * 10000 });
    }
  });
  return items;
}
