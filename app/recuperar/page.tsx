export const dynamic = 'force-dynamic';

/**
 * «Olvidé mi contraseña». No hay correo saliente, así que se le avisa al
 * dueño, que le genera a la persona un enlace de un solo uso.
 */
export default async function Recuperar({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;

  if (q.pedido) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>Aviso enviado</h1>
          <p className="auth-sub">
            Ya le avisamos a quien administra la app. Te va a pasar un enlace para que pongas
            una contraseña nueva — escríbele por donde siempre para apurarlo.
          </p>
          <a className="wz-next" href="/entrar">Volver a entrar</a>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <form className="auth-card" method="post" action="/api/auth">
        <input type="hidden" name="accion" value="recuperar" />
        <h1>¿Olvidaste tu contraseña?</h1>
        <p className="auth-sub">
          Escribe tu correo y le avisamos al administrador para que te mande un enlace
          y puedas poner una nueva.
        </p>
        <label className="cfg-row">
          <span className="cfg-l">Tu correo</span>
          <input type="email" name="email" required autoComplete="username" placeholder="tu@correo.com" autoFocus />
        </label>
        <button className="wz-next" type="submit">Pedir ayuda para entrar</button>
        <p className="auth-pie">¿Ya te acordaste? <a href="/entrar">Entrar</a></p>
      </form>
    </main>
  );
}
