"use client";

// Início do Bobonline (§1.1): time em uso, criar/entrar, a sala de antes e o visual da partida.
// No pé, discreto, o "Testar conexão" (a folha do diagnóstico) e, só quando o relógio do
// aparelho está muito errado, uma linha dizendo isso: com ele errado a busca da sala não acha
// ninguém, e nada mais na tela explicaria o porquê.
//
// No álbum: à esquerda a figurinha do seu time (tocar abre Meus times), à direita o jogo. No
// celular, criar e entrar ficam no rodapé amarelo.

import { useEffect, type CSSProperties } from "react";
import FutboboIcon from "../../components/FutboboIcon";
import { showTeamsToast, takeFirstRunNotice } from "../teams/team-storage";
import { formatRoomCode } from "../net/codes";
import { BOB_RULE_PRESETS } from "../teams/match-setup";
import type { BobTeam, RulesPresetId } from "../types";
import type { BobView } from "../view-pref";
import { FORMATS } from "./CreateRoomScreen";
import { Colophon, Dock, DockSpacer, Ficha, MenuLink, Page, Spread, TeamSticker, paper } from "./paper";

const RULES: RulesPresetId[] = ["flash", "classic", "marathon"];

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
  clockNote,
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
  onDiagnostics,
}: {
  team: BobTeam;
  nickname: string;
  /** O aparelho já foi lido (no export estático, false). */
  ready: boolean;
  cryptoOk: boolean;
  /** Aviso do net.json (manutenção etc.). */
  notice: string | null;
  /** Relógio do aparelho muito errado (clockSkewText), ou null. */
  clockNote: string | null;
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
  /** "Testar conexão": a folha do diagnóstico. */
  onDiagnostics: () => void;
}) {
  // Primeiro acesso: o time sorteado já foi gravado; o aviso sai uma vez só (aqui ou em Meus times).
  useEffect(() => {
    if (!ready) return;
    const firstRun = takeFirstRunNotice();
    if (firstRun) queueMicrotask(() => showTeamsToast(firstRun));
  }, [ready]);

  const shownView = webgl ? view : "2d";
  // Um dourado por vez: com a sala de antes oferecida, voltar para ela é a ação dourada.
  const resumeOffered = saved !== null && !saved.resuming;

  return (
    <Spread className="bob-home" aria-labelledby="bob-home-title">
      <Page side="left" label="Seu time" className="bob-home-left">
        <MenuLink />
        <header className={`${paper.masthead} bob-masthead`}>
          <span className={paper.tocChip} style={{ "--chip": "var(--blue)", "--tilt": "-3deg" } as CSSProperties} aria-hidden="true"><FutboboIcon name="team" /></span>
          <div>
            <h1 id="bob-home-title">Bobonline</h1>
            <p>Crie seu time, chame a galera e jogue botão online: um contra um ou em torneio de 4 ou 8.</p>
          </div>
        </header>

        <section className="bob-home-team" aria-labelledby="bob-home-team-title">
          <h2 id="bob-home-team-title" className="bob-section-title">Seu time</h2>
          <div className="bob-home-team-row">
            <button type="button" className="bob-team-card" onClick={onTeams} data-testid="bob-my-team" aria-label={`Meu time: ${team.name}. Abrir Meus times`}>
              <TeamSticker team={team} subtitle={`${team.abbr} · 5 jogadores`} />
            </button>
            <div className="bob-home-team-info">
              <p className="bob-home-nick">Você joga como <b>{nickname}</b></p>
              <Ficha
                className="bob-home-ficha"
                rows={[
                  { label: "Nome curto", value: team.shortName },
                  { label: "Sigla", value: team.abbr },
                  { label: "Elenco", value: "5 jogadores" },
                ]}
              />
              <button type="button" className="secondary-button bob-home-teams" onClick={onTeams}>Meus times</button>
            </div>
          </div>
        </section>
      </Page>

      <Page side="right" label="Jogar" className="bob-home-right">
        <h2 className={`${paper.pageTitle} bob-home-play-title`}>Jogar</h2>

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
                <p>Você estava na sala <b className={paper.num}>{formatRoomCode(saved.code)}</b>.</p>
                {saved.error && <p className="bob-resume-error">{saved.error}</p>}
                <div className="bob-resume-actions">
                  <button type="button" className="primary-button" data-testid="bob-resume" disabled={!cryptoOk} onClick={onResume}>Voltar para a sala</button>
                  <button type="button" className="bob-quiet-button" onClick={onDiscard}>Descartar</button>
                </div>
              </>
            )}
          </div>
        )}

        {notice && <p className="bob-info" role="note">{notice}</p>}
        {clockNote && <p className="bob-hint bob-clock-note" role="note" data-testid="bob-clock-note">{clockNote}</p>}
        {!cryptoOk && <p className="bob-alert" role="alert">Este navegador não consegue fazer a conexão segura do Bobonline.</p>}

        <Dock className="bob-home-dock">
          <button type="button" className={resumeOffered ? "secondary-button" : "primary-button"} data-testid="bob-create" disabled={!cryptoOk} onClick={onCreate}>Criar sala</button>
          <button type="button" className="secondary-button" data-testid="bob-join" disabled={!cryptoOk} onClick={onJoin}>Entrar na sala</button>
        </Dock>

        <div className="bob-view-toggle" role="group" aria-labelledby="bob-view-label">
          <span id="bob-view-label">Visual da partida</span>
          <div>
            <button type="button" data-testid="bob-view-2d" aria-pressed={shownView === "2d"} onClick={() => onView("2d")}>2D</button>
            <button type="button" data-testid="bob-view-3d" aria-pressed={shownView === "3d"} disabled={!webgl} onClick={() => onView("3d")}>3D</button>
          </div>
          {!webgl && <small>Seu aparelho não suporta 3D</small>}
        </div>

        {/* O regulamento impresso da página (só no álbum aberto): o que se escolhe ao criar a sala. */}
        <section className="bob-rulebook" aria-labelledby="bob-rulebook-title">
          <h3 id="bob-rulebook-title" className="bob-section-title">Regulamento</h3>
          <dl>
            {FORMATS.map((format) => (
              <div key={format.id}>
                <dt>{format.label}</dt>
                <dd>{format.detail}</dd>
              </div>
            ))}
            {RULES.map((id) => (
              <div key={id}>
                <dt>{BOB_RULE_PRESETS[id].label}</dt>
                <dd className={paper.num}>{BOB_RULE_PRESETS[id].detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <Colophon menu={false}>
          <p className="bob-fineprint">Conexão direta entre os aparelhos: nenhuma partida passa por servidor do Futbobo.</p>
          <button type="button" className="bob-quiet-button" data-testid="bob-diagnostics" onClick={onDiagnostics}>Testar conexão</button>
        </Colophon>
        <DockSpacer />
      </Page>
    </Spread>
  );
}
