import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, source) => fs.writeFileSync(path, source);

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing world marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous world marker: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function appendOnce(path, marker, content) {
  let source = read(path);
  if (source.includes(marker)) return;
  source = `${source.trimEnd()}\n\n${content.trim()}\n`;
  write(path, source);
}

{
  const path = "app/components/career/CareerGame.tsx";
  let source = read(path);

  source = replaceOnce(
    source,
    'import CareerExtraStats from "./CareerExtraStats";',
    'import CareerExtraStats from "./CareerExtraStats";\nimport CareerTimeline from "./CareerTimeline";\nimport CareerWorld, { WorldPulseButton } from "./CareerWorld";',
    "career imports",
  );

  source = replaceOnce(
    source,
    'useState<"event" | "history" | "profile" | "life" | "stats" | "legacy">("event")',
    'useState<"event" | "history" | "profile" | "life" | "stats" | "world" | "legacy">("event")',
    "active tab type",
  );

  source = replaceOnce(
    source,
    'function changeTab(tab: "event" | "history" | "profile" | "life" | "stats" | "legacy")',
    'function changeTab(tab: "event" | "history" | "profile" | "life" | "stats" | "world" | "legacy")',
    "change tab type",
  );

  const objectiveOld = '{game.currentObjective && <div className="objective-card"><span>META DO TREINADOR</span><strong>{game.currentObjective.label}</strong><p>{game.currentObjective.description}</p><small>Recompensa: +{game.currentObjective.reward} confiança · Falha: −{game.currentObjective.penalty}</small></div>}';
  const objectiveNew = [
    '{game.currentObjective && <div className="objective-card">',
    '                <span>META DO TREINADOR</span>',
    '                <strong>{game.currentObjective.label}</strong>',
    '                <p>{game.currentObjective.description}</p>',
    '                <small>Recompensa: +{game.currentObjective.reward} confiança · Falha: −{game.currentObjective.penalty}</small>',
    '                <WorldPulseButton state={game} onOpen={() => changeTab("world")} />',
    '              </div>}',
  ].join("\n");
  source = replaceOnce(source, objectiveOld, objectiveNew, "hub world pulse");

  if (!source.includes('<CareerTimeline state={game} />')) {
    const historyStart = source.indexOf('          {activeTab === "history" && game.phase === "career" && (');
    const profileStart = source.indexOf('          {activeTab === "profile" && game.phase === "career" && (', historyStart);
    if (historyStart < 0 || profileStart < 0) throw new Error("Missing world marker: history block");
    const replacement = [
      '          {activeTab === "history" && game.phase === "career" && (',
      '            <CareerTimeline state={game} />',
      '          )}',
      '',
    ].join("\n");
    source = source.slice(0, historyStart) + replacement + source.slice(profileStart);
  }

  if (!source.includes('<CareerWorld state={game} />')) {
    const legacyMarker = '          {activeTab === "legacy" && game.phase === "career" && (';
    const legacyIndex = source.indexOf(legacyMarker);
    if (legacyIndex < 0) throw new Error("Missing world marker: legacy block");
    const worldBlock = [
      '          {activeTab === "world" && game.phase === "career" && (',
      '            <CareerWorld state={game} />',
      '          )}',
      '',
    ].join("\n");
    source = source.slice(0, legacyIndex) + worldBlock + source.slice(legacyIndex);
  }

  const navOld = [
    '              <button aria-pressed={activeTab === "event"} className={activeTab === "event" ? "selected" : ""} onClick={() => changeTab("event")}><span>◆</span>Carreira</button>',
    '              <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => changeTab("profile")}><span>●</span>Jogador</button>',
    '              <button aria-pressed={activeTab === "stats"} className={activeTab === "stats" ? "selected" : ""} onClick={() => changeTab("stats")}><span>▥</span>Estatísticas</button>',
  ].join("\n");
  const navNew = [
    '              <button aria-pressed={activeTab === "event"} className={activeTab === "event" ? "selected" : ""} onClick={() => changeTab("event")}><span>◆</span>Carreira</button>',
    '              <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => changeTab("profile")}><span>●</span>Jogador</button>',
    '              <button aria-pressed={activeTab === "history"} className={activeTab === "history" ? "selected" : ""} onClick={() => changeTab("history")}><span>│</span>Histórico</button>',
    '              <button aria-pressed={activeTab === "stats"} className={activeTab === "stats" ? "selected" : ""} onClick={() => changeTab("stats")}><span>▥</span>Estatísticas</button>',
    '              <button aria-pressed={activeTab === "world"} className={activeTab === "world" ? "selected" : ""} onClick={() => changeTab("world")}><span>◎</span>Mundo</button>',
  ].join("\n");
  source = replaceOnce(source, navOld, navNew, "five tab navigation");

  write(path, source);
}

{
  const path = "app/components/career/CareerReworkPanels.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import { useMemo, useState } from "react";',
    'import { useMemo, useState } from "react";\nimport { createPortal } from "react-dom";',
    "portal import",
  );
  source = replaceOnce(
    source,
    '      {followersOpen && (\n        <div className={styles.modalBackdrop}',
    '      {followersOpen && typeof document !== "undefined" && createPortal((\n        <div className={styles.modalBackdrop}',
    "portal open",
  );
  const modalEnd = '        </div>\n      )}\n    </div>\n  );\n}\n\nexport function CareerStatisticsArchive';
  const portalEnd = '        </div>\n      ), document.body)}\n    </div>\n  );\n}\n\nexport function CareerStatisticsArchive';
  source = replaceOnce(source, modalEnd, portalEnd, "portal close");
  write(path, source);
}

appendOnce("app/components/shell/FutboboShell.module.css", "/* WORLD MEMORY V1 */", String.raw`
/* WORLD MEMORY V1 */
.mainActions .playButton:hover { color:#fff; }
@media (max-width:800px) {
  .careerHost :global(.bottom-nav) { grid-template-columns:repeat(5,minmax(0,1fr)) !important; }
  .careerHost :global(.bottom-nav > button) { min-width:0 !important; padding-inline:1px !important; font-size:6px !important; }
}
`);

appendOnce("app/globals.css", "/* WORLD MEMORY EVENT FLOW */", String.raw`
/* WORLD MEMORY EVENT FLOW */
@media (max-width:899px) {
  .career-shell > .event-stage {
    display:block !important;
    min-height:0 !important;
    height:auto !important;
  }
  .event-stage .event-card {
    margin:8px 10px 14px !important;
  }
}
`);

console.log("Applied Futbobo World + memory integration.");
