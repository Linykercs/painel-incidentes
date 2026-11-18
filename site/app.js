import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  GoogleAuthProvider, signInWithPopup,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, getDocs, doc, getDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import { DEMO_DATA, DEMO_LAST_SYNC } from './demo-data.js';
import { STRINGS } from './i18n.js';
import { ALL_MONTHS, devMonths, isActiveInMonth, matchesControl } from './devMonth.js';
import {
  CLIENTS, DEFAULT_CLIENT, clientById, siteByHost, clientsByEmail,
} from './clients.js';

// Cada endereço serve um conjunto de clientes. Quando a página abre por um
// deles, só esses existem: o time da Minerva acessa o painel dele direto e não
// pode cair no da P&G. O Grupo Vila é o caso de conjunto com mais de um, com
// as quatro visões no mesmo link. Sem domínio conhecido (localhost, preview),
// volta a deixar escolher entre tudo que a pessoa pode ver.
const PINNED_SITE = siteByHost();

// Sem config do Firebase, o painel roda em modo demonstração: dados fictícios
// de demo-data.js, sem login e sem banco. O resto do painel é o mesmo código.
const DEMO = !firebaseConfig;

let app = null;
let auth = null;
let db = null;
let initError = null;
if (!DEMO) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    initError = err;
    console.error('Falha ao inicializar o Firebase (config.js preenchido?):', err);
  }
}

const state = {
  lang: localStorage.getItem('lang') || PINNED_SITE?.lang || 'es',
  client: localStorage.getItem('client')
    || (PINNED_SITE ? PINNED_SITE.clients[0] : DEFAULT_CLIENT),
  allowedClients: [],
  incidents: [],
  developments: [],
  month: null,
  devMonth: ALL_MONTHS,
  devControl: 'all',
  tab: 'geral',
  filterStatus: 'all',
  filterReporter: 'all',
  lastSync: null,
  isB2list: false,
};

// Aba Incidentes: só o que vem do board de Infra/Sustentação (causa raiz técnica).
// Aba Solicitudes operacionales: só a lista de atendimento, e só o que não é incidente.
// Aba General: as duas fontes juntas, sem filtro adicional.
function filterByTab(list, tab) {
  if (tab === 'incidentes') return list.filter((i) => i.source === 'infra');
  if (tab === 'operacional') {
    return list.filter((i) => i.source === 'atendimento' && i.type !== 'issue' && i.type !== 'issue_externa');
  }
  return list;
}

const $ = (id) => document.getElementById(id);
const t = (key) => STRINGS[state.lang][key] || key;

const TZ = 'America/Sao_Paulo';
function fmtDate(value) {
  if (!value) return null;
  const d = value.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat(state.lang === 'es' ? 'es-CO' : 'pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ,
  }).format(d);
}
function asDate(value) {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value);
}

function show(viewId) {
  for (const id of ['view-loading', 'view-login', 'view-noaccess', 'view-app']) {
    $(id).hidden = id !== viewId;
  }
}

// Marca do cliente no cabeçalho e na tela de login. Roda antes do login
// também, senão o painel da Minerva abriria com a logo da P&G na entrada.
function applyClientBranding() {
  const c = clientById(state.client) || clientById(DEFAULT_CLIENT);
  if (!c) return;

  const titulo = `${t('title')}, ${c.name}`;
  document.title = titulo;
  for (const id of ['header-title', 'login-title']) {
    const el = $(id);
    if (el) el.textContent = titulo;
  }

  // Cliente sem logo (as empresas do Grupo Vila, até as imagens chegarem) fica
  // só com o nome no título. Atribuir src vazio faria o navegador pedir a
  // própria página e desenhar o ícone de imagem quebrada no cabeçalho.
  for (const id of ['client-logo', 'login-client-logo']) {
    const el = $(id);
    if (!el) continue;
    el.hidden = !c.logo;
    if (!c.logo) {
      el.removeAttribute('src');
      continue;
    }
    el.src = c.logo;
    el.alt = c.name;
    el.className = c.logoClass || '';
  }

  // Cliente sem logo de produto (a Minerva não usa o Sentry) fica só com a
  // própria marca, em vez de carregar a de um app que não é dele.
  for (const [chipId, logoId] of [['header-product-chip', 'header-product-logo'], ['login-product-chip', 'login-product-logo']]) {
    const chip = $(chipId);
    const logo = $(logoId);
    if (!chip || !logo) continue;
    chip.hidden = !c.productLogo;
    if (c.productLogo) {
      logo.src = c.productLogo;
      logo.alt = c.productLogoAlt || '';
    }
  }
}

function applyStaticTexts() {
  document.documentElement.lang = state.lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  $('btn-lang').textContent = state.lang === 'es' ? 'PT' : 'ES';
  applyClientBranding();
}

function typeBadge(inc) {
  if (inc.type === 'solicitud') return `<span class="badge t-sol">${t('typeSolicitud')}</span>`;
  if (inc.type === 'issue_externa') return `<span class="badge t-ext">${t('typeExternal')}</span>`;
  if (inc.type === 'issue') return `<span class="badge t-issue">${t('typeIssue')}</span>`;
  return `<span class="pending-cell">${t('toConfirm')}</span>`;
}

function monthLabel(month) {
  const [y, m] = month.split('-');
  const d = new Date(Date.UTC(Number(y), Number(m) - 1, 15));
  const label = new Intl.DateTimeFormat(state.lang === 'es' ? 'es-CO' : 'pt-BR', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderMonths() {
  const months = [...new Set(state.incidents.map((i) => i.month).filter(Boolean))]
    .sort().reverse();
  if (months.length === 0) months.push(new Date().toISOString().slice(0, 7));
  if (!state.month || !months.includes(state.month)) state.month = months[0];
  $('month-select').innerHTML = months
    .map((m) => `<option value="${m}" ${m === state.month ? 'selected' : ''}>${monthLabel(m)}</option>`)
    .join('');
}

function renderFilters(monthList) {
  const statusOptions = [
    ['all', t('filterAll')],
    ['concluido', t('statusDone')],
    ['em_andamento', t('statusOpen')],
  ];
  if (!statusOptions.some(([v]) => v === state.filterStatus)) state.filterStatus = 'all';
  $('status-select').innerHTML = statusOptions
    .map(([v, label]) => `<option value="${v}" ${v === state.filterStatus ? 'selected' : ''}>${label}</option>`)
    .join('');

  const reporters = [...new Set(monthList.map((i) => i.reportedBy).filter(Boolean))].sort();
  if (state.filterReporter !== 'all' && !reporters.includes(state.filterReporter)) {
    state.filterReporter = 'all';
  }
  $('reporter-select').innerHTML = [`<option value="all">${t('filterAll')}</option>`]
    .concat(reporters.map((r) => `<option value="${esc(r)}" ${r === state.filterReporter ? 'selected' : ''}>${esc(r)}</option>`))
    .join('');
}

function displayTitle(inc) {
  if (state.lang !== 'es') return inc.title;
  return inc.titleEs || inc.titleEsAuto || inc.title;
}

function fmtResolution(inc) {
  if (inc.resolutionHours === null || inc.resolutionHours === undefined) return '';
  const sep = state.lang === 'es' ? ',' : ',';
  return `${String(inc.resolutionHours).replace('.', sep)} h`;
}

// Prazos de resolução do Anexo de SLA do contrato, em horas úteis. Mesmos
// valores de sync/sla.js: S4 são 5 dias úteis, 50h na janela de 10h/dia.
const SLA_HOURS = { S1: 8, S2: 16, S3: 24, S4: 50 };

// A P&G cobra o SLA por severidade, não num número único: misturar S1 (8h) com
// S3 (24h) numa média só esconde o que importa. Este painel mostra o prazo
// contratual de cada faixa e quantos ficaram dentro dele.
function renderSlaBySeverity(list) {
  const rows = Object.entries(SLA_HOURS).map(([sev, hours]) => {
    const done = list.filter(
      (i) => i.severity === sev && i.deadline && i.concludedAt
    );
    const onTime = done.filter((i) => asDate(i.concludedAt) <= asDate(i.deadline));
    const prazo = sev === 'S4' ? t('slaBusinessDays') : `${hours}h`;
    const pct = done.length ? Math.round((onTime.length / done.length) * 100) : null;
    return { sev, prazo, total: done.length, onTime: onTime.length, pct };
  });

  const withData = rows.filter((r) => r.total > 0);
  $('sla-panel').hidden = withData.length === 0;
  if (!withData.length) return;

  $('sla-title').textContent = t('slaTitle');
  $('sla-hint').textContent = t('slaHint');
  $('sla-grid').innerHTML = rows.map((r) => {
    const value = r.pct === null
      ? `<div class="sla-empty">${t('slaNone')}</div>`
      : `<div class="sla-pct${r.pct < 100 ? ' sla-miss' : ''}">${r.pct}%</div>
         <div class="sla-count">${r.onTime}/${r.total} ${t('slaWithin')}</div>`;
    return `<div class="sla-cell">
      <div class="sla-sev">${r.sev}<span class="sla-prazo">${r.prazo}</span></div>
      ${value}
    </div>`;
  }).join('');
}

function renderKpis(list) {
  const issues = list.filter((i) => i.type === 'issue' || i.type === 'issue_externa');
  const external = list.filter((i) => i.type === 'issue_externa').length;
  const solicitudes = list.filter((i) => i.type === 'solicitud').length;
  const done = list.filter((i) => i.status === 'concluido').length;
  const concludedWithDeadline = list.filter((i) => i.deadline && i.concludedAt);
  const onTime = concludedWithDeadline.filter(
    (i) => asDate(i.concludedAt) <= asDate(i.deadline)
  );
  const slaPct = concludedWithDeadline.length
    ? `${Math.round((onTime.length / concludedWithDeadline.length) * 100)}%`
    : '–';
  const kpis = [
    [list.length, t('kpiTotal')],
    [issues.length, `${t('kpiIssues')}${external ? ` (${external} ${t('kpiExternal')})` : ''}`],
    [solicitudes, t('kpiSolicitudes')],
    [done, t('kpiDone')],
    [list.length - done, t('kpiOpen')],
    [slaPct, t('kpiSla')],
  ];
  $('kpis').innerHTML = kpis
    .map(([num, label]) => `<div class="kpi"><div class="num">${num}</div><div class="label">${label}</div></div>`)
    .join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderTable(list) {
  // "Quem reportou" saiu da tabela: o board de Infra não tem esse campo, e na
  // prática todo reporte da P&G chega pelo mesmo contato do cliente, então a coluna vinha quase
  // toda como "por confirmar" sem informar nada.
  const heads = [t('colNum'), t('colType'), t('colTitle'), t('colArea'), t('colReported'), t('colDeadline'), t('colConcluded'), t('colResolution'), t('colStatus')];
  $('reports-head').innerHTML = heads.map((h) => `<th>${h}</th>`).join('');

  const now = new Date();
  $('reports-body').innerHTML = list.map((inc, idx) => {
    const deadline = asDate(inc.deadline);
    const concluded = asDate(inc.concludedAt);
    const isLate = deadline && ((concluded && concluded > deadline) || (!concluded && now > deadline));
    const deadlineTxt = deadline
      ? `<span class="${isLate ? 'late' : ''}">${fmtDate(deadline)}</span>${inc.deadlineSource === 'prometido' ? ` <span class="muted">(${t('promised')})</span>` : ''}`
      : '';
    const concludedTxt = concluded
      ? fmtDate(concluded)
      : `<span class="pending-cell">${t('pendingDate')}</span>`;
    const statusBadge = inc.status === 'concluido'
      ? `<span class="badge b-done">${t('statusDone')}</span>`
      : `<span class="badge b-open">${t('statusOpen')}</span>`;
    const link = state.isB2list && inc.clickupUrl
      ? `<br><a class="card-link no-print" href="${esc(inc.clickupUrl)}" target="_blank" rel="noopener">ClickUp</a>`
      : '';
    return `<tr>
      <td>${idx + 1}</td>
      <td>${typeBadge(inc)}${inc.severity ? `<br><span class="sev"${inc.severityInferred && inc.devPriority ? ` title="${esc(t('devPriority'))}: ${esc(inc.devPriority)}"` : ''}>${inc.severity}${inc.severityInferred ? ` (${t('inferredSeverity')})` : ''}</span>` : ''}</td>
      <td>${esc(displayTitle(inc))}${link}</td>
      <td>${inc.failureArea ? esc(inc.failureArea) : ''}</td>
      <td>${fmtDate(inc.reportedAt) || ''}</td>
      <td>${deadlineTxt}</td>
      <td>${concludedTxt}</td>
      <td>${fmtResolution(inc)}</td>
      <td>${statusBadge}${inc.statusDetail ? `<br><span class="muted">${esc(inc.statusDetail)}</span>` : ''}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" class="pending-cell">${t('empty')}</td></tr>`;
}

function renderDetails(list) {
  const withSummary = list
    .map((inc, idx) => ({ inc, idx }))
    .filter(({ inc }) => inc.summary);
  $('details-title').hidden = withSummary.length === 0;
  $('details-table').hidden = withSummary.length === 0;
  $('details-body').innerHTML = withSummary
    .map(({ inc, idx }) => `<tr><td style="width:4%">${idx + 1}</td><td>${esc(inc.summary)}</td></tr>`)
    .join('');
}

// A aba Desarrollos é só da B2List e só dos clientes com board de PS
// configurado. Esconder o botão é conforto; quem garante é firestore.rules.
function canSeeDevelopments() {
  return state.isB2list && Boolean(clientById(state.client)?.developments);
}

function renderTabs() {
  if (state.tab === 'desarrollos' && !canSeeDevelopments()) state.tab = 'geral';
  for (const btn of document.querySelectorAll('#tabs .tab')) {
    btn.classList.toggle('active', btn.dataset.tab === state.tab);
    if (btn.dataset.tab === 'desarrollos') btn.hidden = !canSeeDevelopments();
  }
}

// Em andamento primeiro, pelo prazo mais próximo (sem prazo no fim); depois os
// entregues, do mais recente para o mais antigo.
function sortDevelopments(list) {
  const due = (d) => asDate(d.dueDate)?.getTime() ?? Infinity;
  const open = list.filter((d) => d.status !== 'entregue').sort((a, b) => due(a) - due(b));
  const done = list.filter((d) => d.status === 'entregue')
    .sort((a, b) => (asDate(b.deliveredAt) || 0) - (asDate(a.deliveredAt) || 0));
  return [...open, ...done];
}

function renderDevMonths() {
  const months = devMonths(state.developments, TZ);
  if (state.devMonth !== ALL_MONTHS && !months.includes(state.devMonth)) state.devMonth = ALL_MONTHS;
  const opt = (value, label) =>
    `<option value="${value}" ${value === state.devMonth ? 'selected' : ''}>${label}</option>`;
  $('dev-month-select').innerHTML = [opt(ALL_MONTHS, t('allMonths')), ...months.map((m) => opt(m, monthLabel(m)))].join('');
  const ctl = (value, label) =>
    `<option value="${value}" ${value === state.devControl ? 'selected' : ''}>${label}</option>`;
  $('dev-control-select').innerHTML = [
    ctl('all', t('filterAll')), ctl('externo', t('controlExterno')),
    ctl('interno', t('controlInterno')), ctl('none', t('controlNone')),
  ].join('');
}

function renderDevelopments() {
  const now = new Date();
  const list = sortDevelopments(state.developments
    .filter((d) => isActiveInMonth(d, state.devMonth, TZ))
    .filter((d) => matchesControl(d, state.devControl)));
  const open = list.filter((d) => d.status !== 'entregue');
  const late = open.filter((d) => d.dueDate && asDate(d.dueDate) < now);
  const kpis = [
    [list.length, t('devKpiTotal')],
    [open.length, t('devKpiOpen')],
    [list.length - open.length, t('devKpiDelivered')],
    [late.length, t('devKpiLate')],
  ];
  $('dev-kpis').innerHTML = kpis
    .map(([num, label]) => `<div class="kpi"><div class="num">${num}</div><div class="label">${label}</div></div>`)
    .join('');

  const heads = [t('colNum'), t('colId'), t('colTitle'), t('colStatus'), t('colAssignees'), t('colReported'), t('colDue'), t('colDelivered')];
  $('dev-head').innerHTML = heads.map((h) => `<th>${h}</th>`).join('');
  $('dev-body').innerHTML = list.map((d, idx) => {
    const isLate = d.status !== 'entregue' && d.dueDate && asDate(d.dueDate) < now;
    const badge = d.status === 'entregue'
      ? `<span class="badge b-done">${t('devDelivered')}</span>`
      : `<span class="badge b-open">${t('statusOpen')}</span>`;
    const id = d.clickupUrl
      ? `<a class="card-link" href="${esc(d.clickupUrl)}" target="_blank" rel="noopener">${esc(d.customId || 'ClickUp')}</a>`
      : esc(d.customId || '');
    return `<tr>
      <td>${idx + 1}</td>
      <td>${id}</td>
      <td>${esc(d.title)}<br><span class="muted">${t(d.control === 'externo' ? 'controlExterno' : d.control === 'interno' ? 'controlInterno' : 'controlNone')}</span></td>
      <td>${badge}${d.statusDetail ? `<br><span class="muted">${esc(d.statusDetail)}</span>` : ''}</td>
      <td>${esc((d.assignees || []).join(', '))}</td>
      <td>${fmtDate(d.createdAt) || ''}</td>
      <td>${d.dueDate ? `<span class="${isLate ? 'late' : ''}">${fmtDate(d.dueDate)}</span>` : `<span class="pending-cell">${t('noDue')}</span>`}</td>
      <td>${fmtDate(d.deliveredAt) || ''}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="pending-cell">${t('devEmpty')}</td></tr>`;
}

// Troca entre a visão de incidentes (com mês e filtros) e a de desenvolvimentos,
// que tem só o filtro de mês próprio (padrão: todos os meses desde jul/2026).
function toggleSections(isDev) {
  $('incident-section').hidden = isDev;
  $('dev-section').hidden = !isDev;
  for (const el of document.querySelectorAll('.incident-filter')) el.hidden = isDev;
  for (const el of document.querySelectorAll('.dev-filter')) el.hidden = !isDev;
}

function render() {
  applyStaticTexts();
  renderClientPicker();
  renderTabs();
  const isDev = state.tab === 'desarrollos';
  toggleSections(isDev);
  if (isDev) {
    renderDevMonths();
    $('header-sub').textContent = state.devMonth === ALL_MONTHS
      ? t('devSubtitle')
      : `${monthLabel(state.devMonth)} • ${t('devSubtitle')}`;
    renderDevelopments();
    renderLastSync();
    return;
  }
  renderMonths();
  const monthList = filterByTab(
    state.incidents.filter((i) => i.month === state.month),
    state.tab
  ).sort((a, b) => (asDate(a.reportedAt) || 0) - (asDate(b.reportedAt) || 0));
  renderFilters(monthList);
  const list = monthList
    .filter((i) => state.filterStatus === 'all' || i.status === state.filterStatus)
    .filter((i) => state.filterReporter === 'all' || i.reportedBy === state.filterReporter);
  $('header-sub').textContent = `${monthLabel(state.month)} • ${t('subtitle')}`;
  renderKpis(monthList);
  renderSlaBySeverity(monthList);
  renderTable(list);
  renderDetails(list);
  renderLastSync();
}

// O agendamento do GitHub Actions é best-effort e às vezes atrasa horas. Sem
// esse aviso a leitura natural de um card que falta é "o painel perdeu o
// card", quando na verdade é "o painel ainda não rodou". Marca como atrasado
// a partir de 90 minutos, que é o dobro do intervalo normal de 30.
const STALE_AFTER_MS = 90 * 60 * 1000;

function renderLastSync() {
  const el = $('last-sync');
  if (!state.lastSync) {
    el.textContent = '';
    el.classList.remove('stale');
    return;
  }
  const quando = new Intl.DateTimeFormat(state.lang === 'es' ? 'es-CO' : 'pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(state.lastSync);
  const atrasado = Date.now() - state.lastSync.getTime() > STALE_AFTER_MS;
  el.textContent = `${t('lastSync')}: ${quando}${atrasado ? ` (${t('stale')})` : ''}`;
  el.classList.toggle('stale', atrasado);
}

// Quem é da B2List vê todos os clientes; convidado externo vê só os que
// estiverem no campo `clients` do seu documento da allowlist. As security
// rules aplicam a mesma regra no servidor: isto aqui é só pra montar a tela.
async function resolveAllowedClients(user) {
  const all = await resolveAllClients(user);
  // No endereço de um site, os clientes de fora dele não existem, nem pra
  // quem é da B2List: evita abrir o link da Minerva e ver dado da P&G sem
  // perceber. A ordem é a do site, pra visão do grupo abrir primeiro.
  if (PINNED_SITE) return PINNED_SITE.clients.filter((id) => all.includes(id));
  return all;
}

async function resolveAllClients(user) {
  if (state.isB2list) return CLIENTS.map((c) => c.id);

  // E-mail do domínio do cliente já entra, sem precisar de allowlist.
  const porDominio = clientsByEmail(user.email);
  if (porDominio.length) return porDominio;
  try {
    const snap = await getDoc(doc(db, 'allowlist', (user.email || '').toLowerCase()));
    const ids = snap.exists() ? snap.data().clients : null;
    return Array.isArray(ids) ? CLIENTS.filter((c) => ids.includes(c.id)).map((c) => c.id) : [];
  } catch {
    return [];
  }
}

function loadDemoData() {
  state.isB2list = true;
  const ids = Object.keys(DEMO_DATA);
  state.allowedClients = PINNED_SITE ? PINNED_SITE.clients.filter((id) => ids.includes(id)) : ids;
  if (!state.allowedClients.includes(state.client)) state.client = state.allowedClients[0];
  const data = DEMO_DATA[state.client];
  state.incidents = data.incidents;
  state.developments = data.developments;
  state.lastSync = asDate(DEMO_LAST_SYNC);
  state.month = null;
}

async function loadData(user) {
  if (DEMO) {
    loadDemoData();
    return;
  }
  state.isB2list = (user.email || '').toLowerCase().endsWith('@b2list.com');
  state.allowedClients = await resolveAllowedClients(user);
  if (state.allowedClients.length === 0) {
    const err = new Error('sem cliente liberado');
    err.code = 'permission-denied';
    throw err;
  }
  if (!state.allowedClients.includes(state.client)) {
    state.client = state.allowedClients[0];
  }

  const base = collection(db, 'clients', state.client, 'incidents');
  const snap = await getDocs(base);
  state.incidents = snap.docs.map((d) => d.data());
  const sync = await getDoc(doc(db, 'clients', state.client, 'meta', 'sync'));
  state.lastSync = sync.exists() ? asDate(sync.data().lastRunAt) : null;
  // Desenvolvimentos ficam em internal/, que só a B2List lê. Falha aqui (regra
  // ainda não publicada, coleção vazia) não pode derrubar o painel de incidentes.
  state.developments = [];
  if (canSeeDevelopments()) {
    try {
      const devSnap = await getDocs(collection(db, 'internal', state.client, 'developments'));
      state.developments = devSnap.docs.map((d) => d.data());
    } catch (err) {
      console.warn('Sem acesso aos desenvolvimentos:', err.code || err);
    }
  }
  // Cada cliente tem seus próprios meses; não dá pra manter o do anterior.
  state.month = null;
}

// Só aparece pra quem tem mais de um cliente liberado. Num site de cliente
// único isso nunca acontece; no do Grupo Vila é o seletor das quatro visões.
function renderClientPicker() {
  const picker = $('client-picker');
  picker.hidden = state.allowedClients.length < 2;
  $('client-select').innerHTML = state.allowedClients
    .map((id) => clientById(id))
    .filter(Boolean)
    .map((c) => `<option value="${c.id}" ${c.id === state.client ? 'selected' : ''}>${esc(c.name)}</option>`)
    .join('');

  applyClientBranding();
}

// Eventos
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').hidden = true;
  try {
    if (!auth) throw initError || new Error('Firebase não inicializado');
    await signInWithEmailAndPassword(auth, $('login-email').value.trim(), $('login-password').value);
  } catch {
    $('login-error').textContent = t('loginError');
    $('login-error').hidden = false;
  }
});
$('btn-google').addEventListener('click', async () => {
  $('login-error').hidden = true;
  try {
    if (!auth) throw initError || new Error('Firebase não inicializado');
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err && (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request')) return;
    $('login-error').textContent = t('loginError');
    $('login-error').hidden = false;
  }
});
$('btn-signout').addEventListener('click', () => signOut(auth));
if (DEMO) $('btn-signout').hidden = true;
$('noaccess-signout').addEventListener('click', () => signOut(auth));
$('btn-pdf').addEventListener('click', () => window.print());
$('btn-lang').addEventListener('click', () => {
  state.lang = state.lang === 'es' ? 'pt' : 'es';
  localStorage.setItem('lang', state.lang);
  render();
});
$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  render();
});
// Trocar de cliente recarrega os dados: cada um vive na sua própria coleção.
$('client-select').addEventListener('change', async (e) => {
  state.client = e.target.value;
  localStorage.setItem('client', state.client);
  show('view-loading');
  try {
    await loadData(auth?.currentUser);
    render();
    show('view-app');
  } catch (err) {
    console.error(err);
    show('view-noaccess');
  }
});

$('month-select').addEventListener('change', (e) => {
  state.month = e.target.value;
  render();
});
$('dev-month-select').addEventListener('change', (e) => {
  state.devMonth = e.target.value;
  render();
});
$('dev-control-select').addEventListener('change', (e) => {
  state.devControl = e.target.value;
  render();
});
$('status-select').addEventListener('change', (e) => {
  state.filterStatus = e.target.value;
  render();
});
$('reporter-select').addEventListener('change', (e) => {
  state.filterReporter = e.target.value;
  render();
});

function showDemoBanner() {
  const banner = document.createElement('p');
  banner.className = 'demo-banner';
  banner.textContent = 'Demonstração com dados fictícios · Demostración con datos ficticios';
  $('view-app').prepend(banner);
}

// Se o estado de auth não chegar (config vazia, rede fora), não deixa a tela presa no "Cargando".
let authResolved = DEMO;
setTimeout(() => {
  if (!authResolved) {
    applyStaticTexts();
    show('view-login');
  }
}, 5000);

if (DEMO) {
  showDemoBanner();
  loadDemoData();
  render();
  show('view-app');
} else if (!auth) {
  applyStaticTexts();
  show('view-login');
} else onAuthStateChanged(auth, async (user) => {
  authResolved = true;
  if (!user) {
    applyStaticTexts();
    show('view-login');
    return;
  }
  show('view-loading');
  try {
    await loadData(user);
    render();
    show('view-app');
  } catch (err) {
    // Sem permissão de leitura significa e-mail fora da allowlist.
    if (err && err.code === 'permission-denied') {
      applyStaticTexts();
      show('view-noaccess');
    } else {
      console.error(err);
      applyStaticTexts();
      show('view-noaccess');
    }
  }
});

applyStaticTexts();
