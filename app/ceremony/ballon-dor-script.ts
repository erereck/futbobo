// Roteiro da cerimônia da Bola de Ouro: o top 3 do mundo revelado do terceiro
// para o primeiro, com o jogador podendo ganhar ou perder.
//
// Um roteiro só, em segundos, lido pelas duas versões da cena: o palco 3D
// (`ballon-dor-stage.ts`, bonecos da partida) e a versão 2D (bustos). As duas
// leem o mesmo relógio, então legendas, cortes e revelações batem sempre.
//
// A ordem de revelação segue a gala de verdade: sai o terceiro, sobram dois
// no palco e o envelope decide entre eles. Quem não é chamado fica em segundo.

import { CLUBS } from "../game-data";
import { careerSquadAppearance, normalizePlayerAppearance, randomPlayerAppearance, type PlayerAppearance } from "../player-appearance";
import { clubById, seeded } from "../career/shared";

export type CeremonyPlace = 1 | 2 | 3;

export type CeremonyFinalist = {
  /** "user", "rival-a" ou "rival-b". */
  id: string;
  name: string;
  isUser: boolean;
  place: CeremonyPlace;
  appearance: PlayerAppearance;
  number: number;
  club: { name: string; shortName: string; primary: string; secondary: string };
  /** Id do país (para bandeira), quando se sabe. */
  nationality: string | null;
};

export type CeremonyInput = {
  season: number;
  seed: number;
  /** Ordem no palco, da esquerda para a direita de quem olha da plateia. O jogador fica no meio. */
  finalists: [CeremonyFinalist, CeremonyFinalist, CeremonyFinalist];
  presenter: { name: string; appearance: PlayerAppearance };
};

export type BeatId =
  | "establish"
  | "nominee"
  | "presenter"
  | "third"
  | "duel"
  | "reveal"
  | "celebrate"
  | "reaction"
  | "end";

export type CeremonyCaption = {
  kicker: string;
  title: string;
  sub?: string;
};

export type CeremonyBeat = {
  id: BeatId;
  start: number;
  end: number;
  /**
   * Quem a cena enquadra: id de um finalista, "presenter" ou "stage" (plano
   * aberto). No "duel" o foco alterna; use `focusAt`.
   */
  focus: string;
  /** Beat "nominee": índice do finalista em `input.finalists`. */
  nominee?: number;
  /** Legenda antes da revelação (ou a única, sem revelação). */
  caption: CeremonyCaption | null;
  /** "third" e "reveal": instante do nome e a legenda depois dele. */
  revealAt?: number;
  revealCaption?: CeremonyCaption;
};

export type CeremonyTimeline = {
  input: CeremonyInput;
  beats: CeremonyBeat[];
  /** Começo do beat "end" (cartão final, sem fim próprio). */
  duration: number;
  thirdRevealAt: number;
  winnerRevealAt: number;
  /** O apresentador entrega o troféu. */
  trophyHandoffAt: number;
  /** O vencedor ergue o troféu acima da cabeça. */
  trophyLiftAt: number;
  /** Cortes do duelo: a partir de `at`, o foco é `focus`. */
  duelCuts: Array<{ at: number; focus: string }>;
  first: CeremonyFinalist;
  second: CeremonyFinalist;
  third: CeremonyFinalist;
  user: CeremonyFinalist;
  userWon: boolean;
};

// ------------------------------------------------------------ cronômetro

// Os trechos de espera (abertura, apresentações, suspense) são curtos de
// propósito. Da revelação até a entrega da taça o tempo fica como está: é o
// que o vencedor e o apresentador levam andando até o meio do palco.
const ESTABLISH = 3.6;
const NOMINEE = 2.1;
const PRESENTER = 2.4;
/** "Em terceiro lugar..." fica sozinho na tela este tempo antes do nome. */
const THIRD_SUSPENSE = 1.4;
const THIRD = 4.4;
const DUEL_CUT = 1.15;
const DUEL_CUTS = 5;
const REVEAL_SUSPENSE = 1.6;
const REVEAL = 4;
const CELEBRATE = 6.4;
const REACTION = 3.8;

function place(input: CeremonyInput, value: CeremonyPlace) {
  return input.finalists.find((finalist) => finalist.place === value) ?? input.finalists[0];
}

export function buildCeremonyTimeline(input: CeremonyInput): CeremonyTimeline {
  const season = input.season;
  const first = place(input, 1);
  const second = place(input, 2);
  const third = place(input, 3);
  const user = input.finalists.find((finalist) => finalist.isUser) ?? input.finalists[1];
  const userWon = first.isUser;
  const beats: CeremonyBeat[] = [];
  let t = 0;
  const push = (beat: Omit<CeremonyBeat, "start" | "end">, length: number) => {
    beats.push({ ...beat, start: t, end: t + length });
    t += length;
  };

  push({
    id: "establish",
    focus: "stage",
    caption: { kicker: "A NOITE MAIS IMPORTANTE DO FUTEBOL", title: `Ballon d'Or ${season}`, sub: "Os três melhores jogadores do mundo estão no palco" },
  }, ESTABLISH);

  input.finalists.forEach((finalist, index) => {
    push({
      id: "nominee",
      focus: finalist.id,
      nominee: index,
      caption: {
        kicker: finalist.isUser ? "FINALISTA · VOCÊ" : `FINALISTA ${index + 1}`,
        title: finalist.name,
        sub: `${finalist.club.name} · camisa ${finalist.number}`,
      },
    }, NOMINEE);
  });

  push({
    id: "presenter",
    focus: "presenter",
    caption: { kicker: "O ENVELOPE ESTÁ ABERTO", title: "O top 3 do mundo", sub: "Do terceiro para o primeiro" },
  }, PRESENTER);

  const thirdStart = t;
  push({
    id: "third",
    focus: third.id,
    caption: { kicker: "EM TERCEIRO LUGAR...", title: "" },
    revealAt: thirdStart + THIRD_SUSPENSE,
    revealCaption: {
      kicker: third.isUser ? "VOCÊ É O TERCEIRO MELHOR DO MUNDO" : "TERCEIRO LUGAR",
      title: third.name,
      sub: third.club.name,
    },
  }, THIRD);

  // Duelo: corta entre os dois que sobraram, começando pelo jogador se ele ainda está no páreo
  // (senão, na ordem do palco: o vencedor não pode ser sempre o primeiro nome da legenda).
  const stageOrder = (finalist: CeremonyFinalist) => input.finalists.indexOf(finalist);
  const duelists = [first, second].sort((a, b) => Number(b.isUser) - Number(a.isUser) || stageOrder(a) - stageOrder(b));
  const duelStart = t;
  const duelCuts = Array.from({ length: DUEL_CUTS }, (_, index) => ({
    at: duelStart + index * DUEL_CUT,
    focus: index === DUEL_CUTS - 1 ? "presenter" : duelists[index % 2].id,
  }));
  push({
    id: "duel",
    focus: duelists[0].id,
    caption: { kicker: "RESTAM DOIS", title: `${duelists[0].name} ou ${duelists[1].name}?`, sub: `Quem leva a Bola de Ouro ${season}?` },
  }, DUEL_CUT * DUEL_CUTS);

  const revealStart = t;
  push({
    id: "reveal",
    focus: first.id,
    caption: { kicker: `A BOLA DE OURO ${season} VAI PARA...`, title: "" },
    revealAt: revealStart + REVEAL_SUSPENSE,
    revealCaption: { kicker: "MELHOR JOGADOR DO MUNDO", title: first.name, sub: first.club.name },
  }, REVEAL);

  const celebrateStart = t;
  push({
    id: "celebrate",
    focus: first.id,
    caption: userWon
      ? { kicker: "VOCÊ É O MELHOR DO MUNDO", title: user.name, sub: `Bola de Ouro ${season}` }
      : { kicker: `BOLA DE OURO ${season}`, title: first.name, sub: `Você terminou em ${user.place}º lugar` },
  }, CELEBRATE);

  push({
    id: "reaction",
    focus: userWon ? first.id : user.id,
    caption: userWon
      ? { kicker: "FOTO OFICIAL", title: "O mundo aos seus pés", sub: `${second.name} e ${third.name} aplaudem de pé` }
      : { kicker: "TOP 3 DO MUNDO", title: `${user.place}º lugar na Bola de Ouro`, sub: "Ninguém tira isso de você. Ano que vem tem mais." },
  }, REACTION);

  const duration = t;
  push({ id: "end", focus: userWon ? first.id : user.id, caption: null }, 3600);

  return {
    input,
    beats,
    duration,
    thirdRevealAt: thirdStart + THIRD_SUSPENSE,
    winnerRevealAt: revealStart + REVEAL_SUSPENSE,
    trophyHandoffAt: celebrateStart + 2.8,
    trophyLiftAt: celebrateStart + 3.8,
    duelCuts,
    first,
    second,
    third,
    user,
    userWon,
  };
}

/** Beat que está no ar em `time` (antes do começo, o primeiro; depois do fim, o "end"). */
export function beatAt(timeline: CeremonyTimeline, time: number): CeremonyBeat {
  for (const beat of timeline.beats) {
    if (time < beat.end) return beat;
  }
  return timeline.beats[timeline.beats.length - 1];
}

/** Quem a câmera enquadra em `time`, com os cortes do duelo. */
export function focusAt(timeline: CeremonyTimeline, time: number): string {
  const beat = beatAt(timeline, time);
  // Antes do nome, a câmera não pode entregar quem é: plano aberto no terceiro,
  // envelope no apresentador na revelação final.
  if (beat.revealAt !== undefined && time < beat.revealAt) return beat.id === "third" ? "stage" : "presenter";
  if (beat.id !== "duel") return beat.focus;
  let focus = beat.focus;
  for (const cut of timeline.duelCuts) if (time >= cut.at) focus = cut.focus;
  return focus;
}

/** Legenda da vez (troca para a do nome depois de `revealAt`). */
export function captionAt(timeline: CeremonyTimeline, time: number): CeremonyCaption | null {
  const beat = beatAt(timeline, time);
  if (beat.revealAt !== undefined && beat.revealCaption && time >= beat.revealAt) return beat.revealCaption;
  return beat.caption;
}

/** Já foi revelado em `time`? (o terceiro sai do páreo; o vencedor ganha a luz). */
export function revealedPlace(timeline: CeremonyTimeline, time: number): { third: boolean; winner: boolean } {
  return { third: time >= timeline.thirdRevealAt, winner: time >= timeline.winnerRevealAt };
}

// ---------------------------------------------------------------- elenco

const FALLBACK_RIVALS = ["Mateo Alcázar", "Noah van Dijk", "Luca Bellandi", "Amadou Keïta", "Kenji Sakamoto", "Enzo Moretti"];

type RivalInfo = { name: string; currentClubId?: string; nationality?: string };

function hashName(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clubInfo(club: { name: string; shortName: string; primary: string; secondary: string }) {
  return { name: club.name, shortName: club.shortName, primary: club.primary, secondary: club.secondary };
}

/**
 * Monta o elenco da noite. `finalists` são os três nomes da indicação (o
 * jogador entre eles); faltando algum, entra um rival fictício. Quem perdeu
 * fica em 2º ou 3º por sorteio fixo da temporada (a não ser que `userPlace` mande).
 */
export function buildBallonDorCeremony(args: {
  seed: number;
  season: number;
  player: { name: string; appearance: PlayerAppearance; number: number; clubId: string; nationality?: string };
  finalists: string[];
  won: boolean;
  winner: string;
  rivals?: RivalInfo[];
  userPlace?: CeremonyPlace;
}): CeremonyInput {
  const playerName = args.player.name || "Você";
  const rivalNames = Array.from(new Set(args.finalists.filter((name) => name && name !== playerName)));
  for (const name of FALLBACK_RIVALS) {
    if (rivalNames.length >= 2) break;
    if (name !== playerName && !rivalNames.includes(name)) rivalNames.push(name);
  }
  // Lista sem o jogador (três rivais): o vencedor da indicação não pode ficar fora do palco.
  const winnerIndex = rivalNames.indexOf(args.winner);
  if (winnerIndex >= 2) [rivalNames[1], rivalNames[winnerIndex]] = [rivalNames[winnerIndex], rivalNames[1]];
  // Lado sorteado: o vencedor (o primeiro rival da indicação) não fica sempre à esquerda.
  const [rivalA, rivalB] = seeded(args.seed, args.season * 991) < 0.5 ? rivalNames : [rivalNames[1], rivalNames[0]];
  const userPlace: CeremonyPlace = args.userPlace ?? (args.won ? 1 : seeded(args.seed, args.season * 977) < 0.62 ? 2 : 3);
  // Quem leva quando o jogador perde: o vencedor da indicação, se ele estiver entre os dois.
  const rivalWinner = rivalNames.slice(0, 2).includes(args.winner) ? args.winner : rivalA;
  const rivalPlaces = new Map<string, CeremonyPlace>();
  if (userPlace === 1) {
    rivalPlaces.set(rivalA, seeded(args.seed, args.season * 983) < 0.5 ? 2 : 3);
    rivalPlaces.set(rivalB, rivalPlaces.get(rivalA) === 2 ? 3 : 2);
  } else {
    rivalPlaces.set(rivalWinner, 1);
    rivalPlaces.set(rivalWinner === rivalA ? rivalB : rivalA, userPlace === 2 ? 3 : 2);
  }

  const eliteClubs = CLUBS.filter((club) => club.reputation >= 5);
  const rivalFinalist = (name: string, id: string): CeremonyFinalist => {
    const info = args.rivals?.find((rival) => rival.name === name);
    const hash = hashName(`${args.seed}|${name}`);
    const club = info?.currentClubId
      ? clubById(info.currentClubId)
      : eliteClubs.length ? eliteClubs[hash % eliteClubs.length] : clubById(args.player.clubId);
    const appearance = careerSquadAppearance({ seed: args.seed, memberId: name, teamId: club.id, nationality: info?.nationality ?? "" });
    return {
      id,
      name,
      isUser: false,
      place: rivalPlaces.get(name) ?? 3,
      appearance,
      number: [7, 9, 10, 11, 8, 19][hash % 6],
      club: clubInfo(club),
      nationality: info?.nationality ?? null,
    };
  };

  const userClub = clubById(args.player.clubId);
  const user: CeremonyFinalist = {
    id: "user",
    name: playerName,
    isUser: true,
    place: userPlace,
    appearance: normalizePlayerAppearance(args.player.appearance),
    number: args.player.number || 10,
    club: clubInfo(userClub),
    nationality: args.player.nationality ?? null,
  };

  const presenterLook = randomPlayerAppearance(args.seed + 7721);
  return {
    season: args.season,
    seed: args.seed,
    finalists: [rivalFinalist(rivalA, "rival-a"), user, rivalFinalist(rivalB, "rival-b")],
    presenter: {
      name: "Apresentador",
      appearance: { ...presenterLook, hairStyle: 12, beard: 0, face: 1, headwear: 0, eyewear: 0, earrings: 0, faceMark: 0 },
    },
  };
}
