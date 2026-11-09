# Tela da Carreira — 8 concepts

Exploração de rearranjos completos para a aba **Carreira** (a mesa de decisão) do Futbobo.
Cada concept é **um HTML responsivo único** (desktop ≥ 1024 px e mobile < 768 px no mesmo arquivo)
que mostra exatamente o mesmo conteúdo, para que a comparação seja só de ideia, arranjo e acabamento.

Galeria: `concepts/carreira/index.html` · servidor: `node concepts/carreira/serve.mjs` → http://localhost:5178/concepts/carreira/

---

## 1. Diagnóstico da tela atual

Mesma informação, sempre na mesma ordem e no mesmo componente: cabeçalho (clube, idade, OVR) → 4 barras →
faixa de status → mercado → meta → arte → capítulo com 3 escolhas → navegação. Tudo é cartão escuro com borda
fina, raio parecido, rótulo em CAIXA ALTA espaçada em cima de cada bloco e "→" no fim de cada botão.

As skills pesquisadas apontam exatamente esses sinais como o que deixa uma interface com cara de molde:

- **Anthropic frontend-design**: "rótulo em caixa alta espaçada acima de cada título", "→ em links e botões",
  "cartões idênticos com o mesmo raio", "near-black tingido" estão na lista de clichês a evitar.
- **Impeccable**: "cartões dentro de cartões", "texto cinza sobre fundo colorido", animação sem tese.
- **taste-skill**: "uma ideia por tela", no máximo dois níveis de caixa, nunca repetir o mesmo layout.

A arte do capítulo hoje é uma marca d'água num painel vazio. O capítulo (o coração do jogo) divide peso com
mercado e meta. Por isso enjoa: não há um lugar onde a tela gasta sua ousadia.

## 2. Princípios tirados das skills (valem para todos)

| Fonte | O que levamos |
|---|---|
| Anthropic **frontend-design** | Começar pelo vocabulário do mundo do assunto (transmissão, álbum, mesa de botão, jornal, metrô, camisa, celular, painel). Gastar a ousadia em **um** lugar. **Um** momento de movimento orquestrado em vez de fade em tudo. Plano de tokens (4–6 cores nomeadas) antes de codar. Tirar um acessório no fim. |
| Anthropic blog (*distributional convergence*) | Fugir de Inter/Roboto/Open Sans/Lato. Contraste extremo de peso (200 × 900) e saltos de tamanho de 3×. Cor dominante + acento afiado, não paleta tímida. |
| **Impeccable** | Squint test (primário → secundário → grupos). Escala de espaço de base 4. Cor por papel (canvas, superfície, texto, ação, estado). Tese de movimento; 100–150 ms feedback, 150–300 ms estado, 300–500 ms transição, 500–800 ms entrada autoral. Saída mais rápida que entrada. Nunca animar width/height/top/left. |
| **taste-skill** | Uma ideia por tela. No máximo 2 caixas de profundidade. Alvos de 44 px. Nada de fade-in em toda seção, parallax em texto, scroll-jacking, roxo/lilás. Um efeito por página. |
| **ui-ux-pro-max** | Prioridade: acessibilidade e toque antes de estilo. Estilo casado com o produto (catálogo: Exaggerated Minimalism, Editorial Grid, Dimensional Layering, Data-Dense, Kinetic Typography…). Ícones em SVG, nunca emoji. |
| **Vercel Web Interface Guidelines** | `tabular-nums` em números comparáveis. `:focus-visible`. Nunca `transition: all`. Loop > 5 s precisa de pausa. Raios aninhados concêntricos. Sombras em 2+ camadas. Aspas curvas e reticências (…). `prefers-reduced-motion` sempre. |

## 3. Conteúdo (idêntico em todos)

- **Jogador:** Tito Bobo · camisa 10 · Meia ofensivo (MEI) · destro · Brasil · **17 anos** · **OVR 63** (+5 na temporada passada)
- **Clube:** Bahia (Esporte Clube Bahia) · Salvador · Brasileirão Série A · cores `#0057a8` / `#e32636` / branco
- **Temporada:** 2028 (segunda como profissional)
- **Barras:** Moral 63 · Físico 93 · Prestígio 16 · Torcida 63 (rótulo do humor da torcida: "Querido")
- **Situação:** Status *Rotação* · Treinador *52%* · Contrato *4 anos* · ação *Aposentar*
- **Mercado:** "Quer mudar de camisa?" → *Empréstimo (100%)* · *Pedir transferência*
- **Meta do treinador:** *Comandar o jogo* — Somar 8 gols + assistências · Recompensa +7 confiança · Falha −6 · progresso 0/8
- **Mundo (manchetes):** Atlético-MG conquista a CONMEBOL Libertadores · São Paulo vence o Bahia nos pênaltis e leva a Copa do Brasil · Flamengo termina o Brasileirão com o melhor ataque · Palmeiras anuncia o artilheiro uruguaio para 2028
- **Capítulo** (tag *Visual novo*):
  - Título: **O barbeiro desenhou o escudo do clube na sua cabeça sem avisar**
  - Texto: Você pediu apenas para tirar dos lados. Quando se olha no espelho, existe um escudo enorme e surpreendentemente detalhado na nuca.
  - A · **Assumir o corte no próximo jogo** — Torcida ↑↑ · dignidade em risco
  - B · **Pintar por cima com uma cor ainda mais absurda** — Imagem ↑↑ · imprensa confusa
  - C · **Raspar tudo antes que alguém veja** — Seguro · confiança no barbeiro ↓
- **Temporada anterior (2027):** 15 jogos · 1 gol · 2 assistências · nota 6.1 · OVR 58 → 63 · Brasileirão 8º · vice da Copa do Brasil · vice da Libertadores · meta perdida
- **Base:** Bahia, dos 12 aos 16 (2023–2026) · estreia profissional 2027
- **Navegação:** Carreira · Jogador · Time · Histórico · Estatísticas · Mundo

Assets: `../../public/assets/clubs/<id>.png` (bahia, sao-paulo, atletico-mg, flamengo, palmeiras, botafogo,
corinthians, vasco, gremio, internacional, alianza-lima), `../../public/assets/competitions/libertadores.png`,
`../../public/assets/competitions/leagues/brasileirao.png`, `../../public/favicon.svg` (marca F),
`./shared/bust.svg` (retrato em disco) e `./shared/bust-cutout.svg` (retrato recortado).

## 4. Contrato técnico

- Um arquivo por concept: `concepts/carreira/NN-slug.html`, CSS e JS inline, `lang="pt-BR"`. Só Google Fonts como dependência externa.
- **Desktop** (alvo 1440×900, também 1280×800 e 1920×1080): a tela inteira cabe na viewport, sem rolagem da página.
- **Mobile** (alvo 390×844, também 360×740): título do capítulo, as 3 escolhas e a navegação visíveis sem rolar. O resto pode ficar num HUD compacto ou abaixo, com rolagem.
- Escolhas são `<button>` reais; clicar dá um retorno físico próprio da metáfora e marca a escolha (sem navegar).
- `:focus-visible` visível, contraste AA, alvos de 44 px no toque, `prefers-reduced-motion` respeitado, nenhum overflow horizontal em 360 px.
- Proibido: Inter/Roboto/Open Sans/Lato/fonte do sistema como principal; gradiente roxo; brilho neon; glassmorphism; cartões idênticos com o mesmo raio; caixa alta espaçada acima de todo bloco; "→" em todo botão; emoji como ícone; `transition: all`; fade-up em toda seção.

---

## 5. Os concepts

Cada um traz: **tese**, **ideia de jogo** que a metáfora destrava, **tokens**, **tipo**, **layout** desktop/mobile e **movimento**.
"Distância" diz o quanto se afasta da identidade atual.

### 01 · Transmissão — *ao vivo da sua carreira* · distância: média
- **Tese:** a carreira é uma transmissão; a decisão é o momento em que o diretor corta para você.
- **Ideia de jogo:** as três escolhas viram a *enquete da transmissão* — a torcida "vota" (tendência derivada de Torcida/Prestígio) e você decide contra ou a favor dela.
- **Tokens:** cena noturna `#0b1621` → gramado `#1d5a32`; placa gráfica `#f6f7f4`; tinta `#0d1512`; faixa do clube (azul/vermelho do Bahia); AO VIVO e ação em `#f4c430`.
- **Tipo:** **Archivo** (eixo de largura): 75 de largura / 800 nos títulos da tarja, 125 / 700 nos números do placar.
- **Layout desktop:** cena de estádio em tela cheia (refletores, arquibancada em pontos, gramado em perspectiva) + *placar* no canto (escudo, 2028, 17 anos, OVR 63 MEI) + ficha do jogador em pé à esquerda (as 4 barras) + **tarja inferior** grande com o capítulo + **enquete** à direita com as 3 escolhas + **GC rolante** do Mundo no rodapé (com pausar) + seletor de "câmeras" como navegação.
- **Layout mobile:** transmissão vertical: placar no topo, faixa de stats compacta, cena curta com close, tarja do capítulo, enquete em linhas grandes no polegar, GC acima da navegação de câmeras.
- **Movimento:** entrada de grafismo de TV (placar → tarja com barra de cor que limpa → barras da enquete crescem). GC com botão de pausa.

### 02 · Álbum — *a carreira como álbum de figurinhas* · distância: longa
- **Tese:** cada temporada é uma página do álbum; você coleciona a própria carreira.
- **Ideia de jogo:** a **meta vira um espaço vazio de figurinha brilhante** ("cole quando conseguir"); o mercado vira **troca** (TROCO / EMPRESTO); escolher é colar uma figurinha no capítulo.
- **Tokens:** papel `#fbfbf7`, tinta `#161616`, azul `#0b5cad`, vermelho `#e0262f`, amarelo `#f6c431`, brilho metálico em gradiente cônico, retícula de impressão.
- **Tipo:** **Bricolage Grotesque** (display pesado e estreito) + **Instrument Sans** (texto).
- **Layout desktop:** álbum aberto com lombada. Página esquerda impressa nas cores do Bahia: figurinha do jogador (retrato, nome, nº, OVR), ficha técnica impressa, espaço da figurinha especial (meta), selos de troca. Página direita: "Capítulo 2028" impresso + 3 figurinhas-escolha soltas para colar no espaço do capítulo. Faixa "Notícias da rodada" no pé. Abas de índice saindo da borda = navegação.
- **Layout mobile:** uma página por vez: figurinha + chips de stats no topo, capítulo, 3 figurinhas empilhadas, abas no rodapé.
- **Movimento:** figurinhas caem em sequência com leve rotação; ao escolher, a figurinha descola, gira e assenta no espaço.

### 03 · Mesa — *a carreira em cima da mesa de botão* · distância: curta
- **Tese:** o Futbobo nasceu na mesa de botão; a tela é a mesa, as decisões são lances.
- **Ideia de jogo:** o seu botão (com retrato) fica no centro; as escolhas são três botões no campo; escolher é **dar a palhetada**. Stats como **contador de bolinhas** (ábaco de placar); meta e mercado em **fita de rotular em relevo**; Mundo num **radinho de pilha**.
- **Tokens:** feltro `#1f6b3a` com textura, giz `#eef2e8`, madeira `#5a3a22 → #7a5131`, latão `#c9a227`, acrílico nas cores do clube, palheta `#f4c430`.
- **Tipo:** a dupla atual da marca, **Barlow Condensed + Manrope** — prova de que a mudança pode estar no arranjo e na matéria, não na fonte.
- **Layout desktop:** vista de cima: borda de madeira com placar de mesa (BAH · 2028 · 17 · OVR 63) e os 4 contadores; feltro horizontal com linhas de giz; carta do capítulo deitada sobre o meio-campo; seu botão; três botões-escolha com etiquetas; bilhete de fita com a meta; rádio no canto; estojo de botões com divisórias = navegação.
- **Layout mobile:** a mesa em pé (proporção da mesa real do jogo): régua de madeira no topo com placar e contadores, carta no meio, os três botões-escolha em linhas no polegar, estojo no rodapé.
- **Movimento:** os botões são "colocados" na mesa em sequência (sombra encolhe ao pousar); a escolha dispara a palhetada (seu botão desliza até o alvo).

### 04 · Primeira Página — *toda decisão vira a capa de amanhã* · distância: muito longa
- **Tese:** a tradição do jornal esportivo cor-de-rosa; você escolhe a manchete do dia seguinte.
- **Ideia de jogo:** as escolhas aparecem como **três versões da capa de amanhã**; o mercado vira **classificados** ("Mercado da bola"); a meta é a **coluna do treinador**; o Mundo é o **giro pelo mundo**.
- **Tokens:** papel salmão `#f3cfc6` com fibra, tinta `#1a1414`, vermelho de cabeçalho `#c8102e`, marca-texto `#f7d038` (o amarelo da marca vira caneta).
- **Tipo:** **League Gothic** (manchetes e títulos de seção) + **Newsreader** (texto corrido, olhos e legendas).
- **Layout desktop:** primeira página em grid de 6 colunas: cabeçalho com orelhas (edição 2028 · Salvador / OVR 63 ▲5), cadernos como navegação, manchete em 4 colunas, foto em retícula do jogador com legenda, bloco "Amanhã na capa — escolha a manchete" com as 3 escolhas, coluna lateral com termômetro (stats em barras hachuradas), situação no elenco, coluna do treinador, giro pelo mundo e classificados no pé.
- **Layout mobile:** jornal dobrado: cabeçalho compacto, cadernos em abas roláveis, manchete, foto pequena ao lado do texto, as 3 manchetes de amanhã; colunas laterais descem abaixo.
- **Movimento:** a manchete "imprime" (máscara de cima para baixo) e a retícula da foto se resolve de pontos grandes para finos; a escolha recebe um traço de marca-texto.

### 05 · O Caminho — *a carreira como mapa de metrô* · distância: longa
- **Tese:** uma carreira é uma linha com estações; cada decisão é um entroncamento; cada transferência, uma baldeação.
- **Ideia de jogo:** as 3 escolhas são **ramais** que saem da estação atual; temporadas passadas são estações (passe o mouse para ver os números); o mercado é a **baldeação**; outras linhas (Seleção, Europa) aparecem esmaecidas no mapa como futuro possível.
- **Tokens:** fundo `#eef1ef` com grade, tinta `#121a17`, linha do Bahia `#0057a8`, seu trajeto `#e8ab00` com contorno de tinta, vermelho `#e32636` nas estações de integração.
- **Tipo:** **Overpass** (herança da sinalização viária americana), 400–900.
- **Layout desktop:** mapa ocupando a tela: linha da base (tracejada) → estreia 2027 → estação atual 2028 (integração grande com escudo) → três ramais a 45° até as estações-escolha com "serviços" (as pistas). Legenda no canto com jogador, stats como status de linha, situação; "Próxima conexão" (meta); placa de baldeação (mercado); avisos da rede (Mundo).
- **Layout mobile:** linha vertical: estações passadas comprimidas no alto, estação atual com o capítulo, ramais descendo até as três estações no polegar.
- **Movimento:** a linha se desenha da primeira estação até agora e os ramais brotam.

### 06 · Manto — *a interface veste a camisa* · distância: média
- **Tese:** a camisa é a identidade; quando você muda de clube, a interface inteira troca de roupa.
- **Ideia de jogo:** tema dinâmico pela camisa do clube atual (cor + estampa + escudo). Um seletor de demonstração veste a tela com Bahia, Flamengo, Palmeiras, Botafogo, Corinthians, Vasco, Grêmio e Internacional.
- **Tokens:** vindos do clube (primária, secundária, estampa), mais tinta `#111` e papel `#fafafa`.
- **Tipo:** **Anybody** (eixo de largura 50–150: nome ultra estreito, número largo) + **Hanken Grotesk**.
- **Layout desktop:** à esquerda, as **costas da camisa** em escala gigante (BOBO + 10) sobre o tecido com a estampa; à direita, grid suíço: 2028 enorme, os 4 números das barras em tipo grande, o capítulo composto como cartaz e as escolhas como linhas cheias separadas por filetes grossos.
- **Layout mobile:** as costas da camisa viram o cabeçalho; conteúdo sobe por cima como uma folha.
- **Movimento:** o 10 entra de contorno para preenchimento; a troca de camisa transiciona cores em 400 ms.

### 07 · Vida de Atleta — *a carreira chega pelo celular* · distância: longa
- **Tese:** jogador vive no celular: a carreira chega como story, mensagem do técnico, do empresário e assunto do momento.
- **Ideia de jogo:** o capítulo é um **story com enquete**; a meta é uma **mensagem do professor**; o mercado é uma **mensagem do empresário** com as duas ações; o Mundo é **"em alta"**; as 4 barras viram **anéis de destaque**.
- **Tokens:** app claro `#f3f4f6` / superfícies `#ffffff`, tinta `#0f1419`, ação `#f4c430` com tinta escura, azul do clube no story.
- **Tipo:** **Plus Jakarta Sans** 400–800.
- **Layout desktop:** três colunas de app: perfil (retrato, @titobobo10, seguidores, anéis, situação), story 9:16 central (barras de progresso do capítulo, cena ilustrada, título com fundo destacado, enquete), mensagens + em alta à direita. Navegação como trilho de app à esquerda.
- **Layout mobile:** story em tela quase cheia com anéis no topo e "2 mensagens" recolhidas; enquete no polegar.
- **Movimento:** a barra do story corre só no segmento atual; a enquete entra com mola curta; ao votar, aparecem as porcentagens da torcida.

### 08 · Painel — *a temporada como painel de embarque* · distância: curta
- **Tese:** cada temporada é uma partida; cada escolha, um destino.
- **Ideia de jogo:** as escolhas são **destinos** com observação e portão; o Mundo é o painel de **chegadas**; a navegação é **sinalização de aeroporto** (preto no amarelo — o amarelo da marca vira wayfinding).
- **Tokens:** parede de aço `#1c232b`, palheta `#14181c`, letra `#f1efe6`, sinalização `#f4c430` com `#111`, status "no horário" `#67dd78`, atraso `#ef6258`.
- **Tipo:** **Barlow Semi Condensed** nas palhetas (eco da marca) + **Public Sans** na sinalização.
- **Layout desktop:** painel grande: cabeçalho em palhetas (BAHIA · 2028 · 17 ANOS · OVR 63), "Próximo embarque" com o título em palhetas e o texto num painel impresso, linhas de destino (escolhas) com status e botão de embarque, painel lateral de condições (stats), conexão (meta), balcão de transferências (mercado), chegadas (Mundo); placas de sinalização = navegação.
- **Layout mobile:** painel vertical com palhetas menores; destinos empilhados; placas no rodapé.
- **Movimento:** a cascata das palhetas girando até assentar (o momento único). Em movimento reduzido, aparece pronto.

---

## 6. Notas de implementação (o que mudou em relação ao plano)

Verificado nos 8: 1440×900 e 1280×800 sem rolagem nem estouro; 390×844 e 360×740 com título, as 3 escolhas e a
navegação na primeira tela, sem estouro lateral; movimento reduzido mostra tudo pronto (nada depende de animação);
sem erros no console.

- **01 Transmissão, 02 Álbum, 04 Primeira Página:** o layout de desktop começa em 1200 px; entre 1024 e 1199 usam a versão empilhada (o arranjo aberto não cabia). Abaixo de 780 px de altura, a página rola em vez de espremer.
- **03 Mesa:** no celular, rádio, plaquinhas, meta e mercado ficam abaixo do campo (com rolagem), para as escolhas caberem na primeira tela. Entre 1024 e 1279 px o rádio vira uma faixa.
- **05 O Caminho:** o mapa é calculado a partir das estações na página e se redesenha em qualquer largura. `#rota-a/b/c` abre direto numa escolha. Linhas Seleção e Europa só aparecem desenhadas no desktop.
- **06 Manto:** sem o retrato (ele só existe nas cores do Bahia e não acompanharia a troca de camisa); o jogador aparece pela etiqueta, nome e número. O Mundo mostra uma manchete por vez, com pausa.
- **07 Vida de Atleta:** o app ganhou nome próprio ("resenha"). Textos inventados para o concept: "barbearia.do.ze", "48,2 mil seguidores", porcentagens da enquete. `#voto-a/b/c` abre com o voto feito.
- **08 Painel:** o texto do capítulo é um aviso impresso, não palhetas (legibilidade). Uma rede de segurança assenta todas as palhetas em 5,2 s caso a aba esteja em segundo plano.
- **Textos de sabor** criados para os concepts (não existem no jogo): legenda da foto e anúncio da barbearia (04), "Preço deste exemplar: uma decisão" (04), nomes das linhas do mapa (05), mensagens do Professor e do Empresário (07).
