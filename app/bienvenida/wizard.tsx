'use client';

import { useState } from 'react';

interface Props {
  campos: Record<string, { valor: string }>;
  botUsuario: string | null;
  distribuidoras: { id: string; nombre: string; soportada: boolean; nota?: string }[];
}

const PASOS = ['Meta', 'Tu luz', 'Avisos', 'Telegram', 'Extras', 'Listo'];

/**
 * Asistente de primera vez: una decisión por pantalla, todo salteable.
 * Guarda todo junto al final en /api/settings.
 */
export function Wizard({ campos, botUsuario, distribuidoras }: Props) {
  const v = (k: string, d = '') => campos[k]?.valor || d;
  const [i, setI] = useState(0);
  const [modo, setModo] = useState(v('GOAL_MODE', 'dinero'));
  const [presupuesto, setPresupuesto] = useState(v('MONTHLY_BUDGET_RD'));
  const [kwh, setKwh] = useState(v('KWH_THRESHOLD', '700'));
  const [util, setUtil] = useState(v('UTILITY', 'edenorte'));
  const [correo, setCorreo] = useState(v('EDENORTE_EMAIL'));
  const [pass, setPass] = useState('');
  const [aviso, setAviso] = useState(Number(v('KWH_WARN_RATIO', '0.8')));
  const [pico, setPico] = useState(Number(v('DAILY_SPIKE_RATIO', '1.6')));
  const [tg, setTg] = useState(v('TELEGRAM_ENABLED') === 'true');
  const [token, setToken] = useState('');
  const [asis, setAsis] = useState(v('ASSISTANT_ENABLED') === 'true');
  const [voz, setVoz] = useState(v('VOICE_ENABLED') === 'true');

  const ir = (n: number) => setI(Math.max(0, Math.min(PASOS.length - 1, n)));
  const util0 = distribuidoras.find((d) => d.id === util);

  return (
    <form method="post" action="/api/settings" className="wz">
      <div className="wz-steps">
        {PASOS.map((p, n) => (
          <span key={p} className={`wz-dot ${n === i ? 'on' : ''} ${n < i ? 'done' : ''}`} title={p} />
        ))}
      </div>

      {/* ---------- 1. Meta ---------- */}
      <section className={`wz-slide ${i === 0 ? 'show' : ''}`} hidden={i !== 0}>
        <h2>¿Qué quieres lograr?</h2>
        <p className="wz-sub">Todo lo demás se ajusta a esta decisión.</p>
        <div className="pick">
          <button type="button" className={`pick-op ${modo === 'dinero' ? 'on' : ''}`} onClick={() => setModo('dinero')}>
            <b>💵 Pagar menos de…</b><small>Pones el monto y calculamos los kWh</small>
          </button>
          <button type="button" className={`pick-op ${modo === 'kwh' ? 'on' : ''}`} onClick={() => setModo('kwh')}>
            <b>⚡ No pasar de…</b><small>Pones el límite en kWh</small>
          </button>
        </div>
        {modo === 'dinero' ? (
          <label className="cfg-row">
            <span className="cfg-l">Quiero pagar menos de (RD$ al mes)</span>
            <input type="number" value={presupuesto} onChange={(e) => setPresupuesto(e.target.value)} placeholder="6000" autoFocus />
          </label>
        ) : (
          <label className="cfg-row">
            <span className="cfg-l">No pasar de (kWh al mes)</span>
            <input type="number" value={kwh} onChange={(e) => setKwh(e.target.value)} placeholder="700" autoFocus />
          </label>
        )}
      </section>

      {/* ---------- 2. Cuenta ---------- */}
      <section className={`wz-slide ${i === 1 ? 'show' : ''}`} hidden={i !== 1}>
        <h2>Tu cuenta de luz</h2>
        <p className="wz-sub">Es la misma con la que entras a la oficina virtual. Se guarda solo en tu base de datos.</p>
        <div className="pick tri">
          {distribuidoras.map((d) => (
            <button key={d.id} type="button" className={`pick-op ${util === d.id ? 'on' : ''}`} onClick={() => setUtil(d.id)}>
              <b>{d.nombre}</b><small>{d.soportada ? 'Probado ✓' : 'En preparación'}</small>
            </button>
          ))}
        </div>
        {util0 && !util0.soportada && <div className="meta-now warn">{util0.nota}</div>}
        <label className="cfg-row">
          <span className="cfg-l">Correo</span>
          <input type="text" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Contraseña</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="off"
            placeholder={campos.EDENORTE_PASSWORD?.valor || ''} />
        </label>
      </section>

      {/* ---------- 3. Avisos ---------- */}
      <section className={`wz-slide ${i === 2 ? 'show' : ''}`} hidden={i !== 2}>
        <h2>¿Cuándo te aviso?</h2>
        <p className="wz-sub">Mueve las barras hasta que se sienta bien. Puedes cambiarlo cuando quieras.</p>
        <div className="cfg-row slider">
          <span className="cfg-l">Avisarme cuando lleve consumido<small>Más temprano = más tiempo para corregir.</small></span>
          <div className="sl-wrap">
            <input type="range" min={0.5} max={0.95} step={0.05} value={aviso}
              onChange={(e) => setAviso(Number(e.target.value))}
              style={{ backgroundSize: `${((aviso - 0.5) / 0.45) * 100}% 100%` }} />
            <output className="sl-val">{Math.round(aviso * 100)}% de la meta</output>
          </div>
        </div>
        <div className="cfg-row slider">
          <span className="cfg-l">Avisarme si un día gasta más de<small>Comparado con tu promedio diario.</small></span>
          <div className="sl-wrap">
            <input type="range" min={1.2} max={2.5} step={0.1} value={pico}
              onChange={(e) => setPico(Number(e.target.value))}
              style={{ backgroundSize: `${((pico - 1.2) / 1.3) * 100}% 100%` }} />
            <output className="sl-val">{pico.toFixed(1)}× el promedio</output>
          </div>
        </div>
      </section>

      {/* ---------- 4. Telegram ---------- */}
      <section className={`wz-slide ${i === 3 ? 'show' : ''}`} hidden={i !== 3}>
        <h2>¿Por dónde quieres los avisos?</h2>
        <p className="wz-sub">Por ahora el monitor avisa por Telegram. Si no lo quieres ahora, sáltalo.</p>
        <label className="wz-toggle">
          <input type="checkbox" checked={tg} onChange={(e) => setTg(e.target.checked)} />
          <span className="sw-box" />
          <span><b>Avisarme por Telegram</b><small>Resumen diario, alarmas y conversación con el bot</small></span>
        </label>
        {tg && (
          <>
            <ol className="pasos mini">
              <li><span className="paso-n">1</span><div><b>Abre @BotFather en Telegram</b><small>Manda <code>/newbot</code>, ponle nombre y copia el token que te da.</small>
                <a className="cfg-link" href="https://t.me/BotFather" target="_blank" rel="noreferrer">Abrir @BotFather ↗</a></div></li>
              <li><span className="paso-n">2</span><div><b>Pega el token aquí</b></div></li>
              {botUsuario && <li><span className="paso-n">3</span><div><b>Escríbele a tu bot para activarlo</b>
                <a className="btn-tg" href={`https://t.me/${botUsuario}`} target="_blank" rel="noreferrer">Abrir @{botUsuario}</a></div></li>}
            </ol>
            <label className="cfg-row">
              <span className="cfg-l">Token del bot</span>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)}
                placeholder={campos.TELEGRAM_BOT_TOKEN?.valor || '123456:AA…'} autoComplete="off" />
            </label>
          </>
        )}
      </section>

      {/* ---------- 5. Extras ---------- */}
      <section className={`wz-slide ${i === 4 ? 'show' : ''}`} hidden={i !== 4}>
        <h2>¿Quieres algo más?</h2>
        <p className="wz-sub">Las dos son opcionales y necesitan una clave gratis. Puedes activarlas después.</p>
        <label className="wz-toggle">
          <input type="checkbox" checked={asis} onChange={(e) => setAsis(e.target.checked)} />
          <span className="sw-box" />
          <span><b>🤖 Asistente</b><small>Preguntarle al bot lo que sea: “¿cuánto voy a pagar?”, “¿por qué subí?”</small></span>
        </label>
        <label className="wz-toggle">
          <input type="checkbox" checked={voz} onChange={(e) => setVoz(e.target.checked)} />
          <span className="sw-box" />
          <span><b>🎙️ Notas de voz</b><small>Mandarle audios al bot y que te conteste</small></span>
        </label>
        {(asis || voz) && (
          <div className="meta-now">
            Perfecto. Al terminar te llevamos a la configuración para pegar las claves, con el enlace de dónde sacarlas.
          </div>
        )}
      </section>

      {/* ---------- 6. Listo ---------- */}
      <section className={`wz-slide ${i === 5 ? 'show' : ''}`} hidden={i !== 5}>
        <h2>Todo listo 🎉</h2>
        <p className="wz-sub">Al guardar queda configurado. El monitor corre solo todos los días a las 2:00 pm.</p>
        <ul className="wz-resumen">
          <li><b>Meta:</b> {modo === 'dinero' ? `pagar menos de RD$${presupuesto || '—'} al mes` : `no pasar de ${kwh} kWh`}</li>
          <li><b>Distribuidora:</b> {util0?.nombre}</li>
          <li><b>Aviso temprano:</b> al {Math.round(aviso * 100)}% · <b>día pico:</b> {pico.toFixed(1)}×</li>
          <li><b>Telegram:</b> {tg ? 'activado' : 'por ahora no'}</li>
          <li><b>Asistente:</b> {asis ? 'activado' : 'no'} · <b>Voz:</b> {voz ? 'activada' : 'no'}</li>
        </ul>
      </section>

      {/* valores que se envían */}
      <input type="hidden" name="GOAL_MODE" value={modo} />
      <input type="hidden" name="MONTHLY_BUDGET_RD" value={presupuesto} />
      <input type="hidden" name="KWH_THRESHOLD" value={kwh} />
      <input type="hidden" name="UTILITY" value={util} />
      <input type="hidden" name="EDENORTE_EMAIL" value={correo} />
      {pass && <input type="hidden" name="EDENORTE_PASSWORD" value={pass} />}
      <input type="hidden" name="KWH_WARN_RATIO" value={aviso} />
      <input type="hidden" name="DAILY_SPIKE_RATIO" value={pico} />
      <input type="hidden" name="TELEGRAM_ENABLED" value={String(tg)} />
      {token && <input type="hidden" name="TELEGRAM_BOT_TOKEN" value={token} />}
      <input type="hidden" name="ASSISTANT_ENABLED" value={String(asis)} />
      <input type="hidden" name="VOICE_ENABLED" value={String(voz)} />
      <input type="hidden" name="_volver" value="/config" />

      <div className="wz-nav">
        {i > 0 ? <button type="button" className="wz-atras" onClick={() => ir(i - 1)}>Atrás</button> : <span />}
        {i < PASOS.length - 1 ? (
          <div className="wz-avanza">
            <button type="button" className="link-btn" onClick={() => ir(i + 1)}>Saltar</button>
            <button type="button" className="wz-next" onClick={() => ir(i + 1)}>Continuar</button>
          </div>
        ) : (
          <button type="submit" className="wz-next">Guardar y empezar</button>
        )}
      </div>
    </form>
  );
}
