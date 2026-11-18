import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENTS, clientById, listIdsToFetch, labelsOf } from './clients.js';
import { transformTask } from './transform.js';
import { transformIncidentTask } from './transformIncident.js';

const dropdown = (name, options, value) => ({ name, type: 'drop_down', type_config: { options }, value });
const labels = (name, options, value) => ({ name, type: 'labels', type_config: { options }, value });

const INTERNO = [
  { id: 'pg', label: 'P&G Latam' },
  { id: 'marg', label: 'Minerva ARG' },
  { id: 'mbr', label: 'Minerva BR' },
  { id: 'vn', label: 'Vila Nova' },
  { id: 'ff', label: 'FocomixFarma' },
  { id: 'fx', label: 'Focomix' },
  { id: 'med', label: 'Medicamental' },
  { id: 'dsl', label: 'DSL' },
  { id: 'vst', label: 'Vestacy' },
];
const CLIENTES = [
  { id: 'cpg', label: 'P&G LATAM' },
  { id: 'cmarg', label: 'MINERVA ARG' },
  { id: 'cmbr', label: 'MINERVA BR' },
  { id: 'cvn', label: 'VILA NOVA' },
  { id: 'cfx', label: 'FOCOMIX' },
  { id: 'cgv', label: 'GRUPO VILA' },
  { id: 'cdsl', label: 'DSL' },
  { id: 'cvst', label: 'VESTACY' },
];
const CONTROLE = [{ id: 'ci', name: 'Interno' }, { id: 'ce', name: 'Externo' }];
const PRIO = [{ id: 'pa', name: 'Alta' }];
const REPORTER = [{ id: 'r1', name: 'Cliente' }];
const TIPO = [{ id: 'a2', name: 'Solicitud' }];

function infraTask(internoIds, name) {
  return {
    id: 'i1',
    name,
    date_created: '1783601428178',
    status: { status: 'produção', type: 'closed' },
    custom_fields: [
      labels('Interno ', INTERNO, internoIds),
      dropdown('Prioridade - Tarefa', PRIO, 'pa'),
      dropdown('Controle SAC', CONTROLE, 'ce'),
    ],
  };
}

function csTask(clienteIds, name) {
  return {
    id: 'c1',
    name,
    date_created: '1783601428178',
    status: { status: 'concluído', type: 'closed' },
    custom_fields: [
      labels('CLIENTES', CLIENTES, clienteIds),
      dropdown('Tipo', TIPO, 'a2'),
      dropdown('Quem reportou/solicitou?', REPORTER, 'r1'),
    ],
  };
}

test('board de Infra: card da Minerva não vaza pro painel da P&G', () => {
  const task = infraTask(['marg'], '[MINERVAARG] Pedido com status não integra');
  assert.equal(transformIncidentTask(task, CLIENTS.pg), null);
  assert.ok(transformIncidentTask(task, CLIENTS.minerva));
});

test('board de Infra: card da P&G não vaza pro painel da Minerva', () => {
  const task = infraTask(['pg'], '[P&G LATAM] Tela em branco');
  assert.equal(transformIncidentTask(task, CLIENTS.minerva), null);
  assert.ok(transformIncidentTask(task, CLIENTS.pg));
});

test('Minerva Brasil não entra no painel da Minerva Argentina', () => {
  // Caso real: card "[Minerva] - Erro 500..." tem Interno = Minerva BR.
  const task = infraTask(['mbr'], '[Minerva] - Erro 500 ao buscar vendedores');
  assert.equal(transformIncidentTask(task, CLIENTS.minerva), null);
});

test('Minerva não usa título: as 13 variantes só valem pelo campo Interno', () => {
  for (const nome of ['[MINERVAARG] x', '[MINERVA ARG] x', '[Minerva ARG] x', '[PROD - MINERVA] x']) {
    assert.ok(transformIncidentTask(infraTask(['marg'], nome), CLIENTS.minerva), nome);
  }
  // Sem o campo preenchido, o título sozinho não basta.
  assert.equal(transformIncidentTask(infraTask([], '[MINERVA ARG] x'), CLIENTS.minerva), null);
});

test('lista de atendimento compartilhada: separa Minerva ARG de Minerva BR', () => {
  assert.ok(transformTask(csTask(['cmarg'], '[MINERVA ARG] Login falha'), CLIENTS.minerva));
  assert.equal(transformTask(csTask(['cmbr'], '[Minerva] Erro 500'), CLIENTS.minerva), null);
  assert.equal(transformTask(csTask(['cpg'], '[P&G LATAM] x'), CLIENTS.minerva), null);
});

test('lista dedicada da P&G não exige o campo CLIENTES', () => {
  assert.ok(transformTask(csTask([], '[P&G LATAM] Cadastro'), CLIENTS.pg));
});

test('cada lista do ClickUp é baixada uma vez só, mesmo compartilhada', () => {
  const ids = listIdsToFetch(Object.values(CLIENTS));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('ID_BOARD_INFRA')); // board de Incidentes, usado pelos dois
  assert.equal(ids.filter((i) => i === 'ID_BOARD_INFRA').length, 1);
});

test('cliente desconhecido falha com mensagem clara', () => {
  assert.throws(() => clientById('nao-existe'), /não existe/);
});

// --- Grupo Vila: uma visão somada mais uma por empresa, tudo no mesmo link ---

test('labelsOf aceita label única e lista, e ignora config vazia', () => {
  assert.deepEqual(labelsOf({ internoLabel: 'Vila Nova' }, 'internoLabel', 'internoLabels'), ['Vila Nova']);
  assert.deepEqual(labelsOf({ internoLabels: ['a', 'b'] }, 'internoLabel', 'internoLabels'), ['a', 'b']);
  assert.deepEqual(labelsOf({}, 'internoLabel', 'internoLabels'), []);
  assert.deepEqual(labelsOf(undefined, 'internoLabel', 'internoLabels'), []);
});

test('a visão do grupo casa com qualquer uma das três empresas', () => {
  for (const [id, nome] of [['vn', 'Vila Nova'], ['ff', 'FocomixFarma'], ['fx', 'Focomix']]) {
    assert.ok(transformIncidentTask(infraTask([id], `[${nome}] x`), CLIENTS.grupovila), nome);
  }
});

test('cliente de fora do grupo não entra na visão do grupo', () => {
  assert.equal(transformIncidentTask(infraTask(['med'], '[MEDICAMENTAL] x'), CLIENTS.grupovila), null);
  assert.equal(transformIncidentTask(infraTask(['pg'], '[P&G LATAM] x'), CLIENTS.grupovila), null);
});

test('card que cita duas empresas do grupo conta uma vez só no total', () => {
  // Caso real do B2INFRA-3989, que tem Medicamental, Vila Nova e FocomixFarma.
  // Como o documento é chaveado pelo id do card, o grupo recebe um só.
  const task = infraTask(['med', 'vn', 'ff'], '[MEDICAMENTAL / VILA NOVA / FOCOMIXFARMA] Disparos');
  const docs = [task]
    .map((t) => transformIncidentTask(t, CLIENTS.grupovila))
    .filter(Boolean);
  assert.equal(docs.length, 1);
  assert.equal(new Set(docs.map((d) => d.id)).size, 1);
  // E o mesmo card aparece nas duas visões individuais, que é o esperado:
  // o incidente atingiu as duas empresas de verdade.
  assert.ok(transformIncidentTask(task, CLIENTS.vilanova));
  assert.ok(transformIncidentTask(task, CLIENTS.focomixfarma));
});

test('cada empresa do grupo só vê o que é dela', () => {
  assert.equal(transformIncidentTask(infraTask(['ff'], 'x'), CLIENTS.vilanova), null);
  assert.equal(transformIncidentTask(infraTask(['vn'], 'x'), CLIENTS.focomixfarma), null);
  assert.equal(transformIncidentTask(infraTask(['fx'], 'x'), CLIENTS.vilanova), null);
});

// Pendente da gestão de contas em 03/09: a lista de atendimento só tem FOCOMIX. Até
// definirem se Focomix e Focomix Farma são um ou dois contratos, a Farma casa
// com uma label que ainda não existe, pra não roubar os cards do Focomix.
test('no atendimento, FOCOMIX é do Focomix e não da Focomix Farma', () => {
  const task = csTask(['cfx'], '[FOCOMIX] Ajuste de valor mínimo');
  assert.ok(transformTask(task, CLIENTS.focomix));
  assert.equal(transformTask(task, CLIENTS.focomixfarma), null);
  // Mas a visão do grupo pega, porque soma as três labels de atendimento.
  assert.ok(transformTask(task, CLIENTS.grupovila));
});

test('GRUPO VILA no atendimento entra na visão somada', () => {
  assert.ok(transformTask(csTask(['cgv'], '[Grupovila] Valores mínimos'), CLIENTS.grupovila));
  assert.equal(transformTask(csTask(['cgv'], 'x'), CLIENTS.vilanova), null);
});

test('o board de Incidentes continua sendo baixado uma vez só com oito clientes', () => {
  const ids = listIdsToFetch(Object.values(CLIENTS));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((i) => i === 'ID_BOARD_INFRA').length, 1);
  assert.equal(ids.filter((i) => i === 'ID_LISTA_ATENDIMENTO_GERAL').length, 1);
});

test('a DSL entra pela label nas duas listas', () => {
  assert.ok(transformTask(csTask(['cdsl'], '[DSL] Templates de pedido'), CLIENTS.dsl));
  assert.ok(transformIncidentTask(infraTask(['dsl'], '[DSL] Campanhas de volume'), CLIENTS.dsl));
});

// Card com VESTACY e DSL juntos é comum (campanha da Vestacy vendida pela
// DSL). Ele entra na DSL pela label dela, mas só a Vestacy sozinha não.
test('Vestacy é a Reckitt e não entra no painel da DSL', () => {
  assert.equal(transformTask(csTask(['cvst'], '[VESTACY] x'), CLIENTS.dsl), null);
  assert.equal(transformIncidentTask(infraTask(['vst'], '[DSL] titulo nao conta'), CLIENTS.dsl), null);
  assert.ok(transformTask(csTask(['cvst', 'cdsl'], 'x'), CLIENTS.dsl));
});

test('card da DSL não vaza para os outros painéis', () => {
  // A P&G fica fora do atendimento porque tem lista própria: um card da lista
  // geral nunca chega no transform dela.
  for (const id of ['minerva', 'grupovila', 'vilanova']) {
    assert.equal(transformTask(csTask(['cdsl'], 'x'), CLIENTS[id]), null);
  }
  for (const id of ['pg', 'minerva', 'grupovila', 'vilanova']) {
    assert.equal(transformIncidentTask(infraTask(['dsl'], 'x'), CLIENTS[id]), null);
  }
});
