'use strict';
// Chiamate del wizard verso il controller Omada e Telegram, con i valori ancora da salvare.
// Ogni errore ha un `codice` che il wizard traduce in un messaggio per l'utente.
const crypto = require('crypto');
const { richiestaA } = require('./omada');

const errore = (codice, dettaglio = '') => Object.assign(new Error(`${codice}: ${dettaglio}`), { codice, dettaglio });

// "192.168.0.10:8043" → "https://192.168.0.10:8043" (senza percorso né barra finale).
function normUrl(testo) {
  let t = String(testo || '').trim();
  if (!t) return '';
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  try { const u = new URL(t); return `${u.protocol}//${u.host}`; } catch { return ''; }
}

// ---- Controller ----
async function infoControllore(url) {
  let r;
  try { r = await richiestaA(url, 'GET', '/api/info'); } catch (e) { throw errore('irraggiungibile', e.code || e.message); }
  const id = r.json?.result?.omadacId;
  if (!id) throw errore('nonOmada', `HTTP ${r.status}`);
  return { id, versione: r.json.result.controllerVer || '' };
}

async function tokenOpenApi(url, id, clientId, clientSecret) {
  const r = await richiestaA(url, 'POST', '/openapi/authorize/token?grant_type=client_credentials', {
    body: { omadacId: id, client_id: clientId, client_secret: clientSecret },
  }).catch(e => { throw errore('irraggiungibile', e.code || e.message); });
  if (r.json?.errorCode !== 0 || !r.json?.result?.accessToken) throw errore('credenziali', r.json?.msg || `HTTP ${r.status}`);
  return r.json.result.accessToken;
}

async function openApi(url, id, tok, method, path, body) {
  const r = await richiestaA(url, method, `/openapi/v1/${id}${path}`, { headers: { Authorization: 'AccessToken=' + tok }, body })
    .catch(e => { throw errore('irraggiungibile', e.code || e.message); });
  if (r.json?.errorCode !== 0) throw errore('openapi', r.json?.msg || `HTTP ${r.status}`);
  return r.json.result;
}

async function siti(url, id, tok) {
  const res = await openApi(url, id, tok, 'GET', '/sites?page=1&pageSize=100');
  return (res?.data || []).map(s => ({ id: s.siteId, nome: s.name }));
}

// SSID di tutte le WLAN del sito, con Guest Network e sicurezza (0 = aperta).
async function ssidDelSito(url, id, tok, sito) {
  const wlan = await openApi(url, id, tok, 'GET', `/sites/${sito}/wireless-network/wlans`);
  const out = [];
  for (const w of Array.isArray(wlan) ? wlan : wlan?.data || []) {
    const res = await openApi(url, id, tok, 'GET', `/sites/${sito}/wireless-network/wlans/${w.wlanId}/ssids?page=1&pageSize=100`);
    for (const s of res?.data || []) out.push({ nome: s.name, ospiti: Boolean(s.guestNetEnable), aperta: s.security === 0 });
  }
  return out;
}

// Password che rispetta la policy degli operatori (serve anche un carattere speciale).
function passwordOperatore() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const corpo = Array.from(crypto.randomBytes(20), b => alfabeto[b % alfabeto.length]).join('');
  return `Gp7${corpo}!x`;
}

// Crea l'operatore hotspot; se il nome esiste già aggiunge un numero.
async function creaOperatore(url, id, tok, sito, base = 'guest-portal') {
  const esistenti = new Set(((await openApi(url, id, tok, 'GET', `/sites/${sito}/hotspot/operators?page=1&pageSize=1000`))?.data || []).map(o => o.name));
  let nome = base;
  for (let i = 2; esistenti.has(nome); i++) nome = `${base}-${i}`;
  const password = passwordOperatore();
  try {
    await openApi(url, id, tok, 'POST', `/sites/${sito}/hotspot/operators`, {
      name: nome, password, note: 'Omada guest approval portal', operatorRoleType: 0, selectedSites: [sito],
    });
  } catch (e) { throw errore('creazione', e.dettaglio || e.message); }
  return { nome, password };
}

async function provaOperatore(url, id, nome, password) {
  const r = await richiestaA(url, 'POST', `/${id}/api/v2/hotspot/login`, { body: { name: nome, password } })
    .catch(e => { throw errore('irraggiungibile', e.code || e.message); });
  if (r.json?.errorCode !== 0) throw errore('login', r.json?.msg || `HTTP ${r.status}`);
}

// ---- Telegram ----
const TG = () => process.env.TG_API_URL || 'https://api.telegram.org';

async function telegram(token, metodo, params = {}) {
  let j;
  try {
    const r = await fetch(`${TG()}/bot${token}/${metodo}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(15000),
    });
    j = await r.json();
  } catch (e) { throw errore('telegramIrraggiungibile', e.message); }
  if (!j.ok) throw errore(j.error_code === 409 ? 'conflitto' : 'telegram', j.description || String(j.error_code));
  return j.result;
}

async function bot(token) {
  if (!/^\d+:[\w-]{20,}$/.test(String(token || '').trim())) throw errore('formatoToken');
  const me = await telegram(token.trim(), 'getMe');
  // Un webhook attivo vuol dire che un altro programma (n8n, Home Assistant…) riceve già i messaggi del bot.
  const wh = await telegram(token.trim(), 'getWebhookInfo');
  if (wh?.url) { let host = wh.url; try { host = new URL(wh.url).host; } catch { /* url strano */ } throw errore('webhook', host); }
  return { username: me.username, nome: me.first_name };
}

// Chat e topic in cui qualcuno ha scritto di recente al bot. Non conferma gli aggiornamenti
// (nessun offset): restano disponibili per il portale.
async function chatRecenti(token) {
  const agg = await telegram(token, 'getUpdates', { timeout: 0, limit: 100, allowed_updates: ['message', 'my_chat_member'] });
  const trovate = new Map();
  for (const u of agg.reverse()) {
    const m = u.message || u.my_chat_member;
    if (!m?.chat) continue;
    const c = m.chat, privata = c.type === 'private';
    const thread = !privata && m.is_topic_message ? m.message_thread_id : 0;
    const chiave = `${c.id}:${thread}`;
    if (trovate.has(chiave)) continue;
    const nomePersona = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username || '';
    trovate.set(chiave, {
      tipo: privata ? 'privata' : thread ? 'topic' : 'gruppo',
      chat: String(c.id), thread: thread ? String(thread) : '',
      titolo: privata ? nomePersona : c.title || '',
      topic: thread ? m.reply_to_message?.forum_topic_created?.name || m.forum_topic_created?.name || '' : '',
      admin: m.from && !m.from.is_bot ? String(m.from.id) : '',
      persona: nomePersona,
    });
  }
  return [...trovate.values()];
}

const inviaProva = (token, chat, thread, testo) => telegram(token, 'sendMessage', {
  chat_id: chat, text: testo, parse_mode: 'HTML', ...(thread ? { message_thread_id: Number(thread) } : {}),
});

module.exports = { normUrl, infoControllore, tokenOpenApi, siti, ssidDelSito, creaOperatore, provaOperatore, passwordOperatore, bot, chatRecenti, inviaProva };
