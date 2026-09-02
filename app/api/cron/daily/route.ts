import { NextRequest, NextResponse } from 'next/server';
import { setting } from '@/lib/settings';
import { runDaily } from '@/lib/job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Hora actual en República Dominicana (0–23). */
function horaRD(): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo', hour: 'numeric', hourCycle: 'h23',
  }).format(new Date()));
}

/**
 * Corrida programada. Vercel Cron la llama cada hora con
 * `Authorization: Bearer <CRON_SECRET>`; cada contrato se procesa a la hora
 * que eligió su dueño. A mano: GET /api/cron/daily?secret=<CRON_SECRET>
 * (con &todos=1 procesa todos sin importar la hora).
 */
export async function GET(req: NextRequest) {
  const secret = await setting('CRON_SECRET');
  const auth = req.headers.get('authorization');
  const q = req.nextUrl.searchParams.get('secret');
  if (secret && auth !== `Bearer ${secret}` && q !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const todos = req.nextUrl.searchParams.get('todos') === '1';
  const result = await runDaily(todos ? null : horaRD());
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
