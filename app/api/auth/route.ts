import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { autenticar, crearUsuario, pedirRecuperacion, usarReset } from '@/lib/users';
import { crearCookie, COOKIE } from '@/lib/session';
import { crearContratoDe, compartirContrato, contratoDeUsuario } from '@/lib/contracts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAESTRA = () => process.env.DASHBOARD_PASSWORD || '';

function volver(req: NextRequest, url: string) {
  return NextResponse.redirect(new URL(url, req.url), 303);
}

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };

/** Entrar (maestra o cuenta) y registrarse con un código de invitación. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const accion = String(form.get('accion') ?? 'entrar');
  const secreto = MAESTRA();

  if (accion === 'entrar') {
    const email = String(form.get('email') ?? '').trim();
    const pass = String(form.get('password') ?? '');

    // La contraseña maestra entra sin correo: es la del dueño.
    if (secreto && pass === secreto && !email) {
      const res = volver(req, '/');
      res.cookies.set(COOKIE, await crearCookie({ uid: 'maestro', email: 'dueño', admin: true }, secreto), COOKIE_OPTS);
      return res;
    }
    try {
      await ensureSchema();
      const r = await autenticar(email, pass);
      if (r.ok) {
        const u = r.usuario;
        // Si todavía no ha configurado su cuenta de luz, va directo a los pasos.
        const c = await contratoDeUsuario(u.id);
        const propio = c && c.owner_id === u.id;
        const res = volver(req, propio && !c.email && !c.password ? '/empezar' : '/');
        res.cookies.set(COOKIE, await crearCookie({ uid: u.id, email: u.email, admin: u.admin }, secreto), COOKIE_OPTS);
        return res;
      }
      // La contraseña estaba bien: lo que falta es que el dueño apruebe.
      if (r.motivo === 'pendiente') return volver(req, '/entrar?pendiente=1');
    } catch { /* sin base de datos: solo entra la maestra */ }
    return volver(req, '/entrar?e=1');
  }

  if (accion === 'registrar') {
    await ensureSchema();
    const codigo = String(form.get('codigo') ?? '').trim();
    const db = sql();
    const [inv] = await db<any[]>`SELECT * FROM invites WHERE code = ${codigo}`;
    if (!inv || inv.usos >= inv.usos_max) return volver(req, '/registro?e=codigo');
    if (inv.expira_at && new Date(inv.expira_at) < new Date()) return volver(req, '/registro?e=vencido');

    const r = await crearUsuario({
      email: String(form.get('email') ?? ''),
      nombre: String(form.get('nombre') ?? ''),
      pass: String(form.get('password') ?? ''),
      aprobado: inv.auto_aprobar,
      puedeAsistente: inv.da_asistente,
      puedeVoz: inv.da_voz,
    });
    if (!r.ok) return volver(req, `/registro?codigo=${encodeURIComponent(codigo)}&e=${encodeURIComponent(r.error)}`);

    const [nuevo] = await db<{ id: number }[]>`
      SELECT id FROM users WHERE email = ${String(form.get('email') ?? '').trim().toLowerCase()}`;
    if (nuevo) {
      if (inv.contrato_compartido) {
        // le comparten un contrato ya existente: no configura nada
        await compartirContrato(Number(inv.contrato_compartido), nuevo.id);
      } else {
        // contrato propio: lo llena él mismo en los primeros pasos (/empezar)
        await crearContratoDe(nuevo.id, String(form.get('nombre') ?? '').trim() || 'Mi casa');
      }
    }
    await db`UPDATE invites SET usos = usos + 1 WHERE code = ${codigo}`;
    return volver(req, inv.auto_aprobar ? '/entrar?nuevo=1' : '/entrar?pendiente=1');
  }

  // «Olvidé mi contraseña»: se avisa al dueño, que genera el enlace.
  if (accion === 'recuperar') {
    try {
      await ensureSchema();
      await pedirRecuperacion(String(form.get('email') ?? ''));
    } catch { /* la pantalla responde igual, exista o no la cuenta */ }
    return volver(req, '/recuperar?pedido=1');
  }

  // Enlace de un solo uso: la persona escribe su nueva contraseña.
  if (accion === 'restablecer') {
    await ensureSchema();
    const token = String(form.get('token') ?? '');
    const pass = String(form.get('password') ?? '');
    if (pass !== String(form.get('password2') ?? '')) {
      return volver(req, `/recuperar/${encodeURIComponent(token)}?e=${encodeURIComponent('Las dos contraseñas no son iguales.')}`);
    }
    const r = await usarReset(token, pass);
    if (!r.ok) return volver(req, `/recuperar/${encodeURIComponent(token)}?e=${encodeURIComponent(r.error)}`);
    return volver(req, '/entrar?cambiada=1');
  }

  if (accion === 'salir') {
    const res = volver(req, '/entrar');
    res.cookies.delete(COOKIE);
    return res;
  }

  return volver(req, '/entrar');
}
