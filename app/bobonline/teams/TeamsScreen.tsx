"use client";

// "Meus times": até 6 times salvos no aparelho, o apelido do jogador e as
// entradas para criar, importar e editar. Em modo "pick" (Trocar time, na sala)
// tocar num time escolhe ele em vez de abrir o editor.
//
// Quem abre o editor: com `onEdit`, a página (tela "editor" do Bobonline, com o
// histórico do botão voltar do Android); sem `onEdit`, esta tela mesmo, por dentro.

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { claimBack } from "../screen-history";
import { BOB_MAX_TEAMS, type BobTeam } from "../types";
import { BackButton, Band, ClubCard, Page, Spread, TeamSticker, paper } from "../screens/paper";
import { LIMITS, cleanNickname } from "./model";
import TeamCodeSheet, { TeamsToastHost } from "./TeamCodeSheet";
import TeamEditor from "./TeamEditor";
import { createTeam, setActiveTeam, setNickname, showTeamsToast, takeFirstRunNotice, useBobProfile, useBobTeams } from "./team-storage";
import "./teams.css";

/** Cada figurinha colada um pouco torta. */
const TILTS = ["-1.6deg", "1deg", "-.6deg", "1.4deg", "-1.1deg", ".7deg"];

export type TeamsScreenProps = {
  mode: "manage" | "pick";
  onBack: () => void;
  onPicked?: (teamId: string) => void;
  /** A página mostra o editor (tela "editor"). Sem isso o editor abre dentro desta tela. */
  onEdit?: (teamId: string) => void;
  /** Repassado ao editor quando ele abre dentro desta tela. */
  stageNotice?: string;
};

export default function TeamsScreen({ mode, onBack, onPicked, onEdit, stageNotice }: TeamsScreenProps) {
  const { teams, active, ready } = useBobTeams();
  const { profile } = useBobProfile();
  const [editing, setEditing] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const baseId = useId();

  // Primeiro acesso direto aqui (sem passar pelo início): o aviso do time sorteado aparece uma vez.
  useEffect(() => {
    if (!ready) return;
    const notice = takeFirstRunNotice();
    if (notice) queueMicrotask(() => showTeamsToast(notice));
  }, [ready]);

  // Voltar do aparelho na tela "teams": fecha a importação aberta; o apelido digitado (ainda sem blur) grava antes de sair.
  useEffect(() => {
    if (editing && !onEdit) return undefined;
    return claimBack(() => {
      if (importing) { setImporting(false); return true; }
      if (nameDraft !== null) setNickname(nameDraft);
      return false;
    });
  });

  if (editing && !onEdit) {
    return <TeamEditor key={editing} teamId={editing} stageNotice={stageNotice} onBack={() => setEditing(null)} />;
  }

  const full = teams.length >= BOB_MAX_TEAMS;
  const nicknameId = `${baseId}-apelido`;

  function openEditor(teamId: string) {
    if (onEdit) onEdit(teamId);
    else setEditing(teamId);
  }

  function pick(team: BobTeam) {
    setActiveTeam(team.id);
    if (onPicked) onPicked(team.id);
    else onBack();
  }

  function commitNickname(value: string) {
    const ok = cleanNickname(value) !== null;
    const savedName = setNickname(value);
    setNameDraft(null);
    setNameError(ok ? null : `Mínimo ${LIMITS.nickname[0]} letras. Ficou ${savedName}.`);
  }

  function handleNicknameKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
  }

  function newRandomTeam() {
    const team = createTeam();
    if (team) showTeamsToast(`Novo time no vestiário: ${team.name}`);
  }

  return (
    <Spread className="bob-teams" aria-labelledby={`${baseId}-titulo`} aria-busy={ready ? undefined : true}>
      <Page side="left" label="Vestiário" className="bob-teams-left">
        <BackButton onClick={onBack} />
        <Band ink="red" titleId={`${baseId}-titulo`} title="Meus times" subtitle="Até 6 times salvos neste aparelho. O time em uso vai para a sala." />

        <div className="bob-field bob-teams-nickname" data-invalid={nameError ? "true" : undefined}>
          <label htmlFor={nicknameId}>Seu nome<small>{LIMITS.nickname[0]}–{LIMITS.nickname[1]} letras</small></label>
          <input
            id={nicknameId}
            value={nameDraft ?? profile.nickname}
            maxLength={LIMITS.nickname[1]}
            autoComplete="nickname"
            enterKeyHint="done"
            disabled={!ready}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nicknameId}-erro` : undefined}
            onChange={(event) => {
              setNameDraft(event.target.value);
              setNameError(null);
            }}
            onBlur={(event) => commitNickname(event.target.value)}
            onKeyDown={handleNicknameKeys}
          />
          {nameError && <small id={`${nicknameId}-erro`} className="bob-field-error">{nameError}</small>}
        </div>

        {/* O time em uso, grande: a figurinha que vai para a sala. */}
        {ready && (
          <figure className="bob-teams-active">
            <TeamSticker team={active} subtitle={`${active.abbr} · ${active.shortName}`} />
            <figcaption><em className="bob-team-tag">Em uso</em></figcaption>
          </figure>
        )}
      </Page>

      <Page side="right" label="Times salvos" className="bob-teams-right">
        <h2 className="bob-section-title">Times salvos <small className={paper.num}>{teams.length} de {BOB_MAX_TEAMS}</small></h2>
        {mode === "pick" && <p className="bob-teams-pick">Toque no time que vai para a sala.</p>}

        {ready && (
          <ul className="bob-team-list">
            {teams.map((team, index) => {
              const isActive = team.id === active.id;
              return (
                <li key={team.id} className="bob-team-item">
                  <button
                    type="button"
                    className={`bob-team-row${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`${mode === "pick" ? "Usar" : "Editar"} ${team.name}${isActive ? ", time em uso" : ""}`}
                    onClick={() => (mode === "pick" ? pick(team) : openEditor(team.id))}
                  >
                    <ClubCard team={team} note={`${team.abbr} · ${team.shortName}`} tilt={TILTS[index % TILTS.length]}>
                      {isActive && <em className="bob-team-tag">Em uso</em>}
                      {mode === "pick" && <i className="bob-team-radio" aria-hidden="true" />}
                    </ClubCard>
                  </button>
                  {mode === "pick" && (
                    <button type="button" className="bob-team-edit" aria-label={`Editar ${team.name}`} onClick={() => openEditor(team.id)}>
                      Editar
                    </button>
                  )}
                </li>
              );
            })}
            {!full && (
              <li className="bob-team-item bob-team-new">
                {/* O espaço vazio do álbum: onde o próximo time vai ser colado. */}
                <button type="button" className={paper.emptySlot} onClick={newRandomTeam}>
                  <span className={paper.slotPlus} aria-hidden="true">+</span>
                  <span>Novo time aleatório</span>
                </button>
              </li>
            )}
          </ul>
        )}

        <div className="bob-teams-actions">
          <button type="button" className="secondary-button" disabled={!ready || full} onClick={() => setImporting(true)}>Importar código</button>
        </div>
        {full && <p className="bob-teams-limit">Limite de 6 times. Exclua um para criar outro.</p>}
      </Page>

      {importing && (
        <TeamCodeSheet
          mode="import"
          onClose={() => setImporting(false)}
          onImported={(team) => {
            setImporting(false);
            openEditor(team.id);
          }}
        />
      )}
      <TeamsToastHost />
    </Spread>
  );
}
