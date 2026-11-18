// Registro dos clientes atendidos pelo painel. Cada cliente novo entra aqui e
// no site/clients.js, sem código novo.
//
// As duas fontes têm formatos diferentes de identificar o cliente porque o
// ClickUp cresceu assim, e mudar a rotina do time custaria mais que suportar
// os dois jeitos:
//
// - atendimento: a P&G tem uma lista dedicada (tudo que está lá é dela), a
//   Minerva divide a lista geral do CS com todos os outros clientes e se
//   identifica pelo campo de labels "CLIENTES";
// - infra: o board de Incidentes é um só, compartilhado, e cada card se
//   identifica pelo campo de labels "Interno".
//
// `titleRe` é reforço pra P&G, onde o time preenche o título ([P&G LATAM]) com
// muito mais disciplina que o campo. Na Minerva é o contrário: o campo é
// confiável e o título tem 13 variantes ([MINERVAARG], [MINERVA ARG],
// [PROD - MINERVA]...), sendo que "[Minerva]" sozinho às vezes é Minerva
// Brasil, que é outro cliente. Por isso ela não usa título.

export const CLIENTS = {
  pg: {
    id: 'pg',
    name: 'P&G LATAM',
    minMonth: '2026-07',
    alerts: true,
    atendimento: {
      listId: 'ID_LISTA_ATENDIMENTO_PG', // P&G - Plataforma de Atendimento (lista dedicada)
    },
    infra: {
      listId: 'ID_BOARD_INFRA', // Incidentes (Infra/Sustentação)
      internoLabel: 'P&G Latam',
      titleRe: /p&g\s*latam/i,
    },
    // Aba Desarrollos (pedido da gestão de contas em 08/10): cards do board de PS que
    // são da P&G. Só a B2List vê. No board de PS o título varia mais que no de
    // Infra: além de "[P&G LATAM]" aparecem "[P&G]", "[P&G Colombia]" e
    // "[LATAM]". "[P&G+]" fica de fora de propósito: é campanha de outra frente comercial.
    ps: {
      listId: 'ID_BOARD_PS', // PS - Esteira de atividades
      internoLabel: 'P&G Latam',
      titleRe: /p&g\s*latam|p&g\s*col[oô]mbia|\[\s*p&g\s*\]|\[\s*latam\s*\]/i,
      // Desde julho, igual aos incidentes (pedido da gestão de contas em 13/10).
      deliveredSince: '2026-07',
    },
  },

  // Só Minerva ARGENTINA. A Minerva Brasil é outro contrato e não pode
  // aparecer aqui: por isso os filtros usam "Minerva ARG"/"MINERVA ARG" e
  // nunca o título, onde "[Minerva]" sozinho às vezes é a Brasil.
  minerva: {
    id: 'minerva',
    name: 'Minerva Argentina',
    minMonth: '2026-07',
    alerts: false, // combinado em 05/08: sem alerta no Google Chat por enquanto
    atendimento: {
      listId: 'ID_LISTA_ATENDIMENTO_GERAL', // Plataforma de Atendimento Geral (compartilhada)
      clienteLabel: 'MINERVA ARG', // separa de MINERVA BR, que é outro cliente
    },
    infra: {
      listId: 'ID_BOARD_INFRA',
      internoLabel: 'Minerva ARG',
    },
  },

  // Grupo Vila, pedido da gestão de contas em 03/09. São três empresas do mesmo grupo
  // mais uma visão somada. As quatro dividem um endereço só, com seletor na
  // tela, porque é o mesmo cliente e quem abre quer justamente comparar.
  //
  // Diferente da P&G, aqui o título não entra como reforço: o campo "Interno"
  // é preenchido com disciplina (47 cards só no Vila Nova) e os títulos variam
  // demais ([VILANOVA], [VILA NOVA], [MEDICAMENTAL / VILA NOVA / ...]).
  grupovila: {
    id: 'grupovila',
    name: 'Grupo Vila',
    minMonth: '2026-07',
    alerts: false,
    // A visão somada casa com as três labels de uma vez. Card que cita mais de
    // uma empresa do grupo vira um documento só, com o id do card, então não
    // conta duas vezes no total.
    atendimento: {
      listId: 'ID_LISTA_ATENDIMENTO_GERAL',
      clienteLabels: ['VILA NOVA', 'FOCOMIX', 'GRUPO VILA'],
    },
    infra: {
      listId: 'ID_BOARD_INFRA',
      internoLabels: ['Vila Nova', 'FocomixFarma', 'Focomix'],
    },
  },

  vilanova: {
    id: 'vilanova',
    name: 'Vila Nova',
    minMonth: '2026-07',
    alerts: false,
    atendimento: { listId: 'ID_LISTA_ATENDIMENTO_GERAL', clienteLabel: 'VILA NOVA' },
    infra: { listId: 'ID_BOARD_INFRA', internoLabel: 'Vila Nova' },
  },

  // Pendente de definição da gestão de contas (03/09): no board de Infra existem duas
  // labels, "Focomix" e "FocomixFarma", mas a lista de atendimento só tem
  // "FOCOMIX". Enquanto não se confirma se são um ou dois contratos, a
  // FocomixFarma fica só com os incidentes: a label de atendimento aponta pra
  // "FOCOMIXFARMA", que ainda não existe, e casa com zero em vez de roubar os
  // cards que hoje são do Focomix.
  focomixfarma: {
    id: 'focomixfarma',
    name: 'Focomix Farma',
    minMonth: '2026-07',
    alerts: false,
    atendimento: { listId: 'ID_LISTA_ATENDIMENTO_GERAL', clienteLabel: 'FOCOMIXFARMA' },
    infra: { listId: 'ID_BOARD_INFRA', internoLabel: 'FocomixFarma' },
  },

  // Sem nenhum card de Infra desde 07/2026: o painel nasce vazio de propósito,
  // e é isso que a gestão de contas precisa ver pra decidir se o contrato segue ativo.
  focomix: {
    id: 'focomix',
    name: 'Focomix',
    minMonth: '2026-07',
    alerts: false,
    atendimento: { listId: 'ID_LISTA_ATENDIMENTO_GERAL', clienteLabel: 'FOCOMIX' },
    infra: { listId: 'ID_BOARD_INFRA', internoLabel: 'Focomix' },
  },

  // DSL, pedido da gestão de contas em 16/10. A label é "DSL" nas duas listas. A
  // Vestacy aparece junto em alguns cards, mas é a Reckitt, outro cliente, e
  // fica de fora: o casamento é pela label exata, nunca pelo título.
  dsl: {
    id: 'dsl',
    name: 'DSL',
    minMonth: '2026-07',
    alerts: false,
    atendimento: { listId: 'ID_LISTA_ATENDIMENTO_GERAL', clienteLabel: 'DSL' },
    infra: { listId: 'ID_BOARD_INFRA', internoLabel: 'DSL' },
  },
};

// Um cliente pode casar com mais de uma label, caso da visão somada do Grupo
// Vila. Aceita as duas formas pra não precisar mexer no que já está no ar.
export function labelsOf(cfg, singular, plural) {
  const many = cfg?.[plural];
  if (Array.isArray(many)) return many.filter(Boolean);
  return cfg?.[singular] ? [cfg[singular]] : [];
}

export function clientById(id) {
  const client = CLIENTS[id];
  if (!client) {
    throw new Error(
      `Cliente "${id}" não existe. Conhecidos: ${Object.keys(CLIENTS).join(', ')}`
    );
  }
  return client;
}

// Listas distintas a buscar no ClickUp. O board de Incidentes é o mesmo pra
// todo mundo, então sem isso ele seria baixado uma vez por cliente.
export function listIdsToFetch(clients) {
  const ids = new Set();
  for (const c of clients) {
    ids.add(c.atendimento.listId);
    ids.add(c.infra.listId);
    if (c.ps?.listId) ids.add(c.ps.listId);
  }
  return [...ids];
}
