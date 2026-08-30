import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { nuevoCodigo, crearEnlaceReset } from '@/lib/users';
import { marcado } from '@/lib/form';

export const dynamic = 'force-dynamic';

/** Acciones del panel de personas. Solo el dueño llega aquí (middleware). */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const db = sql();
  const form = await req.formData();
  const accion = String(form.get('accion') ?? '');
  const id = Number(form.get('id') ?? 0);

  if (accion === 'aprobar') await db`UPDATE users SET aprobado = true WHERE id = ${id}`;
  else if (accion === 'suspender') await db`UPDATE users SET aprobado = false WHERE id = ${id}`;
  else if (accion === 'eliminar') {
    // Se va la cuenta y todo lo suyo: su contrato, sus chats y sus enlaces.
    await db`DELETE FROM telegram_recipients WHERE user_id = ${id}`;
    await db`DELETE FROM password_resets WHERE user_id = ${id}`;
    await db`DELETE FROM contract_members WHERE user_id = ${id}`;
    await db`DELETE FROM contracts WHERE owner_id = ${id}`;
    await db`DELETE FROM users WHERE id = ${id} AND NOT admin`;
  } else if (accion === 'editar') {
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const nombre = String(form.get('nombre') ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.redirect(new URL('/config?e=correo#personas', req.url), 303);
    }
    const [choca] = await db<{ id: number }[]>`SELECT id FROM users WHERE email = ${email} AND id <> ${id}`;
    if (choca) return NextResponse.redirect(new URL('/config?e=repetido#personas', req.url), 303);
    await db`UPDATE users SET email = ${email}, nombre = ${nombre || null} WHERE id = ${id}`;
  } else if (accion === 'reset') await crearEnlaceReset(id);
  else if (accion === 'permisos') {
    await db`UPDATE users SET
      puede_asistente = ${marcado(form, 'puede_asistente')},
      puede_voz = ${marcado(form, 'puede_voz')}
      WHERE id = ${id}`;
  } else if (accion === 'invitar') {
    const dias = Number(form.get('vigencia_dias')) || 0;
    const expira = dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null;
    const compartir = Number(form.get('contrato_compartido')) || null;
    const code = nuevoCodigo();
    await db`INSERT INTO invites (code, nota, da_asistente, da_voz, auto_aprobar, usos_max, expira_at, contrato_compartido)
      VALUES (${code}, ${String(form.get('nota') ?? '') || null},
              ${marcado(form, 'da_asistente')}, ${marcado(form, 'da_voz')},
              ${marcado(form, 'auto_aprobar')}, ${Math.max(1, Number(form.get('usos_max')) || 1)},
              ${expira}, ${compartir})`;
    // Se vuelve señalando el enlace nuevo, para no tener que buscarlo en la lista.
    return NextResponse.redirect(new URL(`/config?nuevo=${code}#personas`, req.url), 303);
  } else if (accion === 'borrar_invite') {
    await db`DELETE FROM invites WHERE code = ${String(form.get('code') ?? '')}`;
  }
  return NextResponse.redirect(new URL('/config#personas', req.url), 303);
}
