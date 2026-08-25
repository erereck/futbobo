"use client";

import { Component, useMemo, useState, type ReactNode } from "react";
import { countryById } from "../../game-data";
import type { CareerHallEntry, GameState } from "../../career/model";
import { ROLE_LABELS } from "../../career-systems";
import { archivedCareerState, initialState } from "../../career/state";
import { clubById } from "../../career/shared";
import { fanMood } from "../../career/performance";
import { positionByKey } from "../../career/academy";
import CareerTimeline from "./CareerTimeline";
import CareerExtraStats from "./CareerExtraStats";
import CareerWorld from "./CareerWorld";
import { CareerStatisticsArchive, PlayerReworkPanels } from "./CareerReworkPanels";
import { BrandMark, ClubBadge, Metric, NationBadge, Progress, TrophyGallery } from "./CareerPrimitives";
import FutboboIcon from "../FutboboIcon";

type ArchiveTab = "career" | "profile" | "history" | "stats" | "world";

type HallCareerViewerProps = {
  entry: CareerHallEntry;
  onBack: () => void;
  onGenerateCard: () => void;
};

type ArchivePanelBoundaryProps = {
  children: ReactNode;
  label: string;
};

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
        <div className="empty-panel">
          <strong>{this.props.label} indisponível neste arquivo.</strong>
          <span>O restante da carreira continua acessível e o card final ainda pode ser gerado.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function emergencyArchiveState(entry: CareerHallEntry): GameState {
  const base = initialState();
  return {
    ...base,
    phase: "summary",
    name: entry.name,
    position: entry.position,
    nationality: entry.nationality,
    currentClubId: entry.finalClubId,
    overall: entry.peakOverall,
    potential: Math.max(base.potential, entry.peakOverall),
    age: Math.max(base.age, base.age + entry.seasons),
    season: base.season + Math.max(0, entry.seasons - 1),
    stats: {
      ...base.stats,
      appearances: entry.appearances ?? 0,
      goals: entry.goals,
      assists: entry.assists,
    },
    trophies: entry.trophies,
    awards: entry.awards,
    awardCabinet: {
      ...base.awardCabinet,
      "Bola de Ouro": entry.ballonDor,
    },
    legacyPoints: entry.legacyPoints,
    retireAfterSeason: true,
  };
}

export default function HallCareerViewer({ entry, onBack, onGenerateCard }: HallCareerViewerProps) {
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
  const [activeTab, setActiveTab] = useState<ArchiveTab>("career");
  const history = Array.isArray(state.history) ? state.history : [];
  const newsFeed = Array.isArray(state.newsFeed) ? state.newsFeed : [];
  const currentClub = clubById(state.currentClubId || state.academyClubId || entry.finalClubId);
  const nation = countryById(state.nationality || entry.nationality);
  const position = positionByKey(state.position);
  const supporterMood = fanMood(Number.isFinite(state.fanSupport) ? state.fanSupport : 50);
  const peakOverall = Math.max(Number(state.overall) || 0, ...history.map((record) => Number(record.overall) || 0), Number(entry.peakOverall) || 0, 0);
  const totalTitles = (Number(state.trophies) || 0) + (Number(state.nationalTrophies) || 0);
  const clubs = new Set(history.map((record) => record.clubId).filter(Boolean)).size || 1;
  const stats = state.stats ?? initialState().stats;

  return (
    <main className="app-shell app-shell-career hall-archive-viewer">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="summary-preview-bar">
        <button type="button" onClick={onBack}>← Voltar ao Hall da Fama</button>
        <div><small>MODO DE VISUALIZAÇÃO</small><strong>Carreira encerrada de {state.name || entry.name}</strong></div>
        <button type="button" className="primary-button" onClick={onGenerateCard}>Gerar card <span>→</span></button>
      </div>

      {archive.legacyArchive && (
        <div className="summary-legacy-warning">
          Este registro precisou do modo de compatibilidade. O Futbobo recuperou todos os dados disponíveis sem deixar um campo antigo derrubar a carreira inteira.
        </div>
      )}

      <section className={`career-shell career-phase-career career-tab-${activeTab} screen-enter`}>
        <header className="career-header">
          <div className="club-identity"><ClubBadge club={currentClub} size="sm" /><span><small>{state.season}</small><strong>{currentClub.shortName}</strong></span></div>
          <div className="career-age"><strong>{state.age}</strong><span>ANOS</span></div>
          <div className="player-identity"><span><small>PICO</small><strong>{peakOverall}</strong></span><div className="mini-avatar">{state.position}</div></div>
        </header>

        <div className="career-bars career-bars-four">
          <Progress label="Moral" value={Number(state.morale) || 0} color="#2ca8ff" />
          <Progress label="Físico" value={Number(state.fitness) || 0} color={(Number(state.fitness) || 0) < 55 ? "#ff5a4e" : "#63e36b"} />
          <Progress label="Prestígio" value={Number(state.reputation) || 0} color="#ffc72c" />
          <Progress label={supporterMood.label} value={Number(state.fanSupport) || 0} color={supporterMood.color} />
        </div>

        <div className="career-status-strip retirement-open">
          <span><small>STATUS</small><strong>APOSENTADO</strong></span>
          <span><small>ÚLTIMO PAPEL</small><strong>{ROLE_LABELS[state.squadRole] ?? state.squadRole ?? "Arquivo"}</strong></span>
          <span><small>ÚLTIMO CLUBE</small><strong>{currentClub.shortName}</strong></span>
          <button className="retirement-trigger" type="button" onClick={onGenerateCard}><small>CARREIRA</small><strong><FutboboIcon name="trophy" /> Gerar card</strong></button>
        </div>

        {activeTab === "career" && (
          <div className="panel-screen screen-enter">
            <section className="legacy-hero">
              <span>CARREIRA ENCERRADA · SOMENTE VISUALIZAÇÃO</span>
              <strong style={{ color: "#f4c430" }}>{entry.legacyPoints}</strong>
              <h2>{entry.legacyLabel}</h2>
              <p>Este é o estado arquivado quando a carreira terminou. Não existe avanço de temporada, evento novo, transferência ou qualquer ação que altere o save.</p>
            </section>

            <div className="legacy-grid">
              <Metric label="Temporadas" value={history.length || entry.seasons} />
              <Metric label="Clubes" value={clubs} />
              <Metric label="Pico OVR" value={peakOverall} tone="gold" />
              <Metric label="Legado" value={state.legacyPoints || entry.legacyPoints} tone="green" />
            </div>

            <div className="career-total-card">
              <span>TOTAIS DA CARREIRA</span>
              <div>
                <Metric label="Jogos" value={stats.appearances ?? 0} />
                <Metric label={state.position === "GOL" ? "Sem sofrer" : "Gols"} value={state.position === "GOL" ? stats.cleanSheets ?? 0 : stats.goals ?? 0} />
                <Metric label={state.position === "GOL" ? "Sofridos" : "Assistências"} value={state.position === "GOL" ? stats.goalsConceded ?? 0 : stats.assists ?? 0} />
                <Metric label="Taças" value={totalTitles} tone="gold" />
              </div>
            </div>

            <ArchivePanelBoundary label="Sala de troféus"><TrophyGallery state={state} /></ArchivePanelBoundary>
            <ArchivePanelBoundary label="Estatísticas extras"><CareerExtraStats state={state} /></ArchivePanelBoundary>

            <div className="news-card">
              <span>ÚLTIMAS MANCHETES DA CARREIRA</span>
              {newsFeed.length
                ? newsFeed.slice(0, 8).map((headline, index) => <article key={`${headline}-${index}`}><small>{index === 0 ? "FINAL" : "ARQUIVO"}</small><strong>{headline}</strong></article>)
                : <p>Nenhuma manchete foi arquivada nesta carreira.</p>}
            </div>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="panel-screen screen-enter">
            <div className="profile-hero">
              <div className="academy-avatar"><span>{state.number}</span><small>{state.position}</small></div>
              <div><span>{state.archetype}</span><h2>{state.name}</h2><p>{position.style} · {state.foot}</p><small><NationBadge country={nation} size="sm" /> {nation.name}</small></div>
            </div>
            <ArchivePanelBoundary label="Perfil do jogador"><PlayerReworkPanels state={state} /></ArchivePanelBoundary>
            <ArchivePanelBoundary label="Estatísticas extras"><CareerExtraStats state={state} /></ArchivePanelBoundary>
          </div>
        )}

        {activeTab === "history" && (
          <ArchivePanelBoundary label="Histórico temporada a temporada"><CareerTimeline state={state} archived /></ArchivePanelBoundary>
        )}

        {activeTab === "stats" && (
          <div className="panel-screen screen-enter">
            <ArchivePanelBoundary label="Arquivo estatístico"><CareerStatisticsArchive state={state} /></ArchivePanelBoundary>
            <ArchivePanelBoundary label="Estatísticas extras"><CareerExtraStats state={state} /></ArchivePanelBoundary>
          </div>
        )}

        {activeTab === "world" && (
          <ArchivePanelBoundary label="Mundo da carreira"><CareerWorld state={state} /></ArchivePanelBoundary>
        )}

        <nav className="bottom-nav" aria-label="Navegação da carreira arquivada">
          <div className="desktop-career-nav-brand" aria-hidden="true">
            <BrandMark size="sm" />
            <span><small>ARQUIVO DO JOGADOR</small><strong>{state.name || entry.name}</strong><em>{position.name} · carreira encerrada</em></span>
          </div>
          <button aria-pressed={activeTab === "career"} className={activeTab === "career" ? "selected" : ""} onClick={() => setActiveTab("career")}><span><FutboboIcon name="career" /></span>Carreira</button>
          <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => setActiveTab("profile")}><span><FutboboIcon name="player" /></span>Jogador</button>
          <button aria-pressed={activeTab === "history"} className={activeTab === "history" ? "selected" : ""} onClick={() => setActiveTab("history")}><span><FutboboIcon name="history" /></span>Histórico</button>
          <button aria-pressed={activeTab === "stats"} className={activeTab === "stats" ? "selected" : ""} onClick={() => setActiveTab("stats")}><span><FutboboIcon name="stats" /></span>Estatísticas</button>
          <button aria-pressed={activeTab === "world"} className={activeTab === "world" ? "selected" : ""} onClick={() => setActiveTab("world")}><span><FutboboIcon name="globe" /></span>Mundo</button>
        </nav>
      </section>
    </main>
  );
}
