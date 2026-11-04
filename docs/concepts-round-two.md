# Futbobo: mudar o ato de jogar

## Por que a primeira rodada falhou

Seis superfícies, um mesmo fluxo: ler um evento, escolher uma das três respostas, confirmar e ler um delta. O componente `Choices` tornou a repetição estrutural. Fotografias, fontes e metáforas de jornal/console/museu não mudaram a agência. Os menus eram peças de apresentação, não pontos de entrada em um jogo vivo.

Esta rodada parte das decisões de uma carreira, não de temas visuais. Cada conceito precisa de estado, controle principal e consequência próprios. Remover cor e título deve deixar seis experiências reconhecíveis.

## O que o repositório permite afirmar

- O núcleo é uma carreira comprimida, feita para sessões rápidas no celular.
- Existem fadiga, confiança, disputa por minutos, empréstimos, contratos, histórias pessoais, relações com imprensa/torcida e partidas de botão.
- Decisões difíceis devem produzir histórias diferentes. Uma carreira imperfeita é desejável.
- A versão atual concentra contextos diferentes no mesmo formulário narrativo. Relações, lugares e compromissos quase sempre aparecem como texto ou barras.

As novas regras abaixo são hipóteses de design para protótipos, não alterações silenciosas no motor de carreira.

## Exploração: 22 possibilidades antes da seleção

| Possibilidade | O que poderia melhorar | Decisão |
| --- | --- | --- |
| Túnel cinematográfico | Emoção de entrar no jogo | Descartada: apresentação sem agência nova |
| Jornal vivo | Legibilidade do histórico | Descartada como conceito: feedback, não interação central |
| Museu navegável | Peso do legado | Descartada: ótimo arquivo, fraco lugar para decidir |
| Chat com empresário | Contexto das pessoas | Descartada: aplicativo de mensagens com botões continua sendo formulário |
| Mapa urbano com hotspots | Sensação de lugar | Descartada: deslocamento pode virar cliques de manutenção |
| Vestiário de objetos | Retomar de um lugar vivido | Retida para o menu de uma proposta, não como mecânica |
| Prancheta para escolher titularidade | Exibir disputa por posição | Descartada: o jogador não pode simplesmente se escalar |
| Treino de reflexo | Aproximação do corpo do atleta | Descartada: exige habilidade motora para resolver uma carreira de escolhas |
| Decisão em campo por turnos | Ler espaço, risco e colaboração | Selecionada: futebol sem exigir reflexo |
| Temporada como percurso ramificado | Antecipar custos e oportunidades perdidas | Selecionada: carreira deixa de parecer fila de eventos |
| Calendário semanal | Tornar tempo escasso | Descartada: expande manutenção e se aproxima demais de agenda de trabalho |
| Recurso de dados por dia | Variar capacidade de ação | Descartada nesta rodada: adiciona aleatoriedade antes de provar valor ao futebol |
| Negociação por cláusulas | Trocar dinheiro, minutos e liberdade | Selecionada: contrato vira decisão de carreira concreta |
| Leilão de jogador | Disputa entre clubes | Descartada: protagonismo fica com compradores, não com o atleta |
| Painel de notícias manipuláveis | Fazer mundo reagir | Descartada: melhora resposta do mundo, não o ato de escolher |
| Conversa com escuta e promessa | Fazer relações significarem algo | Selecionada: ouvir muda o que é sensato dizer; promessas reaparecem |
| Roda de três respostas | Resposta rápida no controle | Descartada: apenas outra geometria para a mesma lista |
| Plano da temporada em cartas | Combinar preparação, competição e recuperação | Selecionada: ordem e incompatibilidades criam estratégia leve |
| Álbum colecionável puro | Afeto e memória de temporadas | Retida como material do menu; coleção sem decisão não basta |
| Escolhas por gesto com cadeia causal | Aumentar fluidez e sustentar consequências | Selecionada: proposta curta para jogar com uma mão |
| Rebobinar uma escolha | Explorar alternativas | Descartada: enfraquece o peso das carreiras imperfeitas |
| Gestão total de clube | Mais profundidade | Descartada: muda o protagonista e contradiz a compressão de carreira |

## As seis hipóteses selecionadas

| Proposta | Verbo principal | Interface exigida pela decisão | Custo real | Consequência visível |
| --- | --- | --- | --- | --- |
| Na Bola | Ler e executar | Campo com linhas, companheiros, marcação e alvo | Relógio e número de toques | A bola se desloca; o lance muda; treinador reage |
| Estrada | Escolher um caminho | Percurso persistente com ramos e condições | Oportunidades que ficam para trás | O mapa e o clube mudam; novos caminhos abrem/fecham |
| Contrato | Negociar | Documento editável, clube e contraproposta | Salário × minutos × duração | O clube responde aos termos e firma uma condição concreta |
| Entrelinhas | Ouvir e se comprometer | Pessoas em cena e frase composta por intenção/tom | Capital de confiança e promessa | Expressão/reação mudam; o compromisso volta na conversa seguinte |
| Na Mão | Combinar e ordenar | Mão de cartas + três posições da temporada | Fôlego, calendário e incompatibilidades | Combinações produzem temporadas diferentes; o desgaste passa para o próximo ano |
| Pulso | Decidir no gesto | Um acontecimento, dois futuros, arraste ou botão | Equilíbrio entre corpo, grupo e torcida | A escolha altera o próximo acontecimento e a estabilidade da carreira |

### Critérios de seleção

1. A mecânica expressa uma tensão existente no futebol e no Futbobo.
2. O controle e o estado diferem dos outros cinco. Nenhum componente de escolhas comum.
3. O primeiro gesto significativo leva poucos segundos. Regras cabem na própria cena.
4. A versão de celular mantém o mesmo problema de jogo; não é um desktop espremido.
5. Informação é contextual: a confiança aparece perto da promessa, a liberdade perto do contrato, o risco perto da linha de passe.
6. A consequência altera o mundo/possibilidades, além de mostrar números.

## Referências estudadas e limites da influência

O criador de Citizen Sleeper descreve sistemas de mesa que expressam os temas e os custos de viver naquele mundo. A lição aplicada aqui é escolher recursos que tenham significado no futebol, sem importar dados, espaço ou ficção científica. [Entrevista com Gareth Damian Martin](https://www.gamedeveloper.com/business/how-citizen-sleeper-was-inspired-by-tabletop-rpgs-and-gig-work).

O estúdio de Football Drama explica como vida, partidas por turnos e cartas afetam uns aos outros. A lição é ligar escolhas de carreira à situação em campo, evitando uma camada narrativa desligada do jogo. As composições e regras desta exploração são próprias. [FAQ de Open Lab Games](https://steamcommunity.com/app/876190/discussions/0/1639790664928729631/).

## Direção visual

Sem fotos de campanha, slogans como conteúdo principal ou enquadramento de dashboard. O palco é o objeto da decisão: campo, estrada, contrato, conversa, mesa ou carta. Fontes locais e os escudos do próprio jogo mantêm continuidade. Formas e texturas devem vir de gramado, cal, papel, tecido de camisa e madeira; nada de futurismo sem função.

- Na Bola: grama noturna, cal marfim, placar em âmbar; perspectiva baixa e comandos sobre o campo.
- Estrada: atlas de papel verde claro, caminhos em tinta, pinos com escudos; progressão vertical no celular.
- Contrato: mesa azul petróleo, papel de escritório real, tinta vermelha de revisão; documento lidera.
- Entrelinhas: luz de fim de treino, figuras do jogo e diálogo espacial; cenário comunica relações.
- Na Mão: feltro vinho, cartas de calendário creme, números esportivos; mão e ordem dominam.
- Pulso: azul intenso e laranja de quadra, tipografia curta e silhuetas fortes; gesto sem ruído.

## Verificação obrigatória antes de entregar

O jogador deve conseguir concluir uma situação de cada conceito, inspecionar o resultado e jogar novamente. Testar condições, custos e limites; não apenas botões existentes. Conferir o menu e a decisão em larguras de celular e desktop quando o controle visual estiver disponível. Se o ambiente bloquear essa revisão, informar o limite sem confundir testes de estado com qualidade visual.
