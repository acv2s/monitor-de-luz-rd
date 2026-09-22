import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratosDeUsuario, crearOtraCuenta, eliminarCuenta } from '@/lib/contracts';

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

  const mias = await contratosDeUsuario(sesion.uid);
  const esMia = (id: number) => {
    const c = mias.find((x) => x.id === id);
    // "Mía" de verdad: soy su dueño, no solo me la compartieron.
    return c ? (sesion.uid === 'maestro' ? c.owner_id === null : c.owner_id === sesion.uid) : false;
  };

  let elegido: number | null = null;
  const accion = String(f.get('accion') || '');
  if (accion === 'nueva') {
    // Lo típico: otro contrato bajo el MISMO acceso del portal. Se copian
    // las credenciales de la cuenta activa; solo falta el nombre y el NIC.
    const activaId = Number(req.cookies.get('cuenta')?.value) || null;
    const plantilla = mias.find((c) => c.id === activaId && esMia(c.id)) ?? mias.find((c) => esMia(c.id)) ?? null;
    elegido = (await crearOtraCuenta(sesion.uid, plantilla)).id;
  } else if (accion === 'eliminar') {
    const id = Number(f.get('id'));
    const propias = mias.filter((c) => esMia(c.id));
    // Solo una cuenta propia extra: la última no se borra desde aquí.
    if (esMia(id) && propias.length > 1) {
      await eliminarCuenta(id);
      elegido = propias.find((c) => c.id !== id)?.id ?? null;
    }
    return conCookie(NextResponse.redirect(new URL('/mi-cuenta', req.url), 303), elegido);
  } else {
    const id = Number(f.get('id'));
    // Nunca se activa una cuenta ajena: tiene que estar entre las suyas.
    if (mias.some((c) => c.id === id)) elegido = id;
  }

  return conCookie(NextResponse.redirect(new URL(accion === 'nueva' ? '/mi-cuenta' : destino, req.url), 303), elegido);
}

function conCookie(res: NextResponse, elegido: number | null): NextResponse {
  if (elegido != null) {
    res.cookies.set(CUENTA_COOKIE, String(elegido), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600 });
  }
  return res;
}
