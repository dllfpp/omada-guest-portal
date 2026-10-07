'use strict';
// Punto di ingresso del container.
// - Configurazione completa (variabili d'ambiente e/o /data/config.json): parte il portale.
// - Configurazione incompleta, oppure esiste /data/setup: parte il wizard sulla stessa porta; dopo il
//   salvataggio il wizard si chiude e il portale parte nello stesso processo, senza riavvio.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const PORT = Number(process.env.PORT || 8097);
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE_SETUP = path.join(DATA, 'setup');
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Chiavi impostate dall'ambiente prima di leggere il file: il wizard avvisa che hanno la precedenza.
const daAmbiente = config.CHIAVI.filter(k => process.env[k]);
config.carica(config.fileConfig(DATA));

function portale() {
  config.carica(config.fileConfig(DATA));
  require('./server').avvia();
}

const mancanti = config.mancanti();
if (!mancanti.length && !fs.existsSync(FILE_SETUP)) {
  portale();
} else {
  const { creaWizard } = require('./wizard');
  const w = creaWizard({
    daAmbiente, fileSetup: FILE_SETUP, log,
    alSalvataggio: () => {
      w.server.close();
      w.server.closeAllConnections?.();
      w.server.once('close', portale);
    },
  });
  w.server.listen(PORT, () => {
    const riga = '='.repeat(58);
    console.log([
      riga,
      ' Omada guest approval portal: setup',
      fs.existsSync(FILE_SETUP) ? ' (requested with /data/setup)' : ` Missing configuration: ${mancanti.join(', ')}`,
      ` Open the portal address in a browser (port ${PORT} inside the`,
      ' container, or the host port you mapped to it) and enter',
      ` Setup code: ${w.codice}`,
      riga,
    ].join('\n'));
  });
}
