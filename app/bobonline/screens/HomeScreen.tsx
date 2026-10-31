"use client";

// Início do Bobonline (§1.1): time em uso, criar/entrar, a sala de antes e o visual da partida.

import { useEffect } from "react";
import BobCrest from "../teams/BobCrest";
import { showTeamsToast, takeFirstRunNotice } from "../teams/team-storage";
import { formatRoomCode } from "../net/codes";
import type { BobTeam } from "../types";
import type { BobView } from "../view-pref";

export type SavedRoomBanner = {
  code: string;
  /** Volta automática em andamento ("Voltando para a sala…"). */
  resuming: boolean;
  /** A última volta falhou: o texto do erro. */
  error: string | null;
};

export default function HomeScreen({
  team,
  nickname,
  ready,
  cryptoOk,
  notice,
  saved,
  view,
  webgl,
  onTeams,
  onCreate,
  onJoin,
  onResume,
  onDiscard,
  onCancelResume,
  onView,
}: {
  team: BobTeam;
  nickname: string;
  /** O aparelho já foi lido (no export estático, false). */
  ready: boolean;
  cryptoOk: boolean;
  /** Aviso do net.json (manutenção etc.). */
  notice: string | null;
  saved: SavedRoomBanner | null;
  view: BobView;
  webgl: boolean;
  onTeams: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onResume: () => void;
  onDiscard: () => void;
  onCancelResume: () => void;
  onView: (view: BobView) => void;
}) {
  // Primeiro acesso: o time sorteado já foi gravado; o aviso sai uma vez só (aqui ou em Meus times).
  useEffect(() => {
    if (!ready) return;
    const firstRun = takeFirstRunNotice();
    if (firstRun) queueMicrotask(() => showTeamsToast(firstRun));
  }, [ready]);

  const shownView = webgl ? view : "2d";

  return (
    <section className="bob-home" aria-labelledby="bob-home-title">
      <header className="bob-hero">
        <span className="bob-eyebrow">ONLINE · P2P</span>
        <h1 id="bob-home-title">Bobonline</h1>
        <p>Crie seu time, chame a galera e jogue botão online: um contra um ou em torneio de 4 ou 8.</p>
      </header>

      {saved && (
        <div className="bob-resume" role="status" data-testid="bob-saved-session">
          {saved.resuming ? (
            <>
              <p><span className="bob-spinner" aria-hidden="true" />Voltando para a sala {formatRoomCode(saved.code)}…</p>
              <div className="bob-resume-actions">
                <button type="button" className="secondary-button" onClick={onCancelResume}>Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <p>Você estava na sala {formatRoomCode(saved.code)}.</p>
              {saved.error && <p className="bob-resume-error">{saved.error}</p>}
              <div className="bob-resume-actions">
                <button type="button" className="primary-button" data-testid="bob-resume" disabled={!cryptoOk} onClick={onResume}>Voltar para a sala</button>
                <button type="button" className="secondary-button" onClick={onDiscard}>Descartar</button>
              </div>
            </>
          )}
        </div>
      )}

      <button type="button" className="bob-team-card" onClick={onTeams} data-testid="bob-my-team" style={{ ["--bob-team-primary" as string]: team.primary }}>
        <BobCrest team={team} size={56} />
        <span className="bob-team-card-text">
          <strong>{team.name}</strong>
          <small>5 jogadores</small>
          <small>Você joga como <b>{nickname}</b></small>
        </span>
        <span className="bob-pill">Meu time</span>
      </button>

      {notice && <p className="bob-info" role="note">{notice}</p>}
      {!cryptoOk && <p className="bob-alert" role="alert">Este navegador não consegue fazer a conexão segura do Bobonline.</p>}

      <div className="bob-cta">
        <button type="button" className="primary-button" data-testid="bob-create" disabled={!cryptoOk} onClick={onCreate}>Criar sala <span>→</span></button>
        <button type="button" className="secondary-button" data-testid="bob-join" disabled={!cryptoOk} onClick={onJoin}>Entrar na sala</button>
      </div>

      <div className="bob-view-toggle" role="group" aria-labelledby="bob-view-label">
        <span id="bob-view-label">Visual da partida</span>
        <div>
          <button type="button" data-testid="bob-view-2d" aria-pressed={shownView === "2d"} onClick={() => onView("2d")}>2D</button>
          <button type="button" data-testid="bob-view-3d" aria-pressed={shownView === "3d"} disabled={!webgl} onClick={() => onView("3d")}>3D</button>
        </div>
        {!webgl && <small>Seu aparelho não suporta 3D</small>}
      </div>

      <p className="bob-fineprint">Conexão direta entre os aparelhos: nenhuma partida passa por servidor do Futbobo.</p>
    </section>
  );
}
