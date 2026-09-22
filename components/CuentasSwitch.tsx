/**
 * Selector de cuentas: quien tiene más de una (la casa, el negocio…) salta
 * de una a otra con un toque. Es un formulario normal: funciona sin JS.
 */
export function CuentasSwitch({ cuentas, activa, volver, conNueva = false }: {
  cuentas: { id: number; nombre: string | null; nic: string | null }[];
  activa: number | null;
  volver: string;
  conNueva?: boolean;
}) {
  if (cuentas.length < 2 && !conNueva) return null;
  return (
    <form method="post" action="/api/cuenta" className="pick cuentas-switch">
      <input type="hidden" name="volver" value={volver} />
      {cuentas.map((c) => (
        <button key={c.id} type="submit" name="id" value={c.id} className={`pick-op ${c.id === activa ? 'on' : ''}`}>
          <b>⚡ {c.nombre || `Cuenta ${c.id}`}</b>
          <small>{c.nic ? `NIC ${c.nic}` : 'sin credenciales todavía'}</small>
        </button>
      ))}
      {conNueva && (
        <button type="submit" name="accion" value="nueva" className="pick-op">
          <b>➕ Otra cuenta</b>
          <small>otro NIC, otra casa</small>
        </button>
      )}
    </form>
  );
}
