"use client";

// Sala de espera (§1.5): código grande para passar adiante, as vagas com pronto e
// conexão de cada um, e os botões de quem manda (anfitrião) ou de quem chegou.

import { useEffect, useId, useRef, useState } from "react";
import BobCrest from "../teams/BobCrest";
import { ConfirmSheet } from "../teams/TeamCodeSheet";
import { BOB_RULE_PRESETS } from "../teams/match-setup";
import { showTeamsToast } from "../teams/team-storage";
import { FORMAT_SIZE } from "../tournament/bracket";
import { formatRoomCode, roomLink } from "../net/codes";
import type { PeerHealth } from "../protocol";
import type { RoomClientState } from "../room/room-api";
import { copyText, openWhatsApp, shareRoomLink } from "../share";
import type { CpuLevel, PeerPresence, RoomMember, RulesPresetId } from "../types";
import { CPU_LEVEL_LABEL, playersOf, roomClient, settingsLine, spectatorsOf } from "../use-room";
import { Switch } from "./CreateRoomScreen";

const PRESENCE_WORD: Record<PeerPresence, string> = { online: "ok", unstable: "instável", away: "fora do app", offline: "caiu" };
const HEALTH_WORD: Record<PeerHealth, string> = { ok: "ok", unstable: "instável", away: "fora do app", lost: "caiu" };
const RULES: RulesPresetId[] = ["flash", "classic", "marathon"];
const LEVELS: CpuLevel[] = [2, 3, 4];

/** "Falta 1 jogador", "Esperando Fulano ficar pronto"…: por que o botão de começar está apagado. */
export function startBlockedReason(players: RoomMember[], hostId: string): string | null {
  const missing = Math.max(0, 2 - players.length);
  if (missing === 1) return "Falta 1 jogador";
  if (missing > 1) return `Faltam ${missing} jogadores`;
  const waiting = players.filter((member) => member.playerId !== hostId && !member.ready);
  if (waiting.length === 1) return `Esperando ${waiting[0].nickname} ficar pronto`;
  if (waiting.length > 1) return `Esperando ${waiting.length} jogadores ficarem prontos`;
  return null;
}

function connectionWord(state: RoomClientState, member: RoomMember): string {
  if (member.playerId === state.me) return "ok";
  // A presença do snapshot é a visão do anfitrião; o próprio anfitrião, visto daqui, vem da minha sessão.
  if (member.playerId === state.snapshot?.hostId && !state.isHost) return HEALTH_WORD[state.health[member.playerId] ?? "ok"];
  return PRESENCE_WORD[member.presence];
}

function spelledCode(code: string): string {
  return `Código da sala: ${code.split("").join(", ")}`;
}

export default function LobbyScreen({
  state,
  onTeams,
  onLeave,
}: {
  state: RoomClientState;
  /** "Trocar time": Meus times em modo de escolha. */
  onTeams: () => void;
  /** "Sair da sala" (a página confirma). */
  onLeave: () => void;
}) {
  const baseId = useId();
  const [shared, setShared] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [kick, setKick] = useState<RoomMember | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const snapshot = state.snapshot;

  useEffect(() => {
    if (!fallback) return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [fallback]);

  if (!snapshot) return null;
  const { settings, code } = snapshot;
  const tournament = settings.format !== "x1";
  const capacity = FORMAT_SIZE[settings.format];
  const players = playersOf(snapshot);
  const spectators = spectatorsOf(snapshot);
  const me = snapshot.members.find((member) => member.playerId === state.me) ?? null;
  const isHost = state.isHost;
  const alone = players.length <= 1;
  const blocked = startBlockedReason(players, snapshot.hostId);

  async function share() {
    const outcome = await shareRoomLink(code);
    if (outcome === "copied") showTeamsToast("Link copiado");
    if (outcome === "failed") setFallback(roomLink(code, snapshot?.hostId));
    if (outcome !== "cancelled") setShared(true);
  }

  async function copyCode() {
    if (await copyText(code)) showTeamsToast("Código copiado");
    else setFallback(code);
    setShared(true);
  }

  function whatsapp() {
    openWhatsApp(code);
    setShared(true);
  }

  function start() {
    const result = roomClient()?.hostStart();
    if (result && !result.ok) setStartError(result.reason === "faltam-jogadores" ? "Falta 1 jogador" : "Ainda tem gente se preparando");
    else setStartError(null);
  }

  return (
    <section className="bob-lobby" aria-labelledby={`${baseId}-title`}>
      <header className="bob-lobby-head">
        <span className="bob-eyebrow" id={`${baseId}-title`}>SALA</span>
        <strong className="bob-room-code" aria-label={spelledCode(code)} data-testid="bob-room-code">{formatRoomCode(code)}</strong>
        <p>{settingsLine(settings)}</p>
      </header>

      <div className="bob-share">
        <button type="button" className="primary-button bob-share-main" data-testid="bob-share-whatsapp" onClick={whatsapp}>Mandar no WhatsApp</button>
        <button type="button" className="secondary-button" data-testid="bob-share-link" onClick={() => void share()}>Compartilhar link</button>
        <button type="button" className="secondary-button" data-testid="bob-copy-code" onClick={() => void copyCode()}>Copiar código</button>
      </div>
      {fallback && (
        <div className="bob-field bob-copy-fallback">
          <label htmlFor={`${baseId}-fallback`}>Toque e segure para copiar.</label>
          <input id={`${baseId}-fallback`} ref={fallbackRef} readOnly value={fallback} onFocus={(event) => event.currentTarget.select()} />
        </div>
      )}
      {shared && alone && <p className="bob-hint">Mandou? Volte para cá: a sala só aparece com o jogo aberto.</p>}

      <ol className="bob-slots" aria-label="Vagas da sala">
        {Array.from({ length: capacity }, (_, index) => {
          const member = players[index];
          if (!member) {
            return (
              <li key={`free-${index}`} className="bob-slot bob-slot-free">
                <span className="bob-slot-free-mark" aria-hidden="true" />
                <span>Vaga livre{tournament && settings.fillWithCpu ? " · vira CPU ao começar" : ""}</span>
              </li>
            );
          }
          const team = state.teams[member.teamHash];
          const hostRow = member.playerId === snapshot.hostId;
          const word = connectionWord(state, member);
          return (
            <li key={member.playerId} className="bob-slot" data-testid="bob-slot" style={team ? { ["--bob-team-primary" as string]: team.primary } : undefined}>
              {team ? <BobCrest team={team} size={40} /> : <span className="bob-crest-blank" aria-hidden="true" />}
              <span className="bob-slot-text">
                <strong>{team?.name ?? "Time chegando…"}</strong>
                <small>{member.nickname}</small>
                <span className="bob-badges">
                  {hostRow && <em className="bob-badge bob-badge-host">ANFITRIÃO</em>}
                  {member.playerId === state.me && <em className="bob-badge bob-badge-me">VOCÊ</em>}
                  {!hostRow && (member.ready ? <em className="bob-badge bob-badge-ready">PRONTO</em> : <em className="bob-badge">PREPARANDO</em>)}
                </span>
              </span>
              <span className="bob-conn" data-state={word} aria-label={word}><i aria-hidden="true" />{word}</span>
              {isHost && member.playerId !== state.me && (
                <button type="button" className="bob-ghost-button bob-kick" onClick={() => setKick(member)}>Remover</button>
              )}
            </li>
          );
        })}
      </ol>

      {spectators.length > 0 && (
        <div className="bob-spectators">
          <span>Assistindo ({spectators.length})</span>
          <p>{spectators.map((member) => member.nickname).join(" · ")}</p>
        </div>
      )}

      {isHost ? (
        <div className="bob-host-panel">
          <fieldset className="bob-choice">
            <legend>Regras</legend>
            <div className="bob-chips">
              {RULES.map((id) => (
                <button key={id} type="button" aria-pressed={settings.rules === id} onClick={() => roomClient()?.hostSetSettings({ rules: id })}>
                  <strong>{BOB_RULE_PRESETS[id].label}</strong>
                  <small>{BOB_RULE_PRESETS[id].detail}</small>
                </button>
              ))}
            </div>
          </fieldset>
          {tournament && (
            <fieldset className="bob-choice">
              <legend>Nível da CPU</legend>
              <div className="bob-chips bob-chips-compact">
                {LEVELS.map((level) => (
                  <button key={level} type="button" aria-pressed={settings.cpuLevel === level} onClick={() => roomClient()?.hostSetSettings({ cpuLevel: level })}>
                    <strong>{CPU_LEVEL_LABEL[level]}</strong>
                  </button>
                ))}
              </div>
              <Switch label="Completar vagas com CPU" checked={settings.fillWithCpu} onChange={(value) => roomClient()?.hostSetSettings({ fillWithCpu: value })} testId="bob-fill-cpu" />
            </fieldset>
          )}
          <button type="button" className="primary-button bob-submit" data-testid="bob-start" disabled={blocked !== null} onClick={start}>
            {tournament ? "Começar torneio" : "Começar partida"} <span>→</span>
          </button>
          {(blocked ?? startError) && <p className="bob-hint" role="status">{blocked ?? startError}</p>}
          <div className="bob-lobby-actions">
            <button type="button" className="secondary-button" onClick={onTeams}>Trocar time</button>
            <button type="button" className="secondary-button" data-testid="bob-leave" onClick={onLeave}>Sair da sala</button>
          </div>
        </div>
      ) : (
        <div className="bob-guest-panel">
          <button
            type="button"
            className={me?.ready ? "secondary-button bob-ready-on" : "primary-button"}
            data-testid="bob-ready"
            aria-pressed={me?.ready ?? false}
            disabled={!me || me.role !== "player"}
            onClick={() => roomClient()?.setReady(!me?.ready)}
          >
            {me?.ready ? "Não estou pronto" : "Estou pronto"}
          </button>
          <p className="bob-hint" role="status">Esperando o anfitrião começar…</p>
          <div className="bob-lobby-actions">
            <button type="button" className="secondary-button" onClick={onTeams}>Trocar time</button>
            <button type="button" className="secondary-button" data-testid="bob-leave" onClick={onLeave}>Sair da sala</button>
          </div>
        </div>
      )}

      {kick && (
        <ConfirmSheet
          title={`Remover ${kick.nickname} da sala?`}
          confirmLabel="Remover"
          danger
          onConfirm={() => {
            roomClient()?.hostKick(kick.playerId);
            setKick(null);
          }}
          onCancel={() => setKick(null)}
        />
      )}
    </section>
  );
}
