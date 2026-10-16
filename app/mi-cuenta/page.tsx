import { cookies } from 'next/headers';
import { ensureSchema, sql } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratoDeUsuario, contratosDeUsuario } from '@/lib/contracts';
import { CuentasSwitch } from '@/components/CuentasSwitch';
import { DISTRIBUIDORAS } from '@/lib/utilities';
import { codigoDeEnlace } from '@/lib/telegram-link';
import { botUsername } from '@/lib/telegram';
import { EnlaceCopiable } from '../config/copiar';
import { ContratoForm } from './contrato-form';
import { TopBar } from '@/components/TopBar';
import { tgLoginActivo } from '@/lib/tg-login';

export const dynamic = 'force-dynamic';

/** Cada persona configura aquí su propia cuenta de luz y su meta. */
export default async function MiCuenta({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;
  const maestra = process.env.DASHBOARD_PASSWORD || '';
  const sesion = await leerCookie((await cookies()).get(COOKIE)?.value, maestra);

  let contrato = null;
  let cuentas: Awaited<ReturnType<typeof contratosDeUsuario>> = [];
  let dueno: string | null = null;
  let dbError: string | null = null;
  let codigo: string | null = null;
  let bot: string | null = null;
  let tieneDatos = false;
  let tgActivo = false;
  try {
    await ensureSchema();
    if (sesion) {
      cuentas = await contratosDeUsuario(sesion.uid);
      contrato = await contratoDeUsuario(sesion.uid, Number((await cookies()).get('cuenta')?.value) || null);
    }
    if (sesion) {
      codigo = await codigoDeEnlace(sesion.uid);
      tgActivo = await tgLoginActivo(sesion.uid);
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
        <TopBar admin={!!sesion?.admin} actual="cuenta" />
      </header>

      <CuentasSwitch cuentas={cuentas} activa={contrato?.id ?? null} volver="/mi-cuenta" conNueva={!!sesion} />

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
          key={contrato.id}
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

      {contrato && puedeEditar && cuentas.filter((c) => (sesion?.uid === 'maestro' ? c.owner_id === null : c.owner_id === sesion?.uid)).length > 1 && (
        <section className="card">
          <h2><span className="g-ico">🗑️</span> Eliminar esta cuenta</h2>
          <p className="desc">
            Borra <b>{contrato.nombre || `la cuenta ${contrato.id}`}</b> con su consumo, sus facturas y sus
            PDF guardados. No se puede deshacer; tus demás cuentas no se tocan.
          </p>
          <form method="post" action="/api/cuenta">
            <input type="hidden" name="accion" value="eliminar" />
            <input type="hidden" name="id" value={contrato.id} />
            <button className="btn-danger" type="submit">Eliminar esta cuenta y sus datos</button>
          </form>
        </section>
      )}


      {sesion && (
        <section className="card" id="tg-login">
          <h2><span className="g-ico">🔑</span> Entrar desde Telegram</h2>
          {q.tg === 'on' && <div className="meta-now">Listo: ya puedes escribirle <b>panel</b> al bot y te manda el enlace para entrar.</div>}
          {q.tg === 'mal' && <div className="meta-now warn">Ese código no es válido o ya venció. Escríbele <b>panel</b> al bot para que te mande uno nuevo.</div>}
          {tgActivo ? (
            <>
              <p className="desc">
                Activo. Escríbele <b>panel</b> al bot y te manda un enlace que entra sin contraseña
                (sirve una sola vez y vence en 10 minutos).
              </p>
              {sesion.uid !== 'maestro' && (
                <form method="post" action="/api/tg-login">
                  <input type="hidden" name="accion" value="desactivar" />
                  <button className="btn-danger" type="submit">Desactivar</button>
                </form>
              )}
            </>
          ) : (
            <>
              <p className="desc">
                Entra al panel sin escribir la contraseña: le escribes <b>panel</b> al bot y te manda un enlace.
                Para activarlo, escríbele <b>panel</b> al bot ahora, y pon aquí el código de 6 cifras que te responda.
              </p>
              <form method="post" action="/api/tg-login" className="cfg">
                <label className="cfg-row">
                  <span className="cfg-l">Código que te mandó el bot</span>
                  <input type="text" name="codigo" inputMode="numeric" maxLength={6} placeholder="123456" autoComplete="one-time-code" />
                </label>
                <div className="cfg-actions"><button type="submit">Activar</button></div>
              </form>
            </>
          )}
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
