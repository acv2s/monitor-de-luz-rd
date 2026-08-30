import { sql } from '@/lib/db';
import { setting } from '@/lib/settings';

/** Averigua el @usuario del bot para poder enlazar directo al chat. */
async function botUsername(): Promise<string | null> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' });
    const j: any = await res.json();
    return j?.ok ? j.result?.username ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Todo lo de "quién puede usar el bot" en una sola tarjeta: el paso a paso,
 * el botón para abrir el chat y la lista de quién está dentro o esperando.
 */
export async function TelegramCard({ appUrl }: { appUrl: string }) {
  const usuario = await botUsername();
  const secret = await setting('CRON_SECRET');
  let personas: any[] = [];
  try {
    personas = await sql()<any[]>`
      SELECT chat_id, name, authorized, created_at FROM telegram_recipients ORDER BY authorized DESC, created_at`;
  } catch { /* la tabla se crea sola en la primera corrida */ }
  const dentro = personas.filter((p) => p.authorized);
  const esperando = personas.filter((p) => !p.authorized);
  const webhookUrl = usuario && secret
    ? `https://api.telegram.org/bot${'<TOKEN>'}/setWebhook?url=${appUrl}/api/telegram&secret_token=${secret}`
    : null;

  return (
    <section className="card cfg-card wide">
      <h2><span className="g-ico">👥</span> Quién puede usar el bot</h2>
      <p className="desc">
        Solo las personas autorizadas reciben los avisos y pueden conversar con el bot.
        Cualquiera que le escriba aparece aquí abajo esperando tu aprobación.
      </p>

      <ol className="pasos">
        <li>
          <span className="paso-n">1</span>
          <div>
            <b>Que la persona le escriba al bot</b>
            <small>Con este botón abre el chat directo y le da a “Empezar”. No hace falta buscar ningún número.</small>
            {usuario ? (
              <a className="btn-tg" href={`https://t.me/${usuario}`} target="_blank" rel="noreferrer">
                Abrir el chat con @{usuario}
              </a>
            ) : (
              <em className="paso-falta">Primero guarda el token del bot aquí arriba y recarga esta página.</em>
            )}
          </div>
        </li>
        <li>
          <span className="paso-n">2</span>
          <div>
            <b>Apruébala en la lista de abajo</b>
            <small>Al escribir, su nombre aparece en “Esperando aprobación”. Le das a Aprobar y el bot le avisa que ya puede usarlo.</small>
          </div>
        </li>
      </ol>

      <div className="gente">
        <div>
          <h3>Con acceso</h3>
          {!dentro.length ? <p className="mh-note">Todavía nadie.</p> : dentro.map((p) => (
            <div className="persona" key={p.chat_id}>
              <span><b>{p.name || 'Sin nombre'}</b><small>ID {p.chat_id}</small></span>
              <form method="post" action="/api/recipients">
                <input type="hidden" name="chat_id" value={p.chat_id} />
                <button name="action" value="revoke" className="btn-danger">Quitar</button>
              </form>
            </div>
          ))}
        </div>
        <div>
          <h3>Esperando aprobación</h3>
          {!esperando.length ? <p className="mh-note">Sin solicitudes.</p> : esperando.map((p) => (
            <div className="persona pend" key={p.chat_id}>
              <span><b>{p.name || 'Sin nombre'}</b><small>ID {p.chat_id}</small></span>
              <form method="post" action="/api/recipients" className="persona-acc">
                <input type="hidden" name="chat_id" value={p.chat_id} />
                <button name="action" value="approve" className="btn-ok">Aprobar</button>
                <button name="action" value="delete" className="link-btn">Descartar</button>
              </form>
            </div>
          ))}
        </div>
      </div>

      <details className="avanzado">
        <summary>¿No llega nada al bot? Registra el webhook</summary>
        <p className="mh-note">
          El bot necesita saber a dónde mandar los mensajes. Abre esta dirección una sola vez en el navegador,
          cambiando <code>&lt;TOKEN&gt;</code> por el token de tu bot. Debe responder <code>"Webhook was set"</code>.
        </p>
        {webhookUrl
          ? <pre className="log">{webhookUrl}</pre>
          : <p className="mh-note">Guarda primero el token del bot y la clave del cron.</p>}
      </details>
    </section>
  );
}
