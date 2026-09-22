import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratosDeUsuario, crearOtraCuenta } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Cookie con la cuenta elegida en el selector (casa, negocio, etc.). */
const CUENTA_COOKIE = 'cuenta';

/**
 * Cambiar de cuenta activa, o crear otra cuenta para la misma persona.
 * El selector del panel y de Mi cuenta postean aquí.
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const maestra = process.env.DASHBOARD_PASSWORD || '';
  const sesion = await leerCookie(req.cookies.get(COOKIE)?.value, maestra);
  if (!sesion) return NextResponse.redirect(new URL('/entrar', req.url), 303);

  const f = await req.formData();
  const volver = String(f.get('volver') || '/');
  const destino = volver.startsWith('/') ? volver : '/';

  let elegido: number | null = null;
  if (f.get('accion') === 'nueva') {
    // Solo se abre otra cuenta propia; quien mira una compartida no crea nada.
    elegido = (await crearOtraCuenta(sesion.uid)).id;
  } else {
    const id = Number(f.get('id'));
    // Nunca se activa una cuenta ajena: tiene que estar entre las suyas.
    const mias = await contratosDeUsuario(sesion.uid);
    if (mias.some((c) => c.id === id)) elegido = id;
  }

  const res = NextResponse.redirect(new URL(f.get('accion') === 'nueva' ? '/mi-cuenta' : destino, req.url), 303);
  if (elegido != null) {
    res.cookies.set(CUENTA_COOKIE, String(elegido), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600 });
  }
  return res;
}
