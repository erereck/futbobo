import type { GameEvent } from "./game-data";

// ============================================================================
// BASTIDORES DA CARREIRA
// Tudo o que acontece longe das câmeras: comissão técnica, diretoria, olheiros,
// departamento de dados, psicólogo, preparador físico, negociações de bastidor,
// vestiário, equipe de apoio, base e arbitragem.
// ============================================================================

export const BACKSTAGE_EVENTS: GameEvent[] = [
  // ---- COMISSÃO TÉCNICA ----
  { id: "backstage-novo-tecnico-reseta-hierarquia", icon: "◇", tag: "COMISSÃO TÉCNICA", title: "O novo técnico zera tudo o que veio antes", description: "A comissão técnica inteira troca de uma vez e o discurso de apresentação deixa claro: ninguém tem vaga garantida.", minAge: 19, oneTime: true, choices: [
    { label: "Impressionar já no primeiro treino", hint: "42% · titularidade garantida ou marcado como ansioso", result: "Você decide não esperar para se apresentar.", effect: {}, luck: { chance: 42, successText: "O novo técnico te chama de lado e avisa: você já é peça pensada para o time principal.", failureText: "O excesso de vontade parece afobação e o novo técnico prefere te observar mais um pouco.", successEffect: { reputation: 8, leadership: 4, minutes: 6 }, failureEffect: { morale: -6, minutes: -3 } } },
    { label: "Deixar o trabalho falar aos poucos", hint: "Adaptação ↑ · seguro", result: "Você prefere se mostrar todos os dias, sem discurso.", effect: { adaptation: 6, morale: 2 } },
  ]},
  { id: "backstage-plano-individualizado", icon: "◧", tag: "COMISSÃO TÉCNICA", title: "Um plano de desenvolvimento só seu", description: "A comissão técnica monta uma reunião individual com metas específicas para os próximos meses, fora do que é cobrado do grupo.", minAge: 19, maxAge: 27, choices: [
    { label: "Seguir o plano à risca", hint: "Potencial ↑↑", result: "Você aceita as exigências extras sem reclamar de nenhuma delas.", effect: { potential: 3, fitness: -3 } },
    { label: "Adaptar o plano ao seu próprio ritmo", hint: "OVR ↑ · atrito leve", result: "Você negocia ajustes, mesmo sabendo que isso incomoda um pouco a comissão.", effect: { ovr: 1, adaptation: -2 } },
  ]},
  { id: "backstage-experimento-tatico-tira-voce", icon: "▤", tag: "COMISSÃO TÉCNICA", title: "Um experimento tático tira você do time", description: "Sem nenhuma queda de rendimento visível, o treinador testa um esquema novo que simplesmente não tem espaço para sua posição.", needsSquadRoles: ["titular", "estrela"], minAge: 22, choices: [
    { label: "Cobrar explicações em particular", hint: "Liderança ↑ · risco político", result: "Você prefere perguntar direto a ficar remoendo em silêncio.", effect: { leadership: 5, reputation: -1, morale: -2 } },
    { label: "Treinar mais forte que qualquer titular", hint: "OVR ↑ · minutos voltam aos poucos", result: "Você decide que a resposta certa está no CT, não na sala do técnico.", effect: { ovr: 1, minutes: 3, fitness: -4 } },
  ]},
  { id: "backstage-tecnico-pede-para-mentorar", icon: "◆", tag: "COMISSÃO TÉCNICA", title: "O técnico pede para você cuidar do novato", description: "Uma contratação badalada chega cheia de dúvidas e o treinador acredita que só você pode acelerar essa adaptação.", needsSquadRoles: ["titular", "estrela"], minAge: 27, choices: [
    { label: "Assumir o papel de mentor por completo", hint: "Liderança ↑↑ · grupo ↑", result: "Você passa a levar o novato para todo lugar, dentro e fora de campo.", effect: { leadership: 8, morale: 5, reputation: 3 } },
    { label: "Ajudar só dentro das quatro linhas", hint: "OVR ↑ · seguro", result: "Você prefere manter distância da vida pessoal do novo companheiro.", effect: { ovr: 1, leadership: 2 } },
  ]},
  // ---- DIRETORIA ----
  { id: "backstage-promessa-de-campanha-eleitoral", icon: "$", tag: "DIRETORIA", title: "Um candidato à presidência usa seu nome na campanha", description: "Cartazes pela cidade prometem sua permanência como prioridade número um do próximo mandato, sem ninguém ter te consultado antes.", minAge: 22, choices: [
    { label: "Apoiar publicamente a candidatura", hint: "Torcida ↑ · risco político", result: "Você decide entrar de vez na disputa interna do clube.", effect: { fans: 8, reputation: -2, morale: 3 } },
    { label: "Manter distância de qualquer eleição", hint: "Seguro", result: "Você prefere que seu nome não vire bandeira de campanha nenhuma.", effect: { adaptation: 3, morale: 1 } },
  ]},
  { id: "backstage-corte-de-orcamento", icon: "◉", tag: "DIRETORIA", title: "O corte de orçamento chega até o seu contrato", description: "Uma auditoria financeira reduz o teto salarial do elenco, e sua renovação entra direto na conta que precisa fechar.", maxContractYears: 2, minAge: 23, choices: [
    { label: "Aceitar renovar por menos", hint: "Segurança ↑ · dinheiro ↓", result: "Você prioriza continuar no clube, mesmo ganhando menos do que esperava.", effect: { contractYears: 2, salaryBoost: -4, morale: -3, reputation: 3 } },
    { label: "Esperar o mercado valorizar você", hint: "Mercado ↑ · incerteza", result: "Você aposta que outro clube vai pagar o que a diretoria não consegue agora.", effect: { transfer: true, reputation: 2 } },
  ]},
  { id: "backstage-diretoria-veta-sua-saida", icon: "×", tag: "DIRETORIA", title: "A diretoria veta sua saída em silêncio", description: "Uma proposta chegou, mas você descobre por terceiros que o departamento de futebol já recusou tudo sem nem te consultar.", minAge: 24, needsDomestic: true, choices: [
    { label: "Cobrar satisfação diretamente", hint: "Reputação ↑ · atrito", result: "Você exige saber por que decidiram por você sem conversar antes.", effect: { reputation: 4, morale: -4, leadership: 3 } },
    { label: "Aceitar e provar valor em campo", hint: "OVR ↑ · seguro", result: "Você decide que o próximo capítulo com esse clube ainda não terminou.", effect: { ovr: 1, morale: 2 } },
  ]},
  { id: "backstage-convite-para-inauguracao", icon: "◈", tag: "DIRETORIA", title: "Você é convidado para a inauguração do novo centro de treinamento", description: "A diretoria monta uma cerimônia e quer seu rosto ao lado da faixa de corte da fita, como símbolo da nova era do clube.", minOvr: 78, oneTime: true, choices: [
    { label: "Discursar em nome do elenco", hint: "Liderança ↑↑ · exposição", result: "Você aceita falar por todos os companheiros no dia da inauguração.", effect: { leadership: 9, reputation: 6, fans: 5 } },
    { label: "Comparecer sem discurso", hint: "Reputação ↑ · seguro", result: "Você prefere apenas prestigiar o evento, sem microfone na mão.", effect: { reputation: 3, morale: 2 } },
  ]},
  // ---- OLHEIROS ----
  { id: "backstage-olheiros-estrangeiros-na-arquibancada", icon: "◧", tag: "OLHEIROS", title: "Um bloco inteiro de olheiros estrangeiros assiste ao jogo", description: "Cadernos abertos, relógios cronometrando cada sprint: você sabe exatamente por que aquele setor da arquibancada está lotado hoje.", minAge: 18, minOvr: 65, choices: [
    { label: "Jogar para impressionar quem observa", hint: "Reputação ↑ · físico ↓", result: "Você decide que hoje é dia de mostrar serviço para outros mercados.", effect: { reputation: 6, fitness: -5, adaptation: 2 } },
    { label: "Jogar normalmente, sem se distrair", hint: "OVR ↑ · seguro", result: "Você trata o jogo como qualquer outro da temporada.", effect: { ovr: 1, morale: 2 } },
  ]},
  { id: "backstage-relatorio-de-olheiro-vaza", icon: "●", tag: "OLHEIROS", title: "Um relatório de olheiro vaza para a imprensa", description: "Um documento interno de outro clube, cheio de elogios e ressalvas técnicas sobre seu jogo, aparece publicado antes mesmo de qualquer proposta.", minAge: 20, choices: [
    { label: "Comentar o relatório com humor", hint: "Imprensa ↑ · exposição", result: "Você decide brincar com os pontos fracos apontados no papel.", effect: { mediaRelation: 5, reputation: 3, morale: 2 } },
    { label: "Ignorar e não validar o vazamento", hint: "Seguro", result: "Você prefere não dar volume a um documento que nunca deveria ter saído do cofre.", effect: { adaptation: 3 } },
  ]},
  { id: "backstage-convite-para-teste-sigiloso", icon: "◆", tag: "OLHEIROS", title: "Um convite discreto para um teste fora do país", description: "Um intermediário garante sigilo total para uma avaliação de poucos dias em um clube maior, sem o conhecimento do seu clube atual.", needsDomestic: true, minOvr: 70, oneTime: true, choices: [
    { label: "Aceitar viajar em segredo", hint: "38% · proposta grande ou desgaste à toa", result: "Você decide arriscar a viagem sem avisar ninguém do clube atual.", effect: {}, luck: { chance: 38, successText: "O teste convence a comissão técnica estrangeira e uma proposta séria chega semanas depois.", failureText: "A viagem não convence ninguém e o desgaste da escapada quase custa caro internamente.", successEffect: { transfer: true, transferAbroad: true, reputation: 8 }, failureEffect: { fitness: -8, morale: -6, reputation: -3 } } },
    { label: "Recusar e jogar dentro das regras", hint: "Moral ↑", result: "Você prefere não arriscar sua relação com o clube atual por um convite informal.", effect: { morale: 4, adaptation: 3 } },
  ]},
  // ---- ANALISTA DE DADOS ----
  { id: "backstage-dados-de-gps-revelam-fadiga", icon: "◫", tag: "ANALISTA DE DADOS", title: "O colete de GPS conta uma história que você não sentia", description: "Os números da análise de desempenho mostram uma queda de intensidade nos últimos treinos que você nem tinha percebido no corpo.", minAge: 20, choices: [
    { label: "Reduzir a carga como sugerido", hint: "Fitness ↑ · minutos ↓", result: "Você confia mais nos números do que na própria sensação de cansaço.", effect: { fitness: 10, minutes: -3 } },
    { label: "Ignorar o relatório e manter o ritmo", hint: "Minutos ↑ · risco físico", result: "Você decide que sabe o próprio corpo melhor que qualquer planilha.", effect: { minutes: 4, injuryRisk: 6, fitness: -5 } },
  ]},
  { id: "backstage-clausula-por-metrica", icon: "✎", tag: "ANALISTA DE DADOS", title: "Uma cláusula do contrato depende só de uma métrica", description: "A renovação proposta paga um bônus alto se você bater um número específico definido pelo departamento de dados, nada além disso importa no papel.", minOvr: 72, choices: [
    { label: "Aceitar jogar em função do número", hint: "Dinheiro ↑↑ · jogo individualista", result: "Você decide perseguir a métrica combinada, mesmo mudando um pouco seu estilo.", effect: { money: 10, reputation: -2, leadership: -2 } },
    { label: "Recusar essa cláusula específica", hint: "Grupo ↑ · dinheiro médio", result: "Você prefere um contrato que não te empurre para o individualismo.", effect: { leadership: 4, money: 4 } },
  ]},
  { id: "backstage-analista-sugere-mudanca-de-funcao", icon: "◧", tag: "ANALISTA DE DADOS", title: "O analista de desempenho sugere um ajuste na sua função", description: "Um mapa de calor detalhado aponta que outro posicionamento dentro do seu setor renderia números ainda melhores.", needsPositionZone: "meio", minAge: 22, choices: [
    { label: "Testar a mudança sugerida", hint: "Potencial ↑ · adaptação exigida", result: "Você aceita experimentar a nova função nos próximos treinos.", effect: { potential: 2, adaptation: -2 } },
    { label: "Manter a função onde já é referência", hint: "OVR ↑ · seguro", result: "Você prefere continuar fazendo bem o que já domina.", effect: { ovr: 1, morale: 2 } },
  ]},
  // ---- PSICÓLOGO ESPORTIVO ----
  { id: "backstage-primeira-sessao-psicologo", icon: "◉", tag: "PSICÓLOGO", title: "A primeira sessão com o psicólogo do clube", description: "O departamento de saúde mental é novo na rotina do elenco, e a primeira conversa parece mais estranha do que qualquer treino tático.", minAge: 19, oneTime: true, choices: [
    { label: "Abrir o jogo sobre as pressões reais", hint: "Equilíbrio ↑↑ · moral ↑", result: "Você decide aproveitar o espaço em vez de só cumprir tabela.", effect: { lifeBalance: 10, morale: 6 } },
    { label: "Tratar como só mais uma obrigação", hint: "Seguro", result: "Você comparece, mas guarda tudo o que realmente pensa.", effect: { adaptation: 2 } },
  ]},
  { id: "backstage-visualizacao-antes-da-final", icon: "◈", tag: "PSICÓLOGO", title: "Uma técnica de visualização antes da decisão", description: "O psicólogo pede para você imaginar cada detalhe do jogo mais importante da temporada antes mesmo de pisar no gramado.", needsRivalry: true, minOvr: 72, choices: [
    { label: "Levar o exercício a sério", hint: "Título ↑↑ · foco", result: "Você repete mentalmente cada cenário até se sentir preparado.", effect: { titleBoost: 10, leadership: 3 } },
    { label: "Achar bobagem e ignorar", hint: "Seguro · sem ganho extra", result: "Você prefere confiar só no treino físico de sempre.", effect: { morale: 1 } },
  ]},
  { id: "backstage-sindrome-do-impostor-na-europa", icon: "◇", tag: "PSICÓLOGO", title: "A sensação de não pertencer àquele elenco", description: "Cercado de nomes que você via na televisão até pouco tempo atrás, uma vontade estranha de sumir toma conta antes dos treinos.", needsAbroad: true, oneTime: true, choices: [
    { label: "Procurar ajuda profissional para lidar com isso", hint: "Equilíbrio ↑↑↑ · adaptação ↑", result: "Você entende que sentir isso não te torna menos capaz de estar ali.", effect: { lifeBalance: 15, adaptation: 8, morale: 6 } },
    { label: "Guardar o desconforto para si mesmo", hint: "OVR estável · risco emocional", result: "Você decide simplesmente aguentar até a sensação passar sozinha.", effect: { lifeBalance: -6, morale: -4 } },
  ]},
  // ---- PREPARADOR FÍSICO ----
  { id: "backstage-plano-de-recuperacao-personalizado", icon: "+", tag: "PREPARADOR FÍSICO", title: "Um protocolo de recuperação feito só para você", description: "Depois de anos de planilha genérica, o preparador físico monta uma rotina que leva em conta cada detalhe do seu histórico.", minAge: 25, choices: [
    { label: "Seguir o protocolo à risca", hint: "Fitness ↑↑ · disciplina extra", result: "Você adota a nova rotina mesmo exigindo mais tempo do seu dia.", effect: { fitness: 12, lifeBalance: -2 } },
    { label: "Seguir só nos dias de jogo mais pesado", hint: "Fitness ↑ · flexível", result: "Você aplica o protocolo apenas quando o calendário aperta de verdade.", effect: { fitness: 6, lifeBalance: 2 } },
  ]},
  { id: "backstage-dois-treinos-por-dia-pretemporada", icon: "▲", tag: "PREPARADOR FÍSICO", title: "A pré-temporada mais puxada dos últimos anos", description: "Dois treinos por dia, testes físicos toda semana e um preparador físico que não aceita meio-termo antes da estreia.", minAge: 20, choices: [
    { label: "Encarar o volume total exigido", hint: "OVR ↑ · físico no limite", result: "Você aguenta cada sessão dupla sem cortar caminho.", effect: { ovr: 1, fitness: -6, potential: 1 } },
    { label: "Pedir ajuste pontual na carga", hint: "Fitness ↑ · potencial menor", result: "Você negocia um volume um pouco mais administrado.", effect: { fitness: 8, potential: -1 } },
  ]},
  { id: "backstage-pulseira-de-sono-monitorado", icon: "◉", tag: "PREPARADOR FÍSICO", title: "Uma pulseira monitora até o seu sono", description: "O departamento de performance passa a acompanhar horas de sono, batimentos e rotina noturna de cada jogador do elenco.", minAge: 24, choices: [
    { label: "Levar os dados a sério e ajustar a rotina", hint: "Fitness ↑ · vida pessoal ↓", result: "Você reorganiza a noite inteira em função dos números do aparelho.", effect: { fitness: 9, lifeBalance: -4 } },
    { label: "Usar o aparelho sem mudar hábitos", hint: "Neutro", result: "Você aceita usar a pulseira, mas sem levar tão a sério os alertas.", effect: { morale: 2 } },
  ]},
  // ---- JANELA DE TRANSFERÊNCIA ----
  { id: "backstage-clausula-de-rescisao-acionada", icon: "$", tag: "JANELA DE TRANSFERÊNCIA", title: "Alguém aciona sua cláusula de rescisão em silêncio", description: "Sem nenhuma negociação pública, um clube deposita o valor exato da sua cláusula e o seu nome muda de dono da noite para o dia.", minOvr: 76, oneTime: true, choices: [
    { label: "Aceitar a mudança de bom grado", hint: "Transferência · dinheiro ↑", result: "Você entende que o próprio contrato já previa esse desfecho.", effect: { transfer: true, money: 10, reputation: 4 } },
    { label: "Tentar reverter a saída por lealdade", hint: "Moral ↑ · mercado ↓", result: "Você conversa com a diretoria em busca de um jeito de ficar.", effect: { morale: 5, leadership: 3 } },
  ]},
  { id: "backstage-guerra-de-propostas-em-segredo", icon: "◈", tag: "JANELA DE TRANSFERÊNCIA", title: "Dois clubes disputam você sem que ninguém saiba ainda", description: "Enquanto a imprensa nem desconfia, seu empresário já recebeu duas propostas concorrentes na mesma semana.", minAge: 23, choices: [
    { label: "Deixar o empresário conduzir o leilão", hint: "Dinheiro ↑↑ · mercado", result: "Você confia na experiência dele para arrancar o melhor negócio possível.", effect: { money: 8, transfer: true, reputation: 3 } },
    { label: "Entrar pessoalmente nas conversas", hint: "Liderança ↑ · negociação direta", result: "Você prefere entender cada detalhe antes de qualquer decisão.", effect: { leadership: 4, transfer: true } },
  ]},
  { id: "backstage-emprestimo-negociado-as-escondidas", icon: "⇄", tag: "JANELA DE TRANSFERÊNCIA", title: "Um empréstimo quase fechado sem sua palavra final", description: "Você descobre por um companheiro que o clube já alinhou praticamente tudo sobre uma cessão para o meio da temporada.", needsSquadRoles: ["reserva", "rotacao"], minAge: 21, choices: [
    { label: "Topar o empréstimo já encaminhado", hint: "Minutos ↑↑ · nova casa temporária", result: "Você aceita que jogar de verdade importa mais do que o orgulho ferido.", effect: { transfer: true, loan: true, minutes: 10 } },
    { label: "Exigir ser consultado antes de qualquer acordo", hint: "Liderança ↑ · risco de continuar parado", result: "Você deixa claro que decisões sobre sua carreira passam por você primeiro.", effect: { leadership: 5, reputation: 2, morale: -2 } },
  ]},
  { id: "backstage-caos-no-fim-da-janela", icon: "⌛", tag: "JANELA DE TRANSFERÊNCIA", title: "O caos das últimas horas da janela de transferências", description: "Faltam minutos para o mercado fechar e um negócio que parecia certo trava numa cláusula de última hora.", minAge: 22, oneTime: true, choices: [
    { label: "Aceitar qualquer ajuste para fechar a tempo", hint: "45% · negócio salvo ou prejuízo no acordo", result: "Você pressiona para que tudo se resolva antes do prazo estourar.", effect: {}, luck: { chance: 45, successText: "O acordo se resolve nos minutos finais e a mudança sai exatamente como planejado.", failureText: "O prazo estoura e você segue no mesmo clube, com um gosto amargo de oportunidade perdida.", successEffect: { transfer: true, money: 6, reputation: 5 }, failureEffect: { morale: -8, reputation: -2 } } },
    { label: "Deixar o negócio esfriar até a próxima janela", hint: "Moral ↑ · paciência", result: "Você prefere não se desgastar com um acordo apressado.", effect: { morale: 4, adaptation: 2 } },
  ]},
  // ---- VESTIÁRIO ----
  { id: "backstage-conselho-de-veteranos-te-chama", icon: "C", tag: "VESTIÁRIO", title: "O conselho informal de veteranos te convida", description: "Um grupo pequeno de jogadores mais experientes decide, nos bastidores, quem entra para as conversas que realmente definem o clima do elenco.", minAge: 26, needsSquadRoles: ["titular", "estrela"], oneTime: true, choices: [
    { label: "Aceitar fazer parte do grupo", hint: "Liderança ↑↑ · influência no vestiário", result: "Você passa a ter voz nas decisões informais mais importantes do dia a dia.", effect: { leadership: 10, reputation: 4 } },
    { label: "Preferir ficar de fora dessas rodas", hint: "Foco ↑ · menos influência", result: "Você decide manter distância da política interna do grupo.", effect: { fitness: 3, morale: 2 } },
  ]},
  { id: "backstage-contratacao-ameaca-hierarquia", icon: "↔", tag: "VESTIÁRIO", title: "A nova contratação chega desafiando a hierarquia do vestiário", description: "O reforço badalado não pede licença para nada, nem para os rituais mais antigos que o elenco mais experiente construiu ao longo dos anos.", minAge: 30, choices: [
    { label: "Marcar posição como veterano", hint: "Liderança ↑ · atrito", result: "Você deixa claro, com respeito, como as coisas funcionam ali.", effect: { leadership: 6, morale: -2, reputation: 2 } },
    { label: "Deixar o tempo resolver sozinho", hint: "Grupo ↑ · seguro", result: "Você prefere que a convivência natural acomode as diferenças.", effect: { morale: 3, adaptation: 2 } },
  ]},
  { id: "backstage-guerra-de-pegadinhas", icon: "☺", tag: "VESTIÁRIO", title: "Uma guerra de pegadinhas toma conta da concentração", description: "O que começou com uma brincadeira boba virou uma disputa diária de quem consegue pregar a peça mais elaborada no companheiro.", minAge: 19, choices: [
    { label: "Entrar de cabeça na brincadeira", hint: "Moral ↑↑ · grupo ↑", result: "Você aposta tudo na próxima pegadinha, mesmo sabendo que pode virar alvo depois.", effect: { morale: 8, leadership: 2 } },
    { label: "Observar de longe, rindo baixinho", hint: "Seguro", result: "Você prefere curtir o clima sem se meter diretamente na disputa.", effect: { morale: 3 } },
  ]},
  { id: "backstage-votacao-do-hino-do-vestiario", icon: "♪", tag: "VESTIÁRIO", title: "O elenco vota a música oficial da concentração", description: "Antes de cada jogo importante, o grupo decide junto qual canção toca no vestiário — e a disputa às vezes esquenta mais que a escalação.", minAge: 18, choices: [
    { label: "Defender sua escolha com convicção", hint: "Grupo ↑ · moral ↑", result: "Você briga pela sua música como se fosse questão de honra.", effect: { morale: 5, leadership: 2 } },
    { label: "Ceder ao gosto da maioria", hint: "Grupo ↑↑", result: "Você prefere manter a paz e aceitar a vontade coletiva.", effect: { morale: 4, leadership: 3 } },
  ]},
  // ---- EQUIPE DE BASTIDORES ----
  { id: "backstage-colorway-personalizada-de-chuteira", icon: "$", tag: "EQUIPE DE BASTIDORES", title: "A marca de material esportivo quer uma chuteira só sua", description: "O departamento de produto propõe uma colorway exclusiva com o seu nome gravado na sola, algo raro para alguém da sua idade.", minOvr: 74, oneTime: true, choices: [
    { label: "Ajudar a desenhar cada detalhe", hint: "Dinheiro ↑↑ · exposição", result: "Você participa de cada reunião de design até o lançamento.", effect: { money: 14, reputation: 5, fitness: -2 } },
    { label: "Deixar a marca decidir sozinha", hint: "Dinheiro ↑ · sem desgaste", result: "Você assina o contrato e confia no time criativo da marca.", effect: { money: 8, morale: 2 } },
  ]},
  { id: "backstage-assessoria-prepara-entrevista-hostil", icon: "●", tag: "EQUIPE DE BASTIDORES", title: "A assessoria de imprensa simula uma entrevista hostil", description: "Antes da coletiva de verdade, o setor de comunicação do clube te bombardeia com perguntas difíceis para testar suas respostas.", minAge: 21, choices: [
    { label: "Levar o treino a sério até o fim", hint: "Relação com a imprensa ↑↑", result: "Você repete cada resposta até sentir segurança total no discurso.", effect: { mediaRelation: 9, leadership: 2 } },
    { label: "Confiar na própria espontaneidade", hint: "Moral ↑ · risco na coletiva real", result: "Você prefere responder do jeito que vier na hora, sem decorar nada.", effect: { morale: 4, mediaRelation: -2 } },
  ]},
  { id: "backstage-logistica-de-viagem-trava", icon: "✈", tag: "EQUIPE DE BASTIDORES", title: "Um problema de logística quase compromete a viagem", description: "Voo atrasado, hotel trocado de última hora e uma equipe de bastidores correndo para que o time chegue a tempo do próximo compromisso.", needsAbroad: true, choices: [
    { label: "Manter o grupo tranquilo durante o imprevisto", hint: "Liderança ↑ · grupo ↑", result: "Você ajuda a segurar o clima enquanto tudo se resolve correndo.", effect: { leadership: 6, morale: 4 } },
    { label: "Reclamar abertamente da bagunça", hint: "Moral ↑ · imagem interna ↓", result: "Você desabafa sobre a falta de organização, mesmo sabendo que isso pode voltar contra você.", effect: { morale: 5, reputation: -2 } },
  ]},
  // ---- CATEGORIA DE BASE ----
  { id: "backstage-clube-pede-para-apadrinhar-prospecto", icon: "★", tag: "CATEGORIA DE BASE", title: "O clube pede para você apadrinhar um prospecto da base", description: "Um garoto de dezesseis anos chama atenção dos olheiros internos, e a diretoria acredita que ter você por perto pode acelerar tudo.", minAge: 28, choices: [
    { label: "Assumir o papel de padrinho por completo", hint: "Liderança ↑↑ · legado", result: "Você passa a acompanhar de perto cada treino do garoto.", effect: { leadership: 8, reputation: 4, morale: 3 } },
    { label: "Ajudar apenas em ocasiões pontuais", hint: "Liderança ↑ · foco no próprio jogo", result: "Você aparece de vez em quando, sem comprometer sua própria rotina.", effect: { leadership: 3, fitness: 2 } },
  ]},
  { id: "backstage-prospecto-comparado-a-voce", icon: "◎", tag: "CATEGORIA DE BASE", title: "Um garoto da base é comparado a você mesmo, mais novo", description: "A imprensa interna do clube já chama o novo nome da base de 'o próximo', usando fotos suas de quinze anos atrás como referência.", minAge: 30, choices: [
    { label: "Tratar a comparação com carinho", hint: "Reputação ↑ · legado", result: "Você decide acolher o apelido em vez de disputar espaço com um adolescente.", effect: { reputation: 5, morale: 4, leadership: 3 } },
    { label: "Deixar claro que comparações não valem nada ainda", hint: "Liderança ↑ · seguro", result: "Você prefere lembrar a todos que uma carreira não se mede aos quinze anos.", effect: { leadership: 4, adaptation: 2 } },
  ]},
  { id: "backstage-coordenador-de-base-pede-opiniao", icon: "◇", tag: "CATEGORIA DE BASE", title: "O coordenador da base quer sua opinião sobre um talento", description: "Antes de decidir se promove ou empresta um garoto da base, a comissão técnica pede sua visão de quem já viveu esse mesmo dilema.", minAge: 29, needsCaptainRole: "any", choices: [
    { label: "Defender a promoção imediata", hint: "Liderança ↑↑", result: "Você aposta que o garoto está pronto e assume essa recomendação publicamente.", effect: { leadership: 7, reputation: 3 } },
    { label: "Sugerir mais tempo de amadurecimento", hint: "Liderança ↑ · cauteloso", result: "Você prefere um caminho mais devagar, mesmo sabendo que pode frustrar o garoto agora.", effect: { leadership: 5, adaptation: 2 } },
  ]},
  // ---- ARBITRAGEM ----
  { id: "backstage-relatorio-de-arbitragem-contesta-expulsao", icon: "!", tag: "ARBITRAGEM", title: "O relatório da arbitragem contesta sua expulsão", description: "Dias depois do cartão vermelho, o departamento de arbitragem reconhece internamente o erro, mas a suspensão automática já está valendo.", minAge: 22, choices: [
    { label: "Levar o caso à federação", hint: "38% · suspensão revertida ou desgaste extra", result: "Você decide recorrer formalmente contra a decisão em campo.", effect: {}, luck: { chance: 38, successText: "O recurso é aceito e a suspensão cai antes do próximo jogo decisivo.", failureText: "O recurso não avança e o desgaste do processo pesa mais do que a própria expulsão.", successEffect: { reputation: 6, minutes: 4, morale: 5 }, failureEffect: { morale: -6, reputation: -2 } } },
    { label: "Cumprir a suspensão sem contestar", hint: "Moral ↑ · seguro", result: "Você prefere focar no próximo jogo em vez de brigar com o passado.", effect: { morale: 3, discipline: 2 } },
  ]},
  { id: "backstage-demora-do-var-ofusca-seu-gol", icon: "◧", tag: "ARBITRAGEM", title: "Minutos de VAR ofuscam o seu gol mais bonito", description: "A revisão demora tanto que quando o gol finalmente é validado, a comemoração já perdeu toda a espontaneidade do momento.", minOvr: 70, choices: [
    { label: "Comemorar de novo, com a mesma intensidade", hint: "Fãs ↑ · torcida contagiada", result: "Você decide não deixar a burocracia roubar a alegria do momento.", effect: { fans: 6, morale: 4 } },
    { label: "Seguir o jogo sem comemorar de verdade", hint: "Foco ↑ · seguro", result: "Você prefere guardar energia para o resto da partida.", effect: { fitness: 2, adaptation: 2 } },
  ]},
  // ---- TREINO FECHADO ----
  { id: "backstage-treino-fechado-para-todo-mundo", icon: "☰", tag: "TREINO", title: "Um treino fechado até para os funcionários do clube", description: "Depois de uma sequência de vazamentos táticos, o técnico decide isolar completamente o CT, sem exceção para ninguém de fora do elenco.", minAge: 20, choices: [
    { label: "Aproveitar o sigilo para testar algo arriscado", hint: "Potencial ↑ · imprevisível", result: "Você usa o momento de privacidade para experimentar jogadas fora do script.", effect: { potential: 2, adaptation: -1 } },
    { label: "Focar só na execução do combinado", hint: "OVR ↑ · seguro", result: "Você prefere aproveitar o sigilo apenas para refinar o que já funciona.", effect: { ovr: 1, fitness: -2 } },
  ]},
  { id: "backstage-preparador-de-goleiros-cobra-detalhe", icon: "🧤", tag: "TREINO", title: "O preparador de goleiros exige detalhe milimétrico", description: "Cada posicionamento de mão, cada passo antes da defesa: o treino específico virou uma aula obsessiva sobre pequenos ajustes.", needsPositionZone: "gol", minAge: 20, choices: [
    { label: "Absorver cada correção sem reclamar", hint: "Potencial ↑↑", result: "Você trata cada detalhe apontado como um degrau a mais na carreira.", effect: { potential: 3, fitness: -2 } },
    { label: "Confiar mais no próprio instinto natural", hint: "OVR ↑ · menos ajuste técnico", result: "Você prefere manter o que já vem funcionando bem para você.", effect: { ovr: 1, adaptation: -1 } },
  ]},
  // ---- CONTRATO ----
  { id: "backstage-sala-de-guerra-da-renovacao", icon: "✎", tag: "CONTRATO", title: "Uma verdadeira sala de guerra em torno da sua renovação", description: "Advogados, empresário e diretoria discutem cláusula por cláusula, enquanto você só quer saber se vai continuar jogando ali.", minAge: 25, choices: [
    { label: "Participar pessoalmente de cada reunião", hint: "Liderança ↑ · desgaste", result: "Você acompanha cada detalhe do processo, mesmo sendo cansativo.", effect: { leadership: 5, morale: -3, contractYears: 1 } },
    { label: "Deixar tudo nas mãos do seu empresário", hint: "Equilíbrio ↑ · menos controle", result: "Você prefere focar em jogar e deixar a papelada para outra pessoa.", effect: { lifeBalance: 6, contractYears: 1 } },
  ]},
  { id: "backstage-clausula-de-performance-social", icon: "@", tag: "CONTRATO", title: "Uma cláusula inusitada liga contrato e redes sociais", description: "O departamento de marketing sugere atrelar parte do seu salário a metas de engajamento nas redes, não só a resultados em campo.", minOvr: 75, choices: [
    { label: "Aceitar a cláusula comercial", hint: "Dinheiro ↑↑ · seguidores em jogo", result: "Você decide que também pode transformar sua imagem em parte do contrato.", effect: { money: 8, followers: 40_000, socialSentiment: 2 } },
    { label: "Manter o contrato só sobre futebol", hint: "Foco ↑ · dinheiro médio", result: "Você prefere que seu salário dependa só do que acontece dentro de campo.", effect: { money: 3, leadership: 2 } },
  ]},
  // ---- ASSESSORIA ----
  { id: "backstage-media-training-antes-da-grande-final", icon: "▶", tag: "ASSESSORIA", title: "Um treinamento de mídia antes da semana da grande final", description: "A assessoria monta um roteiro de respostas prontas para blindar você da pressão da imprensa antes do jogo mais importante do ano.", minOvr: 76, choices: [
    { label: "Seguir o roteiro sugerido à risca", hint: "Imprensa ↑ · autenticidade ↓", result: "Você repete as respostas combinadas em cada pergunta da semana.", effect: { mediaRelation: 8, socialSentiment: -2 } },
    { label: "Responder com suas próprias palavras", hint: "Público ↑ · risco de gafe", result: "Você prefere ser você mesmo, mesmo correndo o risco de escorregar em alguma resposta.", effect: { fans: 6, mediaRelation: -2, followers: 15_000 } },
  ]},
  { id: "backstage-comite-de-crise-da-assessoria", icon: "!", tag: "ASSESSORIA", title: "Um comitê de crise se reúne por sua causa", description: "Depois de uma sequência ruim de resultados, a assessoria de imprensa monta uma reunião de emergência só para decidir como proteger sua imagem.", minAge: 24, choices: [
    { label: "Pedir para dar a cara a tapa você mesmo", hint: "Respeito ↑ · exposição", result: "Você prefere enfrentar a crise pessoalmente, sem se esconder atrás de notas.", effect: { reputation: 6, leadership: 5, morale: -3 } },
    { label: "Deixar a assessoria administrar tudo", hint: "Seguro · menos protagonismo", result: "Você confia no time de comunicação para atravessar esse momento.", effect: { mediaRelation: 5, morale: 2 } },
  ]},
];
