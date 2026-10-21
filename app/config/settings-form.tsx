import { settingsView } from '@/lib/settings';
import { getMeta } from '@/lib/goal';
import { fmtRD } from '@/lib/analysis';
import { AsistenteBody, VozBody, Seccion, Clave, Deslizador, type Campos } from './settings-client';
import { Icono } from '@/components/Icono';

/** Panel de configuración completo. Todo se llena aquí, sin tocar el hosting. */
export async function SettingsForm() {
  const estado = await settingsView();
  const campos: Campos = Object.fromEntries(estado.map((e) => [e.clave, e]));
  const meta = await getMeta();
  const on = (c: string) => (campos[c]?.valor || '') === 'true';

  return (
    <div className="cfg-grid">
      {/* La meta y la cuenta de luz viven en UN solo lugar: Mi cuenta.
          Tenerlas también aquí era un duplicado que confundía. */}
      <section className="card cfg-card wide">
        <h2><Icono e="⚡" /> Tu meta y tu cuenta de luz</h2>
        <p className="desc">
          {meta.modo === 'dinero' && meta.rd
            ? <>Meta actual: pagar menos de <b>{fmtRD(meta.rd)}</b> al mes ≈ <b>{meta.kwh} kWh</b>. </>
            : <>Meta actual: no pasar de <b>{meta.kwh} kWh</b>. </>}
          Se editan en un solo lugar, junto con tus credenciales y tus mensajes automáticos.
        </p>
        <a className="wz-next" href="/mi-cuenta">Ir a Mi cuenta</a>
      </section>

      <section className="card cfg-card">
        <h2><Icono e="🔔" /> Cuándo avisarte</h2>
        <p className="desc">Qué tan encima quieres que esté el monitor.</p>
        <form method="post" action="/api/settings" className="cfg">
          <Deslizador clave="KWH_WARN_RATIO" etiqueta="Avisarme cuando lleve consumido"
            ayuda="Mientras más bajo, más temprano te aviso y más tiempo tienes de corregir."
            min={0.5} max={0.95} paso={0.05} inicial={Number(campos.KWH_WARN_RATIO?.valor) || 0.8}
            formato="porcentaje" />
          <Deslizador clave="DAILY_SPIKE_RATIO" etiqueta="Avisarme si un día gasta más de"
            ayuda="Comparado con tu promedio diario. Más bajo = más estricto."
            min={1.2} max={2.5} paso={0.1} inicial={Number(campos.DAILY_SPIKE_RATIO?.valor) || 1.6}
            formato="multiplo" />
          <div className="cfg-actions"><button type="submit">Guardar</button></div>
        </form>
      </section>

      <Seccion icono="💬" titulo="Telegram" clave="TELEGRAM_ENABLED" inicial={on('TELEGRAM_ENABLED')}
        desc="El bot que te avisa y con el que puedes conversar.">
        <ol className="pasos mini">
          <li><span className="paso-n">1</span><div><b>Crea tu bot</b><small>Abre @BotFather, manda /newbot y copia el token que te da.</small>
            <a className="cfg-link" href="https://t.me/BotFather" target="_blank" rel="noreferrer">Abrir @BotFather ↗</a></div></li>
          <li><span className="paso-n">2</span><div><b>Pega el token aquí abajo y guarda</b></div></li>
        </ol>
        <Clave e={campos.TELEGRAM_BOT_TOKEN} etiqueta="Token del bot" />
        <Clave e={campos.CRON_SECRET} etiqueta="Clave del cron"
          ayuda="Un texto largo que inventes. Protege la corrida diaria y el webhook." />
        <label className="cfg-row">
          <span className="cfg-l">Dirección de la app
            <small>La que abren los botones del bot. Pon tu dominio público, no la URL larga de cada despliegue.</small></span>
          <input type="text" name="APP_URL" defaultValue={campos.APP_URL?.valor ?? ''}
            placeholder="https://tu-proyecto.vercel.app" />
        </label>
        <label className="cfg-row switch">
          <span className="cfg-l">Mandarme el resumen todos los días</span>
          <input type="hidden" name="DAILY_SUMMARY" value="false" />
          <input type="checkbox" name="DAILY_SUMMARY" value="true" defaultChecked={on('DAILY_SUMMARY')} />
        </label>
      </Seccion>

      <Seccion icono="🤖" titulo="Asistente" clave="ASSISTANT_ENABLED" inicial={on('ASSISTANT_ENABLED')}
        desc="Que el bot entienda preguntas libres y analice tus datos.">
        <AsistenteBody campos={campos} />
      </Seccion>

      <Seccion icono="🎙️" titulo="Notas de voz" clave="VOICE_ENABLED" inicial={on('VOICE_ENABLED')}
        desc="Mándale audios al bot; si quieres, te contesta hablando.">
        <VozBody campos={campos} />
      </Seccion>
    </div>
  );
}
