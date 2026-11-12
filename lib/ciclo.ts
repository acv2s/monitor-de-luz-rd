/**
 * Fecha de cierre del ciclo de un contrato. Cada contrato corta en su propio
 * día (uno el 12, otro el 15…). Si el dueño puso ese día, manda; si no, se
 * estima con lo que duraron sus últimas facturas (~30 días).
 */
export function cierreDelCiclo(cycleStart: string | null | undefined, diaCorte: number | null | undefined, duracion = 30): string | null {
  if (!cycleStart) return null;
  const ini = Date.parse(cycleStart + 'T00:00:00Z');
  if (diaCorte && diaCorte >= 1 && diaCorte <= 31) {
    // El primer día de corte que cae al menos 15 días después del inicio:
    // así nunca se toma el corte que dio comienzo a este mismo ciclo.
    const minimo = ini + 15 * 86400000;
    const d0 = new Date(ini);
    for (let m = 0; m < 3; m++) {
      const y = d0.getUTCFullYear();
      const mes = d0.getUTCMonth() + m;
      const ultimo = new Date(Date.UTC(y, mes + 1, 0)).getUTCDate();
      const f = Date.UTC(y, mes, Math.min(diaCorte, ultimo));
      if (f >= minimo) return new Date(f).toISOString().slice(0, 10);
    }
  }
  return new Date(ini + duracion * 86400000).toISOString().slice(0, 10);
}

/** Días que faltan desde hoy (RD) hasta el cierre; 0 si ya pasó. */
export function diasParaCierre(cierre: string | null, hoy = new Date()): number | null {
  if (!cierre) return null;
  const hoyRD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(hoy);
  return Math.max(0, Math.round((Date.parse(cierre) - Date.parse(hoyRD)) / 86400000));
}
