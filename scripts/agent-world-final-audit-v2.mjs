import fs from "node:fs";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Missing ${label}`);
  return source.replace(from, to);
}

{
  const path = "app/career/world-club-competitions.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceRequired(
    source,
    "    (spell.leftSeason === null || spell.leftSeason >= season)",
    "    (spell.leftSeason === null || spell.leftSeason > season)",
    "exclusive club spell end season",
  );
  fs.writeFileSync(path, source);
}

{
  const path = "app/career/world-national-competitions.ts";
  let source = fs.readFileSync(path, "utf8");
  // O jogo atual agenda todas as copas continentais seniores no ciclo season % 4 === 0.
  // O Mundo deve usar exatamente o mesmo calendário para não divergir do que o jogador disputa.
  source = source.replaceAll("startSeason: 2027,", "startSeason: 2028,");
  source = source.replaceAll("interval: 2,", "interval: 4,");
  const oldBlock = `      const playerRecord = playerRecordFor(state, config, season);\n      const playerWon = Boolean(playerRecord?.champion);\n      const winnerId = playerWon\n        ? state.nationality\n        : pickWinner(state, config, season, titles, playerRecord ? state.nationality : "");\n      const source: "generated" | "player" = playerWon ? "player" : "generated";`;
  const newBlock = `      const playerRecord = playerRecordFor(state, config, season);\n      const currentNationality = countryById(state.nationality);\n      const playerCountryId = playerRecord?.countryId\n        ?? (currentNationality.confederation === config.confederation ? state.nationality : "");\n      const playerWon = Boolean(playerRecord?.champion && playerCountryId);\n      const winnerId = playerWon\n        ? playerCountryId\n        : pickWinner(state, config, season, titles, playerRecord && playerCountryId ? playerCountryId : "");\n      const source: "generated" | "player" = playerWon ? "player" : "generated";`;
  source = replaceRequired(source, oldBlock, newBlock, "national record country identity");
  fs.writeFileSync(path, source);
}

{
  const path = "app/career/model.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceRequired(
    source,
    `  stage: string;\n  champion: boolean;\n  tournamentStats?: TournamentStats;`,
    `  stage: string;\n  champion: boolean;\n  countryId?: string;\n  tournamentStats?: TournamentStats;`,
    "NationalRecord countryId",
  );
  fs.writeFileSync(path, source);
}

{
  const path = "app/career/simulation.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceRequired(
    source,
    'nationalitySwitchRecord = { season: state.season, tier: "none", name: "Troca de Seleção", icon: "↔", stage: `Deixou a Seleção de ${fromCountry.name} para defender a Seleção de ${toCountry.name}`, champion: false };',
    'nationalitySwitchRecord = { season: state.season, tier: "none", name: "Troca de Seleção", icon: "↔", stage: `Deixou a Seleção de ${fromCountry.name} para defender a Seleção de ${toCountry.name}`, champion: false, countryId: effect.switchNationalityTo };',
    "nationality switch country identity",
  );
  source = replaceRequired(
    source,
    'nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage: qualified ? "Classificado" : "Eliminado", champion: false };',
    'nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage: qualified ? "Classificado" : "Eliminado", champion: false, countryId: affected.nationality };',
    "qualifier country identity",
  );
  source = replaceRequired(
    source,
    'nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage: "Não classificado", champion: false };',
    'nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage: "Não classificado", champion: false, countryId: affected.nationality };',
    "non-qualified country identity",
  );
  source = replaceRequired(
    source,
    'nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage, champion };',
    'nationalHistoryAdd = { season: seasonYear, tier: nationalTier, name: tournament.name, icon: tournament.icon, stage, champion, countryId: affected.nationality };',
    "tournament country identity",
  );
  fs.writeFileSync(path, source);
}

{
  const path = "app/career/world-memory.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceRequired(
    source,
    '  const nationalRecord = state.nationalHistory.find((record) => record.season === season && record.name === "Copa do Mundo");\n  const matches = worldCupMatches(state, season);',
    '  const nationalRecord = state.nationalHistory.find((record) => record.season === season && record.name === "Copa do Mundo");\n  const playerCountryId = nationalRecord?.countryId ?? state.nationality;\n  const matches = worldCupMatches(state, season);',
    "World Cup record country identity",
  );
  source = source.replace('return { season, winnerCountryId: state.nationality, source: "player" };', 'return { season, winnerCountryId: playerCountryId, source: "player" };');
  source = source.replace('runnerUpCountryId: state.nationality,', 'runnerUpCountryId: playerCountryId,');
  source = source.replace('if (nationalRecord && nationalRecord.stage !== "Não classificado") excluded.add(state.nationality);', 'if (nationalRecord && nationalRecord.stage !== "Não classificado") excluded.add(playerCountryId);');
  source = source.replace('  const runnerUpCountryId = nationalRecord?.stage === "Vice"\n    ? state.nationality', '  const runnerUpCountryId = nationalRecord?.stage === "Vice"\n    ? playerCountryId');
  source = source.replace('title: `${countryById(state.nationality).name} vence ${record.name}`,', 'title: `${countryById(record.countryId ?? state.nationality).name} vence ${record.name}`,');
  if (!source.includes('winnerCountryId: playerCountryId') || !source.includes('excluded.add(playerCountryId)')) {
    throw new Error("World Cup player country replacement incomplete");
  }
  fs.writeFileSync(path, source);
}
