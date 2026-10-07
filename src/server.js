'use strict';
// Portale esterno per una Wi-Fi ospiti Omada: l'ospite chiede l'accesso, il proprietario approva da Telegram.
const http = require('http');
const fs = require('fs');
const path = require('path');
const omada = require('./omada');
const tg = require('./telegram');
const { pagina, ora } = require('./pagine');
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
const bande = { 0: '2,4 GHz', 1: '5 GHz', 2: '5 GHz (2)', 3: '6 GHz' };

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
function testoRichiesta(r, esito = '') {
  const e = tg.esc;
  const disp = [r.info?.name, r.info?.vendor, r.info?.osName].filter(Boolean).map(e).join(' · ') || 'sconosciuto';
  return [
    `📶 <b>${tg.esc(SSID)} · richiesta di accesso</b>`,
    `👤 Nome: ${r.nome ? '<b>' + e(r.nome) + '</b>' : '<i>non indicato</i>'}`,
    `📱 Dispositivo: ${disp}`,
    `🔖 MAC <code>${r.mac}</code>${r.ip ? ' · IP ' + r.ip : ''}`,
    `📡 AP: ${e(r.info?.apName || r.apMac)} · ${bande[r.radioId] || ''}`,
    r.verificato ? '' : '⚠️ <i>Non trovato tra i client del controller: verifica prima di approvare.</i>',
    `🕒 ${ora(r.creata)} · senza risposta scade alle ${ora(r.scadeAttesa)}`,
    esito,
  ].filter(Boolean).join('\n');
}
const bottoniRichiesta = r => [
  DURATE.map(h => ({ text: `✅ ${h} ${h === 1 ? 'ora' : 'ore'}`, callback_data: `sg:ok:${r.id}:${h}` })),
  [{ text: '❌ Rifiuta', callback_data: `sg:no:${r.id}` }],
];

async function nuovaRichiesta(dati, nome) {
  let info = null;
  try { info = await omada.cliente(dati.mac); } catch (e) { log('lettura client', e.message); }
  // Se il controller vede il client su un altro SSID la richiesta non ha senso.
  if (info && info.ssid && info.ssid !== SSID) return { errore: 'Questo dispositivo non risulta collegato a ' + SSID + '.' };
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
  if (!r) return tg.rispondi(cb.id, 'Richiesta non trovata');
  const quando = ora(Date.now());
  if (azione === 'ok') {
    if (r.stato !== 'attesa' && r.stato !== 'scaduta') return tg.rispondi(cb.id, 'Richiesta già chiusa');
    const h = Number(ore);
    if (!DURATE.includes(h)) return tg.rispondi(cb.id, 'Durata non valida');
    const scade = await omada.autorizza(r, h);
    stato.aggiorna(id, { stato: 'ok', ore: h, scade, chiusa: Date.now() });
    await tg.modifica(cb.message.message_id, testoRichiesta(r, `\n✅ <b>Autorizzato ${h} ${h === 1 ? 'ora' : 'ore'}</b> alle ${quando}, fino alle ${ora(scade)}`),
      [[{ text: '⛔ Revoca accesso', callback_data: `sg:rev:${id}` }]], cb.message.chat?.id);
    log('autorizzato', id, r.mac, h + 'h');
    return tg.rispondi(cb.id, 'Autorizzato');
  }
  if (azione === 'no') {
    if (r.stato !== 'attesa' && r.stato !== 'scaduta') return tg.rispondi(cb.id, 'Richiesta già chiusa');
    stato.aggiorna(id, { stato: 'no', chiusa: Date.now() });
    await tg.modifica(cb.message.message_id, testoRichiesta(r, `\n❌ <b>Rifiutata</b> alle ${quando}`), null, cb.message.chat?.id);
    log('rifiutata', id, r.mac);
    return tg.rispondi(cb.id, 'Rifiutata');
  }
  if (azione === 'rev') {
    if (r.stato !== 'ok') return tg.rispondi(cb.id, 'Accesso non attivo');
    await omada.revoca(r.mac);
    stato.aggiorna(id, { stato: 'revocata', chiusa: Date.now() });
    await tg.modifica(cb.message.message_id, testoRichiesta(r, `\n⛔ <b>Accesso revocato</b> alle ${quando}`), null, cb.message.chat?.id);
    log('revocata', id, r.mac);
    return tg.rispondi(cb.id, 'Accesso revocato');
  }
  return tg.rispondi(cb.id, 'Azione sconosciuta');
}

// ---- Pagine ----
function paginaRichiesta(r) {
  const s = r.stato === 'ok' && r.scade < Date.now() ? 'terminata' : r.stato;
  return pagina({ stato: s, r, pausaMin: LIMITI.pausaRifiutoMin, attesaMin: LIMITI.attesaMin });
}

async function gestisci(req, res) {
  const u = new URL(req.url, 'http://portale');
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
    if (!r) return invia(res, 404, pagina({ stato: 'errore' }));
    // Approvata: l'attesa (che si ricarica da sola) passa alla pagina di benvenuto.
    if (r.stato === 'ok' && r.scade > Date.now()) return vai(res, '/benvenuto?id=' + r.id);
    return invia(res, 200, paginaRichiesta(r));
  }
  if (req.method === 'GET' && u.pathname === '/benvenuto') {
    const r = stato.get(u.searchParams.get('id'));
    if (!r) return invia(res, 404, pagina({ stato: 'errore' }));
    if (r.stato !== 'ok' || r.scade <= Date.now()) return vai(res, '/stato?id=' + r.id);
    // Allo scadere del conto la pagina si ricarica e finisce su "Accesso terminato".
    return invia(res, 200, pagina({ stato: 'ok', r, ricarica: '/benvenuto?id=' + r.id }));
  }
  // Anteprima con dati finti, senza toccare stato né controller.
  // /anteprima/benvenuto?nome=Giulia&ore=4&secondi=90  (secondi: tempo rimasto, di default tutta la durata)
  if (req.method === 'GET' && u.pathname === '/anteprima/benvenuto') {
    const ore = DURATE.includes(Number(u.searchParams.get('ore'))) ? Number(u.searchParams.get('ore')) : DURATE[0];
    const sec = Math.min(Math.max(Number(u.searchParams.get('secondi')) || ore * 3600, 1), ore * 3600);
    const nome = String(u.searchParams.get('nome') || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
    const r = { id: 'anteprima', nome, ore, scade: Date.now() + sec * 1000 };
    return invia(res, 200, pagina({ stato: 'ok', r, ricarica: '/anteprima/terminata' }));
  }
  if (req.method === 'GET' && u.pathname === '/anteprima/terminata') {
    return invia(res, 200, pagina({ stato: 'terminata', r: { id: 'anteprima' } }));
  }
  if (req.method === 'POST' && u.pathname === '/richiesta') {
    const p = await corpo(req);
    const dati = daParametri(p);
    if (!dati) return invia(res, 400, pagina({ stato: 'errore' }));
    const puo = stato.puoChiedere(dati.mac);
    if (puo.richiesta) return vai(res, '/stato?id=' + puo.richiesta.id);
    if (puo.motivo === 'troppe') return invia(res, 429, pagina({ stato: 'troppe' }));
    const { r, errore } = await nuovaRichiesta(dati, p.nome);
    return errore ? invia(res, 403, pagina({ stato: 'errore', messaggio: errore })) : vai(res, '/stato?id=' + r.id);
  }
  if (req.method === 'POST' && u.pathname === '/rinnova') {
    const vecchia = stato.get((await corpo(req)).id);
    if (!vecchia) return invia(res, 404, pagina({ stato: 'errore' }));
    const puo = stato.puoChiedere(vecchia.mac);
    if (puo.richiesta) return vai(res, '/stato?id=' + puo.richiesta.id);
    if (puo.motivo === 'troppe') return invia(res, 429, pagina({ stato: 'troppe' }));
    const { mac, apMac, ssid, radioId, ip, redirectUrl, nome } = vecchia;
    const { r, errore } = await nuovaRichiesta({ mac, apMac, ssid, radioId, ip, redirectUrl }, nome);
    return errore ? invia(res, 403, pagina({ stato: 'errore', messaggio: errore })) : vai(res, '/stato?id=' + r.id);
  }
  if (req.method === 'GET') {
    // Qualsiasi altro percorso: è il redirect di Omada (parametri in query) o una visita diretta.
    const p = Object.fromEntries(u.searchParams);
    const dati = daParametri(p);
    if (!dati) {
      // Redirect che non viene dall'SSID configurato o con un formato inatteso: si registra per capire cosa manda Omada.
      if (Object.keys(p).length) log('parametri non validi', u.pathname, JSON.stringify(p).slice(0, 600));
      return invia(res, 200, pagina({ stato: 'errore' }));
    }
    const ultima = stato.perMac(dati.mac);
    if (ultima && ['attesa', 'no'].includes(ultima.stato)) return vai(res, '/stato?id=' + ultima.id);
    return invia(res, 200, pagina({ stato: 'richiesta', parametri: p }));
  }
  res.writeHead(405); res.end();
}

const server = http.createServer((req, res) => {
  gestisci(req, res).catch(e => { log('errore', req.method, req.url, e.message); if (!res.headersSent) invia(res, 500, pagina({ stato: 'errore' })); });
});

if (require.main === module) {
  // Configurazione obbligatoria: senza questi valori il portale non può funzionare.
  const mancanti = ['SSID', 'OMADA_URL', 'OMADA_ID', 'OMADA_SITE_ID', 'OMADA_CLIENT_ID', 'OMADA_CLIENT_SECRET', 'HOTSPOT_USER', 'HOTSPOT_PASS']
    .filter(k => !process.env[k]);
  if (mancanti.length) { console.error('Variabili mancanti in .env: ' + mancanti.join(', ')); process.exit(1); }
  if (!tg.attivo) log('Telegram non configurato (TG_TOKEN e TG_CHAT): le richieste non verranno notificate');
  server.listen(PORT, () => log(`portale su :${PORT}, SSID ${SSID}, durate ${DURATE.join('/')} h`));
  if (tg.attivo) tg.ascolta(stato, bottone, log);
  // Richieste in attesa troppo a lungo → scadute, con il messaggio Telegram aggiornato.
  setInterval(async () => {
    for (const r of stato.scadute()) {
      log('scaduta', r.id, r.mac);
      // Le richieste di prima del topic non hanno msgChat: stavano nella chat privata del proprietario.
      if (r.msgId) await tg.modifica(r.msgId, testoRichiesta(r, `\n⌛ <b>Scaduta</b> senza risposta alle ${ora(r.chiusa)}`), null, r.msgChat || tg.ADMIN).catch(e => log('telegram', e.message));
    }
  }, 30000);
}

module.exports = { server, daParametri, testoRichiesta, bottone, stato };
