// Sync ClickUp → Firestore. Roda no GitHub Actions a cada 30 minutos.
// Processa todos os clientes de clients.js numa passada só: baixa cada lista
// do ClickUp uma vez (o board de Incidentes é compartilhado) e grava os
// documentos de cada cliente na sua própria coleção, `clients/<id>/incidents`.
// A separação por coleção é o que permite as security rules liberarem um
// cliente sem expor os outros.
// Env: CLICKUP_TOKEN, FIREBASE_SERVICE_ACCOUNT (JSON), GCHAT_WEBHOOK
// (opcional) e SYNC_CLIENTS (opcional, lista separada por vírgula pra rodar
// só alguns clientes).

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchListTasks } from './clickup.js';
import { transformTask } from './transform.js';
import { transformIncidentTask } from './transformIncident.js';
import { transformDevelopmentTask } from './transformDevelopment.js';
import { translatePtEs, applyGlossary } from './translate.js';
import { buildAlerts, sendChatMessage } from './chat.js';
import { CLIENTS, clientById, listIdsToFetch } from './clients.js';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não definida`);
  return v;
}

function selectedClients() {
  const raw = (process.env.SYNC_CLIENTS || '').trim();
  if (!raw) return Object.values(CLIENTS);
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map(clientById);
}

// Monta os documentos de um cliente a partir das listas já baixadas.
function buildDocs(client, tasksByList) {
  const atendimento = tasksByList.get(client.atendimento.listId) || [];
  const infra = tasksByList.get(client.infra.listId) || [];
  return [
    ...atendimento.map((t) => transformTask(t, client)).filter(Boolean),
    ...infra.map((t) => transformIncidentTask(t, client)).filter(Boolean),
  ].filter((d) => d.month && d.month >= client.minMonth);
}

async function syncClient(db, client, tasksByList, webhook) {
  const col = db.collection('clients').doc(client.id).collection('incidents');
  const syncRef = db.collection('clients').doc(client.id).collection('meta').doc('sync');

  const docs = buildDocs(client, tasksByList);

  // Tradução automática do título (PT → ES) com cache: só traduz título novo
  // ou alterado. O campo manual "Título (ES)" do card sempre vence.
  const existing = await col.get();
  const prev = new Map(existing.docs.map((doc) => [doc.id, doc.data()]));
  for (const d of docs) {
    if (d.titleEs) {
      d.titleEsAuto = null;
      continue;
    }
    const cached = prev.get(d.id);
    if (cached && cached.title === d.title && cached.titleEsAuto) {
      d.titleEsAuto = applyGlossary(cached.titleEsAuto);
    } else {
      d.titleEsAuto = await translatePtEs(d.title);
    }
  }

  // Alertas pro Google Chat, só pros clientes que pediram (ver clients.js).
  const alertMessages = [];
  if (client.alerts) {
    for (const d of docs) {
      alertMessages.push(...buildAlerts(d, prev.get(d.id)));
    }
  } else {
    // Sem alerta, mas as flags precisam existir pra não disparar tudo de uma
    // vez caso o cliente passe a receber alertas depois.
    for (const d of docs) buildAlerts(d, prev.get(d.id));
  }

  const batch = db.batch();
  const seen = new Set();
  for (const d of docs) {
    seen.add(d.id);
    batch.set(col.doc(d.id), d, { merge: false });
  }

  // Remove do site cards apagados, movidos pra fora da lista ou que deixaram
  // de se encaixar nos filtros do cliente.
  for (const doc of existing.docs) {
    if (!seen.has(doc.id)) batch.delete(doc.ref);
  }

  batch.set(syncRef, { lastRunAt: new Date(), ok: true, error: null, count: docs.length });
  await batch.commit();

  for (const msg of alertMessages) {
    await sendChatMessage(webhook, msg);
  }
  const developments = client.ps ? await syncDevelopments(db, client, tasksByList) : null;
  return { count: docs.length, alerts: alertMessages.length, developments };
}

// Desenvolvimentos vão para `internal/<id>/developments`, fora de `clients/`,
// de propósito: a regra que libera `clients/<id>` para convidados do cliente
// vale para tudo abaixo dela, e essa aba é só da B2List (ver firestore.rules).
async function syncDevelopments(db, client, tasksByList) {
  const root = db.collection('internal').doc(client.id);
  const col = root.collection('developments');
  const tasks = tasksByList.get(client.ps.listId) || [];
  const docs = tasks.map((t) => transformDevelopmentTask(t, client)).filter(Boolean);

  const existing = await col.get();
  const batch = db.batch();
  const seen = new Set();
  for (const d of docs) {
    seen.add(d.id);
    batch.set(col.doc(d.id), d, { merge: false });
  }
  for (const doc of existing.docs) {
    if (!seen.has(doc.id)) batch.delete(doc.ref);
  }
  batch.set(root.collection('meta').doc('sync'), { lastRunAt: new Date(), count: docs.length });
  await batch.commit();
  return docs.length;
}

async function main() {
  const token = requireEnv('CLICKUP_TOKEN');
  // Remove BOM que shells do Windows costumam injetar ao gravar o secret.
  const serviceAccount = JSON.parse(requireEnv('FIREBASE_SERVICE_ACCOUNT').replace(/^﻿/, ''));

  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();
  const webhook = process.env.GCHAT_WEBHOOK || '';

  const clients = selectedClients();
  const listIds = listIdsToFetch(clients);
  const fetched = await Promise.all(listIds.map((id) => fetchListTasks(id, token)));
  const tasksByList = new Map(listIds.map((id, i) => [id, fetched[i]]));

  // Um cliente que falha não pode derrubar os outros: o erro fica registrado
  // no meta daquele cliente e o site mostra a última sincronização boa.
  let failed = 0;
  for (const client of clients) {
    try {
      const { count, alerts, developments } = await syncClient(db, client, tasksByList, webhook);
      const dev = developments === null ? '' : `, ${developments} desenvolvimentos`;
      console.log(`[${client.id}] ok: ${count} incidentes, ${alerts} alertas${dev}.`);
    } catch (err) {
      failed += 1;
      console.error(`[${client.id}] falhou:`, err.message || err);
      await db.collection('clients').doc(client.id).collection('meta').doc('sync')
        .set({ lastRunAt: new Date(), ok: false, error: String(err.message || err) }, { merge: true })
        .catch(() => {});
    }
  }
  if (failed) throw new Error(`${failed} cliente(s) falharam na sincronização`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
