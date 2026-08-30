'use client';

import { useState } from 'react';
import { DailyChart } from './Charts';

export interface MesHistorial {
  month: string;            // YYYY-MM-01
  kwh: number;              // facturado o del histórico de la factura
  source: string;
  rd: number | null;
  dias: { day: string; kwh: number }[];  // consumo diario guardado de ese mes
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const rd = (n: number) => 'RD$' + Math.round(n).toLocaleString('es-DO');

function etiqueta(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return `${MESES[m - 1]} ${y}`;
}

/**
 * Historial mes a mes: al tocar un mes se abre el detalle día por día
 * con los datos que el monitor ya tiene guardados.
 */
export function MonthHistory({ meses, threshold, precioKwh }: { meses: MesHistorial[]; threshold: number; precioKwh: number | null }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!meses.length) return <div className="empty">Aún no hay meses guardados.</div>;

  return (
    <div className="mh">
      {meses.map((m) => {
        const open = abierto === m.month;
        const over = m.kwh >= threshold;
        const pct = Math.min(100, Math.round((m.kwh / threshold) * 100));
        const dias = m.dias.filter((d) => d.kwh > 0);
        const avg = dias.length ? dias.reduce((a, b) => a + b.kwh, 0) / dias.length : 0;
        const pico = dias.length ? dias.reduce((a, b) => (b.kwh > a.kwh ? b : a)) : null;
        return (
          <div className={`mh-item ${open ? 'open' : ''}`} key={m.month}>
            <button className="mh-head" onClick={() => setAbierto(open ? null : m.month)} aria-expanded={open}>
              <span className="mh-name">
                {etiqueta(m.month)}
                {dias.length > 0 && <em>{dias.length} días registrados</em>}
              </span>
              <span className="mh-bar"><i className={over ? 'over' : ''} style={{ width: `${pct}%` }} /></span>
              <span className={`mh-kwh ${over ? 'over' : ''}`}>{m.kwh}<small> kWh</small></span>
              <span className="mh-caret" aria-hidden />
            </button>

            {open && (
              <div className="mh-body">
                <div className="mh-stats">
                  <div><b>{m.kwh} kWh</b><span>Total del mes</span></div>
                  {m.rd != null && <div><b>{rd(m.rd)}</b><span>Facturado</span></div>}
                  {!m.rd && precioKwh && <div><b>~{rd(m.kwh * precioKwh)}</b><span>Costo estimado</span></div>}
                  {avg > 0 && <div><b>{avg.toFixed(1)} kWh</b><span>Promedio diario</span></div>}
                  {pico && <div><b>{pico.kwh} kWh</b><span>Día más alto ({pico.day.slice(8)}/{pico.day.slice(5, 7)})</span></div>}
                </div>
                {dias.length >= 2 ? (
                  <DailyChart data={m.dias} avg={avg} />
                ) : (
                  <p className="mh-note">
                    De este mes solo se guardó el total: el registro día por día empieza desde que el monitor
                    entró en funcionamiento, así que los meses anteriores no tienen detalle diario.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
