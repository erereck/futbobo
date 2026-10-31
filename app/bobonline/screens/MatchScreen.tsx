"use client";

// Partida online (§1.7): a BotaoMatch ocupa a página, como nas outras rotas.
//
// O driver online chega por import() (só o /bobonline baixa esse código; o lobby já
// adiantou o download) e fica guardado no estado como fábrica. Só então a partida
// monta, com key = matchId: uma sincronização nunca remonta a BotaoMatch.
// Os banners de rede, o "Desistir" com confirmação, a vez de cada um e o selo
// ASSISTINDO são da BotaoMatch (B4); aqui fica o aviso de sair do app (primeira vez).

import { useEffect, useState } from "react";
import BotaoMatch from "../../botao/BotaoMatch";
import type { OnlineDriverFactory } from "../../botao/online-driver";
import type { BotaoMatchResult } from "../../botao/types";
import type { DuelHandle } from "../room/room-api";
import type { BobView } from "../view-pref";
import "../../botao/botao.css";

export default function MatchScreen({
  duel,
  view,
  leaveHint,
  onFinish,
  onForfeit,
  onLeave,
  onHintSeen,
}: {
  duel: DuelHandle;
  view: BobView;
  /** Primeira partida online deste aparelho: mostra o aviso de sair do app. */
  leaveHint: boolean;
  /** Resultado completo do lado "user" (só alimenta a tela de resultado; quem reporta é o controlador). */
  onFinish: (result: BotaoMatchResult) => void;
  onForfeit: () => void;
  onLeave: () => void;
  onHintSeen: () => void;
}) {
  const [factory, setFactory] = useState<OnlineDriverFactory | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { launch } = duel;
  const watching = duel.role === "spectator";

  useEffect(() => {
    let alive = true;
    import("../../botao/online-driver")
      .then((driver) => {
        if (alive) setFactory(() => driver.createOnlineDriver);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (!factory) {
    return (
      <main className="bob-match-loading" aria-busy={!failed || undefined}>
        {failed ? (
          <div className="bob-error-card" role="alert">
            <p>Não deu para carregar a partida. Confira a internet.</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <p><span className="bob-spinner" aria-hidden="true" />Preparando a partida…</p>
        )}
      </main>
    );
  }

  return (
    <>
      <BotaoMatch
        key={launch.key}
        setup={launch.setup}
        controls={launch.controls}
        perspective={launch.perspective}
        link={launch.link}
        createDriver={factory}
        names={launch.names}
        restore={launch.restore}
        cpuBrain={launch.cpuBrain}
        view={view}
        onForfeit={watching ? undefined : onForfeit}
        onLeave={watching ? onLeave : undefined}
        onFinish={onFinish}
      />
      {!watching && leaveHint && (
        <aside className="bob-leave-hint" role="note" data-testid="bob-leave-hint">
          <p>Sair do app pausa a partida. Fora por 1:30 no total = W.O.</p>
          <button type="button" className="primary-button" onClick={onHintSeen}>Entendi</button>
        </aside>
      )}
    </>
  );
}
