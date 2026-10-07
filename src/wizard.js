'use strict';
// Wizard di configurazione: parte al primo avvio (configurazione incompleta) o quando esiste /data/setup.
// È sulla stessa porta del portale, raggiungibile anche dagli ospiti: per questo serve il codice
// stampato nel log del container, e dopo il salvataggio il wizard si spegne.
// Pagine generate dal server, nessun JavaScript, stesso stile del portale.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const api = require('./wizard-api');
const config = require('./config');
const { guscio, esc } = require('./pagine');
const { linguaDa } = require('./lingue');
const { WIZARD } = require('./wizard-testi');

const PASSI = ['controller', 'openapi', 'sito', 'ssid', 'operatore', 'telegram', 'chat', 'regole', 'riepilogo'];
const SESSIONE_MS = 2 * 3600 * 1000;
const CSS = (() => { try { return fs.readFileSync(path.join(__dirname, 'stile.css')); } catch { return ''; } })();

// Codice tipo "K7QM-3XRT-9WPA": senza caratteri che si confondono (0/O, 1/I/L).
function nuovoCodice() {
  const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const c = Array.from(crypto.randomBytes(12), b => a[b % a.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}
const normCodice = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function codiceGiusto(dato, atteso) {
  const x = Buffer.from(normCodice(dato)), y = Buffer.from(normCodice(atteso));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function creaWizard({ codice = nuovoCodice(), daAmbiente = [], fileSetup, alSalvataggio = () => {}, log = console.log } = {}) {
  // Bozza: parte dai valori già noti (ambiente o file), così una riconfigurazione è precompilata.
  const b = Object.fromEntries(config.CHIAVI.map(k => [k, process.env[k] || '']));
  let sessione = null, ultimoUso = 0, salvato = false;
  const sbagliati = [];

  // ---- Utilità ----
  const T = req => WIZARD[req.lingua];
  const cookie = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(c => c.length === 2));
  const autenticato = req => sessione && cookie(req).gp_setup === sessione && Date.now() - ultimoUso < SESSIONE_MS;
  const invia = (res, codiceHttp, html, extra = {}) => {
    res.writeHead(codiceHttp, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', ...extra });
    res.end(html);
  };
  const vai = (res, dove) => { res.writeHead(303, { Location: dove, 'Cache-Control': 'no-store' }); res.end(); };
  const corpo = req => new Promise((ok, ko) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 16384) { req.destroy(); ko(new Error('troppo grande')); } });
    req.on('end', () => ok(Object.fromEntries(new URLSearchParams(s))));
  });
  const intero = (v, def) => (/^\d+$/.test(String(v ?? '').trim()) && Number(v) > 0 ? String(Number(v)) : v === undefined || v === '' ? String(def) : null);

  // Messaggio da mostrare una volta sola nel passo successivo (dopo un redirect).
  let flash = null;
  const avanti = (res, passo, testo) => { flash = testo ? { passo, testo } : null; vai(res, '/passo/' + passo); };

  // Un passo è completo quando ha i dati che servono ai successivi.
  const completo = {
    controller: () => b.OMADA_URL && b.OMADA_ID,
    openapi: () => b.OMADA_CLIENT_ID && b.OMADA_CLIENT_SECRET,
    sito: () => b.OMADA_SITE_ID,
    ssid: () => b.SSID,
    operatore: () => b.HOTSPOT_USER && b.HOTSPOT_PASS,
    telegram: () => b.TG_TOKEN,
    chat: () => b.TG_CHAT,
    regole: () => true,
    riepilogo: () => false,
  };
  const primoDaFare = () => PASSI.find(p => !completo[p]()) || 'riepilogo';
  const raggiungibile = p => PASSI.indexOf(p) <= PASSI.indexOf(primoDaFare());

  // Liste lette dal controller solo quando servono (in una riconfigurazione non ci sono ancora).
  const token = () => api.tokenOpenApi(b.OMADA_URL, b.OMADA_ID, b.OMADA_CLIENT_ID, b.OMADA_CLIENT_SECRET);
  async function siti() { if (!b.siti) b.siti = await api.siti(b.OMADA_URL, b.OMADA_ID, await token()); return b.siti; }
  async function ssid() { if (!b.ssidLista) b.ssidLista = await api.ssidDelSito(b.OMADA_URL, b.OMADA_ID, await token(), b.OMADA_SITE_ID); return b.ssidLista; }
  async function nomeBot() { if (!b.botNome) b.botNome = (await api.bot(b.TG_TOKEN)).username; return b.botNome; }

  // Messaggio d'errore leggibile da un errore di wizard-api.
  function spiega(t, e, gruppo) {
    const d = esc(e.dettaglio || e.message);
    const voce = t[gruppo]?.[e.codice] || t.controller[e.codice] || t.telegram[e.codice];
    if (e.codice === 'conflitto') return t.chat.conflitto(d);
    return typeof voce === 'function' ? voce(d) : voce || d;
  }

  // ---- Schermate ----
  function schermo(req, { passo, titolo, testo = '', corpo: dentro = '', errore = '', ok = '' }) {
    const t = T(req), n = PASSI.indexOf(passo) + 1;
    const avviso = flash && flash.passo === passo ? flash.testo : ok;
    if (flash && flash.passo === passo) flash = null;
    return guscio({
      lingua: req.lingua, titolo: `${titolo} · ${t.app}`, rete: t.app, larga: true,
      sottotitolo: n ? t.passo(n, PASSI.length) : '',
      corpo: `${n ? `<div class="progresso" aria-hidden="true"><span style="width: ${Math.round((n / PASSI.length) * 100)}%"></span></div>` : ''}
  <section class="scheda wizard" aria-labelledby="titolo">
    <h1 id="titolo">${titolo}</h1>
    ${testo ? `<p class="testo-principale">${testo}</p>` : ''}
    ${errore ? `<p class="messaggio errore" role="alert">${errore}</p>` : ''}
    ${avviso ? `<p class="messaggio ok" role="status">${avviso}</p>` : ''}
    ${dentro}
  </section>`,
    });
  }

  const istruzioni = righe => `<ol class="istruzioni">${righe.map(r => `<li>${r}</li>`).join('')}</ol>`;
  const campo = (id, etichetta, { valore = '', tipo = 'text', aiuto = '', auto = 'off', extra = '' } = {}) => `
    <label class="campo" for="${id}">${etichetta}</label>
    <input class="testo" id="${id}" name="${id}" type="${tipo}" value="${esc(valore)}" autocomplete="${auto}" spellcheck="false" autocapitalize="off"${aiuto ? ` aria-describedby="${id}-aiuto"` : ''} ${extra}>
    ${aiuto ? `<p class="aiuto" id="${id}-aiuto">${aiuto}</p>` : ''}`;
  const azioni = (req, passo, etichetta) => {
    const i = PASSI.indexOf(passo), t = T(req);
    return `<div class="azioni">${i > 0 ? `<a class="bottone secondario" href="/passo/${PASSI[i - 1]}">${t.indietro}</a>` : ''}
      <button class="bottone" type="submit">${etichetta || t.continua}</button></div>`;
  };
  const scelta = (nome, valore, attivo, titolo, desc = '') => `<label class="scelta">
      <input type="radio" name="${nome}" value="${esc(valore)}"${attivo ? ' checked' : ''} required>
      <span><b>${titolo}</b>${desc ? `<small>${desc}</small>` : ''}</span></label>`;
  const modulo = (azione, dentro) => `<form class="modulo" method="post" action="${azione}">${dentro}</form>`;

  async function pagina(req, passo, errore = '') {
    const t = T(req);
    switch (passo) {
      case 'controller': return schermo(req, {
        passo, titolo: t.controller.titolo, testo: t.controller.testo, errore,
        corpo: modulo('/passo/controller', campo('url', t.controller.campo, { valore: b.OMADA_URL, tipo: 'url', aiuto: t.controller.aiuto, extra: 'inputmode="url" required' }) + azioni(req, passo)),
      });
      case 'openapi': return schermo(req, {
        passo, titolo: t.openapi.titolo, testo: t.openapi.testo, errore,
        ok: b.versione ? t.controller.trovato(esc(b.versione)) : '',
        corpo: istruzioni(t.openapi.istruzioni) + `<p class="aiuto nota-wizard">${t.openapi.nota}</p>` + modulo('/passo/openapi',
          campo('clientId', t.openapi.id, { valore: b.OMADA_CLIENT_ID, extra: 'required' })
          + campo('clientSecret', t.openapi.segreto, { tipo: 'password', aiuto: b.OMADA_CLIENT_SECRET ? t.segretoSalvato : '', auto: 'new-password', extra: b.OMADA_CLIENT_SECRET ? '' : 'required' })
          + azioni(req, passo)),
      });
      case 'sito': {
        let lista = [];
        try { lista = await siti(); } catch (e) { errore = errore || spiega(t, e, 'openapi'); }
        return schermo(req, {
          passo, titolo: t.sito.titolo, testo: t.sito.testo, errore,
          corpo: modulo('/passo/sito', `<fieldset class="scelte"><legend class="sr">${t.sito.titolo}</legend>
            ${lista.map(s => scelta('sito', s.id, s.id === b.OMADA_SITE_ID || lista.length === 1, esc(s.nome))).join('')}</fieldset>` + azioni(req, passo)),
        });
      }
      case 'ssid': {
        let lista = [];
        try { lista = await ssid(); } catch (e) { errore = errore || spiega(t, e, 'openapi'); }
        if (!lista.length && !errore) errore = t.ssid.nessuno;
        return schermo(req, {
          passo, titolo: t.ssid.titolo, testo: t.ssid.testo, errore,
          corpo: modulo('/passo/ssid', `<fieldset class="scelte"><legend class="sr">${t.ssid.titolo}</legend>
            ${lista.map(s => scelta('ssid', s.nome, s.nome === b.SSID, esc(s.nome),
              `<span class="etichetta ${s.ospiti ? 'si' : 'no'}">${s.ospiti ? t.ssid.ospitiSi : t.ssid.ospitiNo}</span> · ${s.aperta ? t.ssid.aperta : t.ssid.protetta}`)).join('')}</fieldset>`
            + (lista.some(s => s.nome === b.SSID && !s.ospiti) ? `<p class="messaggio avviso">${t.ssid.avviso}</p>` : '') + azioni(req, passo)),
        });
      }
      case 'operatore': {
        const esistente = Boolean(b.HOTSPOT_USER && b.HOTSPOT_PASS);
        return schermo(req, {
          passo, titolo: t.operatore.titolo, testo: t.operatore.testo, errore,
          corpo: modulo('/passo/operatore', `<fieldset class="scelte"><legend class="sr">${t.operatore.titolo}</legend>
            ${scelta('modo', 'crea', !esistente, t.operatore.crea, t.operatore.creaDesc)}
            ${scelta('modo', 'esistente', esistente, t.operatore.esistente, t.operatore.esistenteDesc)}</fieldset>
            <div class="sotto-scelta">${campo('nome', t.operatore.nome, { valore: b.HOTSPOT_USER })}
            ${campo('password', t.operatore.password, { tipo: 'password', aiuto: b.HOTSPOT_PASS ? t.segretoSalvato : '', auto: 'new-password' })}</div>` + azioni(req, passo)),
        });
      }
      case 'telegram': return schermo(req, {
        passo, titolo: t.telegram.titolo, testo: t.telegram.testo, errore,
        corpo: istruzioni(t.telegram.istruzioni) + modulo('/passo/telegram',
          campo('token', t.telegram.campo, { tipo: 'password', aiuto: b.TG_TOKEN ? t.segretoSalvato : '', auto: 'new-password', extra: b.TG_TOKEN ? '' : 'required' }) + azioni(req, passo)),
      });
      case 'chat': {
        let u = '?';
        try { u = esc(await nomeBot()); } catch (e) { errore = errore || spiega(t, e, 'telegram'); }
        const c = b.candidati || [];
        const etichetta = x => x.tipo === 'privata' ? t.chat.privata(esc(x.titolo)) : x.tipo === 'gruppo' ? t.chat.gruppo(esc(x.titolo)) : t.chat.topic(esc(x.topic), esc(x.titolo));
        const scelte = c.map((x, i) => scelta('scelta', String(i), x.chat === b.TG_CHAT && x.thread === b.TG_THREAD, etichetta(x),
          [x.tipo !== 'privata' && x.persona ? t.chat.daChi(esc(x.persona)) : '', `<code>${esc(x.chat)}${x.thread ? ' · ' + esc(x.thread) : ''}</code>`].filter(Boolean).join(' · ')))
          .join('').replace(/ required>/g, '>');
        return schermo(req, {
          passo, titolo: t.chat.titolo, testo: t.chat.testo(u), errore,
          ok: b.botNome && !b.cercato ? t.telegram.pronto(u) : '',
          corpo: istruzioni(t.chat.istruzioni(u))
            + modulo('/passo/chat', `<input type="hidden" name="azione" value="cerca"><button class="bottone secondario" type="submit">${t.chat.cerca}</button>`)
            + (b.cercato && !c.length ? `<p class="messaggio avviso" role="status">${t.chat.nessuna}</p>` : '')
            + modulo('/passo/chat', `<input type="hidden" name="azione" value="invia">
              ${c.length ? `<fieldset class="scelte"><legend class="sr">${t.chat.titolo}</legend>${scelte}</fieldset>` : ''}
              <details class="manuale"${!c.length && b.TG_CHAT ? ' open' : ''}><summary>${t.chat.manuale}</summary>
                ${campo('chat', t.chat.chatId, { valore: c.length ? '' : b.TG_CHAT, extra: 'inputmode="numeric"' })}
                ${campo('thread', t.chat.threadId, { valore: c.length ? '' : b.TG_THREAD, extra: 'inputmode="numeric"' })}
                ${campo('admin', t.chat.admin, { valore: b.TG_ADMIN, aiuto: t.chat.adminAiuto, extra: 'inputmode="numeric"' })}
              </details>
              <label class="campo" for="lingua">${t.chat.lingua}</label>
              <select class="testo" id="lingua" name="lingua">
                <option value="en"${b.TG_LANG !== 'it' ? ' selected' : ''}>English</option>
                <option value="it"${b.TG_LANG === 'it' ? ' selected' : ''}>Italiano</option>
              </select>` + azioni(req, passo, t.chat.invia)),
        });
      }
      case 'regole': return schermo(req, {
        passo, titolo: t.regole.titolo, errore,
        corpo: modulo('/passo/regole', campo('durate', t.regole.durate, { valore: b.DURATE || '4,24', aiuto: t.regole.durateAiuto, extra: 'required' })
          + campo('attesa', t.regole.attesa, { valore: b.SCADENZA_MIN || '10', extra: 'inputmode="numeric" required' })
          + campo('pausa', t.regole.pausa, { valore: b.PAUSA_RIFIUTO_MIN || '15', extra: 'inputmode="numeric" required' })
          + campo('max', t.regole.max, { valore: b.MAX_IN_ATTESA || '5', extra: 'inputmode="numeric" required' }) + azioni(req, passo)),
      });
      case 'riepilogo': {
        const v = t.riepilogo.voci;
        const sito = (b.siti || []).find(s => s.id === b.OMADA_SITE_ID)?.nome || b.OMADA_SITE_ID;
        const chat = (b.candidati || []).find(x => x.chat === b.TG_CHAT && x.thread === b.TG_THREAD);
        const righe = [
          [v.OMADA_URL, `${esc(b.OMADA_URL)}${b.versione ? ` (${esc(b.versione)})` : ''}`], [v.OMADA_SITE_ID, esc(sito)], [v.SSID, esc(b.SSID)],
          [v.HOTSPOT_USER, esc(b.HOTSPOT_USER)], [v.BOT, b.botNome ? '@' + esc(b.botNome) : '✓'],
          [v.TG_CHAT, chat ? esc(chat.titolo) : `<code>${esc(b.TG_CHAT)}</code>`], ...(b.TG_THREAD ? [[v.TG_THREAD, chat?.topic ? esc(chat.topic) : `<code>${esc(b.TG_THREAD)}</code>`]] : []),
          [v.TG_LANG, b.TG_LANG === 'it' ? 'Italiano' : 'English'], [v.DURATE, esc(b.DURATE || '4,24')],
        ];
        const [host, porta] = indirizzo(req);
        const ospitiNo = (b.ssidLista || []).some(s => s.nome === b.SSID && !s.ospiti);
        const ambiente = daAmbiente.filter(k => config.CHIAVI.includes(k));
        return schermo(req, {
          passo, titolo: t.riepilogo.titolo, errore,
          corpo: `<dl class="dati riepilogo">${righe.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join('')}</dl>
            ${ambiente.length ? `<p class="messaggio avviso">${t.riepilogo.ambiente(ambiente.join(', '))}</p>` : ''}
            <h2 class="sottotitolo-wizard">${t.riepilogo.daFare}</h2>
            ${istruzioni([...t.riepilogo.passi({ host: esc(host), porta: esc(porta) }, esc(b.SSID)), ...(ospitiNo ? [t.riepilogo.ospitiNo(esc(b.SSID))] : [])])}
            ${modulo('/salva', azioni(req, passo, t.riepilogo.salva))}`,
        });
      }
    }
    return null;
  }

  // Host e porta con cui il browser ha aperto il wizard: sono quelli da dare al portale di Omada.
  function indirizzo(req) {
    const h = String(req.headers.host || '');
    const m = h.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
    return m ? [m[1], m[2] || '80'] : [h, '80'];
  }

  // ---- Elaborazione dei moduli ----
  async function elabora(req, passo, f) {
    const t = T(req);
    switch (passo) {
      case 'controller': {
        const url = api.normUrl(f.url);
        if (!url) return t.controller.vuoto;
        try {
          const info = await api.infoControllore(url);
          if (info.id !== b.OMADA_ID) Object.assign(b, { OMADA_SITE_ID: '', SSID: '', siti: null, ssidLista: null });
          Object.assign(b, { OMADA_URL: url, OMADA_ID: info.id, versione: info.versione });
        } catch (e) { return spiega(t, e, 'controller'); }
        return avanti;
      }
      case 'openapi': {
        const id = String(f.clientId || '').trim(), segreto = String(f.clientSecret || '').trim() || b.OMADA_CLIENT_SECRET;
        if (!id || !segreto) return t.openapi.vuoto;
        try {
          const lista = await api.siti(b.OMADA_URL, b.OMADA_ID, await api.tokenOpenApi(b.OMADA_URL, b.OMADA_ID, id, segreto));
          if (!lista.length) return t.openapi.nessunSito;
          Object.assign(b, { OMADA_CLIENT_ID: id, OMADA_CLIENT_SECRET: segreto, siti: lista, ssidLista: null });
          if (!lista.some(s => s.id === b.OMADA_SITE_ID)) b.OMADA_SITE_ID = '';
        } catch (e) { return spiega(t, e, 'openapi'); }
        return avanti;
      }
      case 'sito': {
        const lista = await siti().catch(() => []);
        if (!lista.some(s => s.id === f.sito)) return t.sito.scegli;
        if (f.sito !== b.OMADA_SITE_ID) Object.assign(b, { OMADA_SITE_ID: f.sito, SSID: '', ssidLista: null });
        return avanti;
      }
      case 'ssid': {
        const lista = await ssid().catch(() => []);
        if (!lista.some(s => s.nome === f.ssid)) return t.ssid.scegli;
        b.SSID = f.ssid;
        return avanti;
      }
      case 'operatore': {
        try {
          if (f.modo === 'crea') {
            const op = await api.creaOperatore(b.OMADA_URL, b.OMADA_ID, await token(), b.OMADA_SITE_ID);
            Object.assign(b, { HOTSPOT_USER: op.nome, HOTSPOT_PASS: op.password });
          } else {
            const nome = String(f.nome || '').trim(), pw = String(f.password || '') || (nome === b.HOTSPOT_USER ? b.HOTSPOT_PASS : '');
            if (!nome || !pw) return t.operatore.vuoto;
            Object.assign(b, { HOTSPOT_USER: nome, HOTSPOT_PASS: pw });
          }
          await api.provaOperatore(b.OMADA_URL, b.OMADA_ID, b.HOTSPOT_USER, b.HOTSPOT_PASS);
        } catch (e) { return spiega(t, e, 'operatore'); }
        flash = { passo: 'telegram', testo: t.operatore.fatto(esc(b.HOTSPOT_USER)) };
        return avanti;
      }
      case 'telegram': {
        const tok = String(f.token || '').trim() || b.TG_TOKEN;
        try {
          const me = await api.bot(tok);
          if (tok !== b.TG_TOKEN) Object.assign(b, { TG_CHAT: '', TG_THREAD: '', candidati: null, cercato: false });
          Object.assign(b, { TG_TOKEN: tok, botNome: me.username });
        } catch (e) { return spiega(t, e, 'telegram'); }
        return avanti;
      }
      case 'chat': {
        if (f.azione === 'cerca') {
          try { b.candidati = await api.chatRecenti(b.TG_TOKEN); b.cercato = true; } catch (e) { return spiega(t, e, 'telegram'); }
          return 'resta';
        }
        const x = (b.candidati || [])[Number(f.scelta)];
        const chat = String(f.chat || '').trim() || x?.chat || '';
        const thread = String(f.thread || '').trim() || (f.chat ? '' : x?.thread || '');
        const admin = String(f.admin || '').trim() || x?.admin || b.TG_ADMIN || (x?.tipo === 'privata' ? x.chat : '');
        if (!/^-?\d+$/.test(chat) || (thread && !/^\d+$/.test(thread)) || (admin && !/^\d+$/.test(admin))) return t.chat.scegli;
        const lingua = f.lingua === 'it' ? 'it' : 'en';
        try {
          await api.inviaProva(b.TG_TOKEN, chat, thread, WIZARD[lingua].chat.prova(esc(b.SSID)));
        } catch (e) { return e.codice === 'conflitto' ? t.chat.conflitto(esc(e.dettaglio)) : t.chat.errInvio(esc(e.dettaglio || e.message)); }
        Object.assign(b, { TG_CHAT: chat, TG_THREAD: thread, TG_ADMIN: admin, TG_LANG: lingua, TG_TOPIC: '' });
        return avanti;
      }
      case 'regole': {
        const durate = String(f.durate || '').split(',').map(s => s.trim()).filter(Boolean);
        const valori = [intero(f.attesa, 10), intero(f.pausa, 15), intero(f.max, 5)];
        if (!durate.length || durate.some(d => !/^\d+$/.test(d) || Number(d) < 1) || valori.includes(null)) return t.regole.numeri;
        Object.assign(b, { DURATE: [...new Set(durate.map(Number))].join(','), SCADENZA_MIN: valori[0], PAUSA_RIFIUTO_MIN: valori[1], MAX_IN_ATTESA: valori[2] });
        return avanti;
      }
    }
    return null;
  }

  // ---- Server ----
  async function gestisci(req, res) {
    const u = new URL(req.url, 'http://wizard');
    req.lingua = linguaDa(req.headers['accept-language'], u.searchParams.get('lang'));
    const t = T(req);
    if (req.method === 'GET' && u.pathname === '/stile.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(CSS);
    }
    if (req.method === 'GET' && u.pathname === '/salute') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, setup: true }));
    }
    if (salvato) return invia(res, 503, schermo(req, { passo: '', titolo: t.fatto.titolo, testo: t.fatto.testo }));
    // Moduli inviati solo da questa stessa pagina (il cookie è comunque SameSite=Strict).
    if (req.method === 'POST' && req.headers.origin) {
      let stesso = false;
      try { stesso = new URL(req.headers.origin).host === req.headers.host; } catch { /* origin non valido */ }
      if (!stesso) return invia(res, 403, schermo(req, { passo: '', titolo: t.accesso.titolo, errore: t.origine }));
    }

    if (req.method === 'POST' && u.pathname === '/accesso') {
      const ora = Date.now();
      while (sbagliati.length && ora - sbagliati[0] > 10 * 60000) sbagliati.shift();
      if (sbagliati.length >= 10) return invia(res, 429, paginaAccesso(req, t.accesso.bloccato));
      const f = await corpo(req);
      if (!codiceGiusto(f.codice, codice)) {
        sbagliati.push(ora);
        log('wizard: codice sbagliato');
        return invia(res, 401, paginaAccesso(req, t.accesso.errato));
      }
      sessione = crypto.randomBytes(24).toString('base64url');
      ultimoUso = ora;
      log('wizard: accesso con il codice');
      res.writeHead(303, { Location: '/passo/' + primoDaFare(), 'Set-Cookie': `gp_setup=${sessione}; HttpOnly; SameSite=Strict; Path=/`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (!autenticato(req)) {
      if (req.method === 'GET' && u.pathname === '/') return invia(res, 200, paginaAccesso(req));
      if (u.pathname.startsWith('/passo/') || u.pathname === '/salva') return invia(res, 401, paginaAccesso(req, sessione ? t.sessione : ''));
      return vai(res, '/');
    }
    ultimoUso = Date.now();

    if (req.method === 'GET' && u.pathname === '/') return vai(res, '/passo/' + primoDaFare());
    const m = u.pathname.match(/^\/passo\/([a-z]+)$/);
    if (m && PASSI.includes(m[1])) {
      const passo = m[1];
      if (!raggiungibile(passo)) return vai(res, '/passo/' + primoDaFare());
      if (req.method === 'GET') return invia(res, 200, await pagina(req, passo));
      if (req.method === 'POST') {
        const esito = await elabora(req, passo, await corpo(req));
        if (esito === avanti) return avanti(res, PASSI[PASSI.indexOf(passo) + 1], flash?.testo && flash.passo === PASSI[PASSI.indexOf(passo) + 1] ? flash.testo : '');
        if (esito === 'resta') return vai(res, '/passo/' + passo);
        return invia(res, 400, await pagina(req, passo, esito));
      }
    }
    if (req.method === 'POST' && u.pathname === '/salva') {
      if (primoDaFare() !== 'riepilogo') return vai(res, '/passo/' + primoDaFare());
      const valori = Object.fromEntries(config.CHIAVI.map(k => [k, b[k] || '']));
      config.salva(valori);
      if (fileSetup) fs.rmSync(fileSetup, { force: true });
      salvato = true;
      log('wizard: configurazione salvata, avvio del portale');
      res.on('finish', () => setImmediate(alSalvataggio));
      return invia(res, 200, schermo(req, { passo: '', titolo: t.fatto.titolo, testo: t.fatto.testo, corpo: `<p class="aiuto">${t.fatto.ancora}</p>` }));
    }
    res.writeHead(404); res.end();
  }

  function paginaAccesso(req, errore = '') {
    const t = T(req);
    return schermo(req, {
      passo: '', titolo: t.accesso.titolo, testo: t.accesso.testo, errore,
      corpo: istruzioni(t.accesso.istruzioni) + modulo('/accesso', campo('codice', t.accesso.campo, { extra: 'required autofocus' })
        + `<button class="bottone" type="submit">${t.accesso.bottone}</button>`),
    });
  }

  const server = http.createServer((req, res) => {
    gestisci(req, res).catch(e => {
      log('wizard: errore', req.method, req.url, e.message);
      if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Error'); }
    });
  });
  return { server, codice, bozza: b };
}

module.exports = { creaWizard, nuovoCodice, PASSI };
