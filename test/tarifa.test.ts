import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costoDe, precioSiguienteKwh, kwhPorPresupuesto, type Tarifa } from '../lib/tarifa.ts';

/** Los tramos exactos de una factura real de 652 kWh (15/06 – 15/07, 30 días). */
const TARIFA: Tarifa = {
  tramos: [
    { kwh: 200, precio: 5.97 },
    { kwh: 100, precio: 8.51 },
    { kwh: 352, precio: 13.83 },
  ],
  precioMarginal: 13.83,
  cargoFijo: 126.81,
  umbral: 700,
  precioAlto: 14.04,
  desde: '2026-07-15',
};

test('reproduce la factura real: 652 kWh = RD$ 7,039.97', () => {
  // 126.81 + (200×5.97) + (100×8.51) + (352×13.83)
  assert.equal(Math.round(costoDe(652, TARIFA) * 100) / 100, 7039.97);
});

test('los tramos baratos se aplican en orden', () => {
  assert.equal(Math.round(costoDe(200, TARIFA) * 100) / 100, 126.81 + 1194);       // solo el primer tramo
  assert.equal(Math.round(costoDe(300, TARIFA) * 100) / 100, 126.81 + 1194 + 851); // los dos primeros
  assert.equal(costoDe(0, TARIFA), 126.81);                                        // solo el cargo fijo
});

test('pasar de 700 kWh cobra TODO el mes a tarifa alta', () => {
  const justoDebajo = costoDe(699, TARIFA);
  const justoEncima = costoDe(700, TARIFA);
  assert.equal(Math.round(justoEncima * 100) / 100, Math.round((126.81 + 700 * 14.04) * 100) / 100);
  // Un kWh más cuesta miles de pesos: es el aviso que da sentido a la app.
  assert.ok(justoEncima - justoDebajo > 2000, `el salto fue de ${justoEncima - justoDebajo}`);
});

test('el promedio subestima lo que cuesta el siguiente kWh', () => {
  const promedio = costoDe(652, TARIFA) / 652;              // ≈ 10.80
  const siguiente = precioSiguienteKwh(652, TARIFA);        // 13.83
  assert.ok(siguiente > promedio * 1.2, 'el marginal debe ser bastante mayor que el promedio');
  assert.equal(siguiente, 13.83);
  assert.equal(precioSiguienteKwh(150, TARIFA), 5.97);      // dentro del primer tramo
  assert.equal(precioSiguienteKwh(250, TARIFA), 8.51);      // dentro del segundo
});

test('un presupuesto se traduce a kWh con los tramos, no con el promedio', () => {
  const kwh = kwhPorPresupuesto(7039.97, TARIFA);
  assert.equal(kwh, 652);
  assert.ok(costoDe(kwh, TARIFA) <= 7039.97);
  assert.ok(costoDe(kwh + 1, TARIFA) > 7039.97);
});
