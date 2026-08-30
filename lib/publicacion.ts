import { sql } from './db';

/**
 * ¿A qué hora publica la distribuidora el consumo del día?
 *
 * No lo dice en ningún lado, así que se mide: cada vez que se mira el portal
 * se anota qué "datos disponibles hasta" traía. Cuando ese valor avanza, la
 * hora en que se vio por primera vez es un TECHO de la hora real de
 * publicación (pudo haber salido antes, entre dos miradas). Mientras más
 * seguido se mire, más fina la estimación.
 */

export interface Observacion {
  /** Día que se publicó (el nuevo "datos hasta"). */
  dia: string;
  /** Hora local (0-23) en que ya se veía publicado. */
  hora: number;
  /** Horas desde la mirada anterior: el margen de error de esta observación. */
  margen: number | null;
}

export interface Publicacion {
  observaciones: Observacion[];
  /** Hora más temprana en que se ha visto ya publicado. */
  masTemprano: number | null;
  /** Hora más tardía en que se vio aparecer. */
  masTarde: number | null;
  /** Hora sugerida para correr el monitor (local). */
  sugerida: number | null;
  /** Cuán fiable es: hacen falta varias observaciones y miradas frecuentes. */
  confianza: 'sin-datos' | 'baja' | 'media' | 'alta';
  /** Cuántas veces se ha mirado el portal en los últimos 14 días. */
  miradas: number;
}

const TZ = 'America/Santo_Domingo';

function horaLocal(iso: string | Date): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false });
  return Number(f.format(new Date(iso)));
}

/**
 * Analiza el historial de miradas al portal (sondas y lecturas completas) y
 * saca cuándo aparece el dato nuevo.
 */
export async function analizarPublicacion(cid: number | null): Promise<Publicacion> {
  const vacio: Publicacion = {
    observaciones: [], masTemprano: null, masTarde: null,
    sugerida: null, confianza: 'sin-datos', miradas: 0,
  };
  let filas: { at: string; datos_hasta: string | null }[] = [];
  try {
    filas = await sql()<{ at: string; datos_hasta: string | null }[]>`
      SELECT at, to_char(datos_hasta,'YYYY-MM-DD') AS datos_hasta FROM portal_probes
      WHERE datos_hasta IS NOT NULL AND (${cid}::bigint IS NULL OR contract_id = ${cid})
        AND at > now() - interval '30 days'
      UNION ALL
      SELECT captured_at AS at, to_char(datos_hasta,'YYYY-MM-DD') AS datos_hasta
      FROM teleconsumo_snapshots
      WHERE datos_hasta IS NOT NULL AND (${cid}::bigint IS NULL OR contract_id = ${cid})
        AND captured_at > now() - interval '30 days'
      ORDER BY at`;
  } catch {
    return vacio;
  }
  if (filas.length < 2) return { ...vacio, miradas: filas.length };

  // Cada vez que "datos hasta" avanza, se anota la hora en que ya se veía.
  const observaciones: Observacion[] = [];
  for (let i = 1; i < filas.length; i++) {
    const previo = filas[i - 1];
    const actual = filas[i];
    if (!actual.datos_hasta || actual.datos_hasta <= (previo.datos_hasta ?? '')) continue;
    const margen = (Date.parse(actual.at) - Date.parse(previo.at)) / 3600000;
    observaciones.push({
      dia: actual.datos_hasta,
      hora: horaLocal(actual.at),
      margen: Number.isFinite(margen) ? Math.round(margen * 10) / 10 : null,
    });
  }

  const hace14 = Date.now() - 14 * 86400000;
  const miradas = filas.filter((f) => Date.parse(f.at) > hace14).length;
  if (!observaciones.length) return { ...vacio, miradas };

  const horas = observaciones.map((o) => o.hora);
  const masTemprano = Math.min(...horas);
  const masTarde = Math.max(...horas);
  // Se corre una hora después de la más tardía vista, para no llegar antes.
  const sugerida = Math.min(23, masTarde + 1);

  // Con pocas observaciones, o con miradas muy espaciadas, esto es un tanteo.
  const margenMedio = observaciones
    .map((o) => o.margen ?? 24)
    .reduce((a, b) => a + b, 0) / observaciones.length;
  const confianza = observaciones.length >= 5 && margenMedio <= 3 ? 'alta'
    : observaciones.length >= 3 && margenMedio <= 8 ? 'media'
    : 'baja';

  return { observaciones: observaciones.slice(-10), masTemprano, masTarde, sugerida, confianza, miradas };
}

/** Anota qué se ve ahora mismo en el portal, sin guardar consumo. */
export async function anotarSonda(cid: number, datosHasta: string | null): Promise<void> {
  try {
    await sql()`INSERT INTO portal_probes (contract_id, datos_hasta) VALUES (${cid}, ${datosHasta})`;
  } catch { /* la sonda es informativa: si falla, no rompe la corrida */ }
}
