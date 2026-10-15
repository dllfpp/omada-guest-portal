'use strict';
// reset-password.js in un processo separato (come docker exec) mentre il portale gira: la nuova password
// vale subito, quella vecchia e le sessioni aperte no; con la password nell'ambiente il comando si rifiuta.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-reset-'));
process.env.DATA_DIR = DATA;
process.env.SSID = 'GUEST-WIFI';
for (const k of ['ADMIN_PASS', 'ADMIN_HASH', 'ADMIN_ALLOW']) delete process.env[k];

const tg = require('../src/telegram');
tg.attivo = false;
const { server } = require('../src/server');
const SCRIPT = path.join(__dirname, '..', 'src', 'reset-password.js');
const reset = () => {
  const env = { PATH: process.env.PATH, DATA_DIR: DATA };
  return execFileSync(process.execPath, [SCRIPT], { env, encoding: 'utf8' }).match(/New admin password: (\S+)/)[1];
};

let base;
test.before(() => new Promise(ok => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; ok(); })));
test.after(() => server.close());
const accedi = pw => fetch(base + '/admin/accesso', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams({ password: pw }) });
const pannello = c => fetch(base + '/admin', { headers: { Cookie: c, 'Accept-Language': 'en' } }).then(r => r.text());

test('senza password il pannello è spento', async () => {
  assert.equal((await fetch(base + '/admin')).status, 503);
});

test('reset: password leggibile, solo hash su file, vale subito senza riavvio', async () => {
  const pw = reset();
  assert.match(pw, /^[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){3}$/);
  const salvato = fs.readFileSync(path.join(DATA, 'config.json'), 'utf8');
  assert.match(salvato, /"ADMIN_HASH": "scrypt\$/);
  assert.ok(!salvato.includes(pw), 'la password in chiaro non va su disco');
  const r = await accedi(pw);
  assert.equal(r.status, 303);
  const c = r.headers.get('set-cookie').split(';')[0];
  assert.match(await pannello(c), /Connected guests/);

  // Secondo reset: la vecchia password e la sessione aperta non valgono più.
  const nuova = reset();
  assert.notEqual(nuova, pw);
  assert.match(await pannello(c), /Sign in/, 'sessione chiusa dal reset');
  assert.equal((await accedi(pw)).status, 401);
  assert.equal((await accedi(nuova)).status, 303);
});

test('password nell\'ambiente: il comando si rifiuta e lo spiega', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, DATA_DIR: DATA, ADMIN_PASS: 'dal-env-1234' }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /ADMIN_PASS is set in the container environment/);
});
