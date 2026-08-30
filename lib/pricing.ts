import { sql } from './db';

export interface Pricing {
  /** RD$ por kWh efectivo (facturado ÷ kWh, promedio de las últimas facturas leídas). */
  precioKwh: number;
  /** Precio efectivo de facturas que pasaron el umbral (todos los kWh a tarifa alta), si existe. */
  precioKwhAlto: number | null;
  muestras: number;
  /** Umbral vigente cuando se calcularon los precios. */
  umbral: number;
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
  if (!rows.length) return null;
  const precios = rows.map((r) => r.fact / r.consumo_kwh);
  // El salto de tarifa de Edenorte es a los 700 kWh, independiente de la meta.
  const threshold = 700;
  const altos = rows.filter((r) => r.consumo_kwh >= threshold).map((r) => r.fact / r.consumo_kwh);
  return {
    precioKwh: precios.reduce((a, b) => a + b, 0) / precios.length,
    precioKwhAlto: altos.length ? altos.reduce((a, b) => a + b, 0) / altos.length : null,
    muestras: rows.length,
    umbral: threshold,
  };
}

/** Estima el costo en RD$ de una cantidad de kWh, usando la tarifa alta si se pasa del umbral. */
export function estimateCost(kwh: number, p: Pricing): number {
  const precio = kwh >= p.umbral && p.precioKwhAlto ? p.precioKwhAlto : p.precioKwh;
  return kwh * precio;
}
