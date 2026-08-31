import { sql } from './db';

/**
 * Configuración editable desde el panel (/config), guardada en la base de datos.
 * Cada valor cae a la variable de entorno del mismo nombre si aún no se ha
 * definido en el panel, para no romper instalaciones existentes.
 *
 * Solo DATABASE_URL y DASHBOARD_PASSWORD siguen siendo variables de Vercel:
 * la primera hace falta para leer esta tabla y la segunda la usa el middleware.
 */
export const CLAVES = [
  // Dirección pública de la app (para los enlaces del bot)
  'APP_URL',
  // Distribuidora y cuenta
  'UTILITY', 'PORTAL_EMAIL', 'PORTAL_PASSWORD', 'PORTAL_NIC',
  // Telegram
  'TELEGRAM_ENABLED', 'TELEGRAM_BOT_TOKEN', 'CRON_SECRET', 'DAILY_SUMMARY',
  // Asistente
  'ASSISTANT_ENABLED', 'ASSISTANT_PROVIDER', 'ASSISTANT_MODEL', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY',
  // Voz
  'VOICE_ENABLED', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'VOICE_REPLIES',
  // Meta y reglas
  'GOAL_MODE', 'MONTHLY_BUDGET_RD', 'KWH_THRESHOLD', 'KWH_WARN_RATIO', 'DAILY_SPIKE_RATIO', 'PDF_RETENTION_MONTHS',
  // Demo
  'DEMO_MODE',
] as const;

export type Clave = (typeof CLAVES)[number];

/** Claves que nunca se muestran completas en el panel. */
export const SECRETAS: Clave[] = [
  'PORTAL_PASSWORD', 'TELEGRAM_BOT_TOKEN', 'CRON_SECRET',
  'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY', 'ELEVENLABS_API_KEY',
];

const DEFECTOS: Partial<Record<Clave, string>> = {
  KWH_THRESHOLD: '700',
  KWH_WARN_RATIO: '0.8',
  DAILY_SPIKE_RATIO: '1.6',
  // 0 = no se borra ninguno. La distribuidora sí borra los suyos del portal:
  // el archivo de la app es justo lo que queda cuando allá desaparecen.
  PDF_RETENTION_MONTHS: '0',
  GOAL_MODE: 'dinero',
  UTILITY: 'edenorte',
  ASSISTANT_PROVIDER: 'anthropic',
  TELEGRAM_ENABLED: 'true',
  ASSISTANT_ENABLED: 'false',
  VOICE_ENABLED: 'false',
  DEMO_MODE: 'false',
  DAILY_SUMMARY: 'true',
  VOICE_REPLIES: 'false',
  ASSISTANT_MODEL: 'claude-sonnet-5',
};

let cache: { at: number; valores: Map<string, string> } | null = null;
const TTL_MS = 15_000; // los cambios del panel se ven casi al instante
const MARCA_MIGRADO = '__migrado_desde_entorno';
const MARCA_RETENCION = '__retencion_a_siempre';

/**
 * La primera vez, copia a la base de datos lo que estuviera en variables de
 * entorno. A partir de ahí el panel es la única fuente: se puede borrar todo
 * del hosting sin perder nada.
 */
async function migrarDesdeEntorno(valores: Map<string, string>): Promise<void> {
  if (valores.has(MARCA_MIGRADO)) return;
  const db = sql();
  const traidos: string[] = [];
  const ALIAS: Partial<Record<Clave, string>> = {
    PORTAL_EMAIL: 'PORTAL_EMAIL', PORTAL_PASSWORD: 'PORTAL_PASSWORD', PORTAL_NIC: 'PORTAL_NIC',
  };
  for (const clave of CLAVES) {
    const alias = ALIAS[clave];
    const env = (process.env[clave] || (alias ? process.env[alias] : '') || '').trim();
    if (!env || valores.get(clave)) continue;
    await db`INSERT INTO settings (clave, valor) VALUES (${clave}, ${env})
             ON CONFLICT (clave) DO NOTHING`;
    valores.set(clave, env);
    traidos.push(clave);
  }
  await db`INSERT INTO settings (clave, valor) VALUES (${MARCA_MIGRADO}, ${new Date().toISOString()})
           ON CONFLICT (clave) DO NOTHING`;
  valores.set(MARCA_MIGRADO, 'sí');
  if (traidos.length) console.log('[settings] importados del entorno:', traidos.join(', '));
}

/**
 * Las claves de la oficina virtual se llamaban EDENORTE_*. Se renombraron a
 * PORTAL_* para que el proyecto no quede atado a una distribuidora; esto
 * copia lo que ya estuviera guardado con el nombre viejo.
 */
const RENOMBRADAS: [string, Clave][] = [
  ['PORTAL_EMAIL', 'PORTAL_EMAIL'],
  ['PORTAL_PASSWORD', 'PORTAL_PASSWORD'],
  ['PORTAL_NIC', 'PORTAL_NIC'],
];

async function migrarClavesViejas(valores: Map<string, string>): Promise<void> {
  const db = sql();
  for (const [vieja, nueva] of RENOMBRADAS) {
    const valor = valores.get(vieja);
    if (!valor || valores.get(nueva)) continue;
    await db`INSERT INTO settings (clave, valor) VALUES (${nueva}, ${valor})
             ON CONFLICT (clave) DO NOTHING`;
    valores.set(nueva, valor);
    console.log(`[settings] ${vieja} copiada a ${nueva}`);
  }
}

/**
 * El archivo de facturas existe porque la distribuidora borra las suyas. Una
 * retención corta hacía justo lo contrario: iba borrando los PDF guardados.
 * Se pasa una sola vez a "no borrar nunca"; quien quiera una ventana la
 * vuelve a poner en el panel y esto ya no la toca.
 */
async function migrarRetencion(valores: Map<string, string>): Promise<void> {
  if (valores.has(MARCA_RETENCION)) return;
  const db = sql();
  const actual = Number(valores.get('PDF_RETENTION_MONTHS') ?? '');
  if (actual > 0) {
    await db`INSERT INTO settings (clave, valor) VALUES ('PDF_RETENTION_MONTHS', '0')
             ON CONFLICT (clave) DO UPDATE SET valor = '0'`;
    valores.set('PDF_RETENTION_MONTHS', '0');
    console.log(`[settings] retención de PDF pasada de ${actual} meses a "no borrar"`);
  }
  await db`INSERT INTO settings (clave, valor) VALUES (${MARCA_RETENCION}, ${new Date().toISOString()})
           ON CONFLICT (clave) DO NOTHING`;
  valores.set(MARCA_RETENCION, 'sí');
}

/** Carga la configuración (con caché corto). */
export async function loadSettings(force = false): Promise<Map<string, string>> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.valores;
  const valores = new Map<string, string>();
  try {
    const rows = await sql()<{ clave: string; valor: string }[]>`SELECT clave, valor FROM settings`;
    for (const r of rows) if (r.valor) valores.set(r.clave, r.valor);
    await migrarClavesViejas(valores);
    await migrarRetencion(valores);
    await migrarDesdeEntorno(valores);
  } catch (e: any) {
    console.error('[settings] no se pudo leer la tabla:', e.message);
    // sin base de datos todavía: se usa el entorno para no quedar a ciegas
    for (const clave of CLAVES) {
      const env = (process.env[clave] || '').trim();
      if (env) valores.set(clave, env);
    }
  }
  cache = { at: Date.now(), valores };
  return valores;
}

/** Valor efectivo: lo guardado en el panel, o el valor por defecto. */
export async function setting(clave: Clave): Promise<string> {
  const valores = await loadSettings();
  return valores.get(clave) || DEFECTOS[clave] || '';
}

export async function settingNumber(clave: Clave): Promise<number> {
  return Number(await setting(clave)) || Number(DEFECTOS[clave]) || 0;
}

export async function settingBool(clave: Clave): Promise<boolean> {
  return (await setting(clave)) === 'true';
}

/** Guarda (o borra, si el valor viene vacío) un ajuste del panel. */
export async function saveSetting(clave: string, valor: string): Promise<void> {
  if (!(CLAVES as readonly string[]).includes(clave)) return;
  const db = sql();
  if (!valor) {
    await db`DELETE FROM settings WHERE clave = ${clave}`;
  } else {
    await db`
      INSERT INTO settings (clave, valor) VALUES (${clave}, ${valor})
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`;
  }
  cache = null;
}

/** Estado de cada clave para pintar el panel, sin exponer los secretos. */
export async function settingsView(): Promise<{ clave: Clave; valor: string; desdeEnv: boolean; secreta: boolean }[]> {
  const valores = await loadSettings(true);
  return CLAVES.map((clave) => {
    const guardado = valores.get(clave) || '';
    const secreta = SECRETAS.includes(clave);
    return {
      clave,
      valor: secreta && guardado ? `••••••${guardado.slice(-4)}` : guardado || DEFECTOS[clave] || '',
      desdeEnv: false,
      secreta,
    };
  });
}
