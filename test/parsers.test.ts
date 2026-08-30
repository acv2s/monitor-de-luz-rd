import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseTeleconsumo, parseHistorial, parseInvoiceItems, parseContractLinks, chartToDaily } from '../lib/parsers';
import { blocks, tags } from '../lib/html';
import { INVOICE_ITEMS } from './fixtures/invoice-items';
import { explainInvoice } from '../lib/analysis';

const fx = (n: string) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

test('parseTeleconsumo lee todos los campos y la serie diaria', () => {
  const t = parseTeleconsumo(fx('teleconsumo.html'));
  assert.equal(t.nic, '1234567');
  assert.equal(t.medidor, '11223344');
  assert.equal(t.tarifa, 'BN1');
  assert.equal(t.titular, 'JUAN ANTONIO PEREZ EJEMPLO');
  assert.equal(t.lecturaActivaKwh, 43853.548);
  assert.equal(t.fechaLectura, '2026-08-27');
  assert.equal(t.fechaUltimaFactura, '2026-08-15');
  assert.equal(t.datosHasta, '2026-08-27');
  assert.equal(t.consumoHastaFechaKwh, 281);
  assert.equal(t.proyeccionKwh, 725);
  assert.equal(t.diaMayorConsumo, '2026-08-15');
  assert.equal(t.valorMayorKwh, 30);
  assert.equal(t.rawChart.length, 14);
  // días 28 (futuro) se descarta; 27 se guarda (aunque venga 0, se corrige mañana)
  assert.equal(t.daily.length, 13);
  assert.deepEqual(t.daily[0], { day: '2026-08-15', kwh: 30 });
  assert.deepEqual(t.daily[12], { day: '2026-08-27', kwh: 0 });
  const suma = t.daily.reduce((a, b) => a + b.kwh, 0);
  assert.equal(suma, 282); // ≈ consumo hasta la fecha (281) — Edenorte redondea
});

test('chartToDaily cruza fin de mes', () => {
  const d = chartToDaily([['30', 5], ['31', 6], ['1', 7], ['2', 8]], '2026-07-30', null);
  assert.deepEqual(d.map((x) => x.day), ['2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02']);
});

test('parseHistorial extrae facturas y fechas', () => {
  const h = parseHistorial(fx('historial.html'));
  assert.equal(h.length, 3);
  assert.deepEqual(h[0], { id: '1234567097', pdfUrl: '/factpdf/1234567097', fechaEmision: '2026-08-15', tipo: 'Recibos de consumos', cliente: 'JUAN ANTONIO PEREZ EJEMPLO' });
  assert.equal(h[1].pdfUrl, '/factpdf/1234567096');
  assert.equal(h[2].fechaEmision, '2026-03-15');
});

test('parseContractLinks encuentra los NIC', () => {
  const html = '<a href="/teleconsumo/1234567">Ver</a> <a href="/teleconsumo">Teleconsumo</a>';
  assert.deepEqual(parseContractLinks(html, 'teleconsumo'), ['1234567']);
});

test('formulario de login: campos detectados', () => {
  const html = fx('login.html');
  const form = blocks(html, 'form').find((f) => /type=["']?password/i.test(f.inner))!;
  assert.equal(form.attrs.action, '/user/login');
  const inputs = tags(form.inner, 'input').map((t) => t.attrs);
  assert.equal(inputs.find((i) => i.type === 'password')?.name, 'login-form[password]');
  assert.equal(inputs.find((i) => i.name === '_csrf')?.value, 'FORM-TOKEN-XYZ==');
  assert.equal(tags(html, 'meta').find((m) => m.attrs.name === 'csrf-token')?.attrs.content, 'META-TOKEN');
});

test('parseInvoiceItems lee la factura completa', () => {
  const inv = parseInvoiceItems(INVOICE_ITEMS);
  assert.equal(inv.contrato, '1234567');
  assert.equal(inv.numeroFactura, '202600000001');
  assert.equal(inv.refPago, '1234567097');
  assert.equal(inv.fechaEmision, '2026-08-15');
  assert.equal(inv.periodoInicio, '2026-07-15');
  assert.equal(inv.periodoFin, '2026-08-15');
  assert.equal(inv.diasFacturados, 31);
  assert.equal(inv.lecturaAnterior, 42769);
  assert.equal(inv.lecturaActual, 43568);
  assert.equal(inv.consumoKwh, 799);
  assert.equal(inv.cargoFijo, 126.81);
  assert.equal(inv.precioKwh, 14.04);
  assert.equal(inv.energiaRd, 11217.96);
  assert.equal(inv.importeSinSubsidio, 13258.51);
  assert.equal(inv.subsidioRd, -1913.74);
  assert.equal(inv.facturadoRd, 11344.77);
  assert.equal(inv.balancePendiente, 7039.97);
  assert.equal(inv.totalAPagar, 18384.74);
  assert.equal(inv.pagueAntesDe, '2026-09-14');
  assert.equal(inv.tarifa, 'BTS-1');
  assert.deepEqual(inv.tramos, [{ kwh: 799, precio: 14.04, importe: 11217.96 }]);
  assert.equal(inv.historico.length, 13);
  assert.deepEqual(inv.historico[0], { month: '2025-08-01', kwh: 517 });
  assert.deepEqual(inv.historico[5], { month: '2026-01-01', kwh: 468 });
  assert.deepEqual(inv.historico[12], { month: '2026-08-01', kwh: 799 });
});

test('explainInvoice genera texto coherente', () => {
  const inv = parseInvoiceItems(INVOICE_ITEMS);
  const daily = Array.from({ length: 31 }, (_, i) => ({ day: `2026-07-${String(15 + i).padStart(2, '0')}`, kwh: 20 + (i % 5) * 3 }))
    .map((d) => (d.day > '2026-07-31' ? { ...d, day: '2026-08-' + String(Number(d.day.slice(-2)) - 31).padStart(2, '0') } : d));
  const txt = explainInvoice(inv, daily, { consumoKwh: 652, facturadoRd: 9000 });
  assert.match(txt, /799 kWh/);
  assert.match(txt, /Subió 147 kWh \(\+23%\)/);
  assert.match(txt, /mes MÁS ALTO/);
  assert.match(txt, /Días de mayor consumo/);
});
