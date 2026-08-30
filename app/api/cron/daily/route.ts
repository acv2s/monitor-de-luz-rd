import { NextRequest, NextResponse } from 'next/server';
import { setting } from '@/lib/settings';
import { runDaily } from '@/lib/job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Corrida diaria. Vercel Cron la llama con `Authorization: Bearer <CRON_SECRET>`.
 * También se puede disparar a mano: GET /api/cron/daily?secret=<CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = await setting('CRON_SECRET');
  const auth = req.headers.get('authorization');
  const q = req.nextUrl.searchParams.get('secret');
  if (secret && auth !== `Bearer ${secret}` && q !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const result = await runDaily();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
