'use strict';
// Nuova password per il pannello /admin, quando quella vecchia è persa:
//   docker exec <container> node src/reset-password.js
// La stampa una volta sola e salva solo il suo hash in /data/config.json. Il portale la usa subito,
// senza riavvio, e le sessioni già aperte del pannello non valgono più.
const crypto = require('crypto');
const config = require('./config');
const { hashPassword } = require('./admin');

// Nell'ambiente (.env, docker run -e) la password ha la precedenza sul file: lì va cambiata a mano.
if (process.env.ADMIN_PASS || process.env.ADMIN_HASH) {
  const k = process.env.ADMIN_PASS ? 'ADMIN_PASS' : 'ADMIN_HASH';
  console.error(`${k} is set in the container environment and overrides /data/config.json.\n` +
    `Remove ${k} from your .env (or docker run -e), recreate the container (docker compose up -d) and run this again.`);
  process.exit(1);
}

// 16 caratteri senza quelli che si confondono (0/O, 1/l/I), a gruppi di 4: facile da leggere e da digitare.
const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const pw = Array.from(crypto.randomBytes(16), b => alfabeto[b % alfabeto.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
config.salva({ ADMIN_HASH: hashPassword(pw) });
console.log(`New admin password: ${pw}\nSaved as a hash in ${config.fileConfig()}. It works right away; open admin sessions are signed out.`);
