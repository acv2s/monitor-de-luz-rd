import { NextResponse } from 'next/server';
import { ensureSchema, sql } from '@/lib/db';
import { CLAVES, SECRETAS } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Descarga la configuración como archivo JSON, para llevarla a otra
 * instalación. `?secretos=1` incluye claves y contraseñas — solo hazlo si el
 * archivo se queda contigo. Protegido por el middleware del dashboard.
 */
export async function GET(req: Request) {
  await ensureSchema();
  const conSecretos = new URL(req.url).searchParams.get('secretos') === '1';
  const rows = await sql()<{ clave: string; valor: string }[]>`SELECT clave, valor FROM settings`;
  const ajustes: Record<string, string> = {};
  for (const r of rows) {
    if (!(CLAVES as readonly string[]).includes(r.clave)) continue;
    if (!conSecretos && SECRETAS.includes(r.clave as any)) continue;
    ajustes[r.clave] = r.valor;
  }
  const doc = {
    app: 'jarto-de-la-luz',
    version: 1,
    exportado: new Date().toISOString(),
    incluye_secretos: conSecretos,
    ajustes,
  };
  return new NextResponse(JSON.stringify(doc, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="jarto-config${conSecretos ? '-completa' : ''}.json"`,
    },
  });
}
