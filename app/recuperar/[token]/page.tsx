import { ensureSchema } from '@/lib/db';
import { resetValido } from '@/lib/users';

export const dynamic = 'force-dynamic';

/** Enlace de un solo uso: aquí la persona pone su contraseña nueva. */
export default async function Restablecer({
  params, searchParams,
}: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string>> }) {
  const { token } = await params;
  const q = await searchParams;

  let reset = null;
  try {
    await ensureSchema();
    reset = await resetValido(token);
  } catch { /* sin base de datos se trata como enlace inválido */ }

  if (!reset) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>Ese enlace ya no sirve</h1>
          <p className="auth-sub">Los enlaces duran 24 horas y se usan una sola vez. Pide uno nuevo.</p>
          <a className="wz-next" href="/recuperar">Pedir otro enlace</a>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <form className="auth-card" method="post" action="/api/auth">
        <input type="hidden" name="accion" value="restablecer" />
        <input type="hidden" name="token" value={token} />
        <h1>Nueva contraseña</h1>
        <p className="auth-sub">Para la cuenta <b>{reset.email}</b>.</p>

        {q.e && <div className="meta-now warn">{q.e}</div>}

        <label className="cfg-row">
          <span className="cfg-l">Contraseña nueva<small>Mínimo 8 caracteres.</small></span>
          <input type="password" name="password" required minLength={8} autoComplete="new-password" autoFocus />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Repítela</span>
          <input type="password" name="password2" required minLength={8} autoComplete="new-password" />
        </label>
        <button className="wz-next" type="submit">Guardar y entrar</button>
      </form>
    </main>
  );
}
