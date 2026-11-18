import test from 'node:test';
import assert from 'node:assert/strict';
import { addBusinessHours, deadlineFor, normalizeStart, monthOf, businessHoursBetween } from './sla.js';

// Datas em UTC. Lembrete: BRT = UTC menos 3h.
const utc = (s) => new Date(s);

test('S2 (16h úteis): reporte qua 01/07 13:47 BRT termina sex 03/07 09:47 BRT', () => {
  const deadline = deadlineFor(utc('2026-07-01T16:47:00Z'), 'S2');
  assert.equal(deadline.toISOString(), '2026-07-03T12:47:00.000Z');
});

test('S4 (5 dias úteis): reporte qui 02/07 11:12 BRT termina qui 09/07 11:12 BRT', () => {
  const deadline = deadlineFor(utc('2026-07-02T14:12:00Z'), 'S4');
  assert.equal(deadline.toISOString(), '2026-07-09T14:12:00.000Z');
});

test('S1 (8h úteis): reporte qua 08/07 10:40 BRT vira qui 09/07 08:40 BRT', () => {
  const deadline = deadlineFor(utc('2026-07-08T13:40:00Z'), 'S1');
  assert.equal(deadline.toISOString(), '2026-07-09T11:40:00.000Z');
});

test('reporte fora da janela (qua 18:55 BRT) normaliza pra qui 08:00 BRT', () => {
  const start = normalizeStart(utc('2026-07-08T21:55:00Z'));
  assert.equal(start.toISOString(), '2026-07-09T11:00:00.000Z');
});

test('S3 (24h úteis) a partir de reporte fora da janela termina seg 13/07 12:00 BRT', () => {
  const deadline = deadlineFor(utc('2026-07-08T21:55:00Z'), 'S3');
  assert.equal(deadline.toISOString(), '2026-07-13T15:00:00.000Z');
});

test('reporte no sábado normaliza pra segunda 08:00 BRT', () => {
  const start = normalizeStart(utc('2026-07-04T13:00:00Z'));
  assert.equal(start.toISOString(), '2026-07-06T11:00:00.000Z');
});

test('reporte antes das 08h normaliza pras 08:00 do mesmo dia', () => {
  const start = normalizeStart(utc('2026-07-07T09:30:00Z')); // 06:30 BRT
  assert.equal(start.toISOString(), '2026-07-07T11:00:00.000Z');
});

test('addBusinessHours atravessa o fim de semana', () => {
  // Sexta 10/07 17:00 BRT + 2h úteis = segunda 13/07 09:00 BRT
  const end = addBusinessHours(utc('2026-07-10T20:00:00Z'), 2);
  assert.equal(end.toISOString(), '2026-07-13T12:00:00.000Z');
});

test('severidade desconhecida ou data ausente retornam null', () => {
  assert.equal(deadlineFor(utc('2026-07-01T16:47:00Z'), 'S9'), null);
  assert.equal(deadlineFor(null, 'S2'), null);
});

test('businessHoursBetween conta só horas da janela útil', () => {
  // Qui 09/07 12:35 BRT até sex 10/07 12:35 BRT = 5h25 + 4h35 = 10h úteis
  assert.equal(
    businessHoursBetween(utc('2026-07-09T15:35:00Z'), utc('2026-07-10T15:35:00Z')),
    10
  );
  // Mesmo dia: 09:00 até 11:30 = 2.5h
  assert.equal(
    businessHoursBetween(utc('2026-07-09T12:00:00Z'), utc('2026-07-09T14:30:00Z')),
    2.5
  );
  // Atravessa o fim de semana: sex 17:00 até seg 09:00 = 2h
  assert.equal(
    businessHoursBetween(utc('2026-07-10T20:00:00Z'), utc('2026-07-13T12:00:00Z')),
    2
  );
  // Conclusão antes da abertura ou nulos: 0
  assert.equal(businessHoursBetween(utc('2026-07-10T20:00:00Z'), utc('2026-07-10T19:00:00Z')), 0);
  assert.equal(businessHoursBetween(null, utc('2026-07-10T19:00:00Z')), 0);
});

test('monthOf usa o relógio BRT, não o UTC', () => {
  // 01/08 01:00 UTC ainda é 31/07 22:00 BRT
  assert.equal(monthOf(utc('2026-08-01T01:00:00Z')), '2026-07');
  assert.equal(monthOf(utc('2026-07-15T12:00:00Z')), '2026-07');
});
