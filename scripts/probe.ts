/**
 * Prueba SOLO el login y el scraping (sin base de datos). Imprime lo que se leyó.
 *   npm run run:local -- (no) → usa:  npx tsx scripts/probe.ts
 */
import 'dotenv/config';
import { EdenorteClient } from '../lib/edenorte';
import { extractPdfItems } from '../lib/pdf';
import { parseInvoiceItems } from '../lib/parsers';

(async () => {
  const c = new EdenorteClient(process.env.EDENORTE_EMAIL!, process.env.EDENORTE_PASSWORD!);
  await c.login();
  console.log('login OK');
  const nics = process.env.EDENORTE_NIC ? [process.env.EDENORTE_NIC] : await c.getContracts();
  console.log('contratos:', nics);
  for (const nic of nics) {
    const { data } = await c.getTeleconsumo(nic);
    console.log('teleconsumo:', JSON.stringify(data, null, 2));
    const hist = await c.getHistorial(nic);
    console.log('historial:', hist);
    if (hist[0]) {
      const pdf = await c.getInvoicePdf(hist[0].pdfUrl);
      const items = await extractPdfItems(pdf);
      console.log('factura más reciente:', JSON.stringify(parseInvoiceItems(items), null, 2));
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
