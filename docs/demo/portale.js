// Generato da demo/build.js dai sorgenti in src/: non modificare a mano.
(function () {
  var process = { env: {} };
  var definizioni = {
"./lingue": function (module, exports, require) {
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

},
"./pagine": function (module, exports, require) {
'use strict';
// Pagine del portale, generate dal server. Nessun JavaScript: l'attesa si aggiorna con <meta refresh>.
// Prima dell'autenticazione l'ospite non ha internet: niente font, immagini o script esterni.
// Lingua: s.lingua ('en' predefinito, 'it'), decisa dal server con linguaDa().
const { PAGINE, orario } = require('./lingue');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ora = (ms, locale = 'it-IT') => orario(ms, locale);

// Nome della rete mostrato nelle pagine: l'SSID configurato.
const rete = () => process.env.SSID || 'Guest Wi-Fi';

// Icone SVG inline (tratti Lucide), decorative: aria-hidden.
const ICONE = {
  wifi: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.86a10 10 0 0 1 14 0"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/>',
  attesa: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  no: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  avviso: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  scudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
};
const icona = (n, cls = '') => `<svg class="icona ${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[n]}</svg>`;

// Campi nascosti che riportano al server i parametri messi da Omada nel redirect.
const nascosti = p => ['clientMac', 'clientIp', 'apMac', 'ssidName', 'radioId', 'site', 't', 'redirectUrl']
  .map(k => `<input type="hidden" name="${k}" value="${esc(p[k])}">`).join('');

// Conto alla rovescia senza JavaScript: il server calcola i secondi rimasti, una animazione CSS
// porta la proprietà intera --t a 0 e i contatori CSS la mostrano come ore:minuti:secondi.
// Per i lettori di schermo un testo fisso, non un numero annunciato ogni secondo.
function contoAllaRovescia(T, ms, ore) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return `<div class="conto-blocco">
          <p class="conto-etichetta" id="conto-etichetta">${T.ok.rimasto}</p>
          <p class="conto" role="timer" aria-labelledby="conto-etichetta" style="--t: ${t}; animation-duration: ${t}s"><span class="sr">${T.ok.parlato(h, m, t)}</span></p>
          <p class="conto-totale">${T.ok.totale(ore)}</p>
        </div>`;
}

const ancora = (T, id) => `<form class="modulo" method="post" action="/rinnova"><input type="hidden" name="id" value="${esc(id)}">
        <button class="bottone" type="submit">${T.ancora}</button></form>`;

// Contenuto di ogni stato: { tono, icona, titolo, testo, corpo }
function contenuto(s, T) {
  switch (s.stato) {
    case 'richiesta': return {
      tono: 'neutro', icona: 'wifi', titolo: T.richiesta.titolo, testo: T.richiesta.testo,
      corpo: `<form class="modulo" method="post" action="/richiesta">
        ${nascosti(s.parametri || {})}
        <label class="campo" for="nome">${T.richiesta.nome} <span class="facoltativo">${T.richiesta.facoltativo}</span></label>
        <input class="testo" id="nome" name="nome" type="text" maxlength="40" autocomplete="name" autocapitalize="words" aria-describedby="nome-aiuto">
        <p class="aiuto" id="nome-aiuto">${T.richiesta.aiuto}</p>
        <button class="bottone" type="submit">${T.richiesta.bottone}</button>
      </form>`,
    };
    case 'attesa': return {
      tono: 'attesa', icona: 'attesa', titolo: T.attesa.titolo, testo: T.attesa.testo,
      corpo: `<div class="avanzamento" role="status"><span class="barra"></span><span class="sr">${T.attesa.sr}</span></div>
        <dl class="dati"><dt>${T.attesa.scade}</dt><dd>${ora(s.r.scadeAttesa, T.locale)}</dd>${s.r.nome ? `<dt>${T.attesa.nome}</dt><dd>${esc(s.r.nome)}</dd>` : ''}</dl>`,
    };
    // Pagina di benvenuto dopo l'approvazione. Nessun link al redirectUrl di Omada: è la sonda
    // del sistema operativo (captive.apple.com, msftconnecttest.com), non la pagina cercata dall'ospite.
    case 'ok': return {
      tono: 'ok', icona: 'ok', titolo: T.ok.titolo(s.r.nome ? esc(s.r.nome) : ''), testo: T.ok.testo,
      corpo: `${contoAllaRovescia(T, s.r.scade - (s.adesso || Date.now()), s.r.ore)}
        <ul class="consigli">
          ${T.ok.consigli.map(c => `<li>${c}</li>`).join('\n          ')}
        </ul>`,
    };
    case 'no': return { tono: 'no', icona: 'no', titolo: T.no.titolo, testo: T.no.testo(s.pausaMin), corpo: '' };
    case 'scaduta': return {
      tono: 'avviso', icona: 'attesa', titolo: T.scaduta.titolo, testo: T.scaduta.testo(s.attesaMin), corpo: ancora(T, s.r.id),
    };
    case 'terminata':
    case 'revocata': return {
      tono: 'avviso', icona: 'avviso', titolo: T[s.stato].titolo, testo: T[s.stato].testo, corpo: ancora(T, s.r.id),
    };
    case 'troppe': return { tono: 'avviso', icona: 'avviso', titolo: T.troppe.titolo, testo: T.troppe.testo, corpo: '' };
    default: return {
      tono: 'no', icona: 'avviso', titolo: T.errore.titolo,
      testo: esc(s.errore === 'altro-ssid' ? T.errore.altroSsid(rete()) : T.errore.testo(rete())), corpo: '',
    };
  }
}

function pagina(s, { css = '/stile.css' } = {}) {
  const lingua = PAGINE[s.lingua] ? s.lingua : 'en';
  const T = PAGINE[lingua];
  const c = contenuto(s, T);
  // L'attesa si ricarica ogni 5 s; il benvenuto si ricarica allo scadere del conto (s.ricarica = URL).
  const refresh = s.stato === 'attesa' ? '<meta http-equiv="refresh" content="5">'
    : s.ricarica ? `<meta http-equiv="refresh" content="${Math.max(1, Math.ceil((s.r.scade - (s.adesso || Date.now())) / 1000) + 2)};url=${esc(s.ricarica)}">` : '';
  return guscio({
    lingua, css, refresh, titolo: `${esc(rete())} · ${T.sottotitolo}`, rete: esc(rete()), sottotitolo: T.sottotitolo,
    corpo: `<section class="scheda tono-${c.tono}" aria-labelledby="titolo">
    <div class="stato">${icona(c.icona)}</div>
    <h1 id="titolo">${c.titolo}</h1>
    <p class="testo-principale">${c.testo}</p>
    ${c.corpo}
  </section>
  <p class="nota">${icona('scudo', 'piccola')}<span>${T.nota}</span></p>`,
  });
}

// Struttura comune a portale e wizard: testata con il marchio, contenuto, firma.
function guscio({ lingua, css = '/stile.css', refresh = '', titolo, rete: nomeRete, sottotitolo, corpo, larga = false }) {
  return `<!doctype html>
<html lang="${lingua}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${refresh}
<title>${titolo}</title>
<link rel="stylesheet" href="${css}">
</head>
<body>
<main class="pagina${larga ? ' larga' : ''}">
  <header class="testata">
    ${icona('wifi', 'marchio')}
    <div><p class="rete">${nomeRete}</p><p class="sottotitolo">${sottotitolo}</p></div>
  </header>
  ${corpo}
  <footer class="firma"><a href="https://buymeacoffee.com/dllfpp">Made with love ❤️ - DLLFPP</a></footer>
</main>
</body>
</html>`;
}

module.exports = { pagina, guscio, icona, esc, ora };

},
"./messaggi": function (module, exports, require) {
'use strict';
// Testo e bottoni del messaggio Telegram di una richiesta. Funzioni pure (configurazione letta a ogni
// chiamata), usate dal server e dalla demo statica nel browser.
const { tg: testiTg, orario } = require('./lingue');

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const bande = { 0: '2.4 GHz', 1: '5 GHz', 2: '5 GHz (2)', 3: '6 GHz' };
const durate = () => (process.env.DURATE || '4,24').split(',').map(Number).filter(n => n > 0);

// Lingua dei messaggi: TG_LANG (en predefinito, it).
const oraTg = ms => orario(ms, testiTg().locale);

function testoRichiesta(r, esito = '') {
  const e = esc, T = testiTg();
  const disp = [r.info?.name, r.info?.vendor, r.info?.osName].filter(Boolean).map(e).join(' · ') || T.sconosciuto;
  return [
    `📶 <b>${e(T.titolo(process.env.SSID || ''))}</b>`,
    `👤 ${T.nome}: ${r.nome ? '<b>' + e(r.nome) + '</b>' : '<i>' + T.nonIndicato + '</i>'}`,
    `📱 ${T.dispositivo}: ${disp}`,
    `🔖 MAC <code>${r.mac}</code>${r.ip ? ' · IP ' + r.ip : ''}`,
    `📡 AP: ${e(r.info?.apName || r.apMac)} · ${bande[r.radioId] || ''}`,
    r.verificato ? '' : `⚠️ <i>${T.nonVerificato}</i>`,
    `🕒 ${T.scade(oraTg(r.creata), oraTg(r.scadeAttesa))}`,
    esito,
  ].filter(Boolean).join('\n');
}

const bottoniRichiesta = r => [
  durate().map(h => ({ text: `✅ ${testiTg().ore(h)}`, callback_data: `sg:ok:${r.id}:${h}` })),
  [{ text: `❌ ${testiTg().rifiuta}`, callback_data: `sg:no:${r.id}` }],
];

module.exports = { testoRichiesta, bottoniRichiesta, oraTg, esc };

}
  };
  var cache = {};
  function richiedi(nome) {
    if (cache[nome]) return cache[nome].exports;
    var module = cache[nome] = { exports: {} };
    definizioni[nome].call(module.exports, module, module.exports, richiedi);
    return module.exports;
  }
  var lingue = richiedi('./lingue'), pagine = richiedi('./pagine'), messaggi = richiedi('./messaggi');
  window.GuestPortal = { env: process.env, pagina: pagine.pagina, linguaDa: lingue.linguaDa, tg: lingue.tg, testoRichiesta: messaggi.testoRichiesta, bottoniRichiesta: messaggi.bottoniRichiesta, oraTg: messaggi.oraTg };
})();
