# Modo Técnico essencial — plano filtrado

> Documento de produto e arquitetura. Não implementa o modo. Esta versão substitui o plano amplo anterior e mantém somente o que sustenta a identidade e a diversão do Futbobo.

## 1. Definição em uma frase

O Modo Técnico é a carreira atual vista do banco: o jogador continua tomando decisões rápidas, simulando temporadas e jogando partidas-chave, mas agora escolhe os cinco titulares, os três reservas, a formação e as trocas durante a mesa.

Não é um simulador administrativo e não deve tentar reproduzir Football Manager.

## 2. Filtro obrigatório

Um sistema só entra se cumprir pelo menos uma destas funções:

1. muda quem entra na mesa;
2. muda como uma peça se comporta na partida;
3. muda um resultado ou o futuro da carreira;
4. cria uma decisão curta com consequência clara.

Se uma informação existir apenas para preencher uma tela, ela sai. Se o jogador precisar visitar um submenu escondido para o jogo continuar, o fluxo está errado. O que exige ação deve aparecer automaticamente na aba Carreira.

## 3. Base real que já existe

- O jogo já possui o esqueleto de modo `manager`, mas ainda não possui um estado real de técnico.
- O universo de `World Players` já mantém jogadores persistentes e materializa um núcleo de 14 atletas por clube.
- A aba Time já representa cinco titulares e três reservas.
- A carreira já trabalha com decisões, simulação de temporada, partidas-chave, resultados e histórico.
- A mesa já possui cinco peças, seis formações, IA, pênaltis e simulação headless usando o mesmo motor.
- A mesa é fechada: bola e peças rebatem nas tabelas. Isso permanece igual.
- Hoje apenas o protagonista possui identidade individual na partida; as outras peças ainda são slots anônimos.
- A fadiga atual é anual e pertence à carreira de jogador. Não existe stamina ao vivo por peça.

O novo modo deve ampliar essas bases, não substituí-las por outro fluxo.

## 4. Fluxo completo da carreira

### Criação

Somente três escolhas:

1. nome do técnico;
2. nacionalidade;
3. clube inicial.

Não incluir origem profissional, árvore de habilidade, licença, equipe técnica ou atributos do treinador na primeira versão.

### Temporada

O ritmo deve continuar próximo ao da carreira de jogador:

1. aba Carreira apresenta o objetivo e a próxima decisão;
2. o técnico pode revisar formação e 5+3;
3. resolve uma decisão/evento curto;
4. a temporada ou bloco é simulado;
5. partidas-chave entram na fila atual de Jogar/Simular;
6. o resultado altera confiança, reputação e futuro no clube;
7. no fim da temporada pode aparecer uma contratação, venda ou proposta de emprego.

Não criar calendário semanal, 38 telas de rodada ou capítulos artificiais. Um checkpoint extra só aparece quando há algo concreto para decidir, como desfalque, janela ou risco de demissão.

### O que torna o modo diferente

- o técnico escolhe os oito relacionados;
- a formação escolhida é realmente usada na mesa;
- todas as peças têm jogador, rosto, posição e OVR próprios;
- usar demais uma peça consome o fôlego dela;
- reservas podem entrar a qualquer momento válido;
- resultados afetam permanência no cargo e oportunidades futuras.

Essas são as diferenças centrais. Todo o resto é suporte.

## 5. Navegação: o mesmo esqueleto, levemente adaptado

Continuam existindo exatamente seis abas.

### 1. Carreira

Mantém o papel atual de conduzir o save. Mostra apenas:

- clube e temporada;
- objetivo da diretoria;
- confiança no trabalho;
- próxima decisão;
- próximo jogo-chave;
- ação principal para continuar.

Contratação, venda, desfalque ou proposta de emprego aparecem aqui quando precisam de resposta. Não exigem que o jogador procure uma tela escondida.

### 2. Prancheta

Substitui Jogador e responde uma única pergunta: **como os cinco começarão a próxima partida?**

- escolha entre as seis formações já existentes;
- prévia visual dos cinco titulares naquela formação;
- adversário, força e formação provável quando houver jogo pendente;
- aviso simples de peça improvisada.

Não possui Plano A/Plano B, sliders, treino, capitão, instruções por jogador ou gatilhos automáticos. A formação pode ser alterada antes do jogo; durante a partida ela só é reorganizada nos reinícios que o motor já possui.

### 3. Time

Uma única página, sem labirinto de submenus:

- campo com cinco titulares;
- faixa com três reservas;
- o banco fecha o elenco com exatamente três reservas;
- tocar em um titular e depois em um reserva troca os dois;
- cada jogador mostra somente foto, nome, posição, idade, OVR e disponibilidade.

Quando a janela estiver aberta, a própria página pode exibir uma ação curta de mercado. Fora da janela, nenhum botão de mercado vazio ocupa espaço.

### 4. Histórico

Reutiliza a estrutura atual com perspectiva do técnico:

- clubes;
- temporadas;
- títulos;
- partidas jogadas;
- demissões e saídas.

### 5. Estatísticas

Somente números úteis:

- campanha do clube;
- gols e assistências dos jogadores;
- partidas e uso de cada atleta;
- formações mais usadas;

Não criar dezenas de filtros ou relatórios de scouting.

### 6. Mundo

Reutiliza o mundo persistente atual:

- tabelas e competições;
- transferências importantes;
- jogadores relevantes;
- notícias essenciais.

Empregos aparecem na aba Carreira quando viram proposta real. Não precisam de uma central permanente de vagas.

## 6. Estado mínimo do técnico

O save de técnico precisa guardar somente:

- versão e modo;
- nome e nacionalidade;
- clube e temporada;
- confiança da diretoria;
- reputação do técnico;
- objetivo atual;
- orçamento simples de transferências;
- universo de jogadores já existente;
- IDs dos cinco titulares;
- IDs dos três reservas;
- formação escolhida;
- competições, fila de partidas, resultados e histórico;
- propostas ou decisões realmente pendentes.

Não criar no lançamento:

- confiança separada de torcida e vestiário;
- atributos do técnico;
- funcionários;
- instalações;
- salários e folha detalhada;
- promessas de minutos;
- hierarquia de papéis do elenco;
- forma, ritmo, moral e condição como quatro barras diferentes.

A confiança da diretoria é o único medidor de risco. A reputação existe para ofertas de emprego e pode permanecer discreta.

## 7. Elenco e mercado mínimos

### Elenco

- O elenco do técnico possui exatamente oito jogadores persistentes.
- Cinco começam como titulares e três formam todo o banco; não existe grupo fora da relação.
- Os seis restantes só precisam aparecer como opções de escalação.
- Lesão ou suspensão pode tornar um jogador indisponível por evento, sem criar departamento médico.
- OVR e posição determinam encaixe e qualidade.

Na primeira versão, não adicionar stamina permanente, treino ou recuperação entre partidas. Todo jogador disponível começa a partida com o fôlego cheio. Isso mantém o novo sistema dentro da mesa, onde ele é visível e divertido.

### Mercado

O mercado é uma decisão de janela, não um catálogo infinito:

1. o jogo mostra a principal carência do elenco;
2. apresenta até três candidatos;
3. o técnico pode contratar um, recusar ou vender/substituir alguém;
4. o orçamento é atualizado;
5. o jogador passa a fazer parte dos mesmos `World Players` persistentes.

Não incluir inicialmente salário, agente, bônus, observadores, negociação em várias rodadas ou lista com centenas de atletas. Contratos podem continuar sendo resolvidos pelo mundo existente e só aparecem ao técnico quando gerarem uma decisão importante.

## 8. Formação

- Reutilizar as seis formações atuais.
- O técnico escolhe uma antes da partida.
- A formação define posições concretas das cinco peças na saída.
- A CPU escolhe sua formação usando força e encaixe do próprio elenco.
- O Modo Técnico não gira automaticamente por todas as formações depois de cada gol.
- Depois de gol ou mudança de período, os cinco voltam para a formação escolhida.
- Não existe bônus oculto de “tática”. A vantagem vem das posições físicas das peças.

Isso dá autoria ao técnico sem introduzir controles que a física não representa.

## 9. Stamina essencial

### Regra

Todas as peças começam cada partida com 100 de fôlego. O fôlego diminui somente pela distância real percorrida pela peça que aquele lado escolheu e moveu no próprio toque.

### Conta

- o caminho da peça selecionada do início do toque até a física parar;
- desvios e rebotes dessa mesma peça durante a própria jogada;
- exatamente a mesma medição para a CPU.

### Não conta

- peças empurradas pela peça ativa;
- peças atingidas pela bola ou por outra peça;
- reposicionamento de formação;
- saída depois de gol;
- pênaltis, correções de sobreposição ou animações;
- tempo parado.

Não existe resistência individual na primeira versão. O consumo é determinado somente pelo quanto a peça foi usada, como pedido. Isso evita criar mais um atributo e torna a regra imediatamente compreensível.

### Efeito

O desgaste reduz gradualmente:

- potência máxima do toque;
- controle/precisão.

Não altera OVR, massa, tamanho ou raio da peça. Os coeficientes só podem ser definidos depois de simulação em lote.

### Interface

- filete discreto verde, âmbar ou vermelho na peça;
- valor exato apenas na peça selecionada e na tela de troca;
- nenhum conjunto permanente de dez barras sobre o campo;
- reserva entra com 100 de fôlego.

O fôlego zera sua história ao fim da partida. Não alimenta treino, lesão ou condição da temporada no lançamento.

## 10. Substituições imediatas

### Regra final

- três reservas;
- até três substituições;
- sem reentrada;
- sem desfazer depois de confirmar;
- permitidas somente quando é a vez daquele lado e a física está parada;
- proibidas enquanto uma jogada está sendo resolvida;
- proibidas depois que a disputa de pênaltis começou;
- a CPU segue as mesmas regras.

“Bola parada” deve ser um estado real do motor, como `aim` ou `kickoff`, e não apenas um instante em que a velocidade da bola chegou perto de zero durante a física.

### Fluxo

1. No próprio turno, tocar em **Trocas (3)**.
2. Escolher quem sai.
3. Escolher quem entra.
4. Conferir a troca em uma linha curta.
5. Confirmar.

Ao confirmar, a troca acontece imediatamente. Não existe fila, espera por gol, lateral, intervalo ou pênalti por demora.

Antes da confirmação é possível fechar o painel. Depois da confirmação:

- a substituição é consumida;
- o jogador que saiu não pode retornar;
- não existe botão de desfazer;
- a nova peça já pode executar o toque daquele turno;
- a troca não consome a vez.

### Posição e identidade

O reserva assume exatamente as coordenadas da peça substituída. A troca nunca reposiciona o time e não pode ser usada como teletransporte.

São atualizados:

- `playerId`;
- rosto e número;
- nome e posição;
- OVR, potência e controle;
- fôlego, começando em 100;
- elegibilidade para pênaltis;
- relatório individual da partida.

### Tempo

O relógio da partida e o contador de inatividade continuam correndo enquanto o painel está aberto. A troca precisa ser uma decisão rápida e não pode virar pausa tática ilimitada.

### CPU

A CPU avalia a troca apenas no início do próprio turno, usando:

- fôlego da peça;
- qualidade do reserva;
- posição;
- placar e tempo.

Ela confirma instantaneamente, mantém as coordenadas e respeita três trocas e ausência de reentrada. A dificuldade pode melhorar a decisão, nunca as regras ou o fôlego.

## 11. Partida com jogadores reais dos dois lados

O motor precisa receber oito atletas por equipe:

- cinco titulares;
- três reservas;
- ID persistente;
- nome, número, posição, OVR;
- potência e controle derivados;
- aparência ligada ao ID.

Os corpos físicos deixam de representar slots anônimos e passam a carregar a identidade do atleta atual. Uma mudança de formação ou substituição não pode trocar rostos entre jogadores.

O resultado precisa guardar somente o necessário por atleta:

- começou ou entrou;
- momento em que entrou/saiu;
- gols e assistências;
- toques realizados;
- distância ativa;
- fôlego final.

Replays e estados de física continuam compactos/efêmeros como hoje.

## 12. Carreira do técnico

### Diretoria

- Um objetivo por temporada.
- Uma barra de confiança.
- Resultados acima ou abaixo do objetivo alteram a confiança.
- Confiança muito baixa pode causar demissão.

Não criar reuniões, promessas, conselhos ou metas secundárias no lançamento.

### Reputação e empregos

- Resultado, títulos e dificuldade do clube alteram reputação.
- No fim da temporada podem surgir até três propostas coerentes.
- O técnico aceita, recusa ou permanece.
- Ser demitido leva a uma escolha curta de novo emprego, não a uma tela de espera semanal.

### Eventos

Reaproveitar o formato de decisões da carreira atual, mudando o ponto de vista:

- aceitar uma venda;
- contratar ou recusar um reforço;
- priorizar uma competição.
- aceitar ou recusar uma proposta de emprego.

Cada evento precisa alterar escalação, confiança, orçamento ou resultado. Evento sem consequência não entra.

## 13. O que foi deliberadamente cortado

- bola fora literal, lateral, escanteio e tiro de meta;
- fila de substituição e espera por parada especial;
- stamina carregada entre partidas;
- calendário e treino diário;
- Plano A/Plano B;
- capitão e instruções individuais;
- múltiplas barras de moral, forma, ritmo e condição;
- promessas de tempo de jogo;
- contratos e salários detalhados;
- scouting e lista global de mercado;
- comissão técnica;
- estádio e instalações;
- academia completa e categorias de base gerenciáveis;
- entrevistas de emprego longas;
- central de vagas;
- carreira de seleção no primeiro lançamento;
- estatísticas que não ajudam a escolher formação, jogador ou troca.

Esses itens não são “conteúdo futuro obrigatório”. Só devem voltar se o núcleo provar que sente falta deles.

## 14. Arquitetura mínima

### Carreira

- `ManagerState` próprio e versionado;
- normalizador e compactação próprios;
- reaproveitamento de competições, clubes e `World Players`;
- módulos pequenos para escalação, objetivo, confiança, mercado curto e simulação;
- telas sem lógica de domínio embutida.

### Mesa

O módulo continua independente da carreira. Seu contrato genérico passa a aceitar:

- oito jogadores por lado;
- formação inicial;
- stamina ao vivo;
- substituições imediatas;
- relatório individual.

O adaptador continua sendo a única ponte entre `ManagerState` e o motor.

### Simulação

A simulação headless precisa usar:

- os mesmos cinco e três reservas;
- a mesma formação;
- o mesmo consumo de stamina;
- a mesma decisão de substituição da CPU;
- os mesmos limites de troca.

Jogar e simular não podem se transformar em regras diferentes.

## 15. Ordem de implementação futura

### Fase 1 — Esqueleto jogável

- save de técnico;
- criação simples e escolha do clube;
- Carreira, Prancheta e Time;
- elenco fechado em oito, formação e 5+3;
- objetivo e confiança.

### Fase 2 — Mesa de técnico

- oito jogadores individualizados por lado;
- stamina por distância ativa;
- troca imediata e irreversível;
- decisão de troca da CPU;
- resultado individual e simulação headless equivalente.

### Fase 3 — Carreira completa mínima

- simulação de temporada na perspectiva do técnico;
- partidas-chave;
- mercado curto;
- propostas, demissão e troca de clube;
- histórico e estatísticas adaptados.

### Fase 4 — Balanceamento e acabamento

- simulações em lote;
- testes de saves longos;
- interface mobile;
- acessibilidade;
- performance no Android;
- tutorial contextual somente quando o recurso aparece.

## 16. Testes indispensáveis

### Stamina

- só a peça escolhida perde fôlego;
- peças empurradas não perdem;
- rebote da própria peça conta;
- reposições automáticas não contam;
- usuário e CPU usam a mesma fórmula;
- mesma seed produz o mesmo resultado.

### Trocas

- só abre no turno correto com física parada;
- não abre durante `resolving`;
- acontece imediatamente ao confirmar;
- não consome o turno;
- não pode ser desfeita;
- jogador substituído não volta;
- respeita limite de três;
- reserva herda coordenadas sem sobreposição;
- identidade, visual, atributos e pênaltis são atualizados;
- CPU obedece às mesmas regras.

### Fluxo

- nenhum submenu é obrigatório para avançar a temporada;
- decisão pendente sempre aparece em Carreira;
- 390 px não apresenta colisão ou overflow;
- escalação e troca são operáveis com uma mão;
- save de jogador antigo permanece intacto;
- partida jogada e simulada usam as mesmas regras.

## 17. Critério de conclusão

O Modo Técnico está pronto quando o jogador consegue:

1. criar o técnico e escolher um clube;
2. montar cinco titulares e três reservas;
3. escolher uma das formações existentes;
4. simular a temporada no mesmo ritmo atual;
5. jogar uma partida com atletas reais dos dois lados;
6. perceber uma peça cansar porque foi usada demais;
7. trocar imediatamente no próprio turno, sem reposicionar e sem desfazer;
8. ver a CPU fazer o mesmo;
9. receber consequência de resultado, confiança, mercado e emprego;
10. terminar uma carreira sem ter administrado telas que não queria abrir.

A assinatura do modo é simples: **cinco peças, três reservas, uma formação e decisões que aparecem diretamente na mesa**.
