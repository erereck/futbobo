import fs from "node:fs";

const careerPath = "app/components/career/CareerGame.tsx";
let source = fs.readFileSync(careerPath, "utf8");

if (source.includes("PlayerCreationV2 from \"./PlayerCreationV2\"")) {
  console.log("Futbobo UX transform already applied.");
  process.exit(0);
}

function replaceOnce(search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing transform marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous transform marker: ${label}`);
  source = source.slice(0, first) + replacement + source.slice(first + search.length);
}

function classOnce(name) {
  replaceOnce(`className=\"${name}\"`, `className=\"${name} legacy-ui-hidden\"`, `class ${name}`);
}

replaceOnce(
  'import { selectTransferOffers } from "../../career/transfer-market";\n',
  'import { selectTransferOffers } from "../../career/transfer-market";\nimport PlayerCreationV2, { FirstContractV2 } from "./PlayerCreationV2";\nimport { CareerStatisticsArchive, PlayerReworkPanels } from "./CareerReworkPanels";\nimport CareerExtraStats from "./CareerExtraStats";\n',
  "career rework imports",
);

const identityMarker = '      {game.phase === "identity" && (\n';
replaceOnce(
  identityMarker,
  `      {(["identity", "appearance", "nationality", "academy", "formation", "story"] as Phase[]).includes(game.phase) && (\n        <PlayerCreationV2\n          game={game}\n          setGame={setGame}\n          shirtNumberInput={shirtNumberInput}\n          setShirtNumberInput={setShirtNumberInput}\n          rollPlayerName={rollPlayerName}\n          selectPlayerStory={selectPlayerStory}\n          appearanceEnabled={appSettings.characterButtonsEnabled !== false}\n        />\n      )}\n\n      {false && game.phase === "identity" && (\n`,
  "new creation flow",
);

replaceOnce(
  '      {game.phase === "appearance" && appSettings.characterButtonsEnabled !== false && (\n',
  '      {false && game.phase === "appearance" && appSettings.characterButtonsEnabled !== false && (\n',
  "legacy appearance",
);
for (const phase of ["nationality", "academy", "formation", "story"]) {
  replaceOnce(
    `      {game.phase === "${phase}" && (\n`,
    `      {false && game.phase === "${phase}" && (\n`,
    `legacy ${phase}`,
  );
}

replaceOnce(
  '              <span>A simulação terminou. Leia sua trajetória com calma.</span>\n',
  "",
  "youth filler copy",
);
replaceOnce(
  'onClick={() => setGame((current) => ({ ...current, phase: "youth-complete" }))}>Continuar',
  'onClick={() => setGame((current) => ({ ...current, phase: "revelation" }))}>Continuar',
  "skip youth complete",
);
replaceOnce(
  '      {game.phase === "youth-complete" && (\n',
  '      {false && game.phase === "youth-complete" && (\n',
  "legacy youth complete",
);
replaceOnce(
  '      {game.phase === "revelation" && (\n',
  '      {game.phase === "revelation" && <FirstContractV2 game={game} onBack={() => setGame((current) => ({ ...current, phase: "youth" }))} onSign={signProfessional} />}\n\n      {false && game.phase === "revelation" && (\n',
  "first contract v2",
);

replaceOnce(
  '              <section className={`player-story-profile story-${playerStoryById(game.playerStoryId).tone}`}>',
  '              <PlayerReworkPanels state={game} />\n              <section className={`player-story-profile legacy-ui-hidden story-${playerStoryById(game.playerStoryId).tone}`}>',
  "player panels",
);

for (const className of [
  "profile-metrics",
  "trait-card",
  "market-context",
  "career-economy",
  "football-attributes-card",
  "contract-card",
  "supporter-card",
  "attribute-card",
  "career-total-card",
  "national-team-card",
  "career-fortune",
  "discipline-card",
  "award-cabinet",
  "season-finance-card",
]) classOnce(className);

replaceOnce(
  '              <TrophyGallery state={game} />',
  '              <div className="legacy-ui-hidden"><TrophyGallery state={game} /></div>',
  "profile trophy gallery",
);

replaceOnce(
  '              <section className="rival-center">',
  '              <CareerStatisticsArchive state={game} />\n              <CareerExtraStats state={game} />\n              <section className="rival-center legacy-ui-hidden">',
  "statistics archive",
);

const navStart = '            <nav className="bottom-nav" aria-label="Navegação da carreira">';
const navStartIndex = source.indexOf(navStart);
if (navStartIndex < 0) throw new Error("Missing transform marker: career bottom nav");
const navEndIndex = source.indexOf("            </nav>", navStartIndex);
if (navEndIndex < 0) throw new Error("Missing closing career bottom nav");
const navEnd = navEndIndex + "            </nav>".length;
const navReplacement = `            <nav className="bottom-nav" aria-label="Navegação da carreira">\n              <div className="desktop-career-nav-brand" aria-hidden="true">\n                <BrandMark size="sm" />\n                <span><small>CENTRAL DO JOGADOR</small><strong>{game.name}</strong><em>{position.name} · {leagueById(game.currentLeagueId || currentClub.leagueId).name}</em></span>\n              </div>\n              <button aria-pressed={activeTab === "event"} className={activeTab === "event" ? "selected" : ""} onClick={() => changeTab("event")}><span>◆</span>Carreira</button>\n              <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => changeTab("profile")}><span>●</span>Jogador</button>\n              <button aria-pressed={activeTab === "stats"} className={activeTab === "stats" ? "selected" : ""} onClick={() => changeTab("stats")}><span>▥</span>Estatísticas</button>\n            </nav>`;
source = source.slice(0, navStartIndex) + navReplacement + source.slice(navEnd);

fs.writeFileSync(careerPath, source);
console.log("Applied Futbobo UX rework to CareerGame.tsx");
