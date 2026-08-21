import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

{
  const path = "app/career/world-memory.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    'import { worldPlayerNewsForState } from "./world-player-world";\n',
    'import { worldPlayerNewsForState } from "./world-player-world";\nimport { buildLivingClubCompetitions } from "./world-club-competitions";\n',
    "world-memory living club competitions import",
  );
  source = replaceOnce(
    source,
    'import { buildLivingClubCompetitions } from "./world-club-competitions";\n',
    'import { buildLivingClubCompetitions } from "./world-club-competitions";\nimport { buildLivingNationalCompetitions } from "./world-national-competitions";\n',
    "world-memory living national competitions import",
  );
  source = replaceOnce(
    source,
    'export type WorldCompetitionKey = "world-cup" | "champions-league" | "libertadores";',
    'export type WorldCompetitionKey = "world-cup" | "champions-league" | "libertadores" | "euro" | "copa-america";',
    "world-memory competition key union",
  );
  source = replaceOnce(
    source,
    '  const careerNews = state.history.flatMap((record) => [\n',
    '  const livingClubCompetitions = buildLivingClubCompetitions(state);\n\n  const careerNews = state.history.flatMap((record) => [\n',
    "world-memory club competition build",
  );
  source = replaceOnce(
    source,
    '  const livingClubCompetitions = buildLivingClubCompetitions(state);\n\n  const careerNews = state.history.flatMap((record) => [\n',
    '  const livingClubCompetitions = buildLivingClubCompetitions(state);\n  const livingNationalCompetitions = buildLivingNationalCompetitions(state);\n\n  const careerNews = state.history.flatMap((record) => [\n',
    "world-memory national competition build",
  );
  source = replaceOnce(
    source,
    '    ...rivalNews(state),\n    ...worldPlayerNewsForState(state),\n',
    '    ...rivalNews(state),\n    ...worldPlayerNewsForState(state),\n    ...livingClubCompetitions.flatMap((competition) => competition.news),\n',
    "world-memory club competition news",
  );
  source = replaceOnce(
    source,
    '    ...worldPlayerNewsForState(state),\n    ...livingClubCompetitions.flatMap((competition) => competition.news),\n',
    '    ...worldPlayerNewsForState(state),\n    ...livingClubCompetitions.flatMap((competition) => competition.news),\n    ...livingNationalCompetitions.flatMap((competition) => competition.news),\n',
    "world-memory national competition news",
  );
  source = replaceOnce(
    source,
    '    competitionLedgers: [worldCupLedger],\n',
    '    competitionLedgers: [\n      worldCupLedger,\n      ...livingClubCompetitions.map((competition) => ({\n        id: competition.id,\n        label: competition.label,\n        entityType: "club" as const,\n        champions: competition.champions.map((champion) => ({\n          season: champion.season,\n          winnerId: champion.winnerId,\n          source: champion.source,\n        })),\n        titleTable: competition.titleTable,\n      })),\n    ],\n',
    "world-memory club competition ledgers",
  );
  source = replaceOnce(
    source,
    '      worldCupLedger,\n      ...livingClubCompetitions.map((competition) => ({\n',
    '      worldCupLedger,\n      ...livingNationalCompetitions.map((competition) => ({\n        id: competition.id,\n        label: competition.label,\n        entityType: "country" as const,\n        champions: competition.champions.map((champion) => ({\n          season: champion.season,\n          winnerId: champion.winnerId,\n          source: champion.source,\n        })),\n        titleTable: competition.titleTable,\n      })),\n      ...livingClubCompetitions.map((competition) => ({\n',
    "world-memory national competition ledgers",
  );
  fs.writeFileSync(path, source);
}

{
  const path = "app/components/career/CareerWorld.tsx";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    'import { buildWorldSnapshot, worldPulseForState } from "../../career/world-memory";\nimport { NationBadge } from "./CareerPrimitives";\n',
    'import { buildWorldSnapshot, worldPulseForState } from "../../career/world-memory";\nimport { clubById } from "../../career/shared";\nimport { ClubBadge, NationBadge } from "./CareerPrimitives";\n',
    "CareerWorld club imports",
  );
  source = replaceOnce(
    source,
    '  const [rankingOpen, setRankingOpen] = useState(false);\n  const [officialOpen, setOfficialOpen] = useState<string>("");\n',
    '  const [rankingOpen, setRankingOpen] = useState(false);\n  const [competitionOpen, setCompetitionOpen] = useState<string>("");\n  const [officialOpen, setOfficialOpen] = useState<string>("");\n',
    "CareerWorld competition state",
  );
  source = replaceOnce(
    source,
    '  const recentWorldCups = [...snapshot.worldCupChampions].reverse().slice(0, 4);\n',
    '  const recentWorldCups = [...snapshot.worldCupChampions].reverse().slice(0, 4);\n  const clubCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "club");\n',
    "CareerWorld club competitions selector",
  );
  source = replaceOnce(
    source,
    '  const clubCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "club");\n',
    '  const clubCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "club");\n  const nationalCompetitions = snapshot.competitionLedgers.filter((ledger) => ledger.entityType === "country" && ledger.id !== "world-cup");\n',
    "CareerWorld national competitions selector",
  );

  const clubAnchor = `      </section>\n\n      <section className={styles.officialSection}>`;
  const clubInsert = `      </section>\n\n      {clubCompetitions.map((ledger) => {\n        const open = competitionOpen === ledger.id;\n        const leaderEntry = ledger.titleTable[0];\n        const leaderClub = leaderEntry ? clubById(leaderEntry.entityId) : null;\n        const currentClubEntry = ledger.titleTable.find((entry) => entry.entityId === state.currentClubId);\n        const recentChampions = [...ledger.champions].reverse().slice(0, 4);\n        return (\n          <section className={styles.worldCupCard} key={ledger.id}>\n            <button type="button" onClick={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} aria-expanded={open}>\n              <span className={styles.trophy}>◇</span>\n              <span>\n                <small>{ledger.label.toLocaleUpperCase("pt-BR")} · TÍTULOS</small>\n                <strong>{leaderClub && leaderEntry ? \`${'${leaderClub.shortName}'} lidera com ${'${leaderEntry.titles}'}\` : ledger.label}</strong>\n                {currentClubEntry && <em>{clubById(state.currentClubId).shortName}: #{currentClubEntry.rank} · {currentClubEntry.titles} título(s)</em>}\n              </span>\n              <b>{open ? "−" : "+"}</b>\n            </button>\n\n            {recentChampions.length > 0 && (\n              <div className={styles.recentChampions}>\n                {recentChampions.map((champion) => {\n                  const club = clubById(champion.winnerId);\n                  return (\n                    <span key={\`${'${ledger.id}'}-${'${champion.season}'}-${'${champion.winnerId}'}\`}>\n                      <span className={styles.flagWrap}><ClubBadge club={club} size="sm" /></span>\n                      <small>{champion.season}</small>\n                      <strong>{club.shortName}</strong>\n                    </span>\n                  );\n                })}\n              </div>\n            )}\n\n            {open && (\n              <div className={styles.ranking}>\n                {ledger.titleTable.map((entry) => {\n                  const club = clubById(entry.entityId);\n                  return (\n                    <article className={entry.entityId === state.currentClubId ? styles.playerCountry : ""} key={entry.entityId}>\n                      <b>#{entry.rank}</b>\n                      <span className={styles.rankingFlag}><ClubBadge club={club} size="sm" /></span>\n                      <strong>{club.shortName}</strong>\n                      <span>{entry.titles}</span>\n                    </article>\n                  );\n                })}\n              </div>\n            )}\n          </section>\n        );\n      })}\n\n      <section className={styles.officialSection}>`;
  source = replaceOnce(source, clubAnchor, clubInsert, "CareerWorld club competition cards");

  const nationalAnchor = `      {clubCompetitions.map((ledger) => {`;
  const nationalInsert = `      {nationalCompetitions.map((ledger) => {\n        const open = competitionOpen === ledger.id;\n        const leaderEntry = ledger.titleTable[0];\n        const leaderCountry = leaderEntry ? countryById(leaderEntry.entityId) : null;\n        const playerEntry = ledger.titleTable.find((entry) => entry.entityId === state.nationality);\n        const recentChampions = [...ledger.champions].reverse().slice(0, 4);\n        return (\n          <section className={styles.worldCupCard} key={ledger.id}>\n            <button type="button" onClick={() => setCompetitionOpen((current) => current === ledger.id ? "" : ledger.id)} aria-expanded={open}>\n              <span className={styles.trophy}>◎</span>\n              <span>\n                <small>{ledger.label.toLocaleUpperCase("pt-BR")} · TÍTULOS</small>\n                <strong>{leaderCountry && leaderEntry ? \`${'${leaderCountry.name}'} lidera com ${'${leaderEntry.titles}'}\` : ledger.label}</strong>\n                {playerEntry && <em>{countryById(state.nationality).name}: #{playerEntry.rank} · {playerEntry.titles} título(s)</em>}\n              </span>\n              <b>{open ? "−" : "+"}</b>\n            </button>\n\n            {recentChampions.length > 0 && (\n              <div className={styles.recentChampions}>\n                {recentChampions.map((champion) => {\n                  const country = countryById(champion.winnerId);\n                  return (\n                    <span key={\`${'${ledger.id}'}-${'${champion.season}'}-${'${champion.winnerId}'}\`}>\n                      <span className={styles.flagWrap}><NationBadge country={country} size="sm" /></span>\n                      <small>{champion.season}</small>\n                      <strong>{country.name}</strong>\n                    </span>\n                  );\n                })}\n              </div>\n            )}\n\n            {open && (\n              <div className={styles.ranking}>\n                {ledger.titleTable.map((entry) => {\n                  const country = countryById(entry.entityId);\n                  return (\n                    <article className={entry.entityId === state.nationality ? styles.playerCountry : ""} key={entry.entityId}>\n                      <b>#{entry.rank}</b>\n                      <span className={styles.rankingFlag}><NationBadge country={country} size="sm" /></span>\n                      <strong>{country.name}</strong>\n                      <span>{entry.titles}</span>\n                    </article>\n                  );\n                })}\n              </div>\n            )}\n          </section>\n        );\n      })}\n\n      {clubCompetitions.map((ledger) => {`;
  source = replaceOnce(source, nationalAnchor, nationalInsert, "CareerWorld national competition cards");
  fs.writeFileSync(path, source);
}
