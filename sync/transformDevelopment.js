// Transforma um card do board "PS - Esteira de atividades" (desenvolvimentos
// pedidos pelo cliente) no documento da aba Desarrollos. Pedido da gestão de contas em
// 08/10, depois da reunião em que a P&G listou as entregas da Colômbia: ela
// quer acompanhar no mesmo painel o que está com o time de dev.
//
// Essa aba é só da B2List (ver firestore.rules): os status do board são
// internos ("pendente cs", "em análise (produto)") e não foram pensados pra
// cliente ler.

import { findField, labelsValue, dropdownValue } from './transform.js';
import { labelsOf } from './clients.js';
import { monthOf } from './sla.js';

const CANCELLED_STATUS = 'despriorizado/cancelado';
const DELIVERED_STATUS = 'entregue';

// Mesmo critério da aba de incidentes: o título é o sinal que o time preenche
// com disciplina, e o campo "Interno" entra como reforço.
function belongsToClient(task, ps) {
  if (ps.titleRe && ps.titleRe.test(task.name || '')) return true;
  const alvo = labelsOf(ps, 'internoLabel', 'internoLabels');
  if (alvo.length === 0) return false;
  const interno = (labelsValue(findField(task, 'interno')) || '')
    .split(',').map((s) => s.trim());
  return alvo.some((l) => interno.includes(l));
}

// "Controle SAC" no board de PS (criado em 13/10, igual ao do board de
// Incidentes): Externo = pedido pela P&G, Interno = iniciativa da B2List.
// Vazio vira null e o painel mostra "Sem classificação".
function controlOf(task) {
  const v = (dropdownValue(findField(task, 'controle sac')) || '').trim().toLowerCase();
  return v === 'externo' || v === 'interno' ? v : null;
}

function nativeDate(value) {
  if (!value) return null;
  const ms = Number(value);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
}

// Retorna null para card de outro cliente, cancelado ou entregue antes de
// `ps.deliveredSince` (AAAA-MM): a aba mostra o que está andando e o que foi
// entregue de julho/2026 em diante, o mesmo início dos incidentes
// (era outubro até 13/10, quando a gestão de contas pediu o histórico desde julho).
export function transformDevelopmentTask(task, client) {
  const ps = client?.ps;
  if (!ps || !belongsToClient(task, ps)) return null;

  const statusDetail = (task.status?.status || '').trim().toLowerCase();
  if (statusDetail === CANCELLED_STATUS) return null;

  const delivered = statusDetail === DELIVERED_STATUS || task.status?.type === 'closed';
  const deliveredAt = delivered
    ? (nativeDate(task.date_done) || nativeDate(task.date_closed))
    : null;
  if (delivered) {
    // Entregue sem data de entrega não dá pra saber se é recente: fica de fora
    // em vez de aparecer como novidade algo entregue há meses.
    if (!deliveredAt || monthOf(deliveredAt) < ps.deliveredSince) return null;
  }

  return {
    id: task.id,
    customId: task.custom_id || null,
    title: task.name || '(sem título)',
    status: delivered ? 'entregue' : 'em_andamento',
    statusDetail: task.status?.status || null,
    control: controlOf(task),
    assignees: (task.assignees || []).map((a) => a.username || a.email).filter(Boolean),
    createdAt: nativeDate(task.date_created),
    dueDate: nativeDate(task.due_date),
    deliveredAt,
    clickupUrl: task.url || null,
    syncedAt: new Date(),
  };
}
