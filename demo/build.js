'use strict';
// Costruisce la demo statica in docs/ (GitHub Pages), senza dipendenze:
// - docs/demo/portale.js: lingue.js, pagine.js e messaggi.js impacchettati per il browser, così le pagine
//   dell'ospite e il messaggio Telegram della demo sono generati dallo stesso codice del portale;
// - docs/demo/stile.css: il foglio di stile del portale;
// - docs/demo/wizard/{en,it}/*.html: il wizard vero, registrato passo per passo contro il controller e il
//   Telegram finti dei test, con i moduli riscritti per passare da una pagina statica all'altra.
// Uso: node demo/build.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const RADICE = path.join(__dirname, '..');
const SRC = path.join(RADICE, 'src');
const DEMO = path.join(RADICE, 'docs', 'demo');

// ---- 1. Pacchetto per il browser ----
function pacchetto() {
  const moduli = ['./lingue', './pagine', './messaggi'];
  const definizioni = moduli.map(m => `${JSON.stringify(m)}: function (module, exports, require) {\n${fs.readFileSync(path.join(SRC, m + '.js'), 'utf8')}\n}`).join(',\n');
  return `// Generato da demo/build.js dai sorgenti in src/: non modificare a mano.
(function () {
  var process = { env: {} };
  var definizioni = {
${definizioni}
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
`;
}

// ---- 3. Registrazione del wizard ----
const HOST_DEMO = '192.168.0.20:8097';
function chiama(porta, metodo, percorso, { lingua, biscotto, dati } = {}) {
  const corpo = dati ? new URLSearchParams(dati).toString() : '';
  return new Promise((ok, ko) => {
    const r = http.request({ host: '127.0.0.1', port: porta, method: metodo, path: percorso, headers: {
      Host: HOST_DEMO, 'Accept-Language': lingua, Cookie: biscotto || '',
      ...(dati ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(corpo) } : {}),
    } }, res => { let s = ''; res.on('data', c => (s += c)); res.on('end', () => ok({ status: res.statusCode, headers: res.headers, html: s })); });
    r.on('error', ko);
    r.end(corpo);
  });
}

// Moduli e link puntano ai file statici; niente campi obbligatori, così la demo si percorre con un clic.
const DESTINAZIONE = {
  '/accesso': 'controller.html', '/passo/controller': 'openapi.html', '/passo/openapi': 'sito.html', '/passo/sito': 'ssid.html',
  '/passo/ssid': 'operatore.html', '/passo/operatore': 'telegram.html', '/passo/telegram': 'chat.html',
  '/passo/regole': 'riepilogo.html', '/salva': 'fatto.html',
};
function statica(html) {
  return html
    .replace('href="/stile.css"', 'href="../../stile.css"')
    .replace(/<form class="modulo" method="post" action="([^"]+)">([\s\S]*?)<\/form>/g, (_, azione, dentro) => {
      const dest = azione === '/passo/chat' ? (dentro.includes('value="cerca"') ? 'chat-trovate.html' : 'regole.html') : DESTINAZIONE[azione];
      if (!dest) throw new Error('azione senza destinazione: ' + azione);
      return `<form class="modulo" method="get" action="${dest}">${dentro}</form>`;
    })
    .replace(/href="\/passo\/([a-z]+)"/g, (_, p) => `href="${p}.html"`)
    .replace(/ required(?=[ >])/g, '').replace(/ autofocus(?=[ >])/g, '');
}

async function registraWizard(lingua) {
  const { omada, telegram, operatori, TOKEN } = require('../test/finti');
  operatori.length = 0;
  const { creaWizard } = require('../src/wizard');
  const w = creaWizard({ codice: 'DEMO-DEMO-DEMO', log: () => {} });
  await new Promise(ok => w.server.listen(0, '127.0.0.1', ok));
  const porta = w.server.address().port;
  const pagine = {};
  const leggi = async (nome, percorso) => {
    const r = await chiama(porta, 'GET', percorso, { lingua, biscotto });
    if (r.status !== 200) throw new Error(`${percorso}: ${r.status}`);
    pagine[nome] = r.html;
  };
  const invia = async (percorso, dati) => {
    const r = await chiama(porta, 'POST', percorso, { lingua, biscotto, dati });
    if (r.status >= 400) throw new Error(`${percorso}: ${r.status} ${r.html.slice(0, 300)}`);
    return r;
  };
  let biscotto = '';
  await leggi('accesso', '/');
  biscotto = (await invia('/accesso', { codice: 'DEMO-DEMO-DEMO' })).headers['set-cookie'][0].split(';')[0];
  await leggi('controller', '/passo/controller');
  await invia('/passo/controller', { url: `http://127.0.0.1:${omada.address().port}` });
  await leggi('openapi', '/passo/openapi');
  await invia('/passo/openapi', { clientId: 'app', clientSecret: 'segreto' });
  await leggi('sito', '/passo/sito');
  await invia('/passo/sito', { sito: 's1' });
  await leggi('ssid', '/passo/ssid');
  await invia('/passo/ssid', { ssid: 'GUEST-WIFI' });
  await leggi('operatore', '/passo/operatore');
  await invia('/passo/operatore', { modo: 'crea' });
  await leggi('telegram', '/passo/telegram');
  await invia('/passo/telegram', { token: TOKEN });
  await leggi('chat', '/passo/chat');
  await invia('/passo/chat', { azione: 'cerca' });
  await leggi('chat-trovate', '/passo/chat');
  await invia('/passo/chat', { azione: 'invia', scelta: '0', lingua });
  await leggi('regole', '/passo/regole');
  await invia('/passo/regole', { durate: '4,24', attesa: '10', pausa: '15', max: '5' });
  await leggi('riepilogo', '/passo/riepilogo');
  pagine.fatto = (await invia('/salva', {})).html;
  w.server.close();
  // L'indirizzo del controller finto (porta casuale) diventa un indirizzo d'esempio.
  const finto = `http://127.0.0.1:${omada.address().port}`;
  const dir = path.join(DEMO, 'wizard', lingua);
  fs.mkdirSync(dir, { recursive: true });
  for (const [nome, html] of Object.entries(pagine)) {
    fs.writeFileSync(path.join(dir, nome + '.html'), statica(html.split(finto).join('https://192.168.0.10:8043').split(finto.replace('http://', '')).join('192.168.0.10:8043')));
  }
  return Object.keys(pagine).length;
}

(async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-demo-'));
  const { omada, telegram } = require('../test/finti');
  await new Promise(ok => omada.listen(0, '127.0.0.1', ok));
  await new Promise(ok => telegram.listen(0, '127.0.0.1', ok));
  process.env.TG_API_URL = `http://127.0.0.1:${telegram.address().port}`;
  fs.rmSync(path.join(DEMO, 'wizard'), { recursive: true, force: true });
  fs.mkdirSync(DEMO, { recursive: true });
  fs.writeFileSync(path.join(DEMO, 'portale.js'), pacchetto());
  fs.copyFileSync(path.join(SRC, 'stile.css'), path.join(DEMO, 'stile.css'));
  const n = [await registraWizard('en'), await registraWizard('it')];
  omada.close(); telegram.close();
  fs.writeFileSync(path.join(RADICE, 'docs', '.nojekyll'), '');
  console.log(`demo: docs/demo/portale.js, stile.css, wizard en ${n[0]} + it ${n[1]} pagine`);
})().catch(e => { console.error(e); process.exit(1); });
