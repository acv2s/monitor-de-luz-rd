import { sql } from './db';
import { tarifaDe, costoDe, type Tarifa } from './tarifa';

export interface Pricing {
  /** RD$ por kWh efectivo (facturado ÷ kWh, promedio de las últimas facturas leídas). */
  precioKwh: number;
  /** Precio efectivo de facturas que pasaron el umbral (todos los kWh a tarifa alta), si existe. */
  precioKwhAlto: number | null;
  muestras: number;
  /** Umbral vigente cuando se calcularon los precios. */
  umbral: number;
  /**
   * La tarifa real por tramos, si se pudo leer de las facturas. Cuando está,
   * manda sobre los promedios: el kWh siguiente no cuesta el promedio.
   */
  tarifa: Tarifa | null;
}


/** Precio efectivo del kWh según las facturas reales ya leídas. */
export async function getPricing(cid: number | null = null): Promise<Pricing | null> {
  let rows: { consumo_kwh: number; fact: number }[] = [];
  try {
    // El precio sale de las facturas de ESA cuenta: la tarifa de otra persona
    // no tiene por qué salir en tus cálculos.
    rows = await sql()<{ consumo_kwh: number; fact: number }[]>`
      SELECT consumo_kwh, facturado_rd::float AS fact FROM invoices
      WHERE parsed_ok AND consumo_kwh > 0 AND facturado_rd > 0
        AND (${cid}::bigint IS NULL OR contract_id = ${cid})
      ORDER BY fecha_emision DESC LIMIT 6`;
  } catch (e: any) {
    console.error('[pricing] sin datos de facturas:', e.message);
    return null;
  }
  const tarifa = await tarifaDe(cid);
  if (!rows.length) return null;
  const precios = rows.map((r) => r.fact / r.consumo_kwh);
  // El salto de tarifa está a los 700 kWh, independiente de la meta.
  const threshold = 700;
  const altos = rows.filter((r) => r.consumo_kwh >= threshold).map((r) => r.fact / r.consumo_kwh);
  return {
    precioKwh: precios.reduce((a, b) => a + b, 0) / precios.length,
    precioKwhAlto: altos.length ? altos.reduce((a, b) => a + b, 0) / altos.length : null,
    muestras: rows.length,
    umbral: threshold,
    tarifa,
  };
}

/**
 * Costo en RD$ de una cantidad de kWh.
 *
 * Con la tarifa por tramos leída de las facturas, se calcula tramo a tramo:
 * es lo que de verdad cobran. Sin ella se cae al promedio efectivo, que
 * subestima la proyección porque el kWh siguiente siempre cuesta más que la
 * media del mes.
 */
export function estimateCost(kwh: number, p: Pricing): number {
  if (p.tarifa) return costoDe(kwh, p.tarifa);
  const precio = kwh >= p.umbral && p.precioKwhAlto ? p.precioKwhAlto : p.precioKwh;
  return kwh * precio;
}
