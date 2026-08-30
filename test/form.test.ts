import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcado } from '../lib/form.ts';

/**
 * Regresión: el panel manda el oculto "false" ANTES del checkbox "true".
 * Leerlo con form.get() devolvía siempre false y por eso las invitaciones
 * salían sin auto-aprobación y sin los permisos que se marcaban.
 */
test('marcado lee la casilla aunque venga después del campo oculto', () => {
  const marcada = new FormData();
  marcada.append('auto_aprobar', 'false');   // oculto, siempre presente
  marcada.append('auto_aprobar', 'true');    // checkbox marcado
  assert.equal(marcado(marcada, 'auto_aprobar'), true);

  const sinMarcar = new FormData();
  sinMarcar.append('auto_aprobar', 'false');
  assert.equal(marcado(sinMarcar, 'auto_aprobar'), false);

  assert.equal(marcado(new FormData(), 'no_existe'), false);
});
