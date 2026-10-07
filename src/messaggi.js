'use strict';
// Testo e bottoni del messaggio Telegram di una richiesta. Funzioni pure (configurazione letta a ogni
// chiamata), usate dal server e dalla demo statica nel browser.
const { tg: testiTg, orario } = require('./lingue');

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const bande = { 0: '2.4 GHz', 1: '5 GHz', 2: '5 GHz (2)', 3: '6 GHz' };
const durate = () => (process.env.DURATE || '4,24').split(',').map(Number).filter(n => n > 0);

// Lingua dei messaggi: TG_LANG (en predefinito, it).
const oraTg = ms => orario(ms, testiTg().locale);

function testoRichiesta(r, esito = '') {
  const e = esc, T = testiTg();
  const disp = [r.info?.name, r.info?.vendor, r.info?.osName].filter(Boolean).map(e).join(' · ') || T.sconosciuto;
  return [
    `📶 <b>${e(T.titolo(process.env.SSID || ''))}</b>`,
    `👤 ${T.nome}: ${r.nome ? '<b>' + e(r.nome) + '</b>' : '<i>' + T.nonIndicato + '</i>'}`,
    `📱 ${T.dispositivo}: ${disp}`,
    `🔖 MAC <code>${r.mac}</code>${r.ip ? ' · IP ' + r.ip : ''}`,
    `📡 AP: ${e(r.info?.apName || r.apMac)} · ${bande[r.radioId] || ''}`,
    r.verificato ? '' : `⚠️ <i>${T.nonVerificato}</i>`,
    `🕒 ${T.scade(oraTg(r.creata), oraTg(r.scadeAttesa))}`,
    esito,
  ].filter(Boolean).join('\n');
}

const bottoniRichiesta = r => [
  durate().map(h => ({ text: `✅ ${testiTg().ore(h)}`, callback_data: `sg:ok:${r.id}:${h}` })),
  [{ text: `❌ ${testiTg().rifiuta}`, callback_data: `sg:no:${r.id}` }],
];

module.exports = { testoRichiesta, bottoniRichiesta, oraTg, esc };
