// Preferência visual da mesa: botões clássicos (canvas 2D) ou bonecos em 3D.
//
// Só muda o desenho. Física, CPU, regras e resultado são exatamente os mesmos
// nos dois modos — o 3D lê o mesmo `BotaoMatchState` que o 2D pinta.
//
// A chave é a mesma das configurações do Futbobo (`career/state.ts`), lida
// direto aqui para o módulo continuar sem importar o resto do jogo.

const SETTINGS_KEY = "futbobo:settings:v1";
/**
 * Dentro do app as configurações migram para o IndexedDB (`career/indexed-storage`)
 * e só ficam legíveis com a ponte instalada. Copa, X1 e o laboratório /botao
 * rodam fora dela, então o Modo 3D também fica num espelho pequeno e físico.
 */
const MIRROR_KEY = "futbobo:botao3d";

export function readBotao3dPreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const settings = JSON.parse(raw) as { botao3d?: unknown };
      if (typeof settings.botao3d === "boolean") return settings.botao3d;
    }
    return window.localStorage.getItem(MIRROR_KEY) === "1";
  } catch {
    return false;
  }
}

/** Chamado por quem grava as configurações, para as rotas fora do app enxergarem a escolha. */
export function rememberBotao3dPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIRROR_KEY, enabled ? "1" : "0");
  } catch {
    // Sem storage o 2D continua sendo o padrão.
  }
}

// ------------------------------------------------------- modo desempenho 3D

/** "1" ligado, "0" desligado, "off" desligado na mão (a detecção não religa). */
const PERFORMANCE_MIRROR_KEY = "futbobo:botao3d-performance";
/** Avisa quem segura as configurações em memória (carreira, tela de ajustes) que a partida mudou o valor. */
export const BOTAO3D_PERFORMANCE_EVENT = "futbobo:botao3d-performance";

export type Botao3dPerformancePreference = { enabled: boolean; userOff: boolean };

function readPerformanceMirror(): Botao3dPerformancePreference {
  try {
    const value = window.localStorage.getItem(PERFORMANCE_MIRROR_KEY);
    return { enabled: value === "1", userOff: value === "off" };
  } catch {
    return { enabled: false, userOff: false };
  }
}

/**
 * Junta as configurações com o espelho. Fora do app (Copa, X1, /botao) a partida
 * só consegue gravar o espelho; ligar sozinho é só de ida, então o espelho
 * ligado vale, a não ser que o jogador tenha desligado na mão.
 */
export function resolveBotao3dPerformance(stored: { botao3dPerformance?: unknown; botao3dPerformanceUserOff?: unknown }): Botao3dPerformancePreference {
  const mirror = typeof window === "undefined" ? { enabled: false, userOff: false } : readPerformanceMirror();
  if (typeof stored.botao3dPerformance !== "boolean") return mirror;
  const userOff = stored.botao3dPerformanceUserOff === true;
  return { enabled: stored.botao3dPerformance || (!userOff && mirror.enabled), userOff };
}

export function readBotao3dPerformance(): Botao3dPerformancePreference {
  if (typeof window === "undefined") return { enabled: false, userOff: false };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) return resolveBotao3dPerformance(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    // Configurações ilegíveis: vale o espelho.
  }
  return readPerformanceMirror();
}

/** Chamado por quem grava as configurações, junto com `rememberBotao3dPreference`. */
export function rememberBotao3dPerformance(preference: Botao3dPerformancePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PERFORMANCE_MIRROR_KEY, preference.enabled ? "1" : preference.userOff ? "off" : "0");
  } catch {
    // Sem storage o modo desempenho só vale nesta partida.
  }
}

/**
 * A partida percebeu que o aparelho não aguenta: liga o modo desempenho e
 * guarda a escolha. Nunca religa o que o jogador desligou na mão.
 * Devolve se ligou agora.
 */
export function enableBotao3dPerformanceAuto(): boolean {
  if (typeof window === "undefined") return false;
  const current = readBotao3dPerformance();
  if (current.enabled || current.userOff) return false;
  try {
    // Só mexe nas configurações que já existem (dentro do app via ponte, ou o
    // storage antigo); fora do app um JSON parcial aqui apagaria o resto na migração.
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const settings = JSON.parse(raw) as Record<string, unknown>;
      settings.botao3dPerformance = true;
      settings.botao3dPerformanceUserOff = false;
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch {
    // Mesmo sem gravar, o espelho e o aviso abaixo seguram a escolha.
  }
  rememberBotao3dPerformance({ enabled: true, userOff: false });
  window.dispatchEvent(new CustomEvent(BOTAO3D_PERFORMANCE_EVENT, { detail: { enabled: true } }));
  return true;
}

/** WebGL indisponível (aparelho antigo, aceleração desligada) mantém o 2D. */
export function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
