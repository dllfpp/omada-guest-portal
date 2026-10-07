'use strict';
// Portale esterno per una Wi-Fi ospiti Omada: l'ospite chiede l'accesso, il proprietario approva da Telegram.
const http = require('http');
const fs = require('fs');
const path = require('path');
const omada = require('./omada');
const tg = require('./telegram');
const { pagina } = require('./pagine');
const { linguaDa, tg: testiTg, orario } = require('./lingue');
const { Stato, LIMITI } = require('./stato');

const PORT = Number(process.env.PORT || 8097);
const SSID = process.env.SSID || '';
const DURATE = (process.env.DURATE || '4,24').split(',').map(Number).filter(n => n > 0);
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CSS = (() => { try { return fs.readFileSync(path.join(__dirname, 'stile.css')); } catch { return ''; } })();
const stato = new Stato(path.join(DATA, 'stato.json'));
const log = (...a) => console.log(new Date().toISOString(), ...a);

const MAC = /^([0-9A-F]{2}-){5}[0-9A-F]{2}$/;
const normMac = m => String(m || '').toUpperCase().replace(/:/g, '-');

function invia(res, codice, html, extra = {}) {
  res.writeHead(codice, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(html);
}
const vai = (res, dove) => { res.writeHead(303, { Location: dove, 'Cache-Control': 'no-store' }); res.end(); };

function corpo(req) {
  return new Promise((ok, ko) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 8192) { req.destroy(); ko(new Error('troppo grande')); } });
    req.on('end', () => ok(Object.fromEntries(new URLSearchParams(s))));
  });
}

// Parametri del redirect di Omada → dati del client. null se non arrivano dall'SSID configurato.
function daParametri(p) {
  const mac = normMac(p.clientMac), apMac = normMac(p.apMac);
  if (!MAC.test(mac) || !MAC.test(apMac) || p.ssidName !== SSID || !/^[0-3]$/.test(String(p.radioId))) return null;
  return {
    mac, apMac, ssid: SSID, radioId: Number(p.radioId),
    ip: /^[\d.]{7,15}$/.test(p.clientIp || '') ? p.clientIp : '',
    redirectUrl: /^https?:\/\//.test(p.redirectUrl || '') ? String(p.redirectUrl).slice(0, 500) : '',
  };
}

// ---- Telegram ----
// Testo e bottoni dei messaggi in messaggi.js (riusati dalla demo statica).
const { testoRichiesta, bottoniRichiesta, oraTg } = require('./messaggi');

async function nuovaRichiesta(dati, nome) {
  let info = null;
  try { info = await omada.cliente(dati.mac); } catch (e) { log('lettura client', e.message); }
  // Se il controller vede il client su un altro SSID la richiesta non ha senso.
  if (info && info.ssid && info.ssid !== SSID) return { errore: 'altro-ssid' };
  const r = stato.crea({
    ...dati, nome: String(nome || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40),
    verificato: Boolean(info),
    info: info ? { name: info.name, vendor: info.vendor, osName: info.osName, apName: info.apName } : null,
  });
  if (!tg.attivo) { log('TG_TOKEN mancante: richiesta senza notifica', r.id); return { r }; }
  try {
    const m = await tg.invia(testoRichiesta(r), bottoniRichiesta(r));
    stato.aggiorna(r.id, { msgId: m.message_id, msgChat: m.chat?.id });
  } catch (e) { log('invio telegram', e.message); }
  log('richiesta', r.id, r.mac, r.nome || '-');
  return { r };
}

async function bottone(cb) {
  const [, azione, id, ore] = String(cb.data || '').split(':');
  const r = stato.get(id);
  const T = testiTg(), R = T.risposte;
  if (!r) return tg.rispondi(cb.id, R.nonTrovata);
  const quando = oraTg(Date.now());
  if (azione === 'ok') {
    if (r.stato !== 'attesa' && r.stato !== 'scaduta') return tg.rispondi(cb.id, R.chiusa);
    const h = Number(ore);
    if (!DURATE.includes(h)) return tg.rispondi(cb.id, R.durata);
    const scade = await omada.autorizza(r, h);
    stato.aggiorna(id, { stato: 'ok', ore: h, scade, chiusa: Date.now() });
    await tg.modifica(cb.message.message_id, testoRichiesta(r, `\n✅ ${T.autorizzato(h, quando, oraTg(scade))}`),
      [[{ text: `⛔ ${T.revoca}`, callback_data: `sg:rev:${id}` }]], cb.message.chat?.id);
    log('autorizzato', id, r.mac, h + 'h');
    return tg.rispondi(cb.id, R.ok);
  }
  if (azione === 'no') {
    if (r.stato !== 'attesa' && r.stato !== 'scaduta') return tg.rispondi(cb.id, R.chiusa);
    stato.aggiorna(id, { stato: 'no', chiusa: Date.now() });
    await tg.modifica(cb.message.message_id, testoRichiesta(r, `\n❌ ${T.rifiutata(quando)}`), null, cb.message.chat?.id);
    log('rifiutata', id, r.mac);
    return tg.rispondi(cb.id, R.no);
  }
  if (azione === 'rev') {
    if (r.stato !== 'ok') return tg.rispondi(cb.id, R.nonAttivo);
    await omada.revoca(r.mac);
    stato.aggiorna(id, { stato: 'revocata', chiusa: Date.now() });
    await tg.modifica(cb.message.message_id, testoRichiesta(r, `\n⛔ ${T.revocata(quando)}`), null, cb.message.chat?.id);
    log('revocata', id, r.mac);
    return tg.rispondi(cb.id, R.revocato);
  }
  return tg.rispondi(cb.id, R.sconosciuta);
}

// ---- Pagine ----
function paginaRichiesta(r, lingua) {
  const s = r.stato === 'ok' && r.scade < Date.now() ? 'terminata' : r.stato;
  return pagina({ stato: s, r, lingua, pausaMin: LIMITI.pausaRifiutoMin, attesaMin: LIMITI.attesaMin });
}
const linguaRichiesta = (req, u) => linguaDa(req.headers['accept-language'], u.searchParams.get('lang'));

async function gestisci(req, res) {
  const u = new URL(req.url, 'http://portale');
  // Lingua dell'ospite dal browser (inglese predefinito, italiano se lo preferisce), ?lang=it|en per forzarla.
  const lingua = linguaRichiesta(req, u);
  const pag = s => pagina({ ...s, lingua });
  if (req.method === 'GET' && u.pathname === '/stile.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'max-age=300' });
    return res.end(CSS);
  }
  if (req.method === 'GET' && u.pathname === '/salute') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, inAttesa: stato.tutte().filter(r => r.stato === 'attesa').length, telegram: tg.attivo, topic: tg.topic() }));
  }
  if (req.method === 'GET' && u.pathname === '/stato') {
    const r = stato.get(u.searchParams.get('id'));
    if (!r) return invia(res, 404, pag({ stato: 'errore' }));
    // Approvata: l'attesa (che si ricarica da sola) passa alla pagina di benvenuto.
    if (r.stato === 'ok' && r.scade > Date.now()) return vai(res, '/benvenuto?id=' + r.id);
    return invia(res, 200, paginaRichiesta(r, lingua));
  }
  if (req.method === 'GET' && u.pathname === '/benvenuto') {
    const r = stato.get(u.searchParams.get('id'));
    if (!r) return invia(res, 404, pag({ stato: 'errore' }));
    if (r.stato !== 'ok' || r.scade <= Date.now()) return vai(res, '/stato?id=' + r.id);
    // Allo scadere del conto la pagina si ricarica e finisce su "Accesso terminato".
    return invia(res, 200, pag({ stato: 'ok', r, ricarica: '/benvenuto?id=' + r.id }));
  }
  // Anteprima con dati finti, senza toccare stato né controller.
  // /anteprima/benvenuto?nome=Guest&ore=4&secondi=90&lang=en  (secondi: tempo rimasto, di default tutta la durata)
  if (req.method === 'GET' && u.pathname === '/anteprima/benvenuto') {
    const ore = DURATE.includes(Number(u.searchParams.get('ore'))) ? Number(u.searchParams.get('ore')) : DURATE[0];
    const sec = Math.min(Math.max(Number(u.searchParams.get('secondi')) || ore * 3600, 1), ore * 3600);
    const nome = String(u.searchParams.get('nome') || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
    const r = { id: 'anteprima', nome, ore, scade: Date.now() + sec * 1000 };
    return invia(res, 200, pag({ stato: 'ok', r, ricarica: '/anteprima/terminata' }));
  }
  if (req.method === 'GET' && u.pathname === '/anteprima/terminata') {
    return invia(res, 200, pag({ stato: 'terminata', r: { id: 'anteprima' } }));
  }
  if (req.method === 'POST' && u.pathname === '/richiesta') {
    const p = await corpo(req);
    const dati = daParametri(p);
    if (!dati) return invia(res, 400, pag({ stato: 'errore' }));
    const puo = stato.puoChiedere(dati.mac);
    if (puo.richiesta) return vai(res, '/stato?id=' + puo.richiesta.id);
    if (puo.motivo === 'troppe') return invia(res, 429, pag({ stato: 'troppe' }));
    const { r, errore } = await nuovaRichiesta(dati, p.nome);
    return errore ? invia(res, 403, pag({ stato: 'errore', errore })) : vai(res, '/stato?id=' + r.id);
  }
  if (req.method === 'POST' && u.pathname === '/rinnova') {
    const vecchia = stato.get((await corpo(req)).id);
    if (!vecchia) return invia(res, 404, pag({ stato: 'errore' }));
    const puo = stato.puoChiedere(vecchia.mac);
    if (puo.richiesta) return vai(res, '/stato?id=' + puo.richiesta.id);
    if (puo.motivo === 'troppe') return invia(res, 429, pag({ stato: 'troppe' }));
    const { mac, apMac, ssid, radioId, ip, redirectUrl, nome } = vecchia;
    const { r, errore } = await nuovaRichiesta({ mac, apMac, ssid, radioId, ip, redirectUrl }, nome);
    return errore ? invia(res, 403, pag({ stato: 'errore', errore })) : vai(res, '/stato?id=' + r.id);
  }
  if (req.method === 'GET') {
    // Qualsiasi altro percorso: è il redirect di Omada (parametri in query) o una visita diretta.
    const p = Object.fromEntries(u.searchParams);
    const dati = daParametri(p);
    if (!dati) {
      // Redirect che non viene dall'SSID configurato o con un formato inatteso: si registra per capire cosa manda Omada.
      if (Object.keys(p).length) log('parametri non validi', u.pathname, JSON.stringify(p).slice(0, 600));
      return invia(res, 200, pag({ stato: 'errore' }));
    }
    const ultima = stato.perMac(dati.mac);
    if (ultima && ['attesa', 'no'].includes(ultima.stato)) return vai(res, '/stato?id=' + ultima.id);
    return invia(res, 200, pag({ stato: 'richiesta', parametri: p }));
  }
  res.writeHead(405); res.end();
}

const server = http.createServer((req, res) => {
  gestisci(req, res).catch(e => {
    log('errore', req.method, req.url, e.message);
    if (!res.headersSent) invia(res, 500, pagina({ stato: 'errore', lingua: linguaDa(req.headers['accept-language']) }));
  });
});

// Avvio del portale (dopo che la configurazione è stata caricata, da avvio.js o dall'ambiente).
function avvia() {
  // Configurazione obbligatoria: senza questi valori il portale non può funzionare.
  const mancanti = ['SSID', 'OMADA_URL', 'OMADA_ID', 'OMADA_SITE_ID', 'OMADA_CLIENT_ID', 'OMADA_CLIENT_SECRET', 'HOTSPOT_USER', 'HOTSPOT_PASS']
    .filter(k => !process.env[k]);
  if (mancanti.length) { console.error('Configurazione incompleta: ' + mancanti.join(', ') + ' (avvia src/avvio.js per il wizard)'); process.exit(1); }
  if (!tg.attivo) log('Telegram non configurato (TG_TOKEN e TG_CHAT): le richieste non verranno notificate');
  server.listen(PORT, () => log(`portale su :${PORT}, SSID ${SSID}, durate ${DURATE.join('/')} h`));
  if (tg.attivo) tg.ascolta(stato, bottone, log);
  // Richieste in attesa troppo a lungo → scadute, con il messaggio Telegram aggiornato.
  setInterval(async () => {
    for (const r of stato.scadute()) {
      log('scaduta', r.id, r.mac);
      // Le richieste di prima del topic non hanno msgChat: stavano nella chat privata del proprietario.
      if (r.msgId) await tg.modifica(r.msgId, testoRichiesta(r, `\n⌛ ${testiTg().scaduta(oraTg(r.chiusa))}`), null, r.msgChat || tg.ADMIN).catch(e => log('telegram', e.message));
    }
  }, 30000);
}

if (require.main === module) avvia();

module.exports = { server, avvia, daParametri, testoRichiesta, bottone, stato };
