import { sql } from './db';
import { setting } from './settings';
import { urlDeLaApp } from './appurl';

export interface TelegramOpts {
  /** Muestra el botón "Ver dashboard" debajo del mensaje. */
  dashboardButton?: boolean;
}

async function post(token: string, chatId: string, text: string, opts: TelegramOpts): Promise<boolean> {
  const body: any = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (opts.dashboardButton) {
    const url = await urlDeLaApp();
    // Telegram rechaza el botón si la URL no es pública (localhost en desarrollo).
    if (/^https:\/\//.test(url)) {
      body.reply_markup = { inline_keyboard: [[{ text: '📊 Ver dashboard', url }]] };
    }
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('[telegram] error', res.status, await res.text());
  return res.ok;
}

let cacheBot: { at: number; user: string | null } | null = null;

/** El @usuario del bot, para armar el enlace t.me. null si no hay token. */
export async function botUsername(): Promise<string | null> {
  if (cacheBot && Date.now() - cacheBot.at < 600_000) return cacheBot.user;
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j: any = await res.json();
    const user = j?.ok ? j.result?.username ?? null : null;
    cacheBot = { at: Date.now(), user };
    return user;
  } catch {
    return null;
  }
}

/**
 * Chat IDs autorizados: los del panel (/config) y, como respaldo, el de la
 * variable TELEGRAM_CHAT_ID (se auto-registra en la tabla la primera vez).
 */
export async function getAuthorizedChatIds(): Promise<string[]> {
  const envId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  try {
    const db = sql();
    if (envId) {
      await db`INSERT INTO telegram_recipients (chat_id, name, authorized)
               VALUES (${envId}, 'dueño (variable de Vercel)', true)
               ON CONFLICT (chat_id) DO NOTHING`;
    }
    const rows = await db<{ chat_id: string }[]>`SELECT chat_id FROM telegram_recipients WHERE authorized`;
    if (rows.length) return rows.map((r) => r.chat_id);
  } catch (e: any) {
    console.error('[telegram] no se pudo leer destinatarios:', e.message);
  }
  return envId ? [envId] : [];
}

/** Envía a un chat específico (respuestas del webhook). */
export async function sendTelegramTo(chatId: string, text: string, opts: TelegramOpts = {}): Promise<boolean> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) { console.warn('[telegram] sin TELEGRAM_BOT_TOKEN'); return false; }
  return post(token, chatId, text, opts);
}

/** Envía una foto (por URL) a un chat específico. */
export async function sendTelegramPhotoTo(chatId: string, photoUrl: string, caption: string): Promise<boolean> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl, caption }),
  });
  if (!res.ok) console.error('[telegram] error foto', res.status, await res.text());
  return res.ok;
}

/** Envía una nota de voz (OGG/Opus) a un chat. */
export async function sendTelegramVoiceTo(chatId: string, ogg: Buffer, caption?: string): Promise<boolean> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) return false;
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('voice', new Blob([new Uint8Array(ogg)], { type: 'audio/ogg' }), 'respuesta.ogg');
  if (caption) form.append('caption', caption.slice(0, 1000));
  const res = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, { method: 'POST', body: form });
  if (!res.ok) console.error('[telegram] error voz', res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

/** Marca "grabando audio…" o "escribiendo…" mientras se procesa. */
export async function sendChatAction(chatId: string, action: 'typing' | 'record_voice' | 'upload_voice'): Promise<void> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  }).catch(() => {});
}

/** Difunde una foto (por URL) a todos los chats autorizados. */
export async function sendTelegramPhoto(photoUrl: string, caption: string): Promise<boolean> {
  const ids = await getAuthorizedChatIds();
  const results = await Promise.all(ids.map((id) => sendTelegramPhotoTo(id, photoUrl, caption)));
  return results.some(Boolean);
}

/** Difunde a todos los chats autorizados (alertas y resúmenes). */
export async function sendTelegram(text: string, opts: TelegramOpts = {}): Promise<boolean> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) { console.warn('[telegram] sin TELEGRAM_BOT_TOKEN; mensaje:', text); return false; }
  const ids = await getAuthorizedChatIds();
  if (!ids.length) { console.warn('[telegram] sin destinatarios autorizados'); return false; }
  const results = await Promise.all(ids.map((id) => post(token, id, text, opts)));
  return results.some(Boolean);
}
