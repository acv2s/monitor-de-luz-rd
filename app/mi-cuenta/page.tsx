import { cookies } from 'next/headers';
import { ensureSchema, sql } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratoDeUsuario } from '@/lib/contracts';
import { DISTRIBUIDORAS } from '@/lib/utilities';
import { codigoDeEnlace } from '@/lib/telegram-link';
import { botUsername } from '@/lib/telegram';
import { EnlaceCopiable } from '../config/copiar';
import { ContratoForm } from './contrato-form';

export const dynamic = 'force-dynamic';

/** Cada persona configura aquí su propia cuenta de luz y su meta. */
export default async function MiCuenta({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;
  const maestra = process.env.DASHBOARD_PASSWORD || '';
  const sesion = await leerCookie((await cookies()).get(COOKIE)?.value, maestra);

  let contrato = null;
  let dueno: string | null = null;
  let dbError: string | null = null;
  let codigo: string | null = null;
  let bot: string | null = null;
  let tieneDatos = false;
  try {
    await ensureSchema();
    if (sesion) contrato = await contratoDeUsuario(sesion.uid);
    if (sesion) {
      codigo = await codigoDeEnlace(sesion.uid);
      bot = await botUsername();
    }
    if (contrato) {
      const [hay] = await sql()<{ n: number }[]>`
        SELECT count(*)::int AS n FROM teleconsumo_snapshots WHERE contract_id = ${contrato.id}`;
      tieneDatos = (hay?.n ?? 0) > 0;
    }
    if (contrato?.owner_id && sesion && sesion.uid !== contrato.owner_id) {
      const [u] = await sql()<{ nombre: string | null; email: string }[]>`
        SELECT nombre, email FROM users WHERE id = ${contrato.owner_id}`;
      dueno = u ? (u.nombre || u.email) : 'otra persona';
    }
  } catch (e: any) { dbError = e.message; }

  const puedeEditar = !!contrato && (sesion?.uid === 'maestro' ? contrato.owner_id === null : contrato.owner_id === sesion?.uid);

  return (
    <main>
      <header className="top">
        <h1><span className="brand-dot">⚡</span> Mi cuenta de luz</h1>
        <div className="actions">
          <a className="icon-btn solo" href="/" title="Volver al panel" aria-label="Volver">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </header>

      {q.ok && <section className="card"><div className="meta-now">Guardado. En la próxima corrida se leerán tus datos.</div></section>}
      {dbError && <section className="card"><pre className="log">{dbError}</pre></section>}

      {!contrato ? (
        <section className="card">
          <h2>Todavía no tienes una cuenta asociada</h2>
          <p className="desc">Pídele al administrador que te vuelva a invitar.</p>
        </section>
      ) : !puedeEditar ? (
        <section className="card">
          <h2><span className="g-ico">🤝</span> Cuenta compartida</h2>
          <p className="desc">
            Estás viendo la cuenta de <b>{dueno}</b>. Puedes ver el consumo, las gráficas y las facturas,
            pero solo esa persona puede cambiar las credenciales y la meta.
          </p>
          <a className="wz-next" href="/">Ver el consumo</a>
        </section>
      ) : (
        <ContratoForm
          contrato={contrato}
          distribuidoras={DISTRIBUIDORAS}
          primera={!tieneDatos}
          arrancarSolo={q.sync === '1'}
          verificado={contrato.verificado_at ? {
            ok: !!contrato.verificado_ok,
            cuando: new Date(contrato.verificado_at).toLocaleString('es-DO', {
              timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            }),
            error: contrato.verificado_error,
          } : null}
        />
      )}

      {contrato && (
        <section className="card">
          <h2><span className="g-ico">📦</span> Tus datos son tuyos</h2>
          <p className="desc">
            Descarga todo lo guardado de tu cuenta (consumo diario, mensual y facturas)
            en un archivo, cuando quieras.
          </p>
          <a className="wz-next" href="/api/exportar">Descargar mis datos</a>
        </section>
      )}

      {codigo && (
        <section className="card">
          <h2><span className="g-ico">💬</span> El bot de Telegram</h2>
          <p className="desc">
            Te avisa antes de que la factura se dispare y le puedes preguntar cómo vas.
            Ábrelo y mándale este código una sola vez para que sepa que eres tú.
          </p>
          <div className="tg-pasos">
            <div className="tg-paso">
              <span className="tg-num">1</span>
              {bot
                ? <a className="btn-tg" href={`https://t.me/${bot}?start=hola`} target="_blank" rel="noreferrer">
                    Abrir @{bot} en Telegram
                  </a>
                : <span className="mh-note">Quien administra la app todavía no ha conectado el bot.</span>}
            </div>
            <div className="tg-paso">
              <span className="tg-num">2</span>
              <div className="tg-codigo">
                <span className="mh-note">Mándale este código:</span>
                <EnlaceCopiable url={codigo} />
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
