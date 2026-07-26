# Modo Futebol de Botão

Módulo autocontido: física, regras, CPU, render e interface de uma partida de
futebol de botão 5×5 pensada para celular. Roda sozinho em `/botao` e foi
desenhado para virar a final da carreira do Futbobo sem tocar no motor de
temporada.

## Regras desta versão

| Item | Valor |
| --- | --- |
| Botões por lado | 5 (nenhum é goleiro fixo) |
| Turno | 1 toque alternado |
| Controle | arrastar para trás e soltar (estilingue) |
| Fim antecipado | 3 gols encerram na hora |
| Tempo | **um tempo corrido de 2min**, prorrogação de 45s, depois pênaltis |
| Cronômetro | **nunca para** — corre para mirar, para pensar e com a bola rolando |
| Mesa | tem tabelas: a bola só sai em gol |
| Formação | muda nos dois times a cada gol |

O relógio ser literal (`clockScale: 1`) é o que torna a partida legível: o que
está escrito na tela é o tempo real que falta. Nos últimos 15 segundos o
cronômetro pulsa em vermelho. Se o tempo acaba com a bola rolando o lance
termina antes; se acaba com a bola parada, fecha na hora.

Só o jogador da carreira tem nome. As outras peças são a camisa — `Palmeiras
#7` —, como em botão de verdade.

O jogador da carreira **é um dos cinco botões**. A posição dele decide o slot
inicial: `GOL` cai no botão mais atrasado, `CA` no mais adiantado, `LD`/`PD` nas
faixas laterais. Como a formação roda a cada gol, o mesmo jogador muda de função
durante a partida — um centroavante em `Ferrolho` recua, um lateral em
`Avalanche` vira ponta.

## Arquivos

Dependências só apontam para baixo, sem ciclos:

```
rng.ts          gerador determinístico (mesma seed = mesma partida)
types.ts        contrato público: setup entra, resultado sai
formations.ts   6 formações de 5 botões + mapa posição -> slot
kits.ts         contraste de uniforme e tinta legível do número
engine.ts       física, colisões, gol, cronômetro, pênaltis
cpu.ts          IA: gera toques, simula cada um, escolhe o melhor
render.ts       desenho em canvas 2D (nenhuma dependência de React)
audio.ts        som sintetizado no WebAudio (zero arquivos)
simulate.ts     partida headless (usada em "simular a final")
BotaoMatch.tsx  componente jogável: setup -> onFinish(resultado)
TeamCrest.tsx   escudo real com fallback para a sigla
botao.css       estilo, usando as variáveis do globals.css
page.tsx        rota /botao — antessala + partida + resultado (laboratório)
adapter.ts      ÚNICA ponte com o Futbobo (importa game-data)
```

`engine`, `cpu`, `render`, `simulate` e `BotaoMatch` **não conhecem** clube,
liga, temporada nem `GameState`. Toda a tradução mora no `adapter.ts`. Para
extrair o modo para outro projeto, basta copiar a pasta e reescrever o adapter.

## Por que o seu botão importa

Cada peça tem **força** (velocidade máxima do toque) e **controle** (o quanto o
toque sai onde você apontou). O seu botão herda os dois do overall e dos
atributos da carreira; os reservas herdam da força do clube.

O controle vira um desvio de até ~3° no toque de uma peça ruim e praticamente
zero na sua. É sutil de propósito: dá motivo para usar você mesmo nos lances
decisivos sem transformar a partida em sorteio. Nos pênaltis quem bate é sempre
o seu botão.

## Pênaltis

As cobranças são **alternadas**: cada um dos cinco botões bate a sua, na ordem
montada por `buildPenaltyOrder`. Em morte súbita a fila recomeça do começo.

Antes da disputa a partida entra na fase `penalty-setup` e o jogador escolhe
**em qual das cinco cobranças o próprio botão dele vai bater** — guardar-se para
a decisiva ou resolver logo na primeira. `confirmPenaltyOrder` fecha a escolha e
libera a bola. A final simulada escolhe a última automaticamente.

Quem defende é um corpo `keeper` próprio, não um botão de linha reaproveitado —
reaproveitar quebrava carreira de goleiro, porque o disco do jogador era inflado
para defender e voltava gigante na hora de bater.

Para testar só a disputa, a antessala tem **"Ir direto para os pênaltis"**
(prop `startInPenalties` do `BotaoMatch`, que chama `jumpToPenalties`).

## Leitura da mesa

- Peça dourada com anel e a etiqueta `VC` é você.
- A sigla atrás de cada gol diz para que lado você ataca.
- Ao mirar, a linha tracejada mostra **onde o seu botão vai parar** — o alcance
  exato do atrito. É informação sua, não vantagem.
- Uniformes muito parecidos são separados automaticamente (`kits.ts`): em
  Flamengo × Internacional o adversário entra de branco.

## Como a CPU joga

Ela não trapaceia: usa o mesmo motor do jogador. A cada turno gera toques
candidatos (chute ao gol nos três alvos, passes para companheiros, alívio,
reposicionamento defensivo), **simula cada um** com `cloneMatch` + `stepMatch`, e
pontua o estado resultante — gol, distância da bola ao gol adversário, posse,
perigo no próprio gol e cobertura defensiva.

A dificuldade (1–5, derivada da força do adversário) controla quantos candidatos
ela enxerga, o ruído da avaliação, a chance de burrada e o tremor na mão. Nem no
nível 5 ela é perfeita — mesa de botão tem trave, rebote e azar.

### Balanceamento medido

Partidas simuladas, times de força igual e desiguais:

| Cenário | Vitórias do jogador | Gols | Amostra |
| --- | --- | --- | --- |
| Times idênticos (controle) | 50% | 1,4 × 1,4 | 90 partidas |
| Clubes iguais, você é craque (82) | 55% | 1,7 × 1,7 | 200 partidas |
| Zebra 68 vs 88, jogador comum (70) | 8% | 0,5 × 2,6 | 40 partidas |
| Zebra 68 vs 88, com craque (86) | 18% | 0,9 × 2,3 | 40 partidas |
| Zebra 68 vs 88, com fenômeno (95) | 33% | 1,2 × 2,2 | 40 partidas |
| Favorito (88 vs 68) | 94% | 2,5 × 0,5 | 50 partidas |

A linha "times idênticos" existe para provar que o motor não favorece nenhum
lado: mesmo `strength` e mesmos números no botão do jogador dão 50% cravado.

As três linhas de zebra mostram o efeito do craque: o mesmo time pequeno sai de
8% para 33% de chance conforme o seu overall sobe. Isso porque a habilidade com
que a CPU joga o seu lado é **contínua**, não uma escada de cinco degraus — com
limiares fixos, um rating de 80,9 virava nível 4 e 80,4 virava 3, e um
arredondamento mexia 14 pontos percentuais no resultado.

Ritmo: ~22 toques por partida em 2 minutos de relógio real. Como o cronômetro
corre também enquanto se mira, a simulação cobra `DEAD_TIME_PER_TURN` por turno
(`simulate.ts`) para caber o mesmo tanto de toques que uma partida jogada — sem
isso a final simulada teria o dobro de lances. Simular é ligeiramente pior do que jogar
bem: a IA usa todas as peças por igual, enquanto o humano pode insistir na sua,
que é a melhor do time.

### Rodar o laboratório

A rota `/botao` tem "Simular a final", que roda o motor headless e mostra a
narração. Para medir em lote fora do navegador, `simulate.ts` é importável em
Node 22+ com `--experimental-strip-types` (precisa de um resolvedor que complete
a extensão `.ts` dos imports relativos).

## Integração com a carreira

O modo já está ligado ao jogo principal. A temporada continua calculando a
campanha inteira, mas para antes das decisões quando a configuração escolhida é
`finals-only` ou `play-key-matches`.

- `pendingBotaoMatches` é uma fila: Mundial, continentais, copas e supercopas
  podem ser decididos no mesmo ano, sem jogar fora nenhuma final.
- A liga por pontos corridos nunca entra na fila.
- Antes de cada confronto existe uma antessala com **Jogar** e **Simular**.
- `"play-key-matches"` transforma uma classificação ao mata-mata da Copa do
  Mundo em uma sequência real: oitavas, quartas, semifinal e final.
- Vitória abre a rodada seguinte; derrota encerra aquela campanha.
- Clubes usam escudos e seleções usam bandeiras, ambos com fallback.

`applyBotaoMatchResult` em `app/page.tsx` é o ponto de retorno. Ele atualiza
placar, campeão/vice, gabinete de troféus, vaga no Mundial de Clubes, gols e
assistências do jogador, Seleção, moral, torcida, notícias e pontos de legado.
Os resultados completos ficam em `SeasonRecord.botaoResults` e reaparecem no
resumo da temporada.

O save está na versão 6. Fechar o aplicativo na antessala mantém a final
pendente; fechar durante a partida reinicia o mesmo confronto, porque `matchId`
e seed são determinísticos. Saves antigos recebem fila vazia em
`normalizeSave`.

## Invariante da vez (leia antes de mexer no turno)

**A vez pode voltar para um lado sem que `turns` avance.** Acontece em três
lugares: `startNextPeriod` (saída de bola do 2º tempo e da prorrogação),
`resumeAfterGoal` (quem sofreu o gol recomeça) e `skipTurn`.

Nunca use `turns` para decidir se a CPU já jogou naquele turno. Uma trava assim
existiu aqui e **congelava 52% das partidas** na saída de bola do 2º tempo: a
CPU comparava o contador, via o mesmo número do último toque dela no 1º tempo e
concluía que já tinha batido. Quem impede batida dupla é o timer guardado em ref
mais a assinatura do estado nas dependências do efeito.

Regra geral: se a CPU não conseguir produzir um toque legal, chame `skipTurn` —
perder um lance é melhor do que travar a final. Os candidatos de
reposicionamento também são limitados à velocidade mínima de `beginShot`, senão
uma "burrada" da CPU podia escolher um toque fraco demais para ser aceito.

## Acessibilidade e celular

- `touch-action: none` no canvas: arrastar não rola a página.
- A mesa encolhe pela altura em tela baixa em vez de estourar o rodapé.
- `prefers-reduced-motion` desliga a tremida do gol e a animação do aviso.
- Região `aria-live` narra gols e placar; o canvas tem `aria-label` com a
  situação atual.
- Som pode ser desligado no rodapé; o áudio só é criado no primeiro toque, como
  exigem as políticas de autoplay.
- `visibilitychange` zera o relógio de frame: voltar de segundo plano não
  desconta de uma vez o tempo em que o app ficou fora da tela.

## O que ainda falta

- Torneio próprio do modo botão (chave, mata-mata avulso).
- Botões colecionáveis / customização de peça.
- Tutorial de primeiro toque.
- Dois jogadores no mesmo aparelho.
- Repetição do lance do gol.
