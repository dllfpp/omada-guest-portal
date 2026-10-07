'use strict';
// Flusso completo con controller e Telegram finti: redirect → richiesta → attesa → approvazione/rifiuto/revoca.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-'));
process.env.TG_CHAT = '1';
process.env.SSID = 'GUEST-WIFI';
const omada = require('../src/omada');
const tg = require('../src/telegram');

const chiamate = [];
omada.cliente = async mac => (mac === 'AA-BB-CC-00-00-02'
  ? { ssid: 'CASA', apName: 'AP' }
  : { ssid: 'GUEST-WIFI', name: 'iPhone', vendor: 'Apple', osName: 'iOS', apName: 'AP-SALOTTO' });
omada.autorizza = async (r, ore) => { chiamate.push(['auth', r.mac, ore]); return Date.now() + ore * 3600000; };
omada.revoca = async mac => { chiamate.push(['unauth', mac]); };
tg.attivo = true;
tg.invia = async (testo, bottoni) => { chiamate.push(['invia', testo, bottoni]); return { message_id: 7 }; };
tg.modifica = async (id, testo, bottoni) => { chiamate.push(['modifica', testo, bottoni]); };
tg.rispondi = async (id, testo) => { chiamate.push(['rispondi', testo]); };

const { server, daParametri, bottone } = require('../src/server');

const PARAMETRI = { clientMac: 'aa:bb:cc:00:00:01', clientIp: '10.20.30.40', apMac: '02-00-00-00-AA-01', ssidName: 'GUEST-WIFI', radioId: '1', site: 'x', t: '1', redirectUrl: 'http://neverssl.com/' };

let base;
test.before(() => new Promise(ok => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; ok(); })));
test.after(() => server.close());

const post = (p, dati) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(dati) });

test('parametri: solo SSID giusto e MAC validi', () => {
  assert.equal(daParametri(PARAMETRI).mac, 'AA-BB-CC-00-00-01');
  assert.equal(daParametri({ ...PARAMETRI, ssidName: 'CASA' }), null);
  assert.equal(daParametri({ ...PARAMETRI, clientMac: 'boh' }), null);
  assert.equal(daParametri({ ...PARAMETRI, redirectUrl: 'javascript:alert(1)' }).redirectUrl, '');
});

test('redirect di Omada mostra il modulo con i parametri', async () => {
  const r = await fetch(base + '/?' + new URLSearchParams(PARAMETRI));
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(html, /Chiedi accesso/);
  assert.match(html, /name="clientMac" value="aa:bb:cc:00:00:01"/);
});

let id;
test('richiesta → messaggio Telegram con bottoni → pagina di attesa', async () => {
  const r = await post('/richiesta', { ...PARAMETRI, nome: '<b>Giulia</b>' });
  assert.equal(r.status, 303);
  id = new URL(r.headers.get('location'), base).searchParams.get('id');
  const msg = chiamate.find(c => c[0] === 'invia');
  assert.match(msg[1], /&lt;b&gt;Giulia&lt;\/b&gt;/, 'nome escapato');
  assert.match(msg[1], /iPhone · Apple · iOS/);
  assert.deepEqual(msg[2][0].map(b => b.callback_data), [`sg:ok:${id}:4`, `sg:ok:${id}:24`]);
  const pag = await (await fetch(base + '/stato?id=' + id)).text();
  assert.match(pag, /http-equiv="refresh"/);
  assert.match(pag, /Richiesta inviata/);
});

test('seconda richiesta dallo stesso dispositivo riporta alla stessa attesa', async () => {
  const r = await post('/richiesta', PARAMETRI);
  assert.equal(new URL(r.headers.get('location'), base).searchParams.get('id'), id);
  assert.equal(chiamate.filter(c => c[0] === 'invia').length, 1);
});

test('durata non prevista rifiutata, poi approvazione 4 ore', async () => {
  await bottone({ id: 'q', data: `sg:ok:${id}:999`, message: { message_id: 7 } });
  assert.ok(!chiamate.some(c => c[0] === 'auth'));
  await bottone({ id: 'q', data: `sg:ok:${id}:4`, message: { message_id: 7 } });
  assert.deepEqual(chiamate.find(c => c[0] === 'auth'), ['auth', 'AA-BB-CC-00-00-01', 4]);
  // L'attesa che si ricarica porta al benvenuto, mai al redirectUrl di Omada (sonda del sistema).
  const r = await fetch(base + '/stato?id=' + id, { redirect: 'manual' });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/benvenuto?id=' + id);
  const pag = await (await fetch(base + r.headers.get('location'))).text();
  assert.match(pag, /Ti diamo il benvenuto, &lt;b&gt;Giulia&lt;\/b&gt;/);
  assert.match(pag, /Tempo rimasto/);
  const t = Number(pag.match(/--t: (\d+)/)[1]);
  assert.ok(t > 14390 && t <= 14400, 'conto alla rovescia di circa 4 ore: ' + t);
  assert.match(pag, /animation-duration: \d+s/);
  assert.match(pag, /http-equiv="refresh" content="\d+;url=\/benvenuto\?id=/);
  assert.doesNotMatch(pag, /fino alle/);
  assert.doesNotMatch(pag, /neverssl/);
  assert.doesNotMatch(pag, /http-equiv="refresh" content="5"/);
});

test('revoca da Telegram', async () => {
  await bottone({ id: 'q', data: `sg:rev:${id}`, message: { message_id: 7 } });
  assert.deepEqual(chiamate.find(c => c[0] === 'unauth'), ['unauth', 'AA-BB-CC-00-00-01']);
  assert.match(await (await fetch(base + '/stato?id=' + id)).text(), /Accesso revocato/);
});

test('rifiuto blocca nuove richieste per la pausa', async () => {
  const r = await post('/richiesta', { ...PARAMETRI, clientMac: 'AA-BB-CC-00-00-03' });
  const id2 = new URL(r.headers.get('location'), base).searchParams.get('id');
  await bottone({ id: 'q', data: `sg:no:${id2}`, message: { message_id: 7 } });
  const r2 = await post('/richiesta', { ...PARAMETRI, clientMac: 'AA-BB-CC-00-00-03' });
  assert.equal(new URL(r2.headers.get('location'), base).searchParams.get('id'), id2);
  assert.match(await (await fetch(base + '/stato?id=' + id2)).text(), /non approvata/);
});

test('client su un altro SSID: niente richiesta', async () => {
  const r = await post('/richiesta', { ...PARAMETRI, clientMac: 'AA-BB-CC-00-00-02' });
  assert.equal(r.status, 403);
});

test('anteprima del benvenuto con dati finti', async () => {
  const pag = await (await fetch(base + '/anteprima/benvenuto?nome=Giulia&ore=24&secondi=90')).text();
  assert.match(pag, /Ti diamo il benvenuto, Giulia/);
  assert.match(pag, /--t: 90;/);
  assert.match(pag, /su 24 ore concesse/);
  assert.match(pag, /content="92;url=\/anteprima\/terminata"/);
  assert.match(await (await fetch(base + '/anteprima/terminata')).text(), /Accesso terminato/);
});
