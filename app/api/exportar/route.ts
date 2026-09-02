import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, sql } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratoDeUsuario } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Descarga TODOS los datos de la cuenta de quien está en sesión, en un JSON.
 * Son sus datos y se los puede llevar cuando quiera. No incluye credenciales
 * ni los PDF (esos se bajan uno a uno desde el panel de facturas).
 */
export async function GET(req: NextRequest) {
  await ensureSchema();
  const maestra = process.env.DASHBOARD_PASSWORD || '';
  const sesion = await leerCookie(req.cookies.get(COOKIE)?.value, maestra);
  if (!sesion) return NextResponse.redirect(new URL('/entrar', req.url), 303);

  const c = await contratoDeUsuario(sesion.uid);
  if (!c) return NextResponse.json({ error: 'No tienes una cuenta asociada.' }, { status: 404 });

  const db = sql();
  const diario = await db`
    SELECT to_char(day,'YYYY-MM-DD') AS dia, kwh::float AS kwh
    FROM daily_consumption WHERE contract_id = ${c.id} ORDER BY day`;
  const mensual = await db`
    SELECT to_char(month,'YYYY-MM') AS mes, kwh, source AS fuente
    FROM monthly_consumption WHERE contract_id = ${c.id} ORDER BY month`;
  const facturas = await db`
    SELECT numero_factura, to_char(fecha_emision,'YYYY-MM-DD') AS fecha_emision,
           to_char(periodo_inicio,'YYYY-MM-DD') AS periodo_inicio,
           to_char(periodo_fin,'YYYY-MM-DD') AS periodo_fin,
           dias_facturados, consumo_kwh, cargo_fijo::float AS cargo_fijo,
           energia_rd::float AS energia_rd, subsidio_rd::float AS subsidio_rd,
           facturado_rd::float AS facturado_rd, total_a_pagar::float AS total_a_pagar,
           to_char(pague_antes_de,'YYYY-MM-DD') AS pague_antes_de, tarifa, tramos
    FROM invoices WHERE contract_id = ${c.id} AND parsed_ok ORDER BY fecha_emision`;

  const datos = {
    exportado: new Date().toISOString(),
    cuenta: {
      nombre: c.nombre, nic: c.nic, meta: c.goal_mode === 'dinero'
        ? { tipo: 'dinero', presupuesto_rd: c.budget_rd } : { tipo: 'kwh', limite_kwh: c.kwh_threshold },
    },
    consumo_diario: diario,
    consumo_mensual: mensual,
    facturas,
  };
  return new NextResponse(JSON.stringify(datos, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="monitor-de-luz-${(c.nombre || 'cuenta').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.json"`,
    },
  });
}
