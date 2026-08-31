'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Contrato {
  id: number; nombre: string | null; utility: string; email: string | null;
  password: string | null; nic: string | null; goal_mode: string;
  budget_rd: number | null; kwh_threshold: number;
}

interface Props {
  contrato: Contrato;
  distribuidoras: { id: string; nombre: string; soportada: boolean; nota?: string }[];
  /** true mientras no se le haya leído nada a esta cuenta. */
  primera: boolean;
  /** Cómo quedó la última comprobación del acceso, si ya hubo alguna. */
  verificado: { ok: boolean; cuando: string; error: string | null } | null;
}

type Paso = 'listo' | 'probando' | 'bajando' | 'ok' | 'error';

/**
 * Todo lo de la cuenta propia en una sola tarjeta: la meta, las credenciales
 * y la comprobación de que esas credenciales sirven. Estaban en tarjetas
 * distintas y no se entendía que una cosa dependía de la otra.
 */
export function ContratoForm({ contrato, distribuidoras, primera, verificado }: Props) {
  const router = useRouter();
  const [util, setUtil] = useState(contrato.utility || 'edenorte');
  const [modo, setModo] = useState(contrato.goal_mode === 'kwh' ? 'kwh' : 'dinero');
  const [paso, setPaso] = useState<Paso>('listo');
  const [detalle, setDetalle] = useState<string | null>(null);
  const [nics, setNics] = useState<string[]>([]);
  const [detalles, setDetalles] = useState<string[]>([]);
  const elegida = distribuidoras.find((d) => d.id === util);
  const hayCredenciales = !!contrato.email && !!contrato.password;

  async function probar(): Promise<boolean> {
    setPaso('probando');
    setDetalle(null);
    try {
      const res = await fetch('/api/probar', { method: 'POST' });
      const j = await res.json();
      if (!j.ok) { setPaso('error'); setDetalle(j.error); return false; }
      setNics(j.nics ?? []);
      return true;
    } catch (e: any) {
      setPaso('error');
      setDetalle('Se cortó la conexión: ' + e.message);
      return false;
    }
  }

  async function comprobarYTraer() {
    if (!(await probar())) { router.refresh(); return; }
    setPaso('bajando');
    try {
      const res = await fetch('/api/sincronizar', { method: 'POST' });
      const j = await res.json();
      setDetalles(Array.isArray(j.log) ? j.log : []);
      if (j.ok) setPaso('ok');
      else { setPaso('error'); setDetalle(j.error || 'No se pudo leer tu consumo.'); }
    } catch (e: any) {
      setPaso('error');
      setDetalle('Se cortó la conexión: ' + e.message);
    }
    router.refresh();
  }

  const chip = paso === 'probando' ? { c: 'va', t: 'Entrando a tu oficina virtual…' }
    : paso === 'bajando' ? { c: 'va', t: 'Acceso correcto ✓ · trayendo tu consumo…' }
    : paso === 'ok' ? { c: 'si', t: 'Acceso correcto ✓ · datos al día' }
    : paso === 'error' ? { c: 'no', t: 'No pudimos entrar' }
    : verificado ? (verificado.ok
        ? { c: 'si', t: `Acceso comprobado ✓ · ${verificado.cuando}` }
        : { c: 'no', t: `Falló el acceso · ${verificado.cuando}` })
    : { c: 'gris', t: 'Acceso sin comprobar todavía' };

  const trabajando = paso === 'probando' || paso === 'bajando';
  const error = detalle ?? (paso === 'listo' && verificado && !verificado.ok ? verificado.error : null);

  return (
    <form method="post" action="/api/contrato" className="cfg-grid">
      <section className="card cfg-card wide">
        <h2><span className="g-ico">🎯</span> Tu meta</h2>
        <p className="desc">De aquí salen tus avisos, la proyección y los consejos.</p>
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
              <small>Pasando 700 kWh, la distribuidora cobra todo el mes a tarifa alta.</small></span>
            <input type="number" name="kwh_threshold" defaultValue={contrato.kwh_threshold ?? 700} />
          </label>
        )}
      </section>

      <section className="card cfg-card wide">
        <h2><span className="g-ico">⚡</span> Tu oficina virtual</h2>
        <p className="desc">Son las mismas credenciales con las que entras a ver tu factura. Solo se usan para leer tus datos.</p>

        <label className="cfg-row">
          <span className="cfg-l">Nombre de la cuenta<small>Para distinguirla, ej. “Casa”, “Apartamento”.</small></span>
          <input type="text" name="nombre" defaultValue={contrato.nombre ?? ''} placeholder="Mi casa" />
        </label>

        <span className="cfg-l">Tu distribuidora</span>
        <div className="pick tri">
          {distribuidoras.map((d) => (
            <button key={d.id} type="button" className={`pick-op ${util === d.id ? 'on' : ''}`} onClick={() => setUtil(d.id)}>
              <b>{d.nombre}</b><small>{d.soportada ? 'Probado ✓' : 'En preparación'}</small>
            </button>
          ))}
        </div>
        <input type="hidden" name="utility" value={util} />
        {elegida && !elegida.soportada && <div className="meta-now warn">{elegida.nota}</div>}

        <label className="cfg-row">
          <span className="cfg-l">Correo</span>
          <input type="text" name="email" defaultValue={contrato.email ?? ''} autoComplete="off" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Contraseña<small>Déjala vacía para no cambiar la que ya está guardada.</small></span>
          <input type="password" name="password" placeholder={contrato.password ? '••••••••' : 'Tu contraseña'} autoComplete="off" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">NIC<small>Opcional: si lo dejas vacío se detecta solo.</small></span>
          <input type="text" name="nic" defaultValue={contrato.nic ?? ''} autoComplete="off" />
        </label>

        <div className="cfg-actions"><button type="submit">Guardar mi cuenta</button></div>

        {/* La comprobación vive aquí, pegada a las credenciales que comprueba. */}
        <div className={`conexion ${primera && paso === 'listo' ? 'pendiente' : ''}`}>
          <div className={`estado-chip ${chip.c}`}><i /><span>{chip.t}</span></div>

          {!hayCredenciales ? (
            <p className="mh-note">Guarda tu correo y tu contraseña aquí arriba y podrás comprobar el acceso.</p>
          ) : (
            <>
              {paso === 'ok' && (
                <div className="meta-now">
                  Listo{nics.length ? `, leímos tu NIC ${nics.join(', ')}` : ''}. <a href="/">Ver mi consumo</a>
                </div>
              )}
              {!!detalles.length && (
                <details className="sub-plegable">
                  <summary>Qué se hizo ({detalles.length} pasos)</summary>
                  <pre className="log">{detalles.join('\n')}</pre>
                </details>
              )}
              {error && (
                <div className="meta-now warn">
                  {error}
                  <br /><small>Corrige el correo y la contraseña aquí arriba, guarda, y vuelve a probar.</small>
                </div>
              )}
              <div className="cfg-actions">
                <button type="button" className="wz-next" onClick={comprobarYTraer} disabled={trabajando}>
                  {paso === 'probando' ? 'Comprobando…'
                    : paso === 'bajando' ? 'Trayendo tus datos…'
                    : primera ? 'Comprobar y traer mis datos'
                    : 'Sincronizar ahora'}
                </button>
                <button type="button" className="link-btn" disabled={trabajando}
                  onClick={async () => { if (await probar()) setPaso('ok'); router.refresh(); }}>
                  Solo comprobar el acceso
                </button>
              </div>
              <small className="mh-note">
                {primera
                  ? 'Comprobamos que tus credenciales sirven y traemos tu consumo y tus facturas. Tarda hasta un minuto.'
                  : 'Se actualiza solo cada día; usa esto si cambiaste tu contraseña o quieres los datos de una vez.'}
              </small>
            </>
          )}
        </div>
      </section>
    </form>
  );
}
