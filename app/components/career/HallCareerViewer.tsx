"use client";

import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
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

function safeText(value: unknown, fallback = "—") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

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

type ArchiveRootBoundaryProps = HallCareerViewerProps & {
  children: ReactNode;
};

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
    return (
      <main className="app-shell app-shell-career hall-archive-viewer">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <div className="summary-preview-bar">
          <button type="button" onClick={onBack}>← Voltar ao Hall da Fama</button>
          <div><small>MODO DE SEGURANÇA</small><strong>{safeText(entry.name, "Carreira arquivada")}</strong></div>
          <button type="button" className="primary-button" onClick={onGenerateCard}>Gerar card <span>→</span></button>
        </div>
        <section className="career-shell career-phase-career screen-enter">
          <div className="panel-screen screen-enter">
            <section className="legacy-hero">
              <span>ARQUIVO RECUPERADO · SOMENTE VISUALIZAÇÃO</span>
              <strong style={{ color: "#f4c430" }}>{safeNumber(entry.legacyPoints)}</strong>
              <h2>{safeText(entry.legacyLabel, "Carreira encerrada")}</h2>
              <p>Um dado incompatível tentou derrubar o visualizador, mas a carreira foi mantida acessível em modo de segurança.</p>
            </section>
            <div className="legacy-grid">
              <div className="metric"><span>Temporadas</span><strong>{safeNumber(entry.seasons)}</strong></div>
              <div className="metric metric-gold"><span>Pico OVR</span><strong>{safeNumber(entry.peakOverall)}</strong></div>
              <div className="metric"><span>Taças</span><strong>{safeNumber(entry.trophies)}</strong></div>
              <div className="metric"><span>Bolas de Ouro</span><strong>{safeNumber(entry.ballonDor)}</strong></div>
            </div>
            <div className="empty-panel">
              <strong>Erro contido: {safeText(this.state.error, "falha de renderização")}</strong>
              <span>Esse texto identifica o campo ou componente problemático sem mandar o Futbobo inteiro para o setealém.</span>
            </div>
          </div>
        </section>
      </main>
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
  const [activeTab, setActiveTab] = useState<ArchiveTab>("career");
  const history = (Array.isArray(state.history) ? state.history : []).filter(Boolean);
  const newsFeed = (Array.isArray(state.newsFeed) ? state.newsFeed : []).map((headline) => safeText(headline, "Registro arquivado"));
  const currentClubId = safeText(state.currentClubId || state.academyClubId || entry.finalClubId, "");
  const currentClub = clubById(currentClubId);
  const nationality = safeText(state.nationality || entry.nationality, "brasil");
  const nation = countryById(nationality);
  const position = positionByKey(state.position);
  const supporterMood = fanMood(safeNumber(state.fanSupport, 50));
  const peakOverall = Math.max(safeNumber(state.overall), ...history.map((record) => safeNumber(record?.overall)), safeNumber(entry.peakOverall), 0);
  const totalTitles = safeNumber(state.trophies) + safeNumber(state.nationalTrophies);
  const clubs = new Set(history.map((record) => safeText(record?.clubId, "")).filter(Boolean)).size || 1;
  const stats = state.stats && typeof state.stats === "object" ? state.stats : initialState().stats;
  const playerName = safeText(state.name, safeText(entry.name, "Jogador"));
  const playerPosition = safeText(state.position, safeText(entry.position, "MEI"));
  const legacyLabel = safeText(entry.legacyLabel, "Carreira encerrada");
  const roleLabel = ROLE_LABELS[state.squadRole] ?? safeText(state.squadRole, "Arquivo");

  return (
    <main className="app-shell app-shell-career hall-archive-viewer">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="summary-preview-bar">
        <button type="button" onClick={onBack}>← Voltar ao Hall da Fama</button>
        <div><small>MODO DE VISUALIZAÇÃO</small><strong>Carreira encerrada de {playerName}</strong></div>
        <button type="button" className="primary-button" onClick={onGenerateCard}>Gerar card <span>→</span></button>
      </div>

      {archive.legacyArchive && (
        <div className="summary-legacy-warning">
          Este registro precisou do modo de compatibilidade. O Futbobo recuperou todos os dados disponíveis sem deixar um campo antigo derrubar a carreira inteira.
        </div>
      )}

      <section className={`career-shell career-phase-career career-tab-${activeTab} screen-enter`}>
        <header className="career-header">
          <div className="club-identity"><ClubBadge club={currentClub} size="sm" /><span><small>{safeNumber(state.season)}</small><strong>{currentClub.shortName}</strong></span></div>
          <div className="career-age"><strong>{safeNumber(state.age)}</strong><span>ANOS</span></div>
          <div className="player-identity"><span><small>PICO</small><strong>{peakOverall}</strong></span><div className="mini-avatar">{playerPosition}</div></div>
        </header>

        <div className="career-bars career-bars-four">
          <Progress label="Moral" value={safeNumber(state.morale)} color="#2ca8ff" />
          <Progress label="Físico" value={safeNumber(state.fitness)} color={safeNumber(state.fitness) < 55 ? "#ff5a4e" : "#63e36b"} />
          <Progress label="Prestígio" value={safeNumber(state.reputation)} color="#ffc72c" />
          <Progress label={supporterMood.label} value={safeNumber(state.fanSupport)} color={supporterMood.color} />
        </div>

        <div className="career-status-strip retirement-open">
          <span><small>STATUS</small><strong>APOSENTADO</strong></span>
          <span><small>ÚLTIMO PAPEL</small><strong>{roleLabel}</strong></span>
          <span><small>ÚLTIMO CLUBE</small><strong>{currentClub.shortName}</strong></span>
          <button className="retirement-trigger" type="button" onClick={onGenerateCard}><small>CARREIRA</small><strong><FutboboIcon name="trophy" /> Gerar card</strong></button>
        </div>

        {activeTab === "career" && (
          <div className="panel-screen screen-enter">
            <section className="legacy-hero">
              <span>CARREIRA ENCERRADA · SOMENTE VISUALIZAÇÃO</span>
              <strong style={{ color: "#f4c430" }}>{safeNumber(entry.legacyPoints)}</strong>
              <h2>{legacyLabel}</h2>
              <p>Este é o estado arquivado quando a carreira terminou. Não existe avanço de temporada, evento novo, transferência ou qualquer ação que altere o save.</p>
            </section>

            <div className="legacy-grid">
              <Metric label="Temporadas" value={history.length || safeNumber(entry.seasons)} />
              <Metric label="Clubes" value={clubs} />
              <Metric label="Pico OVR" value={peakOverall} tone="gold" />
              <Metric label="Legado" value={safeNumber(state.legacyPoints, safeNumber(entry.legacyPoints))} tone="green" />
            </div>

            <div className="career-total-card">
              <span>TOTAIS DA CARREIRA</span>
              <div>
                <Metric label="Jogos" value={safeNumber(stats.appearances)} />
                <Metric label={state.position === "GOL" ? "Sem sofrer" : "Gols"} value={state.position === "GOL" ? safeNumber(stats.cleanSheets) : safeNumber(stats.goals)} />
                <Metric label={state.position === "GOL" ? "Sofridos" : "Assistências"} value={state.position === "GOL" ? safeNumber(stats.goalsConceded) : safeNumber(stats.assists)} />
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
              <div className="academy-avatar"><span>{safeNumber(state.number)}</span><small>{playerPosition}</small></div>
              <div><span>{safeText(state.archetype, "Jogador")}</span><h2>{playerName}</h2><p>{position.style} · {safeText(state.foot, "Direita")}</p><small><NationBadge country={nation} size="sm" /> {nation.name}</small></div>
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
            <span><small>ARQUIVO DO JOGADOR</small><strong>{playerName}</strong><em>{position.name} · carreira encerrada</em></span>
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

export default function HallCareerViewer(props: HallCareerViewerProps) {
  return (
    <ArchiveRootBoundary {...props}>
      <HallCareerViewerContent {...props} />
    </ArchiveRootBoundary>
  );
}
