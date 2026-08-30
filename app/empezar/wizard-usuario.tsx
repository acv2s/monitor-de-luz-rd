'use client';

import { useState } from 'react';

interface Contrato {
  id: number; nombre: string | null; utility: string; email: string | null;
  password: string | null; nic: string | null; goal_mode: string;
  budget_rd: number | null; kwh_threshold: number;
}

const PASOS = ['Meta', 'Distribuidora', 'Tu cuenta', 'Telegram'];

/**
 * Primeros pasos de alguien que acaba de crear su cuenta: su meta y las
 * credenciales de SU oficina virtual. Nada de claves de la app ni de tokens:
 * eso es del dueño.
 */
export function WizardUsuario({ contrato, distribuidoras, codigo, botUsuario }: {
  contrato: Contrato;
  distribuidoras: { id: string; nombre: string; soportada: boolean; nota?: string }[];
  codigo: string | null;
  botUsuario: string | null;
}) {
  const [i, setI] = useState(0);
  const [modo, setModo] = useState(contrato.goal_mode === 'kwh' ? 'kwh' : 'dinero');
  const [util, setUtil] = useState(contrato.utility || 'edenorte');
  const elegida = distribuidoras.find((d) => d.id === util);
  const ir = (n: number) => setI(Math.max(0, Math.min(PASOS.length - 1, n)));

  return (
    <form method="post" action="/api/contrato" className="wz">
      <div className="wz-steps">
        {PASOS.map((p, n) => (
          <span key={p} className={`wz-dot ${n === i ? 'on' : ''} ${n < i ? 'done' : ''}`} title={p} />
        ))}
      </div>

      {/* ---------- 1. Meta ---------- */}
      <section className={`wz-slide ${i === 0 ? 'show' : ''}`} hidden={i !== 0}>
        <h2>¿Qué quieres lograr?</h2>
        <p className="wz-sub">De aquí salen tus avisos, tu proyección y tus consejos.</p>
        <div className="pick">
          <button type="button" className={`pick-op ${modo === 'dinero' ? 'on' : ''}`} onClick={() => setModo('dinero')}>
            <b>💵 Pagar menos de…</b><small>Pones el monto y calculamos los kWh</small>
          </button>
          <button type="button" className={`pick-op ${modo === 'kwh' ? 'on' : ''}`} onClick={() => setModo('kwh')}>
            <b>⚡ No pasar de…</b><small>Pones el límite en kWh</small>
          </button>
        </div>
        <input type="hidden" name="goal_mode" value={modo} />
        {modo === 'dinero' ? (
          <label className="cfg-row">
            <span className="cfg-l">Quiero pagar menos de (RD$ al mes)</span>
            <input type="number" name="budget_rd" defaultValue={contrato.budget_rd ?? ''} placeholder="6000" />
          </label>
        ) : (
          <label className="cfg-row">
            <span className="cfg-l">No pasar de (kWh al mes)
              <small>Pasando 700 kWh te cobran todo el mes a tarifa alta.</small></span>
            <input type="number" name="kwh_threshold" defaultValue={contrato.kwh_threshold ?? 700} />
          </label>
        )}
      </section>

      {/* ---------- 2. Distribuidora ---------- */}
      <section className={`wz-slide ${i === 1 ? 'show' : ''}`} hidden={i !== 1}>
        <h2>¿Quién te da la luz?</h2>
        <p className="wz-sub">Es la empresa que te manda la factura cada mes.</p>
        <div className="pick tri">
          {distribuidoras.map((d) => (
            <button key={d.id} type="button" className={`pick-op ${util === d.id ? 'on' : ''}`} onClick={() => setUtil(d.id)}>
              <b>{d.nombre}</b><small>{d.soportada ? 'Probado ✓' : 'En preparación'}</small>
            </button>
          ))}
        </div>
        <input type="hidden" name="utility" value={util} />
        {elegida && !elegida.soportada && <div className="meta-now warn">{elegida.nota}</div>}
      </section>

      {/* ---------- 3. Credenciales ---------- */}
      <section className={`wz-slide ${i === 2 ? 'show' : ''}`} hidden={i !== 2}>
        <h2>Tu oficina virtual</h2>
        <p className="wz-sub">
          Las mismas credenciales con las que entras a ver tu factura. Solo se usan para
          leer tus datos: nadie más las ve, ni quien te invitó.
        </p>
        <label className="cfg-row">
          <span className="cfg-l">Nombre de la cuenta<small>Para distinguirla, ej. “Casa”, “Apartamento”.</small></span>
          <input type="text" name="nombre" defaultValue={contrato.nombre ?? ''} placeholder="Mi casa" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Correo de la oficina virtual</span>
          <input type="text" name="email" defaultValue={contrato.email ?? ''} autoComplete="off" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Contraseña de la oficina virtual</span>
          <input type="password" name="password" placeholder={contrato.password ? '••••••••' : 'Tu contraseña'} autoComplete="off" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">NIC<small>Opcional: si lo dejas vacío se detecta solo.</small></span>
          <input type="text" name="nic" defaultValue={contrato.nic ?? ''} autoComplete="off" />
        </label>
      </section>

      {/* ---------- 4. Telegram ---------- */}
      <section className={`wz-slide ${i === 3 ? 'show' : ''}`} hidden={i !== 3}>
        <h2>Recibe los avisos en Telegram</h2>
        {codigo ? (
          <>
            <p className="wz-sub">
              Abre el bot, mándale este código una sola vez y desde ahí te avisa a ti,
              con <b>tu</b> factura. Puedes hacerlo después desde “Mi cuenta”.
            </p>
            <div className="inv-code">{codigo}</div>
            {botUsuario && (
              <a className="link-btn" href={`https://t.me/${botUsuario}?start=hola`} target="_blank" rel="noreferrer">
                Abrir el bot en Telegram
              </a>
            )}
          </>
        ) : (
          <p className="wz-sub">Quien administra la app todavía no ha conectado el bot. Podrás hacerlo más adelante.</p>
        )}
      </section>

      <div className="wz-nav">
        {i > 0 ? <button type="button" className="wz-atras" onClick={() => ir(i - 1)}>Atrás</button> : <span />}
        {i < PASOS.length - 1 ? (
          <div className="wz-avanza">
            <button type="button" className="wz-next" onClick={() => ir(i + 1)}>Continuar</button>
          </div>
        ) : (
          <button type="submit" className="wz-next">Guardar y empezar</button>
        )}
      </div>
    </form>
  );
}
