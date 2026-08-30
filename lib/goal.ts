import { setting, settingNumber } from './settings';
import { getPricing, estimateCost } from './pricing';
import { kwhPorPresupuesto } from './tarifa';

export interface Meta {
  /** 'dinero' = la meta es pagar menos de X; 'kwh' = la meta es no pasar de X kWh. */
  modo: 'dinero' | 'kwh';
  /** Límite efectivo en kWh: el que se usa en TODOS los cálculos y avisos. */
  kwh: number;
  /** Meta en pesos (la configurada, o la estimada a partir del límite en kWh). */
  rd: number | null;
  /** Precio por kWh usado para convertir, si se pudo calcular con tus facturas. */
  precioKwh: number | null;
  /** true si la meta es en dinero pero aún no hay facturas para convertirla. */
  sinPrecio: boolean;
}

/**
 * La meta del sistema. Si está en modo dinero, el límite en kWh se calcula
 * con el precio real de tus facturas: así todos los avisos (proyección, día
 * pico, aviso temprano) trabajan para que la factura no pase de ese monto.
 */
export async function getMeta(cid: number | null = null): Promise<Meta> {
  const modo = (await setting('GOAL_MODE')) === 'dinero' ? 'dinero' : 'kwh';
  const kwhConfig = await settingNumber('KWH_THRESHOLD');
  const pricing = await getPricing(cid);
  const precioKwh = pricing?.precioKwh ?? null;

  if (modo === 'dinero') {
    const rd = await settingNumber('MONTHLY_BUDGET_RD');
    if (rd > 0 && precioKwh && precioKwh > 0) {
      // Con los tramos reales, cuántos kWh caben en ese presupuesto; dividir
      // por el promedio daba un límite demasiado alto, porque los últimos kWh
      // del mes cuestan bastante más que la media.
      const kwh = pricing?.tarifa ? kwhPorPresupuesto(rd, pricing.tarifa) : Math.round(rd / precioKwh);
      return { modo, kwh, rd, precioKwh, sinPrecio: false };
    }
    return { modo, kwh: kwhConfig, rd: rd > 0 ? rd : null, precioKwh, sinPrecio: true };
  }

  return {
    modo,
    kwh: kwhConfig,
    rd: pricing ? Math.round(estimateCost(kwhConfig, pricing)) : null,
    precioKwh,
    sinPrecio: false,
  };
}

/** Atajo: el límite en kWh que rige ahora mismo. */
export async function getThreshold(cid: number | null = null): Promise<number> {
  return (await getMeta(cid)).kwh;
}
