import { test } from 'node:test';
import assert from 'node:assert/strict';
import { porQueFallo } from '../lib/fallos.ts';

/**
 * El caso real: llegó un aviso que decía "fetch failed". Eso no le dice nada
 * a nadie y parece que la app está rota, cuando solo hay que esperar.
 */
test('un fallo de red se explica y no alarma', () => {
  const r = porQueFallo('fetch failed');
  assert.equal(r.nivel, 'info');
  assert.match(r.texto, /no respondió/);
  assert.match(r.texto, /No tienes que hacer nada/);
  assert.doesNotMatch(r.texto, /fetch failed/);
});

test('si el problema es la contraseña, sí se pide acción', () => {
  const r = porQueFallo('Login fallido: usuario o clave incorrectos');
  assert.equal(r.nivel, 'warning');
  assert.match(r.texto, /Mi cuenta/);
});

test('un error desconocido no se traga: se dice, pero sin alarmar', () => {
  const r = porQueFallo('algo rarísimo pasó');
  assert.equal(r.nivel, 'info');
  assert.match(r.texto, /algo rarísimo pasó/);
  assert.match(r.texto, /Se reintenta mañana/);
});
