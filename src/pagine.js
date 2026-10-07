'use strict';
// Pagine del portale, generate dal server. Nessun JavaScript: l'attesa si aggiorna con <meta refresh>.
// Prima dell'autenticazione l'ospite non ha internet: niente font, immagini o script esterni.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// hourCycle esplicito: senza i dati ICU italiani Node ricadrebbe su "02:42 PM".
const ora = ms => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: process.env.TZ || 'Europe/Rome' });

// Nome della rete mostrato nelle pagine: l'SSID configurato.
const rete = () => process.env.SSID || 'Wi-Fi ospiti';

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
function contoAllaRovescia(ms, ore) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  const oreTxt = `${h} ${h === 1 ? 'ora' : 'ore'}`, minTxt = `${m} ${m === 1 ? 'minuto' : 'minuti'}`;
  const parlato = t < 60 ? 'meno di un minuto' : h && m ? `${oreTxt} e ${minTxt}` : h ? oreTxt : minTxt;
  return `<div class="conto-blocco">
          <p class="conto-etichetta" id="conto-etichetta">Tempo rimasto</p>
          <p class="conto" role="timer" aria-labelledby="conto-etichetta" style="--t: ${t}; animation-duration: ${t}s"><span class="sr">${t < 60 ? parlato : "circa " + parlato}</span></p>
          <p class="conto-totale">su ${ore} ${ore === 1 ? 'ora concessa' : 'ore concesse'}</p>
        </div>`;
}

// Contenuto di ogni stato: { tono, icona, titolo, testo, corpo }
function contenuto(s) {
  switch (s.stato) {
    case 'richiesta': return {
      tono: 'neutro', icona: 'wifi', titolo: 'Chiedi l’accesso a internet',
      testo: 'Questa è la rete per gli ospiti. La tua richiesta arriva a chi gestisce la rete, che la approva dal telefono.',
      corpo: `<form class="modulo" method="post" action="/richiesta">
        ${nascosti(s.parametri || {})}
        <label class="campo" for="nome">Il tuo nome <span class="facoltativo">(facoltativo)</span></label>
        <input class="testo" id="nome" name="nome" type="text" maxlength="40" autocomplete="name" autocapitalize="words" aria-describedby="nome-aiuto">
        <p class="aiuto" id="nome-aiuto">Serve a capire chi sta chiedendo di collegarsi.</p>
        <button class="bottone" type="submit">Chiedi accesso</button>
      </form>`,
    };
    case 'attesa': return {
      tono: 'attesa', icona: 'attesa', titolo: 'Richiesta inviata',
      testo: 'In attesa di approvazione. La pagina si aggiorna da sola: puoi lasciarla aperta.',
      corpo: `<div class="avanzamento" role="status"><span class="barra"></span><span class="sr">In attesa</span></div>
        <dl class="dati"><dt>Richiesta scade alle</dt><dd>${ora(s.r.scadeAttesa)}</dd>${s.r.nome ? `<dt>Nome</dt><dd>${esc(s.r.nome)}</dd>` : ''}</dl>`,
    };
    // Pagina di benvenuto dopo l'approvazione. Nessun link al redirectUrl di Omada: è la sonda
    // del sistema operativo (captive.apple.com, msftconnecttest.com), non la pagina cercata dall'ospite.
    case 'ok': return {
      tono: 'ok', icona: 'ok', titolo: s.r.nome ? `Ti diamo il benvenuto, ${esc(s.r.nome)}` : 'Ti diamo il benvenuto',
      testo: 'Sei online: da questo dispositivo puoi usare internet.',
      corpo: `${contoAllaRovescia(s.r.scade - (s.adesso || Date.now()), s.r.ore)}
        <ul class="consigli">
          <li>Puoi chiudere questa pagina e usare app e browser come sempre.</li>
          <li>Quando l’accesso scade, apri una pagina qualsiasi per chiederne uno nuovo.</li>
        </ul>`,
    };
    case 'no': return {
      tono: 'no', icona: 'no', titolo: 'Richiesta non approvata',
      testo: `Puoi riprovare tra ${s.pausaMin} minuti, oppure chiedere direttamente al padrone di casa.`,
      corpo: '',
    };
    case 'scaduta': return {
      tono: 'avviso', icona: 'attesa', titolo: 'Nessuna risposta',
      testo: `La richiesta è scaduta dopo ${s.attesaMin} minuti senza risposta.`,
      corpo: `<form class="modulo" method="post" action="/rinnova"><input type="hidden" name="id" value="${esc(s.r.id)}">
        <button class="bottone" type="submit">Chiedi di nuovo</button></form>`,
    };
    case 'terminata':
    case 'revocata': return {
      tono: 'avviso', icona: 'avviso', titolo: s.stato === 'revocata' ? 'Accesso revocato' : 'Accesso terminato',
      testo: s.stato === 'revocata' ? 'L’accesso a internet di questo dispositivo è stato revocato.' : 'Il tempo concesso è finito. Puoi fare una nuova richiesta.',
      corpo: `<form class="modulo" method="post" action="/rinnova"><input type="hidden" name="id" value="${esc(s.r.id)}">
        <button class="bottone" type="submit">Chiedi di nuovo</button></form>`,
    };
    case 'troppe': return {
      tono: 'avviso', icona: 'avviso', titolo: 'Troppe richieste in corso',
      testo: 'Ci sono già diverse richieste in attesa. Riprova tra qualche minuto.', corpo: '',
    };
    default: return {
      tono: 'no', icona: 'avviso', titolo: 'Qualcosa non ha funzionato',
      testo: esc(s.messaggio || `Collegati alla rete ${rete()} e apri una pagina qualsiasi per tornare qui.`), corpo: '',
    };
  }
}

function pagina(s, { css = '/stile.css' } = {}) {
  const c = contenuto(s);
  // L'attesa si ricarica ogni 5 s; il benvenuto si ricarica allo scadere del conto (s.ricarica = URL).
  const refresh = s.stato === 'attesa' ? '<meta http-equiv="refresh" content="5">'
    : s.ricarica ? `<meta http-equiv="refresh" content="${Math.max(1, Math.ceil((s.r.scade - (s.adesso || Date.now())) / 1000) + 2)};url=${esc(s.ricarica)}">` : '';
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${refresh}
<title>${esc(rete())} · Wi-Fi ospiti</title>
<link rel="stylesheet" href="${css}">
</head>
<body>
<main class="pagina">
  <header class="testata">
    ${icona('wifi', 'marchio')}
    <div><p class="rete">${esc(rete())}</p><p class="sottotitolo">Wi-Fi ospiti</p></div>
  </header>
  <section class="scheda tono-${c.tono}" aria-labelledby="titolo">
    <div class="stato">${icona(c.icona)}</div>
    <h1 id="titolo">${c.titolo}</h1>
    <p class="testo-principale">${c.testo}</p>
    ${c.corpo}
  </section>
  <p class="nota">${icona('scudo', 'piccola')}<span>Rete separata: i dispositivi collegati non si vedono tra loro e non raggiungono la rete di casa.</span></p>
  <footer class="firma"><a href="https://buymeacoffee.com/dllfpp">Made with love ❤️ - DLLFPP</a></footer>
</main>
</body>
</html>`;
}

module.exports = { pagina, esc, ora };
