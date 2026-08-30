/**
 * Corre el job completo desde tu computadora (útil para probar credenciales y la primera carga):
 *   cp .env.example .env   (y rellena los valores)
 *   npm run run:local
 */
import 'dotenv/config';
import { runDaily } from '../lib/job';

runDaily()
  .then((r) => {
    console.log(r.log.join('\n'));
    process.exit(r.ok ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
