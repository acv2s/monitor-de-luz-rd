import type React from "react";
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Si pones tu propia imagen en public/casa-energia.png, se usa esa. */
const CASA_PNG = existsSync(join(process.cwd(), 'public', 'casa-energia.png'))
  ? '/casa-energia.png'
  : existsSync(join(process.cwd(), 'public', 'casa-energia.jpg'))
    ? '/casa-energia.jpg'
    : null;

/** Piezas visuales del dashboard (SVG puro, se renderizan en el servidor). */

const STROKE = 14;
const R = 80;
const C = 2 * Math.PI * R;

/** Medidor circular estilo app de energía: consumo del ciclo vs. límite. */
export function Gauge({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div className="gauge">
      <svg viewBox="0 0 190 190">
        <circle cx="95" cy="95" r={R} fill="none" stroke="var(--grid)" strokeWidth={STROKE} />
        <circle
          cx="95" cy="95" r={R} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
        />
      </svg>
      <div className="center">
        <div className="big">{value}</div>
        <div className="unit">de {max} kWh</div>
        <div className="sub">{label}</div>
      </div>
    </div>
  );
}

const paths: Record<string, React.ReactElement> = {
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />,
  trend: <path d="M3 17l6-6 4 4 7-8m0 0h-5m5 0v5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  calendar: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 9.5h17M8 2.8v4M16 2.8v4" /></g>,
  target: <g fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></g>,
  home: <path d="M3.5 11 12 4l8.5 7M6 9.8V20h4.5v-5h3v5H18V9.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  peak: <path d="M4 20h16M5 20l4-9 3 5 3-8 4 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  bill: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 3.5h12v17l-2.5-1.5L13 20.5l-2.5-1.5L8 20.5l-2-1.5v-15z" /><path d="M9 8h6M9 12h6" /></g>,
  money: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M14.8 9.2c-.6-1-1.6-1.4-2.8-1.4-1.5 0-2.7.8-2.7 2.1 0 2.8 5.4 1.5 5.4 4.2 0 1.3-1.2 2.1-2.7 2.1-1.2 0-2.3-.5-2.9-1.5" /></g>,
  bell: <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9.5a6 6 0 0 1 12 0c0 5 1.8 6.5 1.8 6.5H4.2S6 14.5 6 9.5z" /><path d="M10 19.5a2.2 2.2 0 0 0 4 0" /></g>,
};

/** Casita de consumo eléctrico: ilustración principal del hero (SVG propio). */
export function House() {
  if (CASA_PNG) return <img className="house" src={CASA_PNG} alt="" width={330} height={176} />;
  return (
    <svg className="house" viewBox="0 0 220 190" aria-hidden>
      <defs>
        <linearGradient id="roofG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--series-1)" />
          <stop offset="100%" stopColor="#1b5cab" />
        </linearGradient>
        <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--surface)" />
          <stop offset="100%" stopColor="var(--chip-blue)" />
        </linearGradient>
        <linearGradient id="glowG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd867" />
          <stop offset="100%" stopColor="#f7a92d" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="176" rx="88" ry="10" fill="var(--chip-blue)" />
      <rect x="46" y="92" width="128" height="82" rx="8" fill="url(#wallG)" stroke="var(--border)" />
      <path d="M30 96 110 30l80 66" fill="none" stroke="url(#roofG)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="64" y="112" width="30" height="26" rx="5" fill="url(#glowG)" opacity=".95" />
      <rect x="126" y="112" width="30" height="26" rx="5" fill="url(#glowG)" opacity=".95" />
      <rect x="97" y="128" width="26" height="46" rx="5" fill="var(--series-1)" />
      <circle cx="117" cy="152" r="2.4" fill="#fff" />
      <g transform="translate(158 52)">
        <circle r="20" fill="var(--series-1)" />
        <path d="M3 -11-6 2h5l-2 9 9-13h-5l2-9z" fill="#fff" transform="translate(-1 1)" />
      </g>
      <path d="M46 150h-16M30 158h-10M190 142h14M174 150h22" stroke="var(--series-1)" strokeWidth="3" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

/** Ícono de línea dentro de un chip redondeado de color. */
export function Chip({ icon, tone }: { icon: keyof typeof paths; tone: 'blue' | 'green' | 'orange' | 'red' }) {
  return (
    <span className={`chip ${tone}`}>
      <svg viewBox="0 0 24 24" aria-hidden>{paths[icon]}</svg>
    </span>
  );
}
