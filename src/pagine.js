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
  return `<!doctype html>
<html lang="${lingua}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${refresh}
<title>${esc(rete())} · ${T.sottotitolo}</title>
<link rel="stylesheet" href="${css}">
</head>
<body>
<main class="pagina">
  <header class="testata">
    ${icona('wifi', 'marchio')}
    <div><p class="rete">${esc(rete())}</p><p class="sottotitolo">${T.sottotitolo}</p></div>
  </header>
  <section class="scheda tono-${c.tono}" aria-labelledby="titolo">
    <div class="stato">${icona(c.icona)}</div>
    <h1 id="titolo">${c.titolo}</h1>
    <p class="testo-principale">${c.testo}</p>
    ${c.corpo}
  </section>
  <p class="nota">${icona('scudo', 'piccola')}<span>${T.nota}</span></p>
  <footer class="firma"><a href="https://buymeacoffee.com/dllfpp">Made with love ❤️ - DLLFPP</a></footer>
</main>
</body>
</html>`;
}

module.exports = { pagina, esc, ora };
