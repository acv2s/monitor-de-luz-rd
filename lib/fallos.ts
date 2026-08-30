export type Nivel = 'info' | 'warning' | 'critical';

/**
 * Qué decirle a la persona cuando la corrida falla. "fetch failed" no le
 * dice nada a nadie: casi siempre es que la oficina virtual no respondió, y
 * lo único que hay que hacer es esperar. Solo se pide acción cuando de
 * verdad depende de ella (credenciales).
 */
export function porQueFallo(msg: string): { texto: string; nivel: Nivel } {
  if (/fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket|network|timeout|502|503|504/i.test(msg)) {
    return {
      texto: 'Hoy no pudimos entrar a la oficina virtual: no respondió. Suele ser cosa de ellos y se arregla solo — se reintenta mañana. No tienes que hacer nada; tus datos siguen guardados.',
      nivel: 'info',
    };
  }
  if (/login fallido|contraseña|password|credencial/i.test(msg)) {
    return {
      texto: 'No pudimos entrar con tu correo y tu contraseña de la oficina virtual. Si los cambiaste allá, actualízalos en “Mi cuenta”.',
      nivel: 'warning',
    };
  }
  if (/no se encontraron contratos|sin NIC/i.test(msg)) {
    return {
      texto: 'Entramos a tu cuenta pero no aparece ningún NIC asociado. Revísalo en “Mi cuenta”.',
      nivel: 'warning',
    };
  }
  return { texto: `No pudimos leer tu consumo hoy: ${msg}. Se reintenta mañana.`, nivel: 'info' };
}
