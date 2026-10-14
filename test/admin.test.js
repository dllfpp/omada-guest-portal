'use strict';
// Pannello di amministrazione con controller e Telegram finti: accesso, elenchi, allunga/accorcia/nuova durata/revoca, reti.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-admin-'));
process.env.SSID = 'GUEST-WIFI';
process.env.ADMIN_PASS = 'password-di-prova';
delete process.env.ADMIN_HASH;
delete process.env.ADMIN_ALLOW;

const omada = require('../src/omada');
const tg = require('../src/telegram');
const chiamate = [];
omada.cliente = async () => null;
omada.autorizza = async (r, ore) => { chiamate.push(['auth', r.mac, ore]); return Date.now() + ore * 3600000; };
omada.revoca = async mac => { chiamate.push(['unauth', mac]); };
tg.attivo = false;

const { server, stato } = require('../src/server');
const { hashPassword, passwordGiusta, inRete } = require('../src/admin');

let base, biscotto = '';
test.before(() => new Promise(ok => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; ok(); })));
test.after(() => server.close());

const get = p => fetch(base + p, { redirect: 'manual', headers: { Cookie: biscotto, 'Accept-Language': 'en' } });
const post = (p, dati, extra = {}) => fetch(base + p, {
  method: 'POST', redirect: 'manual', headers: { Cookie: biscotto, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Language': 'en', ...extra }, body: new URLSearchParams(dati),
});

// Un ospite già autorizzato per 2 ore, uno passato.
const ora = Date.now();
const attivo = stato.crea({ mac: 'AA-BB-CC-00-00-01', apMac: '02-00-00-00-AA-01', ssid: 'GUEST-WIFI', radioId: 1, ip: '10.9.9.9', nome: 'Guest <b>' });
stato.aggiorna(attivo.id, { stato: 'ok', ore: 2, scade: ora + 2 * 3600000, chiusa: ora });
const vecchio = stato.crea({ mac: 'AA-BB-CC-00-00-02', apMac: '02-00-00-00-AA-01', ssid: 'GUEST-WIFI', radioId: 1, nome: 'Old' });
stato.aggiorna(vecchio.id, { stato: 'no', chiusa: ora - 3600000 });

test('password: hash scrypt e confronto', () => {
  const h = hashPassword('una-password-lunga');
  assert.match(h, /^scrypt\$/);
  const prima = process.env.ADMIN_PASS;
  delete process.env.ADMIN_PASS; process.env.ADMIN_HASH = h;
  assert.equal(passwordGiusta('una-password-lunga'), true);
  assert.equal(passwordGiusta('sbagliata'), false);
  delete process.env.ADMIN_HASH; process.env.ADMIN_PASS = prima;
});

test('reti in CIDR', () => {
  assert.equal(inRete('192.168.1.20', '192.168.1.0/24'), true);
  assert.equal(inRete('192.168.2.20', '192.168.1.0/24'), false);
  assert.equal(inRete('10.1.2.3', '10.0.0.0/8'), true);
});

test('senza sessione: pagina di accesso, password sbagliata rifiutata', async () => {
  assert.match(await (await get('/admin')).text(), /Sign in/);
  const no = await post('/admin/accesso', { password: 'no' });
  assert.equal(no.status, 401);
  assert.match(await no.text(), /Wrong password/);
  assert.equal((await post('/admin/durata', { id: attivo.id, modo: 'piu' })).status, 401);
  assert.equal(chiamate.length, 0);
});

test('modulo da un altro sito rifiutato', async () => {
  assert.equal((await post('/admin/accesso', { password: 'password-di-prova' }, { Origin: 'https://evil.example' })).status, 403);
});

test('accesso: cookie HttpOnly, elenco attivi e storico, nome escapato', async () => {
  const r = await post('/admin/accesso', { password: 'password-di-prova' });
  assert.equal(r.status, 303);
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/admin/);
  biscotto = r.headers.get('set-cookie').split(';')[0];
  const html = await (await get('/admin')).text();
  assert.match(html, /Connected guests \(1\)/);
  assert.match(html, /Guest &lt;b&gt;/);
  assert.match(html, /AA-BB-CC-00-00-01/);
  assert.match(html, /History \(last 30 days\)/);
  assert.match(html, /Old[\s\S]*rejected/);
});

test('+1 ora: solo una nuova autorizzazione con il tempo residuo', async () => {
  chiamate.length = 0;
  assert.equal((await post('/admin/durata', { id: attivo.id, modo: 'piu' })).headers.get('location'), '/admin');
  assert.deepEqual(chiamate.map(c => c[0]), ['auth']);
  assert.ok(Math.abs(chiamate[0][2] - 3) < 0.01, 'circa 3 ore: ' + chiamate[0][2]);
  assert.match(await (await get('/admin')).text(), /Access extended until/);
});

test('−1 ora: revoca e nuova autorizzazione più breve', async () => {
  chiamate.length = 0;
  await post('/admin/durata', { id: attivo.id, modo: 'meno' });
  assert.deepEqual(chiamate.map(c => c[0]), ['unauth', 'auth']);
  assert.ok(Math.abs(chiamate[1][2] - 2) < 0.01);
  assert.match(await (await get('/admin')).text(), /Access shortened/);
});

test('nuova durata: valori non validi rifiutati, poi 5 ore', async () => {
  chiamate.length = 0;
  await post('/admin/durata', { id: attivo.id, modo: 'nuova', ore: '0' });
  assert.match(await (await get('/admin')).text(), /whole number of hours from 1 to 720/);
  await post('/admin/durata', { id: attivo.id, modo: 'nuova', ore: '999' });
  assert.equal(chiamate.length, 0);
  await post('/admin/durata', { id: attivo.id, modo: 'nuova', ore: '5' });
  assert.deepEqual(chiamate.map(c => c[0]), ['auth'], 'più lunga del residuo: niente revoca');
  assert.ok(Math.abs(chiamate[0][2] - 5) < 0.01);
});

test('revoca: prima la conferma, poi la revoca vera', async () => {
  chiamate.length = 0;
  const conferma = await (await get('/admin/revoca?id=' + attivo.id)).text();
  assert.match(conferma, /Revoke access\?/);
  assert.equal(chiamate.length, 0, 'la pagina di conferma non tocca il controller');
  await post('/admin/revoca', { id: attivo.id });
  assert.deepEqual(chiamate, [['unauth', 'AA-BB-CC-00-00-01']]);
  assert.equal(stato.get(attivo.id).stato, 'revocata');
  const html = await (await get('/admin')).text();
  assert.match(html, /Access revoked/);
  assert.match(html, /Connected guests \(0\)/);
  await post('/admin/durata', { id: attivo.id, modo: 'piu' });
  assert.match(await (await get('/admin')).text(), /no longer has access/);
});

test('uscita: la sessione non vale più', async () => {
  await post('/admin/esci', {});
  assert.match(await (await get('/admin')).text(), /Sign in/);
});

test('reti: dispositivo ospite e reti fuori da ADMIN_ALLOW rifiutati', async () => {
  const vecchia = stato.crea({ mac: 'AA-BB-CC-00-00-04', apMac: '02-00-00-00-AA-01', ssid: 'GUEST-WIFI', ip: '127.0.0.1' });
  stato.aggiorna(vecchia.id, { stato: 'no', chiusa: Date.now() });
  assert.equal((await get('/admin')).status, 200, 'una richiesta chiusa non blocca il suo vecchio IP');
  const ospite = stato.crea({ mac: 'AA-BB-CC-00-00-03', apMac: '02-00-00-00-AA-01', ssid: 'GUEST-WIFI', radioId: 1, ip: '127.0.0.1' });
  assert.equal((await get('/admin')).status, 403, 'IP di un ospite');
  stato.aggiorna(ospite.id, { ip: '10.0.0.1' });
  process.env.ADMIN_ALLOW = '192.168.1.0/24';
  assert.equal((await get('/admin')).status, 403, 'fuori dalle reti ammesse');
  process.env.ADMIN_ALLOW = '127.0.0.0/8';
  assert.equal((await get('/admin')).status, 200);
  delete process.env.ADMIN_PASS;
  assert.equal((await get('/admin')).status, 503, 'senza password il pannello è spento');
});
