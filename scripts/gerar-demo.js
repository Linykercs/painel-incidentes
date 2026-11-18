// Gera site/demo-data.js: incidentes e desenvolvimentos FICTÍCIOS para o modo
// demonstração. Nenhum dado aqui vem do ClickUp: títulos, nomes e datas são
// inventados, e o gerador é determinístico (mesma saída a cada execução).
//
// Os prazos usam a mesma regra do sync (sync/sla.js): horas úteis de segunda a
// sexta, 08h às 18h de Brasília, com o prazo de cada severidade.
//
// Uso: node scripts/gerar-demo.js

import { writeFileSync } from 'node:fs';
import { addBusinessHours, SLA_HOURS } from '../sync/sla.js';

// PRNG simples e determinístico (mulberry32).
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261118);
const pick = (list) => list[Math.floor(rand() * list.length)];

const TITULOS = [
  ['Pedido não integrou com o ERP', 'Pedido no integró con el ERP'],
  ['Vendedor sem acesso ao app após troca de senha', 'Vendedor sin acceso a la app tras cambio de contraseña'],
  ['Preço divergente entre app e tabela', 'Precio distinto entre la app y la tabla'],
  ['Lista de produtos não carrega no catálogo', 'La lista de productos no carga en el catálogo'],
  ['Desconto da campanha não aplicado no carrinho', 'Descuento de la campaña no aplicado en el carrito'],
  ['Relatório de visitas com dias faltando', 'Informe de visitas con días faltantes'],
  ['Imagem de produto quebrada', 'Imagen de producto rota'],
  ['Erro ao fechar pedido no checkout', 'Error al cerrar el pedido en el checkout'],
  ['Cliente novo não aparece para o vendedor', 'Cliente nuevo no aparece para el vendedor'],
  ['Notificação de pedido não enviada', 'Notificación de pedido no enviada'],
];
const SOLICITACOES = [
  ['Cadastrar novos vendedores da região sul', 'Registrar nuevos vendedores de la región sur'],
  ['Atualizar tabela de preços do mês', 'Actualizar la tabla de precios del mes'],
  ['Exportar pedidos do trimestre', 'Exportar pedidos del trimestre'],
  ['Ajustar mensagem de boas-vindas do app', 'Ajustar el mensaje de bienvenida de la app'],
];
const AREAS = ['App', 'Painel web', 'Integração', 'Catálogo', 'Checkout'];
const PESSOAS = ['Ana Souza', 'Carlos Lima', 'Juliana Rocha', 'Marcos Prado'];
const MESES = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const AGORA = new Date('2026-11-18T12:00:00-03:00');

function dataNoMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  const ultimoDia = mes === '2026-11' ? 14 : 28;
  const dia = 1 + Math.floor(rand() * ultimoDia);
  const hora = 7 + Math.floor(rand() * 13);
  return new Date(Date.UTC(y, m - 1, dia, hora + 3, Math.floor(rand() * 60)));
}

function severidade() {
  const r = rand();
  if (r < 0.1) return 'S1';
  if (r < 0.35) return 'S2';
  if (r < 0.75) return 'S3';
  return 'S4';
}

let seq = 1;
function incidente({ source, type, titulos, mes }) {
  const sev = severidade();
  const reportedAt = dataNoMes(mes);
  const deadline = addBusinessHours(reportedAt, SLA_HOURS[sev]);
  // Maioria dentro do prazo, uma parte estoura: é o que o painel existe para mostrar.
  const fator = rand() < 0.8 ? 0.2 + rand() * 0.7 : 1.1 + rand() * 0.8;
  const horas = Math.round(SLA_HOURS[sev] * fator * 10) / 10;
  const concluded = addBusinessHours(reportedAt, horas);
  const aberto = concluded > AGORA || (mes === '2026-11' && rand() < 0.3);
  const [pt, es] = titulos;
  return {
    id: `demo-${seq++}`,
    source,
    title: pt,
    titleEs: es,
    failureArea: source === 'infra' || rand() < 0.6 ? pick(AREAS) : null,
    resolutionHours: aberto ? null : horas,
    type,
    severity: sev,
    severityInferred: source === 'infra',
    reportedAt: reportedAt.toISOString(),
    reportedBy: source === 'atendimento' ? pick(PESSOAS) : null,
    deadline: deadline.toISOString(),
    deadlineSource: 'sla',
    concludedAt: aberto ? null : concluded.toISOString(),
    status: aberto ? 'em_andamento' : 'concluido',
    statusDetail: aberto ? pick(['em análise', 'em desenvolvimento', 'aguardando cliente']) : 'concluído',
    summary: null,
    month: mes,
    clickupUrl: null,
    pending: [],
  };
}

function incidentesDoCliente(porMes) {
  const lista = [];
  for (const mes of MESES) {
    for (let i = 0; i < porMes; i++) {
      const r = rand();
      if (r < 0.45) lista.push(incidente({ source: 'infra', type: 'issue', titulos: pick(TITULOS), mes }));
      else if (r < 0.75) lista.push(incidente({ source: 'atendimento', type: 'issue', titulos: pick(TITULOS), mes }));
      else lista.push(incidente({ source: 'atendimento', type: 'solicitud', titulos: pick(SOLICITACOES), mes }));
    }
  }
  return lista;
}

function desenvolvimentos() {
  const titulos = [
    'Novo filtro de clientes por região', 'Exportação de pedidos em CSV',
    'Tela de metas do vendedor', 'Integração de estoque em tempo real',
    'Reenvio automático de pedido com falha', 'Painel de cobertura por rota',
  ];
  return titulos.map((title, i) => {
    const createdAt = dataNoMes(MESES[Math.min(i, MESES.length - 1)]);
    const entregue = i < 3;
    const deliveredAt = entregue ? addBusinessHours(createdAt, 80 + Math.floor(rand() * 120)) : null;
    return {
      id: `dev-${i + 1}`,
      customId: `DEV-${100 + i}`,
      title,
      status: entregue ? 'entregue' : 'em_andamento',
      statusDetail: entregue ? 'entregue' : pick(['em desenvolvimento', 'em homologação']),
      control: i % 2 ? 'interno' : 'externo',
      assignees: [pick(PESSOAS)],
      createdAt: createdAt.toISOString(),
      dueDate: addBusinessHours(createdAt, 200).toISOString(),
      deliveredAt: deliveredAt ? deliveredAt.toISOString() : null,
    };
  });
}

const DADOS = {
  pg: { incidents: incidentesDoCliente(9), developments: desenvolvimentos() },
  minerva: { incidents: incidentesDoCliente(6), developments: [] },
  dsl: { incidents: incidentesDoCliente(5), developments: [] },
};

const saida = `// GERADO por scripts/gerar-demo.js. Dados fictícios para o modo demonstração.
// Não editar à mão: rode \`node scripts/gerar-demo.js\` de novo.
export const DEMO_LAST_SYNC = '${AGORA.toISOString()}';
export const DEMO_DATA = ${JSON.stringify(DADOS, null, 2)};
`;
writeFileSync(new URL('../site/demo-data.js', import.meta.url), saida);
const total = Object.values(DADOS).reduce((n, c) => n + c.incidents.length, 0);
console.log(`site/demo-data.js: ${total} incidentes fictícios em ${Object.keys(DADOS).length} clientes`);
