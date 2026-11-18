// Estas regras decidem quem vê o painel de qual cliente. A palavra final é do
// firestore.rules, mas um erro aqui já mostraria dado errado na tela, então
// vale travar o comportamento.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIENTS, SITES, clientById, siteByHost, clientsByEmail } from './clients.js';

test('e-mail da Minerva libera só o painel da Minerva', () => {
  assert.deepEqual(clientsByEmail('fulano@minervafoods.com'), ['minerva']);
  assert.deepEqual(clientsByEmail('FULANO@MinervaFoods.COM'), ['minerva']);
});

test('e-mail de fora não libera cliente nenhum', () => {
  for (const email of [
    'alguem@gmail.com',
    'contato@agencia-exemplo.com',
    '',
    null,
    undefined,
    'sem-arroba',
  ]) {
    assert.deepEqual(clientsByEmail(email), [], String(email));
  }
});

test('domínio parecido não passa', () => {
  // Sufixo e prefixo têm que ser exatos, senão qualquer um registra o domínio.
  for (const email of [
    'x@minervafoods.com.br',
    'x@fakeminervafoods.com',
    'x@minervafoods.co',
    'x@sub.minervafoods.com',
  ]) {
    assert.deepEqual(clientsByEmail(email), [], email);
  }
});

test('a P&G não tem liberação por domínio: o acesso dela é sob aval', () => {
  assert.equal(clientById('pg').domains, undefined);
  assert.deepEqual(clientsByEmail('alguem@pg.com'), []);
});

// Definido por mim em 03/09: no Grupo Vila só entra quem é da B2List ou
// está na allowlist nominal. Liberar por domínio aqui abriria o painel pra
// empresa inteira sem ninguém aprovar.
test('nenhuma empresa do Grupo Vila libera por domínio', () => {
  for (const id of ['grupovila', 'vilanova', 'focomixfarma', 'focomix']) {
    assert.equal(clientById(id).domains, undefined, id);
  }
});

test('cada endereço aponta pra um site só', () => {
  assert.deepEqual(siteByHost('pg-incidentes.example.com').clients, ['pg']);
  assert.deepEqual(siteByHost('minerva-incidentes.example.com').clients, ['minerva']);
  assert.deepEqual(siteByHost('MINERVA-INCIDENTES.EXAMPLE.COM').clients, ['minerva']);
  assert.equal(siteByHost('localhost'), null);

  const hosts = SITES.flatMap((s) => s.hosts);
  assert.equal(new Set(hosts).size, hosts.length, 'endereço repetido entre sites');
});

// O link do Grupo Vila é o primeiro a servir mais de um cliente. A visão
// somada vem primeiro porque é a que abre por padrão.
test('o endereço do Grupo Vila serve as quatro visões, começando pela do grupo', () => {
  const site = siteByHost('grupovila-incidentes.example.com');
  assert.deepEqual(site.clients, ['grupovila', 'vilanova', 'focomixfarma', 'focomix']);
});

test('nenhum site vaza cliente de outro', () => {
  // O que sustenta o isolamento na tela: abrir o link de um site nunca pode
  // deixar escolher um cliente que não seja dele.
  const pg = siteByHost('pg-incidentes.example.com');
  const vila = siteByHost('grupovila-incidentes.example.com');
  assert.equal(pg.clients.includes('minerva'), false);
  assert.equal(vila.clients.includes('pg'), false);
  assert.equal(vila.clients.includes('minerva'), false);
});

test('todo cliente citado num site existe no registro', () => {
  for (const site of SITES) {
    for (const id of site.clients) {
      assert.ok(clientById(id), `site ${site.hosts[0]} cita cliente inexistente: ${id}`);
    }
  }
});

test('todo cliente do registro é alcançável por algum endereço', () => {
  // Cliente sem site é dado sincronizado que ninguém consegue abrir.
  const servidos = new Set(SITES.flatMap((s) => s.clients));
  for (const c of CLIENTS) {
    assert.ok(servidos.has(c.id), `cliente sem endereço: ${c.id}`);
  }
});

test('o painel da DSL abre em português e só serve a DSL', () => {
  const site = siteByHost('dsl-incidentes.example.com');
  assert.deepEqual(site.clients, ['dsl']);
  assert.equal(site.lang, 'pt');
  // Os sites que já existiam seguem abrindo em espanhol.
  assert.equal(siteByHost('pg-incidentes.example.com').lang, undefined);
});

test('a DSL não tem liberação por domínio', () => {
  assert.equal(clientById('dsl').domains, undefined);
});
