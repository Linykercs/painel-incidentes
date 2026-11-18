import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveInMonth, devMonths, monthKey, matchesControl, ALL_MONTHS } from './devMonth.js';

const TZ = 'America/Sao_Paulo';
const dev = (o) => ({ status: 'em_andamento', createdAt: '2026-08-10T15:00:00Z', ...o });

test('mês no fuso de São Paulo, não em UTC', () => {
  assert.equal(monthKey('2026-09-01T02:00:00Z', TZ), '2026-08');
});

test('"todos os meses" mostra tudo', () => {
  assert.ok(isActiveInMonth(dev({ createdAt: '2026-12-01T15:00:00Z' }), ALL_MONTHS, TZ));
});

test('em andamento aparece do mês de abertura em diante', () => {
  assert.equal(isActiveInMonth(dev(), '2026-07', TZ), false);
  assert.ok(isActiveInMonth(dev(), '2026-08', TZ));
  assert.ok(isActiveInMonth(dev(), '2026-10', TZ));
});

test('entregue aparece até o mês da entrega e some depois', () => {
  const d = dev({ status: 'entregue', deliveredAt: '2026-09-14T15:00:00Z' });
  assert.ok(isActiveInMonth(d, '2026-08', TZ));
  assert.ok(isActiveInMonth(d, '2026-09', TZ));
  assert.equal(isActiveInMonth(d, '2026-10', TZ), false);
});

test('card sem data de criação não some do filtro', () => {
  assert.ok(isActiveInMonth(dev({ createdAt: null }), '2026-07', TZ));
});

test('meses do seletor vão do início do painel até o mês atual', () => {
  const devs = [dev({ createdAt: '2025-11-03T15:00:00Z' }), dev({ status: 'entregue', deliveredAt: '2026-09-14T15:00:00Z' })];
  assert.deepEqual(devMonths(devs, TZ, new Date('2026-10-13T15:00:00Z')), ['2026-10', '2026-09', '2026-08', '2026-07']);
});

test('sem desenvolvimentos o seletor tem só o mês atual', () => {
  assert.deepEqual(devMonths([], TZ, new Date('2026-10-13T15:00:00Z')), ['2026-10']);
});

test('filtro externo/interno', () => {
  const ext = { control: 'externo' }, int = { control: 'interno' }, none = { control: null };
  assert.ok([ext, int, none].every((x) => matchesControl(x, 'all')));
  assert.deepEqual([ext, int, none].filter((x) => matchesControl(x, 'externo')), [ext]);
  assert.deepEqual([ext, int, none].filter((x) => matchesControl(x, 'interno')), [int]);
  assert.deepEqual([ext, int, none].filter((x) => matchesControl(x, 'none')), [none]);
});
