import fs from "node:fs";

const path = "app/components/shell/FutboboShell.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Ambiguous ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
}

replaceOnce(
  'import { clubById } from "../../career/shared";\n',
  'import { clubById } from "../../career/shared";\nimport { legacySummaryForHallEntry } from "../../career/legacy-prestige";\n',
  "legacy import",
);

replaceOnce(
  '  const selectedUnlock = selectedAchievement ? achievementMap.get(selectedAchievement.id) : undefined;\n',
  '  const selectedUnlock = selectedAchievement ? achievementMap.get(selectedAchievement.id) : undefined;\n  const hallRows = useMemo(() => hall\n    .map((entry) => ({ entry, legacy: legacySummaryForHallEntry(entry) }))\n    .sort((a, b) => b.legacy.score - a.legacy.score || b.entry.finishedAt - a.entry.finishedAt), [hall]);\n',
  "hall rows",
);

replaceOnce(
  `      {screen === "hall" && (\n        <section className={\`${'${styles.panelScreen} ${styles.collectionScreen}'}\`}>\n          <header className={styles.panelHeading}><span>HALL DA FAMA</span><h2>Carreiras que chegaram ao fim.</h2><p>O índice de legado fica guardado para a aposentadoria — aqui é onde ele importa.</p></header>\n          <div className={styles.hallList}>\n            {hall.length === 0 ? <div className={styles.emptyCollection}><b>★</b><strong>Nenhuma carreira aposentada.</strong><span>Quando uma história terminar, ela aparece aqui.</span></div> : hall.map((entry, index) => {\n              const club = CLUBS.find((item) => item.id === entry.finalClubId);\n              return <article key={entry.id}><b>#{index + 1}</b>{club ? <ClubBadge club={club} size="md" /> : null}<span><strong>{entry.name}</strong><small>{entry.position} · {entry.seasons} temporadas · pico {entry.peakOverall}</small><em>{entry.trophies} títulos · {entry.ballonDor} Bola(s) de Ouro</em></span><strong className={styles.legacyScore}>{entry.legacyPoints}<small>{entry.legacyLabel}</small></strong></article>;\n            })}\n          </div>\n        </section>\n      )}`,
  `      {screen === "hall" && (\n        <section className={\`${'${styles.panelScreen} ${styles.collectionScreen}'}\`}>\n          <header className={styles.panelHeading}><span>HALL DA FAMA</span><h2>Carreiras que chegaram ao fim.</h2><p>Prêmios e títulos grandes pesam de verdade. Quantidade sozinha não ganha da história.</p></header>\n          <div className={styles.hallList}>\n            {hallRows.length === 0 ? <div className={styles.emptyCollection}><b>★</b><strong>Nenhuma carreira aposentada.</strong><span>Quando uma história terminar, ela aparece aqui.</span></div> : hallRows.map(({ entry, legacy }, index) => {\n              const club = CLUBS.find((item) => item.id === entry.finalClubId);\n              return <article key={entry.id}><b>#{index + 1}</b>{club ? <ClubBadge club={club} size="md" /> : null}<span><strong>{entry.name}</strong><small>{entry.position} · {entry.seasons} temporadas · pico {entry.peakOverall}</small><em>{legacy.signature}</em></span><strong className={styles.legacyScore} style={{ color: legacy.color }}>{legacy.score}<small>{legacy.label}</small></strong></article>;\n            })}\n          </div>\n        </section>\n      )}`,
  "hall block",
);

fs.writeFileSync(path, source);
console.log("Prestige-aware Hall integrated.");
