import { sql } from './db';
import { fmtDate, fmtRD, monthLabel } from './analysis';
import { getPricing, estimateCost } from './pricing';
import { settingNumber } from './settings';
import { getThreshold } from './goal';

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const BLOQUES = '▁▂▃▄▅▆▇█';

export function barra(pct: number, ancho = 10): string {
  const llenos = Math.max(0, Math.min(ancho, Math.round((pct / 100) * ancho)));
  return '▓'.repeat(llenos) + '░'.repeat(ancho - llenos);
}

export function sparkline(vals: number[]): string {
  const max = Math.max(...vals, 1);
  return vals.map((v) => BLOQUES[Math.min(7, Math.floor((v / max) * 7.99))]).join('');
}

/** Límite vigente del contrato (o el global si no se pasa ninguno). */
async function limiteDe(cid: number | null): Promise<number> {
  if (cid != null) {
    const [c] = await sql()<{ kwh_threshold: number }[]>`SELECT kwh_threshold FROM contracts WHERE id = ${cid}`;
    if (c?.kwh_threshold) return c.kwh_threshold;
  }
  return getThreshold(cid);
}

async function loadCiclo(cid: number | null) {
  const THRESHOLD = await limiteDe(cid);
  const db = sql();
  const [snap] = await db<any[]>`
    SELECT nic, to_char(fecha_ultima_factura,'YYYY-MM-DD') AS cycle_start, to_char(datos_hasta,'YYYY-MM-DD') AS datos_hasta,
           consumo_hasta_fecha_kwh AS consumo, proyeccion_kwh AS proyeccion,
           to_char(dia_mayor_consumo,'YYYY-MM-DD') AS dia_mayor, valor_mayor_kwh AS valor_mayor
    FROM teleconsumo_snapshots
    WHERE (${cid}::bigint IS NULL OR contract_id = ${cid})
    ORDER BY captured_at DESC LIMIT 1`;
  if (!snap) return null;
  const daily = snap.cycle_start
    ? await db<{ day: string; kwh: number }[]>`
        SELECT to_char(day,'YYYY-MM-DD') AS day, kwh::float AS kwh FROM daily_consumption
        WHERE nic = ${snap.nic} AND day >= ${snap.cycle_start} ORDER BY day`
    : [];
  const dias = daily.filter((d) => d.kwh > 0);
  const avg = dias.length ? dias.reduce((a, b) => a + b.kwh, 0) / dias.length : 0;
  const transcurridos = snap.cycle_start && snap.datos_hasta
    ? Math.round((Date.parse(snap.datos_hasta) - Date.parse(snap.cycle_start)) / 86400000) : 0;
  const restantes = Math.max(0, 31 - transcurridos);
  const permitido = restantes > 0 ? Math.max(0, (THRESHOLD - snap.consumo) / restantes) : 0;
  return { snap, dias, avg, transcurridos, restantes, permitido };
}

/** Mensaje "¿cómo voy?": estado organizado del ciclo con barra y mini-gráfica. */
export async function statusMessage(cid: number | null = null): Promise<string> {
  const THRESHOLD = await limiteDe(cid);
  const c = await loadCiclo(cid);
  if (!c) return 'Todavía no tengo datos. El monitor corre a diario a la 1:00 pm; espera la primera corrida.';
  const { snap, dias, avg, transcurridos, restantes, permitido } = c;
  const consumo = snap.consumo ?? 0;
  const proy = snap.proyeccion ?? 0;
  const pct = Math.round((consumo / THRESHOLD) * 100);
  const icon = consumo >= THRESHOLD ? '🚨' : proy >= THRESHOLD ? '⚠️' : '✅';
  const ult7 = dias.slice(-7);
  const lines = [
    `${icon} <b>Tu consumo · NIC ${snap.nic}</b>`,
    '',
    `<b>Ciclo:</b> ${fmtDate(snap.cycle_start)} → hoy (día ${transcurridos}, faltan ~${restantes})`,
    `<b>Acumulado:</b> ${consumo} kWh de ${THRESHOLD}`,
    `${barra(pct)} ${pct}%`,
    '',
    `<b>Proyección:</b> ${proy} kWh ${proy >= THRESHOLD ? `❌ (se pasa por ${proy - THRESHOLD})` : `✅ (margen de ${THRESHOLD - proy})`}`,
    `<b>Promedio:</b> ${avg.toFixed(1)} kWh/día · <b>Meta:</b> máx. ${permitido.toFixed(1)} kWh/día`,
  ];
  const pricing = await getPricing(cid);
  if (pricing) {
    lines.push('', `💵 <b>Gastado hasta hoy:</b> ~${fmtRD(estimateCost(consumo, pricing))}`,
      `<b>Pagarías al cierre:</b> ~${fmtRD(estimateCost(proy, pricing))} (kWh a ${fmtRD(pricing.precioKwh)}${proy >= THRESHOLD && pricing.precioKwhAlto ? `; ${fmtRD(pricing.precioKwhAlto)} al pasar los ${THRESHOLD}` : ''})`);
  }
  if (ult7.length >= 3) {
    lines.push('', `<b>Últimos ${ult7.length} días:</b> ${sparkline(ult7.map((d) => d.kwh))}`,
      ult7.map((d) => `${fmtDate(d.day).slice(0, 5)}: ${d.kwh}`).join(' · '));
  }
  if (snap.valor_mayor) lines.push('', `📈 Día más alto: ${fmtDate(snap.dia_mayor)} con ${snap.valor_mayor} kWh`);
  return lines.join('\n');
}

/** Consejos personalizados según los patrones del ciclo actual. */
export async function adviceMessage(cid: number | null = null): Promise<string> {
  const THRESHOLD = await limiteDe(cid);
  const c = await loadCiclo(cid);
  if (!c) return 'Todavía no tengo datos para darte consejos. Espera la primera corrida del monitor.';
  const { snap, dias, avg, restantes, permitido } = c;
  const consumo = snap.consumo ?? 0;
  const proy = snap.proyeccion ?? 0;
  const tips: string[] = [];

  if (proy >= THRESHOLD && restantes > 0) {
    tips.push(`Vas camino a ${proy} kWh. Para cerrar bajo ${THRESHOLD} tienes que bajar de ${avg.toFixed(1)} a <b>${permitido.toFixed(1)} kWh/día</b> los próximos ${restantes} días — recorte de ${Math.max(0, Math.round((1 - permitido / Math.max(0.1, avg)) * 100))}%.`);
  } else if (consumo < THRESHOLD) {
    tips.push(`Vas bien: si te mantienes en ≤${permitido.toFixed(1)} kWh/día cierras el ciclo bajo los ${THRESHOLD} kWh.`);
  }

  const altos = dias.filter((d) => avg > 0 && d.kwh >= avg * 1.5);
  if (altos.length) {
    const porDow = new Map<number, number>();
    for (const d of altos) { const dow = new Date(d.day + 'T00:00:00Z').getUTCDay(); porDow.set(dow, (porDow.get(dow) || 0) + 1); }
    const [peorDow, veces] = [...porDow.entries()].sort((a, b) => b[1] - a[1])[0];
    tips.push(`Tienes ${altos.length} día(s) pico (≥1.5× tu promedio)${veces > 1 ? `, sobre todo los <b>${DIAS_SEMANA[peorDow]}s</b>` : ''}: revisa qué haces distinto esos días (aire más horas, lavado/secado, calentador).`);
  }

  const weekend = dias.filter((d) => [0, 6].includes(new Date(d.day + 'T00:00:00Z').getUTCDay()));
  const weekday = dias.filter((d) => ![0, 6].includes(new Date(d.day + 'T00:00:00Z').getUTCDay()));
  if (weekend.length >= 2 && weekday.length >= 3) {
    const wAvg = weekend.reduce((a, b) => a + b.kwh, 0) / weekend.length;
    const dAvg = weekday.reduce((a, b) => a + b.kwh, 0) / weekday.length;
    if (wAvg > dAvg * 1.15) tips.push(`Los fines de semana gastas ${((wAvg / dAvg - 1) * 100).toFixed(0)}% más (${wAvg.toFixed(1)} vs ${dAvg.toFixed(1)} kWh/día): ahí está tu mejor oportunidad de recorte.`);
  }

  tips.push(`El aire acondicionado suele ser 50-70% de la factura: cada grado más frío son ~6% más de consumo (24°C es buen punto), y limpiar los filtros baja el gasto.`,
    `Pasar de ${THRESHOLD} kWh sale carísimo: se pierden los tramos baratos de la tarifa y TODOS los kWh se cobran al precio alto — no es solo el excedente.`);

  return `💡 <b>Consejos para tu ciclo</b>\n\n` + tips.map((t) => `• ${t}`).join('\n\n');
}

/** Resumen de la última factura leída. */
export async function invoiceMessage(cid: number | null = null): Promise<string> {
  const THRESHOLD = await limiteDe(cid);
  const db = sql();
  const [inv] = await db<any[]>`
    SELECT to_char(periodo_fin,'YYYY-MM-DD') AS periodo_fin, consumo_kwh, facturado_rd::float AS facturado_rd,
           total_a_pagar::float AS total, to_char(pague_antes_de,'YYYY-MM-DD') AS vence, analysis
    FROM invoices WHERE parsed_ok AND (${cid}::bigint IS NULL OR contract_id = ${cid})
    ORDER BY fecha_emision DESC LIMIT 1`;
  if (!inv) return 'Todavía no hay ninguna factura leída. Después de la próxima corrida diaria debería aparecer.';
  return [
    `🧾 <b>Última factura · ${inv.periodo_fin ? monthLabel(inv.periodo_fin) : ''}</b>`,
    '',
    `<b>Consumo:</b> ${inv.consumo_kwh} kWh${inv.consumo_kwh >= THRESHOLD ? ' 🚨 (pasó el límite)' : ''}`,
    `<b>Facturado:</b> ${fmtRD(inv.facturado_rd)} · <b>Total a pagar:</b> ${fmtRD(inv.total)}`,
    `<b>Vence:</b> ${fmtDate(inv.vence)}`,
    ...(inv.analysis ? ['', inv.analysis] : []),
  ].join('\n');
}

/**
 * Gráfica unificada para el resumen: barras de los últimos 7 días con dos
 * líneas de referencia — el promedio del ciclo y el promedio diario derivado
 * de los últimos 12 meses facturados.
 */
export async function weeklyChart(cid: number | null = null): Promise<{ url: string; caption: string } | null> {
  const c = await loadCiclo(cid);
  if (!c || c.dias.length < 2) return null;
  const { dias, avg } = c;
  const ult = dias.slice(-7);
  const db = sql();
  const [hist] = await db<{ avg_mes: number | null }[]>`
    SELECT AVG(kwh)::float AS avg_mes FROM (
      SELECT kwh FROM monthly_consumption
      WHERE (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY month DESC LIMIT 12
    ) t`;
  const avg12 = hist?.avg_mes ? hist.avg_mes / 30 : null;
  const labels = ult.map((d) => {
    const dow = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][new Date(d.day + 'T00:00:00Z').getUTCDay()];
    return `${dow} ${Number(d.day.slice(8))}`;
  });
  const annotations: any = {
    prom: { type: 'line', yMin: avg, yMax: avg, borderColor: '#2a78d6', borderWidth: 2, borderDash: [6, 4], label: { display: true, content: `prom. ciclo ${avg.toFixed(1)}`, position: 'start', backgroundColor: '#2a78d6' } },
  };
  if (avg12) {
    annotations.hist = { type: 'line', yMin: avg12, yMax: avg12, borderColor: '#52617a', borderWidth: 2, borderDash: [2, 3], label: { display: true, content: `prom. 12 meses ${avg12.toFixed(1)}`, position: 'end', backgroundColor: '#52617a' } };
  }
  const cfg = {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'kWh', data: ult.map((d) => d.kwh), backgroundColor: ult.map((d) => d.kwh >= avg * 1.5 ? '#e34948' : d.kwh >= avg * 1.2 ? '#c98500' : '#2a78d6'), borderRadius: 6 }],
    },
    options: { plugins: { legend: { display: false }, annotation: { annotations } }, scales: { y: { beginAtZero: true } } },
  };
  return {
    url: `https://quickchart.io/chart?w=800&h=380&bkg=white&v=4&c=${encodeURIComponent(JSON.stringify(cfg))}`,
    caption: `📊 Última semana vs. tu promedio del ciclo (${avg.toFixed(1)} kWh/día)${avg12 ? ` y el de los últimos 12 meses (${avg12.toFixed(1)})` : ''}`,
  };
}

/** Detalle de los últimos 12 meses: texto con la lista + gráfica mensual. */
export async function monthlyDetailMessage(cid: number | null = null): Promise<{ text: string; chart: { url: string; caption: string } | null }> {
  const THRESHOLD = await limiteDe(cid);
  const db = sql();
  const rows = await db<{ mes: string; kwh: number }[]>`
    SELECT to_char(month,'YYYY-MM-DD') AS mes, kwh FROM monthly_consumption
    WHERE (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY month DESC LIMIT 12`;
  if (!rows.length) return { text: 'Todavía no hay meses guardados.', chart: null };
  const asc = [...rows].reverse();
  const avg = asc.reduce((a, b) => a + b.kwh, 0) / asc.length;
  const max = asc.reduce((a, b) => (b.kwh > a.kwh ? b : a));
  const lines = asc.map((r) => {
    const flag = r.kwh >= THRESHOLD ? ' 🚨' : r.kwh >= THRESHOLD * 0.9 ? ' ⚠️' : '';
    return `${monthLabel(r.mes).padEnd(0)}: <b>${r.kwh}</b> kWh${flag}`;
  });
  const text = [
    `📅 <b>Últimos ${asc.length} meses</b>`,
    '',
    ...lines,
    '',
    `Promedio: <b>${avg.toFixed(0)} kWh/mes</b> (~${(avg / 30).toFixed(1)} kWh/día)`,
    `Mes más alto: ${monthLabel(max.mes)} con ${max.kwh} kWh`,
    `Meses sobre el límite de ${THRESHOLD}: ${asc.filter((r) => r.kwh >= THRESHOLD).length}`,
  ].join('\n');
  const charts = await chartUrls(cid);
  return { text, chart: charts.find((ch) => ch.caption.includes('mes')) ?? null };
}

/**
 * URLs de imágenes de gráfica (QuickChart renderiza un Chart.js como PNG).
 * Devuelve [gráfica diaria del ciclo, gráfica mensual] — vacío si no hay datos.
 */
export async function chartUrls(cid: number | null = null): Promise<{ url: string; caption: string }[]> {
  const THRESHOLD = await limiteDe(cid);
  const out: { url: string; caption: string }[] = [];
  const c = await loadCiclo(cid);
  if (c && c.dias.length >= 2) {
    const { dias, avg } = c;
    const cfg = {
      type: 'bar',
      data: {
        labels: dias.map((d) => d.day.slice(8) + '/' + d.day.slice(5, 7)),
        datasets: [{
          label: 'kWh por día',
          data: dias.map((d) => d.kwh),
          backgroundColor: dias.map((d) => d.kwh >= avg * 1.5 ? '#e34948' : d.kwh >= avg * 1.2 ? '#c98500' : '#2a78d6'),
        }],
      },
      options: {
        plugins: {
          legend: { display: false },
          annotation: { annotations: { prom: { type: 'line', yMin: avg, yMax: avg, borderColor: '#52514e', borderWidth: 2, borderDash: [6, 4], label: { display: true, content: `promedio ${avg.toFixed(1)}`, position: 'end' } } } },
        },
        scales: { y: { beginAtZero: true } },
      },
    };
    out.push({
      url: `https://quickchart.io/chart?w=800&h=380&bkg=white&v=4&c=${encodeURIComponent(JSON.stringify(cfg))}`,
      caption: `📊 Consumo diario del ciclo (azul normal · amarillo alto · rojo pico)`,
    });
  }
  const db = sql();
  const monthly = await db<{ mes: string; kwh: number }[]>`
    SELECT to_char(month,'MM/YY') AS mes, kwh FROM monthly_consumption
    WHERE (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY month DESC LIMIT 13`;
  if (monthly.length >= 2) {
    const rows = monthly.reverse();
    const cfg = {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.mes),
        datasets: [{ label: 'kWh por mes', data: rows.map((r) => r.kwh), backgroundColor: rows.map((r) => r.kwh >= THRESHOLD ? '#e34948' : '#2a78d6') }],
      },
      options: {
        plugins: {
          legend: { display: false },
          annotation: { annotations: { lim: { type: 'line', yMin: THRESHOLD, yMax: THRESHOLD, borderColor: '#e34948', borderWidth: 2, borderDash: [6, 4], label: { display: true, content: `límite ${THRESHOLD}`, position: 'end' } } } },
        },
        scales: { y: { beginAtZero: true } },
      },
    };
    out.push({
      url: `https://quickchart.io/chart?w=800&h=380&bkg=white&v=4&c=${encodeURIComponent(JSON.stringify(cfg))}`,
      caption: `📅 Consumo por mes (rojo = pasó los ${THRESHOLD} kWh)`,
    });
  }
  return out;
}

export function helpMessage(): string {
  return [
    '👋 <b>Monitor de Luz</b> — pregúntame:',
    '',
    '• <b>/consumo</b> (o "¿cómo voy?") — estado del ciclo, proyección y últimos días',
    '• <b>/consejos</b> — recomendaciones según tus patrones de consumo',
    '• <b>/factura</b> — resumen de la última factura',
    '• <b>/grafica</b> — las gráficas del consumo como imagen',
    '• 🎙️ <b>Nota de voz</b> — mándame un audio y te respondo igual',
    '• <b>12 meses</b> — detalle y gráfica del último año',
    '',
    'Además te aviso solo: resumen diario, proyección sobre el límite, días pico y facturas nuevas.',
  ].join('\n');
}
