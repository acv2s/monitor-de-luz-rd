import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuadraConLosDias } from '../lib/analysis';

const dias = (kwhs: number[]) => kwhs.map((kwh) => ({ kwh }));

test('un consumo acorde a los días publicados es creíble', () => {
  // 18 días de ~7 kWh ≈ 124; el portal dice 130 (el atraso explica la diferencia)
  assert.equal(cuadraConLosDias(130, dias(Array(18).fill(7))), true);
});

test('la lectura del medidor colada como consumo NO es creíble', () => {
  // El caso real: días de ~7 kWh (suma 124) y el portal reportando 787
  assert.equal(cuadraConLosDias(787, dias(Array(18).fill(7))), false);
});

test('con pocos días publicados no se juzga (arranque de ciclo)', () => {
  assert.equal(cuadraConLosDias(300, dias([5, 6])), true);
});

test('sin dato del portal no hay nada que juzgar', () => {
  assert.equal(cuadraConLosDias(null, dias(Array(10).fill(6))), true);
});
