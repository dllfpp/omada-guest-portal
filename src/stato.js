'use strict';
// Richieste di accesso, salvate su disco così sopravvivono al riavvio del container.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LIMITI = {
  attesaMin: Number(process.env.SCADENZA_MIN || 10),   // una richiesta senza risposta scade dopo N minuti
  pausaRifiutoMin: Number(process.env.PAUSA_RIFIUTO_MIN || 15), // dopo un rifiuto lo stesso dispositivo aspetta
  maxInAttesa: Number(process.env.MAX_IN_ATTESA || 5),  // tetto globale contro le raffiche
};

class Stato {
  constructor(file) {
    this.file = file;
    this.dati = { richieste: {}, offset: 0 };
    try { this.dati = { ...this.dati, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* primo avvio */ }
  }

  salva() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.dati, null, 1));
    fs.renameSync(tmp, this.file);
  }

  get(id) { return this.dati.richieste[id] || null; }
  tutte() { return Object.values(this.dati.richieste); }

  // Ultima richiesta di un dispositivo, se esiste.
  perMac(mac) {
    return this.tutte().filter(r => r.mac === mac).sort((a, b) => b.creata - a.creata)[0] || null;
  }

  // Decide se un dispositivo può fare una nuova richiesta. Restituisce { ok } oppure { motivo, richiesta }.
  puoChiedere(mac, ora = Date.now()) {
    const ultima = this.perMac(mac);
    if (ultima?.stato === 'attesa') return { motivo: 'in-attesa', richiesta: ultima };
    if (ultima?.stato === 'ok' && ultima.scade > ora) return { motivo: 'gia-autorizzato', richiesta: ultima };
    if (ultima?.stato === 'no' && ora - ultima.chiusa < LIMITI.pausaRifiutoMin * 60000) {
      return { motivo: 'rifiutato', richiesta: ultima };
    }
    if (this.tutte().filter(r => r.stato === 'attesa').length >= LIMITI.maxInAttesa) return { motivo: 'troppe' };
    return { ok: true };
  }

  crea(campi, ora = Date.now()) {
    const id = crypto.randomBytes(12).toString('base64url');
    const r = { id, ...campi, stato: 'attesa', creata: ora, scadeAttesa: ora + LIMITI.attesaMin * 60000 };
    this.dati.richieste[id] = r;
    this.salva();
    return r;
  }

  aggiorna(id, campi) {
    const r = this.dati.richieste[id];
    if (!r) return null;
    Object.assign(r, campi);
    this.salva();
    return r;
  }

  // Richieste in attesa oltre il limite → scadute. Restituisce quelle appena scadute.
  scadute(ora = Date.now()) {
    const out = [];
    for (const r of this.tutte()) {
      if (r.stato === 'attesa' && ora > r.scadeAttesa) { r.stato = 'scaduta'; r.chiusa = ora; out.push(r); }
      if (r.stato === 'ok' && ora > r.scade) { r.stato = 'terminata'; r.chiusa = ora; }
    }
    // Lo storico oltre 30 giorni non serve.
    for (const r of this.tutte()) if (r.chiusa && ora - r.chiusa > 30 * 86400000) delete this.dati.richieste[r.id];
    if (out.length) this.salva();
    return out;
  }
}

module.exports = { Stato, LIMITI };
