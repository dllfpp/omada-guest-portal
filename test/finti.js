'use strict';
// Controller Omada e Telegram finti per i test del wizard e dell'avvio.
const http = require('http');
const assert = require('node:assert');

const json = (res, x) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
const leggi = req => new Promise(ok => { let s = ''; req.on('data', c => (s += c)); req.on('end', () => ok(s ? JSON.parse(s) : {})); });

// ---- Controller finto ----
const operatori = [{ name: 'guest-portal', password: 'x' }];
const omada = http.createServer(async (req, res) => {
  const u = req.url, b = await leggi(req);
  if (u === '/api/info') return json(res, { errorCode: 0, result: { omadacId: 'cid1', controllerVer: '6.2.0' } });
  if (u.startsWith('/openapi/authorize/token')) {
    return b.client_id === 'app' && b.client_secret === 'segreto'
      ? json(res, { errorCode: 0, result: { accessToken: 'AT', expiresIn: 7200 } })
      : json(res, { errorCode: -44106, msg: 'Invalid client credentials.' });
  }
  if (u.startsWith('/openapi/v1/cid1/')) {
    assert.equal(req.headers.authorization, 'AccessToken=AT');
    const p = u.slice('/openapi/v1/cid1'.length);
    if (p.startsWith('/sites?')) return json(res, { errorCode: 0, result: { data: [{ siteId: 's1', name: 'Home' }] } });
    if (p === '/sites/s1/wireless-network/wlans') return json(res, { errorCode: 0, result: [{ wlanId: 'w1' }] });
    if (p.startsWith('/sites/s1/wireless-network/wlans/w1/ssids')) {
      return json(res, { errorCode: 0, result: { data: [{ name: 'HOME', guestNetEnable: false, security: 3 }, { name: 'GUEST-WIFI', guestNetEnable: true, security: 0 }] } });
    }
    if (p.startsWith('/sites/s1/hotspot/operators') && req.method === 'GET') return json(res, { errorCode: 0, result: { data: operatori.map(o => ({ name: o.name })) } });
    if (p === '/sites/s1/hotspot/operators' && req.method === 'POST') { operatori.push({ name: b.name, password: b.password }); return json(res, { errorCode: 0 }); }
  }
  if (u === '/cid1/api/v2/hotspot/login') {
    return operatori.some(o => o.name === b.name && o.password === b.password)
      ? json(res, { errorCode: 0, result: { token: 'csrf' } }) : json(res, { errorCode: -30109, msg: 'Invalid username or password.' });
  }
  res.writeHead(404); res.end();
});

// ---- Telegram finto ----
const TOKEN = '123456:AAbbccddeeffgghhiijjkkll';
const TOKEN_WEBHOOK = '654321:ZZyyxxwwvvuuttssrrqqpp';
const inviati = [];
const telegram = http.createServer(async (req, res) => {
  const [, bot, metodo] = req.url.split('/');
  const b = await leggi(req);
  if (bot === 'bot' + TOKEN_WEBHOOK) {
    return json(res, metodo === 'getMe' ? { ok: true, result: { username: 'shared_bot' } } : { ok: true, result: { url: 'https://n8n.example.org/webhook/abc' } });
  }
  if (bot !== 'bot' + TOKEN) return json(res, { ok: false, error_code: 401, description: 'Unauthorized' });
  if (metodo === 'getWebhookInfo') return json(res, { ok: true, result: { url: '' } });
  if (metodo === 'getMe') return json(res, { ok: true, result: { username: 'demo_portal_bot', first_name: 'Demo' } });
  if (metodo === 'getUpdates') {
    return json(res, { ok: true, result: [
      { update_id: 1, message: { chat: { id: 42, type: 'private' }, from: { id: 42, first_name: 'Owner' } } },
      { update_id: 2, message: { chat: { id: -100, type: 'supergroup', title: 'Family' }, from: { id: 42, first_name: 'Owner' }, is_topic_message: true, message_thread_id: 7, reply_to_message: { forum_topic_created: { name: 'Guest WiFi' } } } },
    ] });
  }
  if (metodo === 'sendMessage') { inviati.push(b); return json(res, { ok: true, result: { message_id: 1 } }); }
  json(res, { ok: false, error_code: 404, description: 'Not Found' });
});

module.exports = { omada, telegram, operatori, inviati, TOKEN, TOKEN_WEBHOOK };
