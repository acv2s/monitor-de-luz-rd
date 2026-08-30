import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratoDeUsuario, guardarContrato } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Guarda el contrato de quien está en sesión (sus credenciales y su meta). */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const maestra = process.env.DASHBOARD_PASSWORD || '';
  const sesion = await leerCookie(req.cookies.get(COOKIE)?.value, maestra);
  if (!sesion) return NextResponse.redirect(new URL('/entrar', req.url), 303);

  const c = await contratoDeUsuario(sesion.uid);
  // Solo el dueño del contrato puede cambiarlo; quien lo tiene compartido, no.
  if (!c || (sesion.uid !== 'maestro' && c.owner_id !== sesion.uid)) {
    return NextResponse.redirect(new URL('/mi-cuenta?e=1', req.url), 303);
  }

  const f = await req.formData();
  const pass = String(f.get('password') ?? '').trim();
  const presupuesto = Number(f.get('budget_rd'));
  const limite = Number(f.get('kwh_threshold'));
  await guardarContrato(c.id, {
    nombre: String(f.get('nombre') ?? '').trim() || c.nombre,
    utility: String(f.get('utility') ?? c.utility),
    email: String(f.get('email') ?? '').trim() || c.email,
    password: pass || c.password,          // vacío = no tocar
    nic: String(f.get('nic') ?? '').trim() || null,
    goal_mode: String(f.get('goal_mode') ?? c.goal_mode),
    budget_rd: presupuesto > 0 ? presupuesto : c.budget_rd,
    kwh_threshold: limite > 0 ? limite : c.kwh_threshold,
  });
  return NextResponse.redirect(new URL('/mi-cuenta?ok=1', req.url), 303);
}
