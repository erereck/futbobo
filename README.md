# Futbobo

Um jogo rápido de carreira no futebol, feito primeiro para celular. Você começa aos 12 anos, escolhe posição e foco de formação, é revelado entre 16 e 18 e constrói uma carreira que pode atravessar as Américas e a Europa.

## Rodar localmente

Requer Node.js 24 ou superior.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Laboratório Monte Carlo

O jogo possui um simulador headless para medir o balanceamento de carreiras completas. Com o servidor local aberto, use:

```text
http://localhost:3000/?montecarlo=100&seed=20260723
```

O parâmetro `montecarlo` define a quantidade de carreiras e `seed` torna o lote reproduzível. O simulador reutiliza os eventos, a evolução, o mercado, as transferências e as regras de premiação do jogo.

## Verificações

```bash
npm run lint
npm test
```

O projeto usa Next.js com exportação estática e é publicado automaticamente no GitHub Pages a cada push na branch `main`.

## Conteúdo desta demo

- Categorias de base dos 12 aos 16–18 anos.
- 12 posições e quatro caminhos de formação.
- 332 clubes de 17 ligas completas, com escudos reais e fallback visual gerado em CSS.
- Dezenas de eventos de carreira, evolução, transferências, Seleção, lesões e aposentadoria.
- Brasileirão, Copa do Brasil, Libertadores e Mundial de Clubes.
- Pedido de transferência com negociação, chance de recusa e reação da torcida.
- Consequências visíveis para cada decisão antes do resultado da temporada.
- Relação com a torcida, cerimônias de prêmios com finalistas fictícios e sala de troféus.
- Salvamento automático, retrospecto por clube, Hall da Fama local e cartão final compartilhável.

## Onde editar os clubes

Todos os clubes, ligas, países, posições e parâmetros básicos ficam em
[`app/game-data.ts`](app/game-data.ts). Cada clube precisa de `id`, nomes,
abreviação, cidade, país, liga, duas cores, reputação e `strength`.

## Créditos visuais

Os escudos e emblemas de competições são sincronizados pela API do
[TheSportsDB](https://www.thesportsdb.com/) e usados sem alteração. As
bandeiras são fornecidas pelo [FlagCDN](https://flagcdn.com/). As marcas e os
escudos pertencem aos seus respectivos titulares.
