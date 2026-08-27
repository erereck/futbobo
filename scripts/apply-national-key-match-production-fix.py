from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"{label}: trecho esperado não encontrado em {path}")
    path.write_text(text.replace(old, new, 1))


model = Path("app/career/model.ts")
replace_once(
    model,
    "  botaoResults?: StoredBotaoResult[];\n  promotion?: string | null;",
    "  botaoResults?: StoredBotaoResult[];\n  nationalBotaoProductionMatchIds?: string[];\n  promotion?: string | null;",
    "model marker",
)

state = Path("app/career/state.ts")
replace_once(
    state,
    'import { emptyWorldPlayerUniverse, normalizeWorldPlayerUniverse } from "./world-players";',
    'import { emptyWorldPlayerUniverse, normalizeWorldPlayerUniverse } from "./world-players";\nimport { applyNationalBotaoProduction } from "./botao-production";',
    "state import",
)
replace_once(
    state,
    "    history: (saved.history ?? []).map((record) => ({",
    "    history: (saved.history ?? []).map((record) => applyNationalBotaoProduction({",
    "history reconciliation",
)
replace_once(
    state,
    "      botaoResults: Array.isArray(record.botaoResults) ? record.botaoResults.map(normalizeStoredBotaoResult) : [],\n      promotion: record.promotion ?? null,",
    "      botaoResults: Array.isArray(record.botaoResults) ? record.botaoResults.map(normalizeStoredBotaoResult) : [],\n      nationalBotaoProductionMatchIds: Array.isArray(record.nationalBotaoProductionMatchIds) ? record.nationalBotaoProductionMatchIds : [],\n      promotion: record.promotion ?? null,",
    "history applied ids",
)
replace_once(
    state,
    "    lastResult: saved.lastResult ? {",
    "    lastResult: saved.lastResult ? applyNationalBotaoProduction({",
    "last result reconciliation",
)
replace_once(
    state,
    "      breakoutBonus: saved.lastResult.breakoutBonus ?? 0,\n    } : null,",
    "      breakoutBonus: saved.lastResult.breakoutBonus ?? 0,\n    }) : null,",
    "last result close",
)

career = Path("app/components/career/CareerGame.tsx")
replace_once(
    career,
    'import { compactBotaoMatchResult, compactGameForPersistence } from "../../career/save-compaction";',
    'import { compactBotaoMatchResult, compactGameForPersistence } from "../../career/save-compaction";\nimport { applyNationalBotaoProduction } from "../../career/botao-production";',
    "career import",
)
replace_once(
    career,
    '''        const updatedWorldCupStats = updatedNationalHistory.find((record) =>\n          record.season === match.season && record.name === "Copa do Mundo"\n        )?.tournamentStats;\n\n        if (nextStageName) {''',
    '''        const updatedWorldCupStats = updatedNationalHistory.find((record) =>\n          record.season === match.season && record.name === "Copa do Mundo"\n        )?.tournamentStats;\n        const storedNationalResult = { match, result: archivedMatchResult };\n\n        if (nextStageName) {''',
    "stored national result",
)
replace_once(
    career,
    '''          lastResult: current.lastResult\n            ? {\n                ...current.lastResult,\n                nationalNote: `${match.competitionName}: ${stageAfterMatch}${\n                  updatedWorldCupStats\n                    ? ` · ${updatedWorldCupStats.appearances}J, ${updatedWorldCupStats.goals}G, ${updatedWorldCupStats.assists}A`\n                    : ""\n                }`,\n                botaoResults: [...(current.lastResult.botaoResults ?? []), { match, result: archivedMatchResult }],\n              }\n            : null,\n          history: current.history.map((record) =>\n            record.season === match.season\n              ? { ...record, botaoResults: [...(record.botaoResults ?? []), { match, result: archivedMatchResult }] }\n              : record,\n          ),''',
    '''          lastResult: current.lastResult\n            ? applyNationalBotaoProduction({\n                ...current.lastResult,\n                nationalNote: `${match.competitionName}: ${stageAfterMatch}${\n                  updatedWorldCupStats\n                    ? ` · ${updatedWorldCupStats.appearances}J, ${updatedWorldCupStats.goals}G, ${updatedWorldCupStats.assists}A`\n                    : ""\n                }`,\n              }, storedNationalResult)\n            : null,\n          history: current.history.map((record) =>\n            record.season === match.season\n              ? applyNationalBotaoProduction(record, storedNationalResult)\n              : record,\n          ),''',
    "national season production",
)

print("national key-match production fix applied")
