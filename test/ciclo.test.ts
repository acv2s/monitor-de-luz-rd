import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cierreDelCiclo, diasParaCierre } from '../lib/ciclo.ts';

test('con día de corte 12, el ciclo que empezó el 12 oct cierra el 12 nov', () => {
  assert.equal(cierreDelCiclo('2026-10-12', 12), '2026-11-12');
});
test('un ciclo que empezó el 13 oct con corte 12 también cierra el 12 nov', () => {
  assert.equal(cierreDelCiclo('2026-10-13', 12), '2026-11-12');
});
test('corte 31 en un mes de 30 días cae el último día', () => {
  assert.equal(cierreDelCiclo('2026-10-31', 31), '2026-11-30');
});
test('sin día de corte se estima con la duración', () => {
  assert.equal(cierreDelCiclo('2026-10-01', null, 30), '2026-10-31');
});
test('días para el cierre nunca es negativo', () => {
  assert.equal(diasParaCierre('2026-11-12', new Date('2026-11-20T15:00:00Z')), 0);
  assert.equal(diasParaCierre('2026-11-12', new Date('2026-11-09T15:00:00Z')), 3);
});
