import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { sendTelegramTo } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

/**
 * Acciones del panel de destinatarios de Telegram. Protegida por el middleware
 * del dashboard (requiere la sesión con DASHBOARD_PASSWORD).
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const db = sql();
  const form = await req.formData();
  const action = String(form.get('action') ?? '');
  const chatId = String(form.get('chat_id') ?? '').trim();

  if (action === 'add') {
    const name = String(form.get('name') ?? '').trim();
    if (/^-?\d+$/.test(chatId)) {
      await db`INSERT INTO telegram_recipients (chat_id, name, authorized) VALUES (${chatId}, ${name || null}, true)
               ON CONFLICT (chat_id) DO UPDATE SET authorized = true, name = COALESCE(NULLIF(${name}, ''), telegram_recipients.name)`;
    }
  } else if (action === 'approve' && chatId) {
    await db`UPDATE telegram_recipients SET authorized = true WHERE chat_id = ${chatId}`;
    await sendTelegramTo(chatId, '✅ Ya estás autorizado. Escríbeme "como voy", "consejos" o "factura", o pregúntame lo que quieras.');
  } else if (action === 'revoke' && chatId) {
    await db`UPDATE telegram_recipients SET authorized = false WHERE chat_id = ${chatId}`;
  } else if (action === 'delete' && chatId) {
    await db`DELETE FROM telegram_recipients WHERE chat_id = ${chatId}`;
  }
  return NextResponse.redirect(new URL('/config', req.url), 303);
}
