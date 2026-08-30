export const dynamic = 'force-dynamic';

/** Registro con código de invitación. */
export default async function Registro({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const q = await searchParams;
  return (
    <main className="auth">
      <form className="auth-card" method="post" action="/api/auth">
        <input type="hidden" name="accion" value="registrar" />
        <h1>Crear cuenta</h1>
        <p className="auth-sub">Necesitas un código de invitación de quien te compartió la app.</p>

        <ol className="pasos-guia">
          <li><b>Crea tu cuenta</b> aquí abajo (correo y contraseña, tuyos, para entrar a la app).</li>
          <li><b>Pon tu cuenta de luz</b>: tu meta y las credenciales de tu oficina virtual.</li>
          <li><b>Comprueba y trae tus datos</b> con un botón; a partir de ahí se actualiza solo.</li>
          <li><b>Enlaza el bot</b> de Telegram si quieres los avisos por chat.</li>
        </ol>

        {q.e === 'codigo' && <div className="meta-now warn">Ese código no existe o ya se usó.</div>}
        {q.e === 'vencido' && <div className="meta-now warn">Ese enlace ya venció. Pídele uno nuevo a quien te invitó.</div>}
        {q.e && q.e !== 'codigo' && <div className="meta-now warn">{q.e}</div>}

        <label className="cfg-row">
          <span className="cfg-l">Código de invitación</span>
          <input type="text" name="codigo" required defaultValue={q.codigo ?? ''} placeholder="Ej. K3M9PQ2X" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Tu nombre</span>
          <input type="text" name="nombre" autoComplete="name" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Correo</span>
          <input type="email" name="email" required autoComplete="username" />
        </label>
        <label className="cfg-row">
          <span className="cfg-l">Contraseña<small>Mínimo 8 caracteres.</small></span>
          <input type="password" name="password" required minLength={8} autoComplete="new-password" />
        </label>
        <button className="wz-next" type="submit">Crear cuenta</button>
        <p className="auth-pie">¿Ya tienes cuenta? <a href="/entrar">Entrar</a></p>
      </form>
    </main>
  );
}
