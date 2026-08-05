# Futbobo — sistema de interface

## Direção

**Matchday editorial.** O Futbobo deve parecer uma mistura de central de carreira, transmissão esportiva e arquivo de clube. Premium, direto e humano; nunca um dashboard SaaS genérico.

- Pessoa: alguém no celular em uma sessão rápida ou no computador acompanhando/testando uma carreira longa.
- Verbo principal: decidir o próximo capítulo e entender imediatamente o que mudou.
- Sensação: túnel antes do jogo, refletores sobre o gramado e caderno estatístico de uma temporada inteira.
- Assinatura: a faixa de temporada/placar (`season rail`) organiza contexto, ação e progresso como uma transmissão contínua.

## Mundo visual

- **tunnel** `#050b08` — fundo externo.
- **pitch-ink** `#07110d` — canvas do jogo.
- **dugout** `#0b1812` — primeira superfície.
- **tactics-board** `#102219` — segunda superfície.
- **floodlight** `#f2f5ed` — texto principal, branco levemente quente.
- **chalk** `#aab8ac` — texto secundário.
- **referee** `#f4c430` — ação principal e temporada.
- **grass-signal** `#67dd78` — evolução/sucesso.
- **broadcast** `#58a9e8` — informação externa/seleção.
- **card-red** `#ef6258` — risco e falha.

Cor é escassa: o amarelo indica o que fazer ou o que importa agora; verde, azul e vermelho são semânticos.

## Profundidade

Estratégia única: mudanças sutis de superfície + bordas de baixa opacidade. Sombras apenas em overlays e elementos realmente elevados. Nada de glassmorphism ou gradiente ornamental.

- Base: pitch-ink.
- Nível 1: dugout.
- Nível 2: tactics-board.
- Nível 3: `#162b20` para popovers/modais.
- Linha padrão: `rgba(226, 239, 228, .09)`.
- Linha enfatizada: `rgba(226, 239, 228, .16)`.

## Tipografia

- Display e números: **Barlow Condensed**, 700–900. Evoca placar, camisa e imprensa esportiva.
- Interface e leitura: **Manrope**, 400–800. Alta legibilidade em telas pequenas.
- Escala 1.25: 11 / 13 / 16 / 20 / 25 / 31 / 39 / 49.
- Métricas usam `font-variant-numeric: tabular-nums`.
- Hierarquia privilegia peso e cor antes de aumentar tamanho.

## Espaçamento e forma

- Unidade base: 4px.
- Mobile: 12px entre itens, 16px de margem, 20px dentro de seções-chave.
- Desktop: 16px entre módulos, 24–32px dentro de áreas principais.
- Raios: 8px controles, 12px cards, 18px painéis, 24px modais/hero.
- Alvos interativos: mínimo 44px.

## Arquitetura responsiva

- Mobile: cabeçalho compacto persistente; conteúdo vertical; navegação inferior fixa; ação principal próxima do polegar.
- Decisões mobile: mercado, meta, arte e escolhas pertencem ao mesmo fluxo rolável. A carta pode sobrepor visualmente a arte em até 20px, mas nunca usa posicionamento absoluto nem cria uma segunda rolagem.
- Histórico mobile: escudos de títulos são a informação primária; o texto-fallback só aparece quando a imagem não existe e a coleção rola dentro da própria linha.
- Sala de troféus mobile: nomes podem quebrar em duas linhas, com corpo mínimo de 12px e entrelinha de 1.25; densidade nunca vem de comprimir texto.
- Arquivo final desktop: dossiê da carreira + vida pública abrem a leitura; taças conquistadas ocupam uma faixa inteira; história/prêmios e clubes/Hall formam pares assimétricos abaixo. Categorias zeradas não entram na galeria comemorativa.
- Desktop: rail esquerdo de 248–272px com identidade e navegação; contexto do jogador no topo do conteúdo; tela principal em 12 colunas.
- Resultados: placar da temporada no topo, resumo e progressão primeiro; campanhas, dinheiro e prêmios em módulos largos abaixo.
- Telas de dados: hero curto + duas colunas assimétricas, gráficos e arquivo usando a largura disponível.

- Menu desktop: uma cabine de lançamento contida em `100dvh`; em monitores baixos a densidade diminui, nunca a informação nem a legibilidade.
- Futebol de botão desktop: mesa sempre inteira na viewport, proporção `316/516`, largura máxima de 400px e respiro mínimo de 80px acima/abaixo.
- Painéis longos: rolagem pertence ao canvas da direita; galerias nunca usam a altura do card vizinho como limite.

## Componentes recorrentes

- Botão primário — 52px mobile / 48px desktop · raio 10px · Barlow Condensed 18/800 · fundo referee.
- Card de decisão — mínimo 64px · raio 12px · borda sutil · índice/ícone à esquerda · seta à direita.
- Rótulo editorial — Manrope 10/800 · tracking .14em · uppercase · chalk/referee conforme contexto.
- Métrica principal — label 10/700 muted · valor Barlow Condensed 30/800 · numerais tabulares.
- Rail desktop — 264px · mesmo fundo do canvas · uma borda à direita · navegação textual com indicador amarelo.

## Movimento

- Entrada de tela: 220ms, opacity + translateY(8px).
- Hover/press: 140ms; `scale(.98)` no press.
- Overlays: 220ms com `cubic-bezier(.23,1,.32,1)`.
- Nunca `transition: all`; respeitar `prefers-reduced-motion`.
