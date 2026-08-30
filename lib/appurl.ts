import { setting } from './settings';

/**
 * La dirección pública de la app, para los enlaces que salen por Telegram.
 *
 * Ojo con el orden: VERCEL_URL es la URL del DESPLIEGUE (cambia en cada
 * publicación y suele estar detrás de la protección de Vercel), así que al
 * abrirla sale la pantalla de Vercel en vez de la app. La buena es el dominio
 * de producción, y por encima de todo lo que se haya puesto en el panel.
 */
export function urlDeEntorno(): string {
  const env = (process.env.APP_URL || '').trim();
  if (env) return env.replace(/\/+$/, '');
  const prod = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (prod) return `https://${prod}`;
  const dep = (process.env.VERCEL_URL || '').trim();
  if (dep) return `https://${dep}`;
  return 'http://localhost:3000';
}

/** Igual, pero dejando que el panel mande sobre las variables de entorno. */
export async function urlDeLaApp(): Promise<string> {
  try {
    const puesta = (await setting('APP_URL')).trim();
    if (puesta) return puesta.replace(/\/+$/, '');
  } catch { /* sin base de datos: se usa el entorno */ }
  return urlDeEntorno();
}
