import type { InvoiceData } from './parsers';

export const fmtRD = (n: number | null | undefined) =>
  n == null ? '—' : 'RD$' + n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function monthLabel(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return `${MESES_LARGO[m - 1]} ${y}`;
}

export interface DailyRow { day: string; kwh: number }

/**
 * Genera una explicación en español del comportamiento de un mes facturado,
 * usando los datos diarios guardados de ese ciclo y el histórico de la factura.
 */
export function explainInvoice(inv: InvoiceData, daily: DailyRow[], previous?: { consumoKwh: number | null; facturadoRd: number | null } | null): string {
  const parts: string[] = [];
  const kwh = inv.consumoKwh;
  const hist = inv.historico.filter((h) => h.kwh > 0);
  const histAvg = hist.length ? hist.reduce((a, b) => a + b.kwh, 0) / hist.length : null;

  if (kwh != null) {
    parts.push(`Consumo facturado: ${kwh} kWh en ${inv.diasFacturados ?? '?'} días (${fmtDate(inv.periodoInicio)} → ${fmtDate(inv.periodoFin)}), total ${fmtRD(inv.facturadoRd)}.`);
    if (inv.diasFacturados) parts.push(`Promedio: ${(kwh / inv.diasFacturados).toFixed(1)} kWh por día.`);
  }
  if (kwh != null && previous?.consumoKwh) {
    const diff = kwh - previous.consumoKwh;
    const pct = (diff / previous.consumoKwh) * 100;
    parts.push(
      diff >= 0
        ? `Subió ${diff} kWh (+${pct.toFixed(0)}%) respecto al mes anterior (${previous.consumoKwh} kWh).`
        : `Bajó ${-diff} kWh (${pct.toFixed(0)}%) respecto al mes anterior (${previous.consumoKwh} kWh).`,
    );
  }
  if (kwh != null && histAvg) {
    const pct = ((kwh - histAvg) / histAvg) * 100;
    const max = Math.max(...hist.map((h) => h.kwh));
    parts.push(`El promedio de los últimos ${hist.length} meses es ${histAvg.toFixed(0)} kWh, así que este mes está ${pct >= 0 ? `${pct.toFixed(0)}% por encima` : `${(-pct).toFixed(0)}% por debajo`} de lo normal${kwh >= max ? ' y es el mes MÁS ALTO del histórico' : ''}.`);
  }
  if (inv.tramos.length > 1) {
    parts.push(`Tarifa por tramos: ${inv.tramos.map((t) => `${t.kwh} kWh a ${fmtRD(t.precio)}`).join(', ')} → energía ${fmtRD(inv.energiaRd)} (promedio ${fmtRD(inv.precioKwh)}/kWh).`);
  } else if (inv.tramos.length === 1 && kwh != null && kwh >= 700) {
    parts.push(`Al pasar de 700 kWh se pierden los tramos baratos: TODOS los ${kwh} kWh se cobraron a ${fmtRD(inv.tramos[0].precio)}/kWh (energía ${fmtRD(inv.energiaRd)}). Con 699 kWh la energía habría sido mucho menor porque los primeros 200 kWh se cobran a ~RD$6 y los siguientes 100 a ~RD$8.5.`);
  }
  if (inv.subsidioRd != null && inv.importeSinSubsidio != null) {
    parts.push(`Subsidio aplicado: ${fmtRD(Math.abs(inv.subsidioRd))} (sin subsidio serían ${fmtRD(inv.importeSinSubsidio)}).`);
  }

  // comportamiento diario del ciclo
  const cycle = daily.filter((d) => inv.periodoInicio && inv.periodoFin && d.day >= inv.periodoInicio && d.day <= inv.periodoFin && d.kwh > 0);
  if (cycle.length >= 5) {
    const avg = cycle.reduce((a, b) => a + b.kwh, 0) / cycle.length;
    const top = [...cycle].sort((a, b) => b.kwh - a.kwh).slice(0, 3);
    const weekend = cycle.filter((d) => [0, 6].includes(new Date(d.day + 'T00:00:00Z').getUTCDay()));
    const weekday = cycle.filter((d) => ![0, 6].includes(new Date(d.day + 'T00:00:00Z').getUTCDay()));
    const wAvg = weekend.length ? weekend.reduce((a, b) => a + b.kwh, 0) / weekend.length : null;
    const dAvg = weekday.length ? weekday.reduce((a, b) => a + b.kwh, 0) / weekday.length : null;
    parts.push(`Días de mayor consumo: ${top.map((t) => `${fmtDate(t.day)} (${DIAS[new Date(t.day + 'T00:00:00Z').getUTCDay()]}, ${t.kwh} kWh)`).join(', ')}.`);
    const spikes = cycle.filter((d) => d.kwh > avg * 1.5);
    if (spikes.length) parts.push(`${spikes.length} día(s) superaron en más de 50% el promedio diario del ciclo (${avg.toFixed(1)} kWh): ahí está la mayor parte del exceso.`);
    if (wAvg && dAvg) parts.push(`Fines de semana: ${wAvg.toFixed(1)} kWh/día vs. entre semana: ${dAvg.toFixed(1)} kWh/día.`);
    const firstHalf = cycle.slice(0, Math.floor(cycle.length / 2));
    const secondHalf = cycle.slice(Math.floor(cycle.length / 2));
    const f = firstHalf.reduce((a, b) => a + b.kwh, 0) / firstHalf.length;
    const s = secondHalf.reduce((a, b) => a + b.kwh, 0) / secondHalf.length;
    if (Math.abs(s - f) / f > 0.15) parts.push(s > f ? `El consumo fue en aumento durante el ciclo (segunda mitad ${((s / f - 1) * 100).toFixed(0)}% más alta).` : `El consumo fue bajando durante el ciclo (segunda mitad ${((1 - s / f) * 100).toFixed(0)}% más baja).`);
  } else {
    parts.push('No hay suficientes datos diarios guardados de este ciclo para detallar qué días dispararon el consumo (el registro diario empieza a partir de la instalación del monitor).');
  }
  return parts.join(' ');
}
