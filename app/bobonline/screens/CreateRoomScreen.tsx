"use client";

// Criar sala (§1.3): apelido, time, formato, regras, CPU e senha.

import { useId, useState } from "react";
import BobCrest from "../teams/BobCrest";
import { BOB_RULE_PRESETS } from "../teams/match-setup";
import { LIMITS, cleanNickname } from "../teams/model";
import type { BobTeam, CpuLevel, RoomFormat, RulesPresetId } from "../types";
import { CPU_LEVEL_LABEL, RETRYABLE_ERRORS, joinErrorText } from "../use-room";
import type { JoinError } from "../room/room-api";

export type CreateDraft = {
  format: RoomFormat;
  rules: RulesPresetId;
  cpuLevel: CpuLevel;
  fillWithCpu: boolean;
  allowSpectators: boolean;
  password: string;
  /** null = ainda o apelido do perfil. */
  nickname: string | null;
};

export const DEFAULT_CREATE_DRAFT: CreateDraft = {
  format: "x1",
  rules: "classic",
  cpuLevel: 3,
  fillWithCpu: true,
  allowSpectators: true,
  password: "",
  nickname: null,
};

const FORMATS: Array<{ id: RoomFormat; label: string; detail: string }> = [
  { id: "x1", label: "X1", detail: "Você contra um amigo. Depois dá para pedir revanche." },
  { id: "t4", label: "Torneio de 4", detail: "Semifinal e final. Vaga livre pode virar time da CPU." },
  { id: "t8", label: "Torneio de 8", detail: "Quartas, semifinal e final." },
];

const RULES: RulesPresetId[] = ["flash", "classic", "marathon"];
const LEVELS: CpuLevel[] = [2, 3, 4];
const PASSWORD_MAX = 12;

export function Switch({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (value: boolean) => void; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="bob-switch" data-testid={testId} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <i aria-hidden="true" />
    </button>
  );
}

export default function CreateRoomScreen({
  team,
  profileNickname,
  draft,
  busy,
  error,
  onDraft,
  onPickTeam,
  onBack,
  onSubmit,
}: {
  team: BobTeam;
  profileNickname: string;
  draft: CreateDraft;
  /** "Abrindo a sala…" */
  busy: boolean;
  error: JoinError | null;
  onDraft: (patch: Partial<CreateDraft>) => void;
  onPickTeam: () => void;
  onBack: () => void;
  /** Recebe o apelido já saneado. */
  onSubmit: (nickname: string) => void;
}) {
  const baseId = useId();
  const [nameError, setNameError] = useState<string | null>(null);
  const nickname = draft.nickname ?? profileNickname;
  const tournament = draft.format !== "x1";

  function submit() {
    const clean = cleanNickname(nickname);
    if (!clean) {
      setNameError(`Mínimo ${LIMITS.nickname[0]} letras`);
      return;
    }
    setNameError(null);
    onSubmit(clean);
  }

  return (
    <section className="bob-form-screen" aria-labelledby={`${baseId}-title`} aria-busy={busy || undefined}>
      <button type="button" className="bob-back" onClick={onBack}>← Voltar</button>
      <header className="bob-screen-head">
        <span>NOVA SALA</span>
        <h1 id={`${baseId}-title`}>Criar sala</h1>
      </header>

      <div className="bob-field" data-invalid={nameError ? "true" : undefined}>
        <label htmlFor={`${baseId}-nick`}>Seu nome <small>{LIMITS.nickname[0]} a {LIMITS.nickname[1]} letras</small></label>
        <input
          id={`${baseId}-nick`}
          value={nickname}
          maxLength={LIMITS.nickname[1]}
          autoComplete="nickname"
          onChange={(event) => onDraft({ nickname: event.target.value })}
        />
        {nameError && <span className="bob-field-error">{nameError}</span>}
      </div>

      <div className="bob-playing-with">
        <BobCrest team={team} size={40} />
        <p>Você joga com: <b>{team.name}</b></p>
        <button type="button" className="bob-ghost-button" onClick={onPickTeam}>Trocar time</button>
      </div>

      <fieldset className="bob-choice">
        <legend>Formato</legend>
        <div className="bob-format-grid">
          {FORMATS.map((format) => (
            <button key={format.id} type="button" className="bob-format-card" data-testid={`bob-format-${format.id}`} aria-pressed={draft.format === format.id} onClick={() => onDraft({ format: format.id })}>
              <strong>{format.label}</strong>
              <small>{format.detail}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="bob-choice">
        <legend>Regras</legend>
        <div className="bob-chips">
          {RULES.map((id) => (
            <button key={id} type="button" aria-pressed={draft.rules === id} data-testid={`bob-rules-${id}`} onClick={() => onDraft({ rules: id })}>
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
              <button key={level} type="button" aria-pressed={draft.cpuLevel === level} onClick={() => onDraft({ cpuLevel: level })}>
                <strong>{CPU_LEVEL_LABEL[level]}</strong>
              </button>
            ))}
          </div>
          <Switch label="Completar vagas com CPU" checked={draft.fillWithCpu} onChange={(value) => onDraft({ fillWithCpu: value })} testId="bob-fill-cpu" />
        </fieldset>
      )}

      <Switch label="Permitir espectadores" checked={draft.allowSpectators} onChange={(value) => onDraft({ allowSpectators: value })} />

      <div className="bob-field">
        <label htmlFor={`${baseId}-pass`}>Senha da sala (opcional) <small>até {PASSWORD_MAX}</small></label>
        <input
          id={`${baseId}-pass`}
          value={draft.password}
          maxLength={PASSWORD_MAX}
          autoComplete="off"
          placeholder="Deixe vazio para sala aberta"
          onChange={(event) => onDraft({ password: event.target.value })}
        />
      </div>

      {error && (
        <div className="bob-error-card" role="alert">
          <p>{joinErrorText(error)}</p>
          {RETRYABLE_ERRORS.has(error) && <button type="button" className="secondary-button" onClick={submit}>Tentar de novo</button>}
        </div>
      )}

      <button type="button" className="primary-button bob-submit" data-testid="bob-create-submit" disabled={busy} onClick={submit}>
        {busy ? "Abrindo a sala…" : <>Criar sala <span>→</span></>}
      </button>
    </section>
  );
}
