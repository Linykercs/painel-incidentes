import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAlerts } from './chat.js';

const NOW = new Date('2026-07-17T14:00:00Z'); // sexta 11:00 BRT

function doc(extra = {}) {
  return {
    id: 'x1',
    title: '[P&G LATAM] Teste',
    type: 'issue',
    severity: 'S2',
    status: 'em_andamento',
    deadline: new Date('2026-07-17T20:00:00Z'), // 17:00 BRT, 6h à frente
    clickupUrl: 'https://app.clickup.com/t/x1',
    ...extra,
  };
}

test('card novo dispara alerta de criação uma vez só', () => {
  const d = doc();
  const msgs = buildAlerts(d, undefined, NOW);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Novo reporte/);
  assert.equal(d.alerts.created, true);
  // Segunda rodada com cache: nada
  const d2 = doc();
  const msgs2 = buildAlerts(d2, { alerts: d.alerts }, NOW);
  assert.equal(msgs2.length, 0);
});

test('deadline a menos de 4h dispara alerta de proximidade', () => {
  const d = doc({ deadline: new Date('2026-07-17T16:00:00Z') }); // 2h à frente
  const msgs = buildAlerts(d, { alerts: { created: true } }, NOW);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Deadline chegando/);
  assert.equal(d.alerts.soon, true);
});

test('deadline vencido dispara alerta de estouro uma vez', () => {
  const d = doc({ deadline: new Date('2026-07-17T12:00:00Z') }); // 2h atrás
  const msgs = buildAlerts(d, { alerts: { created: true } }, NOW);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /SLA estourado/);
  const d2 = doc({ deadline: new Date('2026-07-17T12:00:00Z') });
  const msgs2 = buildAlerts(d2, { alerts: d.alerts }, NOW);
  assert.equal(msgs2.length, 0);
});

test('card concluído não gera alerta de deadline', () => {
  const d = doc({ status: 'concluido', deadline: new Date('2026-07-17T12:00:00Z') });
  const msgs = buildAlerts(d, { alerts: { created: true } }, NOW);
  assert.equal(msgs.length, 0);
});
