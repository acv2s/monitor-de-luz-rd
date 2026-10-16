import { randomBytes, randomInt } from 'node:crypto';
import { sql } from './db';

/**
 * Entrar al panel desde Telegram sin escribir la contraseña.
 *
 * Quien le escribe "panel" al bot recibe un enlace de UN solo uso que vence
 * en pocos minutos. Es tan seguro como el chat: por eso solo se da a chats ya
 * vinculados, y cada usuario normal tiene que activarlo él mismo, probando
 * que controla las dos puntas (copia en la web un código que el bot le mandó).
 * El dueño lo tiene activo de fábrica.
 */

export const MINUTOS_ENLACE = 10;
const MINUTOS_CODIGO = 15;

export type Uid = number | 'maestro';

/** ¿Esta persona puede pedir el enlace? El dueño, siempre. */
export async function tgLoginActivo(uid: Uid): Promise<boolean> {
  if (uid === 'maestro') return true;
  const [u] = await sql()<{ tg_login: boolean }[]>`SELECT tg_login FROM users WHERE id = ${uid}`;
  return !!u?.tg_login;
}

/** Crea el enlace de un solo uso. Devuelve el token. */
export async function crearEnlaceEntrada(uid: Uid): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const expira = new Date(Date.now() + MINUTOS_ENLACE * 60_000).toISOString();
  const db = sql();
  // Un enlace vivo a la vez: pedir otro invalida el anterior.
  await db`DELETE FROM login_tokens WHERE uid = ${String(uid)} AND usado_at IS NULL`;
  await db`INSERT INTO login_tokens (token, uid, expira_at) VALUES (${token}, ${String(uid)}, ${expira})`;
  return token;
}

/** Quema el token y dice de quién era, si todavía servía. */
export async function usarEnlaceEntrada(token: string): Promise<Uid | null> {
  const [r] = await sql()<{ uid: string }[]>`
    UPDATE login_tokens SET usado_at = now()
    WHERE token = ${token} AND usado_at IS NULL AND expira_at > now()
    RETURNING uid`;
  if (!r) return null;
  if (r.uid === 'maestro') return 'maestro';
  // Si después de pedir el enlace se apagó el acceso, el enlace ya no sirve.
  const uid = Number(r.uid);
  return (await tgLoginActivo(uid)) ? uid : null;
}

/** Código de 6 cifras que el bot manda y la persona confirma en la web. */
export async function pedirCodigoActivacion(uid: number): Promise<string> {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expira = new Date(Date.now() + MINUTOS_CODIGO * 60_000).toISOString();
  await sql()`UPDATE users SET tg_login_codigo = ${codigo}, tg_login_codigo_expira = ${expira} WHERE id = ${uid}`;
  return codigo;
}

/** Activa el acceso si el código que puso en la web es el que mandó el bot. */
export async function confirmarActivacion(uid: number, codigo: string): Promise<boolean> {
  const [r] = await sql()<{ id: number }[]>`
    UPDATE users SET tg_login = true, tg_login_codigo = NULL, tg_login_codigo_expira = NULL
    WHERE id = ${uid} AND tg_login_codigo = ${codigo.trim()} AND tg_login_codigo_expira > now()
    RETURNING id`;
  return !!r;
}

export async function desactivar(uid: number): Promise<void> {
  const db = sql();
  await db`UPDATE users SET tg_login = false, tg_login_codigo = NULL WHERE id = ${uid}`;
  await db`DELETE FROM login_tokens WHERE uid = ${String(uid)} AND usado_at IS NULL`;
}
