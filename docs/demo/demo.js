// Demo statica: simula il server del portale nel browser. Le pagine dell'ospite e il messaggio
// Telegram sono generati da GuestPortal (lo stesso codice di src/, impacchettato da demo/build.js).
(function () {
  'use strict';
  var P = window.GuestPortal;
  P.env.SSID = 'GUEST-WIFI';
  P.env.DURATE = '4,24';
  try { P.env.TZ = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* fuso del browser non disponibile */ }

  var TESTI = {
    en: {
      sottotitolo: 'Interactive demo: everything runs in your browser, with a simulated controller and a simulated Telegram.',
      schedaOspite: 'Guest and owner', schedaWizard: 'Setup wizard', codice: 'Source code',
      titoloOspite: 'A guest asks, the owner approves',
      introOspite: 'The phone of a guest who joined the guest Wi-Fi, and the owner’s Telegram chat. Ask for access from the phone, then answer from the chat.',
      telefono: 'Guest’s phone', tgNota: 'Simulated Telegram chat', tgVuota: 'No requests yet. Ask for access from the phone.',
      avanti: 'Skip to expiry', ricomincia: 'Restart demo',
      titoloWizard: 'First run: the setup wizard',
      introWizard: 'On the first start the container opens this wizard. These are its real pages, recorded against a simulated controller: any value works, just press the buttons.',
      wizardInizio: 'Restart the wizard', titoloTelefono: 'Guest’s phone', titoloWizardFrame: 'Setup wizard',
    },
    it: {
      sottotitolo: 'Demo interattiva: tutto gira nel tuo browser, con un controller e un Telegram simulati.',
      schedaOspite: 'Ospite e proprietario', schedaWizard: 'Wizard di configurazione', codice: 'Codice sorgente',
      titoloOspite: 'Un ospite chiede, il proprietario approva',
      introOspite: 'Il telefono di un ospite collegato alla Wi-Fi ospiti e la chat Telegram del proprietario. Chiedi l’accesso dal telefono, poi rispondi dalla chat.',
      telefono: 'Telefono dell’ospite', tgNota: 'Chat Telegram simulata', tgVuota: 'Ancora nessuna richiesta. Chiedi l’accesso dal telefono.',
      avanti: 'Vai alla scadenza', ricomincia: 'Ricomincia la demo',
      titoloWizard: 'Primo avvio: il wizard di configurazione',
      introWizard: 'Al primo avvio il container apre questo wizard. Queste sono le sue pagine vere, registrate con un controller simulato: qualsiasi valore va bene, basta premere i bottoni.',
      wizardInizio: 'Ricomincia il wizard', titoloTelefono: 'Telefono dell’ospite', titoloWizardFrame: 'Wizard di configurazione',
    },
  };

  var $ = function (s) { return document.querySelector(s); };
  var telefono = $('#telefono'), chat = $('#chat'), avviso = $('#avviso'), wizard = $('#wizard-pagina');
  var lingua = /^it\b/i.test(new URLSearchParams(location.search).get('lang') || navigator.language || '') ? 'it' : 'en';

  // Stato simulato: una richiesta alla volta, come un solo dispositivo.
  var stato, r, messaggio, timerAttesa, domanda;
  var ATTESA_MIN = 10, PAUSA_MIN = 15, MAX_ORE = 720;

  function nuovoStato() {
    clearTimeout(timerAttesa);
    stato = 'richiesta'; r = null; messaggio = null; domanda = null;
    disegnaTelefono(); disegnaChat();
  }

  // ---- Telefono ----
  function disegnaTelefono() {
    var s = { stato: stato, lingua: lingua, r: r, pausaMin: PAUSA_MIN, attesaMin: ATTESA_MIN, parametri: {} };
    if (stato === 'ok' && r.scade <= Date.now()) s.stato = 'terminata';
    var html = P.pagina(s, { css: 'demo/stile.css' })
      .replace(/<meta http-equiv="refresh"[^>]*>/, '')            // i passaggi li fa la demo
      .replace('<head>', '<head><base target="_blank">');        // i link (firma) si aprono fuori
    telefono.srcdoc = html;
  }
  telefono.addEventListener('load', function () {
    var doc = telefono.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('form').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (f.getAttribute('action') === '/richiesta' || f.getAttribute('action') === '/rinnova') chiedi(f.nome ? f.nome.value : (r && r.nome));
      });
    });
  });

  function chiedi(nome) {
    var ora = Date.now();
    r = {
      id: 'demo' + ora, nome: String(nome || '').trim().slice(0, 40), mac: '02-00-00-00-00-01', ip: '10.20.30.40',
      apMac: '02-00-00-00-AA-01', radioId: 1, verificato: true, creata: ora, scadeAttesa: ora + ATTESA_MIN * 60000,
      info: { name: 'iPhone', vendor: 'Apple', osName: 'iOS', apName: 'AP-LIVING' },
    };
    stato = 'attesa';
    messaggio = { esito: null, bottoni: 'richiesta' };
    clearTimeout(timerAttesa);
    timerAttesa = setTimeout(scadeRichiesta, ATTESA_MIN * 60000);
    disegnaTelefono(); disegnaChat();
  }

  function scadeRichiesta() {
    if (stato !== 'attesa') return;
    stato = 'scaduta';
    messaggio = { esito: { tipo: 'scaduta', quando: Date.now() }, bottoni: null };
    disegnaTelefono(); disegnaChat();
  }

  // ---- Telegram simulato ----
  function testoEsito(e) {
    if (!e) return '';
    var T = P.tg(), q = P.oraTg(e.quando);
    if (e.tipo === 'ok') return '\n✅ ' + T.autorizzato(e.ore, q, P.oraTg(e.fino));
    if (e.tipo === 'no') return '\n❌ ' + T.rifiutata(q);
    if (e.tipo === 'rev') return '\n⛔ ' + T.revocata(q);
    return '\n⌛ ' + T.scaduta(q);
  }

  function disegnaChat() {
    P.env.TG_LANG = lingua;
    chat.innerHTML = '';
    if (!r) {
      var vuota = document.createElement('p');
      vuota.className = 'tg-vuota';
      vuota.textContent = TESTI[lingua].tgVuota;
      chat.appendChild(vuota);
      return;
    }
    var bolla = document.createElement('article');
    bolla.className = 'tg-bolla';
    var testo = document.createElement('div');
    testo.className = 'tg-testo';
    testo.innerHTML = P.testoRichiesta(r, testoEsito(messaggio.esito)).replace(/\n/g, '<br>');  // HTML già escapato dal portale
    bolla.appendChild(testo);
    var righe = messaggio.bottoni === 'richiesta' ? P.bottoniRichiesta(r)
      : messaggio.bottoni === 'revoca' ? [[{ text: '⛔ ' + P.tg().revoca, callback_data: 'sg:rev:' + r.id }]] : [];
    if (righe.length) {
      var tastiera = document.createElement('div');
      tastiera.className = 'tg-tastiera';
      righe.forEach(function (riga) {
        var div = document.createElement('div');
        div.className = 'tg-riga';
        riga.forEach(function (b) {
          var bt = document.createElement('button');
          bt.type = 'button'; bt.textContent = b.text;
          bt.addEventListener('click', function () { premi(b.callback_data); });
          div.appendChild(bt);
        });
        tastiera.appendChild(div);
      });
      bolla.appendChild(tastiera);
    }
    chat.appendChild(bolla);
    if (domanda) chat.appendChild(bollaDomanda());
  }

  // "Hours…": il bot chiede le ore con una risposta forzata; qui la risposta si scrive nel campo sotto.
  function bollaDomanda() {
    var T = P.tg();
    var b = document.createElement('article');
    b.className = 'tg-bolla';
    var t = document.createElement('div');
    t.className = 'tg-testo';
    var esc = function (s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
    t.innerHTML = (domanda.errore ? T.oreNonValide(MAX_ORE) : T.chiediOre(esc(r.nome || r.mac), MAX_ORE));
    b.appendChild(t);
    var f = document.createElement('form');
    f.className = 'tg-risposta';
    var campo = document.createElement('input');
    campo.type = 'text'; campo.inputMode = 'numeric'; campo.placeholder = '6'; campo.autocomplete = 'off';
    campo.setAttribute('aria-label', T.oreLibere);
    var invia = document.createElement('button');
    invia.type = 'submit'; invia.textContent = '➤';
    invia.setAttribute('aria-label', 'Send');
    f.appendChild(campo); f.appendChild(invia);
    f.addEventListener('submit', function (e) { e.preventDefault(); rispondiOre(campo.value); });
    b.appendChild(f);
    setTimeout(function () { campo.focus(); }, 0);
    return b;
  }

  function rispondiOre(valore) {
    var t = String(valore).trim(), h = /^\d+$/.test(t) ? Number(t) : 0;
    if (!(stato === 'attesa' || stato === 'scaduta')) { domanda = null; rispondi(P.tg().risposte.chiusa); disegnaChat(); return; }
    if (h < 1 || h > MAX_ORE) { domanda = { errore: true }; disegnaChat(); return; }
    domanda = null;
    approva(h);
  }

  function approva(ore) {
    var ora = Date.now();
    clearTimeout(timerAttesa);
    r.ore = ore; r.scade = ora + ore * 3600000; stato = 'ok';
    messaggio = { esito: { tipo: 'ok', ore: ore, quando: ora, fino: r.scade }, bottoni: 'revoca' };
    rispondi(P.tg().risposte.ok);
    disegnaTelefono(); disegnaChat();
  }

  function rispondi(testo) {
    avviso.textContent = testo;
    clearTimeout(rispondi.t);
    rispondi.t = setTimeout(function () { avviso.textContent = ''; }, 2500);
  }

  function premi(dati) {
    var parti = dati.split(':'), azione = parti[1], ore = Number(parti[3]), R = P.tg().risposte, ora = Date.now();
    if (azione === 'ok' && (stato === 'attesa' || stato === 'scaduta')) {
      domanda = null; approva(ore); return;
    } else if (azione === 'ore' && (stato === 'attesa' || stato === 'scaduta')) {
      domanda = { errore: false }; rispondi(P.tg().oreLibere); disegnaChat(); return;
    } else if (azione === 'no' && (stato === 'attesa' || stato === 'scaduta')) {
      clearTimeout(timerAttesa);
      stato = 'no';
      messaggio = { esito: { tipo: 'no', quando: ora }, bottoni: null };
      rispondi(R.no);
    } else if (azione === 'rev' && stato === 'ok') {
      stato = 'revocata';
      messaggio = { esito: { tipo: 'rev', quando: ora }, bottoni: null };
      rispondi(R.revocato);
    } else { rispondi(R.chiusa); return; }
    disegnaTelefono(); disegnaChat();
  }

  // ---- Comandi ----
  $('#avanti').addEventListener('click', function () {
    if (stato === 'attesa') { clearTimeout(timerAttesa); scadeRichiesta(); }
    else if (stato === 'ok') { r.scade = Date.now() - 1000; stato = 'terminata'; messaggio.bottoni = null; disegnaTelefono(); disegnaChat(); }
  });
  $('#ricomincia').addEventListener('click', nuovoStato);
  $('#wizard-inizio').addEventListener('click', function () { wizard.src = 'demo/wizard/' + lingua + '/accesso.html'; });

  function applicaLingua(l) {
    lingua = l;
    document.documentElement.lang = l;
    document.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = TESTI[l][el.getAttribute('data-t')]; });
    document.querySelectorAll('[data-lingua]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lingua') === l)); });
    telefono.title = TESTI[l].titoloTelefono;
    wizard.title = TESTI[l].titoloWizardFrame;
    // Il wizard resta allo stesso passo, nell'altra lingua. Prima del caricamento la cornice è
    // ancora about:blank: in quel caso vale l'attributo src.
    var attuale = '';
    try { attuale = wizard.contentWindow.location.pathname; } catch (e) { /* cornice non accessibile */ }
    if (!/\/wizard\/(en|it)\//.test(attuale)) attuale = wizard.getAttribute('src');
    var nuovo = attuale.replace(/wizard\/(en|it)\//, 'wizard/' + l + '/');
    if (nuovo !== attuale) wizard.src = nuovo;
    disegnaTelefono(); disegnaChat();
  }
  document.querySelectorAll('[data-lingua]').forEach(function (b) {
    b.addEventListener('click', function () { applicaLingua(b.getAttribute('data-lingua')); });
  });

  nuovoStato();
  applicaLingua(lingua);
})();
