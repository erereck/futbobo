// Histórico do navegador para as telas do Bobonline (§1, "History and the Android back button").
//
// Não existe @capacitor/app no projeto: no APK o botão voltar do Android é o
// history.back() do WebView. Então toda troca de tela vira uma entrada
// `{ bob: tela, bobN: profundidade }` e o `popstate` traduz o voltar do aparelho
// no voltar da tela atual (a página decide: confirmar "Sair da sala?", voltar
// uma tela, ou sair do Bobonline).
//
// O estado interno do Next (`__NA` e a árvore) vai junto em toda entrada: sem `__NA` o
// popstate do app router recarrega a página. O Next só passa a copiar isso sozinho depois
// do efeito dele (que roda DEPOIS dos efeitos desta página na montagem), então a cópia é daqui.

/** As telas do Bobonline (§1). */
export type Screen =
  | "home" | "teams" | "editor" | "create" | "join" | "lobby" | "bracket"
  | "match" | "result" | "champion" | "spectate" | "other-tab";

/** Telas de dentro da sala: o voltar do aparelho pede confirmação em vez de sair. */
export const ROOM_SCREENS: ReadonlySet<Screen> = new Set<Screen>(["lobby", "bracket", "match", "result", "champion", "spectate"]);

export type BackEvent = {
  /** Tela gravada na entrada para a qual o navegador acabou de voltar. */
  screen: string;
  /** Profundidade dessa entrada (0 = a primeira da sequência de entradas do Bobonline). */
  depth: number;
};

let depth = 0;

function canUseHistory(): boolean {
  return typeof window !== "undefined" && typeof window.history?.pushState === "function";
}

/** O estado atual da entrada (o do Next) com a tela do Bobonline por cima. */
function entry(screen: string, bobN: number): Record<string, unknown> {
  const current = window.history.state;
  return { ...(current && typeof current === "object" ? current : {}), bob: screen, bobN };
}

function stateOf(value: unknown): { bob: string; bobN: number } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { bob?: unknown; bobN?: unknown };
  if (typeof record.bob !== "string" || typeof record.bobN !== "number") return null;
  return { bob: record.bob, bobN: record.bobN };
}

/**
 * Marca a entrada atual como a base desta montagem. Entrada nova: profundidade 0. Entrada que
 * já era do Bobonline (recarregou, ou voltou do menu para cá): fica a profundidade dela, porque
 * as entradas de trás continuam lá; zerar fazia o primeiro voltar parecer "avançar" e sumir.
 */
export function markBaseEntry(screen: string): void {
  if (!canUseHistory()) return;
  depth = stateOf(window.history.state)?.bobN ?? 0;
  try {
    window.history.replaceState(entry(screen, depth), "");
  } catch {
    // Sem histórico (iframe sandboxado): o voltar só não fica esperto.
  }
}

/**
 * Troca o endereço sem navegar e sem mexer no estado da entrada (tirar ?sala= e
 * ?voltar= depois de lidos). Chamar depois da montagem: aí o replaceState já é o do
 * Next, que atualiza o endereço que o roteador guarda.
 */
export function replaceUrl(url: string): void {
  if (!canUseHistory()) return;
  try {
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Idem.
  }
}

/** Nova entrada para a tela que acabou de abrir. */
export function pushScreen(screen: string): void {
  if (!canUseHistory()) return;
  try {
    window.history.pushState(entry(screen, depth + 1), "");
    depth += 1;
  } catch {
    // Idem.
  }
}

/** Troca a tela gravada na entrada atual (sem criar entrada nova). */
export function replaceScreen(screen: string): void {
  if (!canUseHistory()) return;
  try {
    window.history.replaceState(entry(screen, depth), "");
  } catch {
    // Idem.
  }
}

/** Sai do Bobonline: volta para a entrada anterior à de profundidade 0 (o menu do Futbobo, se veio de lá). */
export function leaveBobonlineHistory(fromDepth: number): void {
  if (!canUseHistory()) return;
  window.history.go(-(fromDepth + 1));
}

/** Profundidade atual (para testes e para o gancho de desenvolvimento). */
export function historyDepth(): number {
  return depth;
}

let screenBack: (() => boolean) | null = null;

/**
 * A tela aberta (Meus times, editor) cuida do próprio voltar: fechar uma folha ou a confirmação
 * aberta, perguntar antes de largar uma mudança inválida. O `handler` devolve true quando usou o
 * voltar e a tela fica; false deixa a página trocar de tela. Devolve o "desregistrar".
 */
export function claimBack(handler: () => boolean): () => void {
  screenBack = handler;
  return () => {
    if (screenBack === handler) screenBack = null;
  };
}

/** Passa o voltar para a tela aberta; true = ela usou (a página só devolve a entrada). */
export function runScreenBack(): boolean {
  try {
    return screenBack?.() === true;
  } catch {
    return false;
  }
}

/**
 * Escuta o voltar do aparelho/navegador. Só chama `onBack` para entradas do Bobonline
 * que ficam ATRÁS da atual; o avançar só atualiza a profundidade. Entradas de outras
 * páginas (o menu do Futbobo) são do Next: ele navega e esta página desmonta.
 */
export function listenBack(onBack: (event: BackEvent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: PopStateEvent) => {
    const entry = stateOf(event.state);
    if (!entry) return;
    const wentBack = entry.bobN < depth;
    depth = entry.bobN;
    if (wentBack) onBack({ screen: entry.bob, depth: entry.bobN });
  };
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}
