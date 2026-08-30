import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISTRIBUIDORAS, distribuidora } from '../lib/utilities.ts';

/**
 * Regresión: al sacar el nombre de la empresa del código, la base de la
 * distribuidora probada se cambió por un dominio que NO existe. El síntoma
 * fue un "fetch failed" diario sin explicación, con el portal funcionando.
 */
test('la distribuidora probada apunta a su dominio real', () => {
  const d = distribuidora('edenorte');
  assert.equal(d.base, 'https://ofv.edenorte.com.do');
  assert.equal(d.soportada, true);
});

test('toda distribuidora tiene una base https bien formada', () => {
  for (const d of DISTRIBUIDORAS) {
    assert.match(d.base, /^https:\/\/[a-z0-9.-]+\.do$/, `base rara en ${d.id}`);
    assert.doesNotMatch(d.base, /\/$/, `${d.id}: la base no debe terminar en /`);
  }
});

test('una distribuidora desconocida cae en la probada', () => {
  assert.equal(distribuidora('no-existe').id, 'edenorte');
});
