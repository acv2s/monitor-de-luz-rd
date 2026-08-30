import { ensureSchema } from '@/lib/db';
import { SettingsForm } from './settings-form';
import { TelegramCard } from './telegram-card';
import { PersonasCard } from './personas-card';
import { PublicacionCard } from './publicacion-card';
import { urlDeLaApp } from '@/lib/appurl';

export const dynamic = 'force-dynamic';

/**
 * Panel de configuración: quién recibe y puede hablar con el bot de Telegram.
 * Protegido por el middleware del dashboard (DASHBOARD_PASSWORD).
 */
export default async function ConfigPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;
  const appUrl = await urlDeLaApp();
  let dbError: string | null = null;
  try {
    await ensureSchema();
  } catch (e: any) {
    dbError = e.message;
  }

  return (
    <main>
      <header className="top">
        <div>
          <h1>Configuración</h1>
          <div className="sub">Todo se edita aquí, sin volver a desplegar</div>
        </div>
        <div className="actions">
          <a className="icon-btn solo" href="/" title="Volver al dashboard" aria-label="Volver al dashboard">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </header>

      {dbError && (
        <section className="card cfg-card wide">
          <h2><span className="g-ico">⚠️</span> No hay conexión con la base de datos</h2>
          <p className="desc">
            Sin base de datos no se puede guardar nada. Crea una (Storage → Neon en tu hosting) y
            asegúrate de que la variable <code>DATABASE_URL</code> esté puesta.
          </p>
          <pre className="log">{dbError}</pre>
        </section>
      )}

      <section className="card cfg-card wide primeros">
        <div className="sec-head">
          <div className="sec-title">
            <h2><span className="g-ico">🚀</span> Primeros pasos</h2>
            <p className="desc">¿Prefieres que te guiemos paso a paso en vez de llenar todo esto a mano?</p>
          </div>
          <a className="wz-next" href="/bienvenida">Empezar</a>
        </div>
      </section>

      <SettingsForm />

      <section className="card cfg-card wide">
        <h2><span className="g-ico">📦</span> Llevarte tu configuración</h2>
        <p className="desc">
          Descarga todo lo que llenaste aquí en un archivo y cárgalo en otra instalación
          (otra dirección, otra persona) para dejarla lista sin repetir nada.
        </p>
        <div className="exp">
          <div>
            <h3>Exportar</h3>
            <div className="exp-btns">
              <a className="btn-ghost" href="/api/settings/export">Sin claves</a>
              <a className="btn-ghost" href="/api/settings/export?secretos=1">Con claves</a>
            </div>
            <p className="mh-note">“Con claves” incluye contraseñas y API keys: guárdalo en un lugar seguro y no lo compartas.</p>
          </div>
          <div>
            <h3>Importar</h3>
            <form method="post" action="/api/settings/import" encType="multipart/form-data" className="exp-btns">
              <input type="file" name="archivo" accept="application/json,.json" required />
              <button type="submit">Cargar</button>
            </form>
            <p className="mh-note">Reemplaza los ajustes que vengan en el archivo. Los que no vengan se quedan como están.</p>
          </div>
        </div>
      </section>

      <TelegramCard appUrl={appUrl} />

      <PublicacionCard appUrl={appUrl} />
      <PersonasCard appUrl={appUrl} error={q.e} nuevo={q.nuevo} />

    </main>
  );
}
