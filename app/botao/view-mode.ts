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
