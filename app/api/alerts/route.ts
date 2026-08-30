import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Oculta una alerta (o todas) del panel. Protegida por el middleware. */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const db = sql();
  const form = await req.formData();
  const id = String(form.get('id') ?? '');
  if (id === 'todas') {
    await db`UPDATE alerts SET dismissed = true WHERE NOT dismissed`;
  } else if (/^\d+$/.test(id)) {
    await db`UPDATE alerts SET dismissed = true WHERE id = ${Number(id)}`;
  }
  return NextResponse.redirect(new URL('/', req.url), 303);
}
