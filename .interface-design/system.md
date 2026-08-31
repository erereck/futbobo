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
- Piso de leitura em telas pequenas: 8px apenas para metadado auxiliar; rótulos operacionais e textos de apoio usam 9px ou mais. Densidade vem do layout, nunca de texto microscópico.

## Arquitetura responsiva

- Mobile: cabeçalho compacto persistente; conteúdo vertical; navegação inferior fixa; ação principal próxima do polegar.
- Decisões mobile: mercado, meta, arte e escolhas pertencem ao mesmo fluxo rolável. A carta pode sobrepor visualmente a arte em até 20px, mas nunca usa posicionamento absoluto nem cria uma segunda rolagem.
- Histórico mobile: escudos de títulos são a informação primária; o texto-fallback só aparece quando a imagem não existe e a coleção rola dentro da própria linha.
- Sala de troféus mobile: nomes podem quebrar em duas linhas, com corpo mínimo de 12px e entrelinha de 1.25; densidade nunca vem de comprimir texto.
- Arquivo final desktop: dossiê da carreira + vida pública abrem a leitura; taças conquistadas ocupam uma faixa inteira; história/prêmios formam o par editorial e o arquivo por clube ocupa uma faixa inteira abaixo. O arquivo usa um rail de camisas e abre um dossiê com totais, honrarias e temporada por temporada; Hall da Fama vem depois, sem disputar foco. Categorias zeradas não entram na galeria comemorativa.
- Compartilhamento: a carreira sai como pôster esportivo 4:5 gerado localmente, com identidade, pico OVR, produção, principais taças, Bola de Ouro, World XI, clubes e legado. Texto rico acompanha a imagem somente como contexto acessível e fallback.
- Ações demoradas: o próprio botão comunica processamento, fica indisponível contra toque duplo e encerra com feedback específico para sucesso, cancelamento ou fallback.
- Desktop: rail esquerdo de 248–272px com identidade e navegação; contexto do jogador no topo do conteúdo; tela principal em 12 colunas.
- Resultados: placar da temporada no topo, resumo e progressão primeiro; campanhas, dinheiro e prêmios em módulos largos abaixo.
- Telas de dados: hero curto + duas colunas assimétricas, gráficos e arquivo usando a largura disponível.

- Menu inicial: uma central de jogo com duas zonas — `Modo carreira` e `Jogar agora`. Carregar carreira, novo save, desafio diário, Copa e X1 são cinco entradas independentes; nenhum hero pode empurrar ou deformar as demais.
- Menu responsivo: monitor largo usa duas zonas lado a lado; notebook organiza as zonas em faixas horizontais; mobile empilha cartões compactos em uma única coluna. Em telas desktop baixas, a página pode rolar em vez de cortar conteúdo.
- A arte pertence somente ao cartão de carregar carreira e nunca determina a altura da central. A ação principal muda para carregar quando há save e para nova carreira quando o aparelho está vazio.
- Futebol de botão desktop: mesa sempre inteira na viewport, proporção `316/516`, largura máxima de 400px e respiro mínimo de 80px acima/abaixo.
- Futebol de botão horizontal: no desktop, o usuário pode girar a mesa em 90 graus sem alterar regras nem coordenadas do motor. O canvas passa a `516/316` e ocupa todo o palco esquerdo; placar e comandos se empilham num rail lateral de 244–320px. O campo usa simultaneamente a largura e a altura disponíveis e o mesmo controle nunca aparece no mobile.
- Partida ao vivo: campo é sempre o foco; placar/tempo formam a leitura secundária e a pausa abre um intervalo técnico sobre a mesa. Pausar congela relógio, física, CPU, inatividade e linha do tempo do replay. No campo girado, os discos mantêm sua posição, mas números e selo `VC` permanecem orientados para a tela.
- Bola em jogo: a bola é o único foco móvel permanente. Ela mantém o raio físico original e ganha três camadas de leitura — halo quente e muito baixo sobre o feltro, brilho local semitransparente e trilha curta com intensidade crescente na direção do movimento. O mesmo brilho aparece nos replays. Esses efeitos nunca alteram colisão, velocidade ou tamanho percebido e não justificam partículas, rastros nas peças ou iluminação ornamental no modo oficial.
- Painéis longos: rolagem pertence ao canvas da direita; galerias nunca usam a altura do card vizinho como limite.

### Copa instantânea

- O modo Copa é uma experiência descartável e isolada da carreira: seleção + posição entram, campanha e resultado saem, sem escrever no save principal.
- A próxima partida é sempre o foco. A trilha do torneio mostra os três jogos de grupo e os cinco mata-matas como promessa visual de progressão, sem imitar uma planilha de tabela.
- Azul `broadcast` identifica seleção e Copa; amarelo `referee` permanece reservado para a ação imediata e a taça.
- No mobile, a lista de países rola dentro do próprio painel e a chamada para jogar continua visível sem competir com o seletor.

### Duelo local

- A antessala do X1 usa dois cartões de clube rigorosamente espelhados; escudo, seletor e sorteio compartilham as mesmas linhas e larguras nos dois lados.
- Presets de ritmo ficam entre os clubes e a ação de começar. São ajustes descartáveis do X1 e nunca escrevem nas configurações globais.
- Não existe protagonista no X1: nenhum disco recebe selo `VC`, aro amarelo ou tinta especial de jogador da carreira.

### Mesa de decisão mobile

- A aba Carreira/decisão é a única tela de conteúdo que não rola: cabeçalho, quatro barras, contrato, mercado, meta, capítulo e opções cabem juntos em `100dvh`.
- O HUD é estrutural, não `sticky`: ocupa linhas fixas do shell; o capítulo recebe o restante por `minmax(0,1fr)` e reduz densidade em aparelhos de até 700px de altura.
- Arte puramente decorativa sai no mobile desta tela para preservar texto e alvos mínimos de 44px. As outras abas e o resultado de temporada continuam roláveis.
- Toda opção de evento ocupa uma linha real de no mínimo 44px; descrição e metadados cedem espaço antes que qualquer escolha seja cortada.
- A meta nunca é truncada ou escondida, inclusive em telas de até 700px de altura. Título e consequência podem quebrar linha dentro de uma faixa de altura natural.
- O capítulo ocupa todo o espaço restante e as escolhas se ancoram na borda inferior do card. O card usa raio externo de 18px; as escolhas, com 8px de respiro interno, usam 10px para manter curvas concêntricas.
- A arte do capítulo não reserva altura no mobile. O card encosta no rodapé com 12px de respiro acima da navegação; títulos usam toda a largura e `text-wrap: pretty`. Em telas baixas, descrição e metadados saem antes dos alvos de escolha de 44px.
- O giro do Mundo dentro da meta é uma fita de placar de 22px: uma manchete por vez, troca vertical a cada 3s e movimento de 280ms. Nunca aumenta a altura do HUD.
- O HUD de decisão usa 12px como ritmo único: margens laterais do capítulo, distância até a navegação e intervalo entre mercado e meta. Descrição do capítulo e pistas das escolhas são informação funcional e nunca desaparecem; telas baixas reduzem tipografia e entrelinha.
- A faixa de status mobile preserva 8px de proteção nas bordas da viewport antes do padding interno das quatro células.
- A criação do jogador no desktop é uma cabine de uma viewport: ficha à esquerda, campo de posições à direita e avanço integrado no rodapé, sempre visível.
- A mesa mobile mede o espaço restante entre placar e comando. O tamanho cheio é padrão; reduzir a mesa é uma escolha explícita e reversível.

### Onboarding internacional

Selecoes sem liga recebem uma rota de base recomendada por confederacao. A recomendacao deve ser visivel, explicada em linguagem narrativa e nunca bloquear a escolha manual de outra liga.

### Zona mista e loja quadrienal

- Entrevistas são overlays de foco único: contexto curto, uma pergunta grande e exatamente três respostas. Variação vem do conteúdo sorteado, nunca de mais controles na tela.
- Azul `broadcast` identifica imprensa e apresentação; amarelo continua reservado para ação e progressão. Reencontros usam o mesmo componente, mudando conteúdo e rótulo, sem criar outra linguagem visual.
- `QUADRA` aparece somente entre ciclos de quatro temporadas. O cabeçalho mostra um único número financeiro — caixa disponível — e cada investimento cabe em nome, efeito curto e preço.
- Benefícios comuns usam superfície neutra; evolução imediata recebe amarelo; potencial oculto e corrupção recebem borda vermelha. `Treino especial` permanece visível e indisponível para antecipar a função sem fingir interação.
- No mobile, ambos os overlays encostam visualmente na base, mantêm rolagem própria e preservam alvos de 44px; o conteúdo da carreira não disputa rolagem com o modal.

## Componentes recorrentes

- Botão primário — 52px mobile / 48px desktop · raio 10px · Barlow Condensed 18/800 · fundo referee.
- Card de decisão — mínimo 64px · raio 12px · borda sutil · índice/ícone à esquerda · seta à direita.
- Rótulo editorial — Manrope 10/800 · tracking .14em · uppercase · chalk/referee conforme contexto.
- Métrica principal — label 10/700 muted · valor Barlow Condensed 30/800 · numerais tabulares.
- Rail desktop — 264px · mesmo fundo do canvas · uma borda à direita · navegação textual com indicador amarelo.

### Aba Time

- O elenco visual respeita o futebol de botão: exatamente cinco titulares no campo e três reservas, tanto para clube quanto para seleção.
- Clube e seleção são alternados por um único seletor compacto; o OVR dos cinco aparece dentro de cada opção e nunca exige um hero redundante.
- A formação usa posições reais e encaixe por função. O protagonista ocupa o setor correspondente à posição jogada, nunca um slot fixo.
- Peça mobile — 68px externos / canvas de 66px · aro externo de 1px · frame compacto centralizado · sem halo ornamental.
- Retrato compacto — raio interno 128/280 · aro 3/280 · busto com compensação óptica vertical de -8/280 para ficar centrado dentro do disco.
- Identificação da peça — nome 9px/800 · idade 8px/muted · posição 8px/900 · OVR Barlow Condensed 11px/900. Truncar nomes longos sem reduzir o piso tipográfico.
- O protagonista é identificado por filete dourado, selo `VOCÊ` e nome dourado; o destaque nunca engrossa a peça nem altera sua posição.
- Em 390px, peças usam 86px de coluna, campo mínimo de 464px e nenhum elemento pode criar overflow horizontal ou colidir com outra peça.

### Modo Técnico essencial

- O modo reutiliza o fluxo da carreira de jogador: decisão, simulação, jogo-chave e consequência. Nenhuma tela semanal ou dashboard paralelo.
- O cabeçalho e o rail esquerdo reutilizam literalmente os componentes e medidas do jogador. O técnico começa aos 40 anos; a idade ocupa o centro do cabeçalho e a confiança ocupa a métrica da direita.
- A temporada inteira é simulada de uma vez. Liga, copa nacional e competição continental geram campanha; somente finais realmente alcançadas viram partidas jogáveis, em sequência.
- Navegação mantém cinco destinos: Carreira, Time, Histórico, Estatísticas e Mundo. Prancheta permanece oculta enquanto as formações da partida forem aleatórias.
- Carreira é a fila obrigatória: notícias, objetivo, confiança e decisão pendente. Não exibe bloco de próximo jogo antes da simulação.
- Time mantém cinco titulares e até três reservas. Vender abre uma vaga real; contratar preenche a vaga e nunca substitui alguém automaticamente.
- Cada titular possui coordenada própria no campo. Arrastar altera apenas aquele atleta. Um modal separado permite consultar o encaixe dos cinco nas seis formações, sem escolher a formação usada na partida.
- Histórico repete a linha do tempo do jogador, trocando produção individual por campanha coletiva: clube à esquerda; J/V/E/D, gols, títulos e confiança por temporada. O índice de força do time nunca é exibido.
- Estatísticas usam linhas tabulares para todo o elenco e módulos coletivos de campanha. Retratos nunca recebem `flex: 1` nem fundos elípticos; a imagem fica em um frame circular fixo.
- Mundo mantém a mesma navegação interna do jogador — Agora, Clubes, Jogadores e Arquivo — com noticiário, rankings e memória da carreira do técnico.
- Stamina existe somente dentro da partida e vem da distância da peça ativa no próprio toque. A peça usa filete semântico; o valor exato aparece apenas quando selecionada ou no painel de troca.
- Troca é uma folha inferior curta, disponível apenas no próprio turno com a física parada. Sai + entra + confirmar; depois disso é imediata, irreversível, não consome a vez e preserva as coordenadas da peça.
- Abrir a troca pausa relógio, física, CPU e regra dos sete segundos. Confirmar ou cancelar retoma imediatamente.
- Formações dos dois times são sorteadas no início e novamente depois de cada gol.
- Todo sistema que não muda escalação, comportamento da peça, resultado ou futuro da carreira permanece fora do lançamento.

## Iconografia

- Biblioteca própria `FutboboIcon`: SVG inline, grade 24×24, traço 1.8, pontas e junções arredondadas.
- Ícones herdam `currentColor`, usam `1em` por padrão e nunca dependem de fonte, emoji ou rede; site, APK e versão offline permanecem idênticos.
- Navegação usa metáforas fixas: bandeira = carreira, camisa = jogador, linha do tempo = histórico, barras = estatísticas, globo = Mundo.
- Troféus, medalhas, mercado, saúde e aposentadoria usam pictogramas reais; caracteres tipográficos ficam reservados para operações universais de expansão (`+`/`−`) e conteúdo textual.
- Contêiner mínimo de 18px na navegação e 20–24px em ações; o SVG é sempre alinhado no centro óptico do rótulo.

## Movimento

- Entrada de tela: 220ms, opacity + translateY(8px).
- Hover/press: 140ms; `scale(.98)` no press.
- Overlays: 220ms com `cubic-bezier(.23,1,.32,1)`.
- Transferência confirmada: a chegada termina antes da saída; overlay e card dissolvem juntos em 320ms, com deslocamento máximo de 8px. Em movimento reduzido, somente opacity por 180ms.
- Nunca `transition: all`; respeitar `prefers-reduced-motion`.
- Controles interativos são elementos nativos (`button`, `a`, `input`) com foco visível; cards clicáveis nunca simulam botão com `role` e eventos manuais de teclado.
