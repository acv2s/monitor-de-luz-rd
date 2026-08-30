export const dynamic = 'force-dynamic';

/**
 * Entrada. Acepta la cuenta de cada persona y, sin anunciarlo, la contraseña
 * del dueño cuando se deja el correo vacío: quien no la tiene no necesita
 * saber que existe.
 */
export default async function Entrar({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;
  return (
    <main className="auth">
      <form className="auth-card" method="post" action="/api/auth">
        <input type="hidden" name="accion" value="entrar" />
        <h1>⚡ Monitor de Luz</h1>
        <p className="auth-sub">Controla tu factura antes de que se dispare.</p>

        {q.nuevo && <div className="meta-now">Cuenta creada. Entra con tu correo y contraseña.</div>}
        {q.pendiente && <div className="meta-now warn">Tu contraseña está bien: lo que falta es que el dueño apruebe tu cuenta. Escríbele para que le dé el visto bueno.</div>}
        {q.cambiada && <div className="meta-now">Contraseña cambiada. Entra con la nueva.</div>}
        {q.e && <div className="meta-now warn">Ese correo o esa contraseña no coinciden. Si no te acuerdas, pide una nueva abajo.</div>}

        <label className="cfg-row">
          <span className="cfg-l">Correo</span>
          <input type="email" name="email" autoComplete="username" placeholder="tu@correo.com" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Contraseña</span>
          <input type="password" name="password" required autoComplete="current-password" autoFocus />
        </label>
        <button className="wz-next" type="submit">Entrar</button>
        <p className="auth-pie"><a href="/recuperar">¿Olvidaste tu contraseña?</a></p>
        <p className="auth-pie">¿Tienes un código de invitación? <a href="/registro">Crear cuenta</a></p>
      </form>
    </main>
  );
}
