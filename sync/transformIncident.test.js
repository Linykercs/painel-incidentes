import test from 'node:test';
import assert from 'node:assert/strict';
import { transformIncidentTask } from './transformIncident.js';
import { CLIENTS } from './clients.js';

const PG = CLIENTS.pg;

const dropdown = (name, options, value) => ({
  name,
  type: 'drop_down',
  type_config: { options },
  value,
});

const labels = (name, options, value) => ({
  name,
  type: 'labels',
  type_config: { options },
  value,
});

const INTERNO_OPTIONS = [
  { id: 'pg', label: 'P&G Latam' },
  { id: 'outra', label: 'Outra frente' },
];
const ORIGEM_OPTIONS = [
  { id: 'o1', orderindex: 0, name: 'Chatbot' },
  { id: 'o2', orderindex: 1, name: 'Lista de Productos' },
  { id: 'o3', orderindex: 2, name: 'Pedidos' },
];
const CONTROLE_OPTIONS = [
  { id: 'ci', orderindex: 0, name: 'Interno' },
  { id: 'ce', orderindex: 1, name: 'Externo' },
];
const DEV_PRIORITY_OPTIONS = [
  { id: 'p0', orderindex: 0, name: 'Urgente' },
  { id: 'p1', orderindex: 1, name: 'Alta' },
  { id: 'p2', orderindex: 2, name: 'Normal' },
  { id: 'p3', orderindex: 3, name: 'Baixo' },
  { id: 'p4', orderindex: 4, name: 'Muito Baixo' },
];

function fullTask() {
  return {
    id: 'infra123',
    name: '[P&G LATAM] AxiosError 400 — Sessão expirada',
    url: 'https://app.clickup.com/t/infra123',
    date_created: '1783601428178',
    date_closed: '1784148211284',
    status: { status: 'produção', type: 'closed' },
    custom_fields: [
      labels('Interno ', INTERNO_OPTIONS, ['pg']),
      dropdown('Prioridade - Tarefa', DEV_PRIORITY_OPTIONS, 'p1'),
      { name: 'Data', type: 'date', value: '1783611300000' },
      dropdown('Controle SAC', CONTROLE_OPTIONS, 'ce'),
      dropdown('Origem da Falha', ORIGEM_OPTIONS, 'o3'),
    ],
  };
}

test('card do board de infra vira documento com severidade inferida', () => {
  const doc = transformIncidentTask(fullTask(), PG);
  assert.equal(doc.id, 'infra123');
  assert.equal(doc.source, 'infra');
  assert.equal(doc.type, 'issue');
  assert.equal(doc.severity, 'S2');
  assert.equal(doc.severityInferred, true);
  assert.equal(doc.devPriority, 'Alta');
  assert.equal(doc.status, 'concluido');
  assert.equal(doc.reportedBy, null);
  assert.ok(doc.pending.includes('reportedBy'));
});

test('card sem "P&G Latam" no título nem no label é descartado', () => {
  const task = fullTask();
  task.name = 'Ajustar problema no ChatBot P&G de produção'; // campanha P&G+ de outra frente comercial, não é P&G Latam
  task.custom_fields[0] = labels('Interno ', INTERNO_OPTIONS, ['outra']);
  assert.equal(transformIncidentTask(task, PG), null);
});

test('card com "P&G LATAM" no título mas sem o campo Interno preenchido ainda entra', () => {
  // Caso real: o time preenche o título mas não o campo estruturado na maioria dos cards.
  const task = fullTask();
  task.custom_fields[0] = labels('Interno ', INTERNO_OPTIONS, []);
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.id, 'infra123');
});

test('card só com o label Interno preenchido (sem "LATAM" no título) ainda entra', () => {
  const task = fullTask();
  task.name = 'Verificar lógica de restrições de tabela de preço - P&G';
  assert.ok(transformIncidentTask(task, PG));
});

test('card triado como "não é incidente" é descartado', () => {
  const task = fullTask();
  task.status = { status: 'não é incidente', type: 'done' };
  assert.equal(transformIncidentTask(task, PG), null);
});

test('prioridade de dev sem mapeamento reconhecido deixa severidade pendente', () => {
  const task = fullTask();
  task.custom_fields[1] = dropdown('Prioridade - Tarefa', [{ id: 'x', name: 'Outra' }], 'x');
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.severity, null);
  assert.ok(doc.pending.includes('severity'));
});

test('sem campo Data, cai na criação do card', () => {
  const task = fullTask();
  task.custom_fields = task.custom_fields.filter((f) => f.name !== 'Data');
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.reportedAt.getTime(), 1783601428178);
  assert.ok(doc.pending.includes('reportedAt'));
});

test('campo nativo "Início" tem prioridade sobre o campo Data como hora do reporte', () => {
  // O campo "Data" só guarda o dia; o start_date guarda dia e hora do e-mail.
  const task = fullTask();
  task.start_date = '1783611300000';
  task.custom_fields[2] = { name: 'Data', type: 'date', value: '1783555200000' };
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.reportedAt.getTime(), 1783611300000);
});

test('date_closed vence a "Data limite", que no board costuma ser meta de sprint', () => {
  // Deixar a meta vencer subestimaria o tempo de resolução no relatório.
  const task = fullTask();
  task.due_date = '1783062000000';
  task.date_closed = '1783601581460';
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.concludedAt.getTime(), 1783601581460);
});

test('card criado já fechado (registro retroativo) usa a Data limite mesmo sem date_closed', () => {
  const task = fullTask();
  task.status = { status: 'fechado (retorno)', type: 'done' };
  task.date_closed = null;
  task.start_date = '1783611300000';
  task.due_date = '1783626000000';
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.status, 'concluido');
  assert.equal(doc.concludedAt.getTime(), 1783626000000);
  assert.ok(doc.resolutionHours > 0);
});

test('sem Data limite nem date_closed, card fechado fica sem data de conclusão', () => {
  const task = fullTask();
  task.due_date = null;
  task.date_closed = null;
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.status, 'concluido');
  assert.equal(doc.concludedAt, null);
  assert.equal(doc.resolutionHours, null);
});

test('card em andamento não ganha data de conclusão mesmo com Data limite preenchida', () => {
  const task = fullTask();
  task.status = { status: 'em progresso', type: 'custom' };
  task.due_date = '1784148211284';
  const doc = transformIncidentTask(task, PG);
  assert.equal(doc.status, 'em_andamento');
  assert.equal(doc.concludedAt, null);
});

test('mapeamento Urgente/Baixo/Muito Baixo → S1/S4/S4', () => {
  const task = fullTask();
  task.custom_fields[1] = dropdown('Prioridade - Tarefa', DEV_PRIORITY_OPTIONS, 'p0');
  assert.equal(transformIncidentTask(task, PG).severity, 'S1');

  task.custom_fields[1] = dropdown('Prioridade - Tarefa', DEV_PRIORITY_OPTIONS, 'p3');
  assert.equal(transformIncidentTask(task, PG).severity, 'S4');

  task.custom_fields[1] = dropdown('Prioridade - Tarefa', DEV_PRIORITY_OPTIONS, 'p4');
  assert.equal(transformIncidentTask(task, PG).severity, 'S4');
});

test('card interno também é descartado no board de Infra', () => {
  const task = fullTask();
  task.tags = [{ name: 'testes' }];
  assert.equal(transformIncidentTask(task, PG), null);
});

test('card "Controle SAC" = Interno é descartado: quem achou foi a B2List', () => {
  const task = fullTask();
  task.custom_fields[3] = dropdown('Controle SAC', CONTROLE_OPTIONS, 'ci');
  assert.equal(transformIncidentTask(task, PG), null);
});

test('card sem "Controle SAC" preenchido é descartado', () => {
  const task = fullTask();
  task.custom_fields = task.custom_fields.filter((f) => f.name !== 'Controle SAC');
  assert.equal(transformIncidentTask(task, PG), null);
});

test('origem da falha vem do campo do board de Infra', () => {
  const doc = transformIncidentTask(fullTask(), PG);
  assert.equal(doc.failureArea, 'Pedidos');
});

test('sem origem da falha preenchida, a coluna fica vazia sem quebrar', () => {
  const task = fullTask();
  task.custom_fields = task.custom_fields.filter((f) => f.name !== 'Origem da Falha');
  assert.equal(transformIncidentTask(task, PG).failureArea, null);
});
