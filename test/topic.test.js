'use strict';
// Gruppo con topic: prima del topic si scrive in privato, poi il topic viene riconosciuto dal nome.
const test = require('node:test');
const assert = require('node:assert');

process.env.TG_TOKEN = 'finto';
process.env.TG_CHAT = '-1001';
process.env.TG_ADMIN = '42';
process.env.TG_TOPIC = 'Guest WiFi';
delete process.env.TG_THREAD;

const chiamate = [];
global.fetch = async (url, opz) => {
  chiamate.push([url.split('/').pop(), JSON.parse(opz.body)]);
  return { json: async () => ({ ok: true, result: { message_id: 9, chat: { id: -1001 } } }) };
};
const tg = require('../src/telegram');
const stato = { dati: {}, salvato: 0, salva() { this.salvato++; } };
const log = () => {};
const nelTopic = (id, nome) => ({ chat: { id: -1001 }, is_topic_message: true, message_thread_id: id, reply_to_message: { forum_topic_created: { name: nome } } });

test('topic non ancora noto: notifiche in privato al proprietario', async () => {
  await tg.invia('ciao');
  assert.deepEqual(chiamate.pop()[1].chat_id, '42');
  assert.equal(tg.autorizzato({ from: { id: 42 } }), true);
  assert.equal(tg.autorizzato({ from: { id: 7 }, message: { chat: { id: 99 } } }), false);
});

test('messaggio in un altro topic o in un altro gruppo: ignorato', async () => {
  await tg.scopriTopic(nelTopic(2, 'Altro topic'), stato, log);
  await tg.scopriTopic({ ...nelTopic(5, 'Guest WiFi'), chat: { id: -2002 } }, stato, log);
  assert.equal(stato.dati.tgThread, undefined);
  assert.equal(tg.topic().inAttesa, 'Guest WiFi');
});

test('messaggio nel topic giusto: adottato, conferma e notifiche lì', async () => {
  await tg.scopriTopic(nelTopic(5, '🛜 Guest-WiFi'), stato, log);
  assert.equal(stato.dati.tgThread, 5);
  const conferma = chiamate.pop()[1];
  assert.equal(conferma.message_thread_id, 5);
  await tg.invia('richiesta');
  assert.deepEqual([chiamate.at(-1)[1].chat_id, chiamate.at(-1)[1].message_thread_id], ['-1001', 5]);
  assert.deepEqual(tg.topic(), { chat: '-1001', thread: 5 });
});

test('bottoni: dal topic sì, da altri topic no, proprietario sempre', () => {
  assert.equal(tg.autorizzato({ from: { id: 7 }, message: { chat: { id: -1001 }, message_thread_id: 5 } }), true);
  assert.equal(tg.autorizzato({ from: { id: 7 }, message: { chat: { id: -1001 }, message_thread_id: 2 } }), false);
  assert.equal(tg.autorizzato({ from: { id: 42 }, message: { chat: { id: 42 } } }), true);
});

test('modifica nella chat dove sta il messaggio', async () => {
  await tg.modifica(3, 'x', null, 42);
  assert.equal(chiamate.at(-1)[1].chat_id, 42);
  await tg.modifica(3, 'x');
  assert.equal(chiamate.at(-1)[1].chat_id, '-1001');
});
