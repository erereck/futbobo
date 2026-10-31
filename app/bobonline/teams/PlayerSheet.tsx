"use client";

// Folha "Personalizar jogador": o criador de personagem de sempre
// (PlayerAppearanceEditor, um jogador por vez = no máximo um contexto WebGL),
// com nome e número do botão embaixo da prévia. Tudo que muda aqui vai direto
// para o rascunho do editor do time, que cuida do salvamento.

import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import PlayerAppearanceEditor from "../../PlayerAppearanceEditor";
import type { BobPlayer, BobTeam } from "../types";
import { newSeed, randomBobPlayer } from "./generator";
import { LIMITS, cleanText, textLength } from "./model";
import { BodyPortal } from "./TeamCodeSheet";
import "./teams.css";

export function playerNumberError(team: BobTeam, index: number): string | null {
  const number = team.players[index]?.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > 99) return "Use um número de 1 a 99";
  const owner = team.players.find((player, at) => at !== index && player.number === number);
  return owner ? `Número já usado por ${cleanText(owner.name, LIMITS.playerName[1]) || `#${number}`}` : null;
}

export function playerNameError(player: BobPlayer | undefined): string | null {
  return textLength(cleanText(player?.name, LIMITS.playerName[1])) < LIMITS.playerName[0] ? `Mínimo ${LIMITS.playerName[0]} letras` : null;
}

export default function PlayerSheet({
  team,
  index,
  onChange,
  onClose,
}: {
  team: BobTeam;
  index: number;
  onChange: (player: BobPlayer) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const nameId = useId();
  const numberId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const player = team.players[index];
  const nameError = playerNameError(player);
  const numberError = playerNumberError(team, index);

  useEffect(() => {
    // Foco na folha e, ao fechar, de volta ao cartão do jogador.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);

  if (!player) return null;

  function patch(changes: Partial<BobPlayer>) {
    onChange({ ...player, ...changes });
  }

  function reroll() {
    const taken = team.players.filter((_, at) => at !== index).map((other) => other.number);
    const fresh = randomBobPlayer(newSeed(), index, taken, team.kitPattern);
    // Sortear troca nome, rosto e comemoração; o número fica.
    onChange({ ...fresh, id: player.id, number: player.number });
  }

  function done() {
    if (nameError) return nameRef.current?.focus();
    if (numberError) return numberRef.current?.focus();
    onClose();
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.stopPropagation();
    onClose();
  }

  const extras = (
    <div className="bob-psheet-fields">
      <div className="bob-field" data-invalid={nameError ? "true" : undefined}>
        <label htmlFor={nameId}>Nome</label>
        <input
          ref={nameRef}
          id={nameId}
          value={player.name}
          maxLength={LIMITS.playerName[1]}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameId}-erro` : undefined}
          onChange={(event) => patch({ name: event.target.value })}
        />
        {nameError && <small id={`${nameId}-erro`} className="bob-field-error">{nameError}</small>}
      </div>
      <div className="bob-field" data-invalid={numberError ? "true" : undefined}>
        <label htmlFor={numberId}>Número</label>
        <input
          ref={numberRef}
          id={numberId}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={Number.isFinite(player.number) ? String(player.number) : ""}
          enterKeyHint="done"
          aria-invalid={numberError ? true : undefined}
          aria-describedby={numberError ? `${numberId}-erro` : undefined}
          onChange={(event) => patch({ number: event.target.value === "" ? Number.NaN : Math.trunc(Number(event.target.value)) })}
        />
      </div>
      {numberError && <small id={`${numberId}-erro`} className="bob-field-error bob-psheet-number-error">{numberError}</small>}
      <div className="bob-psheet-buttons">
        <button type="button" className="secondary-button" onClick={reroll}>Sortear jogador</button>
        <button type="button" className="primary-button" onClick={done}>Pronto <span>✓</span></button>
      </div>
    </div>
  );

  return (
    <BodyPortal>
      <div className="modal-backdrop appearance-editor-backdrop bob-sheet-backdrop" role="presentation" onMouseDown={onClose} onKeyDown={handleKeys}>
        <section
          ref={sheetRef}
          className="appearance-editor-sheet bob-psheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header>
            <div><span>VESTIÁRIO · #{Number.isFinite(player.number) ? player.number : "?"}</span><h2 id={titleId}>Personalizar jogador</h2></div>
            <button type="button" className="icon-button" aria-label="Fechar editor" onClick={onClose}>×</button>
          </header>
          <PlayerAppearanceEditor
            compact
            value={player.appearance}
            onChange={(appearance) => patch({ appearance: { ...appearance, kitPattern: team.kitPattern } })}
            playerName={cleanText(player.name, LIMITS.playerName[1])}
            number={Number.isFinite(player.number) ? player.number : 0}
            primary={team.primary}
            secondary={team.secondary}
            kitPattern={team.kitPattern}
            previewExtras={extras}
          />
        </section>
      </div>
    </BodyPortal>
  );
}
