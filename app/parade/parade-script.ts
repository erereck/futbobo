// Roteiro da festa do título da Copa do Mundo: a seleção campeã desfila num
// trio elétrico por uma avenida lotada. Só existe para a Copa do Mundo.
//
// Um roteiro só, em segundos, lido pelas duas versões da cena (o palco 3D
// `parade-stage.ts` e a versão 2D leve). A cidade varia com o país e a
// temporada; a hora do dia e a variação de cena também, então duas festas
// nunca saem iguais.

import { countryById } from "../game-data";
import { normalizePlayerAppearance, randomPlayerAppearance, type PlayerAppearance } from "../player-appearance";
import { seeded } from "../career/shared";

export type ParadeTimeOfDay = "day" | "sunset" | "night";

/** Como a cidade é montada (o gerador procedural usa isto). */
export type ParadeCityStyle =
  | "beach" // orla: mar de um lado, coqueiros, prédios médios, morros ao fundo
  | "metropolis" // paredão de arranha-céus, antenas, avenida larga
  | "modernist" // esplanada larga, monumentos brancos espaçados
  | "colonial" // casarios coloridos de 2-3 andares, igrejas
  | "european"; // bulevar de pedra com telhados de mansarda e árvores

/** Marcos montados com primitivas (o gerador de cidade implementa cada um). */
export type LandmarkId =
  | "christ" // Cristo Redentor no alto de um morro
  | "sugarloaf" // Pão de Açúcar (dois morros arredondados) com bondinho
  | "masp" // caixa vermelha suspensa em pilares
  | "antennas" // torres de antena listradas no topo dos prédios
  | "elevador" // Elevador Lacerda: torre alta com passarela
  | "church" // igreja colonial de duas torres
  | "congress" // duas torres gêmeas + cúpula e cuia
  | "cathedral" // coroa de pilares curvos (catedral de Brasília)
  | "obelisk" // obelisco branco no meio da avenida
  | "eiffel" // torre treliçada
  | "arch" // arco do triunfo
  | "gate" // portão de colunas com quadriga
  | "colosseum" // anfiteatro oval em arcos
  | "clock-tower" // torre do relógio
  | "windmill" // moinho de vento
  | "pyramid" // pirâmides no horizonte
  | "mountain" // montanha/vulcão nevado no horizonte
  | "bridge" // ponte estaiada ao fundo
  | "palms" // fileira de coqueiros/palmeiras
  | "sea"; // mar com areia de um lado da avenida

export type ParadeCity = {
  id: string;
  name: string;
  /** Avenida da festa (vai na legenda). */
  avenue: string;
  style: ParadeCityStyle;
  landmarks: LandmarkId[];
  /** Fachadas: cores base dos prédios (o gerador varia em volta delas). */
  facade: string[];
};

const CITIES: Record<string, ParadeCity[]> = {
  brasil: [
    { id: "rio", name: "Rio de Janeiro", avenue: "Avenida Atlântica", style: "beach", landmarks: ["christ", "sugarloaf", "palms", "sea"], facade: ["#f1ebe0", "#d9d2c4", "#c9b79c", "#e8e0d0"] },
    { id: "rio-centro", name: "Rio de Janeiro", avenue: "Avenida Presidente Vargas", style: "metropolis", landmarks: ["christ", "church", "palms"], facade: ["#d8d4cc", "#b9b6ae", "#e6e1d6", "#a9b3b8"] },
    { id: "sao-paulo", name: "São Paulo", avenue: "Avenida Paulista", style: "metropolis", landmarks: ["masp", "antennas"], facade: ["#c9c5bd", "#9ea7ad", "#d8d2c6", "#7f8a92"] },
    { id: "salvador", name: "Salvador", avenue: "Circuito Barra-Ondina", style: "colonial", landmarks: ["elevador", "church", "sea", "palms"], facade: ["#f2c14e", "#e86a5b", "#4fb3bf", "#8ac26e", "#f39ac0"] },
    { id: "brasilia", name: "Brasília", avenue: "Eixo Monumental", style: "modernist", landmarks: ["congress", "cathedral"], facade: ["#f4f4f0", "#e7e7e2", "#d9dde0"] },
    { id: "recife", name: "Recife", avenue: "Avenida Boa Viagem", style: "beach", landmarks: ["palms", "sea", "bridge"], facade: ["#efe7d6", "#d6cdb8", "#f3d9b1"] },
    { id: "belo-horizonte", name: "Belo Horizonte", avenue: "Avenida Afonso Pena", style: "metropolis", landmarks: ["church", "palms"], facade: ["#d7cfc3", "#c3b9aa", "#aab2b6"] },
    { id: "porto-alegre", name: "Porto Alegre", avenue: "Avenida Borges de Medeiros", style: "european", landmarks: ["church", "bridge"], facade: ["#d9c7a7", "#c9b48f", "#e6dccb"] },
  ],
  argentina: [
    { id: "buenos-aires", name: "Buenos Aires", avenue: "Avenida 9 de Julio", style: "metropolis", landmarks: ["obelisk", "antennas"], facade: ["#d6d0c4", "#bdb6a8", "#e3ddd2"] },
    { id: "rosario", name: "Rosário", avenue: "Bulevar Oroño", style: "european", landmarks: ["bridge", "church"], facade: ["#d9cbb1", "#c7b392", "#e8decb"] },
  ],
  uruguai: [{ id: "montevideu", name: "Montevidéu", avenue: "Avenida 18 de Julio", style: "colonial", landmarks: ["clock-tower", "sea"], facade: ["#e9dcc4", "#d3c3a3", "#c9d6d8"] }],
  portugal: [
    { id: "lisboa", name: "Lisboa", avenue: "Avenida da Liberdade", style: "colonial", landmarks: ["arch", "bridge"], facade: ["#f2d27a", "#e8a07a", "#f5efe2", "#9cc6d6"] },
    { id: "porto", name: "Porto", avenue: "Avenida dos Aliados", style: "european", landmarks: ["clock-tower", "bridge"], facade: ["#e7dccb", "#cdbda4"] },
  ],
  espanha: [
    { id: "madrid", name: "Madri", avenue: "Paseo de la Castellana", style: "european", landmarks: ["arch", "clock-tower"], facade: ["#efe3cf", "#d9c6a5", "#f3eadb"] },
    { id: "barcelona", name: "Barcelona", avenue: "La Rambla", style: "european", landmarks: ["church", "sea", "palms"], facade: ["#e9d9be", "#d4bf9b"] },
  ],
  franca: [
    { id: "paris", name: "Paris", avenue: "Champs-Élysées", style: "european", landmarks: ["eiffel", "arch"], facade: ["#efe6d2", "#e2d6bd", "#d6c8ab"] },
    { id: "marselha", name: "Marselha", avenue: "La Canebière", style: "european", landmarks: ["church", "sea"], facade: ["#efe2c8", "#e5cfa6"] },
  ],
  inglaterra: [
    { id: "londres", name: "Londres", avenue: "The Mall", style: "european", landmarks: ["clock-tower", "bridge"], facade: ["#d9cdb6", "#b9a98c", "#8a7a66"] },
    { id: "manchester", name: "Manchester", avenue: "Deansgate", style: "metropolis", landmarks: ["clock-tower"], facade: ["#9a5b46", "#b4705a", "#c9c3b8"] },
  ],
  alemanha: [
    { id: "berlim", name: "Berlim", avenue: "Unter den Linden", style: "european", landmarks: ["gate", "antennas"], facade: ["#dcd4c4", "#c4baa6", "#e8e2d6"] },
    { id: "munique", name: "Munique", avenue: "Ludwigstraße", style: "european", landmarks: ["church", "mountain"], facade: ["#efe4cf", "#e0cfae"] },
  ],
  italia: [
    { id: "roma", name: "Roma", avenue: "Via dei Fori Imperiali", style: "european", landmarks: ["colosseum", "church"], facade: ["#e7b77d", "#d9955f", "#efd2a6"] },
    { id: "milao", name: "Milão", avenue: "Corso Venezia", style: "european", landmarks: ["church", "antennas"], facade: ["#e8dcc6", "#d6c3a1"] },
  ],
  holanda: [{ id: "amsterda", name: "Amsterdã", avenue: "Damrak", style: "european", landmarks: ["windmill", "church"], facade: ["#7a4a36", "#a35d3f", "#e7dccb", "#3d4a52"] }],
  mexico: [{ id: "cidade-do-mexico", name: "Cidade do México", avenue: "Paseo de la Reforma", style: "metropolis", landmarks: ["arch", "mountain", "palms"], facade: ["#e8d6b9", "#d7b98d", "#c9cdd1"] }],
  eua: [{ id: "nova-york", name: "Nova York", avenue: "Broadway", style: "metropolis", landmarks: ["antennas", "bridge"], facade: ["#b9b4aa", "#8f8b84", "#d2cdc3"] }],
  japao: [{ id: "toquio", name: "Tóquio", avenue: "Avenida Chuo", style: "metropolis", landmarks: ["mountain", "antennas"], facade: ["#d9dde1", "#b7c0c8", "#eceff2"] }],
  egito: [{ id: "cairo", name: "Cairo", avenue: "Praça Tahrir", style: "modernist", landmarks: ["pyramid", "palms"], facade: ["#e3c99a", "#d4b47a"] }],
  marrocos: [{ id: "casablanca", name: "Casablanca", avenue: "Boulevard Mohammed V", style: "colonial", landmarks: ["clock-tower", "palms", "sea"], facade: ["#f3efe6", "#e8dcc4"] }],
};

/** Capitais de quem não tem cidade feita à mão: o gerador usa o estilo "metropolis". */
const CAPITALS: Record<string, string> = {
  chile: "Santiago", colombia: "Bogotá", paraguai: "Assunção", equador: "Quito", peru: "Lima", bolivia: "La Paz",
  venezuela: "Caracas", canada: "Toronto", "costa-rica": "San José", belgica: "Bruxelas", croacia: "Zagreb",
  dinamarca: "Copenhague", noruega: "Oslo", suecia: "Estocolmo", suica: "Zurique", austria: "Viena", polonia: "Varsóvia",
  servia: "Belgrado", turquia: "Istambul", ucrania: "Kiev", "republica-tcheca": "Praga", escocia: "Glasgow",
  "pais-de-gales": "Cardiff", irlanda: "Dublin", grecia: "Atenas", romenia: "Bucareste", hungria: "Budapeste",
  "coreia-do-sul": "Seul", china: "Pequim", australia: "Sydney", "arabia-saudita": "Riad", ira: "Teerã", catar: "Doha",
  senegal: "Dacar", nigeria: "Lagos", argelia: "Argel", gana: "Acra", "costa-do-marfim": "Abidjan",
  "africa-do-sul": "Joanesburgo", camaroes: "Yaoundé", tunisia: "Túnis", mali: "Bamako",
};

export function paradeCitiesFor(countryId: string): ParadeCity[] {
  const own = CITIES[countryId];
  if (own?.length) return own;
  const country = countryById(countryId);
  const name = CAPITALS[countryId] ?? `Capital de ${country.name}`;
  return [{ id: `${countryId}-capital`, name, avenue: "Avenida Central", style: "metropolis", landmarks: ["antennas", "church"], facade: ["#d8d2c6", "#bcb5a8", "#a8b0b5"] }];
}

// --------------------------------------------------------------- entrada

export type ParadeInput = {
  seed: number;
  season: number;
  country: { id: string; name: string; demonym: string; primary: string; secondary: string };
  city: ParadeCity;
  timeOfDay: ParadeTimeOfDay;
  /** 0..2: muda o lado do trio, o caminho da câmera e os detalhes da multidão. */
  variant: number;
  player: { name: string; appearance: PlayerAppearance; number: number };
  /** Companheiros no trio (sem o jogador), com número de camisa. */
  teammates: Array<{ appearance: PlayerAppearance; number: number }>;
  /** Quantas estrelas a seleção passa a ter (título contado com este). */
  stars: number;
};

/** Escolhe cidade, hora e variação; `overrides` serve à rota de prévia. */
export function buildParadeInput(args: {
  seed: number;
  season: number;
  countryId: string;
  player: { name: string; appearance: PlayerAppearance; number: number };
  stars?: number;
  cityId?: string;
  timeOfDay?: ParadeTimeOfDay;
  variant?: number;
}): ParadeInput {
  const country = countryById(args.countryId);
  const cities = paradeCitiesFor(country.id);
  const city = cities.find((item) => item.id === args.cityId) ?? cities[Math.floor(seeded(args.seed, args.season * 571) * cities.length) % cities.length];
  const times: ParadeTimeOfDay[] = ["day", "sunset", "night"];
  const timeOfDay = args.timeOfDay ?? times[Math.floor(seeded(args.seed, args.season * 587) * times.length) % times.length];
  const variant = args.variant ?? Math.floor(seeded(args.seed, args.season * 593) * 3) % 3;
  const used = new Set([args.player.number]);
  const teammates = Array.from({ length: 8 }, (_, index) => {
    let number = 2 + Math.floor(seeded(args.seed, args.season * 601 + index * 13) * 22);
    while (used.has(number)) number = (number % 23) + 1;
    used.add(number);
    return { appearance: randomPlayerAppearance(args.seed + args.season * 31 + index * 977), number };
  });
  return {
    seed: args.seed,
    season: args.season,
    country: { id: country.id, name: country.name, demonym: country.demonym, primary: country.primary, secondary: country.secondary },
    city,
    timeOfDay,
    variant,
    player: { ...args.player, appearance: normalizePlayerAppearance(args.player.appearance) },
    teammates,
    stars: Math.max(1, Math.floor(args.stars ?? 1) || 1),
  };
}

// ------------------------------------------------------------ cronômetro

export type ParadeBeatId = "aerial" | "avenue" | "crowd" | "deck" | "trophy" | "finale" | "end";

export type ParadeCaption = { kicker: string; title: string; sub?: string };

export type ParadeBeat = {
  id: ParadeBeatId;
  start: number;
  end: number;
  caption: ParadeCaption | null;
};

export type ParadeTimeline = {
  input: ParadeInput;
  beats: ParadeBeat[];
  /** Começo do beat "end" (cartão final). */
  duration: number;
  /** O jogador ergue a taça no alto do trio. */
  trophyLiftAt: number;
  /** Explosão de papel picado e sinalizadores (e fogos, se for de tarde/noite). */
  burstAt: number;
};

const ORDINAL_TITLES = ["", "o primeiro título", "o bi", "o tri", "o tetra", "o penta", "o hexa", "o hepta", "o octa"];

/** Plural do gentílico: francês → franceses, alemão → alemães, letão → letões, espanhol → espanhóis, kosovar → kosovares. */
function demonymPlural(demonym: string) {
  if (demonym.endsWith("alemão")) return `${demonym.slice(0, -2)}ães`;
  if (demonym.endsWith("ão")) return `${demonym.slice(0, -2)}ões`;
  if (demonym.endsWith("ês")) return `${demonym.slice(0, -2)}eses`;
  if (demonym.endsWith("ol")) return `${demonym.slice(0, -2)}óis`;
  if (demonym.endsWith("r")) return `${demonym}es`;
  return `${demonym}s`;
}

export function buildParadeTimeline(input: ParadeInput): ParadeTimeline {
  const beats: ParadeBeat[] = [];
  let t = 0;
  const push = (id: ParadeBeatId, length: number, caption: ParadeCaption | null) => {
    beats.push({ id, start: t, end: t + length, caption });
    t += length;
  };
  const title = ORDINAL_TITLES[input.stars] ?? `o ${input.stars}º título`;
  push("aerial", 5, { kicker: "CAMPEÕES DO MUNDO", title: input.city.name, sub: `${input.city.avenue} · ${input.season}` });
  push("avenue", 5, { kicker: "O TRIO ELÉTRICO CHEGOU", title: `Seleção ${input.country.name}`, sub: "A cidade inteira parou" });
  push("crowd", 4.2, { kicker: "A FESTA É DO POVO", title: `Obrigado, ${input.player.name}!`, sub: `Milhares de ${demonymPlural(input.country.demonym)} na rua` });
  push("deck", 5, { kicker: "NO ALTO DO TRIO", title: input.player.name, sub: `Camisa ${input.player.number} · campeão do mundo` });
  const trophyStart = t;
  push("trophy", 5, { kicker: input.stars > 1 ? `É ${title.toUpperCase()}!` : "É CAMPEÃO DO MUNDO!", title: "A taça é nossa", sub: `${input.stars} ${input.stars === 1 ? "estrela" : "estrelas"} no peito` });
  push("finale", 4.5, { kicker: "COPA DO MUNDO " + input.season, title: `${input.country.name} no topo do mundo`, sub: "Uma noite para nunca esquecer" });
  const duration = t;
  push("end", 3600, null);
  return { input, beats, duration, trophyLiftAt: trophyStart + 0.6, burstAt: trophyStart + 1.4 };
}

export function paradeBeatAt(timeline: ParadeTimeline, time: number): ParadeBeat {
  for (const beat of timeline.beats) if (time < beat.end) return beat;
  return timeline.beats[timeline.beats.length - 1];
}
