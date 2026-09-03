import Anthropic from '@anthropic-ai/sdk';
import { sql } from './db';
import { getPricing, estimateCost } from './pricing';
import { setting, settingBool } from './settings';
import { getMeta } from './goal';
import { retrasoDe, fraseAtraso } from './lag';


/** El límite en kWh del contrato; si no tiene el suyo, el global. */
async function limiteDe(cid: number | null): Promise<number | null> {
  if (cid == null) return null;
  const [c] = await sql()<{ kwh_threshold: number }[]>`SELECT kwh_threshold FROM contracts WHERE id = ${cid}`;
  return c?.kwh_threshold || null;
}

/**
 * Arma un contexto compacto con los datos del monitor para el modelo.
 * Si viene `cid`, solo se incluyen los datos de ESE contrato: así el bot le
 * responde a cada persona con su propia factura.
 */
async function buildContext(cid: number | null): Promise<string> {
  const db = sql();
  const [snap] = await db<any[]>`
    SELECT nic, to_char(fecha_ultima_factura,'YYYY-MM-DD') AS cycle_start, to_char(datos_hasta,'YYYY-MM-DD') AS datos_hasta,
           consumo_hasta_fecha_kwh AS consumo, proyeccion_kwh AS proyeccion, titular, tarifa
    FROM teleconsumo_snapshots
    WHERE (${cid}::bigint IS NULL OR contract_id = ${cid})
      AND fecha_ultima_factura IS NOT NULL AND datos_hasta IS NOT NULL
    ORDER BY captured_at DESC LIMIT 1`;
  if (!snap) return 'Sin datos todavía: el monitor no ha corrido.';
  const daily = await db<any[]>`
    SELECT to_char(day,'YYYY-MM-DD') AS day, kwh::float AS kwh FROM daily_consumption
    WHERE nic = ${snap.nic} AND (${cid}::bigint IS NULL OR contract_id = ${cid})
    ORDER BY day DESC LIMIT 120`;
  const invoices = await db<any[]>`
    SELECT to_char(periodo_fin,'YYYY-MM-DD') AS mes, consumo_kwh, facturado_rd::float AS facturado_rd,
           total_a_pagar::float AS total, to_char(pague_antes_de,'YYYY-MM-DD') AS vence, precio_kwh::float AS precio_kwh, analysis
    FROM invoices WHERE parsed_ok AND (${cid}::bigint IS NULL OR contract_id = ${cid})
    ORDER BY fecha_emision DESC LIMIT 24`;
  const monthly = await db<any[]>`
    SELECT to_char(month,'YYYY-MM-DD') AS mes, kwh, source FROM monthly_consumption
    WHERE nic = ${snap.nic} AND (${cid}::bigint IS NULL OR contract_id = ${cid})
    ORDER BY month DESC LIMIT 36`;
  const pricing = await getPricing(cid);
  const meta = await getMeta(cid);
  const THRESHOLD = (await limiteDe(cid)) ?? meta.kwh;
  const atraso = await retrasoDe(cid, snap.datos_hasta);
  return JSON.stringify({
    hoy: new Date().toISOString().slice(0, 10),
    publicacion: {
      ultimo_dia_con_datos: atraso.datosHasta,
      dias_de_atraso: atraso.dias,
      atraso_habitual_dias: atraso.habitual,
      dias_aun_sin_publicar: atraso.sinPublicar,
      nota: 'Estos días todavía no los ha publicado la distribuidora. Es normal: NO son consumo cero ni un problema.',
    },
    limite_kwh: THRESHOLD,
    meta: meta.modo === 'dinero'
      ? { tipo: 'pagar_menos_de_rd', monto_rd: meta.rd, equivale_a_kwh: THRESHOLD }
      : { tipo: 'no_pasar_de_kwh', kwh: THRESHOLD },
    precios: pricing ? {
      precio_promedio_del_mes_rd_por_kwh: Number(pricing.precioKwh.toFixed(2)),
      // La tarifa es POR TRAMOS: el kWh siguiente cuesta el marginal, no el promedio.
      tarifa_por_tramos: pricing.tarifa ? {
        cargo_fijo_rd: pricing.tarifa.cargoFijo,
        tramos: pricing.tarifa.tramos,
        precio_del_siguiente_kwh_rd: pricing.tarifa.precioMarginal,
        al_pasar_de_kwh: pricing.tarifa.umbral,
        precio_si_se_pasa_rd: pricing.tarifa.precioAlto,
        nota: 'Los tramos se aplican en orden. Pasando el umbral se pierden los baratos y TODO el mes se cobra al precio alto.',
      } : null,
      precio_si_pasa_limite: pricing.precioKwhAlto ? Number(pricing.precioKwhAlto.toFixed(2)) : null,
      gasto_actual_estimado_rd: snap.consumo ? Number(estimateCost(snap.consumo, pricing).toFixed(0)) : null,
      gasto_proyectado_cierre_rd: snap.proyeccion ? Number(estimateCost(snap.proyeccion, pricing).toFixed(0)) : null,
    } : null,
    ciclo_actual: snap,
    consumo_diario_reciente: daily.reverse(),
    facturas_leidas: invoices,
    consumo_mensual_historico: monthly.reverse(),
  });
}

/**
 * Responde una pregunta libre del usuario usando Claude con los datos reales
 * del monitor. Devuelve null si no hay ANTHROPIC_API_KEY configurada.
 */
/** Instrucciones del asistente, comunes a cualquier proveedor. */
async function systemPrompt(context: string, threshold: number, atraso: string | null): Promise<string> {
  return [
    'Eres el asistente de Monitor de Luz, un bot de Telegram que vigila la factura eléctrica en República Dominicana. Hablas en español dominicano cercano y directo, sin paja corporativa. Tuteas.',
    'TONO NEUTRO: no sabes si quien te escribe es hombre o mujer y no lo asumas. Nada de "bro", "mi hermano", "amigo", "loco" ni adjetivos con género ("bienvenido", "preparado", "tranquilo"). Usa fórmulas neutras: "hola", "qué tal", "te cuento", "ojo con esto", "vamos bien". Si necesitas adjetivo, busca uno sin género ("todo bajo control" en vez de "estás tranquilo").',
    'Tu misión es que a esta persona NO le metan un facturazo: que la factura sea justa, que no pague de más y que sepa en qué se le va la luz. Estás de su lado.',
    'Si algo se ve raro (un salto sin explicación, un cobro que no cuadra con el consumo), dilo — pero sin acusar a nadie de robo sin pruebas: señala el dato y sugiere qué revisar o reclamar.',
    `La meta está en el campo "meta" del JSON. El límite operativo es ${threshold} kWh al mes: al pasarse se pierden los tramos baratos y TODOS los kWh se cobran al precio alto.`,
    'Lo que MÁS le importa al usuario es el dinero: cuando aplique, convierte los kWh a pesos dominicanos (RD$) con el campo "precios" y dile cuánto lleva gastado y cuánto pagaría al cierre.',
    'La tarifa es POR TRAMOS, no un precio plano (mira "tarifa_por_tramos"). Para decir cuánto costaría gastar más, usa "precio_del_siguiente_kwh_rd", NUNCA el promedio del mes: el promedio siempre es más bajo y engaña. Y pasando el umbral se pierden los tramos baratos y todo el mes se recalcula al precio alto, así que ahí el salto es de miles de pesos, no de unos cientos.',

    // Lo que más ruido metía: tratar el atraso del portal como si fuera una avería.
    'MUY IMPORTANTE — el atraso de los datos: la oficina virtual publica el consumo con varios días de retraso (mira "publicacion" en el JSON). Que los últimos días salgan vacíos o en cero es el COMPORTAMIENTO NORMAL, no una falla, no una factura que "no salió" ni un consumo de cero. NUNCA lo destaques como problema ni lo repitas en cada respuesta. No cuentes esos días en promedios ni en comparaciones, y no digas que el consumo bajó por ellos. Solo menciona el atraso si te preguntan por qué no aparecen los últimos días.',
    'El último día CON datos es el más reciente de verdad: si vas a comentar "el último día", es ese, y llámalo por su nombre ("el jueves"), no "hoy".',

    'LARGO: responde corto. Si la pregunta es puntual, contéstala en una o dos frases y ya. Solo despliega números y desglose si te los piden o si de verdad hacen falta. Máximo ~8 líneas, y casi siempre menos. No repitas en cada mensaje el resumen completo del ciclo.',
    'Cuando des un consejo, que sea accionable y sobre lo que muestran los datos (un día que se disparó, un promedio que hay que bajar), no genérico.',
    'Usa solo HTML simple de Telegram (<b>, <i>) y emojis con moderación. No inventes datos que no estén en el contexto; si falta algo, dilo.',
    atraso ? `Contexto de la publicación: ${atraso}` : '',
    'Datos actuales del monitor (JSON):',
    context,
  ].filter(Boolean).join('\n\n');
}

async function pedirAClaude(system: string, pregunta: string, modelo: string, apiKey: string) {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: modelo || 'claude-sonnet-5',
    // Los modelos actuales gastan parte del presupuesto "pensando" antes de
    // escribir: con un tope corto puede llegar un 200 OK sin ningún texto.
    max_tokens: 4000,
    output_config: { effort: 'low' },
    system,
    messages: [{ role: 'user', content: pregunta }],
  });
  const texto = res.content.filter((b) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  if (!texto) throw new Error(`respuesta vacía (stop: ${res.stop_reason})`);
  return texto;
}

async function pedirAOpenAI(system: string, pregunta: string, modelo: string, apiKey: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelo || 'gpt-4o-mini',
      // Los modelos con razonamiento gastan parte de este tope pensando; con
      // un tope corto la respuesta puede llegar vacía.
      max_completion_tokens: 4000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: pregunta }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  const texto = (j.choices?.[0]?.message?.content || '').trim();
  if (!texto) throw new Error(`respuesta vacía (finish: ${j.choices?.[0]?.finish_reason})`);
  return texto;
}

async function pedirAGemini(system: string, pregunta: string, modelo: string, apiKey: string) {
  const m = modelo || 'gemini-2.0-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: pregunta }] }],
      generationConfig: { maxOutputTokens: 4000 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  const texto = (j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '').trim();
  if (!texto) throw new Error(`respuesta vacía (finish: ${j.candidates?.[0]?.finishReason})`);
  return texto;
}

/**
 * Responde una pregunta libre usando el proveedor elegido en el panel
 * (Claude, OpenAI o Gemini). Devuelve null si no hay clave configurada.
 */
/**
 * Por qué el asistente no puede responder ahora, si es el caso. El webhook
 * lo usa para explicarlo: antes, cuando askAssistant devolvía null, el bot
 * contestaba el menú de ayuda, como si no hubiera entendido la pregunta.
 */
export async function estadoAsistente(): Promise<{ activo: true } | { activo: false; motivo: 'apagado' | 'sin_clave'; proveedor: string }> {
  const proveedor = (await setting('ASSISTANT_PROVIDER')) || 'anthropic';
  if (!(await settingBool('ASSISTANT_ENABLED'))) return { activo: false, motivo: 'apagado', proveedor };
  const clave = proveedor === 'openai' ? await setting('OPENAI_API_KEY')
    : proveedor === 'google' ? await setting('GOOGLE_API_KEY')
    : await setting('ANTHROPIC_API_KEY');
  if (!clave) return { activo: false, motivo: 'sin_clave', proveedor };
  return { activo: true };
}

export async function askAssistant(question: string, cid: number | null = null): Promise<string | null> {
  if (!(await settingBool('ASSISTANT_ENABLED'))) return null;
  const proveedor = (await setting('ASSISTANT_PROVIDER')) || 'anthropic';
  const modelo = await setting('ASSISTANT_MODEL');
  const claves: Record<string, string> = {
    anthropic: await setting('ANTHROPIC_API_KEY'),
    openai: await setting('OPENAI_API_KEY'),
    google: await setting('GOOGLE_API_KEY'),
  };
  const apiKey = claves[proveedor];
  if (!apiKey) return null;

  const meta = await getMeta(cid);
  const limite = (await limiteDe(cid)) ?? meta.kwh;
  const [ultimo] = await sql()<{ datos_hasta: string | null }[]>`
    SELECT to_char(datos_hasta,'YYYY-MM-DD') AS datos_hasta FROM teleconsumo_snapshots
    WHERE (${cid}::bigint IS NULL OR contract_id = ${cid}) ORDER BY captured_at DESC LIMIT 1`;
  const atraso = fraseAtraso(await retrasoDe(cid, ultimo?.datos_hasta ?? null));
  const system = await systemPrompt(await buildContext(cid), limite, atraso);
  try {
    const texto = proveedor === 'openai' ? await pedirAOpenAI(system, question, modelo, apiKey)
      : proveedor === 'google' ? await pedirAGemini(system, question, modelo, apiKey)
      : await pedirAClaude(system, question, modelo, apiKey);
    return texto || null;
  } catch (e: any) {
    console.error('[assistant]', e.message);
    return `⚠️ El asistente no pudo responder (${proveedor}: ${e.message}). Si sigue pasando, revisa el modelo y la clave en Configuración → Asistente.`;
  }
}
