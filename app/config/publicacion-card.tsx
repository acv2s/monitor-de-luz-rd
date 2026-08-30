import { analizarPublicacion } from '@/lib/publicacion';
import { contratoDelDueno } from '@/lib/contracts';
import { setting } from '@/lib/settings';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function nombreDia(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

/**
 * Diagnóstico de a qué hora publica la distribuidora. No lo dice en ningún
 * lado: se mide mirando el portal y anotando cuándo aparece el día nuevo.
 */
export async function PublicacionCard({ appUrl }: { appUrl: string }) {
  let p = null;
  let secret = '';
  try {
    const mio = await contratoDelDueno();
    p = await analizarPublicacion(mio?.id ?? null);
    secret = await setting('CRON_SECRET');
  } catch { /* sin base de datos todavía */ }
  if (!p) return null;

  const etiqueta = { 'sin-datos': 'sin datos', baja: 'tanteo', media: 'razonable', alta: 'fiable' }[p.confianza];

  return (
    <section className="card cfg-card wide admin" id="publicacion">
      <div className="admin-tag">🔒 Solo tú · administrador</div>
      <h2><span className="g-ico">🕒</span> Cuándo publica la distribuidora</h2>
      <p className="desc">
        La oficina virtual sube el consumo con días de atraso y a una hora que no anuncia.
        Aquí se mide sola: cada vez que se mira el portal se anota qué día traía, y cuando
        avanza queda registrada la hora.
      </p>

      {p.confianza === 'sin-datos' ? (
        <div className="meta-now">
          Todavía no hay suficientes miradas al portal para decir nada. Con unos días de
          corridas empieza a salir el patrón.
        </div>
      ) : (
        <>
          <div className="resumen-fila">
            <span className="rf">
              <b>{p.masTemprano != null ? hh(p.masTemprano) : '—'}</b> lo más temprano visto
            </span>
            <span className="rf"><b>{p.masTarde != null ? hh(p.masTarde) : '—'}</b> lo más tarde</span>
            <span className={`rf ${p.confianza === 'alta' ? '' : 'pend'}`}><b>{etiqueta}</b></span>
          </div>

          {p.sugerida != null && (
            <div className="meta-now">
              Con lo visto, la corrida diaria debería ir a las <b>{hh(p.sugerida)}</b> (hora de
              Santo Domingo). Cámbiala en <code>vercel.json</code> y recuerda que ahí el cron
              va en UTC: <code>0 {(p.sugerida + 4) % 24} * * *</code>.
            </div>
          )}

          {!!p.observaciones.length && (
            <>
              <h3>Últimas veces que apareció un día nuevo</h3>
              <div className="inv-list">
                {p.observaciones.slice().reverse().map((o) => (
                  <div className="inv" key={o.dia}>
                    <div className="inv-info">
                      <b>{nombreDia(o.dia)}</b>
                      <small>
                        ya publicado a las {hh(o.hora)}
                        {o.margen != null && ` · no se miraba desde ${o.margen} h antes`}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <details className="sub-plegable">
        <summary>Afinar la medición</summary>
        <p className="mh-note">
          La hora que sale es un techo: el dato pudo publicarse antes, entre dos miradas.
          Para afinarla hay una sonda que solo mira el portal y anota, sin guardar consumo
          ni mandar avisos. Corriéndola cada hora, la estimación se cierra en un día o dos.
        </p>
        <p className="mh-note">
          Añade en <code>vercel.json</code> un cron a <code>/api/cron/sonda</code> con el
          horario que quieras (por ejemplo <code>0 * * * *</code> para cada hora), o ábrela a
          mano cuando quieras probar:
        </p>
        <code className="cfg-url">{appUrl}/api/cron/sonda?secret={secret ? '<tu CRON_SECRET>' : 'PONLO-EN-CONFIGURACIÓN'}</code>
        <p className="mh-note">
          Llevas <b>{p.miradas}</b> mirada{p.miradas === 1 ? '' : 's'} al portal en los últimos 14 días.
        </p>
      </details>
    </section>
  );
}
