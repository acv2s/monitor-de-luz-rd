import { ensureSchema } from '@/lib/db';
import { settingsView } from '@/lib/settings';
import { setting } from '@/lib/settings';
import { DISTRIBUIDORAS } from '@/lib/utilities';
import { Wizard } from './wizard';

export const dynamic = 'force-dynamic';

async function botUsername(): Promise<string | null> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' });
    const j: any = await r.json();
    return j?.ok ? j.result?.username ?? null : null;
  } catch { return null; }
}

/** Primeros pasos: una decisión por pantalla para dejar todo listo. */
export default async function Bienvenida() {
  let campos: Record<string, { valor: string }> = {};
  try {
    await ensureSchema();
    campos = Object.fromEntries((await settingsView()).map((e) => [e.clave, { valor: e.valor }]));
  } catch { /* sin base de datos todavía */ }
  const usuario = await botUsername();

  return (
    <main className="wz-main">
      <header className="wz-top">
        <h1>⚡ Monitor de Luz</h1>
        <a className="link-btn" href="/config">Configurar a mano</a>
      </header>
      <Wizard campos={campos} botUsuario={usuario} distribuidoras={DISTRIBUIDORAS} />
    </main>
  );
}
