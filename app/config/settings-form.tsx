import { settingsView } from '@/lib/settings';
import { getMeta } from '@/lib/goal';
import { fmtRD } from '@/lib/analysis';
import { DISTRIBUIDORAS } from '@/lib/utilities';
import { MetaForm, CuentaForm, AsistenteBody, Seccion, Clave, Deslizador, type Campos } from './settings-client';

/** Panel de configuración completo. Todo se llena aquí, sin tocar el hosting. */
export async function SettingsForm() {
  const estado = await settingsView();
  const campos: Campos = Object.fromEntries(estado.map((e) => [e.clave, e]));
  const meta = await getMeta();
  const on = (c: string) => (campos[c]?.valor || '') === 'true';

  return (
    <div className="cfg-grid">
      <section className="card cfg-card wide">
        <h2><span className="g-ico">🎯</span> Tu meta</h2>
        <p className="desc">El corazón del sistema: define qué quieres lograr y de ahí salen los avisos, la proyección y los consejos.</p>
        <MetaForm
          campos={campos}
          resumen={
            <div className={`meta-now ${meta.sinPrecio ? 'warn' : ''}`}>
              {meta.sinPrecio ? (
                <>Todavía no hay facturas leídas para convertir pesos a kWh. Mientras tanto se usa el límite de <b>{meta.kwh} kWh</b>.</>
              ) : meta.modo === 'dinero' ? (
                <>Meta actual: pagar menos de <b>{fmtRD(meta.rd ?? 0)}</b> al mes ≈ <b>{meta.kwh} kWh</b>, con tu kWh a {fmtRD(meta.precioKwh ?? 0)}.</>
              ) : (
                <>Meta actual: no pasar de <b>{meta.kwh} kWh</b>{meta.rd ? <> ≈ <b>{fmtRD(meta.rd)}</b> al mes</> : null}.</>
              )}
            </div>
          }
        />
      </section>

      <section className="card cfg-card">
        <h2><span className="g-ico">⚡</span> Tu cuenta de luz</h2>
        <p className="desc">Con esto se entra a tu oficina virtual a leer el consumo y las facturas.</p>
        <CuentaForm campos={campos} distribuidoras={DISTRIBUIDORAS} />
      </section>

      <section className="card cfg-card">
        <h2><span className="g-ico">🔔</span> Cuándo avisarte</h2>
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
          <Deslizador clave="PDF_RETENTION_MONTHS" etiqueta="Guardar el PDF de las facturas por"
            ayuda="Los datos leídos se guardan siempre; esto solo afecta el archivo PDF."
            min={1} max={24} paso={1} inicial={Number(campos.PDF_RETENTION_MONTHS?.valor) || 12}
            formato="meses" />
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
        desc="Mándale audios al bot y que te conteste hablando." ancho>
        <ol className="pasos mini">
          <li><span className="paso-n">1</span><div><b>Para que ENTIENDA tus audios</b>
            <small>Crea una cuenta gratis en Groq y pega su clave. Es lo único obligatorio.</small>
            <a className="cfg-link" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Crear clave en Groq ↗</a></div></li>
          <li><span className="paso-n">2</span><div><b>Para que te CONTESTE hablando (opcional)</b>
            <small>Enciende el interruptor de abajo y pon una clave de ElevenLabs (voz más natural) o de OpenAI.</small>
            <a className="cfg-link" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">Crear clave en ElevenLabs ↗</a></div></li>
        </ol>
        <Clave e={campos.GROQ_API_KEY} etiqueta="Clave de Groq" ayuda="Transcribe tus notas de voz." />
        <Clave e={campos.OPENAI_API_KEY} etiqueta="Clave de OpenAI"
          ayuda="Alternativa para transcribir y para la voz. También sirve si eliges ChatGPT como asistente." />
        <label className="cfg-row switch">
          <span className="cfg-l">Contestarme con nota de voz</span>
          <input type="hidden" name="VOICE_REPLIES" value="false" />
          <input type="checkbox" name="VOICE_REPLIES" value="true" defaultChecked={on('VOICE_REPLIES')} />
        </label>
        <Clave e={campos.ELEVENLABS_API_KEY} etiqueta="Clave de ElevenLabs" ayuda="Opcional: voz mucho más natural en español." />
        <label className="cfg-row">
          <span className="cfg-l">ID de la voz<small>Opcional. Se usa una por defecto si lo dejas vacío.</small></span>
          <input type="text" name="ELEVENLABS_VOICE_ID" defaultValue={campos.ELEVENLABS_VOICE_ID?.valor ?? ''} autoComplete="off" />
        </label>
      </Seccion>
    </div>
  );
}
