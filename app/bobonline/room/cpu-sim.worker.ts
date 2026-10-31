// Worker da simulação CPU × CPU (§4.6): roda simulateBotaoMatch fora da thread da página
// (≈0,3 s no desktop, 1-2 s num celular). Uma mensagem por partida: { id, setup } → { id, result } | { id, error }.

import { simulateBotaoMatch } from "../../botao/simulate";
import type { BotaoMatchSetup } from "../../botao/types";

type Scope = {
  onmessage: ((event: MessageEvent<{ id: number; setup: BotaoMatchSetup }>) => void) | null;
  postMessage(message: unknown): void;
};

const scope = self as unknown as Scope;

scope.onmessage = (event) => {
  const { id, setup } = event.data;
  try {
    scope.postMessage({ id, result: simulateBotaoMatch(setup) });
  } catch (error) {
    scope.postMessage({ id, error: String(error) });
  }
};
