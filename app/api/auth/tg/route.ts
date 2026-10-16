import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { crearCookie, COOKIE } from '@/lib/session';
import { usarEnlaceEntrada } from '@/lib/tg-login';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };

/** Entrada con el enlace de un solo uso que manda el bot al escribirle "panel". */
export async function GET(req: NextRequest) {
  const secreto = process.env.DASHBOARD_PASSWORD || '';
  const token = req.nextUrl.searchParams.get('t') || '';
  if (!secreto || !token) return NextResponse.redirect(new URL('/entrar?e=1', req.url), 303);

  await ensureSchema();
  const uid = await usarEnlaceEntrada(token);
  // Vencido, ya usado o con el acceso apagado: a la entrada normal.
  if (uid == null) return NextResponse.redirect(new URL('/entrar?vencido=1', req.url), 303);

  let sesion;
  if (uid === 'maestro') {
    sesion = { uid: 'maestro' as const, email: 'dueño', admin: true };
  } else {
    const [u] = await sql()<{ id: number; email: string; admin: boolean; aprobado: boolean }[]>`
      SELECT id, email, admin, aprobado FROM users WHERE id = ${uid}`;
    if (!u?.aprobado) return NextResponse.redirect(new URL('/entrar?e=1', req.url), 303);
    sesion = { uid: Number(u.id), email: u.email, admin: !!u.admin };
    await sql()`UPDATE users SET last_login = now() WHERE id = ${u.id}`;
  }
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(COOKIE, await crearCookie(sesion, secreto), COOKIE_OPTS);
  return res;
}
