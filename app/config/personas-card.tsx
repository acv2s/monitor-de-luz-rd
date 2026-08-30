import { sql, ensureSchema } from '@/lib/db';
import { listarUsuarios } from '@/lib/users';
import { contratosConMiembros } from '@/lib/contracts';
import { EnlaceCopiable } from './copiar';

/**
 * Zona de administrador. Todo lo de personas vive aquí: a quién invito, quién
 * espera aprobación, quién tiene cuenta y qué servicios de pago le cedo.
 * Está plegado por secciones porque de corrido era una pared de opciones.
 */
export async function PersonasCard({ appUrl, error, nuevo }: { appUrl: string; error?: string; nuevo?: string }) {
  const aviso = error === 'correo' ? 'Ese correo no se ve válido.'
    : error === 'repetido' ? 'Ya hay otra cuenta con ese correo.'
    : null;
  let usuarios: Awaited<ReturnType<typeof listarUsuarios>> = [];
  let invites: any[] = [];
  let contratos: Awaited<ReturnType<typeof contratosConMiembros>> = [];
  let resets: any[] = [];
  try {
    await ensureSchema();
    usuarios = await listarUsuarios();
    invites = await sql()<any[]>`SELECT * FROM invites ORDER BY created_at DESC`;
    contratos = await contratosConMiembros();
    resets = await sql()<any[]>`
      SELECT token, user_id FROM password_resets
      WHERE usado_at IS NULL AND expira_at > now()`;
  } catch { /* sin base de datos todavía */ }

  const pendientes = usuarios.filter((u) => !u.aprobado);
  const activos = usuarios.filter((u) => u.aprobado);
  const vencido = (i: any) => i.expira_at && new Date(i.expira_at) < new Date();
  const vivos = invites
    .filter((i) => !vencido(i) && i.usos < i.usos_max)
    .sort((a, b) => (a.code === nuevo ? -1 : b.code === nuevo ? 1 : 0));
  const gastados = invites.filter((i) => vencido(i) || i.usos >= i.usos_max);
  const mio = contratos.find((c) => c.owner_id === null);
  const fecha = (d: string) => new Date(d).toLocaleDateString('es-DO');

  return (
    <section className="card cfg-card wide admin" id="personas">
      <div className="admin-tag">🔒 Solo tú · administrador</div>
      <h2><span className="g-ico">👥</span> Personas con acceso</h2>
      {aviso && <div className="meta-now warn">{aviso}</div>}
      {nuevo && (
        <div className="meta-now">
          Enlace creado. Cópialo y pásaselo a quien invitas:
          <EnlaceCopiable url={`${appUrl}/registro?codigo=${nuevo}`} />
        </div>
      )}

      <div className="resumen-fila">
        <span className="rf"><b>{activos.length}</b> con cuenta</span>
        {!!pendientes.length && <span className="rf pend"><b>{pendientes.length}</b> por aprobar</span>}
        <span className="rf"><b>{vivos.length}</b> invitación{vivos.length === 1 ? '' : 'es'} activa{vivos.length === 1 ? '' : 's'}</span>
      </div>

      {/* ---------- Esperando aprobación: lo urgente, siempre a la vista ---------- */}
      {!!pendientes.length && (
        <div className="pers-bloque urgente">
          <h3>Esperando tu aprobación</h3>
          {pendientes.map((u) => (
            <form className="pers-fila" method="post" action="/api/usuarios" key={u.id}>
              <div className="pers-quien"><b>{u.nombre || 'Sin nombre'}</b><small>{u.email}</small></div>
              <input type="hidden" name="id" value={u.id} />
              <div className="pers-acc">
                <button className="btn-ok" name="accion" value="aprobar">Aprobar</button>
                <button className="btn-danger" name="accion" value="eliminar">Eliminar</button>
              </div>
            </form>
          ))}
        </div>
      )}

      {/* ---------- Quién tiene cuenta y qué puede usar ---------- */}
      <div className="pers-bloque">
        <h3>Con cuenta activa</h3>
        {!activos.length ? <p className="mh-note">Todavía nadie más tiene cuenta.</p> : (
          <>
            <div className="pers-cabecera"><span /><span title="Puede usar el asistente">🤖</span><span title="Puede usar las notas de voz">🎙️</span><span /></div>
            {activos.map((u) => (
              <div className="pers-item" key={u.id}>
                <form className="pers-fila" method="post" action="/api/usuarios">
                  <div className="pers-quien">
                    <b>{u.nombre || u.email}</b>
                    <small>
                      {u.email}
                      {u.last_login ? ` · entró ${fecha(u.last_login)}` : ' · nunca ha entrado'}
                      {u.reset_pedido_at && ' · pidió cambiar su clave'}
                    </small>
                  </div>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="puede_asistente" value="false" />
                  <input type="hidden" name="puede_voz" value="false" />
                  <label className="mini-sw" title="Puede usar el asistente">
                    <input type="checkbox" name="puede_asistente" value="true" defaultChecked={u.puede_asistente} />
                    <span>🤖</span>
                  </label>
                  <label className="mini-sw" title="Puede usar las notas de voz">
                    <input type="checkbox" name="puede_voz" value="true" defaultChecked={u.puede_voz} />
                    <span>🎙️</span>
                  </label>
                  <button className="btn-ok" name="accion" value="permisos">Guardar</button>
                </form>

                <details className="persona-mas">
                  <summary>Editar</summary>
                  <form method="post" action="/api/usuarios" className="cfg">
                    <input type="hidden" name="id" value={u.id} />
                    <div className="inv-cols">
                      <label className="cfg-row">
                        <span className="cfg-l">Nombre</span>
                        <input type="text" name="nombre" defaultValue={u.nombre ?? ''} />
                      </label>
                      <label className="cfg-row">
                        <span className="cfg-l">Correo</span>
                        <input type="email" name="email" defaultValue={u.email} required />
                      </label>
                    </div>
                    {/* formNoValidate: borrar o suspender no debe exigir un correo válido */}
                    <div className="pers-acc">
                      <button className="btn-ok" name="accion" value="editar">Guardar</button>
                      <button className="link-btn" name="accion" value="reset" formNoValidate>
                        {resets.some((r) => r.user_id === u.id) ? 'Otro enlace de clave' : 'Enlace de clave'}
                      </button>
                      <button className="link-btn" name="accion" value="suspender" formNoValidate>Suspender</button>
                      <button className="btn-danger" name="accion" value="eliminar" formNoValidate>Eliminar</button>
                    </div>
                  </form>
                  {resets.filter((r) => r.user_id === u.id).map((r) => (
                    <div key={r.token}>
                      <small className="mh-note">Enlace para que cambie su contraseña (24 horas, un solo uso):</small>
                      <EnlaceCopiable url={`${appUrl}/recuperar/${r.token}`} />
                    </div>
                  ))}
                </details>
              </div>
            ))}
            <small className="mh-note">🤖 asistente y 🎙️ notas de voz corren con <b>tus</b> claves: son gasto tuyo.</small>
          </>
        )}
      </div>

      {/* ---------- Invitar ---------- */}
      <details className="pers-bloque plegable" open={!activos.length && !pendientes.length}>
        <summary><h3>Invitar a alguien</h3></summary>
        <ol className="pasos-guia">
          <li>Creas el enlace y se lo pasas.</li>
          <li>Crea su cuenta con su correo y su contraseña.</li>
          <li>Pone su propia cuenta de luz. Tú nunca ves su consumo ni su contraseña.</li>
        </ol>
        <form method="post" action="/api/usuarios" className="cfg inv-form">
          <input type="hidden" name="accion" value="invitar" />
          <label className="cfg-row">
            <span className="cfg-l">¿Para quién es?<small>Solo para que tú lo recuerdes.</small></span>
            <input type="text" name="nota" placeholder="Ej. mi hermano Luis" />
          </label>
          <div className="inv-sw">
            <label className="cfg-row switch">
              <span className="cfg-l">Entra sin que yo apruebe</span>
              <input type="hidden" name="auto_aprobar" value="false" />
              <input type="checkbox" name="auto_aprobar" value="true" defaultChecked />
            </label>
            {mio && (
              <label className="cfg-row switch">
                <span className="cfg-l">Que vea <b>mi</b> cuenta de luz
                  <small>Para la familia: ve tu consumo sin poner credenciales. Si lo dejas apagado, pone la suya.</small></span>
                <input type="checkbox" name="contrato_compartido" value={mio.id} />
              </label>
            )}
            <label className="cfg-row switch">
              <span className="cfg-l">🤖 Asistente<small>💳 gasta tu clave de IA</small></span>
              <input type="hidden" name="da_asistente" value="false" />
              <input type="checkbox" name="da_asistente" value="true" />
            </label>
            <label className="cfg-row switch">
              <span className="cfg-l">🎙️ Notas de voz<small>💳 gasta tus claves de voz</small></span>
              <input type="hidden" name="da_voz" value="false" />
              <input type="checkbox" name="da_voz" value="true" />
            </label>
          </div>
          <div className="cfg-actions"><button type="submit">Crear enlace</button></div>
        </form>

        {!!vivos.length && (
          <div className="inv-list">
            {vivos.map((i) => (
              <div className={`inv ${i.code === nuevo ? 'recien' : ''}`} key={i.code}>
                <div className="inv-info">
                  <b>{i.nota || 'Sin nota'}{i.code === nuevo && <span className="tag-nuevo">recién creado</span>}</b>
                  <small>
                    Sin usar
                    {i.contrato_compartido ? ' · ve tu cuenta' : ' · pone la suya'}
                    {i.auto_aprobar ? ' · entra solo' : ' · lo apruebas tú'}
                    {i.da_asistente && ' · con asistente'}
                    {i.da_voz && ' · con notas de voz'}
                  </small>
                  <EnlaceCopiable url={`${appUrl}/registro?codigo=${i.code}`} />
                </div>
                <form method="post" action="/api/usuarios">
                  <input type="hidden" name="accion" value="borrar_invite" />
                  <input type="hidden" name="code" value={i.code} />
                  <button className="btn-danger" type="submit">Borrar</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {!!gastados.length && (
          <details className="sub-plegable">
            <summary>Enlaces ya usados ({gastados.length})</summary>
            <div className="inv-list">
              {gastados.map((i) => (
                <div className="inv muerto" key={i.code}>
                  <div className="inv-info">
                    <b>{i.nota || 'Sin nota'}</b>
                    <small>{i.usos >= i.usos_max ? 'Usado' : 'Vencido'} · creado el {fecha(i.created_at)}</small>
                  </div>
                  <form method="post" action="/api/usuarios">
                    <input type="hidden" name="accion" value="borrar_invite" />
                    <input type="hidden" name="code" value={i.code} />
                    <button className="btn-danger" type="submit">Borrar</button>
                  </form>
                </div>
              ))}
            </div>
          </details>
        )}
      </details>

      {/* ---------- Cuentas de luz y con quién se comparten ---------- */}
      <details className="pers-bloque plegable">
        <summary><h3>Cuentas de luz ({contratos.length})</h3></summary>
        <div className="inv-list">
          {contratos.map((c) => (
            <div className="inv" key={c.id}>
              <div className="inv-info">
                <b>{c.nombre || `Contrato ${c.id}`}{c.owner_id === null ? ' · tuya' : ''}</b>
                <small>
                  {c.email || 'sin credenciales todavía'}
                  {c.nic ? ` · NIC ${c.nic}` : ''}
                  {c.miembros.length ? ` · compartida con ${c.miembros.join(', ')}` : ''}
                </small>
              </div>
            </div>
          ))}
        </div>
        <small className="mh-note">Aquí solo se ve de quién es cada cuenta, nunca su consumo ni sus facturas.</small>
      </details>
    </section>
  );
}
