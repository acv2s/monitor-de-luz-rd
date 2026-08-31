import { sql, ensureSchema } from '@/lib/db';
import { fmtRD, fmtDate, monthLabel } from '@/lib/analysis';
import { DailyChart, MonthlyChart, BudgetChart, type BudgetRow } from '@/components/Charts';
import { Gauge, Chip, House } from '@/components/Ui';
import { TopBar } from '@/components/TopBar';
import { DayCards } from '@/components/DayCards';
import { MonthHistory } from '@/components/MonthHistory';
import { InfoDot } from '@/components/InfoDot';
import { buildConsejo } from '@/lib/coach';
import { getMeta } from '@/lib/goal';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratoDeUsuario } from '@/lib/contracts';
import { getPricing, estimateCost } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

// El límite y demás ajustes se editan en /config (tabla settings).

async function loadData() {
  await ensureSchema();
  const db = sql();
  // cada quien ve el contrato que le toca (el suyo o el que le compartieron)
  const sesion = await leerCookie((await cookies()).get(COOKIE)?.value, process.env.DASHBOARD_PASSWORD || '');
  const contrato = sesion ? await contratoDeUsuario(sesion.uid) : null;
  // Si hay sesión pero ninguna cuenta asociada, se filtra por una imposible:
  // dejarlo en null apagaría el filtro y mostraría los datos de otra persona.
  const cid = contrato?.id ?? (sesion ? -1 : null);
  const [snap] = await db<any[]>`
    SELECT nic, captured_at, to_char(fecha_ultima_factura,'YYYY-MM-DD') AS cycle_start, to_char(datos_hasta,'YYYY-MM-DD') AS datos_hasta,
           to_char(fecha_lectura,'YYYY-MM-DD') AS fecha_lectura, lectura_activa_kwh::float AS lectura, consumo_hasta_fecha_kwh AS consumo,
           proyeccion_kwh AS proyeccion, to_char(dia_mayor_consumo,'YYYY-MM-DD') AS dia_mayor, valor_mayor_kwh AS valor_mayor, titular, tarifa, medidor
    FROM teleconsumo_snapshots WHERE (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY captured_at DESC LIMIT 1`;
  const nic = snap?.nic;
  const daily = nic && snap.cycle_start
    ? await db<{ day: string; kwh: number }[]>`
        SELECT to_char(day,'YYYY-MM-DD') AS day, kwh::float AS kwh FROM daily_consumption
        WHERE nic = ${nic} AND day >= ${snap.cycle_start} ORDER BY day`
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
  return { THRESHOLD, meta, contrato, snap, daily, allDaily, monthly: monthly.reverse(), invoices, alerts, lastRun, pricing };
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
  if (c && !c.email && !c.password) redirect(c.owner_id === null ? '/bienvenida' : '/empezar');

  const { THRESHOLD, meta, contrato, snap, daily, allDaily, monthly, invoices, alerts, lastRun, pricing } = data!;
  const consumo = snap?.consumo ?? 0;
  const proy = snap?.proyeccion ?? 0;
  const pct = Math.min(100, Math.round((consumo / THRESHOLD) * 100));
  const level = consumo >= THRESHOLD ? 'crit' : proy >= THRESHOLD ? 'warn' : 'good';
  const dias = daily.filter((d) => d.kwh > 0);
  // Para explicar por qué no hay pesos: ¿hay facturas?, ¿se pudieron leer?
  const facturasOk = invoices.filter((i: any) => i.parsed_ok).length;
  const primerError = invoices.find((i: any) => !i.parsed_ok && i.parse_error)?.parse_error ?? null;
  const avg = dias.length ? dias.reduce((a, b) => a + b.kwh, 0) / dias.length : 0;
  const diasTranscurridos = snap?.cycle_start && snap?.datos_hasta ? Math.round((Date.parse(snap.datos_hasta) - Date.parse(snap.cycle_start)) / 86400000) : 0;
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

  const consejo = snap ? buildConsejo({ threshold: THRESHOLD, metaRd: meta.rd, consumo, proy, avg, permitido, restantes, dias, pricing }) : null;

  return (
    <main>
      <header className="top">
        <h1><span className="brand-dot"><Chip icon="bolt" tone="blue" /></span>Monitor de Luz</h1>
        <TopBar
          status={lastRun ? {
            ok: !!lastRun.ok,
            when: new Date(lastRun.started_at).toLocaleString('es-DO', {
              timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            }),
          } : null}
        />
      </header>

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
          {consejo && (
            <section className={`coach ${consejo.nivel}`}>
              <div className="coach-head">
                <span className="coach-icon">{consejo.nivel === 'alerta' ? '🚨' : consejo.nivel === 'ojo' ? '👀' : '👊'}</span>
                <h2>{consejo.titulo}</h2>
              </div>
              <p className="coach-msg" dangerouslySetInnerHTML={{ __html: consejo.mensaje }} />
              <ul className="coach-do">
                {consejo.acciones.map((a, i) => <li key={i} dangerouslySetInnerHTML={{ __html: a }} />)}
              </ul>
            </section>
          )}

          {/*
            Sin facturas leídas no hay precios, y antes el bloque de dinero
            simplemente desaparecía: el panel quedaba solo en kWh sin decir
            por qué. Para quien acaba de registrarse eso parece que la app
            "no calcula".
          */}
          {!pricing && (
            <section className="card">
              <h2><span className="g-ico">💵</span> Todavía no podemos darte los pesos</h2>
              <p className="desc">
                Los montos salen de <b>tus facturas</b>: de ahí se leen los tramos de la tarifa
                (cuánto cuesta cada kWh). Tu consumo en kWh ya se está midiendo — lo que falta son
                las facturas.
              </p>
              {facturasOk === 0 && invoices.length > 0 ? (
                <div className="meta-now warn">
                  Bajamos {invoices.length} factura{invoices.length === 1 ? '' : 's'}, pero no se
                  pudieron leer{primerError ? `: ${primerError}` : ''}. Vuelve a sincronizar desde
                  Mi cuenta; si sigue igual, avísale a quien administra la app.
                </div>
              ) : (
                <div className="meta-now">
                  Aún no hemos bajado ninguna factura. Entra a <b>Mi cuenta</b> y dale a
                  <b> Sincronizar ahora</b>. La primera vez puede tardar: se bajan varias y se
                  reparte en más de una corrida, así que puede que necesites repetirlo mañana.
                </div>
              )}
              <a className="wz-next" href="/mi-cuenta">Ir a mi cuenta</a>
            </section>
          )}

          {pricing && (
            <div className="hero money-hero">
              <InfoDot>
                Estimado con el precio real de tus últimas {pricing.muestras} facturas: {fmtRD(pricing.precioKwh)} por kWh
                {pricing.precioKwhAlto ? `, y ${fmtRD(pricing.precioKwhAlto)} cuando el mes pasa de ${THRESHOLD} kWh (se pierden los tramos baratos)` : ''}.
              </InfoDot>
              <House />
              <div className="money-body">
                <div className="l">Llevas gastado este ciclo</div>
                <div className="big-money">{fmtRD(estimateCost(consumo, pricing))}</div>
                <div className="money-proj">
                  Al cierre: <b>{fmtRD(estimateCost(proy, pricing))}</b>
                  {meta.rd ? <span className="money-goal"> · meta {fmtRD(meta.rd)}</span> : null}
                </div>
              </div>
            </div>
          )}

          <div className="hero">
            <Gauge
              value={consumo}
              max={THRESHOLD}
              label={`día ${diasTranscurridos} · ${pct}% del límite`}
              color={level === 'crit' ? 'var(--critical)' : level === 'warn' ? 'var(--warning)' : 'var(--series-1)'}
            />
            <div className="stats">
              <div className="stat">
                <Chip icon="trend" tone={proy >= THRESHOLD ? 'red' : proy >= THRESHOLD * 0.9 ? 'orange' : 'green'} />
                <div>
                  <div className="v">{proy} kWh</div>
                  <div className="l">Proyección · {proy >= THRESHOLD ? `se pasa por ${proy - THRESHOLD}` : `margen de ${THRESHOLD - proy}`}</div>
                </div>
              </div>
              <div className="stat">
                <Chip icon="bolt" tone="blue" />
                <div>
                  <div className="v">{avg.toFixed(1)} kWh/día</div>
                  <div className="l">Promedio del ciclo</div>
                </div>
              </div>
              <div className="stat">
                <Chip icon="target" tone={permitido > 0 && avg > permitido ? 'orange' : 'green'} />
                <div>
                  <div className="v">{permitido.toFixed(1)} kWh/día</div>
                  <div className="l">Meta diaria · faltan {restantes} días</div>
                </div>
              </div>
              <div className="stat">
                <Chip icon="peak" tone="red" />
                <div>
                  <div className="v">{snap.valor_mayor ?? '—'} kWh</div>
                  <div className="l">Día más alto · {fmtDate(snap.dia_mayor)}</div>
                </div>
              </div>
            </div>
          </div>

          <section className="card">
            <h2><Chip icon="home" tone="blue" /> Camino a los {THRESHOLD} kWh</h2>
            <p className="desc">Si tu línea va por encima de la punteada gris, vas muy rápido.</p>
            <BudgetChart data={budget} threshold={THRESHOLD} />
          </section>

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
        </>
      )}

      <section className="card">
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

      <section className="card">
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
            <div><dt>Ciclo actual</dt><dd>{fmtDate(snap.cycle_start)} → {fmtDate(snap.datos_hasta)}</dd></div>
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
  );
}
