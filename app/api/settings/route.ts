import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { saveSetting, CLAVES, SECRETAS } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Guarda los ajustes del panel. Protegida por el middleware del dashboard.
 * Un campo secreto vacío se deja como está (el formulario nunca reenvía el
 * valor guardado); para borrarlo se escribe la palabra "borrar".
 */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const form = await req.formData();
  for (const clave of CLAVES) {
    if (!form.has(clave)) continue;
    // los checkbox mandan "false" (oculto) y "true" si están marcados
    const valores = form.getAll(clave).map((v) => String(v));
    let valor = valores.includes('true') ? 'true' : valores[valores.length - 1] ?? '';
    valor = valor.trim();
    if (SECRETAS.includes(clave)) {
      if (!valor) continue;                       // vacío = no tocar
      if (valor.toLowerCase() === 'borrar') valor = '';
    }
    await saveSetting(clave, valor);
  }
  const volver = String(form.get('_volver') ?? '');
  return NextResponse.redirect(new URL(volver || '/config?ok=1', req.url), 303);
}
