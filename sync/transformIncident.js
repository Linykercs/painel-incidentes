// Transforma um card do board de Incidentes da Infra/Sustentação (B2INFRA) no
// mesmo formato de documento que transform.js gera pra lista de atendimento.
// Esse board não tem os campos de atendimento ao cliente (quem reportou,
// canal, resumo ES); tem só o que o time de dev registra. Por isso alguns
// campos ficam sempre nulos/pending aqui, e a severidade é inferida a partir
// da prioridade de dev (não é a classificação oficial que o CS dá na
// abertura do card na lista de atendimento).

import { deadlineFor, monthOf, businessHoursBetween } from './sla.js';
import {
  findField, dropdownValue, dateValue, labelsValue, isInternalCard, CLOSED_STATUS_TYPES,
} from './transform.js';
import { labelsOf } from './clients.js';

const NOT_AN_INCIDENT_STATUS = 'não é incidente';

// Campo "Controle SAC" criado pelo time de Infra em 30/07 a pedido da gestão de contas: marca
// se quem achou o problema foi o cliente (Externo, P&G ou Marco Marketing) ou
// a própria B2List (Interno). Só Externo conta como incidente reportado no
// relatório contratual. Card sem o campo preenchido também fica de fora, pra
// não afirmar pra P&G que algo foi reportado por ela sem ter certeza.
const EXTERNAL_CONTROL = 'externo';

// "Prioridade - Tarefa" (escala interna de dev) → severidade do SLA contratual.
// Mapeamento combinado com a gestão de contas em 21/07: como o board de Infra não tem a
// classificação S1-S4 que o CS dá na lista de atendimento, essa severidade é
// inferida e fica marcada como tal (campo severityInferred) pro time poder
// justificar o número numa auditoria.
const DEV_PRIORITY_TO_SEVERITY = {
  'urgente': 'S1',
  'alta': 'S2',
  'normal': 'S3',
  'baixo': 'S4',
  'muito baixo': 'S4',
};

// O board de Incidentes é compartilhado por todos os clientes, então cada card
// precisa dizer de quem é. O campo de labels "Interno" é o sinal oficial; o
// título entra como reforço só pros clientes onde o time o preenche com mais
// disciplina que o campo (ver comentário em clients.js).
function belongsToClient(task, client) {
  const titleRe = client?.infra?.titleRe;
  if (titleRe && titleRe.test(task.name || '')) return true;
  const alvo = labelsOf(client?.infra, 'internoLabel', 'internoLabels');
  if (alvo.length === 0) return false;
  const interno = (labelsValue(findField(task, 'interno')) || '')
    .split(',').map((s) => s.trim());
  return alvo.some((l) => interno.includes(l));
}

function resolveDevPriority(task) {
  return dropdownValue(findField(task, 'prioridade - tarefa'));
}

// Converte campo nativo de data do ClickUp (string em ms) num Date.
function nativeDate(value) {
  if (!value) return null;
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
}

function resolveSeverity(devPriority) {
  if (!devPriority) return null;
  return DEV_PRIORITY_TO_SEVERITY[devPriority.trim().toLowerCase()] || null;
}

// Retorna null quando o card não é do cliente, não é "Controle SAC" = Externo,
// é interno (ver isInternalCard) ou foi triado como "não é incidente": nenhum
// deles deve contar nas métricas nem aparecer no painel.
export function transformIncidentTask(task, client) {
  const statusDetail = (task.status?.status || '').trim().toLowerCase();
  const controle = (dropdownValue(findField(task, 'controle sac')) || '').trim().toLowerCase();
  if (
    !belongsToClient(task, client)
    || controle !== EXTERNAL_CONTROL
    || isInternalCard(task)
    || statusDetail === NOT_AN_INCIDENT_STATUS
  ) {
    return null;
  }

  const pending = [];

  const devPriority = resolveDevPriority(task);
  const severity = resolveSeverity(devPriority);
  if (!severity) pending.push('severity');

  // Hora do reporte: o campo nativo "Início" guarda dia e hora (vindos do
  // e-mail do cliente), enquanto o campo "Data" só guarda o dia. Por isso o
  // nativo vem primeiro quando existe.
  const startDate = nativeDate(task.start_date);
  let reportedAt = startDate || dateValue(findField(task, 'data'));
  if (!reportedAt) {
    pending.push('reportedAt');
    reportedAt = task.date_created ? new Date(Number(task.date_created)) : null;
  }

  // Board de Infra não registra quem do lado do cliente reportou.
  pending.push('reportedBy');

  const slaDeadline = severity && reportedAt ? deadlineFor(reportedAt, severity) : null;

  const statusType = task.status?.type || 'open';
  const isClosed = CLOSED_STATUS_TYPES.includes(statusType);
  // Encerramento: o date_closed do ClickUp é a fonte de verdade quando existe.
  // Card criado já com status fechado (registro retroativo de incidente antigo)
  // não recebe date_closed da API, e aí o "Data limite" preenchido à mão com a
  // hora real do encerramento é o que sobra. A ordem importa: em card normal o
  // "Data limite" costuma ser meta de sprint do time de dev, anterior ao
  // fechamento de fato — deixá-lo vencer subestimaria o tempo de resolução.
  const dueDate = nativeDate(task.due_date);
  const concludedAt = isClosed
    ? ((task.date_closed ? new Date(Number(task.date_closed)) : null) || dueDate)
    : null;

  const resolutionHours = concludedAt && reportedAt
    ? businessHoursBetween(reportedAt, concludedAt)
    : null;

  return {
    id: task.id,
    source: 'infra',
    title: task.name || '(sem título)',
    titleEs: null,
    // Campo "Origem da Falha" criado pelo time de Infra em 31/07 a pedido da gestão de contas.
    // Equivale ao "Onde a falha está sendo apresentada?" da lista de
    // atendimento, que não existia aqui e deixava a coluna vazia no painel.
    failureArea: dropdownValue(findField(task, 'origem da falha')),
    resolutionHours,
    type: 'issue',
    severity,
    severityInferred: true,
    devPriority,
    reportedAt,
    reportedBy: null,
    deadline: slaDeadline,
    deadlineSource: slaDeadline ? 'sla' : null,
    concludedAt,
    status: isClosed ? 'concluido' : 'em_andamento',
    statusDetail: task.status?.status || null,
    summary: null,
    month: reportedAt ? monthOf(reportedAt) : null,
    clickupUrl: task.url || null,
    pending,
    syncedAt: new Date(),
  };
}
