'use strict';
// avvio.js in un processo vero: senza configurazione parte il wizard (codice nel log), dopo il
// salvataggio parte il portale sulla stessa porta, nello stesso processo.
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { omada, telegram, TOKEN } = require('./finti');

const portaLibera = () => new Promise(ok => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const aspetta = ms => new Promise(ok => setTimeout(ok, ms));

test('primo avvio: wizard, salvataggio, portale nello stesso processo', async t => {
  await new Promise(ok => omada.listen(0, '127.0.0.1', ok));
  await new Promise(ok => telegram.listen(0, '127.0.0.1', ok));
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-avvio-'));
  const PORT = await portaLibera();
  const env = { PATH: process.env.PATH, DATA_DIR: DATA, PORT: String(PORT), TG_API_URL: `http://127.0.0.1:${telegram.address().port}` };
  const figlio = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'avvio.js')], { env });
  let log = '';
  figlio.stdout.on('data', d => (log += d));
  figlio.stderr.on('data', d => (log += d));
  t.after(() => { figlio.kill(); omada.close(); telegram.close(); });

  for (let i = 0; i < 50 && !/Setup code: \S+/.test(log); i++) await aspetta(100);
  const codice = log.match(/Setup code: (\S+)/)?.[1];
  assert.ok(codice, 'codice nel log:\n' + log);
  assert.match(log, /Missing configuration: SSID/);
  const base = `http://127.0.0.1:${PORT}`;
  assert.deepEqual(await (await fetch(base + '/salute')).json(), { ok: true, setup: true });

  let biscotto = '';
  const post = async (p, dati) => {
    const r = await fetch(base + p, { method: 'POST', redirect: 'manual', headers: { Cookie: biscotto, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(dati) });
    if (r.status >= 400) assert.fail(`${p}: ${r.status}\n${(await r.text()).slice(0, 400)}`);
    return r;
  };
  biscotto = (await post('/accesso', { codice })).headers.get('set-cookie').split(';')[0];
  await post('/passo/controller', { url: `http://127.0.0.1:${omada.address().port}` });
  await post('/passo/openapi', { clientId: 'app', clientSecret: 'segreto' });
  await post('/passo/sito', { sito: 's1' });
  await post('/passo/ssid', { ssid: 'GUEST-WIFI' });
  await post('/passo/operatore', { modo: 'crea' });
  await post('/passo/telegram', { token: TOKEN });
  await post('/passo/chat', { azione: 'invia', chat: '42', lingua: 'en' });
  await post('/passo/regole', { durate: '4,24', attesa: '10', pausa: '15', max: '5' });
  await post('/salva', {});

  let salute = null;
  for (let i = 0; i < 50; i++) {
    await aspetta(100);
    salute = await fetch(base + '/salute').then(r => r.json()).catch(() => null);
    if (salute && !salute.setup) break;
  }
  assert.equal(salute?.ok, true, log);
  assert.equal(salute.setup, undefined, 'ora risponde il portale');
  assert.equal(salute.telegram, true);
  assert.match(log, /portale su :\d+, SSID GUEST-WIFI/);
  const pagina = await (await fetch(base + '/')).text();
  assert.match(pagina, /Connect to the GUEST-WIFI network/);
});
