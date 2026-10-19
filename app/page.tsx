import { sql, ensureSchema } from '@/lib/db';
import { fmtRD, fmtDate, monthLabel, cuadraConLosDias } from '@/lib/analysis';
import { DailyChart, MonthlyChart, BudgetChart, type BudgetRow } from '@/components/Charts';
import { Chip } from '@/components/Ui';
import { TopBar } from '@/components/TopBar';
import { DayCards } from '@/components/DayCards';
import { MonthHistory } from '@/components/MonthHistory';
import { buildConsejo } from '@/lib/coach';
import { getMeta } from '@/lib/goal';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratoDeUsuario, contratosDeUsuario } from '@/lib/contracts';
import { CuentasSwitch } from '@/components/CuentasSwitch';
import { getPricing, estimateCost } from '@/lib/pricing';
import { desgloseDe, precioSiguienteKwh } from '@/lib/tarifa';
import { SideNav } from '@/components/SideNav';

export const dynamic = 'force-dynamic';

// El límite y demás ajustes se editan en /config (tabla settings).

async function loadData() {
  await ensureSchema();
  const db = sql();
  // cada quien ve el contrato que le toca (el suyo o el que le compartieron)
  const sesion = await leerCookie((await cookies()).get(COOKIE)?.value, process.env.DASHBOARD_PASSWORD || '');
  const cuentas = sesion ? await contratosDeUsuario(sesion.uid) : [];
  const esAdmin = !!sesion?.admin;
  const preferida = Number((await cookies()).get('cuenta')?.value) || null;
  const contrato = sesion ? await contratoDeUsuario(sesion.uid, preferida) : null;
  // Si hay sesión pero ninguna cuenta asociada, se filtra por una imposible:
  // dejarlo en null apagaría el filtro y mostraría los datos de otra persona.
  const cid = contrato?.id ?? (sesion ? -1 : null);
  const [snap] = await db<any[]>`
    SELECT nic, captured_at, to_char(fecha_ultima_factura,'YYYY-MM-DD') AS cycle_start, to_char(datos_hasta,'YYYY-MM-DD') AS datos_hasta,
           to_char(fecha_lectura,'YYYY-MM-DD') AS fecha_lectura, lectura_activa_kwh::float AS lectura, consumo_hasta_fecha_kwh AS consumo,
           proyeccion_kwh AS proyeccion, to_char(dia_mayor_consumo,'YYYY-MM-DD') AS dia_mayor, valor_mayor_kwh AS valor_mayor, titular, tarifa, medidor
    FROM teleconsumo_snapshots
    WHERE (${cid}::bigint IS NULL OR contract_id = ${cid})
      -- una lectura a medias del portal no puede mandar sobre las buenas
      AND fecha_ultima_factura IS NOT NULL AND datos_hasta IS NOT NULL
    ORDER BY captured_at DESC LIMIT 1`;
  const nic = snap?.nic;
  const daily = nic && snap.cycle_start
    ? await db<{ day: string; kwh: number }[]>`
        SELECT to_char(day,'YYYY-MM-DD') AS day, kwh::float AS kwh FROM daily_consumption
        WHERE nic = ${nic} AND day >= ${snap.cycle_start} ORDER BY day`
    : [];
  // La última factura leída: sirve para explicar el arranque de un ciclo
  // nuevo (el "en cero" que asusta) enseñando que el ciclo pasado quedó guardado.
  const [ultimaFactura] = nic
    ? await db<any[]>`
        SELECT to_char(periodo_inicio,'YYYY-MM-DD') AS inicio, to_char(periodo_fin,'YYYY-MM-DD') AS fin,
               consumo_kwh, facturado_rd::float AS rd
        FROM invoices WHERE nic = ${nic} AND parsed_ok ORDER BY fecha_emision DESC LIMIT 1`
    : [];
  const monthly = nic
    ? await db<any[]>`
        SELECT to_char(m.month,'YYYY-MM-DD') AS month, m.kwh, m.source, i.facturado_rd::float AS rd
        FROM monthly_consumption m
        LEFT JOIN invoices i ON i.nic = m.nic AND i.parsed_ok AND date_trunc('month', i.periodo_fin) = m.month
        WHERE m.nic = ${nic} ORDER BY m.month DESC LIMIT 24`
    : [];
  const allDaily = nic
    ? await db<{ day: string; kwh: number }[]>`
        SELECT to_char(day,'YYYY-MM-DD') AS day, kwh::float AS kwh FROM daily_consumption
        WHERE nic = ${nic} ORDER BY day`
    : [];
  const invoices = await db<any[]>`
    SELECT id, to_char(fecha_emision,'YYYY-MM-DD') AS fecha_emision, to_char(periodo_inicio,'YYYY-MM-DD') AS periodo_inicio,
           to_char(periodo_fin,'YYYY-MM-DD') AS periodo_fin, dias_facturados, consumo_kwh, facturado_rd::float AS facturado_rd,
           subsidio_rd::float AS subsidio_rd, total_a_pagar::float AS total_a_pagar, to_char(pague_antes_de,'YYYY-MM-DD') AS pague_antes_de,
           precio_kwh::float AS precio_kwh, parsed_ok, parse_error, analysis, (pdf IS NOT NULL) AS has_pdf
    FROM invoices WHERE (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY fecha_emision DESC NULLS LAST, id DESC LIMIT 36`;
  const alerts = await db<any[]>`SELECT id, rule, level, message, sent, created_at FROM alerts
    WHERE NOT dismissed AND (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY created_at DESC LIMIT 12`;
  // La última corrida es la de SU cuenta: no la de otra persona.
  const [lastRun] = await db<any[]>`
    SELECT started_at, finished_at, ok, summary, error FROM runs
    WHERE (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY id DESC LIMIT 1`;
  const pricing = await getPricing(cid);
  const metaGlobal = await getMeta(cid);
  const meta = contrato
    ? {
        ...metaGlobal,
        modo: contrato.goal_mode === 'kwh' ? ('kwh' as const) : ('dinero' as const),
        kwh: contrato.goal_mode === 'dinero' && contrato.budget_rd && metaGlobal.precioKwh
          ? Math.round(Number(contrato.budget_rd) / metaGlobal.precioKwh)
          : contrato.kwh_threshold,
        rd: contrato.goal_mode === 'dinero' ? Number(contrato.budget_rd) || null : metaGlobal.rd,
      }
    : metaGlobal;
  const THRESHOLD = meta.kwh;
  return { THRESHOLD, meta, contrato, cuentas, esAdmin, snap, daily, allDaily, monthly: monthly.reverse(), invoices, alerts, lastRun, pricing, ultimaFactura };
}

function stripHtml(s: string) { return s.replace(/<[^>]+>/g, ''); }

export default async function Page() {
  let data: Awaited<ReturnType<typeof loadData>> | null = null;
  let dbError: string | null = null;
  try { data = await loadData(); } catch (e: any) { dbError = e.message; }

  if (dbError) {
    return (
      <main>
        <header className="top"><h1>Monitor de Luz</h1></header>
        <section className="card"><h2>No se pudo conectar a la base de datos</h2><pre className="log">{dbError}</pre>
          <p className="desc">Revisa la variable <code>DATABASE_URL</code> en Vercel (Storage → Neon) y vuelve a desplegar.</p></section>
      </main>
    );
  }

  // Cuenta recién creada y todavía sin credenciales: primero los pasos.
  const c = data!.contrato;
  // Solo manda al asistente de bienvenida cuando es la ÚNICA cuenta: una
  // "cuenta nueva" agregada desde el selector se llena en Mi cuenta.
  if (c && !c.email && !c.password && data!.cuentas.length <= 1) redirect(c.owner_id === null ? '/bienvenida' : '/empezar');

  const { THRESHOLD, meta, contrato, cuentas, esAdmin, snap, daily, allDaily, monthly, invoices, alerts, lastRun, pricing, ultimaFactura } = data!;
  // Si el portal reportó 0 pero los días guardados del ciclo suman más, se
  // cree en lo guardado; y si reportó MUCHO más de lo que suman los días
  // (cuentas telemedidas: el lector agarraba la lectura del medidor), el
  // número del portal no es creíble y mandan los días.
  const sumaDias = Math.round(daily.reduce((a, b) => a + b.kwh, 0));
  const portalCreible = cuadraConLosDias(snap?.consumo, daily);
  const consumo = portalCreible ? Math.max(snap?.consumo ?? 0, sumaDias) : sumaDias;
  const proyPortal = portalCreible ? (snap?.proyeccion ?? 0) : 0;
  const pct = Math.min(100, Math.round((consumo / THRESHOLD) * 100));
  const dias = daily.filter((d) => d.kwh > 0);
  // Para explicar por qué no hay pesos: ¿hay facturas?, ¿se pudieron leer?
  const facturasOk = invoices.filter((i: any) => i.parsed_ok).length;
  const primerError = invoices.find((i: any) => !i.parsed_ok && i.parse_error)?.parse_error ?? null;
  const avg = dias.length ? dias.reduce((a, b) => a + b.kwh, 0) / dias.length : 0;
  // Sin proyección del portal pero con días guardados: se proyecta con el
  // promedio real, en vez de enseñar un 0 que no es verdad.
  const proy = proyPortal > 0 ? proyPortal : dias.length ? Math.round(avg * 31) : 0;
  const level = consumo >= THRESHOLD ? 'crit' : proy >= THRESHOLD ? 'warn' : 'good';
  const diasTranscurridos = snap?.cycle_start && snap?.datos_hasta ? Math.round((Date.parse(snap.datos_hasta) - Date.parse(snap.cycle_start)) / 86400000) : 0;
  // Los últimos días del ciclo que cerró, para no dejar el panel vacío
  // mientras la distribuidora publica los primeros días del ciclo nuevo.
  const cicloPasado = daily.length || !snap?.cycle_start
    ? []
    : allDaily.filter((d) => d.day < snap.cycle_start).slice(-31);
  const avgPasado = cicloPasado.length ? cicloPasado.reduce((a, b) => a + b.kwh, 0) / cicloPasado.length : 0;
  const restantes = Math.max(0, 31 - diasTranscurridos);
  const permitido = restantes > 0 ? Math.max(0, (THRESHOLD - consumo) / restantes) : 0;

  // Camino del ciclo: acumulado real, ritmo ideal y proyección hasta el cierre.
  const CYCLE_LEN = 31;
  const budget: BudgetRow[] = [];
  if (snap?.cycle_start) {
    const kwhByDay = new Map(daily.map((d) => [d.day, d.kwh]));
    const start = Date.parse(snap.cycle_start + 'T00:00:00Z');
    let acum = 0;
    let lastIdx = -1;
    for (let i = 0; i < CYCLE_LEN; i++) {
      const iso = new Date(start + i * 86400000).toISOString().slice(0, 10);
      const kwh = kwhByDay.get(iso);
      const hasData = kwh != null && (!snap.datos_hasta || iso <= snap.datos_hasta);
      if (hasData) { acum += kwh!; lastIdx = i; }
      budget.push({ day: iso, acum: hasData ? Math.round(acum * 10) / 10 : null, plan: (THRESHOLD * (i + 1)) / CYCLE_LEN, proy: null });
    }
    if (lastIdx >= 0 && proy > 0) {
      const lastAcum = budget[lastIdx].acum!;
      for (let i = lastIdx; i < CYCLE_LEN; i++) {
        budget[i].proy = lastIdx === CYCLE_LEN - 1 ? lastAcum : lastAcum + ((proy - lastAcum) * (i - lastIdx)) / (CYCLE_LEN - 1 - lastIdx);
      }
    }
  }

  // Días de alto consumo del ciclo (>= 1.2x el promedio), de mayor a menor.
  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const altos = dias
    .filter((d) => avg > 0 && d.kwh >= avg * 1.2)
    .sort((a, b) => b.kwh - a.kwh)
    .slice(0, 7)
    .map((d) => ({ ...d, dow: DIAS_SEMANA[new Date(d.day + 'T00:00:00Z').getUTCDay()], pct: Math.round(((d.kwh - avg) / avg) * 100) }));

  // Historial: cada mes con los días que ya se guardaron de ese mes
  const diasPorMes = new Map<string, { day: string; kwh: number }[]>();
  for (const d of allDaily) {
    const k = d.day.slice(0, 7);
    if (!diasPorMes.has(k)) diasPorMes.set(k, []);
    diasPorMes.get(k)!.push(d);
  }
  const historial = [...monthly].reverse().map((m: any) => ({
    month: m.month,
    kwh: m.kwh,
    source: m.source,
    rd: m.rd,
    dias: diasPorMes.get(m.month.slice(0, 7)) ?? [],
  }));
  // El ciclo en curso (los días desde la última factura) también se puede
  // revisar día por día, arriba del todo. Va por FECHAS DE FACTURA, no por
  // mes calendario: la unidad de esta app es el ciclo, no "del 1 al 30".
  if (snap?.cycle_start && daily.length) {
    historial.unshift({
      month: snap.cycle_start,
      titulo: `Ciclo en curso · ${fmtDate(snap.cycle_start)} → ${fmtDate(daily[daily.length - 1].day)}`,
      kwh: Math.round(daily.reduce((a, b) => a + b.kwh, 0)),
      source: 'ciclo',
      rd: null,
      dias: daily,
    } as any);
  }

  // Cierre estimado del ciclo: lo que duran tus ciclos según tus facturas.
  // La distribuidora corta y tarda días en emitir la factura; sin esto, el
  // monitor seguía "corriendo" como si el ciclo no hubiera cortado.
  const duraciones = invoices
    .filter((i: any) => i.parsed_ok && i.dias_facturados > 0)
    .map((i: any) => Number(i.dias_facturados))
    .slice(0, 6)
    .sort((a: number, b: number) => a - b);
  const duracionCiclo = duraciones.length ? duraciones[Math.floor(duraciones.length / 2)] : 30;
  const cierreEstimado = snap?.cycle_start
    ? new Date(Date.parse(snap.cycle_start + 'T00:00:00Z') + duracionCiclo * 86400000).toISOString().slice(0, 10)
    : null;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const cicloVencido = !!cierreEstimado && hoyISO >= cierreEstimado && daily.length > 1;

  // ---- Datos del bloque principal ----
  const ultimoDia = dias[dias.length - 1] ?? null;
  const penultimo = dias[dias.length - 2] ?? null;
  const vsAnterior = ultimoDia && penultimo && penultimo.kwh > 0
    ? `${ultimoDia.kwh >= penultimo.kwh ? '+' : ''}${Math.round((ultimoDia.kwh / penultimo.kwh - 1) * 100)}%` : '—';
  const topeDia = permitido > 0 ? permitido : THRESHOLD / 30;
  const precioProximo = pricing ? (pricing.tarifa ? precioSiguienteKwh(consumo, pricing.tarifa) : pricing.precioKwh) : null;
  const costoUltimo = ultimoDia && precioProximo != null ? ultimoDia.kwh * precioProximo : null;
  const arco = ultimoDia ? Math.min(1, ultimoDia.kwh / topeDia) * 270 : 0;
  const colorMedidor = ultimoDia && ultimoDia.kwh > topeDia ? 'var(--warning)' : 'var(--series-1)';
  const picoCiclo = dias.length ? dias.reduce((a, b) => (b.kwh > a.kwh ? b : a)) : null;
  const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const ult7 = dias.slice(-7);
  const maxSemana = Math.max(1, ...ult7.map((d) => d.kwh));
  const semana = ult7.map((d, i) => ({
    ...d,
    alto: Math.max(6, Math.round((d.kwh / maxSemana) * 130)),
    etiqueta: DIA_CORTO[new Date(d.day + 'T00:00:00Z').getUTCDay()],
    clase: avg > 0 && d.kwh >= avg * 1.2 ? 'pico' : i === ult7.length - 1 ? 'ultimo' : '',
  }));
  const horaRD = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santo_Domingo', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const saludo = horaRD < 12 ? 'Buenos días' : horaRD < 19 ? 'Buenas tardes' : 'Buenas noches';
  const hoyLargo = new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'long', day: 'numeric', month: 'long' });

  const consejo = snap ? buildConsejo({ threshold: THRESHOLD, metaRd: meta.rd, consumo, proy, avg, permitido, restantes, dias, pricing }) : null;

  return (
    <div className="shell">
      <SideNav actual="panel" admin={esAdmin} />
    <main>
      <header className="top">
        <div className="saludo">
          <small>{hoyLargo.charAt(0).toUpperCase() + hoyLargo.slice(1)}{contrato?.nombre ? ` · ${contrato.nombre}` : ''}{snap?.nic ? ` · NIC ${snap.nic}` : ''}</small>
          <h1>{saludo}</h1>
        </div>
        <TopBar
          admin={esAdmin}
          status={lastRun ? {
            ok: !!lastRun.ok,
            when: new Date(lastRun.started_at).toLocaleString('es-DO', {
              timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            }),
          } : null}
        />
      </header>

      <CuentasSwitch cuentas={cuentas} activa={contrato?.id ?? null} volver="/" />

      {!snap ? (
        <section className="card">
          <div className="empty">
            <b>Todavía no hemos leído tu cuenta.</b>
            <p>Entra a <b>Mi cuenta</b>, comprueba tu acceso a la oficina virtual y dale a
              <b> Sincronizar ahora</b>. A partir de ahí se actualiza solo cada día.</p>
            <a className="wz-next" href="/mi-cuenta">Ir a mi cuenta</a>
          </div>
        </section>
      ) : (
        <>
          {/* Ciclo recién arrancado: el portal reinicia el contador con cada
              factura y publica con ~2 días de atraso, así que los primeros
              días el panel se ve "en cero". No se borró nada — hay que decirlo. */}
          {daily.length <= 1 && (
            <section className="card">
              <div className="meta-now">
                🔄 <b>Tu ciclo acaba de cerrar{snap.cycle_start ? ` el ${fmtDate(snap.cycle_start)}` : ''}.</b>{' '}
                El contador arranca de nuevo con cada factura, y la distribuidora publica los días
                con ~2 días de atraso: por eso todavía se ve poco o nada. No se borró ningún dato
                {ultimaFactura?.consumo_kwh
                  ? <> — el ciclo pasado ({fmtDate(ultimaFactura.inicio)} → {fmtDate(ultimaFactura.fin)}) cerró con <b>{ultimaFactura.consumo_kwh} kWh</b>{ultimaFactura.rd ? <> por <b>{fmtRD(ultimaFactura.rd)}</b></> : null} y quedó guardado en tus facturas y en el historial por mes</>
                  : ' — todo el historial sigue guardado abajo, en los meses y las facturas'}.
              </div>
            </section>
          )}

          {cicloVencido && (
            <section className="card">
              <div className="meta-now">
                ⏳ <b>Tu ciclo debió cortar alrededor del {fmtDate(cierreEstimado)}</b> (tus últimos
                ciclos duraron ~{duracionCiclo} días). La distribuidora todavía no publica la factura
                nueva — suele tardar unos días en emitirla. En cuanto salga, el monitor la baja solo,
                te llega la alerta con el análisis y el contador arranca el ciclo nuevo. Los días de
                más que se sigan registrando quedan guardados igual.
              </div>
            </section>
          )}

          {/* Franja de estado: una línea con la palabra clave en color; el
              consejo completo queda a un toque, sin ocupar media pantalla. */}
          {consejo && (
            <div className="estado" role="status">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></svg>
              <div>
                <span>Tu consumo va <strong className={proy >= THRESHOLD ? 'alerta' : 'ok'}>{proy >= THRESHOLD ? 'camino a pasar la meta' : 'dentro de la meta'}</strong>. </span>
                <span dangerouslySetInnerHTML={{ __html: consejo.mensaje }} />
                {consejo.acciones.length > 0 && (
                  <details>
                    <summary>Qué hacer</summary>
                    <ul>{consejo.acciones.map((a, i) => <li key={i} dangerouslySetInnerHTML={{ __html: a }} />)}</ul>
                  </details>
                )}
              </div>
            </div>
          )}

          <div className="v-fila">
            {/* Medidor del último día publicado (la distribuidora va ~2 días atrás). */}
            <article className="v-card" style={{ flex: '1 1 320px', alignItems: 'center' }}>
              <div className="v-head" style={{ alignSelf: 'stretch' }}>
                <div>
                  <h2>Último día publicado</h2>
                  <span className="v-sub">{ultimoDia ? fmtDate(ultimoDia.day) : 'Aún sin días'}</span>
                </div>
                {ultimoDia && costoUltimo != null && <span className={`v-pill ${ultimoDia.kwh > topeDia ? 'alerta' : ''}`}>≈ {fmtRD(costoUltimo)}</span>}
              </div>
              <div className="medidor" role="img"
                aria-label={ultimoDia ? `${ultimoDia.kwh} de ${topeDia.toFixed(1)} kWh diarios` : 'Sin datos'}
                style={{ background: `conic-gradient(from 225deg, ${colorMedidor} 0deg ${arco}deg, var(--track) ${arco}deg 270deg, transparent 270deg 360deg)` }}>
                <div className="medidor-in">
                  <span>Consumo del día</span>
                  <b>{ultimoDia ? ultimoDia.kwh.toFixed(1) : '—'}</b>
                  <span>de {topeDia.toFixed(1)} kWh diarios</span>
                </div>
              </div>
              <div className="v-tiles">
                <div className="v-tile"><span>Vs. día anterior</span><b>{vsAnterior}</b></div>
                <div className="v-tile"><span>Promedio</span><b>{avg.toFixed(1)} kWh</b></div>
                <div className="v-tile"><span>Día más alto</span><b>{picoCiclo ? `${picoCiclo.kwh} kWh` : '—'}</b></div>
              </div>
            </article>

            <div className="v-col" style={{ flex: '1.4 1 420px' }}>
              {/* Lo que la página oficial no da: la factura en pesos. */}
              <article className="v-card v-factura">
                <div className="v-factura-monto">
                  <span>Factura estimada al cierre{cierreEstimado ? ` · ~${fmtDate(cierreEstimado)}` : ''}{pricing?.tarifa?.estimada ? ' · aproximada' : ''}</span>
                  <b>{pricing && dias.length ? fmtRD(estimateCost(proy, pricing)) : '—'}</b>
                  {pricing && <small>Llevas {fmtRD(estimateCost(consumo, pricing))} este ciclo{meta.rd ? ` · meta ${fmtRD(meta.rd)}` : ''}</small>}
                </div>
                <nav className="v-accesos" aria-label="Accesos">
                  <a href="#facturas"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6" /><path d="M9 12h6" /></svg></i>Facturas</a>
                  <a href="/mi-cuenta"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></svg></i>Meta</a>
                  <a href="#historial"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><path d="M12 8v4l3 2" /></svg></i>Historial</a>
                </nav>
                {/* De dónde sale el monto: las mismas líneas de la factura, discretas. */}
                {pricing?.tarifa && dias.length > 0 && (
                  <dl className="v-desglose" aria-label="Desglose de lo que llevas">
                    {desgloseDe(consumo, pricing.tarifa).map((l) => (
                      <div key={l.etiqueta}><dt>{l.etiqueta}</dt><dd>{fmtRD(l.importe)}</dd></div>
                    ))}
                  </dl>
                )}
              </article>

              <article className="v-card">
                <div className="v-head">
                  <div>
                    <h2>Meta del ciclo</h2>
                    <span className="v-sub">Día {diasTranscurridos} de ~{duracionCiclo} · {consumo} de {THRESHOLD} kWh</span>
                  </div>
                  <span className="v-big">{pct}%</span>
                </div>
                <div className={`v-barra ${consumo >= THRESHOLD ? 'alerta' : ''}`} role="img" aria-label={`${pct}% de la meta usada`}>
                  <div style={{ width: `${Math.max(pct, 0)}%` }}>{pct >= 28 ? (consumo >= THRESHOLD ? `Pasaste por ${consumo - THRESHOLD} kWh` : `Quedan ${THRESHOLD - consumo} kWh`) : ''}</div>
                </div>
                {pct < 28 && <span className="v-barra-txt">Quedan {THRESHOLD - consumo} kWh</span>}
                <div className="v-tiles">
                  <div className="v-tile"><span>Proyección</span><b style={{ color: proy >= THRESHOLD ? 'var(--critical)' : undefined }}>{proy} kWh</b></div>
                  <div className="v-tile"><span>Tope diario</span><b>{permitido.toFixed(1)} kWh</b></div>
                  <div className="v-tile"><span>Próximo kWh</span><b>{precioProximo != null ? fmtRD(precioProximo) : '—'}</b></div>
                </div>
              </article>
            </div>
          </div>

          <div className="v-fila">
            <article className="v-card" style={{ flex: '2 1 460px' }}>
              <div className="v-head" style={{ alignItems: 'center' }}>
                <h2>Últimos 7 días publicados</h2>
                <a className="v-link" href="#historial">Ver historial
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                </a>
              </div>
              {semana.length ? (
                <figure className="v-semana" role="img" aria-label="Consumo diario de los últimos días publicados">
                  {semana.map((d) => (
                    <div key={d.day}>
                      <b>{d.kwh.toFixed(1)}</b>
                      <i className={d.clase} style={{ height: `${d.alto}px` }} />
                      <span>{d.etiqueta}</span>
                    </div>
                  ))}
                </figure>
              ) : <div className="empty">Todavía no hay días publicados en este ciclo.</div>}
            </article>

            <article className="v-card" style={{ flex: '1 1 280px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2>Próxima factura</h2>
                <div className="v-tiles dos">
                  <div className="v-tile"><span>Corte estimado</span><b>{cierreEstimado ? fmtDate(cierreEstimado) : '—'}</b></div>
                  <div className="v-tile"><span>Faltan</span><b>~{restantes} días</b></div>
                </div>
                <span className="v-sub" style={{ lineHeight: 1.45 }}>Monto estimado según tu proyección del ciclo. La distribuidora emite la factura unos días después del corte.</span>
              </div>
              <a className="wz-next" href="#facturas">Ver facturas anteriores</a>
            </article>
          </div>

          <section className="card">
            <h2><Chip icon="home" tone="blue" /> Camino a los {THRESHOLD} kWh</h2>
            <p className="desc">Si tu línea va por encima de la punteada gris, vas muy rápido.</p>
            <BudgetChart data={budget} threshold={THRESHOLD} />
          </section>

          {daily.length > 0 ? (
            <section className="card">
              <h2><Chip icon="bolt" tone="blue" /> Consumo diario del ciclo actual</h2>
              <p className="desc">Amarillo: día alto. Rojo: día pico.</p>
              <DailyChart data={daily} avg={avg} permitido={permitido} />
              {altos.length > 0 && (
                <>
                  <h3>Días que dispararon el consumo</h3>
                  <DayCards dias={altos} avg={avg} precioKwh={pricing?.precioKwh ?? null} />
                </>
              )}
            </section>
          ) : cicloPasado.length > 0 && (
            /* El ciclo nuevo todavía no tiene días publicados: en vez de una
               gráfica vacía, se enseñan los días guardados del ciclo pasado. */
            <section className="card">
              <h2><Chip icon="bolt" tone="blue" /> Consumo diario · ciclo pasado</h2>
              <p className="desc">
                Los últimos días guardados, del ciclo que cerró{snap?.cycle_start ? ` el ${fmtDate(snap.cycle_start)}` : ''}.
                Cuando la distribuidora publique los días nuevos, esta gráfica pasa al ciclo actual.
              </p>
              <DailyChart data={cicloPasado} avg={avgPasado} permitido={0} />
            </section>
          )}
        </>
      )}

      <section className="card" id="historial">
        <h2><Chip icon="calendar" tone="blue" /> Tu historial mes a mes</h2>
        <p className="desc">Sólido: facturas leídas. Claro: histórico de la factura.</p>
        {monthly.length > 0 && (() => {
          const kwhs = monthly.map((m: any) => m.kwh);
          const prom = kwhs.reduce((a: number, b: number) => a + b, 0) / kwhs.length;
          const peor = monthly.reduce((a: any, b: any) => (b.kwh > a.kwh ? b : a));
          const pasados = kwhs.filter((k: number) => k >= THRESHOLD).length;
          return (
            <div className="mstats">
              <div><span className="ms-v">{Math.round(prom)}<small> kWh</small></span><span className="ms-l">Promedio mensual</span></div>
              <div><span className="ms-v">{peor.kwh}<small> kWh</small></span><span className="ms-l">Mes más alto · {monthLabel(peor.month)}</span></div>
              <div><span className={`ms-v ${pasados ? 'bad' : 'good'}`}>{pasados}<small> de {kwhs.length}</small></span><span className="ms-l">Meses sobre {THRESHOLD}</span></div>
            </div>
          );
        })()}
        <MonthlyChart data={monthly} threshold={THRESHOLD} />
        <h3>Mes a mes · toca uno para ver el detalle diario</h3>
        <MonthHistory meses={historial} threshold={THRESHOLD} precioKwh={pricing?.precioKwh ?? null} />
      </section>

      <section className="card" id="facturas">
        <h2><Chip icon="bill" tone="green" /> Facturas</h2>
        <p className="desc">Toca «¿Por qué este mes?» para ver el análisis.</p>
        {!invoices.length ? <div className="empty">Sin facturas todavía.</div> : (
          <div className="scroll">
            <table className="list">
              <thead><tr><th>Mes</th><th>Período</th><th className="num">kWh</th><th className="num">RD$/kWh</th><th className="num">Facturado</th><th className="num">Total a pagar</th><th>Vence</th><th>PDF</th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mes" data-l="Mes">
                      {inv.periodo_fin ? monthLabel(inv.periodo_fin) : fmtDate(inv.fecha_emision)}
                      {inv.consumo_kwh >= THRESHOLD && <> <span className="badge crit">+{THRESHOLD}</span></>}
                      {!inv.parsed_ok && <> <span className="badge warn">sin leer</span></>}
                      {inv.analysis && <details><summary>¿Por qué este mes?</summary><p>{inv.analysis}</p></details>}
                    </td>
                    <td data-l="Período">{inv.periodo_inicio ? `${fmtDate(inv.periodo_inicio)} – ${fmtDate(inv.periodo_fin)} (${inv.dias_facturados} d)` : '—'}</td>
                    <td className="num" data-l="Consumo">{inv.consumo_kwh ?? '—'} kWh</td>
                    <td className="num" data-l="RD$/kWh">{inv.precio_kwh?.toFixed(2) ?? '—'}</td>
                    <td className="num" data-l="Facturado">{fmtRD(inv.facturado_rd)}</td>
                    <td className="num strong" data-l="Total a pagar">{fmtRD(inv.total_a_pagar)}</td>
                    <td data-l="Vence">{fmtDate(inv.pague_antes_de)}</td>
                    <td data-l="PDF">{inv.has_pdf ? <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">Ver factura</a> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2><Chip icon="bell" tone="orange" /> Alertas</h2>
          {alerts.length > 0 && (
            <form method="post" action="/api/alerts">
              <input type="hidden" name="id" value="todas" />
              <button className="link-btn" type="submit">Ocultar todas</button>
            </form>
          )}
        </div>
        <p className="desc">Enviadas por Telegram.</p>
        {!alerts.length ? <div className="empty">Sin alertas.</div> : (
          <div className="alert-list">
            {alerts.map((a, i) => {
              const tone = a.level === 'critical' ? 'crit' : a.level === 'warning' ? 'warn' : 'info';
              const titulo = a.rule === 'consumo_supera_umbral' ? `Pasaste los ${THRESHOLD} kWh`
                : a.rule === 'proyeccion_supera_umbral' ? 'La proyección supera el límite'
                : a.rule === 'consumo_cerca_umbral' ? 'Cerca del límite'
                : a.rule === 'pico_diario' ? 'Día de consumo alarmante'
                : a.rule;
              return (
                <div key={i} className={`alert-item ${tone}`}>
                  <span className="ai-icon">{tone === 'crit' ? '🚨' : tone === 'warn' ? '⚠️' : 'ℹ️'}</span>
                  <form method="post" action="/api/alerts" className="ai-close">
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" aria-label="Ocultar esta alerta" title="Ocultar">
                      <svg viewBox="0 0 24 24" aria-hidden><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                    </button>
                  </form>
                  <div className="ai-body">
                    <div className="ai-title">{titulo}</div>
                    <div className="ai-text">{stripHtml(a.message)}</div>
                    <div className="ai-meta">
                      {new Date(a.created_at).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'short' })}
                      {!a.sent && ' · no se pudo enviar'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {snap && (
        <details className="card fold">
          <summary>Datos del contrato</summary>
          <dl className="kv">
            <div><dt>NIC</dt><dd>{snap.nic}</dd></div>
            {snap.titular && <div><dt>Titular</dt><dd>{snap.titular}</dd></div>}
            {snap.tarifa && <div><dt>Tarifa</dt><dd>{snap.tarifa}</dd></div>}
            {snap.medidor && <div><dt>Medidor</dt><dd>{snap.medidor}</dd></div>}
            <div><dt>Lectura activa</dt><dd>{snap.lectura?.toLocaleString('es-DO')} kWh · {fmtDate(snap.fecha_lectura)}</dd></div>
            <div><dt>Ciclo actual</dt><dd>{fmtDate(snap.cycle_start)} → {fmtDate(snap.datos_hasta)}{cierreEstimado ? ` · corta ~${fmtDate(cierreEstimado)}` : ''}</dd></div>
          </dl>
        </details>
      )}

      {lastRun && (
        <details className="card fold">
          <summary>
            Última corrida · {new Date(lastRun.started_at).toLocaleString('es-DO', {
              timeZone: 'America/Santo_Domingo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </summary>
          <pre className="log">{lastRun.summary || lastRun.error || '—'}</pre>
        </details>
      )}
    </main>
    </div>
  );
}
