'use strict';
// Controller Omada: Open API (lettura client) e API hotspot dell'operatore (autorizzazione, revoca).
const https = require('https');

const CFG = {
  url: process.env.OMADA_URL, // es. https://omada.lan:8043
  id: process.env.OMADA_ID,
  site: process.env.OMADA_SITE_ID,
  clientId: process.env.OMADA_CLIENT_ID,
  clientSecret: process.env.OMADA_CLIENT_SECRET,
  hotspotUser: process.env.HOTSPOT_USER,
  hotspotPass: process.env.HOTSPOT_PASS,
};

// Il controller ha un certificato autofirmato: si accetta solo per questo host.
function richiesta(method, path, { headers = {}, body, cookie } = {}) {
  const u = new URL(path, CFG.url);
  const dati = body === undefined ? null : JSON.stringify(body);
  const h = { Accept: 'application/json', ...headers };
  if (dati) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(dati); }
  if (cookie) h.Cookie = cookie;
  return new Promise((ok, ko) => {
    const r = https.request(u, { method, headers: h, rejectUnauthorized: false, timeout: 10000 }, res => {
      let s = '';
      res.on('data', c => (s += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(s); } catch { /* risposta non JSON */ }
        ok({ status: res.statusCode, headers: res.headers, json });
      });
    });
    r.on('timeout', () => r.destroy(new Error('timeout controller')));
    r.on('error', ko);
    if (dati) r.write(dati);
    r.end();
  });
}

// ---- Open API (client credentials, token 2 ore) ----
let openTok = null, openScade = 0;
async function tokenOpen() {
  if (openTok && Date.now() < openScade) return openTok;
  const r = await richiesta('POST', '/openapi/authorize/token?grant_type=client_credentials', {
    body: { omadacId: CFG.id, client_id: CFG.clientId, client_secret: CFG.clientSecret },
  });
  if (r.json?.errorCode !== 0) throw new Error('Open API: ' + (r.json?.msg || r.status));
  openTok = r.json.result.accessToken;
  openScade = Date.now() + Math.min(r.json.result.expiresIn || 7200, 7200) * 1000 - 10 * 60 * 1000;
  return openTok;
}

async function open(method, path, body) {
  const fai = async () => richiesta(method, `/openapi/v1/${CFG.id}/sites/${CFG.site}${path}`, {
    headers: { Authorization: 'AccessToken=' + (await tokenOpen()) }, body,
  });
  let r = await fai();
  if (r.status === 401 || [-44112, -44113].includes(r.json?.errorCode)) { openTok = null; r = await fai(); }
  return r.json;
}

async function cliente(mac) {
  const j = await open('GET', `/clients/${mac}`);
  return j?.errorCode === 0 ? j.result : null;
}

// ---- API hotspot del portale esterno (operatore hotspot) ----
let hs = null; // { token, cookie }
async function loginHotspot() {
  const r = await richiesta('POST', `/${CFG.id}/api/v2/hotspot/login`, {
    body: { name: CFG.hotspotUser, password: CFG.hotspotPass },
  });
  if (r.json?.errorCode !== 0) throw new Error('login hotspot: ' + (r.json?.msg || r.status));
  const cookie = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
  hs = { token: r.json.result.token, cookie };
  return hs;
}

// Chiamata all'API hotspot con la sessione dell'operatore; se è scaduta, nuovo login e secondo tentativo.
async function hotspot(method, path, body) {
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const s = hs || (await loginHotspot());
    const r = await richiesta(method, `/${CFG.id}/api/v2/hotspot${path}`, { headers: { 'Csrf-Token': s.token }, cookie: s.cookie, body });
    if (r.json?.errorCode === 0) return r.json.result;
    hs = null;
    if (tentativo === 1) throw new Error(r.json?.msg || String(r.status));
  }
}

// Autorizza il client per `ore` ore. `time` è la DURATA in millisecondi: Omada la somma all'ora attuale
// (provato il 2026-10-06: passando la scadenza assoluta l'accesso finiva nel 2083).
async function autorizza(c, ore) {
  const durata = ore * 3600 * 1000;
  try {
    await hotspot('POST', '/extPortal/auth', {
      clientMac: c.mac, clientIp: c.ip || '', apMac: c.apMac, ssidName: c.ssid,
      radioId: String(c.radioId), time: String(durata), authType: '4', originUrl: '',
    });
  } catch (e) { throw new Error('autorizzazione: ' + e.message); }
  return Date.now() + durata;
}

// Revoca come il bottone "Unauthorize" degli Authorized Clients: vale anche per un dispositivo già
// scollegato (l'Open API /hotspot/clients/{mac}/unauth risponde "client does not exist").
async function revoca(mac) {
  try {
    const voci = (await hotspot('GET', `/sites/${CFG.site}/clients?currentPage=1&currentPageSize=1000`))?.data || [];
    for (const v of voci.filter(v => v.valid && String(v.mac).toUpperCase() === mac)) {
      await hotspot('POST', `/sites/${CFG.site}/cmd/clients/${v.id}/disconnect`);
    }
  } catch (e) { throw new Error('revoca: ' + e.message); }
}

module.exports = { cliente, autorizza, revoca, CFG };
