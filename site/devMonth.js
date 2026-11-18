// Filtro de mês da aba Desarrollos (pedido da gestão de contas em 13/10). Um mês mostra
// os desenvolvimentos ativos nele: abertos até o fim do mês e ainda não
// entregues no começo dele. Assim entram o que foi entregue no mês e o que
// estava em andamento, sem precisar de um campo novo no ClickUp.

export const ALL_MONTHS = 'all';

function toDate(value) {
  if (!value) return null;
  const d = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Mês AAAA-MM no fuso do painel, igual ao usado nos incidentes.
export function monthKey(value, timeZone) {
  const d = toDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}`;
}

export function isActiveInMonth(dev, month, timeZone) {
  if (!month || month === ALL_MONTHS) return true;
  const created = monthKey(dev.createdAt, timeZone);
  if (created && created > month) return false;
  if (dev.status === 'entregue') {
    const delivered = monthKey(dev.deliveredAt, timeZone);
    if (delivered && delivered < month) return false;
  }
  return true;
}

// Meses que aparecem no seletor: do mais antigo com movimento até o atual,
// do mais recente para o mais antigo. Nunca antes de `minMonth` (início do
// painel), senão um card aberto em 2025 puxaria a lista até lá.
export function devMonths(devs, timeZone, now = new Date(), minMonth = '2026-07') {
  const keys = devs.flatMap((d) => [monthKey(d.createdAt, timeZone), monthKey(d.deliveredAt, timeZone)])
    .filter(Boolean);
  const current = monthKey(now, timeZone);
  if (keys.length === 0) return [current];
  const months = [];
  const oldest = keys.sort()[0];
  let [y, m] = (oldest < minMonth ? minMonth : oldest).split('-').map(Number);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > current) break;
    months.push(key);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months.reverse();
}

// Filtro Externo/Interno da aba (campo "Controle SAC" do board de PS).
// 'none' pega os cards ainda sem classificação.
export function matchesControl(dev, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'none') return !dev.control;
  return dev.control === filter;
}
