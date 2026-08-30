import fs from 'node:fs';
const ddl = fs.readFileSync('sql/schema.sql','utf8');
fs.writeFileSync('lib/schema.ts', '// Generado desde sql/schema.sql — no editar a mano (ver scripts/sync-schema.mjs)\nexport const DDL = ' + JSON.stringify(ddl) + ';\n');
console.log('lib/schema.ts actualizado');
