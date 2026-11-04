# Futbobo — seis futuros jogáveis

Exploração de produto em `/conceitos/`. Base: `origin/main` em 4d54414. As rotas não substituem o jogo e usam apenas dados demonstrativos, armazenados em `futbobo:concept-lab:v1`.

## Intenção comum

Público inferido do README e do produto: brasileiros que gostam de futebol, narrativas emergentes e sessões rápidas no celular. A tarefa é retomar uma carreira, entender o conflito e decidir com consequências claras. Não transformar a carreira em uma planilha. As seis propostas mudam a arquitetura e a expressão, preservando a rapidez.

Domínio: túnel, campinho, camisa 10, coletiva, manchete, proposta do empresário, confiança do treinador, temporada, sala de troféus, fita de videogame. Cores do mundo: verde do campo, cal branco, azul da quadra, laranja do pôr do sol, papel de jornal, ouro das taças, preto do túnel.

Defaults rejeitados: seis skins da mesma estrutura; hero de marketing que esconde Jogar; dashboards com métricas sem relação com a decisão. Alternativas: seis composições próprias; retomada como ação principal; dados e consequências junto da escolha.

## 01 — Holofote

Intent: retornar ao estádio com a emoção de um filme esportivo, decidir com clareza.
Hierarchy: menu tipográfico enorme e retomada lime; gameplay em palco dividido, narrativa à esquerda e decisões à direita.
Palette: túnel #0c100d, cal #f2f2e9, sinal #d5fc55; fotografia noturna.
Depth/surfaces: plano escuro, arte fotográfica e uma superfície #171d16; bordas discretas.
Typography: Barlow Condensed 900 em escala 1.333; Manrope nas decisões.
Spacing: base 4px, margens 32px desktop / 20px mobile; escolhas mínimas 68px.
Signature: camisa 10 recortada pela luz, régua de capítulos e decisões numeradas de transmissão.

## 02 — Resenha

Intent: experimentar uma carreira com a espontaneidade e a personalidade do futebol de bairro.
Hierarchy: grande ingresso azul de continuar; menu como mural assimétrico; gameplay como conversa com o empresário junto de bilhetes de resposta.
Palette: manteiga #fff5d8, quadra #254ada, laranja #ff6b35; tinta #1e2c57.
Depth/surfaces: papel, cantos arredondados e sombras de tinta curtas; creme sobre creme.
Typography: Manrope 800 com tracking apertado, Barlow nos adesivos.
Spacing: base 4px; 24px entre grupos e 16px internos; escolhas 72px.
Signature: ingressos, rabiscos, recados e um campinho ilustrado.

## 03 — Primeira Página

Intent: viver uma carreira como notícia; escolher qual será a manchete de amanhã.
Hierarchy: masthead de jornal, manchete serifada, fotografia editorial; gameplay com três chamadas de capa como respostas.
Palette: jornal #eeeadd, tinta #22251e, vermelho editorial #bd3f31.
Depth/surfaces: planos de papel e filetes finos; nenhuma sombra decorativa.
Typography: Georgia para títulos, Manrope para leitura, Courier para edição e números.
Spacing: base 4px; colunas editoriais com 24px de respiro; corpo 15px/1.6.
Signature: edição muda com o capítulo; resultado vira nova manchete e arquivo de decisões.

## 04 — Legado

Intent: dar peso às decisões e fazer o jogador imaginar a carreira que vai deixar.
Hierarchy: composição de museu com grande número e objeto dourado; gameplay como capítulo de um arquivo pessoal com decisão central.
Palette: mata #102b24, marfim #ede6cf, latão #d3b879.
Depth/surfaces: bases tonais verdes, linhas de latão discretas e luz apenas na arte.
Typography: Georgia em itálico nas frases, Barlow nos números, Manrope na navegação.
Spacing: base 4px; áreas generosas de 32px e escolhas de 76px.
Signature: monograma, arquivo de temporadas, índice de capítulos e selo circular de carreira.

## 05 — Fita 98

Intent: oferecer imediatismo de videogame e nostalgia sem dificultar a leitura.
Hierarchy: console dividido em campo e menu; gameplay como diálogo de RPG com comandos grandes.
Palette: gabinete #211d3b, visor #f0e8ce, campo #526c48, laranja #ffa24a.
Depth/surfaces: moldura física do console e camadas chapadas; scanlines opcionais.
Typography: Courier New em pesos fortes; títulos condensados e letras desenhadas em CSS.
Spacing: base 4px/8px; comandos mínimos 48px; movimento reduzido suportado.
Signature: campo pixelado em SVG nativo, placar, cartucho e contador de capítulos.

## 06 — Próximo Lance

Intent: jogador no celular resolve a próxima decisão em poucos toques, com contexto sob demanda.
Hierarchy: menu com continuidade e agenda; gameplay com uma carta principal, indicador de risco e escolhas ao alcance do polegar.
Palette: giz #f7f7f1, azul #264de4, tinta #20293b e verde semântico.
Depth/surfaces: superfícies brancas, contornos suaves e sombra apenas na carta ativa.
Typography: Manrope, escala 1.25; números grandes apenas onde representam progresso.
Spacing: base 4px; 20px mobile / 32px desktop; 12px entre escolhas.
Signature: trilha vertical de carreira, ponteiro de próximo passo e barras de contexto compactas.

## Contrato de interação

- Menu e decisões navegáveis em todos os conceitos.
- Três eventos com três alternativas, prévia de efeitos, confirmação, consequência e conclusão da minicarreira.
- Retomada e histórico persistidos por conceito, sem acesso às chaves reais do Futbobo.
- Nova carreira demonstra nome próprio; configurações, arquivo e ficha abrem diálogos nativos acessíveis.
- Atalhos 1/2/3, Enter e Escape; foco visível, touch targets, redução de movimento.
- Rotas Next exportáveis estaticamente; arte e fontes locais; sem dependências novas.

## Artes

Três artes originais produzidas pela ferramenta integrada ImageGen: estádio noturno com camisa 10; quadra brasileira em ilustração editorial; bola dourada em museu verde. WebP em `public/concept-art/`. Prompts completos em `docs/concept-art-prompts.json`.

## Avaliação

1. Abra `/conceitos/` e entre em uma direção.
2. Alterne entre **Menu inicial** e **Tela de escolhas**. Use **Celular** para limitar a largura a 414px no desktop.
3. Selecione uma resposta para comparar seus efeitos e confirme. A consequência recebe foco para continuar legível depois da rolagem.
4. Explore o histórico, a ficha, uma nova carreira e os ajustes de movimento e texto.
5. Compare as seis direções com o mesmo cenário. Os links para os modos completos abrem o domínio oficial do Futbobo.

## Verificação

- Build de produção Next e TypeScript aprovados; sete novas rotas estáticas.
- 114 testes aprovados, incluindo os 27 caminhos da demonstração, recuperação de dados corrompidos e limites de atributos.
- Fluxos das seis interfaces exercitados em DOM simulado (JSDOM em instalação externa ao repositório): menu, três capítulos, clube após empréstimo, prévia e aplicação dos efeitos, confirmação dupla, conclusão, histórico, nova carreira, prévia de celular, retomada, isolamento dos saves reais, diálogo do conceito, teclado e ajustes.
- Limite da verificação: o controle do navegador foi bloqueado pelo ambiente. DOM simulado não verifica layout, contraste renderizado, foco nativo de dialog ou comportamento de um aparelho real. A revisão visual em desktop e celular permanece necessária.
- Sem dependências de runtime adicionais. Tipografia e arte são locais; CSS encapsulado em módulo.
