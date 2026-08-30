import { randomBytes } from 'node:crypto';
import { sql } from './db';
import { contratoDeUsuario, contratoDelDueno } from './contracts';

const CLAVE_MAESTRO = '__tg_code_maestro';

/**
 * Vinculación entre un chat de Telegram y una cuenta. Sin esto el bot no
 * sabría de quién es la factura que debe mostrar.
 */

export interface ChatVinculado {
  chatId: string;
  userId: number | null;      // null = el dueño maestro
  contractId: number | null;
  autorizado: boolean;
  puedeAsistente: boolean;
  puedeVoz: boolean;
}

/** Código corto e irrepetible que la persona le manda al bot. */
export async function codigoDeEnlace(uid: number | 'maestro'): Promise<string> {
  const db = sql();
  if (uid === 'maestro') {
    const [g] = await db<{ valor: string }[]>`SELECT valor FROM settings WHERE clave = ${CLAVE_MAESTRO}`;
    if (g?.valor) return g.valor;
    const codigo = nuevoCodigo();
    await db`INSERT INTO settings (clave, valor) VALUES (${CLAVE_MAESTRO}, ${codigo})
             ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    return codigo;
  }
  const [u] = await db<{ tg_code: string | null }[]>`SELECT tg_code FROM users WHERE id = ${uid}`;
  if (u?.tg_code) return u.tg_code;
  const codigo = nuevoCodigo();
  await db`UPDATE users SET tg_code = ${codigo} WHERE id = ${uid}`;
  return codigo;
}

function nuevoCodigo(): string {
  return randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

/**
 * Quién está detrás de un chat, con sus permisos y su contrato.
 *
 * Ojo con el contrato: si queda en null, las consultas dejan de filtrar y el
 * bot acaba respondiendo con los datos de OTRA cuenta (la que se haya leído
 * de último). Por eso, si falta, se resuelve aquí y se guarda; y si no hay
 * forma de saber de quién es el chat, se devuelve sin contrato para que el
 * webhook no conteste con datos ajenos.
 */
export async function quienEs(chatId: string): Promise<ChatVinculado | null> {
  const db = sql();
  const [r] = await db<any[]>`
    SELECT t.chat_id, t.authorized, t.user_id, t.contract_id,
           u.puede_asistente, u.puede_voz
    FROM telegram_recipients t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.chat_id = ${chatId}`;
  if (!r) return null;

  let contractId: number | null = r.contract_id;
  if (r.authorized && contractId == null) {
    // Chats de antes de las cuentas separadas: se les asigna el suyo.
    const c = r.user_id ? await contratoDeUsuario(r.user_id) : await contratoDelDueno();
    contractId = c?.id ?? null;
    if (contractId != null) {
      await db`UPDATE telegram_recipients SET contract_id = ${contractId} WHERE chat_id = ${chatId}`;
    }
  }

  return {
    chatId: r.chat_id,
    userId: r.user_id,
    contractId,
    autorizado: r.authorized,
    // el dueño (sin user_id) puede todo
    puedeAsistente: r.user_id ? !!r.puede_asistente : true,
    puedeVoz: r.user_id ? !!r.puede_voz : true,
  };
}

/** Liga el chat a la cuenta del código. Devuelve el nombre si funcionó. */
export async function vincular(chatId: string, codigo: string): Promise<string | null> {
  const db = sql();
  const limpio = codigo.trim().toUpperCase();

  // El dueño maestro no tiene fila en users: su código vive en la configuración.
  const [maestro] = await db<{ valor: string }[]>`SELECT valor FROM settings WHERE clave = ${CLAVE_MAESTRO}`;
  if (maestro?.valor && maestro.valor === limpio) {
    const contrato = await contratoDelDueno();
    await db`
      INSERT INTO telegram_recipients (chat_id, name, authorized, user_id, contract_id)
      VALUES (${chatId}, 'Dueño', true, NULL, ${contrato?.id ?? null})
      ON CONFLICT (chat_id) DO UPDATE
        SET authorized = true, user_id = NULL, contract_id = EXCLUDED.contract_id`;
    return 'Dueño';
  }

  const [u] = await db<{ id: number; nombre: string | null; email: string }[]>`
    SELECT id, nombre, email FROM users WHERE tg_code = ${limpio} AND aprobado`;
  if (!u) return null;
  const contrato = await contratoDeUsuario(u.id);
  await db`
    INSERT INTO telegram_recipients (chat_id, name, authorized, user_id, contract_id)
    VALUES (${chatId}, ${u.nombre || u.email}, true, ${u.id}, ${contrato?.id ?? null})
    ON CONFLICT (chat_id) DO UPDATE
      SET authorized = true, user_id = EXCLUDED.user_id,
          contract_id = EXCLUDED.contract_id, name = EXCLUDED.name`;
  return u.nombre || u.email;
}

/** Chats a los que hay que avisar sobre un contrato. */
export async function chatsDelContrato(contractId: number): Promise<string[]> {
  try {
    const db = sql();
    const filas = await db<{ chat_id: string }[]>`
      SELECT chat_id FROM telegram_recipients WHERE authorized AND contract_id = ${contractId}`;
    const chats = filas.map((f) => f.chat_id);

    // Chats de antes de separar las cuentas: no tienen contrato ni usuario,
    // así que son del dueño. Se les asigna el suyo — y SOLO el suyo, para que
    // nunca reciban avisos de la cuenta de otra persona.
    const dueno = await contratoDelDueno();
    if (dueno?.id === contractId) {
      const huerfanos = await db<{ chat_id: string }[]>`
        SELECT chat_id FROM telegram_recipients
        WHERE authorized AND contract_id IS NULL AND user_id IS NULL`;
      if (huerfanos.length) {
        await db`UPDATE telegram_recipients SET contract_id = ${contractId}
                 WHERE authorized AND contract_id IS NULL AND user_id IS NULL`;
        for (const h of huerfanos) if (!chats.includes(h.chat_id)) chats.push(h.chat_id);
      }
    }
    return chats;
  } catch {
    return [];
  }
}
