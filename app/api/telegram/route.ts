import { NextRequest, NextResponse } from 'next/server';
import { setting } from '@/lib/settings';
import { sql, ensureSchema } from '@/lib/db';
import { sendTelegramTo, sendTelegramPhotoTo, sendTelegramVoiceTo, sendChatAction } from '@/lib/telegram';
import { downloadTelegramFile, transcribe, synthesize, transcriptionAvailable } from '@/lib/voice';
import { statusMessage, adviceMessage, invoiceMessage, helpMessage, chartUrls, weeklyChart, monthlyDetailMessage } from '@/lib/status';
import { askAssistant, estadoAsistente } from '@/lib/assistant';
import { quienEs, vincular } from '@/lib/telegram-link';
import { urlDeLaApp } from '@/lib/appurl';
import { sql as db2 } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;



/**
 * Webhook de Telegram. Cada chat está ligado a una cuenta, así que el bot
 * responde siempre con la factura de esa persona y respeta sus permisos.
 * Registrar con: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<app>/api/telegram&secret_token=<CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const secret = await setting('CRON_SECRET');
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    console.error('[telegram-webhook] secret_token no coincide con CRON_SECRET');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const msg = update?.message;
  const chatId = String(msg?.chat?.id ?? '').trim();
  const audio = msg?.voice ?? msg?.audio ?? msg?.video_note;
  if (!chatId || (!msg?.text && !audio)) return NextResponse.json({ ok: true });

  try {
    await ensureSchema();
  } catch (e: any) {
    console.error('[telegram-webhook] db:', e);
    await sendTelegramTo(chatId, '⚠️ No pude conectar con la base de datos: ' + e.message);
    return NextResponse.json({ ok: true });
  }

  const escrito = String(msg?.text ?? '').trim();
  let yo = await quienEs(chatId);

  // ¿Está mandando su código de enlace?
  if (!yo?.autorizado && /^[A-Za-z0-9]{5,8}$/.test(escrito.replace(/^\/vincular\s+/i, ''))) {
    const nombre = await vincular(chatId, escrito.replace(/^\/vincular\s+/i, ''));
    if (nombre) {
      await sendTelegramTo(chatId,
        `✅ Listo, <b>${nombre}</b>. Este chat quedó ligado a tu cuenta y desde ahora te respondo con <b>tu</b> factura.\n\n` +
        'Escríbeme <b>como voy</b> para empezar.', { dashboardButton: true });
      return NextResponse.json({ ok: true });
    }
  }

  // Chat todavía sin dueño: se registra y se explica qué hacer.
  if (!yo?.autorizado) {
    const from = msg?.from ?? {};
    const nombre = [from.first_name, from.last_name].filter(Boolean).join(' ') + (from.username ? ` (@${from.username})` : '');
    await sql()`
      INSERT INTO telegram_recipients (chat_id, name, authorized)
      VALUES (${chatId}, ${nombre || null}, false)
      ON CONFLICT (chat_id) DO UPDATE SET name = COALESCE(EXCLUDED.name, telegram_recipients.name)`;
    await sendTelegramTo(chatId,
      `👋 Hola${from.first_name ? ` ${from.first_name}` : ''}. Soy el bot de <b>Monitor de Luz</b>: vigilo tu factura y te aviso antes de que se dispare.\n\n` +
      'Para saber cuál es <b>tu</b> cuenta de luz necesito que me digas quién eres:\n\n' +
      `<b>1.</b> Entra a ${await urlDeLaApp()}/mi-cuenta\n` +
      '<b>2.</b> Copia tu <b>código de enlace</b> (son 6 letras y números)\n' +
      '<b>3.</b> Pégalo aquí en el chat\n\n' +
      'Si todavía no tienes cuenta, pídele el enlace de invitación a quien te compartió la app.');
    return NextResponse.json({ ok: true });
  }

  const cid = yo.contractId;

  // Sin contrato no se contesta con datos: las consultas dejarían de filtrar
  // y saldrían los de otra cuenta. Mejor decirlo que confundir.
  if (cid == null) {
    await sendTelegramTo(chatId,
      '🤔 Este chat está enlazado, pero todavía no tiene una cuenta de luz asociada.\n\n' +
      `Entra a ${await urlDeLaApp()}/mi-cuenta, pon tu correo y tu contraseña de la oficina virtual, ` +
      'y dale a <b>Comprobar y traer mis datos</b>. Después vuelve aquí.');
    return NextResponse.json({ ok: true });
  }

  // De qué cuenta se está hablando: así nunca hay duda de qué datos son.
  const [cuenta] = await db2()<{ nombre: string | null; nic: string | null }[]>`
    SELECT nombre, nic FROM contracts WHERE id = ${cid}`;
  const firma = cuenta
    ? `\n\n<i>Cuenta: ${cuenta.nombre || 'la tuya'}${cuenta.nic ? ` · NIC ${cuenta.nic}` : ''}</i>`
    : '';

  // Nota de voz: se transcribe y se trata igual que un mensaje escrito.
  let entrada = escrito;
  let porVoz = false;
  // Las notas de voz son para todo el mundo: no dependen de permisos por
  // persona, solo de que la transcripción esté configurada.
  if (audio) {
    if (!(await transcriptionAvailable())) {
      await sendTelegramTo(chatId, '🎙️ Recibí tu nota de voz, pero las notas de voz no están activadas todavía en la configuración. Escríbeme mientras tanto.');
      return NextResponse.json({ ok: true });
    }
    await sendChatAction(chatId, 'typing');
    const file = await downloadTelegramFile(audio.file_id);
    const dicho = file ? await transcribe(file.data, file.name) : null;
    if (!dicho) {
      await sendTelegramTo(chatId, '🎙️ No pude entender esa nota de voz. Intenta de nuevo hablando un poco más cerca, o escríbeme.');
      return NextResponse.json({ ok: true });
    }
    entrada = dicho;
    porVoz = true;
  }
  const text = entrada.toLowerCase().trim();
  if (!text) return NextResponse.json({ ok: true });

  // Solo los comandos EXACTOS usan respuestas fijas; el resto va al asistente.
  let reply: string | null = null;
  try {
    if (/^\/?(consumo|estado|resumen)$|^(como|cómo) voy\??$/.test(text)) {
      reply = await statusMessage(cid);
      await sendTelegramTo(chatId, reply + firma, { dashboardButton: true });
      const wk = await weeklyChart(cid);
      if (wk) await sendTelegramPhotoTo(chatId, wk.url, wk.caption);
      return NextResponse.json({ ok: true });
    }
    else if (/(12|doce)\s*meses|^\/?meses$/.test(text)) {
      const det = await monthlyDetailMessage(cid);
      await sendTelegramTo(chatId, det.text + firma, { dashboardButton: true });
      if (det.chart) await sendTelegramPhotoTo(chatId, det.chart.url, det.chart.caption);
      return NextResponse.json({ ok: true });
    }
    else if (/^\/?(consejos?|tips)$/.test(text)) reply = await adviceMessage(cid);
    else if (/^\/?(factura|recibo)$/.test(text)) reply = await invoiceMessage(cid);
    else if (/^\/?(grafica|gráfica|grafico|gráfico)s?$/.test(text)) {
      const charts = await chartUrls(cid);
      if (!charts.length) reply = 'Todavía no hay suficientes datos para graficar.';
      else {
        for (const ch of charts) await sendTelegramPhotoTo(chatId, ch.url, ch.caption);
        return NextResponse.json({ ok: true });
      }
    }
    else if (/^\/(start|help)$|^ayuda$|^hola$/.test(text)) reply = helpMessage();
    else if (!yo.puedeAsistente) {
      reply = 'No entendí ese mensaje. Prueba con <b>como voy</b>, <b>consejos</b>, <b>factura</b>, <b>grafica</b> o <b>12 meses</b>.\n\n<i>El asistente que entiende preguntas libres no está habilitado para tu cuenta.</i>';
    }
    else {
      reply = await askAssistant(entrada, cid);
      if (reply == null) {
        // La pregunta SÍ se entendió: es el asistente el que no puede correr.
        // Responder el menú de ayuda aquí hacía creer que el bot no entendía.
        const est = await estadoAsistente();
        const nombreProv: Record<string, string> = { anthropic: 'Claude', openai: 'ChatGPT', google: 'Gemini' };
        const prov = est.activo ? '' : (nombreProv[est.proveedor] ?? est.proveedor);
        reply = !est.activo && est.motivo === 'apagado'
          ? 'Entendí tu pregunta, pero el asistente está <b>apagado</b> en Configuración → Asistente. Enciéndelo y vuelve a preguntarme.'
          : !est.activo
          ? `Entendí tu pregunta, pero el proveedor elegido es <b>${prov}</b> y no hay una clave suya guardada. Ponla en Configuración → Asistente, o cambia de proveedor.`
          : 'Entendí tu pregunta, pero el asistente no pudo responder ahora mismo. Intenta de nuevo en un momento.';
      }
    }
  } catch (e: any) {
    console.error('[telegram-webhook]', e);
    reply = '⚠️ No pude consultar los datos ahora mismo: ' + e.message;
  }

  if (reply) {
    if (porVoz) {
      // El eco se recorta solo para no llenar el chat; la pregunta completa
      // sí se procesa entera. Se corta en un espacio para no partir palabras.
      let eco = entrada;
      if (eco.length > 350) {
        const corte = eco.lastIndexOf(' ', 350);
        eco = eco.slice(0, corte > 250 ? corte : 350) + '…';
      }
      await sendTelegramTo(chatId, `🎙️ <i>Te entendí completo; en resumen:</i> «${eco}»`);
      const ogg = await synthesize(reply).catch(() => null);
      if (ogg) {
        await sendChatAction(chatId, 'upload_voice');
        await sendTelegramVoiceTo(chatId, ogg);
      }
    }
    await sendTelegramTo(chatId, reply + firma, { dashboardButton: true });
  }
  return NextResponse.json({ ok: true });
}
