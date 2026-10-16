import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { confirmarActivacion, desactivar } from '@/lib/tg-login';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Activar (con el código que mandó el bot) o apagar la entrada desde Telegram. */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const sesion = await leerCookie(req.cookies.get(COOKIE)?.value, process.env.DASHBOARD_PASSWORD || '');
  if (!sesion) return NextResponse.redirect(new URL('/entrar', req.url), 303);
  // El dueño lo tiene de fábrica: no hay nada que activar.
  if (sesion.uid === 'maestro') return NextResponse.redirect(new URL('/mi-cuenta', req.url), 303);

  const f = await req.formData();
  if (f.get('accion') === 'desactivar') {
    await desactivar(sesion.uid);
    return NextResponse.redirect(new URL('/mi-cuenta?tg=off#tg-login', req.url), 303);
  }
  const ok = await confirmarActivacion(sesion.uid, String(f.get('codigo') ?? ''));
  return NextResponse.redirect(new URL(`/mi-cuenta?tg=${ok ? 'on' : 'mal'}#tg-login`, req.url), 303);
}
