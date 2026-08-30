import { sql } from './db';

/**
 * Las consultas manuales al portal ("comprobar el acceso" y "sincronizar
 * ahora") están limitadas a 3 por persona al día. La oficina virtual no es
 * nuestra: machacarla a peticiones es la vía rápida para que bloqueen la
 * cuenta o el scraping completo. La corrida programada no cuenta aquí.
 */
export const LLAMADAS_POR_DIA = 3;

export interface Cupo {
  permitido: boolean;
  usadas: number;
  restantes: number;
}

/** Día local de Santo Domingo, para que el cupo se renueve a medianoche de allá. */
function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(new Date());
}

/** ¿Le quedan consultas a esta persona hoy? */
export async function cupoDe(userKey: string): Promise<Cupo> {
  const [r] = await sql()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM manual_calls
    WHERE user_key = ${userKey}
      AND (at AT TIME ZONE 'America/Santo_Domingo')::date = ${hoyLocal()}::date`;
  const usadas = r?.n ?? 0;
  return { permitido: usadas < LLAMADAS_POR_DIA, usadas, restantes: Math.max(0, LLAMADAS_POR_DIA - usadas) };
}

/** Gasta una consulta del cupo de hoy. */
export async function gastarLlamada(userKey: string): Promise<void> {
  await sql()`INSERT INTO manual_calls (user_key) VALUES (${userKey})`;
}

export function mensajeSinCupo(): string {
  return `Ya usaste tus ${LLAMADAS_POR_DIA} consultas manuales de hoy. El monitor se actualiza solo cada día; mañana tendrás ${LLAMADAS_POR_DIA} de nuevo.`;
}
