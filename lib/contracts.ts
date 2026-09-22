import { sql } from './db';
import { setting, settingNumber } from './settings';
import { distribuidora } from './utilities';

export interface Contrato {
  id: number;
  nombre: string | null;
  utility: string;
  email: string | null;
  password: string | null;
  nic: string | null;
  goal_mode: string;
  budget_rd: number | null;
  kwh_threshold: number;
  owner_id: number | null;
  verificado_at: string | null;
  verificado_ok: boolean | null;
  verificado_error: string | null;
  /** ¿Quiere el resumen diario por Telegram? Las alertas importantes van igual. */
  resumen_diario: boolean;
  /** A qué hora (de República Dominicana, 0–23) le llega el resumen. */
  resumen_hora: number;
}

/**
 * Un contrato = una cuenta de la oficina virtual, con sus credenciales y su
 * meta. El dueño maestro tiene el suyo (owner_id NULL) y cada persona
 * invitada crea el suyo, salvo que se le comparta uno existente.
 */

/** Trae el contrato del dueño maestro; lo crea la primera vez desde los ajustes. */
export async function contratoDelDueno(): Promise<Contrato | null> {
  const db = sql();
  const [existente] = await db<Contrato[]>`
    SELECT * FROM contracts WHERE owner_id IS NULL ORDER BY id LIMIT 1`;
  if (existente) return existente;

  // Primera vez: se migra lo que había en la configuración global.
  const email = await setting('PORTAL_EMAIL');
  const password = await setting('PORTAL_PASSWORD');
  if (!email && !password) return null;
  const [creado] = await db<Contrato[]>`
    INSERT INTO contracts (nombre, utility, email, password, nic, goal_mode, budget_rd, kwh_threshold, owner_id)
    VALUES ('Mi casa', ${await setting('UTILITY')}, ${email}, ${password},
            ${(await setting('PORTAL_NIC')) || null}, ${await setting('GOAL_MODE')},
            ${(await settingNumber('MONTHLY_BUDGET_RD')) || null}, ${await settingNumber('KWH_THRESHOLD')}, NULL)
    RETURNING *`;
  // los datos que ya existían son de este contrato
  for (const t of ['teleconsumo_snapshots', 'daily_consumption', 'invoices', 'monthly_consumption', 'alerts', 'runs']) {
    await db.unsafe(`UPDATE ${t} SET contract_id = $1 WHERE contract_id IS NULL`, [creado.id]);
  }
  return creado;
}

/** Todos los contratos que hay que revisar en la corrida diaria. */
export async function contratosActivos(): Promise<Contrato[]> {
  await contratoDelDueno();
  return sql()<Contrato[]>`
    SELECT * FROM contracts WHERE email IS NOT NULL AND password IS NOT NULL ORDER BY id`;
}

/**
 * TODAS las cuentas que una persona puede ver: las suyas y las compartidas.
 * Una persona puede tener varias (la casa, el negocio, la de la mamá…).
 */
export async function contratosDeUsuario(uid: number | 'maestro'): Promise<Contrato[]> {
  const db = sql();
  if (uid === 'maestro') {
    await contratoDelDueno(); // crea el primero si hace falta
    return db<Contrato[]>`SELECT * FROM contracts WHERE owner_id IS NULL ORDER BY id`;
  }
  const propios = await db<Contrato[]>`SELECT * FROM contracts WHERE owner_id = ${uid} ORDER BY id`;
  const compartidos = await db<Contrato[]>`
    SELECT c.* FROM contracts c
    JOIN contract_members m ON m.contract_id = c.id
    WHERE m.user_id = ${uid} ORDER BY c.id`;
  return [...propios, ...compartidos.filter((c) => !propios.some((p) => p.id === c.id))];
}

/**
 * El contrato que le toca ver a quien está en sesión. Con `preferido` (la
 * cuenta elegida en el selector) se devuelve esa, si de verdad es suya.
 */
export async function contratoDeUsuario(uid: number | 'maestro', preferido: number | null = null): Promise<Contrato | null> {
  const todos = await contratosDeUsuario(uid);
  if (preferido != null) {
    const elegido = todos.find((c) => c.id === preferido);
    if (elegido) return elegido;
  }
  return todos[0] ?? null;
}

/**
 * Otra cuenta más para la misma persona. Lo típico es OTRO contrato (otro
 * NIC) bajo el MISMO acceso de la oficina virtual, así que se copian las
 * credenciales de la cuenta de partida: a la persona solo le queda ponerle
 * nombre y el NIC de ese contrato (obligatorio cuando comparten acceso,
 * para que cada cuenta lea lo suyo).
 */
export async function crearOtraCuenta(uid: number | 'maestro', desde: Contrato | null = null): Promise<Contrato> {
  const owner = uid === 'maestro' ? null : uid;
  const [c] = await sql()<Contrato[]>`
    INSERT INTO contracts (nombre, owner_id, utility, email, password)
    VALUES ('Cuenta nueva', ${owner}, ${desde?.utility ?? 'edenorte'}, ${desde?.email ?? null}, ${desde?.password ?? null})
    RETURNING *`;
  return c;
}

/** Borra una cuenta extra CON sus datos. La vinculación de chats se suelta. */
export async function eliminarCuenta(id: number): Promise<void> {
  const db = sql();
  for (const t of ['teleconsumo_snapshots', 'daily_consumption', 'invoices', 'monthly_consumption', 'alerts', 'runs', 'portal_probes']) {
    await db.unsafe(`DELETE FROM ${t} WHERE contract_id = $1`, [id]);
  }
  await db`DELETE FROM contract_members WHERE contract_id = ${id}`;
  await db`UPDATE telegram_recipients SET contract_id = NULL WHERE contract_id = ${id}`;
  await db`DELETE FROM contracts WHERE id = ${id}`;
}

/** ¿El contrato es suyo o se lo compartieron? */
export async function esCompartido(contrato: Contrato, uid: number | 'maestro'): Promise<boolean> {
  if (uid === 'maestro') return contrato.owner_id !== null;
  return contrato.owner_id !== uid;
}

export async function guardarContrato(id: number, datos: Partial<Contrato>): Promise<void> {
  const db = sql();
  const c = await db<Contrato[]>`SELECT * FROM contracts WHERE id = ${id}`;
  if (!c.length) return;
  const a = { ...c[0], ...datos };
  await db`
    UPDATE contracts SET
      nombre = ${a.nombre}, utility = ${a.utility}, email = ${a.email},
      password = ${a.password}, nic = ${a.nic}, goal_mode = ${a.goal_mode},
      budget_rd = ${a.budget_rd}, kwh_threshold = ${a.kwh_threshold},
      resumen_diario = ${a.resumen_diario}, resumen_hora = ${a.resumen_hora}
    WHERE id = ${id}`;
  // Si cambiaron las credenciales, lo verificado antes ya no vale.
  if (a.email !== c[0].email || a.password !== c[0].password) {
    await db`UPDATE contracts SET verificado_at = NULL, verificado_ok = NULL, verificado_error = NULL WHERE id = ${id}`;
  }
}

/** Crea el contrato de una persona recién registrada. */
export async function crearContratoDe(uid: number, nombre: string): Promise<Contrato> {
  const [c] = await sql()<Contrato[]>`
    INSERT INTO contracts (nombre, owner_id) VALUES (${nombre}, ${uid}) RETURNING *`;
  return c;
}

/** Da acceso de lectura de un contrato a otra cuenta. */
export async function compartirContrato(contractId: number, uid: number): Promise<void> {
  await sql()`
    INSERT INTO contract_members (contract_id, user_id) VALUES (${contractId}, ${uid})
    ON CONFLICT DO NOTHING`;
}

/** Lista para el panel del dueño: contratos con quién los comparte. */
export async function contratosConMiembros(): Promise<(Contrato & { miembros: string[] })[]> {
  const db = sql();
  const contratos = await db<Contrato[]>`SELECT * FROM contracts ORDER BY owner_id NULLS FIRST, id`;
  const miembros = await db<{ contract_id: number; email: string }[]>`
    SELECT m.contract_id, u.email FROM contract_members m JOIN users u ON u.id = m.user_id`;
  return contratos.map((c) => ({
    ...c,
    miembros: miembros.filter((m) => m.contract_id === c.id).map((m) => m.email),
  }));
}

/**
 * Comprueba que el correo y la contraseña de la oficina virtual sirven, sin
 * guardar consumo todavía: así la persona sabe de una vez si escribió bien
 * sus credenciales. Devuelve los NIC que encontró en la cuenta.
 */
export async function verificarContrato(id: number): Promise<{ ok: boolean; nics: string[]; error?: string }> {
  const db = sql();
  const [c] = await db<Contrato[]>`SELECT * FROM contracts WHERE id = ${id}`;
  if (!c) return { ok: false, nics: [], error: 'Esa cuenta ya no existe.' };
  if (!c.email || !c.password) {
    return { ok: false, nics: [], error: 'Faltan el correo y la contraseña de tu oficina virtual.' };
  }
  const { PortalClient } = await import('./portal');
  try {
    const client = new PortalClient(c.email, c.password, distribuidora(c.utility).base);
    await client.login();
    const nics = c.nic?.trim() ? [c.nic.trim()] : await client.getContracts();
    await db`UPDATE contracts SET verificado_at = now(), verificado_ok = true, verificado_error = NULL WHERE id = ${id}`;
    return { ok: true, nics };
  } catch (e: any) {
    const error = mensajeClaro(e?.message || String(e));
    await db`UPDATE contracts SET verificado_at = now(), verificado_ok = false, verificado_error = ${error} WHERE id = ${id}`;
    return { ok: false, nics: [], error };
  }
}

/** Traduce el error técnico del portal a algo que se entienda. */
function mensajeClaro(msg: string): string {
  if (/login fallido/i.test(msg)) {
    return 'La oficina virtual no aceptó ese correo y esa contraseña. Pruébalos entrando tú directo a la página de tu distribuidora: si tampoco entras ahí, hay que cambiarlos allá.';
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(msg)) {
    return 'La página de la distribuidora no respondió. Suele ser cosa de ellos: espera un rato y vuelve a intentar.';
  }
  return msg;
}
