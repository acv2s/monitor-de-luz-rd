/**
 * Cada casilla del panel manda DOS campos con el mismo nombre: un oculto en
 * "false" y, si está marcada, el checkbox en "true". form.get() devuelve solo
 * el primero (siempre "false"), así que hay que mirar todos los valores.
 * Leerlo mal dejaba las invitaciones sin auto-aprobación ni permisos.
 */
export function marcado(form: { getAll(nombre: string): unknown[] }, nombre: string): boolean {
  return form.getAll(nombre).map(String).includes('true');
}
