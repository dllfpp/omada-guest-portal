'use strict';
// Genera design-variants/v1..v5 (stesse pagine reali, fogli di stile diversi) e la galleria di confronto.
// Uso: node design/varianti.js   → poi servire design-variants/ con un server statico.
const fs = require('fs');
const path = require('path');
const { pagina } = require('../src/pagine');

const SYS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, "Liberation Mono", monospace';

const VARIANTI = [
  {
    slug: 'v1-swiss', nome: 'Swiss', stile: 'Minimalism & Swiss Style', palette: 'Professional blue + service green',
    token: {
      font: SYS, 'font-titoli': SYS, 'peso-titoli': 700, 'spaziatura-titoli': '-0.01em',
      bg: '#FFFFFF', fg: '#0F172A', muted: '#475569', card: '#FFFFFF', 'card-fg': '#0F172A', 'card-muted': '#475569',
      primary: '#1E40AF', 'on-primary': '#FFFFFF', 'primary-tenue': '#EFF6FF', input: '#FFFFFF',
      ok: '#15803D', 'ok-tenue': '#F0FDF4', no: '#DC2626', 'no-tenue': '#FEF2F2', attesa: '#1E40AF', 'attesa-tenue': '#DBEAFE', avviso: '#B45309', 'avviso-tenue': '#FFFBEB',
      raggio: '0px', 'raggio-piccolo': '0px', bordo: '0', 'bordo-input': '1px solid #0F172A', 'bordo-bottone': '0',
      ombra: 'none', 'ombra-bottone': 'none', divisore: '1px solid #0F172A', anello: '#1E40AF', durata: '200ms',
    },
    extra: `.scheda { padding: 32px 0; border-top: 4px solid var(--fg); border-bottom: 1px solid var(--fg); }
.stato { background: none; width: auto; height: auto; justify-content: start; margin-bottom: 24px; }
.stato .icona { width: 40px; height: 40px; }
h1 { font-size: 2rem; line-height: 1.1; }
.testata { padding-bottom: 8px; }`,
  },
  {
    slug: 'v2-terminale', nome: 'Terminale', stile: 'Cyberpunk UI', palette: 'Cybersecurity Platform',
    token: {
      font: MONO, 'font-titoli': MONO, 'peso-titoli': 700, 'spaziatura-titoli': '0.02em',
      bg: '#000000', fg: '#E0E0E0', muted: '#94A3B8', card: '#0C130E', 'card-fg': '#E0E0E0', 'card-muted': '#A3B3A6',
      primary: '#00FF41', 'on-primary': '#0F172A', 'primary-tenue': '#0F2A16', input: '#000000',
      ok: '#00FF41', 'ok-tenue': '#0F2A16', no: '#FF3333', 'no-tenue': '#2A0E0E', attesa: '#22D3EE', 'attesa-tenue': '#0B2530', avviso: '#FACC15', 'avviso-tenue': '#2A240A',
      raggio: '2px', 'raggio-piccolo': '2px', bordo: '1px solid #1F5F2E', 'bordo-input': '1px solid #1F5F2E', 'bordo-bottone': '0',
      ombra: '0 0 0 1px #00FF4114, 0 0 32px #00FF4110', 'ombra-bottone': '0 0 16px #00FF4140', divisore: '1px dashed #1F5F2E', anello: '#22D3EE', durata: '150ms',
    },
    extra: `body { background-image: repeating-linear-gradient(0deg, #ffffff05 0 1px, transparent 1px 3px); }
.rete::before { content: "> "; color: var(--primary); }
h1 { text-transform: uppercase; font-size: 1.25rem; color: var(--tono); text-shadow: 0 0 10px color-mix(in srgb, var(--tono) 40%, transparent); }
h1::after { content: "_"; animation: lampeggia 1s steps(1) infinite; }
@keyframes lampeggia { 50% { opacity: 0; } }
.bottone { text-transform: uppercase; }
.bottone::before { content: "[ "; } .bottone::after { content: " ]"; }
@media (prefers-reduced-motion: reduce) { h1::after { animation: none; } }`,
  },
  {
    slug: 'v3-aurora', nome: 'Aurora', stile: 'Aurora UI + vetro', palette: 'Smart Home / IoT',
    token: {
      font: SYS, 'font-titoli': SYS, 'peso-titoli': 650, 'spaziatura-titoli': '-0.01em',
      bg: '#0F172A', fg: '#F8FAFC', muted: '#CBD5E1', card: 'rgba(27,35,54,.72)', 'card-fg': '#F8FAFC', 'card-muted': '#CBD5E1',
      primary: '#22C55E', 'on-primary': '#0F172A', 'primary-tenue': 'rgba(34,197,94,.16)', input: 'rgba(15,23,42,.6)',
      ok: '#4ADE80', 'ok-tenue': 'rgba(74,222,128,.16)', no: '#F87171', 'no-tenue': 'rgba(248,113,113,.16)', attesa: '#60A5FA', 'attesa-tenue': 'rgba(96,165,250,.18)', avviso: '#FBBF24', 'avviso-tenue': 'rgba(251,191,36,.16)',
      raggio: '24px', 'raggio-piccolo': '14px', bordo: '1px solid rgba(255,255,255,.14)', 'bordo-input': '1px solid rgba(255,255,255,.22)', 'bordo-bottone': '0',
      ombra: '0 24px 60px rgba(0,0,0,.45)', 'ombra-bottone': '0 8px 24px rgba(34,197,94,.35)', divisore: '1px solid rgba(255,255,255,.12)', anello: '#93C5FD', durata: '220ms',
    },
    extra: `body { background:
  radial-gradient(60% 45% at 15% 10%, rgba(34,197,94,.35), transparent 70%),
  radial-gradient(55% 40% at 90% 20%, rgba(59,130,246,.38), transparent 70%),
  radial-gradient(70% 50% at 50% 100%, rgba(168,85,247,.28), transparent 70%), var(--bg);
  background-attachment: fixed; }
.scheda { backdrop-filter: blur(18px) saturate(140%); -webkit-backdrop-filter: blur(18px) saturate(140%); }
.marchio { border-radius: 12px; background: linear-gradient(135deg, #22C55E, #3B82F6); color: #fff; }
.bottone { border-radius: 999px; }`,
  },
  {
    slug: 'v4-clay', nome: 'Clay', stile: 'Claymorphism', palette: 'Hotel / Hospitality',
    token: {
      font: SYS, 'font-titoli': SYS, 'peso-titoli': 800, 'spaziatura-titoli': '-0.015em',
      bg: '#EEF2F8', fg: '#1E3A8A', muted: '#475569', card: '#F8FAFC', 'card-fg': '#1E3A8A', 'card-muted': '#475569',
      primary: '#1E3A8A', 'on-primary': '#FFFFFF', 'primary-tenue': '#DCE6F7', input: '#FFFFFF',
      ok: '#166534', 'ok-tenue': '#DCFCE7', no: '#B91C1C', 'no-tenue': '#FEE2E2', attesa: '#A16207', 'attesa-tenue': '#FEF3C7', avviso: '#A16207', 'avviso-tenue': '#FEF3C7',
      raggio: '32px', 'raggio-piccolo': '18px', bordo: '0', 'bordo-input': '0', 'bordo-bottone': '0',
      ombra: '12px 12px 28px #C9D3E3, -10px -10px 24px #FFFFFF, inset 2px 2px 4px #FFFFFF',
      'ombra-bottone': '6px 8px 16px rgba(30,58,138,.35), inset -3px -4px 8px rgba(0,0,0,.25), inset 3px 3px 6px rgba(255,255,255,.25)',
      divisore: '2px dotted #C9D3E3', anello: '#A16207', durata: '200ms',
    },
    extra: `.testo { box-shadow: inset 4px 4px 10px #D5DEEC, inset -4px -4px 10px #FFFFFF; }
.stato { border-radius: 18px; box-shadow: 4px 4px 10px #D5DEEC, -4px -4px 10px #FFFFFF; }
.marchio { border-radius: 14px; box-shadow: 4px 6px 12px rgba(30,58,138,.3); }
.bottone:active { box-shadow: inset 4px 4px 10px rgba(0,0,0,.35); }`,
  },
  {
    slug: 'v5-brutal', nome: 'Brutal', stile: 'Brutalism', palette: 'Creative Agency',
    token: {
      font: SYS, 'font-titoli': SYS, 'peso-titoli': 900, 'spaziatura-titoli': '-0.02em',
      bg: '#FDF2F8', fg: '#000000', muted: '#3F3F46', card: '#FFFFFF', 'card-fg': '#000000', 'card-muted': '#27272A',
      primary: '#EC4899', 'on-primary': '#000000', 'primary-tenue': '#FBCFE8', input: '#FFFFFF',
      ok: '#000000', 'ok-tenue': '#86EFAC', no: '#000000', 'no-tenue': '#FCA5A5', attesa: '#000000', 'attesa-tenue': '#67E8F9', avviso: '#000000', 'avviso-tenue': '#FDE047',
      raggio: '0px', 'raggio-piccolo': '0px', bordo: '3px solid #000', 'bordo-input': '3px solid #000', 'bordo-bottone': '3px solid #000',
      ombra: '8px 8px 0 #000', 'ombra-bottone': '5px 5px 0 #000', divisore: '3px solid #000', anello: '#0891B2', durata: '0s',
    },
    extra: `.stato { border: 3px solid #000; }
.marchio { border: 3px solid #000; }
h1 { font-size: 2rem; line-height: 1; text-transform: uppercase; }
.bottone { text-transform: uppercase; }
.bottone:hover { filter: none; background: #F472B6; }
.bottone:active { transform: translate(5px, 5px); box-shadow: none; }
.avanzamento { border: 3px solid #000; height: 16px; border-radius: 0; }
.barra { border-radius: 0; }`,
  },
];

const BASE = fs.readFileSync(path.join(__dirname, 'base.css'), 'utf8');
const foglio = v => `/* Portale Wi-Fi ospiti · ${v.nome} — ${v.stile}, palette ${v.palette} */\n:root {\n${
  Object.entries(v.token).map(([k, x]) => `  --${k}: ${x};`).join('\n')}\n}\n\n${BASE}\n/* ---- Effetti dello stile ---- */\n${v.extra}\n`;

// Stati di esempio con orari fissi, così le varianti sono confrontabili.
const T0 = Date.parse('2026-10-06T14:32:00+02:00');
const r = { id: 'esempio', scadeAttesa: T0 + 10 * 60000, ore: 4, scade: T0 + 4 * 3600000, redirectUrl: 'http://example.com/' };
const STATI = {
  'index.html': { stato: 'richiesta', parametri: {} },
  'attesa.html': { stato: 'attesa', r },
  'ok.html': { stato: 'ok', r },
  'no.html': { stato: 'no', r, pausaMin: 15 },
  'scaduta.html': { stato: 'scaduta', r, attesaMin: 10 },
};

function genera(dest) {
  for (const v of VARIANTI) {
    const dir = path.join(dest, v.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'stile.css'), foglio(v));
    for (const [file, s] of Object.entries(STATI)) {
      // L'attesa senza refresh nella galleria, altrimenti gli iframe ricaricano di continuo.
      fs.writeFileSync(path.join(dir, file), pagina(s, { css: 'stile.css' }).replace(/<meta http-equiv="refresh"[^>]*>\n?/, ''));
    }
  }
  fs.writeFileSync(path.join(dest, 'index.html'), galleria());
}

function galleria() {
  const schede = VARIANTI.map((v, i) => `<article class="v">
  <h2>${i + 1}. ${v.nome}</h2>
  <p>${v.stile} · palette ${v.palette}</p>
  <div class="telefoni">
    <iframe src="${v.slug}/index.html" title="${v.nome}: richiesta" loading="lazy"></iframe>
    <iframe src="${v.slug}/attesa.html" title="${v.nome}: attesa" loading="lazy"></iframe>
  </div>
  <p class="link">Apri: <a href="${v.slug}/index.html">richiesta</a> · <a href="${v.slug}/attesa.html">attesa</a> · <a href="${v.slug}/ok.html">connesso</a> · <a href="${v.slug}/no.html">rifiutata</a> · <a href="${v.slug}/scaduta.html">scaduta</a></p>
</article>`).join('\n');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portale Wi-Fi ospiti · varianti</title>
<style>
:root { --bg: #F4F4F5; --fg: #18181B; --muted: #52525B; --card: #FFFFFF; --bordo: #D4D4D8; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { margin: 0 0 4px; font-size: 1.5rem; } .intro { margin: 0 0 24px; color: var(--muted); }
.griglia { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
@media (max-width: 900px) { .griglia { grid-template-columns: 1fr; } }
.v { background: var(--card); border: 1px solid var(--bordo); border-radius: 12px; padding: 16px; }
.v h2 { margin: 0; font-size: 1.125rem; } .v p { margin: 2px 0 12px; color: var(--muted); font-size: .875rem; }
.telefoni { display: flex; gap: 12px; overflow-x: auto; }
iframe { flex: none; width: 300px; height: 600px; border: 1px solid var(--bordo); border-radius: 18px; background: #fff; }
.link a { color: inherit; }
footer { margin-top: 32px; text-align: center; font-size: .875rem; } footer a { color: var(--muted); }
</style></head><body><main>
<h1>Portale Wi-Fi ospiti · 5 varianti</h1>
<p class="intro">Stesse pagine, stile diverso. Per ognuna: richiesta di accesso e attesa di approvazione; gli altri stati dai link.</p>
<div class="griglia">
${schede}
</div>
<footer><a href="https://buymeacoffee.com/dllfpp">Made with love ❤️ - DLLFPP</a></footer>
</main></body></html>`;
}

if (require.main === module) genera(path.join(__dirname, '..', 'design-variants'));
module.exports = { VARIANTI, foglio };
