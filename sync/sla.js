// Cálculo de deadline pelo SLA contratual (Anexo_SLA_B2List).
// Janela útil: segunda a sexta, 08h às 18h, horário de Brasília (UTC-3, sem horário de verão).
// Prazos de resolução em horas úteis. S4 é "5 dias úteis", equivalente a 50h na janela de 10h/dia.

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
const WINDOW_START = 8;
const WINDOW_END = 18;

export const SLA_HOURS = { S1: 8, S2: 16, S3: 24, S4: 50 };

// Representa o relógio de parede BRT como um Date em UTC, pra usar getUTC* na aritmética.
function toWall(utcDate) {
  return new Date(utcDate.getTime() + BRT_OFFSET_MS);
}

function toUtc(wallDate) {
  return new Date(wallDate.getTime() - BRT_OFFSET_MS);
}

function isWeekend(wall) {
  const day = wall.getUTCDay();
  return day === 0 || day === 6;
}

function atHour(wall, hour) {
  const d = new Date(wall);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function nextBusinessDayStart(wall) {
  const d = atHour(wall, WINDOW_START);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (isWeekend(d));
  return d;
}

// Reporte fora da janela conta a partir do próximo momento útil.
export function normalizeStart(utcDate) {
  let wall = toWall(utcDate);
  if (isWeekend(wall)) {
    wall = nextBusinessDayStart(wall);
  } else if (wall.getUTCHours() < WINDOW_START) {
    wall = atHour(wall, WINDOW_START);
  } else if (wall.getUTCHours() >= WINDOW_END) {
    wall = nextBusinessDayStart(wall);
  }
  return toUtc(wall);
}

export function addBusinessHours(utcStart, hours) {
  let wall = toWall(normalizeStart(utcStart));
  let remainingMs = hours * 60 * 60 * 1000;
  while (remainingMs > 0) {
    const endOfDay = atHour(wall, WINDOW_END);
    const available = endOfDay.getTime() - wall.getTime();
    if (available >= remainingMs) {
      wall = new Date(wall.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= available;
      wall = nextBusinessDayStart(wall);
    }
  }
  return toUtc(wall);
}

// Retorna o deadline em UTC, ou null se faltar severidade ou data do reporte.
export function deadlineFor(reportedAtUtc, severity) {
  const hours = SLA_HOURS[severity];
  if (!hours || !reportedAtUtc) return null;
  return addBusinessHours(reportedAtUtc, hours);
}

// Horas úteis decorridas entre dois instantes (mesma janela do SLA).
export function businessHoursBetween(startUtc, endUtc) {
  if (!startUtc || !endUtc || endUtc <= startUtc) return 0;
  let cur = toWall(normalizeStart(startUtc));
  const endWall = toWall(endUtc);
  let totalMs = 0;
  while (cur < endWall) {
    const endOfDay = atHour(cur, WINDOW_END);
    const segmentEnd = endOfDay < endWall ? endOfDay : endWall;
    if (segmentEnd > cur) totalMs += segmentEnd.getTime() - cur.getTime();
    cur = nextBusinessDayStart(cur);
  }
  return Math.round((totalMs / 3600000) * 10) / 10;
}

// Mês de referência (YYYY-MM) no relógio BRT.
export function monthOf(utcDate) {
  const wall = toWall(utcDate);
  const y = wall.getUTCFullYear();
  const m = String(wall.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
