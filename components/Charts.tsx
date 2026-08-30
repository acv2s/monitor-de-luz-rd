'use client';

import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts';

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fmtDay(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(d)} ${MESES_CORTO[Number(m) - 1]}`;
}
function fmtDayFull(iso: string) {
  return `${DIAS_CORTO[new Date(iso + 'T00:00:00Z').getUTCDay()]} ${fmtDay(iso)}`;
}
function fmtMonth(iso: string) {
  const [y, m] = iso.split('-');
  return `${MESES_CORTO[Number(m) - 1]} ${y.slice(2)}`;
}

function TooltipBox({ active, payload, title, unit, rows }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="viz-tooltip">
      <div>{title(p)}</div>
      {rows ? rows(p) : <div><b>{payload[0].value}</b> {unit}{p.extra ? ` · ${p.extra}` : ''}</div>}
    </div>
  );
}

/** Barras diarias: los días "pico" (>1.5× promedio) en crítico, los altos (>1.2×) en aviso. */
export function DailyChart({ data, avg, permitido }: { data: { day: string; kwh: number }[]; avg: number; permitido?: number }) {
  if (!data.length) return <div className="empty">Todavía no hay días registrados en este ciclo.</div>;
  return (
    <div className="chart-box" style={{ width: '100%', height: 'clamp(200px, 34vw, 260px)' }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 14, right: 14, left: -12, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={38} />
          <Tooltip
            cursor={{ fill: 'var(--grid)' }}
            content={<TooltipBox
              title={(p: any) => fmtDayFull(p.day)}
              rows={(p: any) => (
                <>
                  <div><b>{p.kwh}</b> kWh {p.kwh >= avg * 1.5 ? '· ⚠ pico' : p.kwh >= avg * 1.2 ? '· alto' : ''}</div>
                  <div>{p.kwh >= avg ? `+${(p.kwh - avg).toFixed(1)}` : (p.kwh - avg).toFixed(1)} vs. promedio ({avg.toFixed(1)})</div>
                </>
              )}
            />}
          />
          <ReferenceLine y={avg} stroke="var(--text-2)" strokeDasharray="4 4" label={{ value: `prom ${avg.toFixed(1)}`, position: 'right', fontSize: 10, fill: 'var(--text-2)' }} />
          {permitido != null && permitido > 0 && (
            <ReferenceLine y={permitido} stroke="var(--good)" strokeDasharray="2 3" label={{ value: `meta ${permitido.toFixed(1)}`, position: 'left', fontSize: 10, fill: 'var(--good)' }} />
          )}
          <Bar dataKey="kwh" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.day} fill={d.kwh >= avg * 1.5 ? 'var(--critical)' : d.kwh >= avg * 1.2 ? 'var(--warning)' : 'var(--series-1)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface BudgetRow {
  day: string;
  acum: number | null;   // consumo acumulado real
  plan: number;          // camino ideal hacia el límite
  proy: number | null;   // proyección desde el último día real
}

/**
 * "Camino a los 700": acumulado real vs. ritmo ideal, con la proyección punteada.
 * Si la línea azul va por encima de la gris, vas más rápido de lo que aguanta el límite.
 */
export function BudgetChart({ data, threshold }: { data: BudgetRow[]; threshold: number }) {
  if (!data.length) return <div className="empty">Todavía no hay datos del ciclo.</div>;
  const last = [...data].reverse().find((d) => d.acum != null);
  const proyFinal = data[data.length - 1]?.proy;
  const overBudget = last && last.acum != null && last.acum > last.plan;
  return (
    <div className="chart-box" style={{ width: '100%', height: 'clamp(210px, 36vw, 280px)' }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 14, right: 14, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="acumFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={38} domain={[0, (max: number) => Math.max(max, threshold * 1.05)]} />
          <Tooltip
            cursor={{ stroke: 'var(--muted)', strokeDasharray: '2 2' }}
            content={<TooltipBox
              title={(p: any) => fmtDayFull(p.day)}
              rows={(p: any) => (
                <>
                  {p.acum != null && <div>acumulado: <b>{p.acum}</b> kWh</div>}
                  {p.acum == null && p.proy != null && <div>proyección: <b>{Math.round(p.proy)}</b> kWh</div>}
                  <div>ritmo ideal: {Math.round(p.plan)} kWh</div>
                </>
              )}
            />}
          />
          <ReferenceLine y={threshold} stroke="var(--critical)" strokeDasharray="4 4" label={{ value: `límite ${threshold}`, position: 'insideTopLeft', fontSize: 10.5, fill: 'var(--critical)' }} />
          <Line type="monotone" dataKey="plan" name="ritmo ideal" stroke="var(--muted)" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="proy" name="proyección" stroke={proyFinal != null && proyFinal >= threshold ? 'var(--critical)' : 'var(--warning)'} strokeDasharray="3 4" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="acum" name="consumo real" stroke={overBudget ? 'var(--warning)' : 'var(--series-1)'} strokeWidth={3} fill="url(#acumFill)" dot={false} isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="legend">
        <span><i style={{ background: overBudget ? 'var(--warning)' : 'var(--series-1)' }} /> consumo real acumulado</span>
        <span><i className="dash" style={{ borderColor: 'var(--muted)' }} /> ritmo ideal para no pasar el límite</span>
        <span><i className="dash" style={{ borderColor: proyFinal != null && proyFinal >= threshold ? 'var(--critical)' : 'var(--warning)' }} /> proyección al cierre</span>
      </div>
    </div>
  );
}

export function MonthlyChart({ data, threshold }: { data: { month: string; kwh: number; rd: number | null; source: string }[]; threshold: number }) {
  if (!data.length) return <div className="empty">Aún no hay facturas guardadas. Después de la primera corrida aparecerán aquí.</div>;
  const rows = data.map((d) => ({ ...d, extra: d.rd != null ? `RD$${d.rd.toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : d.source === 'pdf_history' ? 'histórico de la factura' : '' }));
  return (
    <div className="chart-box" style={{ width: '100%', height: 'clamp(210px, 36vw, 280px)' }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 22, right: 10, left: -12, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={38} />
          <Tooltip cursor={{ fill: 'var(--grid)' }} content={<TooltipBox title={(p: any) => fmtMonth(p.month)} unit="kWh" />} />
          <ReferenceLine y={threshold} stroke="var(--critical)" strokeDasharray="4 4" label={{ value: `límite ${threshold}`, position: 'insideTopLeft', fontSize: 10.5, fill: 'var(--critical)' }} />
          <Bar dataKey="kwh" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((d) => (
              <Cell key={d.month} fill={d.kwh >= threshold ? 'var(--critical)' : 'var(--series-1)'} fillOpacity={d.source === 'invoice' ? 1 : 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
