from pathlib import Path

path = Path("app/career/simulation.ts")
source = path.read_text(encoding="utf-8")

import_anchor = 'import { clubWithPlayerImpact } from "./player-club-impact";\n'
import_line = 'import { resolveExtraSecondDivisionPromotion } from "./second-divisions";\n'
if import_line not in source:
    if import_anchor not in source:
        raise SystemExit("promotion import anchor not found")
    source = source.replace(import_anchor, import_anchor + import_line, 1)

old = '''  const championshipPlayoffPromotion =
    league.id === "championship" &&
    leaguePosition >= 3 &&
    leaguePosition <= 6 &&
    seeded(state.seed, state.season * 601) < clamp(0.34 + (6 - leaguePosition) * 0.09 + playerImpact * 0.012, 0.2, 0.72);
  const promotedLeagueId =
    league.id === "brasileirao-b" && leaguePosition <= 4
      ? "brasileirao"
      : league.id === "championship" && (leaguePosition <= 2 || championshipPlayoffPromotion)
        ? "premier"
        : "";
  const promotion = promotedLeagueId
    ? championshipPlayoffPromotion
      ? `Acesso à Premier League conquistado nos playoffs!`
      : `Acesso conquistado para a ${leagueById(promotedLeagueId).name}!`
    : null;
'''

new = '''  const championshipPlayoffPromotion =
    league.id === "championship" &&
    leaguePosition >= 3 &&
    leaguePosition <= 6 &&
    seeded(state.seed, state.season * 601) < clamp(0.34 + (6 - leaguePosition) * 0.09 + playerImpact * 0.012, 0.2, 0.72);
  const extraSecondDivisionPromotion = resolveExtraSecondDivisionPromotion(
    league.id,
    leaguePosition,
    seeded(state.seed, state.season * 607),
    playerImpact,
  );
  const promotedLeagueId =
    league.id === "brasileirao-b" && leaguePosition <= 4
      ? "brasileirao"
      : league.id === "championship" && (leaguePosition <= 2 || championshipPlayoffPromotion)
        ? "premier"
        : extraSecondDivisionPromotion?.topLeagueId ?? "";
  const promotion = promotedLeagueId
    ? championshipPlayoffPromotion || extraSecondDivisionPromotion?.playoff
      ? `Acesso à ${leagueById(promotedLeagueId).name} conquistado nos playoffs!`
      : `Acesso conquistado para a ${leagueById(promotedLeagueId).name}!`
    : null;
'''

if old not in source:
    if import_line in source and "extraSecondDivisionPromotion" in source:
        raise SystemExit(0)
    raise SystemExit("promotion block not found")

path.write_text(source.replace(old, new, 1), encoding="utf-8")
