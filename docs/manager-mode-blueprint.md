# Plano diretor — Modo Técnico

> Documento de produto e arquitetura. Não implementa o modo e não fixa números de balanceamento antes de testes.

## 1. Tese do modo

O Modo Técnico deve ser uma **carreira de técnico de futebol de botão**, não um Football Manager reduzido. A fantasia central é montar cinco peças, preparar um plano simples, tomar decisões rápidas e enxergar essas decisões alterarem a partida e a carreira.

O modo precisa preservar os princípios já declarados pelo Futbobo:

- **Consequências antes de quantidade:** escalação, treino, promessa, contratação e substituição precisam afetar mais de um sistema.
- **Mundo persistente:** os mesmos jogadores envelhecem, trocam de clube, acumulam história e podem reencontrar o técnico.
- **Carreiras imperfeitas são histórias:** banco insatisfeito, contratação que não encaixa, demissão e temporada ruim não podem ser apenas telas de punição.
- **Mobile first:** nenhuma tela pode virar planilha; uma decisão principal por vez.
- **Rápido:** o jogo deve pular a burocracia e parar nas decisões que mudam alguma coisa.
- **Determinístico onde importa:** a mesma seed e as mesmas decisões precisam produzir o mesmo estado, inclusive na IA e nas simulações.

Nome de trabalho para a proposta: **Prancheta de 5 Botões**.

## 2. O que já existe e pode ser reaproveitado

Esta seção descreve o repositório atual, não a proposta futura.

### Estrutura já preparada

- O seletor de carreira já conhece os modos `player` e `manager`, mas só cria e valida de verdade saves da carreira de jogador.
- O menu principal já possui o cartão desabilitado “Carreira de Técnico”.
- O save atual permite até dez slots por modo, porém o validador só aceita o `GameState` da carreira de jogador.
- O universo de `World Players` já guarda identidade, posição, idade, OVR, potencial, reputação, contrato, clube, empréstimo, histórico, honrarias e estatísticas de carreira.
- O núcleo relevante de um clube já pode ser materializado com 14 jogadores. A própria API declara que foi preparada para uma futura carreira de técnico.
- A aba Time atual já traduz o elenco em cinco titulares e três reservas.
- O mercado existente já possui uma costura determinística para destinos, empréstimos, transferências e agentes livres.
- A carreira já comprime temporadas e enfileira partidas-chave jogáveis.

### Partida de botão atual

- São cinco peças por lado, turno alternado, física própria, seis formações, pênaltis e IA que usa o mesmo motor do jogador.
- A simulação headless também usa o mesmo motor e a mesma IA. Isso é uma base importante para não existirem “dois jogos” diferentes ao jogar e ao simular.
- Hoje somente o protagonista tem identidade e atributos individuais dentro da partida. As outras peças são slots anônimos derivados da força do clube.
- Os IDs das peças são ligados ao slot (`user-0`, `cpu-0`), não ao jogador persistente.
- A formação muda automaticamente depois de gols e períodos.
- A mesa atual possui tabelas: a bola rebate nas bordas e **só sai quando entra no gol**.
- Existe fadiga anual na carreira de jogador, mas não existe fôlego por peça dentro de uma partida.

### Lacunas objetivas

- Não existe um `ManagerState` real.
- Não existe escalação editável persistente, plano tático do técnico ou estado detalhado do elenco.
- Não existem jogadores individualizados dos dois lados no motor da partida.
- A mesa é deliberadamente fechada, com tabelas e rebotes. Não se deve introduzir lateral, escanteio ou tiro de meta no Modo Técnico.
- Não existem substituições, fila de troca ou decisões de troca da CPU.
- O resultado da partida não guarda um relatório individual de todos os atletas.
- Os testes atuais são majoritariamente validações estáticas do HTML/código; eles não bastam para validar stamina, trocas, identidade das peças e IA.

## 3. Contrato de experiência

Metas propostas para orientar o balanceamento, não fatos do jogo atual:

- Primeira decisão relevante em menos de 60 segundos após criar a carreira.
- Temporada padrão em aproximadamente 15–25 minutos.
- De quatro a sete partidas-chave jogáveis por temporada na configuração recomendada.
- Uma partida jogada continua curta; abrir uma troca não pode transformar dois minutos de mesa em dez minutos de menus.
- Escalar o 5+3 deve exigir poucos toques e mostrar imediatamente o custo da escolha.
- Uma tela possui uma ação primária clara; detalhes ficam em painéis progressivos.
- Nenhum sistema existe apenas para aumentar números. Se não produz decisão, consequência ou história, ele não entra.

## 4. Loop da carreira

### Início

1. Criar o técnico: nome, nacionalidade, aparência simples e origem narrativa.
2. Escolher um clube ou aceitar uma rota recomendada.
3. Receber objetivo da diretoria e diagnóstico de três pontos do elenco.
4. Montar o primeiro 5+3 e escolher Plano A.
5. Jogar ou simular o primeiro jogo-chave.

A origem do técnico pode mudar o começo sem virar árvore de atributos:

- **Ex-jogador:** mais confiança inicial do vestiário.
- **Analista:** leitura tática inicial mais clara.
- **Formador:** jovens evoluem e aceitam rotação com mais facilidade.

Essas vantagens precisam aparecer como consequências legíveis, não como bônus escondidos.

### Temporada comprimida

A temporada deve ser dividida em capítulos, não em uma tela para cada rodada:

1. Próximo bloco de jogos e contexto.
2. Uma decisão relevante: escalação, treino, conversa, proposta, crise ou objetivo.
3. Uma partida-chave jogável ou simulação compacta do bloco.
4. Consequência: tabela, moral, condição, confiança, mercado e narrativa.
5. Janela de transferências ou momento decisivo quando aplicável.

Partidas comuns podem ser agregadas. Mata-matas, confrontos diretos, estreias, clássicos, finais e jogos que decidem o emprego do técnico são candidatos naturais a partidas jogáveis.

Configurações recomendadas:

- **Jogos-chave** — padrão e experiência principal.
- **Só finais** — carreira ainda mais rápida.
- **Simular tudo** — para quem quer gerir apenas a trajetória.

Não é recomendável obrigar o usuário a jogar todas as rodadas; isso quebraria a filosofia de carreira comprimida.

## 5. Navegação do Modo Técnico

O modo deve continuar com **seis destinos**, para não repetir o problema de overflow da barra inferior.

### 1. Central

Substitui a função de “Carreira” e concentra o presente:

- próximo adversário e importância do jogo;
- objetivo da diretoria e risco do cargo;
- confiança da diretoria, vestiário e torcida;
- condição geral do elenco;
- decisão pendente mais importante;
- resumo do último bloco de jogos;
- atalhos “Preparar partida”, “Jogar” e “Simular”.

Não deve ser um dashboard cheio de números. É uma fila editorial: o que exige atenção agora aparece primeiro.

### 2. Prancheta

Substitui completamente a aba “Jogador” e vira a assinatura do modo:

- Plano A e Plano B;
- formação inicial entre as formações reais do botão;
- comportamento quando estiver vencendo, empatando ou perdendo;
- gatilho de Plano B por placar e momento;
- foco de treino do próximo bloco;
- capitão;
- ordem de pênaltis;
- instrução simples para reposição depois de gol ou mudança de período;
- identidade do técnico e histórico de filosofia.

Só devem existir controles que alterem algo real no motor ou na simulação. Não criar sliders como “largura 47” ou “pressão 63” se as peças não forem executar essa diferença.

### 3. Time

É a área operacional mais rica, com três visões internas sem criar outra aba inferior:

#### Mesa

- cinco titulares posicionados na formação escolhida;
- três reservas diretamente abaixo;
- arrastar/tocar para trocar titular e reserva;
- OVR, posição, forma, moral e condição essenciais;
- alerta de improvisação posicional;
- previsão simples do que o 5+3 ganha e perde.

#### Elenco

- 14 jogadores materializados: cinco titulares, três no banco e seis fora da partida;
- filtros curtos por posição e situação;
- detalhe individual com contrato, papel, forma, condição, moral, minutos e histórico;
- definir papel esperado: estrela, titular, rotação, reserva ou jovem;
- renovar, liberar, emprestar, listar e conversar;
- lesão e suspensão visíveis no cartão, sem abrir outra planilha.

#### Mercado

- necessidades do elenco em primeiro lugar;
- três a cinco nomes observados por necessidade;
- compra, empréstimo e agente livre;
- propostas recebidas;
- impacto em orçamento, salários, posição e promessa de minutos;
- lista curta de observação.

O mercado fica dentro de Time para preservar as seis abas.

### 4. Histórico

- temporadas, clubes, demissões, pedidos de saída e ofertas aceitas;
- títulos, campanhas e partidas decisivas;
- escalações marcantes e jogadores mais utilizados;
- reencontros com ex-clubes e ex-atletas.

### 5. Estatísticas

- resultados do time;
- gols, assistências, uso, distância ativa e condição dos jogadores;
- desempenho por formação e Plano A/B;
- comparação por temporada;
- estatísticas compactas e filtráveis, não uma tabela infinita.

### 6. Mundo

- classificações e competições;
- notícias de clubes e jogadores persistentes;
- mercado global resumido;
- empregos disponíveis e técnicos demitidos;
- seleções e convocações quando carreiras de seleção forem habilitadas.

## 6. Estado da carreira de técnico

O modo precisa de um estado próprio, versionado e discriminado. Ele não deve fingir ser um `GameState` de jogador.

### Núcleo do técnico

- ID, nome, nacionalidade, aparência e origem;
- temporada e clube atual;
- reputação;
- confiança da diretoria;
- confiança do vestiário;
- apoio da torcida;
- segurança do cargo;
- filosofia e preferências registradas pelas decisões reais;
- objetivos atuais;
- histórico de empregos, contratos, demissões, títulos e recordes;
- propostas e entrevistas pendentes.

### Núcleo do clube

- orçamento de transferências;
- compromisso salarial total e limite salarial;
- objetivo de temporada;
- posição/campanhas atuais;
- 14 jogadores relevantes;
- escalação 5+3;
- Planos A e B;
- treino do bloco;
- notícias, promessas e conflitos ativos.

### Separação de dados dos atletas

`WorldPlayer` deve continuar sendo a identidade canônica. O Modo Técnico adiciona uma camada compacta por `playerId`, apenas para jogadores relevantes:

- moral;
- forma;
- condição física entre partidas;
- ritmo de jogo;
- lesão e prazo;
- suspensão;
- papel prometido e satisfação com minutos;
- salário e valor de mercado;
- capitão e ordem de pênaltis;
- estatísticas da temporada;
- atributos derivados de mesa: potência, controle e resistência;
- no máximo um ou dois traços realmente perceptíveis.

Não materializar todos os milhares de jogadores do mundo com esse estado. Isso aumentaria o save sem melhorar a experiência.

## 7. Elenco, contratos e mercado

### Tamanho e convocação

- Núcleo do clube: 14 jogadores persistentes, que já é suportado pela base atual.
- Lista de jogo: cinco titulares + três reservas.
- Seis jogadores ficam fora e podem gerar decisões de rotação, moral e mercado.
- O adversário precisa ao menos materializar os oito relacionados da partida para que escalação, stamina e trocas sejam reais dos dois lados.

### Qualidades do jogador

OVR continua sendo leitura geral, mas a partida precisa de diferenças visíveis:

- **Potência:** força máxima do toque.
- **Controle:** precisão do toque.
- **Resistência:** quanto caminho ativo a peça suporta antes de perder rendimento.
- **Posição/encaixe:** decide o setor adequado e o custo de improvisar.
- **Traços raros:** exemplos possíveis são pulmão de aço, decisivo ou versátil, apenas se houver efeito legível.

Não criar dezenas de atributos só para preencher uma ficha.

### Contratos e promessas

- duração, salário e papel esperado;
- renovação rápida com no máximo poucas contrapropostas;
- promessa de minutos ligada à convocação e uso real;
- insatisfação pode afetar moral, vestiário, pedido de saída e valor;
- decisões precisam produzir notícia e memória no save quando forem importantes.

### Mercado comprimido

- O técnico aponta uma necessidade, não percorre centenas de linhas.
- Observação entrega poucos candidatos, com nível de informação proporcional ao conhecimento.
- Proposta cabe em uma tela: taxa, salário, duração, papel e impacto no orçamento.
- A IA usa necessidades reais da lista, idade, contrato e força do clube.
- Comprar, vender, emprestar, receber de volta e contratar livre reaproveitam o universo persistente.
- Uma entrada anual de dois ou três jovens pode renovar o elenco sem exigir uma academia completa no primeiro lançamento.

Finanças detalhadas de estádio, patrocinadores, ingressos, equipe médica e funcionários não são necessárias para a primeira versão. Orçamento de transferências e folha salarial já sustentam as decisões importantes.

## 8. Tática que existe de verdade na mesa

As seis formações atuais devem ser reaproveitadas como posições concretas das peças.

### Plano A

- formação inicial;
- cinco titulares;
- capitão e pênaltis;
- foco de jogo simples, somente se modificar decisões reais da IA/peças.

### Plano B

- outra formação;
- substituições sugeridas ou pré-planejadas;
- gatilhos como “perdendo no trecho final” ou “vencendo por um gol”.

O Plano B não deve teletransportar peças no meio de uma jogada. Ele passa a valer depois de um gol ou na mudança de período, nunca durante a física em movimento.

A rotação automática de formação depois de todo gol, existente hoje, deve deixar de comandar partidas do Modo Técnico. O plano escolhido pelo técnico precisa ser a fonte da formação.

## 9. Stamina dentro da partida

### Regra central

O fôlego diminui somente pela distância realmente percorrida pela peça que aquele lado escolheu e moveu no seu próprio toque.

Passo conceitual:

1. Ao começar um toque, registrar o `playerId/bodyId` ativo.
2. Enquanto a física resolve, somar a distância quadro a quadro apenas dessa peça.
3. Encerrar a medição quando a jogada assentar.
4. Converter essa distância em custo de fôlego usando a resistência do atleta.

### O que conta

- todo o caminho real da peça selecionada depois do próprio toque;
- continuação, desvio e rebote dessa mesma peça enquanto a jogada ainda resolve;
- o mesmo cálculo para a peça escolhida pela CPU.

### O que não conta

- peças empurradas ou atingidas por outra peça;
- reposicionamento de formação;
- colocação automática depois de gol ou mudança de período;
- animação, correção de sobreposição ou carregamento de save;
- tempo parado;
- deslocamento da bola.

Isso atende exatamente à ideia “só conta o que você mesmo moveu”. O usuário passa a escolher entre insistir no melhor botão ou conservar esse jogador para o fim.

### Valor inicial e efeito

Cada atleta entra com fôlego baseado em:

- condição entre partidas;
- atributo de resistência;
- lesão/recuperação quando aplicável.

O fôlego ao vivo não deve alterar OVR, tamanho ou massa da peça. Ele afeta progressivamente apenas qualidades que o jogador percebe:

- potência máxima do toque;
- margem de erro/controle;
- eventualmente a estabilidade em toques muito fortes, se os testes mostrarem necessidade.

Não deve existir drenagem passiva por tempo. O sistema é sobre **uso da peça**, não sobre um cronômetro invisível.

Faixas iniciais para protótipo podem ser “fresco”, “cansado” e “esgotado”, mas limites e coeficientes só podem ser fixados depois de simulações em lote. O objetivo é permitir que um uso equilibrado preserve os cinco, enquanto abusar de uma peça forte cobre um preço perceptível sem inutilizá-la cedo demais.

### Interface de stamina

- A peça usa apenas um filete discreto verde, âmbar ou vermelho.
- A peça selecionada mostra o valor exato no HUD inferior.
- O painel de troca mostra o valor exato dos cinco em campo e dos três reservas.
- Não manter dez barras grandes sobre a mesa.
- O adversário deve receber informação equivalente ou uma regra explicitamente simétrica; nunca pode existir stamina secreta favorável à CPU.

### Relação com a temporada

- Distância ativa e minutos/participação geram carga da partida.
- A carga reduz condição entre partidas.
- Treino de recuperação melhora condição, mas sacrifica evolução ou preparação tática.
- Reserva não usada se recupera melhor e pode cobrar minutos depois.

Nos pênaltis, o fôlego restante pode continuar afetando potência/controle, mas as cobranças não precisam gerar nova carga de temporada porque a partida já terminou. A fila de cobradores deve usar os cinco que terminaram o jogo.

## 10. Substituições

### Regra recomendada

- três reservas relacionados;
- até três substituições;
- sem reentrada;
- qualquer jogador disponível pode substituir qualquer titular;
- improvisação posicional continua possível, com custo claramente exibido;
- a CPU segue exatamente os mesmos limites.

### Fluxo durante o jogo

1. Em uma fase de mira ou pausa válida, tocar em **Trocas (3)**.
2. Escolher quem sai e quem entra.
3. A troca fica marcada como pendente: “entra no próximo gol ou pênalti por demora”.
4. O jogo continua sem alterar atributos, rosto ou identidade.
5. Quando acontecer um gol ou for marcado um pênalti por demora, todas as trocas pendentes são aplicadas.

O usuário pode cancelar a fila até a parada válida. Não se pode abrir ou confirmar uma troca enquanto a física está resolvendo.

### Momento de entrada

Existem exatamente duas paradas que ativam uma troca:

- **gol**, antes da nova saída de bola;
- **pênalti por demora**, depois que a infração é marcada e antes da cobrança.

Durante a própria tela de gol ou de pênalti por demora, também é possível montar uma troca e aplicá-la naquela parada, antes de a partida continuar. Mudança de período, pausa manual, toque assentado, trave ou rebote na tabela não ativam substituição. Se a partida terminar sem gol nem pênalti por demora depois que a troca foi pedida, ela não acontece.

### Como a peça entra

- Depois de gol, quando a formação é recolocada para a saída, o reserva ocupa o slot definido pela nova escalação/plano.
- No pênalti por demora, sem uma reposição geral da formação, o reserva assume as coordenadas atuais da peça substituída. Isso evita usar a troca como teletransporte tático.
- Identidade, número, aparência, posição, potência, controle, resistência e fôlego passam a ser os do reserva.
- O jogador que saiu fica inelegível e não pode voltar.
- A ordem de pênaltis é reconstruída com os cinco elegíveis.
- A linha do tempo registra minuto, placar, quem saiu e quem entrou.

### Interface rápida

- botão compacto acessível pelo polegar;
- folha inferior com titulares, fôlego e reservas;
- seleção em no máximo três toques;
- marca clara na peça que sairá e no reserva que entrará;
- execução automática na parada válida, com faixa de transmissão de menos de um segundo;
- alterações do adversário também são anunciadas.

Gol e pênalti por demora não devem abrir um menu ilimitado. A fila já preparada pode ser aplicada imediatamente; se o usuário decidir trocar naquela parada, recebe apenas um painel curto antes da continuação. Isso mantém a partida rápida.

## 11. Paradas válidas sem mudar a mesa

No vocabulário desta proposta, “a bola sair” significa **gol ou pênalti por demora**. Não significa atravessar lateral ou linha de fundo.

### Regra preservada

- a bola e as peças continuam rebatendo nas tabelas;
- não existem lateral, escanteio ou tiro de meta;
- o gol mantém a saída central e a reposição de formação já existentes;
- o pênalti por demora continua sendo a punição de inatividade do motor atual;
- nenhuma regra de limite de campo precisa ser criada para o Modo Técnico.

### Ativação das trocas

- O evento de gol fecha primeiro a autoria do gol e o placar; depois executa as trocas, atualiza a escalação e monta a saída.
- O evento de pênalti por demora interrompe a jogada; depois executa as trocas antes de definir os atletas elegíveis para a cobrança.
- Se os dois lados possuem trocas pendentes, elas entram na mesma parada, sem prioridade escondida.
- Uma mudança escolhida dentro da própria tela da parada entra antes da retomada.
- Uma troca pendente não cria por conta própria um reinício nem para o relógio.

### Novos estados e eventos conceituais

- fila de substituição por lado;
- janela curta de troca na fase de gol;
- janela curta de troca na fase de pênalti por demora;
- substituição executada;
- formação/plano alterado;
- narrativa e acessibilidade para todos eles.

O contador de turnos não pode ser usado como trava de “a CPU já jogou”, porque o motor atual já permite devolver a vez sem avançar esse contador depois de um gol ou mudança de período.

## 12. IA do técnico adversário

A CPU precisa treinar e escalar o adversário de forma suficiente para a partida, sem simular uma interface inteira que ninguém vê.

### Antes do jogo

- escolhe os melhores cinco por encaixe, condição e forma;
- relaciona três reservas úteis;
- escolhe formação coerente com força, adversário e momento;
- define Plano B e pênaltis.

### Durante o jogo

A CPU avalia trocas somente em momentos discretos, não a cada quadro:

- fôlego baixo;
- diferença de qualidade para o reserva;
- encaixe posicional;
- placar e tempo;
- necessidade ofensiva ou defensiva;
- lesão, quando esse sistema estiver ativo.

Ela deve enfileirar a troca e esperar o mesmo gol ou pênalti por demora que o usuário. Também pode decidir durante uma dessas paradas. A decisão é seedada e determinística. A dificuldade pode melhorar a leitura e o momento, mas nunca conceder stamina extra, troca instantânea ou informação impossível.

### Simulação headless

- deve usar as mesmas identidades, stamina, gatilhos de gol/pênalti por demora e limite de trocas;
- ambos os lados são controlados pela mesma política de IA;
- um resultado simulado precisa continuar sendo possível no jogo manual;
- decisões de escalação e treino devem alterar tanto a partida jogada quanto a simulada.

## 13. Resultado e memória da partida

O resultado do modo técnico precisa guardar um relatório compacto por jogador:

- `playerId`;
- titular ou reserva;
- momento em que entrou e saiu;
- fôlego inicial e final;
- distância ativa;
- toques/flicks;
- contatos na bola;
- gols e assistências;
- cartão/lesão se esses sistemas forem adicionados;
- condição gerada para o próximo bloco.

A linha do tempo ganha trocas, pênalti por demora e mudança de plano.

O save não deve guardar estados de física a 60/120 Hz. Replays continuam efêmeros/compactados. Fechar durante a partida pode reiniciar o mesmo confronto a partir da seed, como já acontece, desde que isso seja comunicado ao jogador.

## 14. Simulação de temporada

A simulação atual é centrada no protagonista e não pode ser reaproveitada como se já fosse uma simulação de técnico.

O novo simulador precisa considerar:

- qualidade e encaixe do 5+3;
- condição, forma e moral;
- Plano A/Plano B;
- força do adversário;
- mando e competição;
- lesões e suspensões;
- rotação entre blocos;
- decisões de treino;
- profundidade do elenco.

Partidas-chave simuladas devem usar o motor headless completo. Blocos de jogos comuns podem usar uma simulação agregada derivada dos mesmos fatores, para manter a carreira rápida. Os dois caminhos precisam ser calibrados juntos para não produzir tabelas incompatíveis.

## 15. Diretoria, vestiário e carreira

### Diretoria

- um objetivo principal e, no máximo, um secundário;
- paciência baseada no tamanho do clube e contexto;
- confiança alterada por resultado, estilo prometido, finanças e evolução de jovens;
- aviso claro antes de uma demissão, salvo crise extrema coerente.

### Vestiário

- satisfação individual alimenta uma confiança coletiva;
- capitães e jogadores importantes pesam mais;
- promessas quebradas, banco, venda de ídolo e sequência ruim geram histórias;
- conversa deve ser uma decisão pontual, não um minijogo repetitivo toda semana.

### Torcida e imprensa

- clássicos, resultados, contratações e estilo afetam apoio;
- coletivas aparecem em momentos de consequência;
- não repetir perguntas sem impacto.

### Mercado de trabalho

- ofertas coerentes com reputação e resultados;
- entrevista curta com objetivo e orçamento claros;
- pedir demissão, recusar, aceitar e ser demitido;
- período desempregado avança em blocos e oferece oportunidades;
- histórico preserva todos os clubes e reencontros.

### Seleções

Carreira de seleção é uma extensão natural, mas não precisa bloquear a primeira versão. Quando entrar:

- proposta baseada em nacionalidade, reputação e desempenho;
- convocações 5+3 a partir dos mesmos `World Players`;
- torneios comprimidos e partidas-chave;
- possibilidade de acumular clube e seleção somente se a regra for simples e explícita.

## 16. Treino, forma, condição, lesões e suspensões

O treino deve ser uma escolha por bloco:

- **Recuperação:** recupera condição, reduz preparação/evolução.
- **Técnico:** melhora potência/controle e desenvolvimento.
- **Físico:** melhora resistência/condição futura, aumenta carga imediata.
- **Tático:** melhora adaptação ao Plano A/B e reduz custo de improviso.

Não montar calendários diários.

Forma representa desempenho recente. Condição representa capacidade física atual. Moral representa satisfação. Ritmo representa prontidão por uso. Esses quatro conceitos precisam ter nomes e efeitos distintos na interface.

Lesões e suspensões são importantes para rotação e histórias, mas a primeira implementação pode começar com eventos de disponibilidade entre partidas. Lesões físicas dentro da mesa só devem ser adicionadas se houver uma regra justa e visível; não devem surgir aleatoriamente apenas porque a stamina ficou baixa.

## 17. Arquitetura recomendada

### Domínio do técnico

Criar módulos independentes para:

- modelo e normalização do `ManagerState`;
- escalação e convocação 5+3;
- condição, forma, moral e ritmo;
- treino;
- tática e planos;
- simulação de blocos/temporada;
- objetivos, diretoria e empregos;
- mercado, contratos e promessas;
- eventos e narrativa;
- compactação do save.

Componentes React apenas apresentam e disparam decisões. Regras não devem morar nas telas.

### Módulo de botão

O motor continua autônomo e não importa `ManagerState`, clube ou liga. Seu contrato genérico precisa evoluir para aceitar:

- oito jogadores por lado, com IDs persistentes;
- cinco titulares e três reservas;
- potência, controle, resistência, stamina inicial, posição, número e visual por atleta;
- formação/plano inicial;
- política de ativação de troca por gol/pênalti por demora;
- política de troca para lados controlados pela CPU.

Mudanças internas necessárias:

- corpo ligado ao `playerId`, não apenas ao slot;
- medição de distância ativa;
- stamina e efeitos;
- fila de troca ligada aos eventos de gol e pênalti por demora;
- fila e execução de substituições;
- atualização de pênaltis e resultado individual;
- HUD/render dos atletas;
- paridade no simulador headless.

O adaptador continua sendo a única ponte da carreira para o motor.

### Aparência

A aparência deve ser resolvida por `playerId`. Trocar uma peça ou mudar a formação não pode trocar rostos, números ou identidade entre atletas.

## 18. Save, migração e compatibilidade

- Introduzir uma união discriminada de saves: carreira de jogador ou técnico.
- Dar ao `ManagerState` sua própria versão e normalizador.
- Atualizar metadados dos slots; “posição MEI” e OVR individual não fazem sentido para técnico.
- Nunca tentar abrir um save de técnico com o normalizador da carreira de jogador.
- Preservar todos os saves atuais sem migração destrutiva.
- Guardar apenas overlays dos jogadores materializados e relatórios compactos.
- Continuar removendo replays pesados da persistência.
- Seedar formação da CPU, mercado, eventos e simulação para retomada reproduzível.

## 19. Testes obrigatórios

### Stamina

- conta o caminho da peça selecionada;
- inclui o rebote da própria peça durante a jogada;
- ignora peças empurradas;
- ignora reposições automáticas;
- é idêntica para usuário e CPU;
- é determinística com a mesma seed e entrada;
- respeita resistência e condição inicial;
- afeta potência/controle nos limites definidos.

### Substituição

- nunca entra durante `resolving`;
- entra no primeiro gol ou pênalti por demora;
- cancela corretamente;
- permite múltiplas trocas na mesma parada;
- respeita limite de três;
- impede reentrada;
- preserva coordenadas no pênalti por demora;
- usa slot de formação depois de gol;
- atualiza rosto, número, ratings, timeline e pênaltis;
- CPU obedece às mesmas regras.

### Mesa fechada e gatilhos

- bola e peças continuam rebatendo em todas as bordas fora do gol;
- nenhuma lateral, escanteio ou tiro de meta é criado;
- rebote, trave, toque assentado, pausa e mudança de período não ativam troca;
- gol ativa a fila depois de registrar o lance e antes da saída;
- pênalti por demora ativa a fila antes da cobrança;
- os dois lados aplicam trocas pendentes de forma simétrica;
- relógio, fase de gol, pênalti e retomada não travam.

### Simulação e save

- jogado e headless usam as mesmas regras;
- mesma seed gera mesma decisão da CPU;
- fechar/reabrir não corrompe fila ou carreira;
- compactação não perde estatísticas necessárias;
- saves antigos continuam válidos;
- mil temporadas simuladas não explodem tamanho ou tempo.

### Mobile e acessibilidade

- 390 px sem colisão ou overflow;
- escalação 5+3 legível;
- troca operável com uma mão;
- foco, leitor de tela e região `aria-live` narram trocas e pênalti por demora;
- `prefers-reduced-motion` respeitado;
- estados não dependem só de cor.

## 20. Balanceamento a medir

Nada abaixo deve ser escolhido “no olho”. O laboratório precisa medir:

- distância ativa média por peça e por partida;
- concentração de uso na melhor peça;
- fôlego final por posição/atributo;
- frequência e minuto das trocas humanas e da CPU;
- efeito de um reserva forte e de um banco fraco;
- frequência de gols e pênaltis por demora disponíveis para ativar trocas;
- percentual de trocas pedidas que efetivamente entram;
- vantagem de quem inicia;
- impacto real de formação e Plano B;
- diferença entre jogar e simular;
- temporada de time favorito, médio e azarão;
- taxa de demissão e mobilidade de carreira;
- tamanho do save após várias décadas.

Critérios de saúde propostos:

- usar sempre a mesma peça deve ser possível, mas claramente pior no fim;
- distribuir toques entre as cinco deve ser uma estratégia válida;
- uma substituição bem escolhida pode decidir uma partida, mas não garantir gol;
- a CPU deve trocar com frequência plausível e não desperdiçar todas as trocas cedo;
- a janela de troca em gol/pênalti não pode quebrar o ritmo de dois minutos;
- o melhor elenco não pode eliminar zebras, e o pior não pode vencer por puro ruído.

## 21. Riscos principais

- **Poucas paradas válidas:** jogos sem gol ou pênalti por demora podem terminar sem permitir a troca já pedida; isso precisa ser uma tensão intencional, não um bug escondido.
- **Identidade por slot:** manter IDs anônimos causaria rosto/atributo errado depois da troca.
- **Dois simuladores:** temporada e partida podem divergir se usarem fatores diferentes.
- **Save pesado:** detalhar todos os jogadores do mundo seria insustentável.
- **CPU cara:** a IA já clona a física para avaliar jogadas; o estado de stamina deve ser compacto e a decisão de troca não pode rodar em cada candidato/quadro.
- **Interface lotada:** stamina, tática e troca podem cobrir a mesa se não houver divulgação progressiva.
- **Stamina irrelevante ou punitiva:** coeficientes errados transformam o sistema em decoração ou impedem usar a melhor peça.
- **Conteúdo repetitivo:** entrevistas e conflitos sem consequência viram burocracia.
- **Escopo infinito:** estádio, funcionários, patrocínios detalhados e dezenas de atributos podem atrasar o núcleo divertido.

## 22. Ordem de construção futura

### Fase 0 — Contratos e prova das regras

- fechar o contrato de `ManagerState`;
- fechar 14 jogadores, 5+3 e três trocas;
- prototipar a fila ativada apenas por gol/pênalti por demora e medir quantas trocas realmente entram;
- prototipar distância ativa e curvas de stamina;
- criar testes reais do motor antes de ampliar a UI.

### Fase 1 — Base da carreira

- save de técnico e seletor de modo;
- criação do técnico e escolha de clube;
- World Players + overlay do elenco;
- escalação 5+3 e contratos básicos;
- Central, Prancheta e Time navegáveis.

### Fase 2 — Partida completa de técnico

- identidades completas dos dois lados;
- formação comandada pelo plano;
- integração da fila com gol e pênalti por demora;
- stamina;
- substituições humanas e da CPU;
- relatório individual e headless equivalente.

### Fase 3 — Temporada e consequências

- blocos de temporada;
- objetivos/diretoria e demissão;
- forma, moral, condição, ritmo, lesões e suspensões;
- treino;
- narrativa do vestiário e imprensa;
- estatísticas/histórico.

### Fase 4 — Mercado e carreira longa

- orçamento e folha;
- compra, venda, empréstimo, renovação e agentes livres;
- empregos e entrevistas;
- jovens;
- mundo e notícias do mercado;
- eventual carreira de seleção.

### Fase 5 — Balanceamento e acabamento

- Monte Carlo de partida e carreira;
- testes de saves longos;
- acessibilidade e celulares pequenos;
- performance Android;
- tutorial contextual;
- telemetria local de balanceamento, sem exigir coleta de dados pessoais.

## 23. Escopo mínimo que já parece um modo completo

O primeiro lançamento só deve ser chamado de Modo Técnico quando possuir, em conjunto:

- carreira e save próprios;
- clube, objetivo e risco de emprego;
- elenco persistente de 14;
- escalação real de cinco + três reservas;
- Central, Prancheta e Time funcionais;
- treino/condição/moral suficientes para criar rotação;
- mercado e contratos básicos;
- temporada comprimida com partidas-chave;
- partidas com oito jogadores individualizados por lado;
- stamina por distância ativa;
- ativação de trocas apenas em gol ou pênalti por demora;
- substituições do usuário e do adversário;
- simulação headless equivalente;
- histórico, estatísticas e consequências de carreira;
- testes de física, IA, save e mobile.

Sem stamina e troca da CPU sob os mesmos gatilhos, a mecânica pedida fica incompleta. Sem temporada comprimida, diretoria e mundo persistente, vira apenas um editor de escalação. O modo interessante nasce da ligação entre as duas metades: **a decisão rápida fora da mesa muda o que acontece dentro dela, e a partida devolve consequências para a carreira**.

## 24. Decisões recomendadas para congelar antes de codificar

1. Manter 14 jogadores e convocação 5+3.
2. Adotar três substituições, sem reentrada.
3. Aplicar troca pendente somente depois de gol ou na marcação de pênalti por demora.
4. Manter a mesa fechada, sem lateral, escanteio ou tiro de meta.
5. Preservar inicialmente a mesa com tabelas nos modos atuais.
6. Medir stamina apenas pela distância da peça selecionada no próprio toque.
7. Fazer stamina afetar potência e controle, nunca OVR/tamanho/massa.
8. Substituto assume a posição física do substituído no pênalti por demora e o slot planejado depois de gol.
9. Trocar a aba Jogador por Prancheta e manter seis abas.
10. Colocar Mesa, Elenco e Mercado dentro de Time.
11. Usar Jogos-chave como ritmo padrão da temporada.
12. Não lançar funcionário, estádio ou finanças profundas antes do núcleo 5+3 estar divertido.
