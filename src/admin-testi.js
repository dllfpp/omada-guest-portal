'use strict';
// Testi del pannello di amministrazione, inglese (predefinito) e italiano.

const n = (x, uno, tanti) => `${x} ${x === 1 ? uno : tanti}`;

const ADMIN = {
  en: {
    titolo: 'Guest Wi-Fi admin',
    accesso: {
      titolo: 'Sign in', testo: 'Enter the admin password chosen in the setup wizard.',
      campo: 'Password', bottone: 'Sign in',
      errata: 'Wrong password.', bloccato: 'Too many wrong attempts: wait 10 minutes and try again.',
      spento: 'The admin panel is off: set an admin password in the setup wizard (Rules step) or with ADMIN_PASS.',
      rete: 'The admin panel can’t be opened from this network.',
      origine: 'The form came from another page: reload this page and sign in again.',
    },
    esci: 'Sign out',
    attivi: x => `Connected guests (${x})`, nessunAttivo: 'No guest has access right now.',
    attesa: x => `Waiting for approval (${x})`,
    storico: 'History (last 30 days)', nessunoStorico: 'No past requests yet.',
    sconosciuto: 'Unknown device', senzaNome: 'No name',
    scade: (ora, resto) => `Until ${ora} · ${resto} left`,
    resto: (h, m) => (h ? `${h} h ${m} min` : `${m} min`),
    piu: '+1 hour', meno: '−1 hour', nuova: 'New duration from now (hours)', imposta: 'Set', revoca: 'Revoke',
    esiti: { ok: 'approved', no: 'rejected', revocata: 'revoked', terminata: 'ended', scaduta: 'no answer', attesa: 'waiting' },
    durata: h => n(h, 'hour', 'hours'),
    conferma: {
      titolo: 'Revoke access?', testo: d => `${d} loses internet access right away.`,
      si: 'Revoke access', no: 'Cancel',
    },
    fatto: {
      piu: o => `Access extended until ${o}.`, meno: o => `Access shortened: it now ends at ${o}.`,
      nuova: o => `New duration set: access ends at ${o}.`, revoca: 'Access revoked.',
    },
    errori: {
      nonAttivo: 'This device no longer has access.', ore: m => `Use a whole number of hours from 1 to ${m}.`,
      troppoPoco: 'Less than a minute would be left: use Revoke instead.', troppo: m => `At most ${m} hours.`,
      controller: d => `The controller didn’t accept the change (${d}).`,
    },
    tg: o => `🛠 <b>Changed from the admin panel</b>: access until ${o}`,
    tgRevoca: o => `⛔ <b>Revoked from the admin panel</b> at ${o}`,
  },
  it: {
    titolo: 'Amministrazione Wi-Fi ospiti',
    accesso: {
      titolo: 'Accedi', testo: 'Inserisci la password di amministrazione scelta nel wizard.',
      campo: 'Password', bottone: 'Accedi',
      errata: 'Password sbagliata.', bloccato: 'Troppi tentativi sbagliati: aspetta 10 minuti e riprova.',
      spento: 'Il pannello è spento: imposta una password di amministrazione nel wizard (passo Regole) oppure con ADMIN_PASS.',
      rete: 'Il pannello non si può aprire da questa rete.',
      origine: 'Il modulo arriva da un’altra pagina: ricarica questa pagina e accedi di nuovo.',
    },
    esci: 'Esci',
    attivi: x => `Ospiti collegati (${x})`, nessunAttivo: 'In questo momento nessun ospite ha accesso.',
    attesa: x => `In attesa di approvazione (${x})`,
    storico: 'Storico (ultimi 30 giorni)', nessunoStorico: 'Ancora nessuna richiesta passata.',
    sconosciuto: 'Dispositivo sconosciuto', senzaNome: 'Senza nome',
    scade: (ora, resto) => `Fino alle ${ora} · restano ${resto}`,
    resto: (h, m) => (h ? `${h} h ${m} min` : `${m} min`),
    piu: '+1 ora', meno: '−1 ora', nuova: 'Nuova durata da adesso (ore)', imposta: 'Imposta', revoca: 'Revoca',
    esiti: { ok: 'autorizzato', no: 'rifiutato', revocata: 'revocato', terminata: 'terminato', scaduta: 'senza risposta', attesa: 'in attesa' },
    durata: h => n(h, 'ora', 'ore'),
    conferma: {
      titolo: 'Revocare l’accesso?', testo: d => `${d} perde subito l’accesso a internet.`,
      si: 'Revoca l’accesso', no: 'Annulla',
    },
    fatto: {
      piu: o => `Accesso allungato fino alle ${o}.`, meno: o => `Accesso accorciato: ora finisce alle ${o}.`,
      nuova: o => `Nuova durata impostata: l’accesso finisce alle ${o}.`, revoca: 'Accesso revocato.',
    },
    errori: {
      nonAttivo: 'Questo dispositivo non ha più l’accesso.', ore: m => `Usa un numero intero di ore da 1 a ${m}.`,
      troppoPoco: 'Resterebbe meno di un minuto: usa Revoca.', troppo: m => `Al massimo ${m} ore.`,
      controller: d => `Il controller non ha accettato la modifica (${d}).`,
    },
    tg: o => `🛠 <b>Modificato dal pannello</b>: accesso fino alle ${o}`,
    tgRevoca: o => `⛔ <b>Revocato dal pannello</b> alle ${o}`,
  },
};

module.exports = { ADMIN };
