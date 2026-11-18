import test from 'node:test';
import assert from 'node:assert/strict';
import { transformDevelopmentTask } from './transformDevelopment.js';
import { CLIENTS, listIdsToFetch } from './clients.js';

const PG = CLIENTS.pg;
const OUT_2026 = Date.UTC(2026, 9, 6, 15).toString(); // 06/10/2026
const AGO_2026 = Date.UTC(2026, 7, 20, 15).toString(); // 20/08/2026
const JUN_2026 = Date.UTC(2026, 5, 20, 15).toString(); // 20/06/2026

function task(over = {}) {
  return {
    id: 'ps1',
    custom_id: 'B2DEV-11104',
    name: '[P&G LATAM] - Carregar o WhatsApp dos masters',
    url: 'https://app.clickup.com/t/ps1',
    date_created: Date.UTC(2026, 9, 7, 18).toString(),
    due_date: null,
    date_done: null,
    date_closed: null,
    status: { status: 'aberto ps', type: 'open' },
    assignees: [{ username: 'Pedro Alves' }],
    custom_fields: [],
    ...over,
  };
}

test('card aberto da P&G vira desenvolvimento em andamento', () => {
  const d = transformDevelopmentTask(task(), PG);
  assert.equal(d.status, 'em_andamento');
  assert.equal(d.statusDetail, 'aberto ps');
  assert.equal(d.customId, 'B2DEV-11104');
  assert.deepEqual(d.assignees, ['Pedro Alves']);
  assert.equal(d.deliveredAt, null);
});

test('título antigo com [LATAM] também entra', () => {
  assert.ok(transformDevelopmentTask(task({ name: '[LATAM] disparo de mensagem' }), PG));
});

test('títulos [P&G] e [P&G Colombia] entram sem depender do campo Interno', () => {
  assert.ok(transformDevelopmentTask(task({ name: '[P&G] Multiplos usuarios comprando via chatbot' }), PG));
  assert.ok(transformDevelopmentTask(task({ name: '[P&G Colômbia] Geolocalização das imagens' }), PG));
  assert.ok(transformDevelopmentTask(task({ name: '[P&G Colombia] Ajustes nos descontos' }), PG));
});

test('[P&G+] de outra frente comercial não entra', () => {
  assert.equal(transformDevelopmentTask(task({ name: '[OUTRA] Campanha [P&G+] de outubro' }), PG), null);
});

test('card de outro cliente fica de fora', () => {
  assert.equal(transformDevelopmentTask(task({ name: '[MINERVA BR] - Integrar os packs' }), PG), null);
});

test('campo Interno = P&G Latam entra mesmo sem o título', () => {
  const t = task({
    name: 'Anexar arquivos no Sentry',
    custom_fields: [{
      name: 'Interno',
      type: 'labels',
      type_config: { options: [{ id: 'pg', label: 'P&G Latam' }] },
      value: ['pg'],
    }],
  });
  assert.ok(transformDevelopmentTask(t, PG));
});

test('cancelado fica de fora', () => {
  const t = task({ status: { status: 'despriorizado/cancelado', type: 'done' }, date_done: OUT_2026 });
  assert.equal(transformDevelopmentTask(t, PG), null);
});

test('entregue em outubro/2026 entra como entregue', () => {
  const t = task({ status: { status: 'entregue', type: 'closed' }, date_done: OUT_2026 });
  const d = transformDevelopmentTask(t, PG);
  assert.equal(d.status, 'entregue');
  assert.equal(d.deliveredAt.toISOString().slice(0, 10), '2026-10-06');
});

test('entregue em agosto/2026 entra (histórico desde julho)', () => {
  const t = task({ status: { status: 'entregue', type: 'closed' }, date_done: AGO_2026 });
  assert.equal(transformDevelopmentTask(t, PG).status, 'entregue');
});

test('entregue antes de julho/2026 fica de fora', () => {
  const t = task({ status: { status: 'entregue', type: 'closed' }, date_done: JUN_2026 });
  assert.equal(transformDevelopmentTask(t, PG), null);
});

test('entregue sem data de entrega fica de fora', () => {
  const t = task({ status: { status: 'entregue', type: 'closed' } });
  assert.equal(transformDevelopmentTask(t, PG), null);
});

test('cliente sem board de PS não gera desenvolvimento', () => {
  assert.equal(transformDevelopmentTask(task(), CLIENTS.minerva), null);
});

test('a lista de PS entra no download só uma vez', () => {
  const ids = listIdsToFetch([PG, CLIENTS.minerva]);
  assert.equal(ids.filter((id) => id === 'ID_BOARD_PS').length, 1);
});

const controle = (orderindex) => ({
  id: 'b8b5518c', name: 'Controle SAC', type: 'drop_down',
  type_config: { options: [{ id: 'i', name: 'Interno', orderindex: 0 }, { id: 'e', name: 'Externo', orderindex: 1 }] },
  value: orderindex,
});

test('Controle SAC Externo vira control externo', () => {
  assert.equal(transformDevelopmentTask(task({ custom_fields: [controle(1)] }), PG).control, 'externo');
});

test('Controle SAC Interno vira control interno', () => {
  assert.equal(transformDevelopmentTask(task({ custom_fields: [controle(0)] }), PG).control, 'interno');
});

test('sem Controle SAC o control fica null', () => {
  assert.equal(transformDevelopmentTask(task(), PG).control, null);
});
