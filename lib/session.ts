/**
 * Sesión firmada guardada en una cookie. El secreto sale de la contraseña
 * maestra, así que cambiarla cierra todas las sesiones.
 *
 * Usa Web Crypto (no node:crypto) porque el middleware corre en el runtime
 * Edge, donde los módulos de Node no existen.
 */

export const COOKIE = 'jl_sesion';

export interface Sesion { uid: number | 'maestro'; email: string; admin: boolean }

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(s: string): Uint8Array {
  const base = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function firma(payload: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(mac));
}

export async function crearCookie(s: Sesion, secreto: string): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify(s)));
  return `${payload}.${await firma(payload, secreto)}`;
}

export async function leerCookie(valor: string | undefined, secreto: string): Promise<Sesion | null> {
  if (!valor) return null;
  const [payload, mac] = valor.split('.');
  if (!payload || !mac) return null;
  const esperado = await firma(payload, secreto);
  // comparación de tiempo constante
  if (mac.length !== esperado.length) return null;
  let dif = 0;
  for (let i = 0; i < mac.length; i++) dif |= mac.charCodeAt(i) ^ esperado.charCodeAt(i);
  if (dif !== 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(deB64url(payload)));
  } catch {
    return null;
  }
}
