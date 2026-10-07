'use strict';
// Bot dedicato in long polling: nessun webhook, nessun altro deve leggere gli aggiornamenti di questo bot.
const TOKEN = process.env.TG_TOKEN;
const CHAT = String(process.env.TG_CHAT || '');    // chat privata o gruppo dove arrivano le richieste
const ADMIN = String(process.env.TG_ADMIN || process.env.TG_CHAT || '');  // proprietario: sempre autorizzato ai bottoni
// Gruppo con topic: TG_THREAD è l'id del topic; se manca, il bot lo riconosce dal nome (TG_TOPIC)
// al primo messaggio scritto lì, e fino ad allora scrive in privato al proprietario.
const TOPIC = (process.env.TG_TOPIC || '').trim();
let thread = Number(process.env.TG_THREAD) || 0;

async function api(metodo, params) {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(70000),
  });
  const j = await r.json();
  if (!j.ok) { const e = new Error(`${metodo}: ${j.description}`); e.codice = j.error_code; throw e; }
  return j.result;
}

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const normNome = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const destinazione = () => (thread ? { chat_id: CHAT, message_thread_id: thread } : { chat_id: TOPIC ? ADMIN : CHAT });

const invia = (testo, bottoni) => api('sendMessage', {
  ...destinazione(), text: testo, parse_mode: 'HTML', disable_web_page_preview: true,
  ...(bottoni ? { reply_markup: { inline_keyboard: bottoni } } : {}),
});

// `chat` è quella in cui il messaggio è stato mandato (i messaggi vecchi possono stare in privato).
const modifica = (msgId, testo, bottoni, chat = CHAT) => api('editMessageText', {
  chat_id: chat, message_id: msgId, text: testo, parse_mode: 'HTML', disable_web_page_preview: true,
  reply_markup: { inline_keyboard: bottoni || [] },
}).catch(e => { if (!/not modified/.test(e.message)) throw e; });

const rispondi = (id, testo) => api('answerCallbackQuery', { callback_query_id: id, text: testo }).catch(() => {});

// Bottone premuto dal proprietario, oppure su un messaggio della chat (e del topic) configurati.
function autorizzato(cb) {
  if (String(cb.from?.id) === ADMIN) return true;
  const m = cb.message;
  return Boolean(m) && String(m.chat?.id) === CHAT && (!thread || m.message_thread_id === thread);
}

// Messaggio nel gruppo: se è nel topic cercato, da qui in poi le notifiche vanno lì.
async function scopriTopic(m, stato, log) {
  if (thread || !TOPIC || String(m.chat?.id) !== CHAT || !m.is_topic_message || !m.message_thread_id) return;
  const nome = m.forum_topic_created?.name || m.forum_topic_edited?.name || m.reply_to_message?.forum_topic_created?.name;
  log('messaggio nel topic', m.message_thread_id, nome || '(nome non incluso)');
  if (normNome(nome) !== normNome(TOPIC)) return;
  thread = m.message_thread_id;
  stato.dati.tgThread = thread;
  stato.salva();
  log('topic telegram trovato', nome, thread);
  await invia(`✅ <b>${esc(process.env.SSID || 'Wi-Fi ospiti')}</b> · da ora le richieste di accesso alla Wi-Fi ospiti arrivano in questo topic.`)
    .catch(e => log('telegram', e.message));
}

// Ciclo di lettura. `gestisci(callback)` riceve solo le pressioni autorizzate.
async function ascolta(stato, gestisci, log = console.log) {
  if (!thread && stato.dati.tgThread) thread = stato.dati.tgThread;
  for (;;) {
    try {
      // I messaggi servono solo finché il topic non è noto.
      const tipi = thread || !TOPIC ? ['callback_query'] : ['callback_query', 'message'];
      const agg = await api('getUpdates', { offset: stato.dati.offset, timeout: 50, allowed_updates: tipi });
      for (const u of agg) {
        stato.dati.offset = u.update_id + 1;
        if (u.message) { await scopriTopic(u.message, stato, log); continue; }
        const cb = u.callback_query;
        if (!cb) continue;
        if (!autorizzato(cb)) { log('bottone da utente non autorizzato', cb.from?.id); await rispondi(cb.id, 'Non autorizzato'); continue; }
        log('bottone', cb.data);
        try { await gestisci(cb); } catch (e) { log('errore bottone', e.message); await rispondi(cb.id, 'Errore: ' + e.message.slice(0, 150)); }
      }
      if (agg.length) stato.salva();
    } catch (e) {
      // 409 = un altro processo legge lo stesso bot: si aspetta e si riprova, senza far cadere il servizio.
      log('telegram', e.message);
      await new Promise(r => setTimeout(r, e.codice === 409 ? 30000 : 5000));
    }
  }
}

const topic = () => (thread ? { chat: CHAT, thread } : TOPIC ? { chat: CHAT, inAttesa: TOPIC } : null);

module.exports = { invia, modifica, rispondi, ascolta, autorizzato, scopriTopic, topic, esc, ADMIN, attivo: Boolean(TOKEN && CHAT) };
