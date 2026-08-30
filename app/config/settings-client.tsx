'use client';

import { useState } from 'react';

export interface CampoEstado { clave: string; valor: string; desdeEnv: boolean; secreta: boolean }
export type Campos = Record<string, CampoEstado>;

const MODELOS: Record<string, { id: string; nombre: string; nota: string }[]> = {
  anthropic: [
    { id: 'claude-opus-5', nombre: 'Opus 5', nota: 'El más capaz' },
    { id: 'claude-sonnet-5', nombre: 'Sonnet 5', nota: 'Equilibrado · recomendado' },
    { id: 'claude-haiku-4-5', nombre: 'Haiku 4.5', nota: 'El más barato y rápido' },
  ],
  openai: [
    { id: 'gpt-4o', nombre: 'GPT-4o', nota: 'El completo' },
    { id: 'gpt-4o-mini', nombre: 'GPT-4o mini', nota: 'Más barato' },
  ],
  google: [
    { id: 'gemini-2.0-flash', nombre: 'Gemini 2.0 Flash', nota: 'Rápido, con capa gratis' },
    { id: 'gemini-1.5-pro', nombre: 'Gemini 1.5 Pro', nota: 'Más potente' },
  ],
};

const PROVEEDORES = [
  { id: 'anthropic', nombre: 'Claude', empresa: 'Anthropic', clave: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', nombre: 'ChatGPT', empresa: 'OpenAI', clave: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys' },
  { id: 'google', nombre: 'Gemini', empresa: 'Google', clave: 'GOOGLE_API_KEY', url: 'https://aistudio.google.com/apikey' },
];

function Externo({ texto, url }: { texto: string; url: string }) {
  return (
    <a className="cfg-link" href={url} target="_blank" rel="noreferrer">
      {texto}
      <svg viewBox="0 0 24 24" aria-hidden><path d="M8 16 16 8M9 8h7v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </a>
  );
}

export function Clave({ e, etiqueta, ayuda, enlace }: { e: CampoEstado; etiqueta: string; ayuda?: string; enlace?: { texto: string; url: string } }) {
  return (
    <label className="cfg-row">
      <span className="cfg-l">
        {etiqueta}
        {e.desdeEnv && <i className="dot-env" title="Ahora mismo viene de una variable de entorno" />}
        {ayuda && <small>{ayuda}</small>}
      </span>
      <input type="password" name={e.clave} defaultValue="" placeholder={e.valor || 'Pégala aquí'} autoComplete="off" />
      {enlace && <Externo {...enlace} />}
    </label>
  );
}

/**
 * Tarjeta con interruptor en la cabecera: mientras está apagada no ocupa
 * espacio con campos, y al encenderla se despliegan las opciones.
 */
export function Seccion({
  icono, titulo, desc, clave, inicial, children, ancho,
}: {
  icono: string; titulo: string; desc: string; clave: string; inicial: boolean;
  children: React.ReactNode; ancho?: boolean;
}) {
  const [on, setOn] = useState(inicial);
  return (
    <section className={`card cfg-card ${ancho ? 'wide' : ''} ${on ? '' : 'off'}`}>
      <form method="post" action="/api/settings" className="cfg">
        <div className="sec-head">
          <div className="sec-title">
            <h2><span className="g-ico">{icono}</span> {titulo}</h2>
            <p className="desc">{desc}</p>
          </div>
          <input type="hidden" name={clave} value="false" />
          <label className="sw" title={on ? 'Desactivar' : 'Activar'}>
            <input type="checkbox" name={clave} value="true" checked={on} onChange={(e) => setOn(e.target.checked)} />
            <span />
          </label>
        </div>
        {on ? <div className="sec-body">{children}</div> : <p className="sec-off">Desactivado. Enciende el interruptor para configurarlo.</p>}
        <div className="cfg-actions"><button type="submit">Guardar</button></div>
      </form>
    </section>
  );
}

/** Meta: se elige el tipo y solo aparece el campo que aplica. */
export function MetaForm({ campos, resumen }: { campos: Campos; resumen: React.ReactNode }) {
  const [modo, setModo] = useState(campos.GOAL_MODE?.valor === 'kwh' ? 'kwh' : 'dinero');
  return (
    <form method="post" action="/api/settings" className="cfg">
      {resumen}
      <div className="pick" role="radiogroup" aria-label="Tipo de meta">
        <button type="button" className={`pick-op ${modo === 'dinero' ? 'on' : ''}`} onClick={() => setModo('dinero')} role="radio" aria-checked={modo === 'dinero'}>
          <b>💵 Pagar menos de…</b>
          <small>Pones el monto en pesos y el sistema calcula los kWh</small>
        </button>
        <button type="button" className={`pick-op ${modo === 'kwh' ? 'on' : ''}`} onClick={() => setModo('kwh')} role="radio" aria-checked={modo === 'kwh'}>
          <b>⚡ No pasar de…</b>
          <small>Pones el límite directo en kWh</small>
        </button>
      </div>
      <input type="hidden" name="GOAL_MODE" value={modo} />
      {modo === 'dinero' ? (
        <label className="cfg-row">
          <span className="cfg-l">Quiero pagar menos de (RD$ al mes)
            <small>Ej. 6000. De aquí sale cuántos kWh al día puedes gastar.</small></span>
          <input type="number" step="any" name="MONTHLY_BUDGET_RD" defaultValue={campos.MONTHLY_BUDGET_RD?.valor ?? ''} placeholder="6000" />
        </label>
      ) : (
        <label className="cfg-row">
          <span className="cfg-l">No pasar de (kWh al mes)
            <small>Ojo: pasando 700 kWh, la distribuidora cobra todo el mes a tarifa alta.</small></span>
          <input type="number" step="any" name="KWH_THRESHOLD" defaultValue={campos.KWH_THRESHOLD?.valor ?? ''} placeholder="700" />
        </label>
      )}
      <div className="cfg-actions"><button type="submit">Guardar meta</button></div>
    </form>
  );
}

/** Distribuidora + credenciales de la oficina virtual. */
export function CuentaForm({ campos, distribuidoras }: {
  campos: Campos;
  distribuidoras: { id: string; nombre: string; soportada: boolean; nota?: string }[];
}) {
  const [util, setUtil] = useState(campos.UTILITY?.valor || 'edenorte');
  const elegida = distribuidoras.find((d) => d.id === util);
  return (
    <form method="post" action="/api/settings" className="cfg">
      <span className="cfg-l">Tu distribuidora</span>
      <div className="pick tri" role="radiogroup" aria-label="Distribuidora">
        {distribuidoras.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={util === d.id}
            className={`pick-op ${util === d.id ? 'on' : ''}`} onClick={() => setUtil(d.id)}>
            <b>{d.nombre}</b><small>{d.soportada ? 'Probado ✓' : 'En preparación'}</small>
          </button>
        ))}
      </div>
      <input type="hidden" name="UTILITY" value={util} />
      {elegida && !elegida.soportada && <div className="meta-now warn">{elegida.nota}</div>}

      <label className="cfg-row">
        <span className="cfg-l">Correo de la oficina virtual</span>
        <input type="text" name="EDENORTE_EMAIL" defaultValue={campos.EDENORTE_EMAIL?.valor ?? ''} autoComplete="off" />
      </label>
      <Clave e={campos.EDENORTE_PASSWORD} etiqueta="Contraseña" />
      <label className="cfg-row">
        <span className="cfg-l">NIC<small>Opcional: si lo dejas vacío se detecta solo.</small></span>
        <input type="text" name="EDENORTE_NIC" defaultValue={campos.EDENORTE_NIC?.valor ?? ''} autoComplete="off" />
      </label>
      <div className="cfg-actions"><button type="submit">Guardar cuenta</button></div>
    </form>
  );
}

/** Asistente: empresa, modelo y clave, todo visible. */
export function AsistenteBody({ campos }: { campos: Campos }) {
  const [prov, setProv] = useState(campos.ASSISTANT_PROVIDER?.valor || 'anthropic');
  const [modelo, setModelo] = useState(campos.ASSISTANT_MODEL?.valor || 'claude-sonnet-5');
  const lista = MODELOS[prov] ?? [];
  const p = PROVEEDORES.find((x) => x.id === prov)!;
  const claveEstado = campos[p.clave] ?? { clave: p.clave, valor: '', desdeEnv: false, secreta: true };

  return (
    <>
      <span className="cfg-l">Empresa</span>
      <div className="pick tri" role="radiogroup" aria-label="Proveedor">
        {PROVEEDORES.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={prov === o.id}
            className={`pick-op ${prov === o.id ? 'on' : ''}`}
            onClick={() => { setProv(o.id); setModelo(MODELOS[o.id]?.[o.id === 'anthropic' ? 1 : 0]?.id ?? ''); }}>
            <b>{o.nombre}</b><small>{o.empresa}</small>
          </button>
        ))}
      </div>
      <input type="hidden" name="ASSISTANT_PROVIDER" value={prov} />

      <span className="cfg-l">Modelo</span>
      <div className="pick col" role="radiogroup" aria-label="Modelo">
        {lista.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={modelo === m.id}
            className={`pick-op ${modelo === m.id ? 'on' : ''}`} onClick={() => setModelo(m.id)}>
            <b>{m.nombre}</b><small>{m.nota}</small>
          </button>
        ))}
        <label className={`pick-op otro ${!lista.some((m) => m.id === modelo) ? 'on' : ''}`}>
          <b>Otro</b>
          <input value={!lista.some((m) => m.id === modelo) ? modelo : ''} onChange={(ev) => setModelo(ev.target.value)}
            placeholder="Escribe el nombre del modelo" />
        </label>
      </div>
      <input type="hidden" name="ASSISTANT_MODEL" value={modelo} />

      <ol className="pasos mini">
        <li><span className="paso-n">1</span><div><b>Crea una cuenta en {p.empresa}</b><small>Es gratis abrirla; solo pagas por lo que uses (centavos al mes con este uso).</small><Externo texto={`Ir a ${p.empresa}`} url={p.url} /></div></li>
        <li><span className="paso-n">2</span><div><b>Genera una API key y pégala aquí abajo</b></div></li>
      </ol>
      <Clave e={claveEstado} etiqueta={`Clave de ${p.nombre}`} />
    </>
  );
}

/** Control deslizante con su valor en palabras (más claro que un número suelto). */
export function Deslizador({
  clave, etiqueta, ayuda, min, max, paso, inicial, formato,
}: {
  clave: string; etiqueta: string; ayuda?: string;
  min: number; max: number; paso: number; inicial: number;
  /** Cómo se lee el valor. Es un texto (no una función) para poder pasarlo
      desde un componente de servidor. */
  formato: 'porcentaje' | 'multiplo' | 'meses';
}) {
  const [v, setV] = useState(inicial);
  const texto = formato === 'porcentaje' ? `${Math.round(v * 100)}% de la meta`
    : formato === 'multiplo' ? `${v.toFixed(1)}× el promedio`
    : `${v} ${v === 1 ? 'mes' : 'meses'}`;
  const pct = ((v - min) / (max - min)) * 100;
  return (
    <div className="cfg-row slider">
      <span className="cfg-l">{etiqueta}{ayuda && <small>{ayuda}</small>}</span>
      <div className="sl-wrap">
        <input
          type="range" min={min} max={max} step={paso} value={v}
          onChange={(e) => setV(Number(e.target.value))}
          style={{ backgroundSize: `${pct}% 100%` }}
          aria-label={etiqueta}
        />
        <output className="sl-val">{texto}</output>
      </div>
      <input type="hidden" name={clave} value={v} />
    </div>
  );
}
