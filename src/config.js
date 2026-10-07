'use strict';
// Configurazione: variabili d'ambiente (.env) oppure /data/config.json scritto dal wizard.
// Le variabili d'ambiente hanno la precedenza: un'installazione configurata con .env non cambia.
const fs = require('fs');
const path = require('path');

// Tutte le chiavi gestite dal wizard; le prime sono obbligatorie per far partire il portale.
const OBBLIGATORIE = ['SSID', 'OMADA_URL', 'OMADA_ID', 'OMADA_SITE_ID', 'OMADA_CLIENT_ID', 'OMADA_CLIENT_SECRET', 'HOTSPOT_USER', 'HOTSPOT_PASS', 'TG_TOKEN', 'TG_CHAT'];
const FACOLTATIVE = ['TG_ADMIN', 'TG_THREAD', 'TG_TOPIC', 'TG_LANG', 'DURATE', 'SCADENZA_MIN', 'PAUSA_RIFIUTO_MIN', 'MAX_IN_ATTESA'];
const CHIAVI = [...OBBLIGATORIE, ...FACOLTATIVE];
// Mai mostrate nelle pagine del wizard.
const SEGRETE = ['OMADA_CLIENT_SECRET', 'HOTSPOT_PASS', 'TG_TOKEN'];

const fileConfig = (dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data')) => path.join(dir, 'config.json');

function leggi(file = fileConfig()) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

// Copia nel processo i valori del file che l'ambiente non definisce già. Da chiamare prima di
// caricare omada.js e telegram.js, che leggono la configurazione all'avvio.
function carica(file = fileConfig()) {
  const dati = leggi(file);
  for (const k of CHIAVI) if (!process.env[k] && dati[k] !== undefined && dati[k] !== '') process.env[k] = String(dati[k]);
  return dati;
}

const mancanti = () => OBBLIGATORIE.filter(k => !process.env[k]);

// Scrive il file in modo atomico, leggibile solo dal proprietario (contiene segreti).
function salva(valori, file = fileConfig()) {
  const dati = { ...leggi(file) };
  for (const k of CHIAVI) if (valori[k] !== undefined) dati[k] = String(valori[k]);
  dati.salvato = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dati, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return dati;
}

module.exports = { OBBLIGATORIE, FACOLTATIVE, CHIAVI, SEGRETE, fileConfig, leggi, carica, mancanti, salva };
