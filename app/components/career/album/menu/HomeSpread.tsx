"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CLUBS, COUNTRIES, LEAGUES } from "../../../../game-data";
import type { CareerSaveMeta } from "../../../../career/save-system";
import { FUTBOBO_VERSION, FUTBOBO_VERSION_NAME } from "../../../../version";
import FutboboIcon from "../../../FutboboIcon";
import type { FutboboIconName } from "../../../FutboboIcon";
import { BrandMark } from "../../CareerPrimitives";
import AlbumShell, { AlbumPage } from "../AlbumShell";
import { Ficha, PlayerSticker, Stamp } from "../primitives";
import styles from "./menu.module.css";

export type MenuScreen = "hall" | "achievements" | "settings" | "install" | "news" | "other-games";

const ALBUM_INK = { primary: "#0b5cad", secondary: "#e0262f" };

export function formatLastPlayed(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(timestamp);
}

const inCreation = (meta: CareerSaveMeta) => ["welcome", "identity", "appearance", "nationality", "academy", "formation", "story"].includes(meta.phase);

/** A figurinha de uma carreira salva, com a camisa do clube atual. */
function SaveSticker({ meta, size, tilt, className }: { meta: CareerSaveMeta; size: "lg" | "sm"; tilt: string; className?: string }) {
  const club = CLUBS.find((item) => item.id === meta.clubId);
  const started = !inCreation(meta);
  return (
    <PlayerSticker
      className={className}
      name={meta.name || "Nova carreira"}
      number={meta.number ?? 10}
      overall={started ? meta.overall : null}
      subtitle={club ? `${club.shortName} · ${meta.season}` : "Em criação"}
      club={club}
      kit={club ? undefined : ALBUM_INK}
      appearance={meta.appearance ?? null}
      size={size}
      tilt={tilt}
    />
  );
}

type IndexEntry = { href: string; title: string; text: string; tag: string; icon: FutboboIconName; ink: string; locked?: boolean };

const MODES: IndexEntry[] = [
  { href: "/copa", title: "Copa do Mundo", text: "Jogue uma Copa do Mundo rápida com qualquer seleção.", tag: "Partida rápida", icon: "globe", ink: "green" },
  { href: "/x1", title: "1x1 Local", text: "Jogue uma partida de futebol de botão contra o seu amigo.", tag: "Dois jogadores", icon: "ball", ink: "red" },
  { href: "/bobonline", title: "Bobonline", text: "Monte seu time e jogue online com os amigos.", tag: "Online", icon: "team", ink: "blue" },
];

/**
 * Menu inicial como a primeira folha do álbum: à esquerda o modo carreira com a sua figurinha
 * (continuar é um toque), à direita o índice com os outros modos e o resto do álbum.
 */
export default function HomeSpread({
  saves,
  unlocked,
  totalAchievements,
  bobonlineRoom,
  onOpen,
  onNew,
  onDelete,
  onScreen,
  children,
}: {
  saves: CareerSaveMeta[];
  unlocked: number;
  totalAchievements: number;
  bobonlineRoom: { code: string } | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onScreen: (screen: MenuScreen) => void;
  /** Folhas por cima do menu (senha, excluir, convite do 3D). */
  children?: ReactNode;
}) {
  const [current, ...others] = saves;
  const currentClub = current ? CLUBS.find((item) => item.id === current.clubId) : undefined;
  const extras: Array<{ id: MenuScreen; label: string; icon: FutboboIconName; note?: string }> = [
    { id: "hall", label: "Hall da Fama", icon: "hall" },
    { id: "achievements", label: "Conquistas", icon: "medal", note: `${unlocked}/${totalAchievements}` },
    { id: "news", label: "Novidades", icon: "news" },
    { id: "settings", label: "Configurações", icon: "settings" },
    { id: "install", label: "Instalar", icon: "download" },
    { id: "other-games", label: "Outros jogos", icon: "globe" },
  ];

  return (
    <AlbumShell club={currentClub ?? ALBUM_INK} tab={null} onTab={() => undefined} showTabs={false} centered label="Menu principal do Futbobo">
      <AlbumPage side="left" label="Rumo ao Estrelato" className={styles.homeLeft}>
        <header className={styles.masthead}>
          <BrandMark size="md" />
          <div>
            <h1>Futbobo</h1>
            <p>Faça sua história.</p>
          </div>
        </header>

        <section className={styles.career} aria-labelledby="home-career-title">
          <h2 id="home-career-title" className={styles.sectionTitle}>Rumo ao Estrelato</h2>
          {current ? (
            <div className={styles.current}>
              <button type="button" className={styles.stickerButton} onClick={() => onOpen(current.id)} aria-label={`Continuar a carreira de ${current.name}`}>
                <SaveSticker meta={current} size="lg" tilt="-2.6deg" className={styles.currentSticker} />
              </button>
              <div className={styles.currentInfo}>
                <p className={styles.mobileMeta}>{currentClub?.shortName ?? "Em criação"} · {current.season} · {formatLastPlayed(current.lastPlayedAt)}</p>
                <Ficha
                  className={styles.wideFicha}
                  rows={[
                    { label: "Clube", value: currentClub?.shortName ?? "Em criação" },
                    { label: "Temporada", value: current.season },
                    { label: "Posição", value: current.position },
                    { label: "Jogou", value: formatLastPlayed(current.lastPlayedAt) },
                  ]}
                />
                {current.pin && <p className={styles.lock}>Protegida por senha</p>}
                <Stamp variant="primary" onClick={() => onOpen(current.id)}>Continuar carreira</Stamp>
                <div className={styles.links}>
                  {/* no celular a nova carreira vira link aqui, para a folha caber sem rolar */}
                  <button type="button" className={`${styles.linkButton} ${styles.newLink}`} onClick={onNew}>+ Nova carreira</button>
                  <button type="button" className={styles.linkButton} onClick={() => onDelete(current.id)}>Excluir esta carreira</button>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.firstCareer}>
              <button type="button" className={styles.emptySlot} onClick={onNew} aria-label="Criar seu jogador">
                <span className={styles.slotPlus} aria-hidden="true">+</span>
                <span>Seu jogador</span>
              </button>
              <div className={styles.currentInfo}>
                <p className={styles.lead}>Crie seu jogador do zero, ganhe títulos e prêmios individuais.</p>
                <Stamp variant="primary" onClick={onNew}>Criar jogador</Stamp>
              </div>
            </div>
          )}

          {current && others.length === 0 && (
            <button type="button" className={styles.newWide} onClick={onNew}>
              <span className={styles.slotPlus} aria-hidden="true">+</span>
              <span><strong>Nova carreira</strong><small>Outro jogador, outra história. Esta fica salva.</small></span>
            </button>
          )}

          {current && others.length > 0 && (
            <div className={styles.more}>
              <h3 className={styles.smallTitle}>Outras carreiras</h3>
              <ul className={styles.saveRow}>
                <li className={styles.newSlotItem}>
                  <button type="button" className={`${styles.emptySlot} ${styles.emptySmall}`} onClick={onNew}>
                    <span className={styles.slotPlus} aria-hidden="true">+</span>
                    <span>Nova carreira</span>
                  </button>
                </li>
                {others.map((meta, index) => (
                  <li key={meta.id} className={styles.saveItem}>
                    <button type="button" className={styles.stickerButton} onClick={() => onOpen(meta.id)} aria-label={`Abrir a carreira de ${meta.name}`}>
                      <SaveSticker meta={meta} size="sm" tilt={index % 2 ? "1.6deg" : "-1.8deg"} />
                    </button>
                    <span className={styles.saveMeta}>{formatLastPlayed(meta.lastPlayedAt)}{meta.pin ? " · senha" : ""}</span>
                    <button type="button" className={styles.linkButton} onClick={() => onDelete(meta.id)} aria-label={`Excluir carreira de ${meta.name}`}>Excluir</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </AlbumPage>

      <AlbumPage side="right" label="Índice" className={styles.homeRight}>
        <h2 className={styles.indexTitle}>Índice</h2>
        {bobonlineRoom && (
          <Link className={styles.resume} href="/bobonline/?voltar=1">
            <FutboboIcon name="play" />
            <span><small>Bobonline</small><strong>Voltar para a sala {bobonlineRoom.code.slice(0, 3)}·{bobonlineRoom.code.slice(3)}</strong></span>
          </Link>
        )}
        <ul className={styles.toc}>
          {MODES.map((mode) => (
            <li key={mode.href}>
              <Link className={styles.tocRow} href={mode.href} data-ink={mode.ink}>
                <TocChip icon={mode.icon} />
                <span className={styles.tocMain}>
                  <span className={styles.tocLine}><strong>{mode.title}</strong><i aria-hidden="true" /><em>{mode.tag}</em></span>
                  <small>{mode.text}</small>
                </span>
              </Link>
            </li>
          ))}
          <li>
            <span className={styles.tocRow} data-ink="locked" aria-disabled="true">
              <TocChip icon="career" />
              <span className={styles.tocMain}>
                <span className={styles.tocLine}><strong>Carreira de Técnico</strong><i aria-hidden="true" /><em>Bloqueado</em></span>
                <small>Modo temporariamente indisponível.</small>
              </span>
            </span>
          </li>
        </ul>

        <section className={styles.extras} aria-labelledby="home-extras-title">
          <h3 id="home-extras-title" className={styles.smallTitle}>Também no álbum</h3>
          <ul>
            {extras.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onScreen(item.id)}>
                  <FutboboIcon name={item.icon} />
                  <span>{item.label}</span>
                  {item.note && <b className={styles.num}>{item.note}</b>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <footer className={styles.colophon}>
          <span>{CLUBS.length} clubes · 12 posições · {LEAGUES.length} ligas · {COUNTRIES.length} seleções</span>
          <b>{FUTBOBO_VERSION} · {FUTBOBO_VERSION_NAME}</b>
        </footer>
      </AlbumPage>
      {children}
    </AlbumShell>
  );
}

function TocChip({ icon }: { icon: FutboboIconName }) {
  return <span className={styles.tocChip} aria-hidden="true" style={{ "--tilt": "-3deg" } as CSSProperties}><FutboboIcon name={icon} /></span>;
}
