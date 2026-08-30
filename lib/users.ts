import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { sql } from './db';

export interface Usuario {
  id: number;
  email: string;
  nombre: string | null;
  aprobado: boolean;
  admin: boolean;
  puede_asistente: boolean;
  puede_voz: boolean;
  telegram_chat_id: string | null;
  reset_pedido_at: string | null;
  created_at: string;
  last_login: string | null;
}

/** Hash PBKDF2 con sal — nunca se guarda la contraseña en claro. */
export function hashPassword(pass: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(pass, salt, 120_000, 32, 'sha256').toString('hex');
  return `pbkdf2$120000$${salt}$${hash}`;
}

export function verifyPassword(pass: string, guardado: string): boolean {
  const [alg, iter, salt, hash] = guardado.split('$');
  if (alg !== 'pbkdf2' || !salt || !hash) return false;
  const calc = pbkdf2Sync(pass, salt, Number(iter), 32, 'sha256');
  const esperado = Buffer.from(hash, 'hex');
  return calc.length === esperado.length && timingSafeEqual(calc, esperado);
}

export async function crearUsuario(datos: {
  email: string; nombre: string; pass: string;
  aprobado: boolean; puedeAsistente: boolean; puedeVoz: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = datos.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Ese correo no se ve válido.' };
  if (datos.pass.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  const db = sql();
  const [existe] = await db<{ id: number }[]>`SELECT id FROM users WHERE email = ${email}`;
  if (existe) return { ok: false, error: 'Ya hay una cuenta con ese correo.' };
  await db`
    INSERT INTO users (email, nombre, pass_hash, aprobado, puede_asistente, puede_voz)
    VALUES (${email}, ${datos.nombre.trim() || null}, ${hashPassword(datos.pass)},
            ${datos.aprobado}, ${datos.puedeAsistente}, ${datos.puedeVoz})`;
  return { ok: true };
}

export type Autenticacion =
  | { ok: true; usuario: Usuario }
  | { ok: false; motivo: 'credenciales' | 'pendiente' };

/**
 * Entrar con correo y contraseña. Distingue la contraseña equivocada de la
 * cuenta que todavía espera aprobación: si no, la persona cree que escribió
 * mal la clave y la cambia una y otra vez sin razón.
 */
export async function autenticar(email: string, pass: string): Promise<Autenticacion> {
  const db = sql();
  const [u] = await db<(Usuario & { pass_hash: string })[]>`
    SELECT * FROM users WHERE email = ${email.trim().toLowerCase()}`;
  if (!u || !verifyPassword(pass, u.pass_hash)) return { ok: false, motivo: 'credenciales' };
  if (!u.aprobado) return { ok: false, motivo: 'pendiente' };
  await db`UPDATE users SET last_login = now() WHERE id = ${u.id}`;
  const { pass_hash, ...limpio } = u;
  return { ok: true, usuario: limpio };
}

export async function listarUsuarios(): Promise<Usuario[]> {
  try {
    return await sql()<Usuario[]>`
      SELECT id, email, nombre, aprobado, admin, puede_asistente, puede_voz,
             telegram_chat_id, reset_pedido_at, created_at, last_login
      FROM users ORDER BY aprobado, created_at DESC`;
  } catch {
    return [];
  }
}

/** Códigos de invitación cortos y fáciles de leer. */
export function nuevoCodigo(): string {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 8);
}

/**
 * Restablecer contraseña sin servidor de correo: la persona pide ayuda desde
 * /recuperar y el dueño le genera un enlace de un solo uso que le pasa por
 * donde quiera. Nadie llega a ver la contraseña de nadie.
 */

/** Deja constancia de que esta persona no puede entrar. Nunca dice si el correo existe. */
export async function pedirRecuperacion(email: string): Promise<void> {
  try {
    await sql()`UPDATE users SET reset_pedido_at = now() WHERE email = ${email.trim().toLowerCase()}`;
  } catch { /* si falla, la persona igual puede pedirlo por su cuenta */ }
}

/** Crea el enlace de un solo uso. Vale 24 horas. */
export async function crearEnlaceReset(uid: number): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const expira = new Date(Date.now() + 24 * 3600_000).toISOString();
  const db = sql();
  await db`DELETE FROM password_resets WHERE user_id = ${uid} AND usado_at IS NULL`;
  await db`INSERT INTO password_resets (token, user_id, expira_at) VALUES (${token}, ${uid}, ${expira})`;
  return token;
}

export interface ResetValido { token: string; uid: number; email: string; nombre: string | null }

/** Devuelve el reset si el enlace sirve todavía. */
export async function resetValido(token: string): Promise<ResetValido | null> {
  const [r] = await sql()<any[]>`
    SELECT p.token, p.user_id, u.email, u.nombre
    FROM password_resets p JOIN users u ON u.id = p.user_id
    WHERE p.token = ${token} AND p.usado_at IS NULL AND p.expira_at > now()`;
  return r ? { token: r.token, uid: r.user_id, email: r.email, nombre: r.nombre } : null;
}

/** Cambia la contraseña y quema el enlace. */
export async function usarReset(token: string, pass: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (pass.length < 8) return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' };
  const r = await resetValido(token);
  if (!r) return { ok: false, error: 'Ese enlace ya venció o se usó.' };
  const db = sql();
  await db`UPDATE users SET pass_hash = ${hashPassword(pass)}, reset_pedido_at = NULL WHERE id = ${r.uid}`;
  await db`UPDATE password_resets SET usado_at = now() WHERE token = ${token}`;
  return { ok: true };
}
