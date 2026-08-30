import { NextRequest, NextResponse } from 'next/server';
import { setting } from '@/lib/settings';
import { ensureSchema } from '@/lib/db';
import { contratosActivos } from '@/lib/contracts';
import { PortalClient } from '@/lib/portal';
import { anotarSonda } from '@/lib/publicacion';
import { distribuidora } from '@/lib/utilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Sonda: solo mira hasta qué día tiene datos el portal y lo anota. No guarda
 * consumo ni manda avisos. Corriéndola cada hora se aprende a qué hora
 * publica de verdad la distribuidora, y con eso se ajusta la corrida diaria.
 *
 * GET /api/cron/sonda?secret=<CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  const secret = await setting('CRON_SECRET');
  const auth = req.headers.get('authorization');
  const q = req.nextUrl.searchParams.get('secret');
  if (secret && auth !== `Bearer ${secret}` && q !== secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  await ensureSchema();
  const vistas: { contrato: number; datosHasta: string | null; error?: string }[] = [];
  for (const c of await contratosActivos()) {
    try {
      const client = new PortalClient(c.email!, c.password!, distribuidora(c.utility).base);
      await client.login();
      const nics = c.nic?.trim() ? [c.nic.trim()] : await client.getContracts();
      if (!nics.length) throw new Error('sin NIC');
      const { data } = await client.getTeleconsumo(nics[0]);
      await anotarSonda(c.id, data.datosHasta ?? null);
      vistas.push({ contrato: c.id, datosHasta: data.datosHasta ?? null });
    } catch (e: any) {
      vistas.push({ contrato: c.id, datosHasta: null, error: e.message });
    }
  }
  return NextResponse.json({ ok: true, vistas });
}
