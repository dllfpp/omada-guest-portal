'use strict';
// Wizard completo contro un controller Omada e un Telegram finti (server HTTP locali).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-wizard-'));
process.env.DATA_DIR = DATA;
for (const k of ['SSID', 'OMADA_URL', 'OMADA_ID', 'TG_TOKEN', 'TG_CHAT', 'HOTSPOT_USER', 'HOTSPOT_PASS']) delete process.env[k];

const { omada, telegram, operatori, inviati, TOKEN, TOKEN_WEBHOOK } = require('./finti');

let base, omadaUrl, salvati = 0, w;
test.before(async () => {
  await new Promise(ok => omada.listen(0, '127.0.0.1', ok));
  await new Promise(ok => telegram.listen(0, '127.0.0.1', ok));
  omadaUrl = `http://127.0.0.1:${omada.address().port}`;
  process.env.TG_API_URL = `http://127.0.0.1:${telegram.address().port}`;
  const { creaWizard } = require('../src/wizard');
  w = creaWizard({ codice: 'ABCD-EFGH-JKLM', log: () => {}, alSalvataggio: () => salvati++ });
  await new Promise(ok => w.server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${w.server.address().port}`;
});
test.after(() => { w.server.close(); omada.close(); telegram.close(); });

let biscotto = '';
const get = p => fetch(base + p, { redirect: 'manual', headers: { Cookie: biscotto } });
const post = (p, dati, extra = {}) => fetch(base + p, {
  method: 'POST', redirect: 'manual', headers: { Cookie: biscotto, 'Content-Type': 'application/x-www-form-urlencoded', ...extra }, body: new URLSearchParams(dati),
});
const dove = r => r.headers.get('location');

test('senza codice: solo la pagina del codice', async () => {
  const r = await get('/');
  assert.match(await r.text(), /Enter the setup code/);
  assert.equal((await get('/passo/controller')).status, 401);
  assert.equal((await post('/accesso', { codice: 'XXXX-XXXX-XXXX' })).status, 401);
  assert.deepEqual(await (await get('/salute')).json(), { ok: true, setup: true });
});

test('codice giusto (anche minuscolo e senza trattini) → primo passo', async () => {
  const r = await post('/accesso', { codice: 'abcdefghjklm' });
  assert.equal(r.status, 303);
  assert.equal(dove(r), '/passo/controller');
  biscotto = r.headers.get('set-cookie').split(';')[0];
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
});

test('modulo da un altro sito: rifiutato', async () => {
  const r = await post('/passo/controller', { url: omadaUrl }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('passi non ancora raggiungibili riportano al primo da fare', async () => {
  assert.equal(dove(await get('/passo/telegram')), '/passo/controller');
});

test('controller → Open API (credenziali sbagliate, poi giuste) → sito → SSID', async () => {
  assert.equal(dove(await post('/passo/controller', { url: omadaUrl })), '/passo/openapi');
  assert.match(await (await get('/passo/openapi')).text(), /Omada controller 6\.2\.0 found/);
  const no = await post('/passo/openapi', { clientId: 'app', clientSecret: 'sbagliato' });
  assert.equal(no.status, 400);
  assert.match(await no.text(), /refused these credentials \(Invalid client credentials\.\)/);
  assert.equal(dove(await post('/passo/openapi', { clientId: 'app', clientSecret: 'segreto' })), '/passo/sito');
  assert.match(await (await get('/passo/sito')).text(), /value="s1" checked/);
  assert.equal(dove(await post('/passo/sito', { sito: 's1' })), '/passo/ssid');
  const ssid = await (await get('/passo/ssid')).text();
  assert.match(ssid, /Guest Network off/);
  assert.match(ssid, /GUEST-WIFI/);
  assert.equal((await post('/passo/ssid', { ssid: 'NON-ESISTE' })).status, 400);
  assert.equal(dove(await post('/passo/ssid', { ssid: 'GUEST-WIFI' })), '/passo/operatore');
});

test('operatore creato automaticamente con un nome libero e verificato', async () => {
  assert.equal(dove(await post('/passo/operatore', { modo: 'crea' })), '/passo/telegram');
  const nuovo = operatori.at(-1);
  assert.equal(nuovo.name, 'guest-portal-2');
  assert.match(nuovo.password, /[!]/);
  assert.match(await (await get('/passo/telegram')).text(), /Operator “guest-portal-2” ready/);
});

test('bot: token malformato, sbagliato, giusto', async () => {
  assert.match(await (await post('/passo/telegram', { token: 'ciao' })).text(), /doesn’t look like a bot token/);
  assert.match(await (await post('/passo/telegram', { token: '999:AAbbccddeeffgghhiijjkkll' })).text(), /Telegram doesn’t accept this token \(Unauthorized\)/);
  assert.match(await (await post('/passo/telegram', { token: TOKEN_WEBHOOK })).text(), /through a webhook \(n8n\.example\.org\)/);
  assert.equal(dove(await post('/passo/telegram', { token: TOKEN })), '/passo/chat');
});

test('chat: ricerca, scelta del topic, messaggio di prova in italiano', async () => {
  assert.equal(dove(await post('/passo/chat', { azione: 'cerca' })), '/passo/chat');
  const pag = await (await get('/passo/chat')).text();
  assert.match(pag, /Private chat with Owner/);
  assert.match(pag, /Topic “Guest WiFi” in “Family”/);
  assert.ok(pag.indexOf('Topic “Guest WiFi”') < pag.indexOf('Private chat with Owner'), 'la chat più recente per prima');
  assert.equal(dove(await post('/passo/chat', { azione: 'invia', scelta: '0', lingua: 'it' })), '/passo/regole');
  assert.deepEqual([inviati[0].chat_id, inviati[0].message_thread_id], ['-100', 7]);
  assert.match(inviati[0].text, /le richieste di accesso alla Wi-Fi ospiti arriveranno qui/);
});

test('regole: valori non validi rifiutati, durate ripulite', async () => {
  assert.equal((await post('/passo/regole', { durate: '4,x', attesa: '10', pausa: '15', max: '5' })).status, 400);
  assert.equal(dove(await post('/passo/regole', { durate: '4, 24, 4', attesa: '10', pausa: '15', max: '5' })), '/passo/riepilogo');
});

test('riepilogo e salvataggio: file solo per il proprietario, wizard spento', async () => {
  const pag = await (await get('/passo/riepilogo')).text();
  assert.match(pag, /External Portal Server/);
  assert.match(pag, /<code>127\.0\.0\.1<\/code> and port <code>\d+<\/code>/);
  assert.match(pag, /Topic<\/dt><dd>Guest WiFi/);
  assert.doesNotMatch(pag, /segreto|AAbbcc/, 'nessun segreto nella pagina');
  const r = await post('/salva', {});
  assert.match(await r.text(), /The configuration is saved/);
  await new Promise(ok => setTimeout(ok, 20));
  assert.equal(salvati, 1);
  const file = path.join(DATA, 'config.json');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(c.OMADA_URL, omadaUrl);
  assert.equal(c.OMADA_ID, 'cid1');
  assert.equal(c.OMADA_SITE_ID, 's1');
  assert.equal(c.SSID, 'GUEST-WIFI');
  assert.equal(c.HOTSPOT_USER, 'guest-portal-2');
  assert.equal(c.TG_TOKEN, TOKEN);
  assert.deepEqual([c.TG_CHAT, c.TG_THREAD, c.TG_ADMIN, c.TG_LANG], ['-100', '7', '42', 'it']);
  assert.equal(c.DURATE, '4,24');
  assert.equal((await get('/passo/controller')).status, 503, 'dopo il salvataggio il wizard non accetta altro');
});

test('wizard in italiano se il browser lo preferisce', async () => {
  const r = await fetch(base + '/salute');
  assert.equal(r.status, 200);
  const { creaWizard } = require('../src/wizard');
  const w2 = creaWizard({ log: () => {} });
  await new Promise(ok => w2.server.listen(0, '127.0.0.1', ok));
  const html = await (await fetch(`http://127.0.0.1:${w2.server.address().port}/`, { headers: { 'Accept-Language': 'it-IT,it;q=0.9' } })).text();
  w2.server.close();
  assert.match(html, /<html lang="it">/);
  assert.match(html, /Inserisci il codice di configurazione/);
});
