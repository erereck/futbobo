import { CLUBS, COUNTRIES, FORMATIONS, YOUTH_EVENTS, countryById } from "../game-data";
import type { Club, Country, Effect, GameEvent } from "../game-data";
import { RIVALRIES } from "../mega-expansion";
import type { BotaoMatchResult } from "../botao/types";
import { playerStoryById } from "../player-stories";
import type { PlayerStoryId } from "../player-stories";
import { STORY_CHAPTER_BEATS } from "../story-chapters";
import { GOALKEEPER_YOUTH_EVENTS } from "../goalkeeper-events";
import type { GameState, PendingBotaoMatch, PressConference, PressQuestion, SponsorDeal, StoryDecision, StoryDecisionChoice, YouthYear } from "./model";
import { ALL_PRO_EVENTS, shiftPlayerAttributes } from "./state";
import { clamp, clubById, pick, seeded } from "./shared";
import { clubConfederation, isEuropeanClub, positionByKey, randomClubSelection, revelationOfferPool } from "./academy";
import { formatFollowers, formatMoney, sponsorOfferPool } from "./performance";

export function eligibleEvents(state: GameState) {
  const club = clubById(state.currentClubId || state.academyClubId);
  return ALL_PRO_EVENTS.filter((event) => {
    if (event.minAge !== undefined && state.age < event.minAge) return false;
    if (event.maxAge !== undefined && state.age > event.maxAge) return false;
    if (event.minOvr !== undefined && state.overall < event.minOvr) return false;
    if (event.maxOvr !== undefined && state.overall > event.maxOvr) return false;
    if (event.needsLowFitness && state.fitness > 67) return false;
    if (event.needsNational && state.nationalLevel < 1) return false;
    if (event.needsLibertadores && state.continentalSlot !== "libertadores") return false;
    if (event.needsContinental && state.continentalSlot !== event.needsContinental) return false;
    if (event.needsWorld && (state.worldQualifiedSeason !== state.season || state.worldQualifiedClubId !== state.currentClubId)) return false;
    if (event.needsAbroad && !isEuropeanClub(club)) return false;
    if (event.id === "european-exit") {
      const baseCountryIsEuropean = countryById(state.academyCountryId).confederation === "EUROPE";
      const playerIsEuropean = countryById(state.nationality).confederation === "EUROPE";
      const genuinelyStruggling =
        state.adaptation < 66 ||
        state.managerTrust < 42 ||
        Boolean(state.lastResult && (state.lastResult.performanceScore < 54 || state.lastResult.appearances < 16));
      if (baseCountryIsEuropean || playerIsEuropean || !genuinelyStruggling) return false;
    }
    if (event.needsDomestic && club.countryId !== "brasil") return false;
    if (event.needsRivalry && !RIVALRIES.some((rivalry) => rivalry.clubIds.includes(club.id))) return false;
    if (event.maxContractYears !== undefined && state.contractYears > event.maxContractYears) return false;
    if (event.seasonParity === "even" && state.season % 2 !== 0) return false;
    if (event.seasonParity === "odd" && state.season % 2 === 0) return false;
    if (event.needsNationalMain && state.nationalCategory !== "main") return false;
    if (event.needsNationalYouth && state.nationalCategory !== "sub17" && state.nationalCategory !== "sub20" && state.nationalCategory !== "olympic") return false;
    if (event.nationalWindow === "major" && state.season % 4 !== 0 && state.season % 4 !== 2) return false;
    if (event.nationalWindow === "continental" && state.season % 4 !== 0) return false;
    if (event.nationalWindow === "olympics" && state.season % 4 !== 0) return false;
    if (event.nationalWindow === "qualifiers" && state.season % 4 !== 3) return false;
    if (event.needsConfederation && clubConfederation(club) !== event.needsConfederation) return false;
    if (event.needsPositionZone && positionByKey(state.position).zone !== event.needsPositionZone) return false;
    if (event.needsSquadRoles && !event.needsSquadRoles.includes(state.squadRole)) return false;
    if (event.needsCaptainRole === "club" && !state.clubCaptain) return false;
    if (event.needsCaptainRole === "national" && !state.nationalCaptain) return false;
    if (event.needsCaptainRole === "any" && !(state.clubCaptain || state.nationalCaptain)) return false;
    if (event.oneTime && state.seenEvents.includes(event.id)) return false;
    if (event.rareChance !== undefined) {
      const eventSalt = [...event.id].reduce((total, character) => total + character.charCodeAt(0), 0);
      if (seeded(state.seed, state.season * 997 + eventSalt) >= event.rareChance) return false;
    }
    return true;
  });
}

export function selectNextEvent(state: GameState, salt: number) {
  const offFieldRoll = seeded(state.seed, state.season * 1237 + salt);
  if (state.playerStoryId !== "open-book" && seeded(state.seed, state.season * 1871 + salt) < 0.18) return DYNAMIC_STORY_EVENT_ID;
  if (!state.activeSponsor && state.age >= 16 && state.reputation >= 10 && offFieldRoll < 0.34) {
    return DYNAMIC_SPONSOR_EVENT_ID;
  }
  if (state.activeSponsor && offFieldRoll < 0.1) return DYNAMIC_SPONSOR_DUTY_EVENT_ID;
  if (offFieldRoll < 0.24) return DYNAMIC_SOCIAL_EVENT_ID;
  if (offFieldRoll < 0.36) return DYNAMIC_LIFE_EVENT_ID;
  if (state.rivals.some((rival) => rival.active) && seeded(state.seed, state.season * 991 + salt) < 0.14) {
    return DYNAMIC_RIVAL_EVENT_ID;
  }
  const events = eligibleEvents(state);
  const triggeredRareEvents = events.filter((event) => event.rareChance !== undefined);
  if (triggeredRareEvents.length) return pick(triggeredRareEvents, state.seed + state.season, salt).id;
  const unseenFutboboMoments = events.filter((event) => event.id.startsWith("funny-") && !state.seenEvents.includes(event.id));
  if (unseenFutboboMoments.length && seeded(state.seed, state.season * 2137 + salt) < 0.22) {
    return pick(unseenFutboboMoments, state.seed + state.season, salt + 73).id;
  }
  const unseenGoalkeeperEvents = events.filter((event) => event.id.startsWith("keeper-") && !state.seenEvents.includes(event.id));
  if (state.position === "GOL" && unseenGoalkeeperEvents.length && seeded(state.seed, state.season * 2371 + salt) < 0.64) {
    return pick(unseenGoalkeeperEvents, state.seed + state.season, salt + 91).id;
  }
  const unseen = events.filter((event) => !state.seenEvents.includes(event.id));
  return pick(unseen.length ? unseen : events, state.seed + state.season, salt)?.id ?? "extra-training";
}

export const NATIONALITY_SWITCH_EVENT_ID = "dynamic-nationality-switch";

export const DYNAMIC_RIVAL_EVENT_ID = "dynamic-career-rival";

export const DYNAMIC_SPONSOR_EVENT_ID = "dynamic-sponsor-offer";

export const DYNAMIC_SPONSOR_DUTY_EVENT_ID = "dynamic-sponsor-duty";

export const DYNAMIC_SOCIAL_EVENT_ID = "dynamic-social-media";

export const DYNAMIC_LIFE_EVENT_ID = "dynamic-off-field-life";

export const DYNAMIC_STORY_EVENT_ID = "dynamic-player-story";

export function buildStoryCareerEvent(state: GameState): GameEvent {
  const story = playerStoryById(state.playerStoryId);
  const scenarioByStory: Record<PlayerStoryId, { title: string; description: string; bold: string; careful: string; personal: string }> = {
    "open-book": { title: "A imprensa quer encontrar o começo da sua lenda", description: "Sem uma narrativa pronta, cada entrevistador tenta escolher por você qual momento explica tudo.", bold: "Dizer que a história começa hoje", careful: "Recusar uma explicação fácil", personal: "Contar um detalhe que ninguém conhecia" },
    "academy-destroyer": { title: "A velha promessa voltou às manchetes", description: "Uma mesa-redonda compara sua temporada profissional aos números impossíveis da base.", bold: "Prometer que o próximo recorde será profissional", careful: "Explicar que base e elite são mundos diferentes", personal: "Ligar para um antigo companheiro da base" },
    "humble-roots": { title: "Sua família virou personagem de uma reportagem", description: "A produção quer filmar a casa e contar detalhes que nunca foram públicos.", bold: "Abrir as portas e contar tudo", careful: "Aceitar apenas uma entrevista curta", personal: "Proteger completamente a privacidade da família" },
    "football-bloodline": { title: "Perguntaram novamente se você seria titular no time do seu pai", description: "A comparação atravessa a coletiva mesmo sem relação com o próximo jogo.", bold: "Dizer que seria o melhor dos dois", careful: "Reconhecer a história e mudar de assunto", personal: "Conversar com seu pai antes de responder" },
    disillusioned: { title: "Um jovem da base disse que também pensa em desistir", description: "Ele procura você porque ouviu falar da fase em que o futebol deixou de fazer sentido.", bold: "Contar a verdade numa palestra aberta", careful: "Conversar em particular depois do treino", personal: "Levá-lo ao campo onde você reencontrou prazer" },
    "street-football": { title: "A prefeitura cercou a quadra onde você aprendeu", description: "Um vídeo de crianças jogando do lado de fora chega ao seu celular.", bold: "Comprar a briga nas redes", careful: "Negociar uma solução sem exposição", personal: "Aparecer de surpresa com bolas e traves" },
    "late-bloomer": { title: "Um reserva do Sub-17 pediu seu conselho", description: "Ele acredita que a carreira acabou antes de começar, exatamente como disseram sobre você.", bold: "Dizer que os olheiros vão se arrepender", careful: "Montar um plano de treino realista", personal: "Acompanhar os jogos dele em silêncio" },
    "academy-reject": { title: "O diretor que dispensou você está no estádio", description: "As câmeras encontram o rosto dele pouco antes do jogo começar.", bold: "Apontar para a tribuna se marcar", careful: "Tratar como qualquer outro jogo", personal: "Encontrá-lo longe das câmeras" },
    "migrant-dream": { title: "Uma criança recém-chegada escreveu no seu idioma de infância", description: "A carta diz que ver você em campo fez a cidade parecer menos estrangeira.", bold: "Transformar a carta em campanha internacional", careful: "Responder e apoiar uma associação local", personal: "Convidar a família para um treino" },
    "student-athlete": { title: "O treinador ironizou seus livros no vestiário", description: "A frase era brincadeira, mas abriu uma discussão sobre foco e inteligência no futebol.", bold: "Responder com uma análise tática pública", careful: "Mostrar no treino o que o estudo acrescenta", personal: "Criar um grupo de estudos no elenco" },
    "neighborhood-idol": { title: "O bairro quer que você escolha um lado", description: "Dois projetos comunitários rivais pedem seu nome e dizem representar suas raízes.", bold: "Financiar o projeto mais ambicioso", careful: "Dividir o apoio entre os dois", personal: "Reunir os responsáveis na mesma mesa" },
  };
  const scenario = scenarioByStory[state.playerStoryId];
  return {
    id: DYNAMIC_STORY_EVENT_ID,
    icon: story.icon,
    tag: "SUA HISTÓRIA",
    title: scenario.title,
    description: scenario.description,
    choices: [
      { label: scenario.bold, hint: "Impacto alto · risco de exposição", result: "Você transforma a própria origem em uma declaração pública. A reação é intensa.", effect: { followers: 120_000, reputation: 5, mediaRelation: -4, morale: 4 } },
      { label: scenario.careful, hint: "Maturidade · controle", result: "A resposta não domina as manchetes, mas fortalece quem convive com você.", effect: { leadership: 6, mediaRelation: 5, discipline: 4 } },
      { label: scenario.personal, hint: "Moral e equilíbrio ↑", result: "Sem campanha ou roteiro, você escolhe uma resposta pessoal que fica na memória.", effect: { morale: 9, lifeBalance: 7, fans: 4 } },
    ],
  };
}

export function buildSponsorEvent(state: GameState): GameEvent {
  const offers = sponsorOfferPool(state, state.season * 1301);
  const club = clubById(state.currentClubId || state.academyClubId);
  return {
    id: DYNAMIC_SPONSOR_EVENT_ID,
    icon: "◇",
    tag: "PATROCÍNIO",
    title: "As marcas querem colocar seu nome em uma chuteira",
    description: `${formatFollowers(state.followers)} seguidores e seu momento em campo chamaram atenção. Cada contrato paga por ano e acompanha você mesmo se trocar de clube.`,
    choices: offers.map((offer, index) => ({
      label: `Assinar com ${offer.name}`,
      hint: `${offer.years} anos · ${formatMoney(offer.annualValue)}/ano${("controversial" in offer && offer.controversial) ? " · muito dinheiro, imagem sensível" : index === 0 ? " · maior projeto" : ""}`,
      result: `${offer.name} anuncia você como novo atleta da marca. A parceria agora faz parte da sua carreira.`,
      effect: {
        sponsorBrand: offer.name,
        sponsorYears: offer.years,
        sponsorValue: offer.annualValue,
        reputation: ("controversial" in offer && offer.controversial) ? Math.max(1, offer.tier - 1) : offer.tier,
        followers: (("controversial" in offer && offer.controversial) ? 12_000 : 8_000) * offer.tier,
        socialSentiment: ("controversial" in offer && offer.controversial) ? -4 : 2,
        mediaRelation: ("controversial" in offer && offer.controversial) ? -3 : 1,
        minutes: ("controversial" in offer && offer.controversial) && club.reputation >= 5 ? -10 : 0,
      },
    })),
  };
}

export function buildSponsorDutyEvent(state: GameState): GameEvent {
  const sponsor = state.activeSponsor;
  const brand = sponsor?.brand ?? "a marca";
  const annualValue = sponsor?.annualValue ?? 100_000;
  return {
    id: DYNAMIC_SPONSOR_DUTY_EVENT_ID,
    icon: "◆",
    tag: brand.toLocaleUpperCase("pt-BR"),
    title: `${brand} marcou uma campanha no pior dia possível`,
    description: "A gravação atravessa seu dia de descanso antes de uma sequência pesada. O contrato pede presença, mas você decide como cumprir.",
    choices: [
      {
        label: "Entregar a campanha completa",
        hint: `Seguidores ↑↑ · físico ↓ · bônus ${formatMoney(annualValue * 0.18)}`,
        result: `A campanha da ${brand} domina as redes e rende um bônus. Seu corpo, porém, sente o dia sem descanso.`,
        effect: { followers: 75_000, socialSentiment: 5, fitness: -7, lifeBalance: -5, money: Math.round(annualValue * 0.18 / 10_000) },
      },
      {
        label: "Reduzir a agenda e priorizar o jogo",
        hint: "Físico ↑ · relação comercial ↓",
        result: `${brand} aceita uma ação menor. A parceria esfria um pouco, mas você chega inteiro ao campo.`,
        effect: { fitness: 8, lifeBalance: 4, reputation: -2, mediaRelation: -2 },
      },
      {
        label: "Transformar a campanha em ação social",
        hint: "Impacto social ↑↑ · público ↑",
        result: `Você convence ${brand} a levar a produção para um projeto comunitário. A ação ganha um significado que nenhuma publicidade compraria.`,
        effect: { charity: 12, followers: 45_000, socialSentiment: 9, leadership: 4 },
      },
    ],
  };
}

export function buildSocialEvent(state: GameState): GameEvent {
  const scenario = Math.floor(seeded(state.seed, state.season * 1321) * 4);
  if (scenario === 0) {
    return {
      id: DYNAMIC_SOCIAL_EVENT_ID,
      icon: "@",
      tag: "REDES SOCIAIS",
      title: "Uma resposta sua virou assunto nacional",
      description: "Um torcedor criticou sua fase e seu comentário impulsivo recebeu milhares de compartilhamentos antes que você pudesse apagar.",
      choices: [
        { label: "Dobrar a aposta", hint: "Seguidores ↑↑ · imagem polariza", result: "Você sustenta cada palavra. Muita gente aplaude a personalidade; outra parte passa a torcer contra.", effect: { followers: 110_000, socialSentiment: -9, mediaRelation: -6, morale: 5 } },
        { label: "Pedir desculpas sem roteiro", hint: "Imagem ↑ · liderança ↑", result: "O vídeo é curto e direto. Assumir o erro desarma boa parte da crise.", effect: { socialSentiment: 10, mediaRelation: 7, leadership: 4, followers: 25_000 } },
        { label: "Entregar as redes à assessoria", hint: "Seguro · autenticidade ↓", result: "A crise desaparece, mas seu perfil passa a parecer uma coletiva de imprensa.", effect: { socialSentiment: 3, mediaRelation: 5, lifeBalance: 3, followers: -8_000 } },
      ],
    };
  }
  if (scenario === 1) {
    return {
      id: DYNAMIC_SOCIAL_EVENT_ID,
      icon: "●",
      tag: "VIRAL",
      title: "Sua comemoração virou tendência",
      description: "Crianças, jogadores e artistas repetem seu gesto. A internet quer saber se você vai transformar o momento em algo maior.",
      choices: [
        { label: "Criar um desafio oficial", hint: "Seguidores ↑↑↑ · desgaste leve", result: "O desafio atravessa fronteiras e seu perfil explode durante a semana.", effect: { followers: 260_000, socialSentiment: 10, fitness: -3, reputation: 5 } },
        { label: "Ligar o viral a uma campanha solidária", hint: "Impacto social ↑↑ · seguidores ↑", result: "Cada reprodução passa a divulgar uma causa. O gesto deixa de ser só seu.", effect: { followers: 145_000, charity: 14, socialSentiment: 12, leadership: 3 } },
        { label: "Deixar a torcida carregar o momento", hint: "Moral ↑ · crescimento natural", result: "Você não força uma campanha. A comemoração cresce de forma espontânea.", effect: { followers: 70_000, socialSentiment: 6, morale: 5 } },
      ],
    };
  }
  if (scenario === 2) {
    return {
      id: DYNAMIC_SOCIAL_EVENT_ID,
      icon: "!",
      tag: "ARQUIVO DA INTERNET",
      title: "Uma postagem antiga reapareceu",
      description: "Uma frase escrita quando você era adolescente volta sem contexto e abre uma crise que parece maior a cada minuto.",
      choices: [
        { label: "Explicar como você mudou", hint: "Imprensa ↑ · imagem ↑", result: "Você não tenta apagar o passado. A entrevista madura muda o centro da conversa.", effect: { mediaRelation: 10, socialSentiment: 8, leadership: 5, lifeBalance: -3 } },
        { label: "Apagar tudo e ficar em silêncio", hint: "Crise curta · público ↓", result: "A história perde força, mas o silêncio deixa uma sombra difícil de medir.", effect: { followers: -35_000, socialSentiment: -5, mediaRelation: -4, morale: -4 } },
        { label: "Responder com ironia", hint: "50% · viral ou desastre", result: "Você escolhe humor para enfrentar a crise.", effect: {}, luck: { chance: 50, successText: "A resposta é afiada na medida certa e a internet vira a seu favor.", failureText: "A ironia parece arrogância. O problema dobra de tamanho em poucas horas.", successEffect: { followers: 180_000, socialSentiment: 10, morale: 7 }, failureEffect: { followers: 55_000, socialSentiment: -16, mediaRelation: -10, morale: -9 } } },
      ],
    };
  }
  return {
    id: DYNAMIC_SOCIAL_EVENT_ID,
    icon: "▶",
    tag: "TRANSMISSÃO AO VIVO",
    title: "Uma live mostra um lado seu que ninguém conhecia",
    description: "Sem coletiva e sem roteiro, milhares de pessoas acompanham você jogando videogame e conversando sobre a carreira.",
    choices: [
      { label: "Falar abertamente sobre a pressão", hint: "Público ↑↑ · equilíbrio ↑", result: "A sinceridade aproxima torcedores que nunca tinham pensado no peso de uma carreira.", effect: { followers: 130_000, socialSentiment: 11, lifeBalance: 8, mediaRelation: 4 } },
      { label: "Provocar rivais durante a live", hint: "Seguidores ↑↑ · rivalidade ↑", result: "Os cortes viralizam e chegam rapidamente aos vestiários adversários.", effect: { followers: 170_000, socialSentiment: -3, reputation: 6, fans: 6 } },
      { label: "Transformar a live em quadro semanal", hint: "Seguidores ↑↑↑ · descanso ↓", result: "O quadro vira sucesso, mas agora existe mais uma agenda entre treinos e jogos.", effect: { followers: 240_000, lifeBalance: -9, fitness: -4, money: 8 } },
    ],
  };
}

export function buildLifeEvent(state: GameState): GameEvent {
  const scenario = Math.floor(seeded(state.seed, state.season * 1361) * 5);
  const scenarios: GameEvent[] = [
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "☾", tag: "NOITE LIVRE", title: "Seus amigos marcaram uma festa antes do clássico", description: "A folga existe no papel, mas o jogo mais comentado do mês está a poucos dias.",
      choices: [
        { label: "Ir e sair cedo", hint: "Equilíbrio ↑ · risco pequeno", result: "Você aparece, ri e vai embora antes da noite cobrar seu preço.", effect: { lifeBalance: 8, morale: 6, fitness: -3 } },
        { label: "Virar a noite", hint: "Moral ↑↑ · físico ↓↓ · risco", result: "A noite é inesquecível. O treino seguinte também, pelos motivos errados.", effect: { morale: 13, fitness: -15, discipline: -8, socialSentiment: -4, injuryRisk: 5 } },
        { label: "Ficar em casa e estudar o rival", hint: "Jogo grande ↑ · vida pessoal ↓", result: "A preparação rende confiança, mas a carreira ocupa até o espaço da folga.", effect: { titleBoost: 8, lifeBalance: -7, fitness: 5 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "♥", tag: "IMPACTO SOCIAL", title: "A chance de criar sua própria fundação", description: "Um projeto local pede algo maior que uma visita: seu nome, tempo e compromisso por anos.",
      choices: [
        { label: "Fundar o projeto agora", hint: "Impacto social ↑↑↑ · dinheiro ↓", result: "A fundação nasce pequena, mas começa a mudar vidas antes da primeira manchete.", effect: { charity: 20, leadership: 7, money: -14, followers: 60_000, socialSentiment: 9 } },
        { label: "Financiar sem aparecer", hint: "Impacto social ↑↑ · discrição", result: "O dinheiro chega sem câmera. Meses depois, a história acaba descoberta.", effect: { charity: 14, money: -9, socialSentiment: 5, lifeBalance: 4 } },
        { label: "Deixar para uma fase mais estável", hint: "Patrimônio preservado", result: "Você ajuda pontualmente, mas evita assumir uma estrutura que ainda não consegue carregar.", effect: { charity: 3, money: -2, lifeBalance: 3 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "▣", tag: "DOCUMENTÁRIO", title: "Uma produtora quer acesso total à sua temporada", description: "Câmeras em casa, no carro e nos bastidores. A proposta paga bem, mas transforma privacidade em conteúdo.",
      choices: [
        { label: "Abrir todas as portas", hint: "Seguidores ↑↑↑ · dinheiro ↑↑ · equilíbrio ↓", result: "O documentário vira um fenômeno e seu cotidiano deixa de ser completamente seu.", effect: { followers: 340_000, money: 18, mediaRelation: 8, lifeBalance: -13 } },
        { label: "Mostrar apenas o futebol", hint: "Imprensa ↑ · exposição controlada", result: "A série fica menos explosiva, mas preserva quem vive ao seu redor.", effect: { followers: 110_000, mediaRelation: 7, lifeBalance: 3, money: 7 } },
        { label: "Recusar a produção", hint: "Privacidade ↑ · oportunidade perdida", result: "A câmera vai embora. Sua casa volta a ser apenas sua casa.", effect: { lifeBalance: 12, followers: -5_000, morale: 5 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "⌂", tag: "CÍRCULO PESSOAL", title: "Seu entorno começou a crescer rápido demais", description: "Novos amigos, pedidos de dinheiro e gente opinando na carreira. É difícil separar apoio de interesse.",
      choices: [
        { label: "Contratar uma equipe profissional", hint: "Equilíbrio ↑↑ · dinheiro ↓", result: "Agenda, finanças e exposição passam a ter limites claros.", effect: { lifeBalance: 13, money: -8, mediaRelation: 5, morale: 4 } },
        { label: "Confiar apenas nos amigos antigos", hint: "Moral ↑ · risco financeiro", result: "A lealdade conforta, mas nem todo amigo está preparado para administrar uma carreira.", effect: { morale: 8, lifeBalance: 4, money: -4 } },
        { label: "Afastar todo mundo", hint: "Foco ↑ · isolamento", result: "O ruído desaparece. O silêncio também pesa.", effect: { fitness: 7, morale: -10, lifeBalance: -8 } },
      ],
    },
    {
      id: DYNAMIC_LIFE_EVENT_ID, icon: "◉", tag: "SAÚDE MENTAL", title: "A pressão começou a invadir os dias de folga", description: "Você dorme pensando no próximo jogo e acorda revendo o último erro. Fingir que não existe também virou cansativo.",
      choices: [
        { label: "Começar acompanhamento psicológico", hint: "Equilíbrio ↑↑↑ · consistência", result: "A pressão não some, mas deixa de comandar cada pensamento.", effect: { lifeBalance: 18, morale: 10, mediaRelation: 2 } },
        { label: "Conversar com o capitão", hint: "Liderança ↑ · moral ↑", result: "Ouvir alguém que já atravessou essa fase muda a forma como você enxerga o problema.", effect: { lifeBalance: 9, morale: 7, leadership: 5 } },
        { label: "Guardar tudo e treinar mais", hint: "OVR ↑ · equilíbrio ↓↓", result: "O treino oferece controle por algumas horas, mas não resolve o que acontece fora dele.", effect: { ovr: 1, fitness: -8, lifeBalance: -15, morale: -5 } },
      ],
    },
  ];
  return scenarios[scenario];
}

export function buildRivalEvent(state: GameState): GameEvent {
  const activeRivals = state.rivals.filter((rival) => rival.active);
  const rival = pick(activeRivals, state.seed, state.season * 809);
  const rivalClub = clubById(rival.currentClubId);
  return {
    id: DYNAMIC_RIVAL_EVENT_ID,
    icon: "⚔",
    tag: "RIVALIDADE PESSOAL",
    title: `${rival.name} citou você`,
    description: `${rival.name}, ${rival.position} do ${rivalClub.shortName}, disse que sua temporada está recebendo atenção demais. A imprensa quer uma resposta.`,
    choices: [
      {
        label: "Responder dentro de campo",
        hint: "Respeito ↑ · pressão ↑",
        result: `Você evita a guerra de palavras e transforma o duelo com ${rival.name} em motivação.`,
        effect: { titleBoost: 5, reputation: 4, fitness: -4, rivalRespect: 8 },
      },
      {
        label: "Provocar de volta",
        hint: "Prestígio ↑ · rivalidade esquenta",
        result: `A resposta viraliza. O próximo encontro com ${rival.name} agora vale muito mais do que três pontos.`,
        effect: { reputation: 7, morale: 5, fans: 5, rivalRespect: -12 },
      },
      {
        label: "Elogiar o rival",
        hint: "Liderança ↑ · respeito ↑↑",
        result: `Você reconhece o talento de ${rival.name}. A tensão dá lugar a uma rivalidade de alto nível.`,
        effect: { leadership: 6, morale: 3, rivalRespect: 15 },
      },
    ],
  };
}

export const NEARBY_NATIONAL_TEAMS: Record<string, string[]> = {
  brasil: ["argentina", "uruguai", "paraguai", "colombia", "peru"],
  argentina: ["uruguai", "chile", "paraguai", "brasil"],
  uruguai: ["argentina", "brasil", "paraguai"],
  chile: ["argentina", "peru"],
  colombia: ["equador", "peru", "brasil"],
  paraguai: ["brasil", "argentina", "uruguai"],
  equador: ["colombia", "peru"],
  peru: ["equador", "colombia", "chile", "brasil"],
  mexico: ["eua", "colombia"],
  eua: ["mexico"],
  portugal: ["espanha"],
  espanha: ["portugal", "franca"],
  franca: ["espanha", "alemanha", "italia"],
  inglaterra: ["franca", "holanda"],
  alemanha: ["holanda", "franca", "italia"],
  italia: ["franca", "alemanha"],
  holanda: ["alemanha", "franca", "inglaterra"],
  japao: ["coreia-do-sul", "australia"],
  "coreia-do-sul": ["japao", "australia"],
  uzbequistao: ["ira", "iraque", "arabia-saudita"],
  australia: ["nova-zelandia", "japao", "coreia-do-sul"],
  "arabia-saudita": ["catar", "iraque", "ira"],
  marrocos: ["argelia", "tunisia", "senegal"],
  senegal: ["mali", "gana", "costa-do-marfim"],
  nigeria: ["camaroes", "gana", "costa-do-marfim"],
  egito: ["tunisia", "argelia", "marrocos"],
  "costa-do-marfim": ["gana", "mali", "senegal"],
  "nova-zelandia": ["australia"],
};

export // Convite raro de outra seleção: tenta primeiro vizinhos e só então amplia para a região.
function pickNationalitySwitchTarget(state: GameState, salt: number): string | null {
  const originCountry = countryById(state.nationality);
  const nearbyIds = NEARBY_NATIONAL_TEAMS[state.nationality] ?? [];
  const nearbyCandidates = nearbyIds
    .map((countryId) => COUNTRIES.find((country) => country.id === countryId))
    .filter((country): country is Country => Boolean(country));
  const regionalCandidates = COUNTRIES.filter((country) => {
    if (country.id === state.nationality) return false;
    if (originCountry.confederation === "SOUTH_AMERICA") return country.confederation === "SOUTH_AMERICA";
    if (originCountry.confederation === "NORTH_AMERICA") return country.confederation === "NORTH_AMERICA" || country.confederation === "SOUTH_AMERICA";
    return country.confederation === originCountry.confederation;
  });
  const candidates = nearbyCandidates.length && seeded(state.seed, salt + 19) < 0.82
    ? nearbyCandidates
    : regionalCandidates;
  if (!candidates.length) return null;
  return pick(candidates, state.seed, salt).id;
}

export function maybeOfferNationalitySwitch(state: GameState, salt: number): string | null {
  if (state.nationalitySwitchInviteUsed) return null;
  if (state.age < 17 || state.age > 27) return null;
  if (state.nationalCaptain) return null;
  if (state.nationalCaps >= 18) return null;
  if (state.nationalTrophies > 0) return null;
  if (state.overall < 62) return null;
  if (seeded(state.seed, salt) > 0.05) return null;
  return pickNationalitySwitchTarget(state, salt + 31);
}

export function buildNationalitySwitchEvent(from: Country, to: Country): GameEvent {
  return {
    id: NATIONALITY_SWITCH_EVENT_ID,
    icon: "↔",
    tag: "SELEÇÃO",
    title: `A Seleção de ${to.name} quer você`,
    description: `Uma federação vizinha enxergou seu potencial antes da sua consolidação na Seleção principal de ${from.name}. A escolha é sua — e não terá volta.`,
    choices: [
      {
        label: `Vestir a camisa de ${to.name}`,
        hint: "Mudança definitiva · reinício na Seleção",
        result: `Você assina os papéis e passa a defender a Seleção de ${to.name}. Não é possível voltar atrás.`,
        effect: { switchNationalityTo: to.id, reputation: 6, morale: 4 },
      },
      {
        label: `Seguir pela Seleção de ${from.name}`,
        hint: "Fidelidade à seleção original",
        result: `Você agradece o interesse, mas decide seguir representando apenas a Seleção de ${from.name}.`,
        effect: { reputation: 3, morale: 3, leadership: 2 },
      },
    ],
  };
}

export function createYouthJourney(state: GameState, formationId: string) {
  const formation = FORMATIONS.find((item) => item.id === formationId) ?? FORMATIONS[0];
  const club = clubById(state.academyClubId);
  const rawScore =
    41 +
    (club.academy ?? 3) * 5 +
    formation.technical * 1.2 +
    formation.physical * 0.8 +
    formation.mental +
    seeded(state.seed, 11) * 22 -
    formation.risk * seeded(state.seed, 17);
  const score = clamp(Math.round(rawScore), 45, 98);
  const revealAge = score >= 82 ? 16 : score >= 67 ? 17 : 18;
  const startingOverall = 34 + Math.floor(seeded(state.seed, 21) * 5);
  const overall = clamp(Math.round(44 + score * 0.12 + seeded(state.seed, 22) * 4), 49, 60);
  const fateRoll = seeded(state.seed, 701);
  const ceilingRoll = seeded(state.seed, 709);
  const hiddenCeiling = fateRoll < 0.18
    ? 61 + Math.floor(ceilingRoll * 11)
    : fateRoll < 0.80
      ? 70 + Math.floor(ceilingRoll * 13)
      : fateRoll < 0.96
        ? 82 + Math.floor(ceilingRoll * 7)
        : fateRoll < 0.99
          ? 89 + Math.floor(ceilingRoll * 6)
          : 95 + Math.floor(ceilingRoll * 5);
  const potential = clamp(hiddenCeiling, overall + 1, 99);
  const youthEventPool = state.position === "GOL" ? GOALKEEPER_YOUTH_EVENTS : YOUTH_EVENTS;
  const used = new Set<number>();
  const youthYears: YouthYear[] = [];
  let previousOverall = startingOverall;
  for (let age = 12; age <= revealAge; age += 1) {
    let eventIndex = Math.floor(seeded(state.seed, age * 13) * youthEventPool.length);
    while (used.has(eventIndex)) eventIndex = (eventIndex + 1) % youthEventPool.length;
    used.add(eventIndex);
    const event = youthEventPool[eventIndex];
    const positive = seeded(state.seed, age * 19) < score / 110;
    const progress = (age - 12) / Math.max(1, revealAge - 12);
    const yearOverall = age === revealAge
      ? overall
      : clamp(Math.round(startingOverall + (overall - startingOverall) * Math.pow(progress, 0.82)), startingOverall, overall - 1);
    const delta = age === 12 ? 0 : Math.max(1, yearOverall - previousOverall);
    youthYears.push({
      age,
      title: age === revealAge ? "A revelação" : event.title,
      text: age === revealAge ? `O ${club.shortName} colocou seu nome na lista do elenco profissional.` : positive ? event.positive : event.neutral,
      delta,
      overall: yearOverall,
    });
    previousOverall = yearOverall;
  }
  const otherOffers = randomClubSelection(
    revelationOfferPool(state),
    2,
    state.seed,
    2467 + revealAge,
    [state.academyClubId],
  ).map((offerClub) => offerClub.id);
  return {
    formation,
    score,
    revealAge,
    overall,
    potential,
    youthYears,
    offers: [state.academyClubId, ...otherOffers],
  };
}

export function storyClubCandidate(state: GameState, salt: number, preference: "father" | "reject") {
  const academyClub = clubById(state.academyClubId);
  const sameCountry = CLUBS.filter((club) =>
    club.id !== academyClub.id &&
    club.countryId === academyClub.countryId &&
    (preference === "father" ? club.reputation >= 3 : true),
  );
  const regional = CLUBS.filter((club) =>
    club.id !== academyClub.id &&
    countryById(club.countryId).confederation === countryById(academyClub.countryId).confederation,
  );
  return pick(sameCountry.length ? sameCountry : regional, state.seed, salt);
}

export function buildStoryFollowup(
  state: GameState,
  context: { performanceScore: number; titleCount: number; club: Club },
  chapter: number,
) {
  const story = playerStoryById(state.playerStoryId);
  const originEcho: Record<PlayerStoryId, string> = {
    "open-book": "o fato de ninguém conseguir resumir sua trajetória",
    "academy-destroyer": "a fama que chegou antes da estreia profissional",
    "humble-roots": "as pessoas que dividiram o pouco que tinham com você",
    "football-bloodline": "o sobrenome que abriu portas e criou comparações",
    disillusioned: "o período em que você quase abandonou o futebol",
    "street-football": "a rua onde seu jeito de jogar nasceu",
    "late-bloomer": "os relatórios que não enxergaram seu crescimento",
    "academy-reject": "a dispensa que quase encerrou tudo antes de começar",
    "migrant-dream": "a mudança de país que redefiniu a ideia de casa",
    "student-athlete": "o plano de vida que sempre existiu além do gramado",
    "neighborhood-idol": "o bairro que transformou sua carreira num sonho coletivo",
  };
  const beats: Array<{
    key: string;
    title: string;
    description: string;
    choices: StoryDecisionChoice[];
  }> = [
    {
      key: "mentor-return",
      title: "Uma voz do começo reapareceu no seu telefone",
      description: `Um antigo mentor lembra ${originEcho[state.playerStoryId]}. Ele não quer dinheiro nem ingresso: quer saber se você ainda reconhece o jogador que era.`,
      choices: [
        { label: "Viajar para conversar pessoalmente", hint: "Moral e equilíbrio ↑↑ · físico ↓", result: "A conversa devolve perspectiva a uma temporada que parecia consumir tudo.", effect: { morale: 12, lifeBalance: 10, fitness: -4 }, flag: "reencontrou-o-passado" },
        { label: "Convidá-lo para conhecer o clube", hint: "Liderança e treinador ↑", result: "O reencontro aproxima dois mundos e impressiona o vestiário.", effect: { leadership: 8, minutes: 5, mediaRelation: 3 }, flag: "mentor-no-clube" },
        { label: "Agradecer e manter o passado no passado", hint: "Foco ↑ · imagem ↓", result: "A resposta é curta. Você segue em frente, ainda que a mensagem permaneça na cabeça.", effect: { discipline: 7, fitness: 5, morale: -3 }, flag: "fechou-porta-passado" },
      ],
    },
    {
      key: "documentary",
      title: "Uma produtora quer filmar o capítulo que ninguém viu",
      description: `A proposta promete milhões de espectadores e acesso total à sua intimidade. O centro do documentário seria ${originEcho[state.playerStoryId]}.`,
      choices: [
        { label: "Abrir todas as portas para as câmeras", hint: "Seguidores ↑↑↑ · equilíbrio ↓↓", result: "A série vira fenômeno e transforma lembranças privadas em assunto mundial.", effect: { followers: 420_000, reputation: 7, lifeBalance: -12, mediaRelation: 5 }, flag: "documentario-sem-filtro" },
        { label: "Controlar o roteiro e preservar a família", hint: "Imagem e liderança ↑", result: "O filme encontra força justamente nos limites que você impôs.", effect: { mediaRelation: 8, leadership: 5, followers: 130_000 }, flag: "documentario-controlado" },
        { label: "Recusar qualquer adaptação da história", hint: "Equilíbrio ↑↑ · alcance ↓", result: "A produtora procura outro personagem. Sua história continua pertencendo a você.", effect: { lifeBalance: 12, morale: 6, followers: -18_000 }, flag: "recusou-documentario" },
      ],
    },
    {
      key: "origin-rival",
      title: "Um rival disse que sua história virou desculpa",
      description: `Depois de uma partida, um jogador adversário afirma que a imprensa romantiza ${originEcho[state.playerStoryId]} e ignora quem nunca recebeu atenção.`,
      choices: [
        { label: "Responder dentro de campo na próxima vez", hint: "Foco e moral ↑ · rivalidade nasce", result: "Você não cita o rival. O próximo confronto passa a valer muito mais.", effect: { morale: 9, fitness: 5, reputation: 3 }, flag: "rivalidade-da-origem" },
        { label: "Admitir que toda história recebe privilégios", hint: "Imprensa e liderança ↑↑", result: "A resposta madura desmonta a provocação e abre uma conversa maior.", effect: { mediaRelation: 11, leadership: 9, fans: 3 }, flag: "reconheceu-privilegios" },
        { label: "Transformar a fala numa guerra pública", hint: "Alcance ↑↑ · disciplina ↓↓", result: "Os cortes viralizam e a rivalidade domina a semana.", effect: { followers: 230_000, fans: 8, discipline: -10, mediaRelation: -5 }, flag: "guerra-publica-origem" },
      ],
    },
    {
      key: "personal-archive",
      title: "Uma caixa guardada por anos chegou ao clube",
      description: "Dentro dela há fotos, bilhetes e um objeto do começo da carreira. Você precisa decidir o que fazer com uma memória que agora vale dinheiro.",
      choices: [
        { label: "Doar tudo para um museu da sua cidade", hint: "Legado e torcida ↑↑", result: "A exposição vira ponto de encontro para quem acompanhou o começo.", effect: { charity: 10, fans: 10, reputation: 5 }, flag: "arquivo-no-museu" },
        { label: "Guardar a caixa sem mostrar a ninguém", hint: "Equilíbrio e moral ↑", result: "Nem toda parte de uma lenda precisa virar conteúdo.", effect: { lifeBalance: 10, morale: 9 }, flag: "arquivo-privado" },
        { label: "Leiloar o item principal por uma causa", hint: "Impacto social ↑↑↑ · memória vai embora", result: "O objeto muda de mãos e financia um projeto muito maior que ele.", effect: { charity: 17, followers: 90_000, morale: 3 }, flag: "leilao-da-memoria" },
      ],
    },
    {
      key: "career-crossroad",
      title: `${context.club.shortName} quer que você represente uma nova era`,
      description: context.performanceScore >= 75
        ? "O clube oferece protagonismo fora de campo também. Aceitar pode aprofundar sua ligação — e tornar uma futura saída muito mais dolorosa."
        : "Mesmo após um ano irregular, o clube acredita que sua história pode reconectar elenco e torcida.",
      choices: [
        { label: "Assumir o papel de rosto do projeto", hint: "Torcida e liderança ↑↑ · pressão ↑", result: "Sua imagem passa a ocupar muros, campanhas e conversas sobre o futuro.", effect: { fans: 11, leadership: 9, morale: -4, reputation: 5 }, flag: "rosto-da-nova-era" },
        { label: "Aceitar apenas responsabilidades esportivas", hint: "Treinador e foco ↑", result: "Você escolhe liderar pelo treino e pelas partidas.", effect: { minutes: 7, discipline: 6, fitness: 4 }, flag: "lideranca-no-campo" },
        { label: "Recusar para preservar sua liberdade", hint: "Equilíbrio ↑ · torcida divide", result: "A decisão evita promessas vazias, mas parte da arquibancada esperava mais.", effect: { lifeBalance: 9, fans: -5, mediaRelation: 3 }, flag: "preservou-liberdade" },
      ],
    },
    {
      key: "family-truth",
      title: "Sua família contou uma versão que você nunca conheceu",
      description: `Uma entrevista revela quanto custou manter vivo ${originEcho[state.playerStoryId]}. O relato muda detalhes que você repetiu durante anos.`,
      choices: [
        { label: "Ouvir tudo longe das câmeras", hint: "Moral e família ↑↑", result: "A conversa preenche silêncios antigos e muda sua relação com o passado.", effect: { morale: 13, lifeBalance: 9, leadership: 3 }, flag: "ouviu-a-verdade" },
        { label: "Transformar a revelação numa homenagem pública", hint: "Torcida e alcance ↑↑", result: "A homenagem emociona o estádio e devolve o protagonismo a quem ficou nos bastidores.", effect: { fans: 10, followers: 180_000, charity: 5 }, flag: "homenagem-as-raizes" },
        { label: "Pedir que a história não seja explorada", hint: "Privacidade ↑ · imprensa ↓", result: "A família aceita o limite e a pauta termina ali.", effect: { lifeBalance: 11, mediaRelation: -6, morale: 5 }, flag: "protegeu-a-familia" },
      ],
    },
    {
      key: "legacy-choice",
      title: "Uma criança repetiu sua história palavra por palavra",
      description: `Ela diz que começou a jogar por causa de “${story.title}”. Pela primeira vez, você percebe que sua origem já não pertence somente a você.`,
      choices: [
        { label: "Criar um projeto para novos jogadores", hint: "Dinheiro ↓↓ · legado ↑↑↑", result: "O primeiro treino reúne crianças que se reconhecem na sua trajetória.", effect: { money: -16, charity: 20, fans: 11, leadership: 7 }, flag: "projeto-da-origem" },
        { label: "Convidar a criança para uma partida", hint: "Moral e torcida ↑↑", result: "O encontro dura minutos e vira uma memória para a vida inteira.", effect: { morale: 12, fans: 9, followers: 80_000 }, flag: "convite-ao-estadio" },
        { label: "Escrever uma carta sem transformar em campanha", hint: "Equilíbrio e liderança ↑", result: "A resposta chega sem patrocinador, câmera ou comunicado.", effect: { lifeBalance: 8, leadership: 8, morale: 6 }, flag: "carta-sem-camera" },
      ],
    },
  ];
  const usedIds = new Set(state.storyLog.map((entry) => entry.decisionId).filter(Boolean));
  const usedTitles = new Set(state.storyLog.map((entry) => entry.title));
  const unusedOriginChapters = STORY_CHAPTER_BEATS[state.playerStoryId].filter((beat) => !usedTitles.has(beat.title));
  if (unusedOriginChapters.length) {
    return pick(unusedOriginChapters, state.seed, state.season * 1949 + chapter * 83);
  }
  const available = beats.filter((beat) => !usedIds.has(`story-followup-${beat.key}`) && !usedTitles.has(beat.title));
  const pool = available.length ? available : beats;
  return pick(pool, state.seed, state.season * 1931 + chapter * 71);
}

export function buildStorySeasonDecision(
  state: GameState,
  context: { performanceScore: number; titleCount: number; club: Club },
): StoryDecision | null {
  if (state.playerStoryId === "open-book") return null;
  const story = playerStoryById(state.playerStoryId);
  const chapter = state.storyLog.length + 1;
  if (chapter > 8) return null;
  const milestoneBoost =
    context.performanceScore >= 82 ||
    context.titleCount > 0 ||
    state.age === 18 ||
    state.age === 23 ||
    state.age === 30
      ? 0.16
      : 0;
  const chance = 0.27 + milestoneBoost + (chapter === 1 ? 0.11 : 0);
  if (seeded(state.seed, state.season * 1877 + chapter * 43) >= chance) return null;

  const base = {
    id: `story-${state.playerStoryId}-${state.season}-${chapter}`,
    storyId: state.playerStoryId,
    chapter,
    icon: story.icon,
    kicker: `CAPÍTULO ${String(chapter).padStart(2, "0")} · ${story.title.toLocaleUpperCase("pt-BR")}`,
  };
  const fatherClub = storyClubCandidate(state, 1889 + chapter * 17, "father");
  const rejectedClub = storyClubCandidate(state, 1901 + chapter * 19, "reject");
  const decisions: Record<PlayerStoryId, Omit<StoryDecision, keyof typeof base>> = {
    "open-book": {
      title: "Alguém tentou resumir sua carreira numa única frase",
      description: "A reportagem procura uma origem perfeita para explicar seu momento. A verdade é menos simples: sua história foi sendo escrita enquanto acontecia.",
      choices: [
        { label: "Dizer que ainda não existe uma definição", hint: "Liberdade ↑ · imagem autêntica", result: "A ausência de rótulo vira justamente a parte mais interessante da entrevista.", effect: { mediaRelation: 6, morale: 6, lifeBalance: 4 }, flag: "recusou-rotulo" },
        { label: "Escolher o trabalho como fio da história", hint: "Disciplina e treinador ↑", result: "Você transforma constância em identidade.", effect: { discipline: 8, minutes: 5, leadership: 3 }, flag: "historia-do-trabalho" },
        { label: "Deixar a torcida dar um nome à trajetória", hint: "Torcida e seguidores ↑", result: "As arquibancadas inventam apelidos e versões que você jamais escreveria sozinho.", effect: { fans: 8, followers: 85_000, reputation: 3 }, flag: "historia-da-torcida" },
      ],
    },
    "academy-destroyer": {
      title: chapter <= 2 ? "A marca de promessa virou cobrança" : "Seu antigo recorde voltou para assombrar a temporada",
      description: context.performanceScore >= 78
        ? "Os vídeos da base reaparecem ao lado dos seus melhores lances. A imprensa quer transformar talento em destino."
        : "Uma temporada humana foi tratada como queda. Seu nome ainda vende a ideia de que tudo precisa ser extraordinário.",
      choices: [
        { label: "Assumir que quer ser o melhor do mundo", hint: "Prestígio ↑↑ · pressão ↑", result: "A frase domina as manchetes. Agora todo jogo parece uma prova.", effect: { reputation: 8, followers: 180_000, morale: -6, mediaRelation: 3 }, flag: "aceitou-o-peso" },
        { label: "Proteger o vestiário e dividir o mérito", hint: "Liderança ↑↑ · torcida ↑", result: "Você recusa o personagem de salvador e ganha o elenco.", effect: { leadership: 9, fans: 6, minutes: 4 }, flag: "dividiu-os-holofotes" },
        { label: "Fechar as redes por um mês", hint: "Equilíbrio ↑ · alcance ↓", result: "O silêncio diminui o barulho e devolve prazer ao treino.", effect: { lifeBalance: 10, morale: 8, followers: -45_000, mediaRelation: -3 }, flag: "sumiu-dos-holofotes" },
      ],
    },
    "humble-roots": {
      title: "Uma ligação de casa mudou o valor do próximo contrato",
      description: "A família pode finalmente sair do aperto, mas o pedido chega quando você também tenta construir sua própria vida.",
      choices: [
        { label: "Comprar uma casa para a família", hint: "Dinheiro ↓↓ · moral e legado ↑", result: "A chave vale mais que qualquer prêmio daquela temporada.", effect: { money: -18, morale: 13, leadership: 5, fans: 5 }, flag: "casa-da-familia" },
        { label: "Criar um fundo mensal organizado", hint: "Dinheiro ↓ · equilíbrio ↑", result: "Você ajuda sem transformar cada emergência em crise.", effect: { money: -8, lifeBalance: 9, discipline: 4, morale: 5 }, flag: "fundo-familiar" },
        { label: "Dizer que ainda não é a hora", hint: "Foco ↑ · moral ↓", result: "A decisão protege sua carreira e pesa nas conversas de domingo.", effect: { fitness: 6, minutes: 4, morale: -9, lifeBalance: -5 }, flag: "adiou-a-ajuda" },
      ],
    },
    "football-bloodline": {
      title: `${fatherClub.shortName}, o clube que marcou seu pai, quer conversar`,
      description: `A proposta não é apenas esportiva. Para muita gente, vestir essa camisa fecharia um círculo; para você, pode abrir uma comparação impossível.`,
      choices: [
        { label: `Ouvir o projeto do ${fatherClub.shortName}`, hint: "Proposta especial liberada", result: "Seu empresário coloca a proposta na mesa. A decisão final ainda será sua.", effect: { reputation: 5, morale: 4 }, transferClubId: fatherClub.id, flag: `ouviu-clube-do-pai:${fatherClub.id}` },
        { label: "Dizer que sua história precisa ser outra", hint: "Personalidade ↑ · imprensa divide", result: "A resposta é respeitosa e definitiva. Pela primeira vez, a manchete usa apenas seu nome.", effect: { leadership: 8, mediaRelation: -2, reputation: 4 }, flag: "rompeu-comparacao" },
        { label: "Pedir conselho ao seu pai em público", hint: "Moral ↑ · pressão ↑", result: "A conversa emociona torcedores e reacende todas as comparações.", effect: { morale: 10, followers: 150_000, lifeBalance: -4 }, flag: "conselho-do-pai" },
      ],
    },
    disillusioned: {
      title: "Depois do treino, você ficou sozinho no gramado",
      description: context.performanceScore < 60
        ? "A velha pergunta voltou: você ainda quer isso ou apenas aprendeu a continuar?"
        : "Mesmo num grande ano, a comemoração pareceu distante. Vencer e sentir são coisas diferentes.",
      choices: [
        { label: "Procurar o treinador que fez você amar o jogo", hint: "Paixão ↑↑ · potencial pode florescer", result: "Uma conversa sem câmeras devolve sentido aos próximos meses.", effect: { morale: 15, lifeBalance: 9, potential: 1 }, flag: "reencontrou-mentor" },
        { label: "Transformar tudo em disciplina", hint: "Físico e OVR ↑ · equilíbrio ↓", result: "Você não encontra alegria, mas encontra método.", effect: { ovr: 1, fitness: 8, discipline: 7, lifeBalance: -9 }, flag: "virou-maquina" },
        { label: "Admitir publicamente que não está bem", hint: "Imprensa ↑ · reputação oscila", result: "A honestidade surpreende. Muitos atletas se reconhecem em você.", effect: { mediaRelation: 12, followers: 120_000, reputation: -2, morale: 6 }, flag: "falou-sobre-a-mente" },
      ],
    },
    "street-football": {
      title: "O treinador quer tirar o improviso do seu jogo",
      description: "A comissão mostra números: seus riscos criam lances inesquecíveis e contra-ataques perigosos na mesma proporção.",
      choices: [
        { label: "Aprender o sistema sem perder a ousadia", hint: "Controle ↑↑ · evolução equilibrada", result: "Você passa a escolher melhor quando quebrar o roteiro.", effect: { ovr: 1, discipline: 7, minutes: 5 }, flag: "domou-o-caos" },
        { label: "Dizer que foi o improviso que trouxe você até aqui", hint: "Torcida ↑↑ · treinador ↓", result: "A arquibancada compra sua briga; a comissão não esquece.", effect: { fans: 11, followers: 130_000, minutes: -9, morale: 6 }, flag: "defendeu-a-rua" },
        { label: "Treinar a jogada secreta depois do expediente", hint: "50% · lance histórico ou desgaste", result: "Você guarda uma nova jogada para o momento certo.", effect: { fitness: -7, potential: 1, reputation: 3 }, flag: "jogada-secreta" },
      ],
    },
    "late-bloomer": {
      title: "O olheiro que ignorou você pediu uma nova avaliação",
      description: "O relatório antigo dizia que faltava explosão e futuro. Agora o mesmo nome aparece numa mensagem elogiando sua evolução.",
      choices: [
        { label: "Responder com o relatório emoldurado", hint: "Moral ↑ · rivalidade pessoal", result: "A provocação viraliza e vira combustível para a temporada.", effect: { morale: 12, followers: 95_000, mediaRelation: -4 }, flag: "emoldurou-o-relatorio" },
        { label: "Aceitar a conversa e ouvir o que mudou", hint: "Potencial ↑ · maturidade ↑", result: "Você descobre detalhes do próprio jogo que nunca tinha percebido.", effect: { potential: 2, leadership: 5, discipline: 4 }, flag: "ouviu-o-olheiro" },
        { label: "Ignorar e continuar trabalhando", hint: "Físico ↑ · perfil discreto", result: "Nenhuma postagem, nenhuma resposta. Só mais uma sessão de treino.", effect: { fitness: 9, ovr: 1, followers: -12_000 }, flag: "respondeu-no-campo" },
      ],
    },
    "academy-reject": {
      title: `${rejectedClub.shortName} apareceu no seu caminho`,
      description: `Um dirigente ligado à sua primeira dispensa agora admite que o clube errou. Há uma proposta informal e um pedido de desculpas.`,
      choices: [
        { label: `Aceitar conversar com o ${rejectedClub.shortName}`, hint: "Proposta especial · ferida aberta", result: "O clube que disse não agora precisa convencer você.", effect: { reputation: 5, morale: 3 }, transferClubId: rejectedClub.id, flag: `reabriu-porta:${rejectedClub.id}` },
        { label: "Aceitar as desculpas, recusar a proposta", hint: "Maturidade ↑↑", result: "O passado perde força sem precisar ser apagado.", effect: { leadership: 10, lifeBalance: 8, morale: 6 }, flag: "perdoou-sem-voltar" },
        { label: "Publicar o relatório da dispensa", hint: "Viral ↑↑ · imprensa ↓", result: "A internet transforma sua rejeição em símbolo. O clube chama a atitude de desnecessária.", effect: { followers: 210_000, fans: 8, mediaRelation: -10, reputation: 3 }, flag: "expos-a-dispensa" },
      ],
    },
    "migrant-dream": {
      title: "Duas bandeiras apareceram na mesma arquibancada",
      description: "Uma reportagem quer definir a qual lugar você pertence. Sua família sabe que a resposta nunca coube numa palavra.",
      choices: [
        { label: "Dizer que carrega os dois lugares", hint: "Imagem ↑↑ · adaptação ↑", result: "A resposta atravessa fronteiras e aproxima comunidades diferentes.", effect: { followers: 170_000, mediaRelation: 9, adaptation: 9, leadership: 4 }, flag: "duas-casas" },
        { label: "Dedicar a temporada ao país da sua base", hint: "Torcida local ↑ · raízes fortes", result: "A cidade onde você cresceu adota a frase como lema.", effect: { fans: 10, morale: 7, reputation: 4 }, flag: "escolheu-a-base" },
        { label: "Recusar transformar identidade em manchete", hint: "Equilíbrio ↑ · imprensa ↓", result: "Você protege sua família e encerra a pauta.", effect: { lifeBalance: 11, mediaRelation: -7, morale: 5 }, flag: "protegeu-identidade" },
      ],
    },
    "student-athlete": {
      title: "Uma universidade ofereceu um curso feito ao redor da sua carreira",
      description: "A oportunidade exige horas semanais e promete algo raro: um futuro que não depende do próximo contrato.",
      choices: [
        { label: "Aceitar o curso completo", hint: "Visão e liderança ↑ · físico ↓", result: "As noites ficam menores, mas seu modo de ler o jogo muda.", effect: { leadership: 9, mediaRelation: 6, fitness: -6, lifeBalance: 3 }, flag: "entrou-na-universidade" },
        { label: "Fazer apenas módulos nas férias", hint: "Equilíbrio · disciplina ↑", result: "Você encontra um ritmo que não sacrifica o campo.", effect: { discipline: 7, lifeBalance: 7, leadership: 3 }, flag: "curso-nas-ferias" },
        { label: "Adiar até a aposentadoria", hint: "Foco esportivo ↑ · plano B distante", result: "O futebol ocupa todo o calendário novamente.", effect: { fitness: 7, minutes: 4, lifeBalance: -4 }, flag: "adiou-os-estudos" },
      ],
    },
    "neighborhood-idol": {
      title: "O campo onde você começou pode desaparecer",
      description: "O terreno será vendido se a comunidade não levantar dinheiro e atenção. Seu nome pode salvar o lugar — mas o projeto exige presença real.",
      choices: [
        { label: "Comprar e reformar o campo", hint: "Dinheiro ↓↓↓ · legado ↑↑↑", result: "As luzes acendem de novo. Uma placa pequena leva seu nome; o campo continua sendo do bairro.", effect: { money: -25, charity: 18, fans: 12, leadership: 8 }, flag: "salvou-o-campo" },
        { label: "Mobilizar patrocinadores e torcida", hint: "Imagem e alcance ↑ · desgaste", result: "A campanha bate a meta sem depender apenas do seu bolso.", effect: { followers: 190_000, charity: 12, mediaRelation: 7, fitness: -5 }, flag: "campanha-pelo-campo" },
        { label: "Fazer uma doação discreta", hint: "Dinheiro ↓ · equilíbrio ↑", result: "O projeto ganha fôlego sem transformar ajuda em publicidade.", effect: { money: -9, charity: 8, morale: 9, followers: -5_000 }, flag: "ajuda-discreta" },
      ],
    },
  };
  const signatureDecision = decisions[state.playerStoryId];
  const signatureWasSeen = state.storyLog.some((entry) => entry.title === signatureDecision.title);
  if (chapter === 1 && !signatureWasSeen) return { ...base, ...signatureDecision };
  const followup = buildStoryFollowup(state, context, chapter);
  return {
    ...base,
    id: `story-followup-${followup.key}-${state.season}-${chapter}`,
    title: followup.title,
    description: followup.description,
    choices: followup.choices,
  };
}

export function buildPressConference(
  state: GameState,
  match: PendingBotaoMatch,
  result: BotaoMatchResult,
  opponentName: string,
): PressConference {
  const wonTitle = result.champion && match.stageName === "Final";
  const story = playerStoryById(state.playerStoryId);
  const pool: PressQuestion[] = [
    {
      id: "individual-night",
      context: `${result.playerGoals} gol(s), ${result.playerAssists} assistência(s) e o prêmio de melhor em campo.`,
      question: "Foi a melhor atuação da sua carreira até aqui?",
      answers: [
        { label: "Foi uma noite que eu nunca vou esquecer", tone: "bold", result: "A confiança vira manchete e a torcida abraça o protagonista.", effect: { morale: 7, fans: 5, followers: 45_000 } },
        { label: "O prêmio pertence ao time inteiro", tone: "team", result: "O elenco recebe a fala como um gesto real, não como frase pronta.", effect: { leadership: 7, minutes: 4, fans: 3 } },
        { label: "Ainda consigo jogar muito melhor", tone: "calm", result: "A cobrança sobre você aumenta, junto com o respeito pela ambição.", effect: { reputation: 5, morale: -2, mediaRelation: 2 } },
      ],
    },
    {
      id: "opposition",
      context: `${opponentName} tentou tirar seu espaço até o último lance.`,
      question: `O que fez a diferença contra o ${opponentName}?`,
      answers: [
        { label: "Nós entendemos onde eles eram vulneráveis", tone: "calm", result: "A resposta tática agrada a comissão.", effect: { minutes: 6, leadership: 3, mediaRelation: 3 } },
        { label: "Em decisão, personalidade pesa mais", tone: "bold", result: "A frase vira corte de vídeo e provoca o adversário.", effect: { reputation: 6, followers: 65_000, discipline: -2 } },
        { label: "Respeito total; eles nos levaram ao limite", tone: "team", result: "A fala baixa a temperatura depois da partida.", effect: { mediaRelation: 6, leadership: 4, fans: 2 } },
      ],
    },
    {
      id: "next-step",
      context: wonTitle ? "A taça ainda está no gramado." : "A classificação já muda o tamanho da temporada.",
      question: wonTitle ? "Essa conquista muda seu lugar na história do clube?" : "Até onde esse time pode chegar agora?",
      answers: [
        { label: wonTitle ? "Quero virar eterno aqui" : "Nós vamos buscar o título", tone: "bold", result: "A promessa aumenta sua ligação com a arquibancada e a cobrança do próximo capítulo.", effect: { fans: 8, reputation: 5, morale: 3 } },
        { label: "A temporada só termina quando o calendário acabar", tone: "calm", result: "A comissão gosta do foco imediato.", effect: { fitness: 4, minutes: 4, discipline: 3 } },
        { label: "Hoje é dia de agradecer quem veio com a gente", tone: "team", result: "A resposta divide o holofote e fortalece sua imagem de líder.", effect: { leadership: 8, mediaRelation: 5, followers: 35_000 } },
      ],
    },
    {
      id: "origin",
      context: `Sua origem como “${story.title}” voltou a ser lembrada durante a transmissão.`,
      question: "Quanto daquela história ainda entra em campo com você?",
      answers: [
        { label: "Tudo. Eu não seria o mesmo sem ela", tone: "bold", result: "Sua origem vira parte pública da identidade do jogador.", effect: { morale: 7, followers: 55_000, fans: 4 } },
        { label: "Ela me formou, mas não me prende", tone: "calm", result: "A resposta marca uma distância madura entre passado e presente.", effect: { leadership: 6, lifeBalance: 5, mediaRelation: 3 } },
        { label: "Prefiro guardar essa parte para minha família", tone: "team", result: "A imprensa respeita o limite, ainda que a curiosidade continue.", effect: { lifeBalance: 8, mediaRelation: -2, morale: 4 } },
      ],
    },
  ];
  const questionCount = 1 + Math.floor(seeded(state.seed, match.season * 1999 + match.id.length) * 3);
  const questions = pool
    .map((question, index) => ({ question, order: seeded(state.seed, match.season * 2003 + index * 37 + match.id.length) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, questionCount)
    .map(({ question }) => question);
  return {
    matchId: match.id,
    competitionName: match.competitionName,
    opponentName,
    questionIndex: 0,
    questions,
  };
}

export function applyEffect(state: GameState, effect: Effect) {
  const overall = clamp(state.overall + (effect.ovr ?? 0), 40, 99);
  const signedSponsor: SponsorDeal | null = effect.sponsorBrand
    ? {
        id: `${state.seed}-${state.season}-${effect.sponsorBrand}`,
        brand: effect.sponsorBrand,
        startSeason: state.season,
        endSeason: state.season + Math.max(1, effect.sponsorYears ?? 2),
        annualValue: Math.max(50_000, effect.sponsorValue ?? 100_000),
        signedAtFollowers: state.followers,
        status: "active",
      }
    : null;
  return {
    ...state,
    overall,
    attributes: shiftPlayerAttributes(state.attributes, effect.ovr ?? 0, state.position, state.seed + state.season),
    potential: clamp(state.potential + (effect.potential ?? 0), 45, 99),
    morale: clamp(state.morale + (effect.morale ?? 0)),
    fitness: clamp(state.fitness + (effect.fitness ?? 0)),
    reputation: clamp(state.reputation + (effect.reputation ?? 0), 0, 100),
    leadership: clamp(state.leadership + (effect.leadership ?? 0), 0, 100),
    money: Math.max(0, state.money + (effect.money ?? 0) * 10_000),
    spendableMoney: Math.max(0, state.spendableMoney + Math.round((effect.money ?? 0) * 3_500)),
    nationalLevel: clamp(state.nationalLevel + (effect.nationalBoost ?? 0), 0, 100),
    fanSupport: clamp(state.fanSupport + (effect.fans ?? 0), 0, 100),
    adaptation: clamp(state.adaptation + (effect.adaptation ?? 0), 0, 100),
    managerTrust: clamp(state.managerTrust + (effect.minutes ?? 0) * 0.7 + (effect.leadership ?? 0) * 0.15),
    discipline: clamp(state.discipline + (effect.discipline ?? 0)),
    contractYears: Math.max(0, state.contractYears + (effect.contractYears ?? 0)),
    annualSalary: Math.round(state.annualSalary * (1 + (effect.salaryBoost ?? 0) / 100)),
    clubCaptain: Boolean(state.clubCaptain || effect.clubCaptain),
    followers: Math.max(0, state.followers + (effect.followers ?? 0)),
    socialSentiment: clamp(state.socialSentiment + (effect.socialSentiment ?? 0)),
    mediaRelation: clamp(state.mediaRelation + (effect.mediaRelation ?? 0)),
    lifeBalance: clamp(state.lifeBalance + (effect.lifeBalance ?? 0)),
    charityReputation: clamp(state.charityReputation + (effect.charity ?? 0)),
    activeSponsor: signedSponsor ?? state.activeSponsor,
  };
}

export function applyStoryOrigin(state: GameState, storyId: PlayerStoryId) {
  const story = playerStoryById(storyId);
  const modifiers = story.modifiers;
  const overallDelta = modifiers.overall ?? 0;
  let attributes = shiftPlayerAttributes(state.attributes, overallDelta, state.position, state.seed + 1709);
  if (storyId === "street-football") {
    attributes = {
      ...attributes,
      dribbling: clamp(attributes.dribbling + 5, 15, 99),
      firstTouch: clamp(attributes.firstTouch + 4, 15, 99),
      composure: clamp(attributes.composure + 2, 15, 99),
    };
  } else if (storyId === "student-athlete") {
    attributes = {
      ...attributes,
      vision: clamp(attributes.vision + 5, 15, 99),
      passing: clamp(attributes.passing + 3, 15, 99),
    };
  }
  return {
    ...state,
    playerStoryId: storyId,
    overall: clamp(state.overall + overallDelta, 38, 99),
    potential: clamp(state.potential + (modifiers.potential ?? 0), 50, 99),
    attributes,
    morale: clamp(state.morale + (modifiers.morale ?? 0)),
    fitness: clamp(state.fitness + (modifiers.fitness ?? 0)),
    reputation: clamp(state.reputation + (modifiers.reputation ?? 0)),
    leadership: clamp(state.leadership + (modifiers.leadership ?? 0)),
    discipline: clamp(state.discipline + (modifiers.discipline ?? 0)),
    fanSupport: clamp(state.fanSupport + (modifiers.fanSupport ?? 0)),
    managerTrust: clamp(state.managerTrust + (modifiers.managerTrust ?? 0)),
    followers: Math.max(0, state.followers + (modifiers.followers ?? 0)),
    mediaRelation: clamp(state.mediaRelation + (modifiers.mediaRelation ?? 0)),
    lifeBalance: clamp(state.lifeBalance + (modifiers.lifeBalance ?? 0)),
    charityReputation: clamp(state.charityReputation + (modifiers.charityReputation ?? 0)),
    adaptation: clamp(state.adaptation + (modifiers.adaptation ?? 0)),
    money: Math.max(0, state.money + (modifiers.money ?? 0) * 10_000),
  };
}
