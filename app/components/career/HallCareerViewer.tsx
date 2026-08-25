"use client";

import { useMemo, useState } from "react";
import { countryById } from "../../game-data";
import type { CareerHallEntry } from "../../career/model";
import { ROLE_LABELS } from "../../career-systems";
import { archivedCareerState } from "../../career/state";
import { clubById } from "../../career/shared";
import { fanMood, formatMoney } from "../../career/performance";
import { positionByKey } from "../../career/academy";
import CareerTimeline from "./CareerTimeline";
import CareerExtraStats from "./CareerExtraStats";
import CareerWorld from "./CareerWorld";
import { CareerStatisticsArchive, PlayerReworkPanels } from "./CareerReworkPanels";
import { BrandMark, ClubBadge, Metric, NationBadge, Progress, TrophyGallery } from "./CareerPrimitives";
import FutboboIcon from "../FutboboIcon";

type ArchiveTab = "career" | "profile" | "history" | "stats" | "world" | "legacy";

type HallCareerViewerProps = {
  entry: CareerHallEntry;
  onBack: () => void;
  onGenerateCard: () => void;
};

export default function HallCareerViewer({ entry, onBack, onGenerateCard }: HallCareerViewerProps) {
  const archive = useMemo(() => archivedCareerState(entry), [entry]);
  const state = archive.state;
  const [activeTab, setActiveTab] = useState<ArchiveTab>("career");
  const currentClub = clubById(state.currentClubId || state.academyClubId || entry.finalClubId);
  const nation = countryById(state.nationality || entry.nationality);
  const position = positionByKey(state.position);
  const supporterMood = fanMood(state.fanSupport);
  const peakOverall = Math.max(state.overall, ...state.history.map((record) => record.overall), entry.peakOverall, 0);
  const totalTitles = state.trophies + state.nationalTrophies;
  const totalAwards = Object.values(state.awardCabinet).reduce((sum, count) => sum + count, 0);
  const clubs = new Set(state.history.map((record) => record.clubId)).size || 1;

  return (
    <main className="app-shell app-shell-career hall-archive-viewer">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="summary-preview-bar">
        <button type="button" onClick={onBack}>← Voltar ao Hall da Fama</button>
        <div><small>MODO DE VISUALIZAÇÃO</small><strong>Carreira encerrada de {state.name}</strong></div>
        <button type="button" className="primary-button" onClick={onGenerateCard}>Gerar card <span>→</span></button>
      </div>

      {archive.legacyArchive && (
        <div className="summary-legacy-warning">
          Este registro é anterior ao arquivo completo. O Futbobo recuperou tudo o que existia no Hall antigo, mas alguns detalhes nunca foram salvos naquela versão.
        </div>
      )}

      <section className={`career-shell career-phase-career career-tab-${activeTab} screen-enter`}>
        <header className="career-header">
          <div className="club-identity"><ClubBadge club={currentClub} size="sm" /><span><small>{state.season}</small><strong>{currentClub.shortName}</strong></span></div>
          <div className="career-age"><strong>{state.age}</strong><span>ANOS</span></div>
          <div className="player-identity"><span><small>PICO</small><strong>{peakOverall}</strong></span><div className="mini-avatar">{state.position}</div></div>
        </header>

        <div className="career-bars career-bars-four">
          <Progress label="Moral" value={state.morale} color="#2ca8ff" />
          <Progress label="Físico" value={state.fitness} color={state.fitness < 55 ? "#ff5a4e" : "#63e36b"} />
          <Progress label="Prestígio" value={state.reputation} color="#ffc72c" />
          <Progress label={supporterMood.label} value={state.fanSupport} color={supporterMood.color} />
        </div>

        <div className="career-status-strip retirement-open">
          <span><small>STATUS</small><strong>APOSENTADO</strong></span>
          <span><small>ÚLTIMO PAPEL</small><strong>{ROLE_LABELS[state.squadRole]}</strong></span>
          <span><small>ÚLTIMO CLUBE</small><strong>{currentClub.shortName}</strong></span>
          <button className="retirement-trigger" type="button" onClick={onGenerateCard}><small>CARREIRA</small><strong><FutboboIcon name="trophy" /> Gerar card</strong></button>
        </div>

        {activeTab === "career" && (
          <div className="panel-screen screen-enter">
            <section className="legacy-hero">
              <span>CARREIRA ENCERRADA · SOMENTE VISUALIZAÇÃO</span>
              <strong style={{ color: "#f4c430" }}>{entry.legacyPoints}</strong>
              <h2>{entry.legacyLabel}</h2>
              <p>Este é o estado exato arquivado quando a carreira terminou. Não existe avanço de temporada, evento novo, transferência ou qualquer ação que altere o save.</p>
            </section>

            <div className="legacy-grid">
              <Metric label="Temporadas" value={state.history.length || entry.seasons} />
              <Metric label="Clubes" value={clubs} />
              <Metric label="Pico OVR" value={peakOverall} tone="gold" />
              <Metric label="Legado" value={state.legacyPoints || entry.legacyPoints} tone="green" />
            </div>

            <div className="career-total-card">
              <span>TOTAIS DA CARREIRA</span>
              <div>
                <Metric label="Jogos" value={state.stats.appearances} />
                <Metric label={state.position === "GOL" ? "Sem sofrer" : "Gols"} value={state.position === "GOL" ? state.stats.cleanSheets : state.stats.goals} />
                <Metric label={state.position === "GOL" ? "Sofridos" : "Assistências"} value={state.position === "GOL" ? state.stats.goalsConceded : state.stats.assists} />
                <Metric label="Taças" value={totalTitles} tone="gold" />
              </div>
            </div>

            <TrophyGallery state={state} />
            <CareerExtraStats state={state} />

            <div className="news-card">
              <span>ÚLTIMAS MANCHETES DA CARREIRA</span>
              {state.newsFeed.length
                ? state.newsFeed.slice(0, 8).map((headline, index) => <article key={`${headline}-${index}`}><small>{index === 0 ? "FINAL" : "ARQUIVO"}</small><strong>{headline}</strong></article>)
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
            <PlayerReworkPanels state={state} />
            <CareerExtraStats state={state} />
          </div>
        )}

        {activeTab === "history" && <CareerTimeline state={state} />}

        {activeTab === "stats" && (
          <div className="panel-screen screen-enter">
            <CareerStatisticsArchive state={state} />
            <CareerExtraStats state={state} />
          </div>
        )}

        {activeTab === "world" && <CareerWorld state={state} />}

        {activeTab === "legacy" && (
          <div className="panel-screen legacy-screen screen-enter">
            <div className="legacy-hero">
              <span>ÍNDICE DE LEGADO</span>
              <strong style={{ color: "#f4c430" }}>{state.legacyPoints || entry.legacyPoints}</strong>
              <h2>{entry.legacyLabel}</h2>
              <p>O retrato final usado pelo Hall da Fama, preservado para comparação depois da aposentadoria.</p>
            </div>
            <div className="legacy-grid">
              <Metric label="Temporadas" value={state.history.length || entry.seasons} />
              <Metric label="Clubes" value={clubs} />
              <Metric label="Pico OVR" value={peakOverall} tone="gold" />
              <Metric label="Patrimônio" value={formatMoney(state.money)} tone="green" />
            </div>
            <div className="award-cabinet">
              <div className="award-cabinet-title"><div><span>PRÊMIOS INDIVIDUAIS</span><strong>Galeria final</strong></div><b>{totalAwards}<small>CONQUISTADOS</small></b></div>
              <div className="award-cabinet-list">
                {Object.entries(state.awardCabinet).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).map(([award, count]) => <article key={award}><div><strong>{award}</strong><small>Arquivo da carreira</small></div><b>{count}×</b></article>)}
              </div>
            </div>
          </div>
        )}

        <nav className="bottom-nav" aria-label="Navegação da carreira arquivada">
          <div className="desktop-career-nav-brand" aria-hidden="true">
            <BrandMark size="sm" />
            <span><small>ARQUIVO DO JOGADOR</small><strong>{state.name}</strong><em>{position.name} · carreira encerrada</em></span>
          </div>
          <button aria-pressed={activeTab === "career"} className={activeTab === "career" ? "selected" : ""} onClick={() => setActiveTab("career")}><span><FutboboIcon name="career" /></span>Carreira</button>
          <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => setActiveTab("profile")}><span><FutboboIcon name="player" /></span>Jogador</button>
          <button aria-pressed={activeTab === "history"} className={activeTab === "history" ? "selected" : ""} onClick={() => setActiveTab("history")}><span><FutboboIcon name="history" /></span>Histórico</button>
          <button aria-pressed={activeTab === "stats"} className={activeTab === "stats" ? "selected" : ""} onClick={() => setActiveTab("stats")}><span><FutboboIcon name="stats" /></span>Estatísticas</button>
          <button aria-pressed={activeTab === "world"} className={activeTab === "world" ? "selected" : ""} onClick={() => setActiveTab("world")}><span><FutboboIcon name="globe" /></span>Mundo</button>
          <button aria-pressed={activeTab === "legacy"} className={activeTab === "legacy" ? "selected" : ""} onClick={() => setActiveTab("legacy")}><span><FutboboIcon name="hall" /></span>Legado</button>
        </nav>
      </section>
    </main>
  );
}
