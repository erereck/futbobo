"use client";

// Entrar na sala (§1.4): o código (de qualquer jeito que vier colado), o time e o
// apelido, a busca com o texto do que ela está fazendo de verdade (SearchState), e os
// erros com uma saída só: o botão principal vira "Tentar de novo" e o cartão oferece
// "Testar conexão" quando o erro é de rede.

import { useId, useRef, useState, useSyncExternalStore } from "react";
import BobCrest from "../teams/BobCrest";
import { LIMITS, cleanNickname } from "../teams/model";
import { T } from "../protocol";
import { extractLinkHost, extractRoomCode, formatRoomCode } from "../net/codes";
import type { JoinError, RoomClientState, SearchState } from "../room/room-api";
import type { BobTeam, RoomFormat } from "../types";
import { useNow } from "../use-now";
import { isNativeAndroid } from "../wake-lock";
import { RETRYABLE_ERRORS, joinErrorText, searchBarAt, searchCopy, versionDetail, type SearchBarAnchor } from "../use-room";
import { BackButton, Band, Colophon, Dock, DockSpacer, Ficha, Page, Spread, TeamSticker } from "./paper";

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

export default function JoinRoomScreen({
  team,
  profileNickname,
  draft,
  searching,
  startedAt,
  search,
  clientLoading,
  searchCode,
  joinStage,
  error,
  failedCode,
  clockNote,
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
  onDiagnostics,
}: {
  team: BobTeam;
  profileNickname: string;
  draft: JoinDraft;
  searching: boolean;
  /** Date.now() do início da busca. */
  startedAt: number;
  /** O que a busca está fazendo (null: o cliente ainda não chegou, ou um controlador sem esse estado). */
  search: SearchState | null;
  /** A fábrica do cliente ainda não devolveu (baixando o pedaço da rede, abrindo os relays). */
  clientLoading: boolean;
  /** O código que está sendo procurado (o da tentativa, não o campo, que pode mudar). */
  searchCode: string | null;
  /** Etapa por tempo do controlador: só vale quando `search` é null. */
  joinStage: 0 | 1 | 2;
  error: JoinError | null;
  /** O código da tentativa que falhou: com o campo igual a ele, o botão principal é "Tentar de novo". */
  failedCode: string | null;
  /** Relógio do aparelho muito errado (clockSkewText): vai no cartão dos erros de rede. */
  clockNote: string | null;
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
  /** "Testar conexão": a folha do diagnóstico. */
  onDiagnostics: () => void;
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
  const networkError = error !== null && RETRYABLE_ERRORS.has(error);
  // Uma ação principal só: depois de um erro de rede, o mesmo botão de entrar repete a busca. Com
  // outro código no campo ele volta a ser "Entrar" (é uma busca nova, não a mesma de novo).
  const retry = networkError && failedCode !== null && extractRoomCode(draft.code) === failedCode;
  const typedCode = extractRoomCode(draft.code);

  return (
    <Spread className="bob-form-screen bob-join" aria-labelledby={`${baseId}-title`} aria-busy={searching || undefined}>
      <Page side="left" label="Seu ingresso" className="bob-form-ficha">
        <Band ink="blue" level={2} title="Seu ingresso" />
        <div className="bob-ficha-body">
          <div className="bob-ficha-team">
            <TeamSticker team={team} subtitle={nickname.trim() || profileNickname} />
            <button type="button" className="bob-ghost-button" onClick={onPickTeam}>Trocar time</button>
          </div>
          <Ficha
            rows={[
              { label: "Código", value: typedCode ? formatRoomCode(typedCode) : "—" },
              { label: "Seu nome", value: nickname.trim() || "—" },
              { label: "Time", value: team.shortName },
            ]}
          />
        </div>
      </Page>

      <Page side="right" label="Entrar na sala" className="bob-form-page">
        <BackButton onClick={onBack} />
        <h1 id={`${baseId}-title`} className="bob-question">Entrar na sala</h1>

        <div className="bob-field bob-code-field" data-invalid={codeError ? "true" : undefined}>
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

        {searching && <SearchProgress startedAt={startedAt} search={search} loading={clientLoading} code={searchCode} joinStage={joinStage} onCancel={onCancel} />}

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
            {networkError && clockNote && <p className="bob-error-note">{clockNote}</p>}
            {updateNeeded && <button type="button" className="secondary-button" onClick={onUpdate}>{updateLabel()}</button>}
            {error === "iniciada" && canSpectate && <button type="button" className="secondary-button" data-testid="bob-spectate" onClick={spectate}>Assistir</button>}
            {networkError && <button type="button" className="bob-ghost-button" data-testid="bob-diagnostics" onClick={onDiagnostics}>Testar conexão</button>}
          </div>
        )}

        <Dock>
          <button type="button" className="primary-button bob-submit" data-testid="bob-join-submit" disabled={searching} onClick={submit}>
            {retry ? "Tentar de novo" : "Entrar"}
          </button>
        </Dock>
        <Colophon />
        <DockSpacer />
      </Page>
    </Spread>
  );
}


/**
 * A busca: o texto do passo em que ela está e a barra até o prazo do controlador (só este pedaço
 * redesenha com o relógio). Sem `search` (o cliente ainda carregando, ou um controlador antigo),
 * carregando é "rede" e o resto é "procurando", com a linha do anfitrião pela etapa de tempo.
 */
function SearchProgress({ startedAt, search, loading, code, joinStage, onCancel }: {
  startedAt: number;
  search: SearchState | null;
  loading: boolean;
  code: string | null;
  joinStage: 0 | 1 | 2;
  onCancel: () => void;
}) {
  const now = useNow(250);
  const elapsed = now > 0 && startedAt > 0 ? Math.max(0, now - startedAt) : 0;
  const step = search?.step ?? (loading ? "rede" : "procurando");
  // Achou uma vez, achou: a reabertura da busca volta o passo a "procurando", mas a tela não volta a
  // mandar procurar um anfitrião que já respondeu (nem a lembrar que ele precisa da sala aberta).
  const [found, setFound] = useState({ startedAt, value: false });
  if (found.startedAt !== startedAt) setFound({ startedAt, value: false });
  else if (step === "achou" && !found.value) setFound({ startedAt, value: true });
  const shown = found.startedAt === startedAt && found.value && step === "procurando" ? "achou" : step;
  const copy = searchCopy(shown, code, search === null && joinStage > 0 ? Infinity : elapsed);
  const deadline = search?.deadlineLocal ?? startedAt + T.JOIN_TIMEOUT_MS;
  const [anchor, setAnchor] = useState<SearchBarAnchor & { startedAt: number }>({ deadline, at: startedAt, from: 0, startedAt });
  if (anchor.startedAt !== startedAt) {
    setAnchor({ deadline, at: startedAt, from: 0, startedAt });
  } else if (anchor.deadline !== deadline) {
    // O prazo mudou no meio: a barra segue de onde está (searchBarAt).
    const at = now > 0 ? now : anchor.at;
    setAnchor({ deadline, at, from: searchBarAt(anchor, at), startedAt });
  }
  const progress = now > 0 ? searchBarAt(anchor, now) : 0;
  return (
    <div className="bob-search" role="status" aria-live="polite" data-testid="bob-join-search" data-step={step}>
      <p>{copy.line}</p>
      {copy.hint && <small>{copy.hint}</small>}
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
