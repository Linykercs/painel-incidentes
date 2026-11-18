// Alertas pro Google Chat via webhook de espaço.
// Sem webhook configurado (env GCHAT_WEBHOOK vazio), tudo é ignorado em silêncio.

const TZ_FMT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function fmtBrt(date) {
  return TZ_FMT.format(date);
}

export async function sendChatMessage(webhookUrl, text) {
  if (!webhookUrl) return false;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.error(`Google Chat respondeu ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error('Falha ao enviar alerta pro Google Chat:', err.message);
    return false;
  }
}

const TYPE_LABEL = { issue: 'Issue', solicitud: 'Solicitud', issue_externa: 'Issue externa' };

// Decide os alertas do documento e marca as flags pra não repetir.
// Retorna a lista de mensagens a enviar.
export function buildAlerts(doc, cached, now = new Date()) {
  const SOON_MS = 4 * 60 * 60 * 1000;
  doc.alerts = {
    created: cached?.alerts?.created || false,
    soon: cached?.alerts?.soon || false,
    breached: cached?.alerts?.breached || false,
  };
  const messages = [];
  const label = [TYPE_LABEL[doc.type], doc.severity].filter(Boolean).join(' ');
  const link = doc.clickupUrl ? `\n${doc.clickupUrl}` : '';

  if (!cached && !doc.alerts.created) {
    doc.alerts.created = true;
    const deadlineTxt = doc.deadline ? ` • deadline ${fmtBrt(doc.deadline)}` : '';
    messages.push(`🆕 *Novo reporte P&G:* ${doc.title}${label ? ` • ${label}` : ''}${deadlineTxt}${link}`);
  }

  if (doc.status === 'em_andamento' && doc.deadline) {
    const remaining = doc.deadline.getTime() - now.getTime();
    if (remaining > 0 && remaining <= SOON_MS && !doc.alerts.soon) {
      doc.alerts.soon = true;
      messages.push(`⏰ *Deadline chegando:* ${doc.title} vence às ${fmtBrt(doc.deadline)}${link}`);
    }
    if (remaining <= 0 && !doc.alerts.breached) {
      doc.alerts.breached = true;
      messages.push(`🔴 *SLA estourado:* ${doc.title} venceu em ${fmtBrt(doc.deadline)} e segue em andamento${link}`);
    }
  }

  return messages;
}
