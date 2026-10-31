"use client";

// Entrar na sala (§1.4): o código (de qualquer jeito que vier colado), o time e o
// apelido, a busca de até 45 s com textos em etapas, e os erros com saída.

import { useId, useRef, useState, useSyncExternalStore } from "react";
import BobCrest from "../teams/BobCrest";
import { LIMITS, cleanNickname } from "../teams/model";
import { T } from "../protocol";
import { extractLinkHost, extractRoomCode } from "../net/codes";
import type { JoinError, RoomClientState } from "../room/room-api";
import type { BobTeam, RoomFormat } from "../types";
import { useNow } from "../use-now";
import { isNativeAndroid } from "../wake-lock";
import { RETRYABLE_ERRORS, joinErrorText, versionDetail } from "../use-room";

export type JoinDraft = {
  code: string;
  password: string;
  /** null = ainda o apelido do perfil. */
  nickname: string | null;
};

export const EMPTY_JOIN_DRAFT: JoinDraft = { code: "", password: "", nickname: null };

const subscribeNothing = () => () => {};
const webOnAndroid = () => {
  try {
    return /android/i.test(navigator.userAgent) && !isNativeAndroid();
  } catch {
    return false;
  }
};
const serverFalse = () => false;

const STAGE_COPY = [
  "Procurando a sala…",
  "Ainda procurando… o anfitrião precisa estar com o Futbobo aberto.",
  "Quase lá… se demorar, peça para o anfitrião voltar para o jogo.",
] as const;

export default function JoinRoomScreen({
  team,
  profileNickname,
  draft,
  searching,
  startedAt,
  joinStage,
  error,
  errorFormat,
  canSpectate,
  incompatible,
  linkTooNew,
  passwordAsked,
  onDraft,
  onSubmit,
  onSpectate,
  onCancel,
  onPickTeam,
  onBack,
  onUpdate,
}: {
  team: BobTeam;
  profileNickname: string;
  draft: JoinDraft;
  searching: boolean;
  /** Date.now() do início da busca. */
  startedAt: number;
  joinStage: 0 | 1 | 2;
  error: JoinError | null;
  /** Formato da sala que recusou (para "A partida já começou." × "O torneio já começou."). */
  errorFormat: RoomFormat | null;
  /** A sala que já começou aceita espectadores. */
  canSpectate: boolean;
  incompatible: RoomClientState["incompatible"];
  /** O link veio de uma versão mais nova (`p` maior que o nosso BOB_PROTOCOL). */
  linkTooNew: boolean;
  /** A sala pediu senha alguma vez nesta busca. */
  passwordAsked: boolean;
  onDraft: (patch: Partial<JoinDraft>) => void;
  /** Código já extraído e apelido saneado; `hostId` quando o que foi colado é o link com o anfitrião (&h=). */
  onSubmit: (code: string, nickname: string, hostId: string | null) => void;
  onSpectate: (code: string, nickname: string, hostId: string | null) => void;
  onCancel: () => void;
  onPickTeam: () => void;
  onBack: () => void;
  onUpdate: () => void;
}) {
  const baseId = useId();
  const nickRef = useRef<HTMLInputElement>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const androidWeb = useSyncExternalStore(subscribeNothing, webOnAndroid, serverFalse);
  const nickname = draft.nickname ?? profileNickname;

  function validated(): { code: string; nickname: string; hostId: string | null } | null {
    const code = extractRoomCode(draft.code);
    const clean = cleanNickname(nickname);
    setCodeError(code ? null : "O código tem 6 letras e números.");
    setNameError(clean ? null : `Mínimo ${LIMITS.nickname[0]} letras`);
    return code && clean ? { code, nickname: clean, hostId: extractLinkHost(draft.code) } : null;
  }

  function submit() {
    const ok = validated();
    if (ok) onSubmit(ok.code, ok.nickname, ok.hostId);
  }

  function spectate() {
    const ok = validated();
    if (ok) onSpectate(ok.code, ok.nickname, ok.hostId);
  }

  const showPassword = passwordAsked || error === "senha" || error === "senha-errada";
  const updateNeeded = error === "versao-nova" || (error === "versao" && incompatible?.who !== "them") || linkTooNew;

  return (
    <section className="bob-form-screen" aria-labelledby={`${baseId}-title`} aria-busy={searching || undefined}>
      <button type="button" className="bob-back" onClick={onBack}>← Voltar</button>
      <header className="bob-screen-head">
        <span>ENTRAR</span>
        <h1 id={`${baseId}-title`}>Entrar na sala</h1>
      </header>

      <div className="bob-field" data-invalid={codeError ? "true" : undefined}>
        <label htmlFor={`${baseId}-code`}>Código da sala</label>
        <input
          id={`${baseId}-code`}
          className="bob-code-input"
          data-testid="bob-join-code"
          value={draft.code}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="K7M·PX3"
          onChange={(event) => onDraft({ code: event.target.value.toUpperCase() })}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        {codeError && <span className="bob-field-error">{codeError}</span>}
      </div>

      <div className="bob-field" data-invalid={nameError ? "true" : undefined}>
        <label htmlFor={`${baseId}-nick`}>Seu nome <small>{LIMITS.nickname[0]} a {LIMITS.nickname[1]} letras</small></label>
        <input
          ref={nickRef}
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
        <p>Você entra com: <b>{team.name}</b> · {nickname}</p>
        <div className="bob-playing-with-actions">
          <button type="button" className="bob-ghost-button" onClick={onPickTeam}>Trocar time</button>
          <button type="button" className="bob-ghost-button" onClick={() => nickRef.current?.focus()}>Editar nome</button>
        </div>
      </div>

      {androidWeb && (
        <p className="bob-info">Tem o app do Futbobo? Abra o app e digite o código para jogar com o seu time salvo.</p>
      )}

      {showPassword && (
        <div className="bob-field" data-invalid={error === "senha-errada" ? "true" : undefined}>
          <label htmlFor={`${baseId}-pass`}>Senha</label>
          <input
            id={`${baseId}-pass`}
            value={draft.password}
            maxLength={12}
            autoComplete="off"
            onChange={(event) => onDraft({ password: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          {(error === "senha" || error === "senha-errada") && <span className="bob-field-error">{joinErrorText(error)}</span>}
        </div>
      )}

      {searching && <SearchProgress startedAt={startedAt} joinStage={joinStage} onCancel={onCancel} />}

      {!searching && linkTooNew && !error && (
        <div className="bob-error-card" role="alert">
          <p>{joinErrorText("versao-nova")}</p>
          <button type="button" className="secondary-button" onClick={onUpdate}>{updateLabel()}</button>
        </div>
      )}

      {!searching && error && error !== "senha" && error !== "senha-errada" && (
        <div className="bob-error-card" role="alert" data-testid="bob-join-error">
          {error === "versao" && incompatible ? (
            <>
              <p>
                {incompatible.who === "them"
                  ? `O Futbobo de ${incompatible.nickname ?? "quem está na sala"} está desatualizado. Peça para atualizar.`
                  : "Seu Futbobo está desatualizado para esta sala."}
              </p>
              <small>{versionDetail(incompatible.mine, incompatible.theirs)}</small>
            </>
          ) : (
            <p>{joinErrorText(error, errorFormat)}</p>
          )}
          {updateNeeded && <button type="button" className="secondary-button" onClick={onUpdate}>{updateLabel()}</button>}
          {error === "iniciada" && canSpectate && <button type="button" className="secondary-button" data-testid="bob-spectate" onClick={spectate}>Assistir</button>}
          {RETRYABLE_ERRORS.has(error) && <button type="button" className="secondary-button" onClick={submit}>Tentar de novo</button>}
        </div>
      )}

      <button type="button" className="primary-button bob-submit" data-testid="bob-join-submit" disabled={searching} onClick={submit}>
        Entrar <span>→</span>
      </button>
    </section>
  );
}

/** A busca de até 45 s: barra e texto em etapas (só este pedaço redesenha com o relógio). */
function SearchProgress({ startedAt, joinStage, onCancel }: { startedAt: number; joinStage: 0 | 1 | 2; onCancel: () => void }) {
  const now = useNow(250);
  const elapsed = now > 0 && startedAt > 0 ? Math.max(0, now - startedAt) : 0;
  const stage = Math.max(joinStage, elapsed >= T.JOIN_STAGES_MS[1] ? 2 : elapsed >= T.JOIN_STAGES_MS[0] ? 1 : 0) as 0 | 1 | 2;
  const progress = Math.min(1, elapsed / T.JOIN_TIMEOUT_MS);
  return (
    <div className="bob-search" role="status" aria-live="polite" data-testid="bob-join-search">
      <p>{STAGE_COPY[stage]}</p>
      <div className="bob-progress" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <button type="button" className="bob-ghost-button" onClick={onCancel}>Cancelar</button>
    </div>
  );
}

/** "Baixar atualização" no APK; "Recarregar" na web. */
function updateLabel(): string {
  try {
    return isNativeAndroid() ? "Baixar atualização" : "Recarregar";
  } catch {
    return "Recarregar";
  }
}
