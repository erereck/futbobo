import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, source) => fs.writeFileSync(path, source);

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing finalize marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous finalize marker: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

// Multi-career backup/import lives beside the slot system so the legacy career
// UI never needs to know storage key internals.
{
  const path = "app/career/save-system.ts";
  let source = read(path);
  if (!source.includes("export type CareerStorageSnapshot")) {
    source = `${source.trimEnd()}\n\nexport type CareerStorageSnapshot = {\n  version: 2;\n  index: CareerSaveMeta[];\n  activeId: string;\n  slots: Record<string, GameState>;\n  achievements: GlobalAchievementUnlock[];\n};\n\nexport type CareerStorageImportResult = {\n  imported: boolean;\n  activeState: GameState | null;\n};\n\nexport function exportCareerStorageSnapshot(): CareerStorageSnapshot {\n  const index = listCareerSaves();\n  const slots: Record<string, GameState> = {};\n  for (const meta of index) {\n    const state = readCareerSlotState(meta.id);\n    if (state) slots[meta.id] = state;\n  }\n  const usableIndex = index.filter((meta) => Boolean(slots[meta.id]));\n  const activeId = usableIndex.some((meta) => meta.id === getActiveCareerId())\n    ? getActiveCareerId()\n    : usableIndex[0]?.id ?? \"\";\n  return {\n    version: 2,\n    index: usableIndex,\n    activeId,\n    slots,\n    achievements: readUnlocks(),\n  };\n}\n\nexport function importCareerStorageSnapshot(value: unknown): CareerStorageImportResult {\n  if (typeof window === \"undefined\" || !value || typeof value !== \"object\") {\n    return { imported: false, activeState: null };\n  }\n  const snapshot = value as Partial<CareerStorageSnapshot>;\n  if (snapshot.version !== 2 || !Array.isArray(snapshot.index) || !snapshot.slots || typeof snapshot.slots !== \"object\") {\n    return { imported: false, activeState: null };\n  }\n\n  const rawSlots = snapshot.slots as Record<string, unknown>;\n  const importedIndex = sanitizeIndex(snapshot.index).filter((meta) => isUsableState(rawSlots[meta.id]));\n  const currentIndex = listCareerSaves();\n  for (const meta of currentIndex) localStorage.removeItem(slotKey(meta.id));\n\n  for (const meta of importedIndex) {\n    localStorage.setItem(slotKey(meta.id), JSON.stringify(rawSlots[meta.id]));\n  }\n  writeIndex(importedIndex);\n\n  const importedUnlocks = Array.isArray(snapshot.achievements)\n    ? snapshot.achievements.filter((item): item is GlobalAchievementUnlock => Boolean(\n        item && typeof item === \"object\" && typeof item.achievementId === \"string\" && typeof item.careerId === \"string\",\n      ))\n    : [];\n  writeJson(ACHIEVEMENTS_KEY, importedUnlocks);\n\n  const activeId = typeof snapshot.activeId === \"string\" && importedIndex.some((meta) => meta.id === snapshot.activeId)\n    ? snapshot.activeId\n    : importedIndex[0]?.id ?? \"\";\n  if (!activeId) {\n    localStorage.removeItem(ACTIVE_KEY);\n    localStorage.removeItem(SAVE_KEY);\n    lastSyncedPayload = \"\";\n    return { imported: true, activeState: null };\n  }\n\n  const activeState = rawSlots[activeId] as GameState;\n  localStorage.setItem(ACTIVE_KEY, activeId);\n  localStorage.setItem(SAVE_KEY, JSON.stringify(activeState));\n  lastSyncedPayload = \"\";\n  return { imported: true, activeState };\n}\n`;
  }
  write(path, source);
}

{
  const path = "app/components/career/CareerGame.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    'import { selectTransferOffers } from "../../career/transfer-market";\n',
    'import { selectTransferOffers } from "../../career/transfer-market";\nimport { exportCareerStorageSnapshot, importCareerStorageSnapshot } from "../../career/save-system";\n',
    "save-system import",
  );
  source = replaceOnce(source, '      version: 1,\n      exportedAt: new Date().toISOString(),\n      save:', '      version: 2,\n      exportedAt: new Date().toISOString(),\n      careerStorage: exportCareerStorageSnapshot(),\n      save:', "backup v2 payload");
  source = replaceOnce(source, '        save?: unknown;\n        challengeSave?: unknown;', '        save?: unknown;\n        careerStorage?: unknown;\n        challengeSave?: unknown;', "backup import type");
  source = replaceOnce(
    source,
    '      if (payload.format !== "futbobo-backup") throw new Error("Formato inválido");\n      const importedSettings:',
    '      if (payload.format !== "futbobo-backup") throw new Error("Formato inválido");\n      const multiCareerImport = payload.careerStorage === undefined\n        ? { imported: false, activeState: null }\n        : importCareerStorageSnapshot(payload.careerStorage);\n      if (payload.careerStorage !== undefined && !multiCareerImport.imported) throw new Error("Backup de carreiras inválido");\n      const importedSettings:',
    "multi-career import",
  );
  source = replaceOnce(
    source,
    '      } else {\n        localStorage.removeItem(SAVE_KEY);\n        setHasSave(false);\n      }\n      setToast("Dados importados com sucesso");',
    '      } else if (multiCareerImport.activeState) {\n        setGame(multiCareerImport.activeState);\n        setHasSave(multiCareerImport.activeState.phase !== "welcome");\n      } else {\n        localStorage.removeItem(SAVE_KEY);\n        setHasSave(false);\n      }\n      setToast("Dados importados com sucesso");',
    "restore active imported slot",
  );
  source = replaceOnce(
    source,
    '<p>O backup inclui carreira atual, Hall da Fama, personagens, times personalizados e configurações.</p>',
    '<p>O backup inclui todas as carreiras, conquistas globais, Hall da Fama, personagens, times personalizados e configurações.</p>',
    "backup copy",
  );
  source = replaceOnce(
    source,
    '              <section className="rival-center legacy-ui-hidden">',
    '              {/* Rivais continuam no GameState e na simulação para alimentar memória/notícias em updates futuros; somente a UI está oculta. */}\n              <section className="rival-center legacy-ui-hidden">',
    "rivals preservation comment",
  );
  write(path, source);
}

console.log("Finalized Futbobo rework backup compatibility and preserved-system notes.");
