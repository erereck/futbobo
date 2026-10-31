"use client";

// UI só da partida online (Bobonline), num pedaço próprio: o driver online a baixa
// por import() (já no lobby, junto com ele) e a entrega à BotaoMatch (`driver.ui`);
// as rotas offline nunca carregam este código. Tudo é lido do driver online:
// estado, perspectiva, controles, apelidos e rede. A marcação é a mesma que
// morava na BotaoMatch.

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";
import { PlayerAppearancePortrait } from "../PlayerAppearanceEditor";
import { unlockAudio } from "./audio";
import { formationById } from "./formations";
import type { OnlineMatchDriver } from "./online-driver";
import { bodyAppearance } from "./render";
import type { BotaoSide } from "./types";

/**
 * O que a BotaoMatch passa a toda parte da UI online (cada uma usa o que precisa): o driver,
 * o redesenho e as saídas da partida (Desistir só para quem joga, Sair só para o espectador).
 */
export type OnlinePartProps = { d: OnlineMatchDriver; onChange: () => void; onForfeit?: () => void; onLeave?: () => void };
type Props = OnlinePartProps;

/** O aviso curto do controlador ("Você ficou fora 0:42…") some sozinho depois disto. */
const ONLINE_NOTICE_MS = 4000;

/**
 * "Desistir" aberto: o botão mora no rodapé e o diálogo no fim da BotaoMatch, então
 * o estado fica aqui, preso ao driver da partida que está na tela.
 */
let forfeitOpenFor: OnlineMatchDriver | null = null;
const forfeitListeners = new Set<() => void>();
function setForfeitOpen(d: OnlineMatchDriver | null) {
  forfeitOpenFor = d;
  for (const listener of forfeitListeners) listener();
}
function subscribeForfeit(listener: () => void) {
  forfeitListeners.add(listener);
  return () => void forfeitListeners.delete(listener);
}

/** O outro lado de quem está na tela (o espectador conta como "user"). */
function opponentOf(d: OnlineMatchDriver): BotaoSide {
  return d.perspective === "cpu" ? "user" : "cpu";
}

/** Linha de chips da mesa: a formação de quem está na tela (ou ASSISTINDO) e os últimos segundos do adversário. */
export function FormationRow({ d }: Props) {
  const { state, perspective: persp, names } = d;
  const opponentIdle = d.link.status().opponentIdleS;
  return (
    <div className="botao-formation-row">
      {persp === "neutral" ? (
        <span className="botao-chip botao-chip-spectator">
          ASSISTINDO · {names.user} × {names.cpu}
        </span>
      ) : (
        <span className="botao-chip">
          {formationById(state.formationId[persp]).name} · {formationById(state.formationId[persp]).shape}
        </span>
      )}
      {persp !== "neutral" && opponentIdle !== null ? (
        <span className="botao-chip botao-chip-opponent-idle" role="status">
          {names[opponentOf(d)]}: {Math.max(1, Math.ceil(opponentIdle))}…
        </span>
      ) : null}
    </div>
  );
}

/** Faixa da rede (instável, esperando, reconectando, contagem) e o aviso curto do controlador. */
export function NetStatus({ d }: Props) {
  const { banner, notice } = d.link.status();
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const noticeId = notice?.id ?? null;
  useEffect(() => {
    const current = d.link.status().notice;
    if (!current) return;
    queueMicrotask(() => setNoticeText(current.text));
    const timer = window.setTimeout(() => setNoticeText(null), ONLINE_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [d, noticeId]);
  return (
    <>
      {banner ? (
        <div className={`botao-online-banner botao-online-banner-${banner.kind}`} role="status">
          {banner.text}
        </div>
      ) : null}
      {noticeText ? (
        <div className="botao-online-notice" role="status">{noticeText}</div>
      ) : null}
    </>
  );
}

/** Limite da cobrança online: os últimos segundos antes de ela contar como perdida. */
export function KickLimit({ d }: Props) {
  const kickLeft = d.kickCountdown();
  return kickLeft !== null ? (
    <div
      className="botao-inactivity-countdown botao-kick-limit"
      role="alert"
      aria-live="assertive"
    >
      <div>
        <small>BATA LOGO</small>
        <span>Sem cobrança em {kickLeft}s, conta como perdida</span>
      </div>
      <strong>{kickLeft}</strong>
    </div>
  ) : null;
}

/** Intervalo online: automático (5 s, iguais nos dois aparelhos), sem botão "Continuar". */
export function IntervalText({ d }: Props) {
  const { state } = d;
  const pres = d.presentation();
  return (
    <p>
      {state.period + 1 > state.setup.rules.halves ? "Prorrogação" : `${state.period + 1}º tempo`} começa em{" "}
      {Math.max(1, Math.ceil((pres.kind === "interval" ? pres.remainingMs : 0) / 1000))}s
    </p>
  );
}

/** Ordem dos batedores: subir nomes e confirmar; sem escolha no prazo vale a ordem do time. */
export function OrderPicker({ d, onChange }: Props) {
  const [orderDraft, setOrderDraft] = useState<string[] | null>(null);
  const { state, names } = d;
  const { setup, penalties } = state;
  if (!penalties) return null;
  const pickSide = (["user", "cpu"] as const).find((side) => d.controls[side] === "local") ?? null;
  if (!pickSide) {
    return (
      <div className="botao-overlay">
        <strong>Disputa de pênaltis</strong>
        <p>Os times escolhem a ordem dos batedores…</p>
      </div>
    );
  }
  const teamOrder = penalties.order[pickSide];
  const order = orderDraft && orderDraft.length === teamOrder.length ? orderDraft : teamOrder;
  const confirmed = d.orderConfirmed(pickSide);
  const rounds = setup.rules.penaltyRounds;
  const team = pickSide === "user" ? setup.userTeam : setup.cpuTeam;
  const choose = (chosen: string[]) => {
    unlockAudio();
    d.chooseOrder(pickSide, chosen);
    onChange();
  };
  return (
    <div className="botao-overlay botao-order-overlay">
      <div className="botao-order-sheet" role="dialog" aria-label="Ordem dos batedores">
        <strong>Ordem dos batedores</strong>
        {confirmed ? (
          <p className="botao-order-wait">Esperando {names[pickSide === "user" ? "cpu" : "user"]}…</p>
        ) : (
          <p className="botao-order-timer">
            Escolha em {d.orderCountdown() ?? 0}s · sem escolha vale a ordem do time
          </p>
        )}
        <ol className="botao-order-list">
          {order.map((id, index) => {
            const body = state.bodies.find((candidate) => candidate.id === id);
            if (!body) return null;
            const appearance = bodyAppearance(setup, body);
            return (
              <Fragment key={id}>
                {index === rounds && rounds < 5 ? (
                  <li className="botao-order-divider" aria-hidden="true">batem nas {rounds} cobranças</li>
                ) : null}
                <li className="botao-order-row">
                  <span className="botao-order-portrait">
                    {appearance ? (
                      <PlayerAppearancePortrait
                        appearance={appearance}
                        primary={team.primary}
                        secondary={team.secondary}
                        size={36}
                        frame="compact"
                        label={body.label}
                      />
                    ) : (
                      <b>{body.number}</b>
                    )}
                  </span>
                  <b className="botao-order-number">{body.number}</b>
                  <span className="botao-order-name">{body.label}</span>
                  <button
                    type="button"
                    className="botao-ghost botao-order-up"
                    disabled={confirmed || index === 0}
                    aria-label={`Subir ${body.label}`}
                    onClick={() => {
                      const next = order.slice();
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      setOrderDraft(next);
                    }}
                  >
                    ▲ Subir
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ol>
        {!confirmed ? (
          <div className="botao-order-actions">
            <button type="button" className="botao-ghost botao-order-default" onClick={() => choose(teamOrder.slice())}>
              Usar ordem do time ✓
            </button>
            <button type="button" className="botao-primary" onClick={() => choose(order.slice())}>
              Confirmar ordem ✓
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Texto da vez no rodapé, pela perspectiva de quem está na tela. */
export function TurnText({ d }: Props) {
  const { state, names, perspective: persp } = d;
  const penalties = state.penalties;
  const localTurnSide = d.localTurn();
  const remoteTurnSide = d.remoteTurn();
  const remoteAiming = Boolean(remoteTurnSide && d.link.remoteAim());
  return (
    <p className={`botao-turn ${localTurnSide ? "botao-turn-active" : ""} ${state.finalShotGrace && localTurnSide ? "botao-turn-final-shot" : ""}`}>
      {state.phase === "penalty-setup"
        ? persp === "neutral" ? "Os times escolhem a ordem dos batedores" : "Escolha a ordem dos batedores"
        : penalties && state.phase === "penalties"
          ? localTurnSide
            ? "Sua cobrança: arraste e solte"
            : remoteAiming
              ? `${names[penalties.turn]} está mirando…`
              : `${penalties.round}ª cobrança · ${names[penalties.turn]} vai bater`
          : state.phase === "aim" || state.phase === "kickoff"
            ? localTurnSide
              ? state.finalShotGrace
                ? "00:00 · ÚLTIMO LANCE — solte e deixe a bola decidir"
                : "Sua vez: arraste e solte um botão"
              : remoteAiming
                ? `${names[state.turn]} está mirando…`
                : d.controls[state.turn] === "local"
                  ? "Sua vez: arraste e solte um botão"
                  : `Vez de ${names[state.turn]}…`
            : state.phase === "resolving"
              ? "Bola rolando…"
              : state.phase === "goal"
                ? "Gol! Recolocando os botões…"
                : state.phase === "interval"
                  ? "Intervalo"
                  : "Fim de jogo"}
    </p>
  );
}

/** Botões do rodapé: "Desistir" (quem joga) e "Sair da transmissão" (espectador). */
export function FooterButtons({ d, onForfeit, onLeave }: Props) {
  return (
    <>
      {onForfeit && d.state.phase !== "finished" ? (
        <button
          type="button"
          className="botao-ghost botao-forfeit-toggle"
          onClick={() => setForfeitOpen(d)}
        >
          Desistir
        </button>
      ) : null}
      {onLeave ? (
        <button type="button" className="botao-ghost botao-leave" onClick={onLeave}>
          Sair da transmissão
        </button>
      ) : null}
    </>
  );
}

/** Confirmação do "Desistir" (aberto pelo botão do rodapé): o adversário vence por W.O. */
export function ForfeitDialog({ d, onForfeit }: Props) {
  const open = useSyncExternalStore(subscribeForfeit, () => forfeitOpenFor === d, () => false);
  if (!open || !onForfeit) return null;
  const onClose = () => setForfeitOpen(null);
  return (
    <div className="botao-forfeit" role="dialog" aria-modal="true" aria-label="Desistir da partida">
      <div className="botao-forfeit-card">
        <strong>Desistir da partida?</strong>
        <p>{d.names[opponentOf(d)]} vence por W.O.</p>
        <div className="botao-forfeit-actions">
          <button
            type="button"
            className="botao-forfeit-confirm"
            onClick={() => {
              onClose();
              onForfeit();
            }}
          >
            Desistir
          </button>
          <button type="button" className="botao-primary" onClick={onClose}>
            Continuar jogando
          </button>
        </div>
      </div>
    </div>
  );
}
