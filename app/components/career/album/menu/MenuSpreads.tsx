"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { CLUBS } from "../../../../game-data";
import type { CareerHallEntry } from "../../../../career/model";
import type { GlobalAchievementUnlock } from "../../../../career/save-system";
import type { HallLegacySummary } from "../../../../career/legacy-prestige";
import { ACHIEVEMENTS } from "../../../../mega-expansion";
import FutboboIcon from "../../../FutboboIcon";
import { ClubBadge } from "../../CareerPrimitives";
import AlbumShell, { AlbumPage, albumStyles } from "../AlbumShell";
import { Ficha, InkBand, PlayerSticker, Stamp } from "../primitives";
import AlbumSheet from "../sheets/AlbumSheet";
import styles from "./menu.module.css";
import pageStyles from "./pages.module.css";

const ALBUM_INK = { primary: "#0b5cad", secondary: "#e0262f" };

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className={pageStyles.back} onClick={onBack}>
      <FutboboIcon name="arrow-left" /> Menu
    </button>
  );
}

/* ═════════════ Hall da Fama ═════════════ */

export type HallRow = { entry: CareerHallEntry; legacy: HallLegacySummary };

export function HallSpread({ rows, onBack, onOpen }: { rows: HallRow[]; onBack: () => void; onOpen: (entry: CareerHallEntry) => void }) {
  const top = rows[0];
  const topClub = top ? CLUBS.find((club) => club.id === top.entry.finalClubId) : undefined;
  return (
    <AlbumShell club={topClub ?? ALBUM_INK} tab={null} onTab={() => undefined} showTabs={false} centered label="Hall da Fama">
      <AlbumPage side="left" label="Hall da Fama">
        <BackLink onBack={onBack} />
        <InkBand ink="ink" title="Hall da Fama" subtitle="Carreiras que chegaram ao fim." />
        {top ? (
          <div className={pageStyles.legend}>
            <button type="button" className={styles.stickerButton} onClick={() => onOpen(top.entry)} aria-label={`Abrir carreira completa de ${top.entry.name}`}>
              <PlayerSticker
                className={pageStyles.legendSticker}
                name={top.entry.name}
                number={top.entry.snapshot?.number ?? 10}
                overall={top.entry.peakOverall}
                subtitle={`${top.entry.position} · ${top.entry.seasons} temporadas`}
                club={topClub}
                kit={topClub ? undefined : ALBUM_INK}
                appearance={top.entry.snapshot?.playerAppearance ?? null}
                tilt="-2.4deg"
              />
            </button>
            <div className={pageStyles.legendInfo}>
              <p className={pageStyles.legendRank}><b>1º</b> do álbum</p>
              <Ficha
                rows={[
                  { label: "Legado", value: <span style={{ color: top.legacy.color === "#ffc72c" ? undefined : top.legacy.color }}>{top.legacy.score} · {top.legacy.label}</span> },
                  { label: "Temporadas", value: top.entry.seasons },
                  { label: "Títulos", value: top.entry.trophies },
                  { label: "Bolas de Ouro", value: top.entry.ballonDor },
                  { label: "Gols", value: top.entry.goals },
                ]}
              />
              <Stamp variant="primary" onClick={() => onOpen(top.entry)}>Abrir carreira</Stamp>
            </div>
          </div>
        ) : (
          <div className={pageStyles.emptyBlock}>
            <span className={`${styles.emptySlot} ${pageStyles.emptyHall}`} aria-hidden="true"><FutboboIcon name="hall" /></span>
            <p className={styles.lead}>Nenhuma carreira encerrada ainda. Quando uma história terminar, a figurinha dela vem para cá.</p>
          </div>
        )}
      </AlbumPage>
      <AlbumPage side="right" label="Ranking">
        <h2 className={pageStyles.pageTitle}>Ranking</h2>
        {rows.length > 0 ? (
          <ol className={pageStyles.rank}>
            {rows.map(({ entry, legacy }, index) => {
              const club = CLUBS.find((item) => item.id === entry.finalClubId);
              return (
                <li key={entry.id}>
                  <button type="button" onClick={() => onOpen(entry)} aria-label={`Abrir carreira completa de ${entry.name}`}>
                    <b className={pageStyles.rankNo}>{index + 1}</b>
                    <span className={pageStyles.rankCrest}>{club ? <ClubBadge club={club} size="sm" /> : null}</span>
                    <span className={pageStyles.rankText}>
                      <strong>{entry.name}</strong>
                      <small>{entry.position} · {entry.seasons} temporadas · pico {entry.peakOverall}</small>
                      <small>{legacy.signature}</small>
                    </span>
                    <span className={pageStyles.rankScore}><b className={styles.num}>{legacy.score}</b><small>{legacy.label}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <>
            <ol className={pageStyles.rank} aria-label="Lugares vazios">
              {[1, 2, 3].map((place) => (
                <li key={place} className={pageStyles.rankEmpty}><b className={pageStyles.rankNo}>{place}</b><span /></li>
              ))}
            </ol>
            <p className={pageStyles.note}>Prêmios e títulos grandes pesam de verdade. Quantidade sozinha não ganha da história.</p>
          </>
        )}
      </AlbumPage>
    </AlbumShell>
  );
}

/* ═════════════ Conquistas ═════════════ */

const RARITIES = ["comum", "raro", "épico", "lendário"] as const;
const RARITY_INK: Record<string, string> = { comum: "var(--blue)", raro: "var(--green)", "épico": "var(--red)", "lendário": "var(--yellow-deep)" };

export function AchievementsSpread({ unlocks, onBack }: { unlocks: GlobalAchievementUnlock[]; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState("");
  const map = new Map(unlocks.map((item) => [item.achievementId, item]));
  const unlockedCount = ACHIEVEMENTS.filter((item) => map.has(item.id)).length;
  const recent = [...unlocks].filter((item) => ACHIEVEMENTS.some((a) => a.id === item.achievementId)).sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0)).slice(0, 3);
  const selectedIndex = ACHIEVEMENTS.findIndex((item) => item.id === selectedId);
  const selected = selectedIndex >= 0 ? ACHIEVEMENTS[selectedIndex] : null;
  const selectedUnlock = selected ? map.get(selected.id) : undefined;
  const hidden = (rarity: string, unlocked: boolean) => rarity === "lendário" && !unlocked;

  return (
    <AlbumShell club={ALBUM_INK} tab={null} onTab={() => undefined} showTabs={false} centered label="Conquistas">
      <AlbumPage side="left" label="Conquistas">
        <BackLink onBack={onBack} />
        <InkBand ink="mustard" title="Conquistas" subtitle={`${unlockedCount} de ${ACHIEVEMENTS.length} figurinhas coladas`} />
        <div className={pageStyles.progress} role="img" aria-label={`${unlockedCount} de ${ACHIEVEMENTS.length}`}>
          <i style={{ "--v": ACHIEVEMENTS.length ? (unlockedCount / ACHIEVEMENTS.length) * 100 : 0 } as CSSProperties} />
        </div>
        <Ficha
          rows={RARITIES.map((rarity) => {
            const all = ACHIEVEMENTS.filter((item) => item.rarity === rarity);
            return { label: <span className={pageStyles.rarity} style={{ "--rarity": RARITY_INK[rarity] } as CSSProperties}>{rarity}</span>, value: `${all.filter((item) => map.has(item.id)).length}/${all.length}` };
          })}
        />
        <p className={pageStyles.note}>Uma vez conquistada, a figurinha fica no Futbobo mesmo se a carreira original for apagada.</p>
        {recent.length > 0 && (
          <section className={pageStyles.recent} aria-labelledby="recent-title">
            <h3 id="recent-title" className={styles.smallTitle}>Coladas por último</h3>
            <ul>
              {recent.map((item) => {
                const achievement = ACHIEVEMENTS.find((a) => a.id === item.achievementId);
                if (!achievement) return null;
                return (
                  <li key={item.achievementId}>
                    <button type="button" onClick={() => setSelectedId(achievement.id)}>
                      <strong>{achievement.title}</strong>
                      <small>{item.playerName}{item.unlockedAt ? ` · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(item.unlockedAt)}` : ""}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </AlbumPage>
      <AlbumPage side="right" label="Figurinhas">
        <ul className={pageStyles.stickers}>
          {ACHIEVEMENTS.map((achievement, index) => {
            const unlocked = map.has(achievement.id);
            const secret = hidden(achievement.rarity, unlocked);
            return (
              <li key={achievement.id}>
                <button
                  type="button"
                  className={pageStyles.ach}
                  data-on={unlocked ? "" : undefined}
                  data-rarity={achievement.rarity}
                  style={{ "--rarity": RARITY_INK[achievement.rarity], "--r": `${[-1.4, .8, -.4, 1.2][index % 4]}deg` } as CSSProperties}
                  onClick={() => setSelectedId(achievement.id)}
                  aria-label={`${secret ? "Conquista secreta" : achievement.title}: ${unlocked ? "desbloqueada" : "bloqueada"}`}
                >
                  <span className={pageStyles.achArt}><b className={styles.num}>{index + 1}</b></span>
                  <strong>{secret ? "Conquista secreta" : achievement.title}</strong>
                  <small>{achievement.rarity}</small>
                </button>
              </li>
            );
          })}
        </ul>
      </AlbumPage>
      {selected && (
        <AlbumSheet
          ink={selected.rarity === "lendário" ? "yellow" : selected.rarity === "épico" ? "red" : selected.rarity === "raro" ? "green" : "blue"}
          club={ALBUM_INK}
          titleId="achievement-title"
          kicker={`Figurinha ${selectedIndex + 1} · ${selected.rarity}`}
          title={selectedUnlock || selected.rarity !== "lendário" ? selected.title : "Conquista secreta"}
          onDismiss={() => setSelectedId("")}
        >
          <p className={pageStyles.sheetText}>{selectedUnlock || selected.rarity !== "lendário" ? selected.description : "Continue jogando para descobrir."}</p>
          {selectedUnlock ? (
            <div className={pageStyles.unlock}>
              {selectedUnlock.clubId && CLUBS.some((club) => club.id === selectedUnlock.clubId) ? <ClubBadge club={CLUBS.find((club) => club.id === selectedUnlock.clubId)!} size="sm" /> : null}
              <span>
                <strong>{selectedUnlock.playerName}</strong>
                <small>{selectedUnlock.position} · colada {selectedUnlock.unlockedAt ? `em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(selectedUnlock.unlockedAt)}` : "antes desta atualização"}</small>
              </span>
            </div>
          ) : (
            <p className={pageStyles.note}>Ainda sem figurinha. O espaço fica esperando.</p>
          )}
        </AlbumSheet>
      )}
    </AlbumShell>
  );
}

/* ═════════════ folhas soltas: Configurações, Instalar, Novidades, Outros jogos ═════════════ */

/** Uma folha de papel presa com fita sobre a mesa (as telas utilitárias do menu). */
export function PaperScreen({ label, onBack, children }: { label: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className={`${albumStyles.tokens} ${pageStyles.desk} albumMounted`}>
      <article className={pageStyles.paper} aria-label={label}>
        <span className={pageStyles.tape} data-side="left" aria-hidden="true" />
        <span className={pageStyles.tape} data-side="right" aria-hidden="true" />
        <BackLink onBack={onBack} />
        {children}
      </article>
    </div>
  );
}

export function OtherGames() {
  const games = [
    { href: "https://erereck.github.io/gamebobo", title: "Gamebobo", tag: "Simulador", text: "Crie jogos, evolua seu estúdio e tente dominar gerações inteiras." },
    { href: "https://erereck.github.io/pokebobo", title: "Pokebobo", tag: "Pokémon", text: "Monte sua carreira de treinador e avance cidade por cidade." },
    { href: "https://mmmweb.vercel.app", title: "Muito, Muito Minimalista", tag: "Minimalista", text: "Abra o MMM Web e jogue direto pelo navegador." },
    { href: "https://erereck.github.io/bobobike/", title: "Bobobike", tag: "Obby infinito", text: "Encare pistas procedurais de BMX, scooter ou patinete e bata seu recorde de distância." },
    { href: "https://erereck.github.io/boboforces", title: "Boboforces", tag: "FPS", text: "FPS de arena em desenvolvimento, com bots e partidas rápidas." },
    { href: "https://bobobox-eta.vercel.app", title: "Bobobox", tag: "Party game", text: "Abra na TV e reúna a galera para jogar minigames usando os celulares." },
  ];
  return (
    <section className={pageStyles.other}>
      <header className={pageStyles.otherHead}>
        <h2>Outros jogos.</h2>
        <p>Mais projetos da Erilab para abrir e jogar direto no navegador.</p>
      </header>
      <ul className={styles.toc}>
        {games.map((game, index) => (
          <li key={game.href}>
            <a className={styles.tocRow} href={game.href} target="_blank" rel="noreferrer" data-ink={["blue", "red", "green", "mustard"][index % 4]}>
              <span className={styles.tocChip} aria-hidden="true" style={{ "--tilt": "-3deg" } as CSSProperties}><b className={pageStyles.otherNo}>{index + 1}</b></span>
              <span className={styles.tocMain}>
                <span className={styles.tocLine}><strong>{game.title}</strong><i aria-hidden="true" /><em>{game.tag}</em></span>
                <small>{game.text}</small>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ═════════════ folhas do menu (excluir carreira) ═════════════ */

export function DeleteCareerSheet({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <AlbumSheet
      ink="red"
      club={ALBUM_INK}
      titleId="delete-career-title"
      kicker={name}
      title="Excluir carreira"
      onDismiss={onCancel}
      footer={(
        <>
          <Stamp onClick={onCancel}>Cancelar</Stamp>
          <Stamp variant="danger" onClick={onConfirm}>Excluir</Stamp>
        </>
      )}
    >
      <p className={pageStyles.sheetText}>Essa história vai desaparecer do aparelho.</p>
      <p className={pageStyles.note}>Conquistas globais que já foram desbloqueadas continuam na sua coleção.</p>
    </AlbumSheet>
  );
}
