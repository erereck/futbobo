"use client";

// Avisos da sala que valem em qualquer tela do Bobonline (§1):
// - a faixa da próxima partida quando o "pronto?" dela começa (vibra e apita uma vez);
// - os avisos curtos da sala (entrou, saiu, caiu…). Durante a minha partida só passam
//   os que são dela; os outros esperam e saem depois (no máximo 3, o mais novo primeiro).

import { useEffect } from "react";
import { playBotaoSound } from "../../botao/audio";
import { roundName } from "../tournament/bracket";
import { useNow } from "../use-now";
import type { RoomClientState } from "../room/room-api";
import { bracketMatchOf, nicknameOf, readyCheckKey, roomClient } from "../use-room";

/** "Pronto?" já anunciados nesta página (por checagem: sala, sorteio, partida e prazo), os mais novos. */
const announced = new Set<string>();
const MAX_ANNOUNCED = 24;
const scheduled = new Map<number, ReturnType<typeof setTimeout>>();
const TOAST_MS = 4500;
const MAX_TOASTS = 3;

export default function NextMatchBanner({ state }: { state: RoomClientState }) {
  const next = state.nextMatch;
  const match = next ? bracketMatchOf(state, next.bracketId) : null;
  const bracket = state.snapshot?.bracket ?? null;
  const visible = Boolean(next && match && bracket && match.status === "ready-check" && next.readyDeadlineLocal !== null);
  // A chave repete os ids (r2m0…) em todo torneio: o aviso vale por checagem, não por partida.
  const announceKey = visible ? readyCheckKey(state) : null;

  useEffect(() => {
    if (!announceKey || announced.has(announceKey)) return;
    announced.add(announceKey);
    if (announced.size > MAX_ANNOUNCED) announced.delete(announced.values().next().value as string);
    try {
      navigator.vibrate?.([0, 60, 40, 60]);
    } catch {
      // Sem vibração (desktop, iOS): só o apito.
    }
    playBotaoSound("whistle");
  }, [announceKey]);

  if (!visible || !next || !match || !bracket || next.readyDeadlineLocal === null) return null;
  const opponent = next.opponent === "cpu" ? "a CPU" : nicknameOf(state, next.opponent);
  const pressed = match.readyBy.includes(state.me);

  return (
    <div className="bob-next-banner" role="status" data-testid="bob-next-banner">
      <p>
        Próxima partida ({roundName(bracket.size, match.round)}) contra {opponent} <Countdown deadline={next.readyDeadlineLocal} />
      </p>
      {pressed ? (
        <span>Pronto ✓</span>
      ) : (
        <button type="button" data-testid="bob-banner-ready" onClick={() => roomClient()?.readyForMatch(next.bracketId)}>Estou pronto</button>
      )}
    </div>
  );
}

/** O relógio da faixa num componente próprio: só ele redesenha 4 vezes por segundo. */
function Countdown({ deadline }: { deadline: number }) {
  const now = useNow(250);
  if (now === 0) return <>vai começar</>;
  return <>começa em {Math.max(0, Math.ceil((deadline - now) / 1000))}s</>;
}

/** Avisos da sala (role="status"). Somem sozinhos; quem passa do limite sai na hora. */
export function RoomToasts({ toasts, matchOpen }: { toasts: RoomClientState["toasts"]; matchOpen: boolean }) {
  const eligible = matchOpen ? toasts.filter((toast) => !toast.deferred) : toasts;
  const shown = eligible.slice(-MAX_TOASTS).reverse();
  const shownKey = shown.map((toast) => toast.id).join(",");
  const overflowKey = eligible.slice(0, Math.max(0, eligible.length - MAX_TOASTS)).map((toast) => toast.id).join(",");

  useEffect(() => {
    const client = roomClient();
    if (!client) return;
    for (const id of overflowKey ? overflowKey.split(",").map(Number) : []) client.dismissToast(id);
    for (const id of shownKey ? shownKey.split(",").map(Number) : []) {
      if (scheduled.has(id)) continue;
      scheduled.set(id, setTimeout(() => {
        scheduled.delete(id);
        roomClient()?.dismissToast(id);
      }, TOAST_MS));
    }
  }, [shownKey, overflowKey]);

  return (
    <div className="bob-toasts" role="status" aria-live="polite" data-match={matchOpen ? "true" : undefined}>
      {shown.map((toast) => (
        <p key={toast.id} className="bob-toast">
          <span>{toast.text}</span>
          <button type="button" aria-label="Fechar aviso" onClick={() => roomClient()?.dismissToast(toast.id)}>×</button>
        </p>
      ))}
    </div>
  );
}
