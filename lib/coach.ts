import type { Pricing } from './pricing';
import { estimateCost } from './pricing';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export interface CoachInput {
  threshold: number;
  /** Meta en pesos, si el usuario la puso así. */
  metaRd?: number | null;
  consumo: number;
  proy: number;
  avg: number;
  permitido: number;
  restantes: number;
  dias: { day: string; kwh: number }[];
  pricing: Pricing | null;
}

export interface Consejo {
  /** 'ok' vas bien · 'ojo' hay que apretar · 'alerta' te vas a pasar */
  nivel: 'ok' | 'ojo' | 'alerta';
  titulo: string;
  mensaje: string;
  acciones: string[];
}

const rd = (n: number) => 'RD$' + Math.round(n).toLocaleString('es-DO');

/**
 * El consejo que abre el panel: habla claro, va al grano y siempre dice
 * qué hacer hoy para no terminar pagando de más.
 */
export function buildConsejo(i: CoachInput): Consejo {
  const { consumo, proy, avg, permitido, restantes, dias, pricing, threshold: THRESHOLD, metaRd } = i;
  const acciones: string[] = [];

  // ¿Qué días se disparan? Ahí está el dinero.
  const altos = dias.filter((d) => avg > 0 && d.kwh >= avg * 1.35);
  const porDia = new Map<number, number>();
  for (const d of altos) {
    const dow = new Date(d.day + 'T00:00:00Z').getUTCDay();
    porDia.set(dow, (porDia.get(dow) || 0) + 1);
  }
  const repetido = [...porDia.entries()].sort((a, b) => b[1] - a[1])[0];

  const finde = dias.filter((d) => [0, 6].includes(new Date(d.day + 'T00:00:00Z').getUTCDay()));
  const semana = dias.filter((d) => ![0, 6].includes(new Date(d.day + 'T00:00:00Z').getUTCDay()));
  const fAvg = finde.length ? finde.reduce((a, b) => a + b.kwh, 0) / finde.length : 0;
  const sAvg = semana.length ? semana.reduce((a, b) => a + b.kwh, 0) / semana.length : 0;

  const recorte = avg > 0 ? Math.round((1 - permitido / avg) * 100) : 0;
  const sobrecosto = pricing ? estimateCost(proy, pricing) - estimateCost(Math.min(proy, THRESHOLD - 1), pricing) : 0;

  if (proy >= THRESHOLD) {
    acciones.push(`Bajar a <b>${permitido.toFixed(1)} kWh por día</b> (hoy el promedio es ${avg.toFixed(1)}): un ${recorte > 0 ? recorte : 0}% menos.`);
    acciones.push('El aire acondicionado es el mayor gasto: ponerlo en 24 °C y apagarlo al salir del cuarto. Cada grado son ~6% de consumo.');
    if (repetido && repetido[1] > 1) acciones.push(`Los <b>${DIAS[repetido[0]]}s</b> son los días que más se disparan: ahí está el mayor ahorro.`);
    else if (fAvg > sAvg * 1.15 && finde.length >= 2) acciones.push(`Los fines de semana el consumo sube ${Math.round((fAvg / sAvg - 1) * 100)}%. Ahí está el recorte más fácil.`);
    acciones.push('Juntar lavadora y plancha en un solo día, en vez de repartirlas toda la semana.');
    return {
      nivel: 'alerta',
      titulo: 'Atención: la factura va camino a subir',
      mensaje: `A este ritmo el mes cierra en <b>${proy} kWh</b>${pricing ? ` (${rd(estimateCost(proy, pricing))})` : ''} y se pasa de la meta${metaRd ? ` de ${rd(metaRd)}` : ` de ${THRESHOLD} kWh`}. Al pasarse no se paga solo el excedente: <b>toda la factura se cobra a la tarifa alta</b>${sobrecosto > 0 ? `, unos <b>${rd(sobrecosto)} de más</b>` : ''}. Quedan ${restantes} días para corregirlo.`,
      acciones,
    };
  }

  if (consumo >= THRESHOLD * 0.8) {
    acciones.push(`Mantener <b>${permitido.toFixed(1)} kWh por día</b> los ${restantes} días que faltan.`);
    acciones.push('El aire de noche es el que más suma sin notarse.');
    return {
      nivel: 'ojo',
      titulo: 'Vamos bien, pero hay que cuidarlo',
      mensaje: `Van <b>${consumo} kWh</b>${pricing ? ` (${rd(estimateCost(consumo, pricing))})` : ''}, el ${Math.round((consumo / THRESHOLD) * 100)}% de la meta${metaRd ? ` de ${rd(metaRd)}` : ''}. La proyección es de ${proy} kWh, dentro del margen — pero un par de días altos lo cambian.`,
      acciones,
    };
  }

  acciones.push(`Hay margen hasta <b>${permitido.toFixed(1)} kWh por día</b> y aun así se cierra por debajo del límite.`);
  if (altos.length) acciones.push(`Hay ${altos.length} día(s) por encima del promedio: se detallan más abajo.`);
  else acciones.push('El consumo va parejo, sin días disparados.');
  return {
    nivel: 'ok',
    titulo: 'Todo bajo control',
    mensaje: `Van <b>${consumo} kWh</b>${pricing ? ` (${rd(estimateCost(consumo, pricing))})` : ''} y la proyección cierra en ${proy} kWh${pricing ? ` ≈ ${rd(estimateCost(proy, pricing))}` : ''}, por debajo de la meta. Manteniendo el ritmo, la factura llega tranquila.`,
    acciones,
  };
}
