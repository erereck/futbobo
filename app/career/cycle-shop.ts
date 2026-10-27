import { COUNTRIES, countryById } from "../game-data";
import type { GameState, Phase } from "./model";
import { shiftPlayerAttributes } from "./state";
import { clamp, seeded } from "./shared";
import { generateTransferOffers } from "./transfer-market";

export type CycleShopItemId = "recovery" | "media" | "coach" | "overall" | "potential" | "corruption" | "agent-country" | "special-training" | "release" | "contract-shorter" | "contract-longer";

export type CycleShopItem = {
  id: CycleShopItemId;
  name: string;
  eyebrow: string;
  description: string;
  price: number;
  tone: "standard" | "highlight" | "risk" | "locked";
  available: boolean;
};

export const CYCLE_SHOP_ITEMS: CycleShopItem[] = [
  { id: "recovery", name: "Centro de recuperação", eyebrow: "CORPO", description: "+12 físico e +7 moral.", price: 900_000, tone: "standard", available: true },
  { id: "media", name: "Equipe de imagem", eyebrow: "CARREIRA", description: "Melhora imprensa, equilíbrio e alcance.", price: 1_400_000, tone: "standard", available: true },
  { id: "coach", name: "Comissão particular", eyebrow: "TÉCNICA", description: "+1 em todos os atributos. Não altera o OVR.", price: 3_000_000, tone: "standard", available: true },
  { id: "overall", name: "Salto de nível", eyebrow: "RARIDADE", description: "+1 OVR imediato. Compra única no ciclo.", price: 7_500_000, tone: "highlight", available: true },
  { id: "potential", name: "Recalibração confidencial", eyebrow: "RISCO OCULTO", description: "Pode elevar ou reduzir seu teto em 2 pontos.", price: 2_500_000, tone: "risk", available: true },
  { id: "corruption", name: "Comprar os árbitros", eyebrow: "50 / 50", description: "Garante o título nacional ou causa banimento de 5 anos.", price: 2_000_000, tone: "risk", available: true },
  { id: "agent-country", name: "Rota do empresário", eyebrow: "MERCADO", description: "Escolha um país. No fim do contrato, 75% das propostas virão de clubes aleatórios de lá.", price: 5_000_000, tone: "highlight", available: true },
  { id: "release", name: "Rescindir contrato", eyebrow: "LIBERDADE", description: "Encerre o vínculo com seu clube e entre no mercado como agente livre.", price: 3_000_000, tone: "highlight", available: true },
  { id: "contract-shorter", name: "Próximo contrato mais curto", eyebrow: "CONTRATO", description: "Reduz em 1 ano o próximo contrato assinado, com mínimo de 1 ano. Não altera o atual.", price: 1_000_000, tone: "standard", available: true },
  { id: "contract-longer", name: "Próximo contrato mais longo", eyebrow: "CONTRATO", description: "Acrescenta 1 ano ao próximo contrato assinado. Não altera o atual.", price: 1_000_000, tone: "standard", available: true },
  { id: "special-training", name: "Treino especial", eyebrow: "EM BREVE", description: "Uma nova forma de transformar seu jogador.", price: 0, tone: "locked", available: false },
];

export type CycleShopPurchase = {
  state: GameState;
  feedback: string;
  toast: string;
  forcedClose: boolean;
};

export function isCycleShopDue(state: GameState) {
  return state.phase === "career"
    && state.history.length > 0
    && state.history.length % 4 === 0
    && state.lastCycleShopSeason !== state.season;
}

export function cycleShopPurchaseKey(state: GameState, itemId: CycleShopItemId) {
  return `quadra:${state.season}:${itemId}`;
}

export function purchaseCycleShopItem(state: GameState, itemId: CycleShopItemId, countryId?: string): CycleShopPurchase {
  const item = CYCLE_SHOP_ITEMS.find((candidate) => candidate.id === itemId);
  const purchaseKey = cycleShopPurchaseKey(state, itemId);
  const validCountryFocus = itemId !== "agent-country" || Boolean(countryId && COUNTRIES.some((country) => country.id === countryId));
  const contractAdjustment = itemId === "contract-shorter" || itemId === "contract-longer";
  const releaseUnavailable = itemId === "release" && (state.isFreeAgent || state.contractYears <= 0);
  if (!item || !item.available || !validCountryFocus || releaseUnavailable || (contractAdjustment && state.nextContractYearsAdjustment !== 0) || (itemId === "overall" && state.overall >= 99) || state.spendableMoney < item.price || state.economyPurchases.includes(purchaseKey)) {
    return { state, feedback: "Esta compra não está disponível.", toast: "Compra indisponível", forcedClose: false };
  }

  let next: GameState = {
    ...state,
    money: Math.max(0, state.money - item.price),
    spendableMoney: Math.max(0, state.spendableMoney - item.price),
    economyPurchases: [...state.economyPurchases, purchaseKey],
  };
  let feedback = "";
  let toast = `${item.name} adquirido`;
  let forcedClose = false;

  if (itemId === "recovery") {
    next = { ...next, fitness: clamp(state.fitness + 12), morale: clamp(state.morale + 7) };
    feedback = "A nova estrutura devolveu energia e tranquilidade para o próximo ciclo.";
  } else if (itemId === "media") {
    next = {
      ...next,
      mediaRelation: clamp(state.mediaRelation + 10),
      lifeBalance: clamp(state.lifeBalance + 5),
      followers: state.followers + Math.max(25_000, Math.round(state.followers * 0.04)),
    };
    feedback = "Sua equipe reorganizou imagem, agenda e relação com a imprensa.";
  } else if (itemId === "coach") {
    next = { ...next, attributes: shiftPlayerAttributes(state.attributes, 1, state.position, state.seed + state.season * 613) };
    feedback = "O trabalho particular deixou todos os atributos um pouco mais sólidos.";
  } else if (itemId === "overall") {
    const overall = state.overall + 1;
    next = {
      ...next,
      overall,
      potential: Math.max(state.potential, overall),
      attributes: shiftPlayerAttributes(state.attributes, overall - state.overall, state.position, state.seed + state.season * 719),
    };
    feedback = "O investimento virou evolução imediata: +1 OVR.";
  } else if (itemId === "potential") {
    next = { ...next, potential: clamp(state.potential < 80 ? state.potential + 2 : state.potential - 2, state.overall, 99) };
    feedback = "A recalibração terminou. O relatório segue oculto; a carreira revelará se o teto subiu ou caiu.";
  } else if (itemId === "agent-country") {
    const country = countryById(countryId!);
    next = { ...next, agentCountryFocus: country.id };
    feedback = `Seu empresário recebeu uma ordem clara: quando este contrato terminar, ${country.name} será a prioridade. 75% das propostas serão sorteadas entre clubes de lá.`;
    toast = `Empresário focado em ${country.name}`;
  } else if (contractAdjustment) {
    next = { ...next, nextContractYearsAdjustment: itemId === "contract-shorter" ? -1 : 1 };
    feedback = `A alteração será aplicada ao próximo contrato assinado, inclusive uma renovação. O vínculo atual permanece igual.`;
  } else if (itemId === "release") {
    const prepared: GameState = { ...next, phase: "transfer", isFreeAgent: true, freeAgentSinceSeason: state.season, contractYears: 0, annualSalary: 0, activeLoan: null, loanParentClubId: "", loanParentLeagueId: "", loanEndSeason: 0, pendingTransferMode: "permanent", youthLoanDecision: false, forcedClubExit: false, transferRequested: true };
    const offers = generateTransferOffers(prepared, state.season * 509, { includeForeign: true, mode: "free-agent", trigger: "contract-expired", count: 10 });
    next = { ...prepared, transferOffers: offers.map((offer) => offer.clubId), transferMarketOffers: offers, transferStatus: { success: true, chance: 100, headline: "Contrato rescindido", text: `Você está livre para escolher entre ${offers.length} projetos.` }, newsFeed: [`${state.season}: ${state.name} rescindiu seu contrato e entrou no mercado como agente livre.`, ...state.newsFeed].slice(0, 16) };
    feedback = "Contrato rescindido. Seu empresário abriu o mercado de agentes livres.";
    toast = "Contrato rescindido";
    forcedClose = true;
  } else if (itemId === "corruption") {
    const succeeded = seeded(state.seed, state.season * 1877 + state.economyPurchases.length * 31) < 0.5;
    if (succeeded) {
      next = {
        ...next,
        corruptionGuaranteedSeason: state.season,
        discipline: clamp(state.discipline - 18),
        mediaRelation: clamp(state.mediaRelation - 8),
      };
      feedback = "O acordo ficou escondido. O título nacional está garantido — e a escolha fica na sua história.";
      toast = "O esquema ficou escondido";
    } else {
      const returnSeason = state.season + 5;
      next = {
        ...next,
        phase: "transfer" as Phase,
        isFreeAgent: true,
        freeAgentSinceSeason: state.season,
        forcedFreeAgentUntilSeason: returnSeason,
        transferOffers: [],
        transferMarketOffers: [],
        contractYears: 0,
        annualSalary: 0,
        activeSponsor: null,
        managerTrust: 0,
        fanSupport: clamp(state.fanSupport - 30),
        reputation: clamp(state.reputation - 35),
        discipline: clamp(state.discipline - 45),
        transferRequested: true,
        transferStatus: {
          success: false,
          chance: 50,
          headline: "O esquema foi descoberto",
          text: `Você foi banido por 5 anos. Nenhum clube poderá contratar você antes de ${returnSeason}.`,
        },
        newsFeed: [`${state.season}: tentativa de corrupção descoberta; ${state.name} foi banido do futebol por 5 anos.`, ...state.newsFeed].slice(0, 16),
      };
      feedback = "O pagamento deixou rastros. A punição tirou cinco temporadas da sua carreira.";
      toast = "Esquema descoberto — banimento de 5 anos";
      forcedClose = true;
    }
  }

  return { state: next, feedback, toast, forcedClose };
}
