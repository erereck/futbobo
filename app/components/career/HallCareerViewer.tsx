"use client";

import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { countryById } from "../../game-data";
import type { CareerHallEntry, GameState } from "../../career/model";
import { archivedCareerState, initialState } from "../../career/state";
import { clubById } from "../../career/shared";
import { positionByKey } from "../../career/academy";
import { ClubBadge } from "./CareerPrimitives";
import FutboboIcon from "../FutboboIcon";
import AlbumShell, { AlbumPage, type AlbumTabId } from "./album/AlbumShell";
import { BlockTitle, Ficha, InkBand, PlayerSticker, Stamp } from "./album/primitives";
import PlayerTab from "./album/tabs/PlayerTab";
import TeamTab from "./album/tabs/TeamTab";
import HistoryTab from "./album/tabs/HistoryTab";
import StatsTab from "./album/tabs/StatsTab";
import WorldTab from "./album/tabs/WorldTab";
import styles from "./album/summary.module.css";

type HallCareerViewerProps = {
  entry: CareerHallEntry;
  onBack: () => void;
  onGenerateCard: () => void;
};

type ArchivePanelBoundaryProps = {
  children: ReactNode;
  label: string;
};

function safeText(value: unknown, fallback = "—") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Uma aba que quebra num save antigo vira um recado na página; o resto do arquivo segue aberto. */
class ArchivePanelBoundary extends Component<ArchivePanelBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(`[Futbobo] Falha ao renderizar painel arquivado: ${this.props.label}`, error);
  }

  render() {
    if (this.state.failed) {
      return (
        <AlbumPage side="left" label={this.props.label}>
          <BlockTitle>{this.props.label} indisponível neste arquivo</BlockTitle>
          <p className={styles.note}>O restante da carreira continua aberto, e a última página ainda pode ser gerada.</p>
        </AlbumPage>
      );
    }
    return this.props.children;
  }
}

type ArchiveRootBoundaryProps = HallCareerViewerProps & {
  children: ReactNode;
};

/** Modo de segurança: se o arquivo inteiro falhar, os números do Hall continuam visíveis. */
class ArchiveRootBoundary extends Component<ArchiveRootBoundaryProps, { error: string }> {
  state = { error: "" };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : safeText(error, "Erro desconhecido ao abrir o arquivo") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[Futbobo] Falha fatal contida no visualizador do Hall.", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { entry, onBack, onGenerateCard } = this.props;
    const club = clubById(safeText(entry.finalClubId, ""));
    return (
      <AlbumShell club={club} tab={null} onTab={() => undefined} showTabs={false} centered label="Arquivo recuperado">
        <AlbumPage side="left" label="Arquivo recuperado">
          <button type="button" className={styles.back} onClick={onBack}><FutboboIcon name="arrow-left" /> Voltar ao Hall da Fama</button>
          <InkBand ink="club" title={safeText(entry.name, "Carreira arquivada")} subtitle="Arquivo recuperado, só para ver" crest={{ club }} />
          <Ficha
            rows={[
              { label: "Legado", value: `${safeNumber(entry.legacyPoints)} · ${safeText(entry.legacyLabel, "Carreira encerrada")}` },
              { label: "Temporadas", value: safeNumber(entry.seasons) },
              { label: "Pico OVR", value: safeNumber(entry.peakOverall) },
              { label: "Taças", value: safeNumber(entry.trophies) },
              { label: "Bolas de Ouro", value: safeNumber(entry.ballonDor) },
            ]}
          />
          <Stamp variant="primary" onClick={onGenerateCard}>Abrir a última página</Stamp>
        </AlbumPage>
        <AlbumPage side="right" label="O que aconteceu">
          <BlockTitle>Erro contido</BlockTitle>
          <p className={styles.note}>{safeText(this.state.error, "falha de renderização")}. Um dado incompatível tentou derrubar o arquivo, e a carreira continua acessível em modo de segurança.</p>
        </AlbumPage>
      </AlbumShell>
    );
  }
}

function emergencyArchiveState(entry: CareerHallEntry): GameState {
  const base = initialState();
  return {
    ...base,
    phase: "summary",
    name: safeText(entry.name, base.name),
    position: entry.position,
    nationality: safeText(entry.nationality, base.nationality),
    currentClubId: safeText(entry.finalClubId, base.currentClubId || base.academyClubId),
    overall: safeNumber(entry.peakOverall, base.overall),
    potential: Math.max(base.potential, safeNumber(entry.peakOverall, base.overall)),
    age: Math.max(base.age, base.age + safeNumber(entry.seasons)),
    season: base.season + Math.max(0, safeNumber(entry.seasons) - 1),
    stats: {
      ...base.stats,
      appearances: safeNumber(entry.appearances),
      goals: safeNumber(entry.goals),
      assists: safeNumber(entry.assists),
    },
    trophies: safeNumber(entry.trophies),
    awards: safeNumber(entry.awards),
    awardCabinet: {
      ...base.awardCabinet,
      "Bola de Ouro": safeNumber(entry.ballonDor),
    },
    legacyPoints: safeNumber(entry.legacyPoints),
    retireAfterSeason: true,
  };
}

/**
 * A carreira arquivada no Hall da Fama vira o próprio álbum dela: capa com a figurinha final e as
 * mesmas abas da carreira (Jogador, Time, Histórico, Estatísticas, Mundo), só para ver.
 */
function HallCareerViewerContent({ entry, onBack, onGenerateCard }: HallCareerViewerProps) {
  const archive = useMemo(() => {
    try {
      return archivedCareerState(entry);
    } catch (error) {
      console.error("[Futbobo] Snapshot do Hall inválido; usando recuperação de emergência.", error);
      try {
        return archivedCareerState({ ...entry, snapshot: undefined });
      } catch (legacyError) {
        console.error("[Futbobo] Recuperação legada do Hall falhou.", legacyError);
        return { state: emergencyArchiveState(entry), legacyArchive: true };
      }
    }
  }, [entry]);
  const state = archive.state;
  const [tab, setTab] = useState<AlbumTabId>("event");
  const history = (Array.isArray(state.history) ? state.history : []).filter(Boolean);
  const newsFeed = (Array.isArray(state.newsFeed) ? state.newsFeed : []).map((headline) => safeText(headline, "Registro arquivado"));
  const currentClub = clubById(safeText(state.currentClubId || state.academyClubId || entry.finalClubId, ""));
  const nation = countryById(safeText(state.nationality || entry.nationality, "brasil"));
  const position = positionByKey(state.position);
  const peakOverall = Math.max(safeNumber(state.overall), ...history.map((record) => safeNumber(record?.overall)), safeNumber(entry.peakOverall), 0);
  const totalTitles = safeNumber(state.trophies) + safeNumber(state.nationalTrophies);
  const clubs = Array.from(new Set(history.map((record) => safeText(record?.clubId, "")).filter(Boolean)));
  const stats = state.stats && typeof state.stats === "object" ? state.stats : initialState().stats;
  const goalkeeper = state.position === "GOL";
  const playerName = safeText(state.name, safeText(entry.name, "Jogador"));
  const legacyLabel = safeText(entry.legacyLabel, "Carreira encerrada");
  const numbers = [
    { label: "jogos", value: safeNumber(stats.appearances) },
    { label: goalkeeper ? "sem sofrer" : "gols", value: safeNumber(goalkeeper ? stats.cleanSheets : stats.goals) },
    { label: goalkeeper ? "sofridos" : "assistências", value: safeNumber(goalkeeper ? stats.goalsConceded : stats.assists) },
    { label: totalTitles === 1 ? "taça" : "taças", value: totalTitles },
  ];

  return (
    <AlbumShell club={currentClub} tab={tab} onTab={setTab} showTabs label={`Carreira arquivada de ${playerName}`}>
      {tab === "event" && (
        <>
          <AlbumPage side="left" label="Carreira arquivada" className={styles.left}>
            <button type="button" className={styles.back} onClick={onBack}><FutboboIcon name="arrow-left" /> Voltar ao Hall da Fama</button>
            {archive.legacyArchive && (
              <p className={styles.note}>Registro anterior ao arquivo completo: os números gerais voltaram, alguns detalhes não existiam no save antigo.</p>
            )}
            <InkBand ink="club" title={playerName} subtitle={`${legacyLabel} · carreira arquivada`} crest={{ club: currentClub }} />
            <div className={styles.hero}>
              <PlayerSticker
                className={styles.sticker}
                name={playerName}
                number={safeNumber(state.number, 10)}
                overall={peakOverall}
                subtitle={`${position.name} · ${nation.name}`}
                club={currentClub}
                appearance={state.playerAppearance ?? null}
                tilt="-2.6deg"
              />
              <div className={styles.heroInfo}>
                <p className={styles.legacy}><b className={styles.num}>{safeNumber(entry.legacyPoints)}</b> de legado<span>{legacyLabel}</span></p>
                <Ficha
                  rows={[
                    { label: "Temporadas", value: safeNumber(entry.seasons, history.length) },
                    { label: "Clubes", value: clubs.length || 1 },
                    { label: "Bolas de Ouro", value: safeNumber(entry.ballonDor) },
                    { label: "Prêmios", value: safeNumber(entry.awards) },
                  ]}
                />
              </div>
            </div>
            <ul className={styles.numbers}>
              {numbers.map((item) => <li key={item.label}><b className={styles.num}>{item.value}</b><span>{item.label}</span></li>)}
            </ul>
            <Stamp variant="primary" onClick={onGenerateCard}>Abrir a última página e o pôster</Stamp>
          </AlbumPage>
          <AlbumPage side="right" label="Manchetes e temporadas" className={styles.right}>
            <section className={styles.block}>
              <BlockTitle>Temporada por temporada</BlockTitle>
              {history.length > 0 ? (
                <ol className={styles.ledger}>
                  {[...history].reverse().map((record) => (
                    <li key={`${record.season}-${record.clubId}`}>
                      <b className={styles.num}>{safeNumber(record.season)}</b>
                      <span>
                        <strong>{safeText(clubById(safeText(record.clubId, "")).shortName, "Clube")} · {safeNumber(record.appearances)} jogos</strong>
                        <small>{record.position === "GOL" ? `${safeNumber(record.cleanSheets)} sem sofrer` : `${safeNumber(record.goals)} gols · ${safeNumber(record.assists)} assist.`}</small>
                      </span>
                      <em className={styles.num}>{safeNumber(record.overall)}</em>
                    </li>
                  ))}
                </ol>
              ) : <p className={styles.note}>Nenhuma temporada profissional foi registrada.</p>}
            </section>
            {newsFeed.length > 0 && (
              <section className={styles.block}>
                <BlockTitle>Manchetes da carreira</BlockTitle>
                <ol className={styles.story}>
                  {newsFeed.slice(0, 8).map((headline, index) => (
                    <li key={`${index}-${headline}`}><b className={styles.num}>{index + 1}</b><span><strong>{headline}</strong></span></li>
                  ))}
                </ol>
              </section>
            )}
            {clubs.length > 0 && (
              <section className={styles.path} aria-label="Caminho da carreira">
                <BlockTitle>Caminho</BlockTitle>
                <div className={styles.pathRow}>
                  {clubs.map((clubId) => <span className={styles.pathCrest} key={clubId}><ClubBadge club={clubById(clubId)} size="sm" /></span>)}
                </div>
              </section>
            )}
          </AlbumPage>
        </>
      )}
      {tab === "profile" && (
        <ArchivePanelBoundary label="Jogador">
          <PlayerTab game={state} club={currentClub} showAppearance={false} onEditAppearance={() => undefined} />
        </ArchivePanelBoundary>
      )}
      {tab === "team" && <ArchivePanelBoundary label="Time"><TeamTab game={state} club={currentClub} /></ArchivePanelBoundary>}
      {tab === "history" && <ArchivePanelBoundary label="Histórico"><HistoryTab game={state} club={currentClub} /></ArchivePanelBoundary>}
      {tab === "stats" && <ArchivePanelBoundary label="Estatísticas"><StatsTab game={state} club={currentClub} /></ArchivePanelBoundary>}
      {tab === "world" && <ArchivePanelBoundary label="Mundo"><WorldTab game={state} club={currentClub} /></ArchivePanelBoundary>}
    </AlbumShell>
  );
}

export default function HallCareerViewer(props: HallCareerViewerProps) {
  return (
    <ArchiveRootBoundary {...props}>
      <HallCareerViewerContent {...props} />
    </ArchiveRootBoundary>
  );
}
