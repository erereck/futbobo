from pathlib import Path

path = Path("app/components/career/CareerGame.tsx")
text = path.read_text()

old_import = 'import { exportCareerStorageSnapshot, importCareerStorageSnapshot } from "../../career/save-system";'
new_import = old_import + '\nimport { compactBotaoMatchResult, compactGameForPersistence } from "../../career/save-compaction";'
if new_import not in text:
    if old_import not in text:
        raise SystemExit("save-system import not found")
    text = text.replace(old_import, new_import, 1)

old_save = '''  useEffect(() => {\n    if (game.phase === "welcome") return;\n    const key = game.challengeId ? CHALLENGE_SAVE_KEY : SAVE_KEY;\n    localStorage.setItem(key, JSON.stringify(game));\n    if (game.challengeId) queueMicrotask(() => setHasChallengeSave(game.phase !== "summary"));\n  }, [game]);'''
new_save = '''  useEffect(() => {\n    if (game.phase === "welcome") return;\n    const key = game.challengeId ? CHALLENGE_SAVE_KEY : SAVE_KEY;\n    const compact = compactGameForPersistence(game);\n    try {\n      localStorage.setItem(key, JSON.stringify(compact));\n      if (game.challengeId) queueMicrotask(() => setHasChallengeSave(game.phase !== "summary"));\n    } catch (error) {\n      console.error("[Futbobo] Falha ao persistir a carreira.", error);\n      // Nunca deixe uma cota de armazenamento cheia derrubar a partida inteira.\n      // A segunda tentativa remove também o resultado pós-jogo efêmero; histórico\n      // e estatísticas permanecem intactos.\n      try {\n        localStorage.setItem(key, JSON.stringify({ ...compact, lastBotaoResult: null }));\n        setToast("Save compactado automaticamente para liberar espaço");\n      } catch (retryError) {\n        console.error("[Futbobo] O save continuou acima da cota após compactação.", retryError);\n        setToast("Não foi possível salvar: armazenamento do navegador cheio");\n      }\n    }\n  }, [game]);'''
if old_save not in text:
    raise SystemExit("autosave block not found")
text = text.replace(old_save, new_save, 1)

needle = '''      const match = current.pendingBotaoMatches[0];\n      if (!match || matchResult.matchId !== resolvedSetup?.matchId) return current;\n\n      const formerClub'''
replacement = '''      const match = current.pendingBotaoMatches[0];\n      if (!match || matchResult.matchId !== resolvedSetup?.matchId) return current;\n      // Replay só existe para a tela imediatamente após o apito. Arquivar os\n      // frames em cada temporada multiplicava o tamanho do save a cada partida.\n      const archivedMatchResult = compactBotaoMatchResult(matchResult);\n\n      const formerClub'''
if needle not in text:
    raise SystemExit("applyBotaoMatchResult insertion point not found")
text = text.replace(needle, replacement, 1)

before = text.count('{ match, result: matchResult }]')
if before < 2:
    raise SystemExit(f"expected archived botao result occurrences, found {before}")
text = text.replace('{ match, result: matchResult }]', '{ match, result: archivedMatchResult }]')

# The immediate post-match result deliberately keeps the full replay payload.
if 'lastBotaoResult: { match, result: matchResult },' not in text:
    raise SystemExit("full immediate result was unexpectedly changed")
if '{ match, result: matchResult }]' in text:
    raise SystemExit("some archived botao result still stores replays")

path.write_text(text)
