'use strict';
// Pannello di amministrazione su /admin: ospiti collegati (allunga, accorcia, nuova durata, revoca),
// richieste in attesa e storico. Sta sulla stessa porta che vedono gli ospiti, quindi:
//  - password (ADMIN_PASS in chiaro dall'ambiente, oppure ADMIN_HASH scrypt salvato dal wizard);
//  - sessione con cookie HttpOnly SameSite=Strict, moduli accettati solo dalla stessa origine;
//  - al massimo 10 password sbagliate ogni 10 minuti;
//  - rifiuto degli indirizzi dei dispositivi ospiti e, se impostato, solo le reti di ADMIN_ALLOW.
// Il controller viene usato solo con autorizza() e revoca(), comuni a Omada e UniFi.
const crypto = require('crypto');
const { guscio, icona, esc } = require('./pagine');
const { orario } = require('./lingue');
const { ADMIN } = require('./admin-testi');

const SESSIONE_MS = 8 * 3600 * 1000;
const MAX_ORE = 720;

// ---- Password ----
function hashPassword(pw) {
  const sale = crypto.randomBytes(16);
  return `scrypt$${sale.toString('base64')}$${crypto.scryptSync(String(pw), sale, 32).toString('base64')}`;
}
function passwordGiusta(pw) {
  const chiaro = process.env.ADMIN_PASS, hash = process.env.ADMIN_HASH;
  if (chiaro) {
    const a = crypto.createHash('sha256').update(String(pw)).digest(), b = crypto.createHash('sha256').update(chiaro).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const [tipo, sale, atteso] = String(hash || '').split('$');
  if (tipo !== 'scrypt' || !sale || !atteso) return false;
  const x = crypto.scryptSync(String(pw), Buffer.from(sale, 'base64'), 32), y = Buffer.from(atteso, 'base64');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const attivo = () => Boolean(process.env.ADMIN_PASS || process.env.ADMIN_HASH);

// ---- Reti ammesse ----
const ipv4 = ip => String(ip || '').replace(/^::ffff:/, '');
const numero = ip => ip.split('.').reduce((a, x) => a * 256 + Number(x), 0);
function inRete(ip, cidr) {
  const [base, bit = '32'] = cidr.trim().split('/');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;
  const b = Number(bit), maschera = b === 0 ? 0 : (2 ** 32 - 2 ** (32 - b));
  return (numero(ip) & maschera) >>> 0 === (numero(base) & maschera) >>> 0;
}

function creaAdmin({ stato, controller, tg = null, testoRichiesta = null, log = console.log }) {
  const sessioni = new Map(); // token → scadenza
  const sbagliati = [];
  const T = lingua => ADMIN[lingua] || ADMIN.en;
  const locale = lingua => (lingua === 'it' ? 'it-IT' : 'en-GB');
  const cookie = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(c => c.length === 2));

  function autenticato(req) {
    const tok = cookie(req).gp_admin, scade = tok && sessioni.get(tok);
    if (!scade || scade < Date.now()) { if (tok) sessioni.delete(tok); return false; }
    sessioni.set(tok, Date.now() + SESSIONE_MS);
    return true;
  }

  // Indirizzo ammesso: mai quello di un dispositivo ospite; con ADMIN_ALLOW solo quelle reti.
  function reteAmmessa(req) {
    const ip = ipv4(req.socket.remoteAddress);
    if (stato.tutte().some(r => r.ip && r.ip === ip)) return false;
    const reti = String(process.env.ADMIN_ALLOW || '').split(',').map(s => s.trim()).filter(Boolean);
    return !reti.length || reti.some(c => inRete(ip, c));
  }

  const invia = (res, codice, html, extra = {}) => {
    res.writeHead(codice, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', ...extra });
    res.end(html);
  };
  const vai = (res, dove, extra = {}) => { res.writeHead(303, { Location: dove, 'Cache-Control': 'no-store', ...extra }); res.end(); };

  function schermo(lingua, { titolo, corpo, messaggio = '', errore = '' }) {
    const t = T(lingua);
    return guscio({
      lingua, titolo: `${titolo} · ${t.titolo}`, rete: t.titolo, sottotitolo: process.env.SSID || '', larga: true,
      corpo: `${errore ? `<p class="messaggio errore" role="alert">${errore}</p>` : ''}
  ${messaggio ? `<p class="messaggio ok" role="status">${messaggio}</p>` : ''}
  ${corpo}`,
    });
  }

  function paginaAccesso(lingua, errore = '') {
    const t = T(lingua).accesso;
    return schermo(lingua, {
      titolo: t.titolo, errore,
      corpo: `<section class="scheda" aria-labelledby="titolo"><h1 id="titolo">${t.titolo}</h1>
    <p class="testo-principale">${t.testo}</p>
    <form class="modulo" method="post" action="/admin/accesso">
      <label class="campo" for="password">${t.campo}</label>
      <input class="testo" id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button class="bottone" type="submit">${t.bottone}</button>
    </form></section>`,
    });
  }

  // ---- Elenchi ----
  const nomeDi = (r, t) => esc(r.nome || r.info?.name || t.senzaNome);
  const dispositivo = (r, t) => [r.info?.vendor, r.info?.osName].filter(Boolean).map(esc).join(' · ') || t.sconosciuto;
  function resto(ms, t) {
    const min = Math.max(0, Math.round(ms / 60000));
    return t.resto(Math.floor(min / 60), min % 60);
  }

  function schedaAttivo(r, lingua) {
    const t = T(lingua), o = ms => orario(ms, locale(lingua));
    return `<li class="admin-voce">
      <div class="admin-testa"><p class="admin-nome">${nomeDi(r, t)}</p><span class="etichetta si">${t.esiti.ok}</span></div>
      <p class="admin-dettagli">${dispositivo(r, t)} · <code>${esc(r.mac)}</code>${r.info?.apName ? ` · ${esc(r.info.apName)}` : ''}</p>
      <p class="admin-scade">${icona('attesa', 'piccola')}<span>${t.scade(o(r.scade), resto(r.scade - Date.now(), t))}</span></p>
      <div class="admin-azioni">
        <form method="post" action="/admin/durata"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="modo" value="piu">
          <button class="bottone secondario" type="submit">${t.piu}</button></form>
        <form method="post" action="/admin/durata"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="modo" value="meno">
          <button class="bottone secondario" type="submit">${t.meno}</button></form>
        <a class="bottone secondario pericolo-testo" href="/admin/revoca?id=${encodeURIComponent(r.id)}">${t.revoca}</a>
      </div>
      <form class="admin-nuova" method="post" action="/admin/durata"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="modo" value="nuova">
        <label class="campo" for="ore-${esc(r.id)}">${t.nuova}</label>
        <div class="admin-riga"><input class="testo" id="ore-${esc(r.id)}" name="ore" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" required>
        <button class="bottone" type="submit">${t.imposta}</button></div>
      </form>
    </li>`;
  }

  function rigaStorico(r, lingua) {
    const t = T(lingua), o = ms => orario(ms, locale(lingua));
    const quando = new Date(r.creata).toLocaleDateString(locale(lingua), { timeZone: process.env.TZ || 'Europe/Rome', day: '2-digit', month: '2-digit' });
    const esito = t.esiti[r.stato] || r.stato;
    const tono = r.stato === 'ok' || r.stato === 'terminata' ? 'si' : 'no';
    return `<li class="admin-voce compatta">
      <div class="admin-testa"><p class="admin-nome">${nomeDi(r, t)}</p><span class="etichetta ${tono}">${esc(esito)}</span></div>
      <p class="admin-dettagli">${quando} ${o(r.creata)}${r.ore ? ` · ${t.durata(r.ore)}` : ''} · <code>${esc(r.mac)}</code> · ${dispositivo(r, t)}</p>
    </li>`;
  }

  function paginaPannello(lingua, { messaggio = '', errore = '' } = {}) {
    const t = T(lingua), ora = Date.now();
    const tutte = stato.tutte().sort((a, b) => b.creata - a.creata);
    const attivi = tutte.filter(r => r.stato === 'ok' && r.scade > ora).sort((a, b) => a.scade - b.scade);
    const inAttesa = tutte.filter(r => r.stato === 'attesa');
    const passati = tutte.filter(r => !attivi.includes(r) && !inAttesa.includes(r));
    return schermo(lingua, {
      titolo: t.titolo, messaggio, errore,
      corpo: `<section class="scheda admin" aria-labelledby="titolo-attivi">
    <div class="admin-intestazione"><h1 id="titolo-attivi">${t.attivi(attivi.length)}</h1>
      <form method="post" action="/admin/esci"><button class="bottone secondario piccolo" type="submit">${t.esci}</button></form></div>
    ${attivi.length ? `<ul class="admin-lista">${attivi.map(r => schedaAttivo(r, lingua)).join('')}</ul>` : `<p class="testo-principale">${t.nessunAttivo}</p>`}
  </section>
  ${inAttesa.length ? `<section class="scheda admin" aria-labelledby="titolo-attesa"><h2 id="titolo-attesa">${t.attesa(inAttesa.length)}</h2>
    <ul class="admin-lista">${inAttesa.map(r => rigaStorico(r, lingua)).join('')}</ul></section>` : ''}
  <section class="scheda admin" aria-labelledby="titolo-storico"><h2 id="titolo-storico">${t.storico}</h2>
    ${passati.length ? `<ul class="admin-lista">${passati.map(r => rigaStorico(r, lingua)).join('')}</ul>` : `<p class="testo-principale">${t.nessunoStorico}</p>`}
  </section>`,
    });
  }

  function paginaConferma(r, lingua) {
    const t = T(lingua), c = t.conferma;
    return schermo(lingua, {
      titolo: c.titolo,
      corpo: `<section class="scheda" aria-labelledby="titolo"><h1 id="titolo">${c.titolo}</h1>
    <p class="testo-principale">${c.testo(`<b>${nomeDi(r, t)}</b> (<code>${esc(r.mac)}</code>)`)}</p>
    <form class="modulo" method="post" action="/admin/revoca"><input type="hidden" name="id" value="${esc(r.id)}">
      <div class="azioni"><a class="bottone secondario" href="/admin">${c.no}</a><button class="bottone pericolo" type="submit">${c.si}</button></div>
    </form></section>`,
    });
  }

  // ---- Azioni sul controller ----
  // Allungare: nuova autorizzazione per il tempo che resta. Accorciare: revoca e nuova autorizzazione,
  // perché non è garantito che il controller accetti di ridurre una scadenza già data.
  async function cambiaScadenza(r, scadenza, lingua) {
    const ms = scadenza - Date.now();
    if (scadenza < r.scade) await controller.revoca(r.mac);
    const scade = await controller.autorizza(r, ms / 3600000);
    stato.aggiorna(r.id, { scade, ore: Math.round((scade - r.creata) / 360000) / 10 });
    if (tg && r.msgId && testoRichiesta) {
      const T2 = ADMIN[process.env.TG_LANG === 'it' ? 'it' : 'en'], o = orario(scade, process.env.TG_LANG === 'it' ? 'it-IT' : 'en-GB');
      await tg.modifica(r.msgId, testoRichiesta(r, `\n${T2.tg(o)}`), [[{ text: `⛔ ${T2.revoca}`, callback_data: `sg:rev:${r.id}` }]], r.msgChat || tg.ADMIN).catch(e => log('telegram', e.message));
    }
    return scade;
  }

  async function elabora(percorso, f, lingua) {
    const t = T(lingua), E = t.errori, o = ms => orario(ms, locale(lingua));
    const r = stato.get(String(f.id || ''));
    if (!r || r.stato !== 'ok' || r.scade <= Date.now()) return { errore: E.nonAttivo };
    try {
      if (percorso === '/admin/revoca') {
        await controller.revoca(r.mac);
        stato.aggiorna(r.id, { stato: 'revocata', chiusa: Date.now() });
        if (tg && r.msgId && testoRichiesta) {
          const T2 = ADMIN[process.env.TG_LANG === 'it' ? 'it' : 'en'];
          await tg.modifica(r.msgId, testoRichiesta(r, `\n${T2.tgRevoca(orario(Date.now(), process.env.TG_LANG === 'it' ? 'it-IT' : 'en-GB'))}`), null, r.msgChat || tg.ADMIN).catch(e => log('telegram', e.message));
        }
        log('pannello: revocata', r.id, r.mac);
        return { messaggio: t.fatto.revoca };
      }
      let scadenza;
      if (f.modo === 'piu') scadenza = r.scade + 3600000;
      else if (f.modo === 'meno') scadenza = r.scade - 3600000;
      else {
        const s = String(f.ore || '').trim();
        if (!/^\d+$/.test(s) || Number(s) < 1 || Number(s) > MAX_ORE) return { errore: E.ore(MAX_ORE) };
        scadenza = Date.now() + Number(s) * 3600000;
      }
      if (scadenza - Date.now() < 60000) return { errore: E.troppoPoco };
      if (scadenza - Date.now() > MAX_ORE * 3600000) return { errore: E.troppo(MAX_ORE) };
      const scade = await cambiaScadenza(r, scadenza, lingua);
      log('pannello:', f.modo, r.id, r.mac, new Date(scade).toISOString());
      return { messaggio: t.fatto[f.modo === 'piu' ? 'piu' : f.modo === 'meno' ? 'meno' : 'nuova'](o(scade)) };
    } catch (e) {
      log('pannello: errore', e.message);
      return { errore: E.controller(esc(e.message)) };
    }
  }

  // Esito da mostrare una volta dopo il redirect (pattern post/redirect/get), legato alla sessione.
  const esiti = new Map();

  // Restituisce true se ha gestito la richiesta.
  async function gestisci(req, res, u, lingua, corpo) {
    if (u.pathname !== '/admin' && !u.pathname.startsWith('/admin/')) return false;
    const t = T(lingua);
    if (!reteAmmessa(req)) { invia(res, 403, schermo(lingua, { titolo: t.accesso.titolo, errore: t.accesso.rete, corpo: '' })); return true; }
    if (!attivo()) { invia(res, 503, schermo(lingua, { titolo: t.accesso.titolo, errore: t.accesso.spento, corpo: '' })); return true; }
    if (req.method === 'POST' && req.headers.origin) {
      let stesso = false;
      try { stesso = new URL(req.headers.origin).host === req.headers.host; } catch { /* origin non valido */ }
      if (!stesso) { invia(res, 403, paginaAccesso(lingua)); return true; }
    }

    if (req.method === 'POST' && u.pathname === '/admin/accesso') {
      const ora = Date.now();
      while (sbagliati.length && ora - sbagliati[0] > 10 * 60000) sbagliati.shift();
      if (sbagliati.length >= 10) { invia(res, 429, paginaAccesso(lingua, t.accesso.bloccato)); return true; }
      const f = await corpo(req);
      if (!passwordGiusta(f.password || '')) {
        sbagliati.push(ora);
        log('pannello: password sbagliata da', ipv4(req.socket.remoteAddress));
        invia(res, 401, paginaAccesso(lingua, t.accesso.errata));
        return true;
      }
      const tok = crypto.randomBytes(24).toString('base64url');
      sessioni.set(tok, ora + SESSIONE_MS);
      log('pannello: accesso da', ipv4(req.socket.remoteAddress));
      vai(res, '/admin', { 'Set-Cookie': `gp_admin=${tok}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSIONE_MS / 1000}` });
      return true;
    }
    if (!autenticato(req)) { invia(res, req.method === 'GET' ? 200 : 401, paginaAccesso(lingua)); return true; }
    const tok = cookie(req).gp_admin;

    if (req.method === 'GET' && u.pathname === '/admin') {
      const esito = esiti.get(tok) || {};
      esiti.delete(tok);
      invia(res, 200, paginaPannello(lingua, esito));
      return true;
    }
    if (req.method === 'GET' && u.pathname === '/admin/revoca') {
      const r = stato.get(u.searchParams.get('id') || '');
      if (!r || r.stato !== 'ok' || r.scade <= Date.now()) { esiti.set(tok, { errore: t.errori.nonAttivo }); vai(res, '/admin'); return true; }
      invia(res, 200, paginaConferma(r, lingua));
      return true;
    }
    if (req.method === 'POST' && (u.pathname === '/admin/durata' || u.pathname === '/admin/revoca')) {
      esiti.set(tok, await elabora(u.pathname, await corpo(req), lingua));
      vai(res, '/admin');
      return true;
    }
    if (req.method === 'POST' && u.pathname === '/admin/esci') {
      sessioni.delete(tok);
      vai(res, '/admin', { 'Set-Cookie': 'gp_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0' });
      return true;
    }
    res.writeHead(404); res.end();
    return true;
  }

  return { gestisci };
}

module.exports = { creaAdmin, hashPassword, passwordGiusta, inRete };
