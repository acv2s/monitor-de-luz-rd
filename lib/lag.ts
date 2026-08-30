import { sql } from './db';

/**
 * La oficina virtual publica el consumo con atraso: hoy sábado los datos
 * llegan hasta el jueves. Eso es lo NORMAL, no una avería ni una factura que
 * "no salió". Sin saberlo, el bot y los consejos alarmaban por un cero que
 * solo significa "todavía no lo han publicado".
 */

export interface Retraso {
  /** Último día con datos publicados (YYYY-MM-DD), o null si no hay nada. */
  datosHasta: string | null;
  /** Días entre ese último día y hoy. Suele ser 2. */
  dias: number;
  /** Días recientes que aún no tienen dato: no se analizan ni se alarman. */
  sinPublicar: string[];
  /** Retraso habitual observado en el historial de esta cuenta. */
  habitual: number;
}

const DIA = 86400000;

/** Días de atraso entre `datosHasta` y hoy. */
export function diasDeAtraso(datosHasta: string | null, hoy = new Date()): number {
  if (!datosHasta) return 0;
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  return Math.max(0, Math.round((h - Date.parse(datosHasta)) / DIA));
}

/** Lista de días entre el último publicado (excluido) y hoy (incluido). */
export function diasSinPublicar(datosHasta: string | null, hoy = new Date()): string[] {
  const n = diasDeAtraso(datosHasta, hoy);
  if (!n) return [];
  const dias: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    dias.push(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()) - i * DIA)
      .toISOString().slice(0, 10));
  }
  return dias;
}

/**
 * El atraso habitual de esta cuenta, medido con las lecturas ya guardadas:
 * la mediana de (día en que se leyó − último día publicado).
 */
export async function atrasoHabitual(cid: number | null): Promise<number> {
  try {
    const filas = await sql()<{ dif: number }[]>`
      SELECT EXTRACT(DAY FROM (captured_at::date - datos_hasta))::int AS dif
      FROM teleconsumo_snapshots
      WHERE datos_hasta IS NOT NULL AND (${cid}::bigint IS NULL OR contract_id = ${cid})
      ORDER BY captured_at DESC LIMIT 30`;
    const nums = filas.map((f) => f.dif).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
    if (!nums.length) return 2;
    return nums[Math.floor(nums.length / 2)];
  } catch {
    return 2;
  }
}

/** Todo lo del atraso junto, para pasárselo al bot y a los consejos. */
export async function retrasoDe(cid: number | null, datosHasta: string | null): Promise<Retraso> {
  return {
    datosHasta,
    dias: diasDeAtraso(datosHasta),
    sinPublicar: diasSinPublicar(datosHasta),
    habitual: await atrasoHabitual(cid),
  };
}

/** Frase corta y sin alarma para explicar el atraso donde haga falta. */
export function fraseAtraso(r: Retraso): string | null {
  if (!r.datosHasta || r.dias <= 0) return null;
  const f = new Date(r.datosHasta + 'T12:00:00Z')
    .toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
  return r.dias === 1
    ? `Los datos llegan hasta el ${f}: el día de ayer todavía no lo publican.`
    : `Los datos llegan hasta el ${f}. La distribuidora publica con ${r.dias} días de atraso, así que los últimos ${r.dias} días aparecen vacíos hasta que los suba.`;
}
