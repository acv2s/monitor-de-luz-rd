/**
 * Notas de voz de Telegram: descarga el audio, lo transcribe y (opcional)
 * genera la respuesta hablada.
 *
 * Transcripción — se usa el primero que esté configurado:
 *   GROQ_API_KEY        (gratis/barato y muy rápido; modelo whisper-large-v3-turbo)
 *   OPENAI_API_KEY      (gpt-4o-mini-transcribe)
 * Voz de respuesta (opcional), si VOICE_REPLIES=true:
 *   ELEVENLABS_API_KEY  (voz más natural en español)  ·  o OPENAI_API_KEY
 */

import { setting, settingBool } from './settings';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024; // Telegram no entrega archivos mayores por bot API

/** Baja el archivo de audio que mandó el usuario. */
export async function downloadTelegramFile(fileId: string): Promise<{ data: Buffer; name: string } | null> {
  const token = await setting('TELEGRAM_BOT_TOKEN');
  if (!token) return null;
  const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json: any = await info.json();
  if (!json?.ok || !json.result?.file_path) {
    console.error('[voice] getFile falló', JSON.stringify(json).slice(0, 200));
    return null;
  }
  const path: string = json.result.file_path;
  if (json.result.file_size && json.result.file_size > MAX_AUDIO_BYTES) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!res.ok) return null;
  return { data: Buffer.from(await res.arrayBuffer()), name: path.split('/').pop() || 'audio.oga' };
}

export async function transcriptionAvailable(): Promise<boolean> {
  if (!(await settingBool('VOICE_ENABLED'))) return false;
  return !!((await setting('GROQ_API_KEY')) || (await setting('OPENAI_API_KEY')));
}

/** Convierte la nota de voz en texto. Devuelve null si no hay proveedor configurado. */
export async function transcribe(audio: Buffer, filename: string): Promise<string | null> {
  const groq = await setting('GROQ_API_KEY');
  const openai = await setting('OPENAI_API_KEY');
  const cfg = groq
    ? { url: 'https://api.groq.com/openai/v1/audio/transcriptions', key: groq, model: 'whisper-large-v3-turbo' }
    : openai
      ? { url: 'https://api.openai.com/v1/audio/transcriptions', key: openai, model: 'gpt-4o-mini-transcribe' }
      : null;
  if (!cfg) return null;

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/ogg' }), filename.endsWith('.oga') ? filename.replace(/\.oga$/, '.ogg') : filename);
  form.append('model', cfg.model);
  form.append('language', 'es');
  form.append('response_format', 'json');

  const res = await fetch(cfg.url, { method: 'POST', headers: { Authorization: `Bearer ${cfg.key}` }, body: form });
  if (!res.ok) {
    console.error('[voice] transcripción falló', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const json: any = await res.json();
  return (json.text || '').trim() || null;
}

/** Genera la respuesta en audio OGG/Opus (lo que Telegram acepta como nota de voz). */
export async function synthesize(text: string): Promise<Buffer | null> {
  if (!(await settingBool('VOICE_REPLIES'))) return null;
  // Telegram no renderiza HTML dentro del audio: se lee el texto plano.
  const plain = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1800);
  if (!plain) return null;

  const eleven = await setting('ELEVENLABS_API_KEY');
  if (eleven) {
    const voice = (await setting('ELEVENLABS_VOICE_ID')) || 'JBFqnCBsd6RMkjVDRZzb';
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=opus_48000_64`, {
      method: 'POST',
      headers: { 'xi-api-key': eleven, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: plain, model_id: 'eleven_flash_v2_5' }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    console.error('[voice] ElevenLabs falló', res.status, (await res.text()).slice(0, 200));
  }

  const openai = await setting('OPENAI_API_KEY');
  if (openai) {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: plain, response_format: 'opus' }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    console.error('[voice] OpenAI TTS falló', res.status, (await res.text()).slice(0, 200));
  }
  return null;
}
