import { blocks, tags, textOf } from './html';
import {
  parseTeleconsumo, parseHistorial, parseContractLinks,
  type TeleconsumoData, type InvoiceLink,
} from './parsers';

const BASE = 'https://ofv.edenorte.com.do';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Cliente HTTP para la Oficina Virtual de Edenorte (Yii2).
 * - Mantiene la sesión con un "cookie jar" manual.
 * - Maneja el token CSRF de Yii (meta csrf-token / input _csrf).
 * - Todo el contenido es renderizado en servidor: no hace falta navegador headless.
 */
export class EdenorteClient {
  private cookies = new Map<string, string>();
  loggedIn = false;

  constructor(private email: string, private password: string) {}

  // ---------- HTTP ----------

  private cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private storeCookies(res: Response) {
    const anyHeaders = res.headers as any;
    const list: string[] = typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []);
    for (const c of list) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async request(path: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
    let url = path.startsWith('http') ? path : BASE + path;
    let method = init.method || 'GET';
    let body = init.body;
    for (let i = 0; i <= maxRedirects; i++) {
      const res = await fetch(url, {
        ...init,
        method,
        body,
        redirect: 'manual',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
          'Accept-Language': 'es-DO,es;q=0.9',
          Cookie: this.cookieHeader(),
          Referer: BASE + '/',
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      this.storeCookies(res);
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location')!, url).toString();
        method = 'GET';
        body = undefined;
        continue;
      }
      return res;
    }
    throw new Error('Demasiadas redirecciones: ' + url);
  }

  async getHtml(path: string): Promise<string> {
    const res = await this.request(path);
    const html = await res.text();
    if (res.status >= 400) throw new Error(`HTTP ${res.status} en ${path}`);
    return html;
  }

  // ---------- Login ----------

  static isLoginPage(html: string) {
    return /type=["']password["']/i.test(html);
  }

  async login(): Promise<void> {
    // 1) obtener el formulario (la raíz redirige al login si no hay sesión)
    let html = await this.getHtml('/user/login');
    if (!EdenorteClient.isLoginPage(html)) html = await this.getHtml('/');
    if (!EdenorteClient.isLoginPage(html)) {
      // ya hay sesión válida
      this.loggedIn = true;
      return;
    }

    const form = blocks(html, 'form').find((f) => /type=["']?password/i.test(f.inner));
    if (!form) throw new Error('No se encontró el formulario de login');

    const action = form.attrs.action || '/user/login';
    const fields = new URLSearchParams();
    const inputs = tags(form.inner, 'input').map((t) => t.attrs);
    for (const inp of inputs) {
      if (!inp.name) continue;
      const type = (inp.type || 'text').toLowerCase();
      if (['submit', 'button', 'checkbox', 'radio'].includes(type)) continue;
      fields.set(inp.name, inp.value || '');
    }

    // usuario / contraseña: por nombre de campo o por tipo
    const passName = inputs.find((i) => (i.type || '').toLowerCase() === 'password')?.name;
    if (!passName) throw new Error('No se encontró el campo de contraseña');
    const userName =
      inputs.find((i) => ['text', 'email'].includes((i.type || 'text').toLowerCase()) && /login|email|user|correo|usuario/i.test(i.name || ''))?.name
      || inputs.find((i) => ['text', 'email'].includes((i.type || 'text').toLowerCase()) && i.name)?.name;
    if (!userName) throw new Error('No se encontró el campo de usuario en el login');

    fields.set(userName, this.email);
    fields.set(passName, this.password);
    const remember = inputs.find((i) => (i.type || '').toLowerCase() === 'checkbox')?.name;
    if (remember) fields.set(remember, '1');

    // token CSRF también en meta (Yii2)
    const csrfMeta = tags(html, 'meta').find((m) => m.attrs.name === 'csrf-token')?.attrs.content;
    if (csrfMeta && !fields.has('_csrf')) fields.set('_csrf', csrfMeta);

    // 2) enviar
    const res = await this.request(action, {
      method: 'POST',
      body: fields.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE },
    });
    const after = await res.text();
    if (EdenorteClient.isLoginPage(after)) {
      const errBlock = after.match(/<div[^>]*class="[^"]*(?:help-block|alert|error-summary|invalid-feedback)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const err = errBlock ? textOf(errBlock[1]) : '';
      throw new Error('Login fallido' + (err ? `: ${err}` : ' (revisa EDENORTE_EMAIL / EDENORTE_PASSWORD)'));
    }
    // 3) verificar con una página protegida
    const check = await this.getHtml('/contratos');
    if (EdenorteClient.isLoginPage(check)) throw new Error('Login fallido: la sesión no quedó activa');
    this.loggedIn = true;
  }

  // ---------- Datos ----------

  /** NICs (contratos) asociados a la cuenta. */
  async getContracts(): Promise<string[]> {
    const html = await this.getHtml('/teleconsumo');
    const nics = parseContractLinks(html, 'teleconsumo');
    if (nics.length) return nics;
    const html2 = await this.getHtml('/historial');
    return parseContractLinks(html2, 'historial');
  }

  async getTeleconsumo(nic: string): Promise<{ data: TeleconsumoData; html: string }> {
    const html = await this.getHtml(`/teleconsumo/${nic}`);
    if (EdenorteClient.isLoginPage(html)) throw new Error('Sesión expirada al leer Teleconsumo');
    const data = parseTeleconsumo(html);
    if (!data.nic) data.nic = nic;
    return { data, html };
  }

  async getHistorial(nic: string): Promise<InvoiceLink[]> {
    const html = await this.getHtml(`/historial/${nic}`);
    if (EdenorteClient.isLoginPage(html)) throw new Error('Sesión expirada al leer Historial');
    return parseHistorial(html);
  }

  async getInvoicePdf(pathOrId: string): Promise<Uint8Array> {
    const path = pathOrId.startsWith('/') ? pathOrId : `/factpdf/${pathOrId}`;
    const res = await this.request(path, { headers: { Accept: 'application/pdf,*/*' } });
    const buf = new Uint8Array(await res.arrayBuffer());
    const head = Buffer.from(buf.slice(0, 5)).toString('latin1');
    if (res.status !== 200 || !head.startsWith('%PDF')) {
      throw new Error(`La factura ${path} no está disponible (HTTP ${res.status}, tipo ${res.headers.get('content-type')})`);
    }
    return buf;
  }
}
