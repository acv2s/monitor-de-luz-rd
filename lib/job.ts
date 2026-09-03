import { sql, ensureSchema } from './db';
import { PortalClient } from './portal';
import { extractPdfItems } from './pdf';
import { parseInvoiceItems, type TeleconsumoData } from './parsers';
import { sendTelegram, sendTelegramPhoto, sendTelegramTo, sendTelegramPhotoTo } from './telegram';
import { chatsDelContrato } from './telegram-link';
import { anotarSonda } from './publicacion';
import { diasDeAtraso } from './lag';
import { explainInvoice, fmtRD, fmtDate, monthLabel } from './analysis';
import { setting, settingNumber, settingBool } from './settings';
import { getThreshold } from './goal';
import { contratosActivos, type Contrato } from './contracts';
import { distribuidora } from './utilities';
import { porQueFallo } from './fallos';


import type { Nivel as Level } from './fallos';

/** Cómo se identifica la cuenta en los avisos: su nombre, sin marcas ajenas. */
const etiquetaDe = (c: Contrato) => c.nombre || `Contrato ${c.id}`;



/**
 * Avisa SOLO a los chats de ese contrato.
 *
 * Nunca se reparte a todos los destinatarios: hacerlo mandaba la factura y
 * los errores de una persona a los chats de las demás. Si esa cuenta no tiene
 * ningún chat enlazado, el aviso no sale — queda registrado en la corrida.
 */
async function avisarContrato(cid: number | null, texto: string): Promise<boolean> {
  if (cid == null) return false;
  const chats = await chatsDelContrato(cid);
  if (!chats.length) return false;
  const enviados = await Promise.all(chats.map((c) => sendTelegramTo(c, texto, { dashboardButton: true })));
  return enviados.some(Boolean);
}

async function avisarFoto(cid: number | null, url: string, caption: string): Promise<void> {
  if (cid == null) return;
  const chats = await chatsDelContrato(cid);
  await Promise.all(chats.map((c) => sendTelegramPhotoTo(c, url, caption)));
}

/** Registra la alerta si no existe (por dedupe_key) y la envía por Telegram. */
async function alert(cid: number | null, nic: string, rule: string, dedupeKey: string, level: Level, message: string, log: string[], cuenta = 'Tu cuenta') {
  const db = sql();
  const inserted = await db`
    INSERT INTO alerts (contract_id, nic, rule, dedupe_key, level, message)
    VALUES (${cid}, ${nic}, ${rule}, ${dedupeKey}, ${level}, ${message})
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id`;
  let id: number;
  if (inserted.length) {
    id = inserted[0].id;
  } else {
    // Ya existe: si nunca llegó a enviarse (p. ej. Telegram no estaba configurado), reintenta.
    const [prev] = await db<{ id: number; sent: boolean }[]>`SELECT id, sent FROM alerts WHERE dedupe_key = ${dedupeKey}`;
    if (!prev || prev.sent) return;
    id = prev.id;
  }
  const icon = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️';
  const ok = await avisarContrato(cid, `${icon} <b>${cuenta}${nic ? ` · NIC ${nic}` : ''}</b>\n${message}`);
  await db`UPDATE alerts SET sent = ${ok}, message = ${message} WHERE id = ${id}`;
  log.push(`alerta[${rule}] ${ok ? 'enviada' : 'NO enviada'}: ${message.slice(0, 80)}`);
}

async function saveTeleconsumo(cid: number, nic: string, t: TeleconsumoData, log: string[]) {
  const db = sql();
  await db`
    INSERT INTO teleconsumo_snapshots
      (contract_id, nic, fecha_ultima_factura, datos_hasta, fecha_lectura, lectura_activa_kwh,
       consumo_hasta_fecha_kwh, proyeccion_kwh, dia_mayor_consumo, valor_mayor_kwh,
       titular, tarifa, medidor, raw)
    VALUES
      (${cid}, ${nic}, ${t.fechaUltimaFactura}, ${t.datosHasta}, ${t.fechaLectura}, ${t.lecturaActivaKwh},
       ${t.consumoHastaFechaKwh}, ${t.proyeccionKwh}, ${t.diaMayorConsumo}, ${t.valorMayorKwh},
       ${t.titular}, ${t.tarifa}, ${t.medidor}, ${db.json(t as any)})`;

  for (const d of t.daily) {
    await db`
      INSERT INTO daily_consumption (contract_id, nic, day, kwh, cycle_start)
      VALUES (${cid}, ${nic}, ${d.day}, ${d.kwh}, ${t.fechaUltimaFactura})
      ON CONFLICT (nic, day) DO UPDATE
        SET kwh = EXCLUDED.kwh, cycle_start = EXCLUDED.cycle_start, contract_id = EXCLUDED.contract_id, updated_at = now()`;
  }
  log.push(`teleconsumo: ${t.consumoHastaFechaKwh} kWh hasta ${fmtDate(t.datosHasta)}, proyección ${t.proyeccionKwh} kWh, ${t.daily.length} días guardados`);
}

async function evaluateAlerts(c: Contrato, nic: string, t: TeleconsumoData, log: string[], silencioso = false) {
  const THRESHOLD = c.kwh_threshold || await getThreshold();
  const WARN_RATIO = await settingNumber('KWH_WARN_RATIO');
  const SPIKE_RATIO = await settingNumber('DAILY_SPIKE_RATIO');
  const cycle = t.fechaUltimaFactura || 'sin-ciclo';
  const consumo = t.consumoHastaFechaKwh ?? 0;
  const proy = t.proyeccionKwh ?? 0;
  const dias = t.daily.filter((d) => d.kwh > 0);
  const avg = dias.length ? dias.reduce((a, b) => a + b.kwh, 0) / dias.length : 0;
  const restantes = t.datosHasta && t.fechaUltimaFactura
    ? Math.max(0, 31 - Math.round((Date.parse(t.datosHasta) - Date.parse(t.fechaUltimaFactura)) / 86400000))
    : null;
  const resumen = `Consumo del ciclo (desde ${fmtDate(t.fechaUltimaFactura)}): <b>${consumo} kWh</b> hasta ${fmtDate(t.datosHasta)}. Proyección del portal: <b>${proy} kWh</b>. Promedio ${avg.toFixed(1)} kWh/día${restantes != null ? `, faltan ~${restantes} días` : ''}.`;

  // 1) Ya superó el umbral
  if (consumo >= THRESHOLD) {
    await alert(c.id, nic, 'consumo_supera_umbral', `consumo>=${THRESHOLD}:${cycle}`, 'critical',
      `Ya superaste los ${THRESHOLD} kWh en este ciclo. ${resumen}`, log, etiquetaDe(c));
  }
  // 2) La proyección supera el umbral
  else if (proy >= THRESHOLD) {
    const margin = restantes != null && avg > 0 ? `Para cerrar por debajo de ${THRESHOLD} tendrías que bajar a ${((THRESHOLD - consumo) / Math.max(1, restantes)).toFixed(1)} kWh/día.` : '';
    await alert(c.id, nic, 'proyeccion_supera_umbral', `proy>=${THRESHOLD}:${cycle}`, 'warning',
      `La proyección del mes va a superar los ${THRESHOLD} kWh. ${resumen} ${margin}`, log, etiquetaDe(c));
  }
  // 3) Aviso temprano (80%)
  else if (consumo >= THRESHOLD * WARN_RATIO) {
    await alert(c.id, nic, 'consumo_cerca_umbral', `consumo>=${Math.round(THRESHOLD * WARN_RATIO)}:${cycle}`, 'info',
      `Vas por ${Math.round((consumo / THRESHOLD) * 100)}% del límite de ${THRESHOLD} kWh. ${resumen}`, log, etiquetaDe(c));
  }

  // Resumen diario opcional (DAILY_SUMMARY=true): se manda todos los días, sin dedupe
  // En una sincronización pedida a mano no se le escribe a nadie: quien la
  // pidió ya está mirando el panel, y los demás chats de la cuenta no tienen
  // por qué recibir un resumen cada vez que alguien toca un botón.
  if (!silencioso && await settingBool('DAILY_SUMMARY')) {
    const pct = Math.round((consumo / THRESHOLD) * 100);
    const last = dias[dias.length - 1];
    // El portal publica con atraso: el "último día" es el jueves, no hoy. Se
    // dice cuál es y se comenta CÓMO fue, en vez de soltar el número pelado.
    const atrasoDias = diasDeAtraso(t.datosHasta ?? null);
    let cierre = '';
    if (!dias.length) {
      // Ciclo recién cerrado: el contador vuelve a cero y con el atraso de
      // publicación no hay días que enseñar. Decirlo evita el susto de
      // "¿me borraron los datos?".
      cierre = '\n🔄 <i>Tu ciclo acaba de cerrar: el contador arranca de nuevo con la factura y la distribuidora todavía no publica los primeros días. El ciclo pasado quedó guardado completo.</i>';
    }
    if (last) {
      const otros = dias.slice(0, -1);
      const base = otros.length ? otros.reduce((a, b) => a + b.kwh, 0) / otros.length : 0;
      const dif = base > 0 ? Math.round((last.kwh / base - 1) * 100) : 0;
      const juicio = !base ? ''
        : dif >= 25 ? ` — ${dif}% por encima de tu promedio, revisa qué estuvo prendido ese día`
        : dif <= -20 ? ` — ${Math.abs(dif)}% por debajo de tu promedio, así se ahorra`
        : ' — en línea con tu promedio';
      cierre = `\n<b>${fmtDate(last.day)}</b>, el último día publicado: ${last.kwh} kWh${juicio}.`;

      // Los picos son lo más accionable: son los días donde de verdad se fue
      // el dinero, y saberlos es lo que permite corregir a tiempo.
      if (base > 0) {
        const picos = dias.filter((d) => d.kwh >= base * SPIKE_RATIO && d.kwh >= 10).slice(-3);
        if (picos.length) {
          cierre += `\n\n🔺 <b>Días que se dispararon</b> (promedio ${base.toFixed(1)} kWh/día):`;
          for (const p of picos) {
            cierre += `\n• ${fmtDate(p.day)}: <b>${p.kwh} kWh</b> (+${Math.round((p.kwh / base - 1) * 100)}%)`;
          }
          cierre += '\n<i>Revisa qué estuvo encendido esos días: ahí es donde se va la factura.</i>';
        }
      }
      if (atrasoDias > 1) cierre += `\n\n<i>Los últimos ${atrasoDias} días todavía no los publica la distribuidora; es lo normal.</i>`;
    }
    // El mensaje llega solo todos los días: siempre dice cómo apagarlo, para
    // que nadie sienta que el bot le escribe sin permiso.
    const pie = '\n\n<i>Este resumen llega solo cada día. Se apaga o se cambia la hora en la página, en «Mi cuenta».</i>';
    const ok = await avisarContrato(c.id, `📊 <b>${etiquetaDe(c)} · NIC ${nic}</b>\n${resumen}\nVas por el ${pct}% del límite de ${THRESHOLD} kWh.${cierre}${pie}`);
    log.push(`resumen diario ${ok ? 'enviado' : 'NO enviado'}`);
    try {
      const { weeklyChart } = await import('./status');
      const wk = await weeklyChart(c.id);
      if (wk) await avisarFoto(c.id, wk.url, wk.caption);
    } catch (e: any) {
      log.push('gráfica del resumen no enviada: ' + e.message);
    }
  }

  // 4) Día alarmante: el último día con datos muy por encima del promedio
  if (dias.length >= 4) {
    const last = dias[dias.length - 1];
    const others = dias.slice(0, -1);
    const base = others.reduce((a, b) => a + b.kwh, 0) / others.length;
    if (last.kwh >= base * SPIKE_RATIO && last.kwh >= 10) {
      await alert(c.id, nic, 'pico_diario', `pico:${last.day}`, 'warning',
        `Consumo alarmante el ${fmtDate(last.day)}: <b>${last.kwh} kWh</b> (promedio del ciclo ${base.toFixed(1)} kWh/día, +${Math.round((last.kwh / base - 1) * 100)}%). ¿Aire acondicionado, calentador, algo quedó encendido?`, log, etiquetaDe(c));
    }
  }
}

/**
 * Libera espacio borrando SOLO el PDF de las facturas más viejas que la
 * ventana de retención. Los datos leídos (kWh, montos, tramos, análisis y el
 * texto extraído) se conservan siempre: son la base de todos los cálculos.
 */
async function purgeOldPdfs(log: string[]) {
  const PDF_RETENTION_MONTHS = await settingNumber('PDF_RETENTION_MONTHS');
  if (!(PDF_RETENTION_MONTHS > 0)) return;
  const db = sql();
  const purged = await db<{ id: string }[]>`
    UPDATE invoices SET pdf = NULL
    WHERE pdf IS NOT NULL AND parsed_ok
      AND fecha_emision < (CURRENT_DATE - ${`${PDF_RETENTION_MONTHS} months`}::interval)
    RETURNING id`;
  if (purged.length) log.push(`PDFs archivados (datos conservados): ${purged.length}`);
}

async function syncInvoices(client: PortalClient, c: Contrato, nic: string, dailyRows: { day: string; kwh: number }[], log: string[]) {
  const THRESHOLD = c.kwh_threshold || await getThreshold();
  const db = sql();
  let links: Awaited<ReturnType<typeof client.getHistorial>> = [];
  try {
    links = await client.getHistorial(nic);
  } catch (e: any) {
    log.push('historial no disponible: ' + e.message);
    return;
  }
  const existing = await db<{ id: string; parsed_ok: boolean; has_pdf: boolean }[]>`
    SELECT id, parsed_ok, (pdf IS NOT NULL) AS has_pdf FROM invoices WHERE nic = ${nic}`;
  const known = new Map(existing.map((r) => [r.id, r.parsed_ok && r.has_pdf]));

  // de la más vieja a la más nueva, para que "mes anterior" ya exista al analizar
  // (se reintentan también las que quedaron sin PDF guardado)
  const pending = links
    .filter((l) => !known.has(l.id) || known.get(l.id) === false)
    .sort((a, b) => (a.fechaEmision || '').localeCompare(b.fechaEmision || ''));

  // La función tiene 60 s. Bajar y leer PDFs es lo lento, así que se para
  // sola antes del límite: lo ya bajado queda guardado y el resto sigue en la
  // próxima corrida. Antes, quedarse sin tiempo mataba la corrida entera y no
  // se guardaba ninguna factura — el panel se quedaba sin pesos sin decir por qué.
  const limite = Date.now() + 40_000;
  let downloaded = 0;
  for (const link of pending) {
    if (Date.now() > limite) {
      log.push(`sin tiempo en esta corrida: quedan ${pending.length - downloaded} facturas por bajar, siguen en la próxima`);
      break;
    }
    if (downloaded >= 8) { log.push('quedan facturas por bajar; se continúa mañana'); break; } // límite por corrida
    try {
      const pdf = await client.getInvoicePdf(link.pdfUrl);
      downloaded++;
      let data = null as ReturnType<typeof parseInvoiceItems> | null;
      let parseError: string | null = null;
      let rawText = '';
      try {
        const items = await extractPdfItems(pdf);
        rawText = items.map((i) => i.s).join('\n');
        data = parseInvoiceItems(items);
        if (data.consumoKwh == null && data.facturadoRd == null) throw new Error('no se reconocieron los campos principales');
      } catch (e: any) {
        parseError = e.message;
      }

      const prev = data?.periodoInicio
        ? (await db<{ consumo_kwh: number | null; facturado_rd: number | null }[]>`
            SELECT consumo_kwh, facturado_rd FROM invoices
            WHERE nic = ${nic} AND parsed_ok AND fecha_emision < ${data.fechaEmision || link.fechaEmision}
            ORDER BY fecha_emision DESC LIMIT 1`)[0]
        : null;
      const prevFromHist = data && !prev && data.historico.length >= 2
        ? { consumoKwh: data.historico[data.historico.length - 2].kwh, facturadoRd: null }
        : null;
      const analysis = data ? explainInvoice(data, dailyRows, prev ? { consumoKwh: prev.consumo_kwh, facturadoRd: prev.facturado_rd } : prevFromHist) : null;

      await db`
        INSERT INTO invoices (contract_id, id, nic, numero_factura, fecha_emision, periodo_inicio, periodo_fin, dias_facturados,
          lectura_anterior, lectura_actual, consumo_kwh, cargo_fijo, precio_kwh, energia_rd, importe_sin_subsidio,
          subsidio_rd, facturado_rd, balance_pendiente, total_a_pagar, pague_antes_de, tarifa, tramos, parsed_ok, parse_error,
          pdf, raw_text, analysis)
        VALUES (${c.id}, ${link.id}, ${nic}, ${data?.numeroFactura ?? null}, ${data?.fechaEmision ?? link.fechaEmision}, ${data?.periodoInicio ?? null},
          ${data?.periodoFin ?? null}, ${data?.diasFacturados ?? null}, ${data?.lecturaAnterior ?? null}, ${data?.lecturaActual ?? null},
          ${data?.consumoKwh ?? null}, ${data?.cargoFijo ?? null}, ${data?.precioKwh ?? null}, ${data?.energiaRd ?? null},
          ${data?.importeSinSubsidio ?? null}, ${data?.subsidioRd ?? null}, ${data?.facturadoRd ?? null}, ${data?.balancePendiente ?? null},
          ${data?.totalAPagar ?? null}, ${data?.pagueAntesDe ?? null}, ${data?.tarifa ?? null}, ${data ? db.json(data.tramos) : null}, ${!parseError}, ${parseError},
          ${Buffer.from(pdf)}, ${rawText}, ${analysis})
        ON CONFLICT (id) DO UPDATE SET
          numero_factura = EXCLUDED.numero_factura, fecha_emision = EXCLUDED.fecha_emision, periodo_inicio = EXCLUDED.periodo_inicio,
          periodo_fin = EXCLUDED.periodo_fin, dias_facturados = EXCLUDED.dias_facturados, lectura_anterior = EXCLUDED.lectura_anterior,
          lectura_actual = EXCLUDED.lectura_actual, consumo_kwh = EXCLUDED.consumo_kwh, cargo_fijo = EXCLUDED.cargo_fijo,
          precio_kwh = EXCLUDED.precio_kwh, energia_rd = EXCLUDED.energia_rd, importe_sin_subsidio = EXCLUDED.importe_sin_subsidio,
          subsidio_rd = EXCLUDED.subsidio_rd, facturado_rd = EXCLUDED.facturado_rd, balance_pendiente = EXCLUDED.balance_pendiente,
          total_a_pagar = EXCLUDED.total_a_pagar, pague_antes_de = EXCLUDED.pague_antes_de, tarifa = EXCLUDED.tarifa, tramos = EXCLUDED.tramos,
          parsed_ok = EXCLUDED.parsed_ok, parse_error = EXCLUDED.parse_error, pdf = EXCLUDED.pdf, raw_text = EXCLUDED.raw_text,
          analysis = EXCLUDED.analysis`;

      // consumo mensual: la factura (fuente fuerte) + el histórico de 13 meses (fuente débil)
      if (data) {
        for (const h of data.historico) {
          await db`
            INSERT INTO monthly_consumption (contract_id, nic, month, kwh, source) VALUES (${c.id}, ${nic}, ${h.month}, ${h.kwh}, 'pdf_history')
            ON CONFLICT (nic, month) DO UPDATE SET kwh = EXCLUDED.kwh, updated_at = now() WHERE monthly_consumption.source <> 'invoice'`;
        }
        if (data.consumoKwh != null && data.periodoFin) {
          const month = data.periodoFin.slice(0, 7) + '-01';
          await db`
            INSERT INTO monthly_consumption (contract_id, nic, month, kwh, source) VALUES (${c.id}, ${nic}, ${month}, ${data.consumoKwh}, 'invoice')
            ON CONFLICT (nic, month) DO UPDATE SET kwh = EXCLUDED.kwh, source = 'invoice', updated_at = now()`;
        }
      }

      log.push(`factura ${link.id} (${fmtDate(data?.fechaEmision ?? link.fechaEmision)}): ${parseError ? 'PDF guardado, sin parsear: ' + parseError : `${data!.consumoKwh} kWh, ${fmtRD(data!.facturadoRd)}`}`);

      // notificar facturas nuevas (solo si la corrida no es la primera carga masiva)
      if (data && !known.has(link.id) && existing.length > 0) {
        const over = data.consumoKwh != null && data.consumoKwh >= THRESHOLD;
        await alert(c.id, nic, 'factura_nueva', `factura:${link.id}`, over ? 'critical' : 'info',
          `Nueva factura de ${monthLabel(data.periodoFin || data.fechaEmision || link.fechaEmision || '2000-01-01')}: <b>${data.consumoKwh ?? '?'} kWh</b>, ${fmtRD(data.facturadoRd)} (total a pagar ${fmtRD(data.totalAPagar)}), pague antes de <b>${fmtDate(data.pagueAntesDe)}</b>.\n\n${analysis}`, log);
      }
    } catch (e: any) {
      log.push(`factura ${link.id}: no disponible (${e.message})`);
    }
  }
  if (!pending.length) log.push(`facturas: ${links.length} en el historial, todas guardadas`);
}

/**
 * Baja y guarda los datos de UN contrato. Devuelve false si falló, sin tumbar
 * al resto de la corrida.
 */
async function procesarContrato(c: Contrato, log: string[], silencioso = false): Promise<boolean> {
  const db = sql();
  const etiqueta = c.nombre || `contrato ${c.id}`;
  // Cada contrato deja su propia corrida: en el panel, cada quien ve la suya.
  const propio: string[] = [];
  const apunta = (linea: string) => { log.push(linea); propio.push(linea); };
  const [run] = await db<{ id: number }[]>`
    INSERT INTO runs (contract_id) VALUES (${c.id}) RETURNING id`;
  const cerrar = (ok: boolean) => db`
    UPDATE runs SET finished_at = now(), ok = ${ok}, summary = ${propio.join('\n')} WHERE id = ${run.id}`;
  try {
    const client = new PortalClient(c.email!, c.password!, distribuidora(c.utility).base);
    await client.login();
    apunta(`[${etiqueta}] login OK`);
    await db`UPDATE contracts SET verificado_at = now(), verificado_ok = true, verificado_error = NULL WHERE id = ${c.id}`;

    const nics = c.nic?.trim() ? [c.nic.trim()] : await client.getContracts();
    if (!nics.length) throw new Error('no se encontraron contratos asociados');

    for (const nic of nics) {
      const { data } = await client.getTeleconsumo(nic);
      // Anota lo que veía el portal, para aprender su hora de publicación.
      await anotarSonda(c.id, data.datosHasta ?? null);
      await saveTeleconsumo(c.id, nic, data, propio);
      await evaluateAlerts(c, nic, data, propio, silencioso);
      const dailyRows = await db<{ day: string; kwh: number }[]>`
        SELECT to_char(day,'YYYY-MM-DD') AS day, kwh::float AS kwh
        FROM daily_consumption WHERE nic = ${nic} ORDER BY day`;
      await syncInvoices(client, c, nic, dailyRows, propio);
    }
    log.push(...propio.filter((l) => !log.includes(l)));
    await cerrar(true);
    return true;
  } catch (e: any) {
    const msg = e?.message || String(e);
    apunta(`[${etiqueta}] ERROR: ${msg}`);
    if (/login|contraseña|password/i.test(msg)) {
      await db`UPDATE contracts SET verificado_at = now(), verificado_ok = false, verificado_error = ${msg} WHERE id = ${c.id}`;
    }
    const hoy = new Date().toISOString().slice(0, 10);
    const { texto, nivel } = porQueFallo(msg);
    await alert(c.id, c.nic ?? '', 'error_corrida', `error:${c.id}:${hoy}`, nivel,
      texto, propio, etiquetaDe(c)).catch(() => {});
    await cerrar(false);
    return false;
  }
}

export interface RunResult { ok: boolean; log: string[]; error?: string }

/**
 * Sincronizar un solo contrato, a petición de su dueño. Es lo que corre
 * cuando alguien acaba de poner sus credenciales y no quiere esperar a
 * mañana para ver sus datos.
 */
export async function runContrato(cid: number, silencioso = true): Promise<RunResult> {
  const log: string[] = [];
  await ensureSchema();
  const db = sql();
  const [c] = await db<Contrato[]>`SELECT * FROM contracts WHERE id = ${cid}`;
  if (!c) return { ok: false, log, error: 'Esa cuenta ya no existe.' };
  if (!c.email || !c.password) {
    return { ok: false, log, error: 'Faltan el correo y la contraseña de tu oficina virtual.' };
  }
  const ok = await procesarContrato(c, log, silencioso);
  return ok ? { ok: true, log } : { ok: false, log, error: log[log.length - 1] ?? 'No se pudo leer tu cuenta.' };
}


/**
 * Corrida completa. El cron pasa la hora de República Dominicana y cada
 * contrato se procesa solo a la hora que su dueño eligió (resumen_hora), con
 * o sin resumen diario según lo tenga puesto. Sin hora (disparo manual), se
 * procesan todos.
 */
export async function runDaily(hora: number | null = null): Promise<RunResult> {
  const log: string[] = [];
  await ensureSchema();
  const db = sql();

  const todos = await contratosActivos();
  const contratos = hora == null ? todos : todos.filter((c) => (c.resumen_hora ?? 18) === hora);
  if (!contratos.length) {
    // A esta hora no le toca a nadie: no es un error ni deja corrida anotada.
    if (hora != null && todos.length) return { ok: true, log: [`ningún contrato programado a las ${hora}:00`] };
    const msg = 'No hay ningún contrato con credenciales. Configúralo en el panel.';
    return { ok: false, log: ['ERROR: ' + msg], error: msg };
  }

  const [run] = await db<{ id: number }[]>`INSERT INTO runs DEFAULT VALUES RETURNING id`;
  let fallos = 0;
  for (const c of contratos) {
    if (!(await procesarContrato(c, log, !c.resumen_diario))) fallos++;
  }

  await purgeOldPdfs(log);
  const ok = fallos < contratos.length;
  await db`UPDATE runs SET finished_at = now(), ok = ${ok}, summary = ${log.join('\n')} WHERE id = ${run.id}`;
  return ok ? { ok: true, log } : { ok: false, log, error: `Fallaron los ${fallos} contratos` };
}
