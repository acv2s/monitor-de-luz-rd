import { sql } from './db';

/**
 * La tarifa NO es un precio plano: es por tramos. En una factura real de
 * 652 kWh:
 *
 *   Cargo fijo                        RD$   126.81
 *   200 kWh × RD$ 5.97                RD$ 1,194.00
 *   100 kWh × RD$ 8.51                RD$   851.00
 *   352 kWh × RD$13.83                RD$ 4,868.16
 *                                     ---------------
 *                                     RD$ 7,039.97
 *
 * Promediar (7,039.97 ÷ 652 = RD$10.80/kWh) sirve para decir cuánto costó el
 * mes, pero NO para proyectar: el kWh siguiente no cuesta 10.80, cuesta
 * 13.83. Con el promedio, la proyección se queda corta justo cuando más
 * importa avisar.
 *
 * Y al pasar de 700 kWh desaparecen los tramos baratos: TODO el mes se cobra
 * a la tarifa alta. Por eso pasarse sale tan caro.
 */

export interface Tramo {
  /** kWh que cubre este tramo. El último es el resto del consumo. */
  kwh: number;
  precio: number;
}

export interface Tarifa {
  /** Tramos en orden, del más barato al más caro. */
  tramos: Tramo[];
  /** Precio de cada kWh por encima del último tramo con tamaño fijo. */
  precioMarginal: number;
  cargoFijo: number;
  /** Al pasar este consumo, todo el mes va a `precioAlto`. */
  umbral: number;
  /** Precio único cuando se pasa el umbral, si alguna factura lo mostró. */
  precioAlto: number | null;
  /** De qué factura salieron estos precios. */
  desde: string | null;
  /** true si son los precios de referencia, no los de las facturas de esta cuenta. */
  estimada?: boolean;
}

/** El salto de tarifa está a los 700 kWh, independiente de la meta. */
export const UMBRAL_TARIFA = 700;

/**
 * Tarifa de referencia, tomada de una factura real de 2026 (652 kWh, 30 días).
 * Sirve para dar montos aproximados desde el primer día, mientras se leen las
 * facturas de la cuenta. En cuanto haya una factura propia, esta se descarta:
 * el cargo fijo depende de los días del ciclo y los precios cambian.
 */
export const TARIFA_POR_DEFECTO: Tarifa = {
  tramos: [
    { kwh: 200, precio: 5.97 },
    { kwh: 100, precio: 8.51 },
    { kwh: 400, precio: 13.83 },
  ],
  precioMarginal: 13.83,
  cargoFijo: 126.81,
  umbral: UMBRAL_TARIFA,
  precioAlto: 14.04,
  desde: null,
  estimada: true,
};

/** Lee la tarifa real de la última factura de esa cuenta. */
export async function tarifaDe(cid: number | null): Promise<Tarifa | null> {
  try {
    const filas = await sql()<any[]>`
      SELECT to_char(fecha_emision,'YYYY-MM-DD') AS mes, tramos,
             cargo_fijo::float AS cargo, consumo_kwh
      FROM invoices
      WHERE parsed_ok AND tramos IS NOT NULL AND (${cid}::bigint IS NULL OR contract_id = ${cid})
      ORDER BY fecha_emision DESC LIMIT 6`;
    const conTramos = filas.filter((f) => Array.isArray(f.tramos) && f.tramos.length);
    // Sin facturas propias todavía: se usan los precios de referencia para no
    // dejar a la persona sin montos en su primer mes.
    if (!conTramos.length) return TARIFA_POR_DEFECTO;

    // La más reciente que tenga varios tramos: una de más de 700 kWh trae uno
    // solo (todo a tarifa alta) y no sirve para saber los tramos baratos.
    const base = conTramos.find((f) => f.tramos.length > 1) ?? conTramos[0];
    const tramos: Tramo[] = base.tramos.map((t: any) => ({ kwh: Number(t.kwh) || 0, precio: Number(t.precio) || 0 }));

    // Una factura que pasó el umbral enseña el precio único de la tarifa alta.
    const alta = conTramos.find((f) => (f.consumo_kwh ?? 0) >= UMBRAL_TARIFA && f.tramos.length === 1);

    return {
      tramos,
      precioMarginal: tramos[tramos.length - 1]?.precio ?? 0,
      cargoFijo: Number(base.cargo) || 0,
      umbral: UMBRAL_TARIFA,
      precioAlto: alta ? Number(alta.tramos[0].precio) || null : null,
      desde: base.mes ?? null,
    };
  } catch (e: any) {
    console.error('[tarifa] no se pudo leer:', e.message);
    return TARIFA_POR_DEFECTO;
  }
}

/**
 * Lo que costaría un mes de `kwh`, aplicando los tramos en orden. Los tramos
 * intermedios tienen tamaño fijo; lo que pase del último se cobra al precio
 * marginal.
 */
export function costoDe(kwh: number, t: Tarifa): number {
  if (kwh <= 0) return t.cargoFijo;

  // Pasando el umbral se pierden los tramos baratos: todo al precio alto.
  if (kwh >= t.umbral && t.precioAlto) return t.cargoFijo + kwh * t.precioAlto;

  let restante = kwh;
  let total = t.cargoFijo;
  // Todos menos el último tramo tienen tamaño fijo; el último es el resto.
  for (let i = 0; i < t.tramos.length - 1 && restante > 0; i++) {
    const cubre = Math.min(restante, t.tramos[i].kwh);
    total += cubre * t.tramos[i].precio;
    restante -= cubre;
  }
  if (restante > 0) total += restante * t.precioMarginal;
  return total;
}

/** Lo que cuesta cada kWh adicional a partir de ese consumo. */
export function precioSiguienteKwh(kwh: number, t: Tarifa): number {
  if (kwh + 1 >= t.umbral && t.precioAlto) return t.precioAlto;
  let acumulado = 0;
  for (let i = 0; i < t.tramos.length - 1; i++) {
    acumulado += t.tramos[i].kwh;
    if (kwh < acumulado) return t.tramos[i].precio;
  }
  return t.precioMarginal;
}

/** Cuántos kWh caben todavía sin pasar de un presupuesto en RD$. */
export function kwhPorPresupuesto(rd: number, t: Tarifa): number {
  if (rd <= t.cargoFijo) return 0;
  let kwh = 0;
  // Se avanza kWh a kWh: son cientos de pasos, nada costoso, y evita
  // equivocarse con el salto de tarifa.
  while (kwh < 5000 && costoDe(kwh + 1, t) <= rd) kwh++;
  return kwh;
}

export interface LineaDesglose {
  /** Ej. "200 kWh × RD$5.97" o "Cargo fijo". */
  etiqueta: string;
  importe: number;
}

/**
 * De dónde sale el total: las mismas líneas que trae la factura. Es lo que
 * se enseña debajo del número grande, para que se vea que no es un invento.
 */
export function desgloseDe(kwh: number, t: Tarifa): LineaDesglose[] {
  const rd = (n: number) => 'RD$' + n.toFixed(2);
  const lineas: LineaDesglose[] = [{ etiqueta: 'Cargo fijo', importe: t.cargoFijo }];
  if (kwh <= 0) return lineas;

  if (kwh >= t.umbral && t.precioAlto) {
    lineas.push({ etiqueta: `${kwh} kWh × ${rd(t.precioAlto)} (tarifa alta: pasaste los ${t.umbral})`, importe: kwh * t.precioAlto });
    return lineas;
  }
  let restante = kwh;
  for (let i = 0; i < t.tramos.length - 1 && restante > 0; i++) {
    const cubre = Math.min(restante, t.tramos[i].kwh);
    lineas.push({ etiqueta: `${cubre} kWh × ${rd(t.tramos[i].precio)}`, importe: cubre * t.tramos[i].precio });
    restante -= cubre;
  }
  if (restante > 0) {
    lineas.push({ etiqueta: `${restante} kWh × ${rd(t.precioMarginal)}`, importe: restante * t.precioMarginal });
  }
  return lineas;
}
