import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratoDeUsuario } from '@/lib/contracts';
import { codigoDeEnlace } from '@/lib/telegram-link';
import { botUsername } from '@/lib/telegram';
import { DISTRIBUIDORAS } from '@/lib/utilities';
import { WizardUsuario } from './wizard-usuario';

export const dynamic = 'force-dynamic';

/** Primeros pasos de quien acaba de crear su cuenta. */
export default async function Empezar() {
  const maestra = process.env.DASHBOARD_PASSWORD || '';
  const sesion = await leerCookie((await cookies()).get(COOKIE)?.value, maestra);
  if (!sesion) redirect('/entrar');

  let contrato = null;
  let codigo: string | null = null;
  let bot: string | null = null;
  try {
    await ensureSchema();
    contrato = await contratoDeUsuario(sesion.uid);
    codigo = await codigoDeEnlace(sesion.uid);
    bot = await botUsername();
  } catch { /* sin base de datos: se sigue sin el paso de Telegram */ }

  // A quien le compartieron una cuenta no tiene nada que configurar.
  const propio = contrato && (sesion.uid === 'maestro' ? contrato.owner_id === null : contrato.owner_id === sesion.uid);
  if (!contrato || !propio) redirect('/');

  return (
    <main className="wz-main">
      <header className="wz-top">
        <h1>⚡ Monitor de Luz</h1>
        <a className="link-btn" href="/">Saltar por ahora</a>
      </header>
      <p className="wz-sub">Vamos a dejar lista tu cuenta de luz. Son cuatro pasos.</p>
      <WizardUsuario contrato={contrato} distribuidoras={DISTRIBUIDORAS} codigo={codigo} botUsuario={bot} />
    </main>
  );
}
