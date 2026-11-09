"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { Club, PositionKey } from "../../../../game-data";
import { POSITIONS, countryById } from "../../../../game-data";
import type { AttributeKey, GameState } from "../../../../career/model";
import { positionByKey } from "../../../../career/academy";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, POSITION_PRIMARY_ATTRIBUTES, attributeAverage } from "../../../../career/state";
import { formatFollowers, formatMoney, marketValue } from "../../../../career/performance";
import { teamKitPattern } from "../../../../player-appearance";
import FutboboIcon from "../../../FutboboIcon";
import { ALBUM_OVERLAY_ID, AlbumPage } from "../AlbumShell";
import { BlockTitle, Ficha, InkBand, PlayerSticker, Seal, Stamp } from "../primitives";
import styles from "./playerTab.module.css";

export type PositionChangeControls = {
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  target: PositionKey | null;
  setTarget: (target: PositionKey | null) => void;
  feedback: { success: boolean; headline: string; text: string } | null;
  setFeedback: (feedback: { success: boolean; headline: string; text: string } | null) => void;
  attempt: () => void;
};

/** Tinta do atributo no papel: ouro, verde, azul, cinza e vermelho (a escala do jogo, legível no claro). */
function attributeInk(value: number) {
  if (value >= 85) return "var(--yellow-deep)";
  if (value >= 72) return "var(--green)";
  if (value >= 58) return "var(--blue)";
  if (value >= 45) return "var(--ink-3)";
  return "var(--red)";
}

const ZONE_INK: Record<string, string> = { gol: "var(--yellow-deep)", defesa: "var(--blue)", meio: "var(--green)", ataque: "var(--red)" };

const sentence = (label: string) => label.charAt(0) + label.slice(1).toLocaleLowerCase("pt-BR");

/** Encarte de alcance: seguidores por temporada e marcos digitais, por cima do álbum. */
function ReachSheet({ game, onClose }: { game: GameState; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  const seasons = game.history.slice(-10);
  const peak = Math.max(1, ...seasons.map((record) => record.followers ?? 0), game.followers);
  const hasReach = seasons.some((record) => (record.followers ?? 0) > 0);
  return (
    <div className={styles.sheetBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="alcance-titulo">
        <header className={styles.sheetHead}>
          <div>
            <h2 id="alcance-titulo" className={styles.sheetTitle}>{formatFollowers(game.followers)} seguidores</h2>
            <p>Alcance nas redes, temporada por temporada.</p>
          </div>
          <button ref={closeRef} type="button" className={styles.sheetClose} onClick={onClose}>Fechar</button>
        </header>
        {hasReach ? (
          <ol className={styles.reach}>
            {seasons.map((record) => {
              const value = record.followers ?? 0;
              return (
                <li key={`${record.season}-${record.clubId}`}>
                  <span className={styles.num}>{record.season}</span>
                  <i style={{ "--v": Math.max(3, (value / peak) * 100) } as CSSProperties} aria-hidden="true" />
                  <b className={styles.num}>{formatFollowers(value)}</b>
                </li>
              );
            })}
          </ol>
        ) : <p className={styles.empty}>O alcance aparece depois das primeiras temporadas profissionais.</p>}
        <BlockTitle>Marcos digitais</BlockTitle>
        {game.offFieldMilestones.length ? (
          <ul className={styles.milestones}>
            {[...game.offFieldMilestones].reverse().map((milestone) => <li key={milestone}>{milestone}</li>)}
          </ul>
        ) : <p className={styles.empty}>Nenhum marco digital ainda.</p>}
      </section>
    </div>
  );
}

/** Aba Jogador: a ficha do jogador no álbum — figurinha, ficha técnica, atributos, função em campo e prontuário. */
export default function PlayerTab({ game, club, showAppearance, onEditAppearance, positionChange }: { game: GameState; club: Club; showAppearance: boolean; onEditAppearance: () => void; positionChange: PositionChangeControls }) {
  const [reachOpen, setReachOpen] = useState(false);
  const position = positionByKey(game.position);
  const country = countryById(game.nationality);
  const primaryKeys: AttributeKey[] = POSITION_PRIMARY_ATTRIBUTES[game.position] ?? [];
  const keyAverage = Math.round(attributeAverage(game.attributes, primaryKeys));
  const appearance = showAppearance ? { ...game.playerAppearance, kitPattern: teamKitPattern(game.seed, club.id) } : null;
  const value = marketValue(game.overall, game.age, club, game.reputation, game.history.at(-1));
  const sponsorTotal = game.sponsorHistory.reduce((sum, deal) => sum + deal.annualValue * Math.max(1, deal.endSeason - deal.startSeason), 0)
    + (game.activeSponsor ? game.activeSponsor.annualValue * Math.max(1, game.activeSponsor.endSeason - game.season) : 0);
  const cooldown = game.positionChangeCooldownSeason >= game.season;
  const medical = game.medicalHistory;

  return (
    <>
      {/* ───────────── página da ficha ───────────── */}
      <AlbumPage side="left" label={`Ficha de ${game.name}`}>
        <div className={styles.leftGrid}>
        <div className={styles.band}>
        <InkBand
          ink="blue"
          title={game.name}
          subtitle={`${game.archetype}, ${position.style.toLocaleLowerCase("pt-BR")}`}
          aside={<span className={styles.shirtNo} aria-label={`Camisa ${game.number}`}><b className={styles.num}>{game.number}</b><small>camisa</small></span>}
        />
        </div>

          <div className={styles.stickerCol}>
            <PlayerSticker
              className={styles.sticker}
              name={game.name}
              number={game.number}
              overall={game.overall}
              subtitle={`${position.name}, camisa ${game.number}`}
              club={club}
              appearance={appearance}
              tilt="-2deg"
            />
            {showAppearance && (
              <Stamp className={styles.personalize} onClick={onEditAppearance}>Personalizar visual</Stamp>
            )}
          </div>
          <section className={styles.fichaBlock} aria-labelledby="jogador-ficha">
            <BlockTitle id="jogador-ficha">Ficha técnica</BlockTitle>
            <Ficha
              rows={[
                { label: "Idade", value: `${game.age} anos` },
                { label: "Posição", value: `${position.name} (${game.position})` },
                { label: "Estilo", value: position.style },
                { label: "Pé", value: game.foot },
                { label: "País", value: country.name },
                { label: "Clube", value: club.shortName },
                { label: "OVR", value: game.overall },
              ]}
            />
          </section>

        <section className={styles.keyBlock} aria-labelledby="jogador-chave">
          <div className={styles.keyHead}>
            <BlockTitle id="jogador-chave" note={`para ${position.name.toLocaleLowerCase("pt-BR")}`}>O que importa em campo</BlockTitle>
            <span className={styles.keyAvg} aria-label={`Média-chave ${keyAverage}`}><b className={styles.num}>{keyAverage}</b><small>média</small></span>
          </div>
          <ul className={styles.keyList}>
            {primaryKeys.map((key) => {
              const valueKey = game.attributes[key];
              return (
                <li key={key} style={{ "--c": attributeInk(valueKey), "--v": valueKey } as CSSProperties}>
                  <span>{ATTRIBUTE_LABELS[key]}</span>
                  <b className={styles.num}>{valueKey}</b>
                  <i aria-hidden="true" />
                </li>
              );
            })}
          </ul>
        </section>

        <section className={styles.roleBlock} aria-labelledby="jogador-funcao">
          <div className={styles.roleHead}>
            <span className={styles.posChip} style={{ "--z": ZONE_INK[position.zone] } as CSSProperties} aria-hidden="true">
              <b>{game.position}</b>
            </span>
            <div>
              <BlockTitle id="jogador-funcao">Função em campo</BlockTitle>
              <p>{position.name}. Quanto mais velho e mais longe da função atual, maior o risco de o treinador recusar.</p>
            </div>
          </div>
          <Stamp
            className={styles.roleToggle}
            disabled={cooldown}
            aria-expanded={positionChange.open}
            onClick={() => {
              positionChange.setOpen((open) => !open);
              positionChange.setFeedback(null);
            }}
          >
            {cooldown ? "Tentativa usada nesta temporada" : positionChange.open ? "Fechar as posições" : "Tentar mudar de posição"}
          </Stamp>
          {positionChange.open && !cooldown && (
            <div className={styles.picker}>
              <div className={styles.chips} role="group" aria-label="Escolha a nova posição">
                {POSITIONS.filter((item) => item.key !== game.position).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.chip}
                    style={{ "--z": ZONE_INK[item.zone] } as CSSProperties}
                    aria-pressed={positionChange.target === item.key}
                    onClick={() => positionChange.setTarget(item.key)}
                  >
                    <b>{item.key}</b>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              <Stamp variant="primary" disabled={!positionChange.target} onClick={positionChange.attempt}>
                {positionChange.target ? `Pedir para jogar de ${positionByKey(positionChange.target).name.toLocaleLowerCase("pt-BR")}` : "Escolha uma posição"}
              </Stamp>
            </div>
          )}
          {positionChange.feedback && (
            <div className={styles.feedback} data-tone={positionChange.feedback.success ? "up" : "down"} role="status">
              <Seal text={positionChange.feedback.success ? "aceito" : "recusado"} tone={positionChange.feedback.success ? "green" : "red"} />
              <div>
                <strong>{positionChange.feedback.headline}</strong>
                <p>{positionChange.feedback.text}</p>
              </div>
            </div>
          )}
        </section>
        </div>
      </AlbumPage>

      {/* ───────────── página dos atributos ───────────── */}
      <AlbumPage side="right" label="Atributos, vida fora de campo e prontuário">
        <header className={styles.rightHead}>
          <h2 className={styles.rightTitle}>Atributos de campo</h2>
          <p>Mudam a simulação: finalização vira gol, passe e visão viram assistência, fôlego vira jogo.</p>
        </header>

        <div className={styles.groups}>
          {ATTRIBUTE_GROUPS.map((group) => (
            <section key={group.label} className={styles.group} aria-label={sentence(group.label)}>
              <BlockTitle as="h4">{sentence(group.label)}</BlockTitle>
              <ul>
                {group.keys.map((key) => {
                  const valueKey = game.attributes[key];
                  const primary = primaryKeys.includes(key);
                  return (
                    <li key={key} data-primary={primary ? "" : undefined} style={{ "--c": attributeInk(valueKey), "--v": valueKey } as CSSProperties}>
                      <span>{ATTRIBUTE_LABELS[key]}{primary && <em aria-label="atributo-chave"> ●</em>}</span>
                      <i aria-hidden="true" />
                      <b className={styles.num}>{valueKey}</b>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className={styles.lowerRow}>
          <section className={styles.offField} aria-labelledby="jogador-fora">
            <BlockTitle id="jogador-fora">Fora de campo</BlockTitle>
            <button type="button" className={styles.followers} onClick={() => setReachOpen(true)}>
              <span className={styles.followersIcon} aria-hidden="true"><FutboboIcon name="microphone" /></span>
              <span>
                <b className={styles.num}>{formatFollowers(game.followers)}</b>
                <small>seguidores</small>
              </span>
              <em>Ver alcance</em>
            </button>
            <Ficha
              rows={[
                {
                  label: "Patrocínio",
                  value: game.activeSponsor
                    ? `${game.activeSponsor.brand}, ${formatMoney(game.activeSponsor.annualValue)}/ano`
                    : "Sem patrocinador",
                },
                ...(game.activeSponsor ? [{ label: "Restam", value: `${Math.max(0, game.activeSponsor.endSeason - game.season)} temporada${Math.max(0, game.activeSponsor.endSeason - game.season) === 1 ? "" : "s"}` }] : []),
                { label: "Parcerias concluídas", value: game.sponsorHistory.length },
                { label: "Em contratos", value: sponsorTotal > 0 ? formatMoney(sponsorTotal) : "—" },
                { label: "Valor de mercado", value: formatMoney(value) },
              ]}
            />
          </section>

          <section className={styles.medical} aria-labelledby="jogador-prontuario">
            <header>
              <span className={styles.cross} aria-hidden="true"><FutboboIcon name="medical" /></span>
              <BlockTitle id="jogador-prontuario">Prontuário</BlockTitle>
            </header>
            <dl className={styles.medicalNums}>
              <div data-tone={medical.length ? "down" : "up"}><dt>Lesões sérias</dt><dd className={styles.num}>{medical.length}</dd></div>
              <div><dt>Jogos perdidos</dt><dd className={styles.num}>{game.matchesMissedInjuries}</dd></div>
              <div data-tone="up"><dt>Anos sem lesão</dt><dd className={styles.num}>{game.injuryFreeSeasons}</dd></div>
            </dl>
            {medical.length ? (
              <ul className={styles.medicalList}>
                {medical.slice(0, 5).map((record) => (
                  <li key={record.id}>
                    <b className={styles.num}>{record.season}</b>
                    <span>
                      <strong>{record.name}</strong>
                      <small>{record.recoveryMonths} meses, {record.matchesMissed} jogos fora{record.recurring ? ", voltou a doer" : ""}</small>
                    </span>
                    <em data-severity={record.severity}>{record.severity}</em>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.empty}>Nenhuma lesão séria até aqui.</p>}
          </section>
        </div>
      </AlbumPage>

      {reachOpen && typeof document !== "undefined" && createPortal(<ReachSheet game={game} onClose={() => setReachOpen(false)} />, document.getElementById(ALBUM_OVERLAY_ID) ?? document.body)}
    </>
  );
}
