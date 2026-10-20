import { NextRequest, NextResponse } from 'next/server';
import { sql, ensureSchema } from '@/lib/db';
import { leerCookie, COOKIE } from '@/lib/session';
import { contratosDeUsuario, type Contrato } from '@/lib/contracts';
import { PortalClient } from '@/lib/portal';
import { distribuidora } from '@/lib/utilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function page(title: string, detail: string, status: number) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#eef2f7;color:#14202e}
       .c{max-width:380px;background:#fff;border:1px solid #e3e9f1;border-radius:18px;padding:28px;text-align:center}
       h1{font-size:18px;margin:0 0 8px}p{color:#51617a;margin:0 0 18px;font-size:14px}
       a{color:#2a78d6;text-decoration:none;font-weight:600}</style>
     <div class="c"><h1>${title}</h1><p>${detail}</p><a href="/">← Volver al dashboard</a></div>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

/** Sirve el PDF de una factura guardada en la base de datos. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return page('Enlace inválido', 'El identificador de la factura no es válido.', 400);
  try {
    await ensureSchema();

    // La factura es de una cuenta concreta: solo la ve quien tiene acceso a
    // esa cuenta. Si no, cualquiera podría pedir el PDF de otra persona
    // probando números en la URL.
    const sesion = await leerCookie(req.cookies.get(COOKIE)?.value, process.env.DASHBOARD_PASSWORD || '');
    if (!sesion) return page('Necesitas entrar', 'Entra a la app para ver tus facturas.', 401);
    // Todas las cuentas que esta persona puede ver (tiene varias, o se las
    // compartieron). Los id de la base llegan como texto: se comparan como número.
    const mias = await contratosDeUsuario(sesion.uid);

    // Se mira primero si la factura existe (sin filtrar), para distinguir "no
    // es tuya" de "no está guardada".
    const [factura] = await sql()<{ pdf: Uint8Array | null; contract_id: string | number | null }[]>`
      SELECT pdf, contract_id FROM invoices WHERE id = ${id}`;
    if (!factura) {
      return page('Factura no encontrada', 'Esa factura todavía no se ha leído del portal. Se baja sola en la próxima sincronización.', 404);
    }
    const dueno = mias.find((c) => c.id === Number(factura.contract_id));
    if (!dueno) {
      return page('Factura de otra cuenta', 'Esta factura no pertenece a tus cuentas de luz.', 403);
    }

    // Sin PDF guardado: se baja AHORA del portal y se guarda para siempre.
    // La distribuidora va borrando las facturas viejas; la app es el archivo.
    if (!factura.pdf) {
      const bajado = await bajarYGuardar(id, dueno);
      if (!bajado) {
        return page(
          'No se pudo bajar el PDF',
          'El portal de la distribuidora no lo entregó ahora mismo (o ya lo borró de su lado). Se vuelve a intentar solo en cada sincronización.',
          502,
        );
      }
      factura.pdf = bajado;
    }

    // Comprobar que lo guardado ES un PDF. Si no y se manda igual como
    // application/pdf, el navegador solo enseña "No se pudo cargar el
    // documento PDF", que no dice nada de qué pasó.
    const bytes = Buffer.from(factura.pdf);
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
      console.error('[invoice-pdf] contenido no es PDF', id, bytes.length, bytes.subarray(0, 16).toString('latin1'));
      return page(
        'El archivo guardado no es un PDF',
        `Se guardaron ${bytes.length} bytes para esta factura, pero no son un PDF válido. Vuelve a sincronizar desde “Mi cuenta” para bajarlo de nuevo.`,
        502,
      );
    }

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `inline; filename="factura-${id}.pdf"`,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (e: any) {
    console.error('[invoice-pdf]', id, e);
    return page('No se pudo abrir la factura', e.message, 500);
  }
}

/** Baja el PDF de la factura del portal con las credenciales de su cuenta y lo guarda. */
async function bajarYGuardar(id: string, c: Contrato): Promise<Uint8Array | null> {
  if (!c.email || !c.password) return null;
  try {
    const cliente = new PortalClient(c.email, c.password, distribuidora(c.utility).base);
    await cliente.login();
    const pdf = await cliente.getInvoicePdf(id);
    await sql()`UPDATE invoices SET pdf = ${Buffer.from(pdf)} WHERE id = ${id}`;
    return pdf;
  } catch (e: any) {
    console.error('[invoice-pdf] no se pudo bajar del portal', id, e?.message);
    return null;
  }
}
