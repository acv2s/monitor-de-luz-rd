'use client';

import { useState } from 'react';

export interface AltoDia {
  day: string;
  kwh: number;
  dow: string;
  pct: number;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fecha(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

/**
 * Días de consumo alto como tarjetas que se pueden tocar para ver el detalle.
 * El feedback ocurre al presionar (no al soltar), como pide la guía de diseño.
 */
export function DayCards({ dias, avg, precioKwh }: { dias: AltoDia[]; avg: number; precioKwh: number | null }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  if (!dias.length) return null;

  return (
    <div className="day-cards">
      {dias.map((d) => {
        const nivel = d.pct >= 50 ? 'crit' : 'warn';
        const exceso = d.kwh - avg;
        const open = abierto === d.day;
        return (
          <button
            key={d.day}
            className={`day-card ${nivel} ${open ? 'open' : ''}`}
            onClick={() => setAbierto(open ? null : d.day)}
            aria-expanded={open}
          >
            <span className="dc-head">
              <span className="dc-when">
                <b>{d.dow}</b>
                <span className="dc-date">{fecha(d.day)}</span>
              </span>
              <span className="dc-kwh">
                {d.kwh}<small> kWh</small>
              </span>
              <span className={`dc-pct ${nivel}`}>+{d.pct}%</span>
            </span>
            <span className="dc-bar">
              <i style={{ width: `${Math.min(100, (d.kwh / (avg * 2)) * 100)}%` }} />
            </span>
            {open && (
              <span className="dc-detail">
                {exceso.toFixed(1)} kWh por encima de tu promedio ({avg.toFixed(1)} kWh/día)
                {precioKwh ? ` · ese exceso costó ~RD$${(exceso * precioKwh).toFixed(0)}` : ''}.
                {d.pct >= 50 ? ' Día pico: aire encendido más horas, secadora o calentador.' : ' Día alto: revisa qué hiciste distinto.'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
