'use strict';
// Testi in inglese (predefinito) e italiano.
// Pagine dell'ospite: lingua dal browser (Accept-Language), forzabile con ?lang=it|en.
// Messaggi Telegram per il proprietario: lingua da TG_LANG (en predefinito).

const LINGUE = ['en', 'it'];

// "it-IT,it;q=0.9,en;q=0.8" → 'it'. Vince la prima lingua supportata in ordine di preferenza (q).
function linguaDa(acceptLanguage, forzata) {
  if (LINGUE.includes(forzata)) return forzata;
  const voci = String(acceptLanguage || '').split(',').map((v, i) => {
    const [tag, ...par] = v.trim().toLowerCase().split(';');
    const q = Number((par.find(p => p.trim().startsWith('q=')) || 'q=1').trim().slice(2));
    return { lingua: tag.split('-')[0], q: Number.isFinite(q) ? q : 0, i };
  }).filter(v => v.lingua && v.q > 0).sort((a, b) => b.q - a.q || a.i - b.i);
  return voci.find(v => LINGUE.includes(v.lingua))?.lingua || 'en';
}

const n = (x, uno, tanti) => `${x} ${x === 1 ? uno : tanti}`;

const PAGINE = {
  en: {
    locale: 'en-GB',
    sottotitolo: 'Guest Wi-Fi',
    nota: 'Separate network: connected devices can’t see each other and can’t reach the home network.',
    richiesta: {
      titolo: 'Ask for internet access',
      testo: 'This is the guest network. Your request goes to whoever manages the network, who approves it from their phone.',
      nome: 'Your name', facoltativo: '(optional)', aiuto: 'It helps tell who is asking to connect.', bottone: 'Ask for access',
    },
    attesa: {
      titolo: 'Request sent', testo: 'Waiting for approval. This page refreshes by itself: you can leave it open.',
      sr: 'Waiting', scade: 'Request expires at', nome: 'Name',
    },
    ok: {
      titolo: nome => (nome ? `Welcome, ${nome}` : 'Welcome'),
      testo: 'You’re online: you can use the internet from this device.',
      rimasto: 'Time left', totale: ore => `of ${n(ore, 'hour', 'hours')} granted`,
      parlato: (h, m, t) => (t < 60 ? 'less than a minute' : 'about ' + [h && n(h, 'hour', 'hours'), m && n(m, 'minute', 'minutes')].filter(Boolean).join(' and ')),
      consigli: ['You can close this page and use apps and browsers as usual.', 'When access expires, open any page to ask again.'],
    },
    no: { titolo: 'Request not approved', testo: min => `You can try again in ${min} minutes, or ask your host directly.` },
    scaduta: { titolo: 'No answer', testo: min => `The request expired after ${min} minutes without an answer.` },
    revocata: { titolo: 'Access revoked', testo: 'Internet access for this device has been revoked.' },
    terminata: { titolo: 'Access ended', testo: 'The time granted is over. You can make a new request.' },
    ancora: 'Ask again',
    troppe: { titolo: 'Too many requests in progress', testo: 'Several requests are already waiting. Try again in a few minutes.' },
    errore: {
      titolo: 'Something went wrong',
      testo: rete => `Connect to the ${rete} network and open any page to come back here.`,
      altroSsid: rete => `This device doesn’t appear to be connected to ${rete}.`,
    },
  },
  it: {
    locale: 'it-IT',
    sottotitolo: 'Wi-Fi ospiti',
    nota: 'Rete separata: i dispositivi collegati non si vedono tra loro e non raggiungono la rete di casa.',
    richiesta: {
      titolo: 'Chiedi l’accesso a internet',
      testo: 'Questa è la rete per gli ospiti. La tua richiesta arriva a chi gestisce la rete, che la approva dal telefono.',
      nome: 'Il tuo nome', facoltativo: '(facoltativo)', aiuto: 'Serve a capire chi sta chiedendo di collegarsi.', bottone: 'Chiedi accesso',
    },
    attesa: {
      titolo: 'Richiesta inviata', testo: 'In attesa di approvazione. La pagina si aggiorna da sola: puoi lasciarla aperta.',
      sr: 'In attesa', scade: 'Richiesta scade alle', nome: 'Nome',
    },
    ok: {
      titolo: nome => (nome ? `Ti diamo il benvenuto, ${nome}` : 'Ti diamo il benvenuto'),
      testo: 'Sei online: da questo dispositivo puoi usare internet.',
      rimasto: 'Tempo rimasto', totale: ore => `su ${ore} ${ore === 1 ? 'ora concessa' : 'ore concesse'}`,
      parlato: (h, m, t) => (t < 60 ? 'meno di un minuto' : 'circa ' + [h && n(h, 'ora', 'ore'), m && n(m, 'minuto', 'minuti')].filter(Boolean).join(' e ')),
      consigli: ['Puoi chiudere questa pagina e usare app e browser come sempre.', 'Quando l’accesso scade, apri una pagina qualsiasi per chiederne uno nuovo.'],
    },
    no: { titolo: 'Richiesta non approvata', testo: min => `Puoi riprovare tra ${min} minuti, oppure chiedere direttamente al padrone di casa.` },
    scaduta: { titolo: 'Nessuna risposta', testo: min => `La richiesta è scaduta dopo ${min} minuti senza risposta.` },
    revocata: { titolo: 'Accesso revocato', testo: 'L’accesso a internet di questo dispositivo è stato revocato.' },
    terminata: { titolo: 'Accesso terminato', testo: 'Il tempo concesso è finito. Puoi fare una nuova richiesta.' },
    ancora: 'Chiedi di nuovo',
    troppe: { titolo: 'Troppe richieste in corso', testo: 'Ci sono già diverse richieste in attesa. Riprova tra qualche minuto.' },
    errore: {
      titolo: 'Qualcosa non ha funzionato',
      testo: rete => `Collegati alla rete ${rete} e apri una pagina qualsiasi per tornare qui.`,
      altroSsid: rete => `Questo dispositivo non risulta collegato a ${rete}.`,
    },
  },
};

const TELEGRAM = {
  en: {
    locale: 'en-GB',
    titolo: ssid => `${ssid} · access request`,
    nome: 'Name', nonIndicato: 'not given', dispositivo: 'Device', sconosciuto: 'unknown',
    nonVerificato: 'Not found among the controller’s clients: check before approving.',
    scade: (creata, scade) => `${creata} · expires without an answer at ${scade}`,
    ore: h => n(h, 'hour', 'hours'), rifiuta: 'Reject', revoca: 'Revoke access',
    autorizzato: (h, quando, fino) => `<b>Approved for ${n(h, 'hour', 'hours')}</b> at ${quando}, until ${fino}`,
    rifiutata: quando => `<b>Rejected</b> at ${quando}`,
    revocata: quando => `<b>Access revoked</b> at ${quando}`,
    scaduta: quando => `<b>Expired</b> without an answer at ${quando}`,
    topic: ssid => `<b>${ssid}</b> · guest Wi-Fi access requests will arrive in this topic from now on.`,
    risposte: {
      nonTrovata: 'Request not found', chiusa: 'Request already closed', durata: 'Invalid duration',
      ok: 'Approved', no: 'Rejected', nonAttivo: 'Access not active', revocato: 'Access revoked',
      sconosciuta: 'Unknown action', nonAutorizzato: 'Not authorized', errore: 'Error: ',
    },
  },
  it: {
    locale: 'it-IT',
    titolo: ssid => `${ssid} · richiesta di accesso`,
    nome: 'Nome', nonIndicato: 'non indicato', dispositivo: 'Dispositivo', sconosciuto: 'sconosciuto',
    nonVerificato: 'Non trovato tra i client del controller: verifica prima di approvare.',
    scade: (creata, scade) => `${creata} · senza risposta scade alle ${scade}`,
    ore: h => n(h, 'ora', 'ore'), rifiuta: 'Rifiuta', revoca: 'Revoca accesso',
    autorizzato: (h, quando, fino) => `<b>Autorizzato ${n(h, 'ora', 'ore')}</b> alle ${quando}, fino alle ${fino}`,
    rifiutata: quando => `<b>Rifiutata</b> alle ${quando}`,
    revocata: quando => `<b>Accesso revocato</b> alle ${quando}`,
    scaduta: quando => `<b>Scaduta</b> senza risposta alle ${quando}`,
    topic: ssid => `<b>${ssid}</b> · da ora le richieste di accesso alla Wi-Fi ospiti arrivano in questo topic.`,
    risposte: {
      nonTrovata: 'Richiesta non trovata', chiusa: 'Richiesta già chiusa', durata: 'Durata non valida',
      ok: 'Autorizzato', no: 'Rifiutata', nonAttivo: 'Accesso non attivo', revocato: 'Accesso revocato',
      sconosciuta: 'Azione sconosciuta', nonAutorizzato: 'Non autorizzato', errore: 'Errore: ',
    },
  },
};

const tg = () => TELEGRAM[LINGUE.includes(process.env.TG_LANG) ? process.env.TG_LANG : 'en'];

// Ora HH:MM a 24 ore; hourCycle esplicito perché senza dati ICU Node ricadrebbe su "02:42 PM".
const orario = (ms, locale = 'en-GB') => new Date(ms).toLocaleTimeString(locale, {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: process.env.TZ || 'Europe/Rome',
});

module.exports = { LINGUE, linguaDa, PAGINE, TELEGRAM, tg, orario };
