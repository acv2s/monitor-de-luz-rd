import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { cupoDe, gastarLlamada, mensajeSinCupo } from '@/lib/limite';
import { contratoDeUsuario, verificarContrato } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Comprueba el acceso a la oficina virtual de quien está en sesión. Es el
 * paso previo a traer los datos: confirma que el correo y la contraseña
 * sirven, sin esperar toda la lectura.
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const maestra = process.env.DASHBOARD_PASSWORD || '';
  const sesion = await leerCookie(req.cookies.get(COOKIE)?.value, maestra);
  if (!sesion) return NextResponse.json({ ok: false, error: 'Tienes que entrar de nuevo.' }, { status: 401 });

  const c = await contratoDeUsuario(sesion.uid);
  if (!c) return NextResponse.json({ ok: false, error: 'Todavía no tienes una cuenta de luz asociada.' }, { status: 400 });
  const propio = sesion.uid === 'maestro' ? c.owner_id === null : c.owner_id === sesion.uid;
  if (!propio) return NextResponse.json({ ok: false, error: 'Esta cuenta es de otra persona.' }, { status: 403 });

  // Máximo 3 consultas manuales al portal por persona al día.
  const cupo = await cupoDe(String(sesion.uid));
  if (!cupo.permitido) {
    return NextResponse.json({ ok: false, error: mensajeSinCupo() }, { status: 429 });
  }
  await gastarLlamada(String(sesion.uid));

  const r = await verificarContrato(c.id);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
