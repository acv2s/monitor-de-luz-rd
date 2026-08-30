import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasDeAtraso, diasSinPublicar, fraseAtraso } from '../lib/lag.ts';

/**
 * El caso real: es sábado y el portal solo tiene datos hasta el jueves.
 * Esos dos días vacíos NO son consumo cero — son datos que aún no publican.
 */
const SABADO = new Date('2026-08-29T15:00:00Z');

test('cuenta los días de atraso del portal', () => {
  assert.equal(diasDeAtraso('2026-08-27', SABADO), 2);   // jueves -> sábado
  assert.equal(diasDeAtraso('2026-08-29', SABADO), 0);   // al día
  assert.equal(diasDeAtraso(null, SABADO), 0);
});

test('lista los días que todavía no publican', () => {
  assert.deepEqual(diasSinPublicar('2026-08-27', SABADO), ['2026-08-28', '2026-08-29']);
  assert.deepEqual(diasSinPublicar('2026-08-29', SABADO), []);
});

test('explica el atraso sin alarmar', () => {
  const frase = fraseAtraso({ datosHasta: '2026-08-27', dias: 2, sinPublicar: [], habitual: 2 });
  assert.match(frase!, /2 días de atraso/);
  assert.doesNotMatch(frase!, /cero|error|problema|falla/i);
  assert.equal(fraseAtraso({ datosHasta: null, dias: 0, sinPublicar: [], habitual: 2 }), null);
});
