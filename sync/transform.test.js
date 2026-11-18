import test from 'node:test';
import assert from 'node:assert/strict';
import { transformTask } from './transform.js';
import { CLIENTS } from './clients.js';

// Lista dedicada: nada a filtrar por cliente aqui.
const PG = CLIENTS.pg;

const dropdown = (name, options, value) => ({
  name,
  type: 'drop_down',
  type_config: { options },
  value,
});

const TIPO_OPTIONS = [
  { id: 'a1', orderindex: 0, name: 'Issue' },
  { id: 'a2', orderindex: 1, name: 'Solicitud' },
  { id: 'a3', orderindex: 2, name: 'Issue Externa' },
];
const SEV_OPTIONS = [
  { id: 's1', orderindex: 0, name: 'S1' },
  { id: 's2', orderindex: 1, name: 'S2' },
  { id: 's3', orderindex: 2, name: 'S3' },
  { id: 's4', orderindex: 3, name: 'S4' },
];
const REPORTER_OPTIONS = [
  { id: 'r1', orderindex: 0, name: 'Cliente' },
  { id: 'r2', orderindex: 1, name: 'CS' },
  { id: 'r3', orderindex: 2, name: 'Time interno B2' },
];

// A lista de atendimento alimenta só as demandas operacionais abertas pelo
// cliente, por isso o card base aqui é uma Solicitud reportada pelo Cliente.
function fullTask() {
  return {
    id: 'abc123',
    name: '[P&G LATAM] Cadastro de transferencista',
    url: 'https://app.clickup.com/t/abc123',
    date_created: '1783601428178',
    date_closed: '1784148211284',
    status: { status: 'concluído', type: 'closed' },
    custom_fields: [
      dropdown('Tipo', TIPO_OPTIONS, 'a2'),
      dropdown('Severidade', SEV_OPTIONS, 's2'),
      { name: 'Data do reporte', type: 'date', value: '1783611300000' }, // 09/07 12:35 BRT
      { name: 'Quem reportou', type: 'short_text', value: 'Ana Souza (Marco Marketing)' },
      { name: 'Deadline prometido', type: 'date', value: null },
      { name: 'Resumo cliente (ES)', type: 'text', value: 'Pantalla en blanco al abrir la app.' },
      dropdown('Quem reportou/solicitou?', REPORTER_OPTIONS, 'r1'),
    ],
  };
}

test('card completo vira documento sem pendências', () => {
  const doc = transformTask(fullTask(), PG);
  assert.equal(doc.id, 'abc123');
  assert.equal(doc.source, 'atendimento');
  assert.equal(doc.type, 'solicitud');
  assert.equal(doc.severity, 'S2');
  assert.equal(doc.reportedBy, 'Ana Souza (Marco Marketing)');
  assert.equal(doc.status, 'concluido');
  assert.equal(doc.deadlineSource, 'sla');
  assert.ok(doc.deadline instanceof Date);
  assert.equal(doc.month, '2026-07');
  assert.deepEqual(doc.pending, []);
});

test('deadline prometido sobrescreve o cálculo do SLA', () => {
  const task = fullTask();
  task.custom_fields[4].value = '1784000000000';
  const doc = transformTask(task, PG);
  assert.equal(doc.deadlineSource, 'prometido');
  assert.equal(doc.deadline.getTime(), 1784000000000);
});

test('dropdown resolvido também por orderindex', () => {
  const task = fullTask();
  task.custom_fields[1].value = 3; // orderindex de S4
  const doc = transformTask(task, PG);
  assert.equal(doc.severity, 'S4');
});

test('campos obrigatórios vazios entram em pending e usam fallback', () => {
  const task = fullTask();
  task.custom_fields = [dropdown('Quem reportou/solicitou?', REPORTER_OPTIONS, 'r1')];
  task.status = { status: 'em andamento', type: 'custom' };
  task.date_closed = null;
  const doc = transformTask(task, PG);
  assert.deepEqual(doc.pending.sort(), ['reportedAt', 'severity', 'tipo'].sort());
  // Sem data do reporte, cai na criação do card pro incidente não sumir.
  assert.equal(doc.reportedAt.getTime(), 1783601428178);
  // Sem os campos de nome, o próprio dropdown responde quem reportou.
  assert.equal(doc.reportedBy, 'Cliente');
  assert.equal(doc.status, 'em_andamento');
  assert.equal(doc.concludedAt, null);
  assert.equal(doc.deadline, null);
});

test('campos da lista de atendimento servem de fallback (Prioridade, Demanda/Incidente, Nome Solicitante)', () => {
  const task = fullTask();
  task.custom_fields = [
    dropdown('Demanda operacional ou incidente?', [
      { id: 'd1', orderindex: 0, name: 'Demanda operacional' },
      { id: 'd2', orderindex: 1, name: 'Incidente' },
    ], 'd1'),
    dropdown('Prioridade', [
      { id: 'p1', orderindex: 0, name: 'Urgente - todas as funcionalidades fora do ar e clientes em onboarding ' },
      { id: 'p2', orderindex: 1, name: 'Alta - algumas funcionalidades fora do ar - clientes com alto faturamento' },
      { id: 'p3', orderindex: 2, name: 'Média - Demandas operacionais e falhas sem impactos financeiros' },
      { id: 'p4', orderindex: 3, name: 'Baixa - Requisições sem impactos direto no faturamento ' },
    ], 'p2'),
    { name: 'Nome Solicitante', type: 'short_text', value: 'Carlos Lima' },
    dropdown('Quem reportou/solicitou?', REPORTER_OPTIONS, 'r1'),
  ];
  const doc = transformTask(task, PG);
  assert.equal(doc.type, 'solicitud');
  assert.equal(doc.severity, 'S2');
  assert.equal(doc.reportedBy, 'Carlos Lima');
});

test('nome de campo duplicado: vale o que tem valor', () => {
  const task = fullTask();
  task.custom_fields = [
    { name: 'Prioridade', type: 'short_text', value: null },
    dropdown('Prioridade', [
      { id: 'p2', orderindex: 1, name: 'Alta - algumas funcionalidades fora do ar' },
    ], 1),
    dropdown('Demanda operacional ou incidente?', [
      { id: 'd1', orderindex: 0, name: 'Demanda operacional' },
    ], 'd1'),
    dropdown('Quem reportou/solicitou?', REPORTER_OPTIONS, 'r1'),
  ];
  const doc = transformTask(task, PG);
  assert.equal(doc.severity, 'S2');
});

test('card aberto não ganha concludedAt mesmo com date_closed antigo', () => {
  const task = fullTask();
  task.status = { status: 'em andamento', type: 'custom' };
  const doc = transformTask(task, PG);
  assert.equal(doc.concludedAt, null);
  assert.equal(doc.status, 'em_andamento');
});

test('incidente na lista de atendimento é descartado (vem do board de Infra)', () => {
  // Os dois lados abrem card pro mesmo problema; contar os dois duplicava.
  const task = fullTask();
  task.custom_fields[0] = dropdown('Tipo', TIPO_OPTIONS, 'a1'); // Issue
  assert.equal(transformTask(task, PG), null);
});

test('issue externa na lista de atendimento também é descartada', () => {
  const task = fullTask();
  task.name = 'EXTERNAL: [P&G LATAM] OTP não recebido (falha AWS)';
  assert.equal(transformTask(task, PG), null);
});

test('card com a tag "testes" do processo do SAC é descartado', () => {
  const task = fullTask();
  task.tags = [{ name: 'testes' }];
  assert.equal(transformTask(task, PG), null);
});

test('card pedido pelo "Time interno B2" é descartado', () => {
  const task = fullTask();
  task.custom_fields[6] = dropdown('Quem reportou/solicitou?', REPORTER_OPTIONS, 'r3');
  assert.equal(transformTask(task, PG), null);
});

test('card aberto pelo CS é descartado: não foi o cliente que reportou', () => {
  const task = fullTask();
  task.custom_fields[6] = dropdown('Quem reportou/solicitou?', REPORTER_OPTIONS, 'r2');
  assert.equal(transformTask(task, PG), null);
});

test('card sem "Quem reportou/solicitou?" preenchido é descartado', () => {
  const task = fullTask();
  task.custom_fields = task.custom_fields.filter(
    (f) => f.name !== 'Quem reportou/solicitou?'
  );
  assert.equal(transformTask(task, PG), null);
});

test('demanda reportada pelo Cliente continua entrando', () => {
  const task = fullTask();
  task.tags = [{ name: 'urgente' }];
  assert.ok(transformTask(task, PG));
});
