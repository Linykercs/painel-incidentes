// Transforma um card da lista de atendimento (demandas operacionais e
// incidentes reportados pelo cliente) no documento da coleção `incidents`.
// Lê primeiro os campos dedicados (Tipo, Severidade...) e cai nos campos que a
// lista de atendimento já tem (Demanda operacional ou incidente?, Prioridade,
// Nome Solicitante, Quem reportou/solicitou?). Campos são lidos por nome de
// propósito: renomear campo na lista quebra o sync visível, melhor do que
// publicar dado errado pro cliente.
// Ver também transformIncident.js, que lê o board de Incidentes da Infra.

import { deadlineFor, monthOf, businessHoursBetween } from './sla.js';
import { labelsOf } from './clients.js';

const TYPE_MAP = {
  'issue': 'issue',
  'solicitud': 'solicitud',
  'issue externa': 'issue_externa',
};

// "Prioridade" da lista de atendimento → severidade do SLA contratual.
const PRIORITY_TO_SEVERITY = [
  [/^urgente/, 'S1'],
  [/^alta/, 'S2'],
  [/^m[ée]dia/, 'S3'],
  [/^baixa/, 'S4'],
];

export const CLOSED_STATUS_TYPES = ['closed', 'done'];

// Card interno não é reporte do cliente e não pode entrar no relatório da P&G:
// inflava o total de "reportes recebidos" e, quando fechado fora do prazo,
// derrubava o KPI de SLA com trabalho que a P&G nunca reportou. Dois sinais,
// os mesmos que o time já usa no ClickUp: a tag "testes" do processo de testes
// do SAC (card de validação em HML) e o campo "Quem reportou/solicitou?" com
// "Time interno B2" (pedido do próprio time, ex.: liberar acesso pra testar).
const TEST_TAG = 'testes';
const INTERNAL_REPORTER = 'time interno b2';

export function isInternalCard(task) {
  const tags = (task.tags || []).map((t) => (t.name || '').trim().toLowerCase());
  if (tags.includes(TEST_TAG)) return true;
  const reporter = dropdownValue(findField(task, 'quem reportou/solicitou?'));
  return (reporter || '').trim().toLowerCase() === INTERNAL_REPORTER;
}

// Só demanda aberta pelo próprio cliente entra no relatório (regra da gestão de contas,
// 30/07). Card com "Quem reportou/solicitou?" = CS ou em branco fica de fora:
// é trabalho que a B2List levantou sozinha, não reporte da P&G.
const CLIENT_REPORTER = 'cliente';

function isClientReported(task) {
  const reporter = dropdownValue(findField(task, 'quem reportou/solicitou?'));
  return (reporter || '').trim().toLowerCase() === CLIENT_REPORTER;
}

// A lista tem nomes de campo duplicados (ex: dois "Prioridade"). Quando houver
// mais de um, vale o que tem valor preenchido.
export function findField(task, name) {
  const matches = (task.custom_fields || []).filter(
    (f) => (f.name || '').trim().toLowerCase() === name
  );
  if (matches.length === 0) return undefined;
  return matches.find(
    (f) => f.value !== null && f.value !== undefined && f.value !== ''
  ) || matches[0];
}

export function dropdownValue(field) {
  if (!field || field.value === null || field.value === undefined) return null;
  const options = field.type_config?.options || [];
  const opt = options.find(
    (o) => o.id === field.value || o.orderindex === field.value
  );
  return opt ? opt.name : null;
}

export function dateValue(field) {
  if (!field || !field.value) return null;
  const ms = Number(field.value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
}

export function textValue(field) {
  if (!field || typeof field.value !== 'string') return null;
  const v = field.value.trim();
  return v.length > 0 ? v : null;
}

// Campos do tipo labels: value é um array de ids de opção.
export function labelsValue(field) {
  if (!field || !Array.isArray(field.value) || field.value.length === 0) return null;
  const options = field.type_config?.options || [];
  const names = field.value
    .map((v) => options.find((o) => o.id === v)?.label)
    .filter(Boolean)
    .map((s) => s.trim());
  return names.length > 0 ? names.join(', ') : null;
}

function resolveType(task) {
  let type = null;
  const explicit = dropdownValue(findField(task, 'tipo'));
  if (explicit) type = TYPE_MAP[explicit.trim().toLowerCase()] || null;
  if (!type) {
    const legacy = dropdownValue(findField(task, 'demanda operacional ou incidente?'));
    if (legacy) {
      type = legacy.trim().toLowerCase().startsWith('incidente') ? 'issue' : 'solicitud';
    }
  }
  // Convenção combinada com a gestão de contas: causa externa leva EXTERNAL no título.
  if (type && /^\[?\s*external/i.test(task.name || '')) type = 'issue_externa';
  return type;
}

function resolveSeverity(task) {
  const explicit = dropdownValue(findField(task, 'severidade'));
  if (explicit && /^S[1-4]$/i.test(explicit.trim())) return explicit.trim().toUpperCase();
  const priority = dropdownValue(findField(task, 'prioridade'));
  if (priority) {
    const p = priority.trim().toLowerCase();
    for (const [re, sev] of PRIORITY_TO_SEVERITY) {
      if (re.test(p)) return sev;
    }
  }
  return null;
}

function resolveReporter(task) {
  return (
    textValue(findField(task, 'quem reportou'))
    || textValue(findField(task, 'nome solicitante'))
    || dropdownValue(findField(task, 'quem reportou/solicitou?'))
  );
}

// Quando o cliente divide a lista de atendimento com outros (caso da Minerva
// na lista geral do CS), o campo de labels "CLIENTES" é quem separa. Cliente
// com lista dedicada não precisa: tudo que está lá já é dele.
function belongsToClient(task, client) {
  const alvo = labelsOf(client?.atendimento, 'clienteLabel', 'clienteLabels');
  if (alvo.length === 0) return true;
  const clientes = (labelsValue(findField(task, 'clientes')) || '')
    .split(',').map((s) => s.trim());
  return alvo.some((l) => clientes.includes(l));
}

// Esta lista alimenta só as DEMANDAS OPERACIONAIS do painel. Retorna null pra
// todo o resto:
// - card de outro cliente, quando a lista é compartilhada;
// - card interno (ver isInternalCard) e card que não foi o cliente que abriu;
// - card de incidente, porque o incidente vem do board de Infra. Os dois lados
//   abrem card pro mesmo problema (o do CS registra o atendimento, o da Infra
//   tem o diagnóstico), e contar os dois duplicava o incidente no painel.
export function transformTask(task, client) {
  if (!belongsToClient(task, client)) return null;
  if (isInternalCard(task) || !isClientReported(task)) return null;

  const pending = [];

  const type = resolveType(task);
  if (!type) pending.push('tipo');
  if (type === 'issue' || type === 'issue_externa') return null;

  const severity = resolveSeverity(task);
  if (!severity) pending.push('severity');

  let reportedAt = dateValue(findField(task, 'data do reporte'));
  if (!reportedAt) {
    pending.push('reportedAt');
    // Fallback pra criação do card, pra o incidente não sumir do site.
    reportedAt = task.date_created ? new Date(Number(task.date_created)) : null;
  }

  const reportedBy = resolveReporter(task);
  if (!reportedBy) pending.push('reportedBy');

  const promised = dateValue(findField(task, 'deadline prometido'));
  const slaDeadline = severity && reportedAt ? deadlineFor(reportedAt, severity) : null;
  const deadline = promised || slaDeadline;
  const deadlineSource = promised ? 'prometido' : (slaDeadline ? 'sla' : null);

  const statusType = task.status?.type || 'open';
  const isClosed = CLOSED_STATUS_TYPES.includes(statusType);
  const concludedAt = isClosed && task.date_closed
    ? new Date(Number(task.date_closed))
    : null;

  // Onde a falha apareceu (campo de labels que a lista já possui).
  const failureArea = labelsValue(findField(task, 'onde a falha está sendo apresentada?*'))
    || labelsValue(findField(task, 'onde a falha está sendo apresentada?'));

  // Tempo de resolução em horas úteis (mesma régua do SLA).
  const resolutionHours = concludedAt && reportedAt
    ? businessHoursBetween(reportedAt, concludedAt)
    : null;

  return {
    id: task.id,
    source: 'atendimento',
    title: task.name || '(sem título)',
    titleEs: textValue(findField(task, 'título (es)')),
    failureArea,
    resolutionHours,
    type,
    severity,
    reportedAt,
    reportedBy,
    deadline,
    deadlineSource,
    concludedAt,
    status: isClosed ? 'concluido' : 'em_andamento',
    statusDetail: task.status?.status || null,
    summary: textValue(findField(task, 'resumo cliente (es)')),
    month: reportedAt ? monthOf(reportedAt) : null,
    clickupUrl: task.url || null,
    pending,
    syncedAt: new Date(),
  };
}
