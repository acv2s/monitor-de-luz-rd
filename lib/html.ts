/**
 * Mini utilidades de HTML basadas en expresiones regulares.
 * La Oficina Virtual de Edenorte es HTML simple renderizado en servidor (Yii2 + tablas Bootstrap),
 * así que no hace falta un parser completo (y evitamos dependencias pesadas en Vercel).
 */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m);
}

/** Texto plano de un fragmento HTML (sin etiquetas, espacios normalizados). */
export function textOf(fragment: string): string {
  return decodeEntities(
    fragment
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

/** Atributos de una etiqueta de apertura: `<input type="text" name=foo>` → { type: 'text', name: 'foo' } */
export function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, '').replace(/\/?>$/, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

/** Todas las etiquetas de un tipo (solo apertura, útil para <input>, <meta>, <a>). */
export function tags(html: string, name: string): { tag: string; attrs: Record<string, string>; index: number }[] {
  const re = new RegExp(`<${name}\\b[^>]*>`, 'gi');
  const out: { tag: string; attrs: Record<string, string>; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ tag: m[0], attrs: attrs(m[0]), index: m.index });
  return out;
}

/** Bloques `<name ...>...</name>` (sin anidamiento del mismo nombre, suficiente para form/table/tr). */
export function blocks(html: string, name: string): { outer: string; inner: string; attrs: Record<string, string> }[] {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'gi');
  const out: { outer: string; inner: string; attrs: Record<string, string> }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const open = m[0].match(/^<[^>]*>/)![0];
    out.push({ outer: m[0], inner: m[1], attrs: attrs(open) });
  }
  return out;
}

/** Celdas de una fila: [{ tag: 'th'|'td', text, inner }] en orden. */
export function cells(rowInner: string): { tag: 'th' | 'td'; text: string; inner: string }[] {
  const re = /<(th|td)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  const out: { tag: 'th' | 'td'; text: string; inner: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowInner))) out.push({ tag: m[1].toLowerCase() as 'th' | 'td', text: textOf(m[2]), inner: m[2] });
  return out;
}

/** Enlaces: [{ href, text }] */
export function links(html: string): { href: string; text: string; index: number }[] {
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  const out: { href: string; text: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const a = attrs('<a' + m[1] + '>');
    if (a.href) out.push({ href: a.href, text: textOf(m[2]), index: m.index });
  }
  return out;
}
