import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { saveSetting, CLAVES } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/** Carga una configuración exportada desde otra instalación. */
export async function POST(req: NextRequest) {
  await ensureSchema();
  const form = await req.formData();
  const archivo = form.get('archivo');
  let texto = String(form.get('json') ?? '');
  if (archivo && typeof archivo !== 'string') texto = await archivo.text();

  let doc: any;
  try {
    doc = JSON.parse(texto);
  } catch {
    return NextResponse.redirect(new URL('/config?import=formato', req.url), 303);
  }
  const ajustes = doc?.ajustes ?? doc;
  if (!ajustes || typeof ajustes !== 'object') {
    return NextResponse.redirect(new URL('/config?import=formato', req.url), 303);
  }
  let n = 0;
  for (const clave of CLAVES) {
    const valor = ajustes[clave];
    if (typeof valor !== 'string') continue;
    await saveSetting(clave, valor.trim());
    n++;
  }
  return NextResponse.redirect(new URL(`/config?import=${n}`, req.url), 303);
}
