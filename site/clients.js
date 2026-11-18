// Clientes que o painel atende. Precisa espelhar sync/clients.js: o `id` aqui
// é o mesmo que nomeia a coleção `clients/<id>/incidents` no Firestore.
// Cliente novo entra aqui e lá, sem código novo.
export const CLIENTS = [
  {
    id: 'pg',
    name: 'P&G LATAM',
    logo: null,
    logoClass: null,
    // Na versão pública, nenhum cliente leva logo: o painel mostra o nome.
    productLogo: null,
    // Aba Desarrollos (board de PS). Só aparece para e-mail da B2List; quem
    // decide de verdade é firestore.rules (coleção internal/).
    developments: true,
  },
  {
    id: 'minerva',
    // Só a operação da Argentina; a Minerva Brasil é outro contrato.
    name: 'Minerva Argentina',
    logo: null,
    logoClass: null,
    productLogo: null,
    // Quem tem e-mail da Minerva entra direto, sem passar pela allowlist.
    // Precisa bater com isClientDomain() em firestore.rules, que é quem manda.
    domains: ['minervafoods.com'],
  },

  // Grupo Vila. Sem `domains` de propósito: o acesso é só de quem tem e-mail
  // da B2List mais a allowlist nominal (definido por mim em 03/09), então
  // ninguém entra por ter e-mail da empresa. Logos entram quando chegarem; até
  // lá o painel mostra o nome do cliente sem imagem, em vez de imagem quebrada.
  { id: 'grupovila', name: 'Grupo Vila', logo: null, logoClass: null, productLogo: null },
  { id: 'vilanova', name: 'Vila Nova', logo: null, logoClass: null, productLogo: null },
  { id: 'focomixfarma', name: 'Focomix Farma', logo: null, logoClass: null, productLogo: null },
  { id: 'focomix', name: 'Focomix', logo: null, logoClass: null, productLogo: null },

  // DSL. Mesmo acesso do Grupo Vila: e-mail da B2List mais allowlist nominal,
  // sem liberação por domínio (definido por mim em 16/10).
  { id: 'dsl', name: 'DSL', logo: null, logoClass: null, productLogo: null },
];

export const DEFAULT_CLIENT = 'pg';

// Cada endereço serve um conjunto de clientes, e o primeiro da lista é o que
// abre por padrão. Todos os sites servem exatamente os mesmos arquivos; quem
// decide o que aparece é o domínio pelo qual a página foi aberta. Isso importa porque o time da Minerva acessa o painel dele direto e
// não pode cair no da P&G nem por engano.
//
// O Grupo Vila é o primeiro site com mais de um cliente: a gestão de contas pediu uma
// tela por empresa mais uma somada do grupo, e como é tudo o mesmo cliente
// eles ficam num link só, com seletor na tela, em vez de quatro endereços.
export const SITES = [
  { hosts: ['pg-incidentes.example.com'], clients: ['pg'] },
  { hosts: ['minerva-incidentes.example.com'], clients: ['minerva'] },
  {
    hosts: ['grupovila-incidentes.example.com'],
    clients: ['grupovila', 'vilanova', 'focomixfarma', 'focomix'],
  },
  // A DSL é brasileira: o painel abre em português. O botão de idioma segue
  // funcionando, e a escolha da pessoa vale mais que este padrão.
  { hosts: ['dsl-incidentes.example.com'], clients: ['dsl'], lang: 'pt' },
];

export function clientById(id) {
  return CLIENTS.find((c) => c.id === id) || null;
}

// Clientes que o domínio do e-mail libera sozinho.
export function clientsByEmail(email) {
  const dom = String(email || '').toLowerCase().split('@')[1];
  if (!dom) return [];
  return CLIENTS.filter((c) => (c.domains || []).includes(dom)).map((c) => c.id);
}

// Site fixado pelo endereço, ou null quando o domínio não é de nenhum site
// (localhost, preview channel). Aí o painel volta a deixar escolher entre
// tudo que a pessoa pode ver.
export function siteByHost(hostname = window.location.hostname) {
  const host = (hostname || '').toLowerCase();
  return SITES.find((s) => s.hosts.includes(host)) || null;
}
