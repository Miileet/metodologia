/* Regenera la base de datos con los datos de prueba (usuarios, horarios). */
'use strict';
const store = require('./lib/store');

store.reset();

const db = store.getDb();
console.log('');
console.log('  ✅ Base de datos regenerada en data/db.json');
console.log('     Usuarios:');
for (const u of db.users) {
  const extra = u.role === 'medico' ? ` (${u.especialidad})` : '';
  console.log(`       - ${u.email} · ${u.role}${extra} · pass: ${store.DEMO_PASSWORD}`);
}
console.log('');
console.log('  Ejecutá "npm start" para levantar la app.');
console.log('');
