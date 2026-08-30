import { blocks, cells, links, textOf } from './html';

// ---------- utilidades ----------

/** "27/08/2026" -> "2026-08-27" (ISO). Devuelve null si no parsea. */
export function parseDateDMY(s: string | undefined | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "2026/07/15" -> "2026-07-15" */
export function parseDateYMD(s: string | undefined | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** "11,217.96" | "RD$11,344.77" | "-1,913.74" -> número */
export function parseMoney(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.replace(/RD\$/gi, '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

/** "15 ago. 2026" -> "2026-08-15" */
export function parseDateSpanish(s: string): string | null {
  const m = s.trim().toLowerCase().match(/(\d{1,2})\s+([a-z]{3})\.?\s+(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- Teleconsumo (HTML) ----------

export interface TeleconsumoData {
  nic: string | null;
  titular: string | null;
  medidor: string | null;
  tarifa: string | null;
  lecturaActivaKwh: number | null;
  fechaLectura: string | null;         // ISO
  fechaUltimaFactura: string | null;   // ISO — inicio del ciclo de facturación
  datosHasta: string | null;           // ISO
  consumoHastaFechaKwh: number | null;
  proyeccionKwh: number | null;
  diaMayorConsumo: string | null;      // ISO
  valorMayorKwh: number | null;
  /** consumo diario del ciclo actual: [{ day: ISO, kwh }] */
  daily: { day: string; kwh: number }[];
  /** etiquetas crudas de la gráfica (día del mes) por si hace falta depurar */
  rawChart: [string, number][];
}

/**
 * Lee los pares "Etiqueta | Valor" de todas las tablas de la página.
 * Las tablas de Teleconsumo son <th>Etiqueta</th><td>Valor</td> (a veces dos pares por fila).
 */
function collectPairs(html: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const tr of blocks(html, 'tr')) {
    const cs = cells(tr.inner);
    for (let i = 0; i + 1 < cs.length; i++) {
      const a = cs[i], b = cs[i + 1];
      if (a.tag === 'th' && b.tag === 'td') {
        const label = a.text.toLowerCase();
        if (label && !(label in pairs)) pairs[label] = b.text;
        i++; // saltar el td consumido
      }
    }
  }
  return pairs;
}

function find(pairs: Record<string, string>, ...needles: string[]): string | undefined {
  for (const n of needles) {
    const key = Object.keys(pairs).find((k) => k.includes(n));
    if (key) return pairs[key];
  }
  return undefined;
}

/** Extrae los pares ["15",30] de la gráfica Flot embebida en el HTML. */
export function extractChartSeries(html: string): [string, number][] {
  // La serie se genera en el servidor como algo tipo: [["15",30],["16",25],...]
  const re = /\[\s*(?:\[\s*["']?(\d{1,2})["']?\s*,\s*(-?\d+(?:\.\d+)?)\s*\]\s*,?\s*){3,}\]/g;
  let best: [string, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const inner = [...m[0].matchAll(/\[\s*["']?(\d{1,2})["']?\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g)];
    const series = inner.map((x) => [x[1], Number(x[2])] as [string, number]);
    if (series.length > best.length) best = series;
  }
  return best;
}

/**
 * Convierte las etiquetas de día ("15","16",...,"28") en fechas reales, partiendo
 * de la fecha de la última factura (inicio del ciclo) y avanzando; cuando el día
 * baja (31 -> 1) se pasa al mes siguiente.
 */
export function chartToDaily(series: [string, number][], cycleStart: string | null, datosHasta: string | null) {
  if (!series.length) return [];
  let cursor: Date;
  if (cycleStart) {
    cursor = new Date(cycleStart + 'T00:00:00Z');
    // alinear el cursor al primer día de la serie (normalmente coincide)
    const first = Number(series[0][0]);
    for (let i = 0; i < 40 && cursor.getUTCDate() !== first; i++) cursor.setUTCDate(cursor.getUTCDate() + 1);
  } else {
    const now = new Date();
    cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Number(series[0][0])));
  }
  const out: { day: string; kwh: number }[] = [];
  let prev = -1;
  for (const [label, kwh] of series) {
    const d = Number(label);
    if (prev !== -1) {
      // avanzar hasta que el día del mes coincida
      for (let i = 0; i < 40 && cursor.getUTCDate() !== d; i++) cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const iso = cursor.toISOString().slice(0, 10);
    // solo guardamos días con datos disponibles (los días futuros vienen en 0)
    if (!datosHasta || iso <= datosHasta) out.push({ day: iso, kwh });
    prev = d;
  }
  return out;
}

export function parseTeleconsumo(html: string): TeleconsumoData {
  const p = collectPairs(html);

  const fechaUltimaFactura = parseDateDMY(find(p, 'última factura', 'ultima factura'));
  const datosHasta = parseDateDMY(find(p, 'datos disponibles'));
  const rawChart = extractChartSeries(html);

  const num = (s?: string) => {
    if (!s) return null;
    const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  };

  return {
    nic: find(p, 'nic') ?? null,
    titular: find(p, 'titular') ?? null,
    medidor: find(p, 'medidor') ?? null,
    tarifa: find(p, 'tarifa') ?? null,
    lecturaActivaKwh: num(find(p, 'activa entregada')),
    fechaLectura: parseDateDMY(find(p, 'fecha lectura')),
    fechaUltimaFactura,
    datosHasta,
    consumoHastaFechaKwh: num(find(p, 'consumo hasta la fecha')),
    proyeccionKwh: num(find(p, 'proyección de consumo', 'proyeccion de consumo')),
    diaMayorConsumo: parseDateDMY(find(p, 'día de mayor consumo', 'dia de mayor consumo')),
    valorMayorKwh: num(find(p, 'valor de consumo')),
    daily: chartToDaily(rawChart, fechaUltimaFactura, datosHasta),
    rawChart,
  };
}

// ---------- Historial de facturas (HTML) ----------

export interface InvoiceLink {
  id: string;            // ej. 1234567097
  pdfUrl: string;        // ruta relativa /factpdf/...
  fechaEmision: string | null;
  tipo: string | null;
  cliente: string | null;
}

export function parseHistorial(html: string): InvoiceLink[] {
  const out: InvoiceLink[] = [];
  for (const tr of blocks(html, 'tr')) {
    const a = links(tr.inner).find((l) => l.href.includes('factpdf'));
    if (!a) continue;
    const href = a.href;
    const id = href.split('/').filter(Boolean).pop() || '';
    const tds = cells(tr.inner).filter((c) => c.tag === 'td').map((c) => c.text);
    const fechaTxt = tds.find((t) => parseDateSpanish(t)) || '';
    out.push({
      id,
      pdfUrl: href.startsWith('http') ? new URL(href).pathname : href,
      fechaEmision: parseDateSpanish(fechaTxt),
      tipo: tds[1] ?? null,
      cliente: tds[0] ?? null,
    });
  }
  return out;
}

/** En /historial (sin NIC) y /teleconsumo (sin NIC) aparece la lista de contratos con enlaces "Ver". */
export function parseContractLinks(html: string, base: 'historial' | 'teleconsumo'): string[] {
  const nics = new Set<string>();
  const re = new RegExp(`/${base}/(\\d+)`);
  for (const l of links(html)) {
    const m = l.href.match(re);
    if (m) nics.add(m[1]);
  }
  return [...nics];
}

// ---------- Factura (PDF) ----------

export interface PdfTextItem { s: string; x: number; y: number }

export interface InvoiceData {
  numeroFactura: string | null;
  refPago: string | null;
  contrato: string | null;
  fechaEmision: string | null;
  periodoInicio: string | null;
  periodoFin: string | null;
  diasFacturados: number | null;
  lecturaAnterior: number | null;
  lecturaActual: number | null;
  consumoKwh: number | null;
  cargoFijo: number | null;
  precioKwh: number | null;
  energiaRd: number | null;
  importeSinSubsidio: number | null;
  subsidioRd: number | null;
  facturadoRd: number | null;
  balancePendiente: number | null;
  totalAPagar: number | null;
  pagueAntesDe: string | null;
  tarifa: string | null;
  /** Tramos de la tarifa: [{ kwh, precio, importe }] — ej. 200 kWh a 5.97, 100 a 8.51, resto a 13.83 */
  tramos: { kwh: number; precio: number; importe: number }[];
  /** Histórico de consumos que trae la factura: [{ month: "2025-08-01", kwh }] */
  historico: { month: string; kwh: number }[];
}

/** Agrupa los items de texto del PDF en líneas (misma Y ± tolerancia), ordenadas de arriba hacia abajo. */
export function groupLines(items: PdfTextItem[], tol = 3): { y: number; items: PdfTextItem[]; text: string }[] {
  const sorted = items.filter((i) => i.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: PdfTextItem[]; text: string }[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= tol) {
      last.items.push(it);
    } else {
      lines.push({ y: it.y, items: [it], text: '' });
    }
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.text = l.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
  }
  return lines;
}

export function parseInvoiceItems(items: PdfTextItem[]): InvoiceData {
  const lines = groupLines(items);
  const all = lines.map((l) => l.text).join('\n');

  /** valor inmediatamente a la derecha de una etiqueta en la misma línea */
  const rightOf = (labelRe: RegExp): string | null => {
    for (const l of lines) {
      const idx = l.items.findIndex((i) => labelRe.test(i.s));
      if (idx >= 0) {
        const next = l.items[idx + 1];
        if (next) return next.s.trim();
        // a veces la etiqueta y el valor están en la misma cadena
        const m = l.items[idx].s.match(labelRe);
        const rest = l.items[idx].s.slice((m?.index ?? 0) + (m?.[0].length ?? 0)).trim();
        return rest || null;
      }
    }
    return null;
  };

  const grab = (re: RegExp): string | null => {
    const m = all.match(re);
    return m ? m[1] : null;
  };

  // "15/07/2026 - 15/08/2026 = 31 dias"
  const periodo = all.match(/(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*=\s*(\d+)\s*d[ií]as/i);

  // Fila de lectura: "Activa B.T. 11223344 42,769 43,568 1.00 799kWh"
  const lectura = all.match(/Activa\s+B\.?T\.?\s+\d+\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)\s+([\d,]+)\s*kWh/i);
  // Energía por tramos: "200 kWh X RD$5.97 RD$ 1,194.00", "100 kWh X RD$8.51 RD$ 851.00", "352 kWh X RD$13.83 RD$ 4,868.16"
  // (con ≥ 700 kWh desaparecen los tramos y todo se cobra a la tarifa alta: "799 kWh X RD$14.04")
  const tramos = [...all.matchAll(/([\d,]+)\s*kWh\s*X\s*RD\$\s*([\d.,]+)\s*RD\$\s*([\d,.-]+)/gi)]
    .map((m) => ({ kwh: parseMoney(m[1]) ?? 0, precio: parseMoney(m[2]) ?? 0, importe: parseMoney(m[3]) ?? 0 }));
  const energiaTotal = tramos.length ? tramos.reduce((a, t) => a + t.importe, 0) : null;
  const kwhTramos = tramos.reduce((a, t) => a + t.kwh, 0);
  // Cargo fijo: "31 dias, RD$ 126.81 RD$ 126.81"
  const cargo = all.match(/d[ií]as,\s*RD\$\s*([\d,.]+)/i);

  // Histórico: líneas "Ago 2025 517 00.000" / "Sep 722 00.000" ... "Ago 2026 799 00.000"
  const historico: { month: string; kwh: number }[] = [];
  let year: number | null = null;
  for (const l of lines) {
    const m = l.text.match(/^([A-Za-z]{3})(?:\s+(\d{4}))?\s+(\d+)\s+\d+\.\d+/);
    if (!m) continue;
    const mes = MESES[m[1].toLowerCase()];
    if (!mes) continue;
    if (m[2]) year = Number(m[2]);
    else if (year !== null && mes === 1) year += 1; // Ene sin año explícito = año siguiente
    if (year === null) continue;
    historico.push({ month: `${year}-${String(mes).padStart(2, '0')}-01`, kwh: Number(m[3]) });
  }
  // Corrección: el año solo viene en el primer y último mes; recalcular hacia atrás desde el último si existe
  const lastWithYear = [...lines].reverse().find((l) => /^[A-Za-z]{3}\s+\d{4}\s+\d+\s+\d+\.\d+/.test(l.text));
  const lastLabel = lastWithYear?.text.match(/^([A-Za-z]{3})\s+(\d{4})/);
  const lastExpected = lastLabel ? `${lastLabel[2]}-${String(MESES[lastLabel[1].toLowerCase()]).padStart(2, '0')}-01` : null;
  if (lastLabel && lastExpected && historico.length > 1 && historico[historico.length - 1].month !== lastExpected) {
    // el año solo aparece en el primer y último mes: si el conteo hacia adelante no cuadra, recalcular hacia atrás
    let y = Number(lastLabel[2]);
    let mes = MESES[lastLabel[1].toLowerCase()];
    for (let i = historico.length - 1; i >= 0; i--) {
      historico[i].month = `${y}-${String(mes).padStart(2, '0')}-01`;
      mes -= 1;
      if (mes === 0) { mes = 12; y -= 1; }
    }
  }

  const refPagoVal = grab(/Ref\.\s*Pago[.\s:]*(\d+)/i);
  return {
    numeroFactura: grab(/No\.\s*Factura[.\s:]*(\d+)/i),
    refPago: refPagoVal,
    contrato: grab(/CONTRATO\s*:\s*(?:\*\d+\*\s*)?(\d+)/i) ?? (refPagoVal ? refPagoVal.slice(0, -3) : null),
    fechaEmision: parseDateDMY(grab(/FECHA EMISION[.\s:]*(\d{2}\/\d{2}\/\d{4})/i)),
    periodoInicio: periodo ? parseDateDMY(periodo[1]) : null,
    periodoFin: periodo ? parseDateDMY(periodo[2]) : null,
    diasFacturados: periodo ? Number(periodo[3]) : null,
    lecturaAnterior: lectura ? parseMoney(lectura[1]) : null,
    lecturaActual: lectura ? parseMoney(lectura[2]) : null,
    consumoKwh: lectura ? parseMoney(lectura[4]) : kwhTramos || null,
    cargoFijo: cargo ? parseMoney(cargo[1]) : null,
    // precio promedio efectivo por kWh (energía / kWh); los tramos individuales van en `tramos`
    precioKwh: energiaTotal != null && kwhTramos ? Math.round((energiaTotal / kwhTramos) * 10000) / 10000 : null,
    energiaRd: energiaTotal != null ? Math.round(energiaTotal * 100) / 100 : null,
    importeSinSubsidio: parseMoney(grab(/IMPORTE SIN SUBSIDIO EN RD\$\s*RD\$\s*([\d,.-]+)/i)),
    subsidioRd: parseMoney(grab(/IMPORTE SUBSIDIADO EN RD\$\s*RD\$\s*([\d,.-]+)/i)),
    facturadoRd: parseMoney(grab(/FACTURADO MES \w+\s*RD\$\s*([\d,.-]+)/i)),
    balancePendiente: parseMoney(grab(/BALANCE PENDIENTE[.\s:]*(?:RD\$)?\s*([\d,.-]+)/i)),
    totalAPagar: parseMoney(grab(/VALOR TOTAL A PAGAR[.\s:]*(?:RD\$)?\s*([\d,.-]+)/i)),
    pagueAntesDe: parseDateDMY(grab(/PAGUE ANTES DE\s*(\d{2}\/\d{2}\/\d{4})/i)),
    tarifa: rightOf(/^TARIFA/i),
    tramos,
    historico,
  };
}
