import { NextRequest, NextResponse } from 'next/server';
import { leerCookie, COOKIE } from '@/lib/session';

/**
 * Control de acceso. Hay dos formas de entrar:
 *  - la contraseña maestra (DASHBOARD_PASSWORD): es el dueño, ve todo;
 *  - una cuenta creada con un enlace de invitación.
 * /personas y /config son solo del dueño.
 */

const PUBLICAS = ['/entrar', '/registro', '/recuperar', '/api/auth'];
const SIN_SESION = ['/api/cron', '/api/telegram', '/_next', '/favicon.ico', '/casa-energia.png'];

export async function middleware(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  if (SIN_SESION.some((p) => ruta.startsWith(p))) return NextResponse.next();

  const maestra = process.env.DASHBOARD_PASSWORD;
  if (!maestra) return NextResponse.next(); // sin contraseña configurada, todo abierto

  if (PUBLICAS.some((p) => ruta.startsWith(p))) return NextResponse.next();

  const sesion = await leerCookie(req.cookies.get(COOKIE)?.value, maestra);
  if (!sesion) {
    const url = new URL('/entrar', req.url);
    return NextResponse.redirect(url);
  }

  // El panel de configuración y el de personas son solo del dueño.
  if ((ruta.startsWith('/config') || ruta.startsWith('/personas') || ruta.startsWith('/bienvenida')
      || ruta.startsWith('/api/settings') || ruta.startsWith('/api/usuarios')) && !sesion.admin) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
