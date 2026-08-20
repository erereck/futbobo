import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const write = (path, source) => fs.writeFileSync(path, source);

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing final polish marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous final polish marker: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function appendOnce(path, marker, content) {
  let source = read(path);
  if (source.includes(marker)) return;
  write(path, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

// Final creation-flow behavior: six academy choices, split between the top two
// domestic divisions whenever a country has more than one league registered.
{
  const path = "app/components/career/PlayerCreationV2.tsx";
  let source = read(path);

  source = replaceOnce(
    source,
    'import { CLUBS, COUNTRIES, FORMATIONS, POSITIONS } from "../../game-data";',
    'import { CLUBS, COUNTRIES, FORMATIONS, LEAGUES, POSITIONS } from "../../game-data";',
    "LEAGUES import",
  );

  const oldAcademyClubs = [
    '  const academyClubs = useMemo(() => CLUBS',
    '    .filter((club) => club.countryId === academyCountry.id)',
    '    .sort((a, b) => a.reputation - b.reputation || a.strength - b.strength)',
    '    .slice(0, 12), [academyCountry.id]);',
  ].join("\n");

  const newAcademyClubs = [
    '  const academyClubs = useMemo(() => {',
    '    const limit = 6;',
    '    const countryClubs = CLUBS',
    '      .filter((club) => club.countryId === academyCountry.id)',
    '      .sort((a, b) => a.reputation - b.reputation || a.strength - b.strength);',
    '    const divisions = LEAGUES',
    '      .filter((league) => league.countryId === academyCountry.id)',
    '      .sort((a, b) => b.prestige - a.prestige);',
    '',
    '    if (divisions.length < 2) return countryClubs.slice(0, limit);',
    '',
    '    const perDivision = Math.floor(limit / 2);',
    '    const selected = [',
    '      ...countryClubs.filter((club) => club.leagueId === divisions[0].id).slice(0, perDivision),',
    '      ...countryClubs.filter((club) => club.leagueId === divisions[1].id).slice(0, perDivision),',
    '    ];',
    '',
    '    if (selected.length < limit) {',
    '      const selectedIds = new Set(selected.map((club) => club.id));',
    '      selected.push(...countryClubs.filter((club) => !selectedIds.has(club.id)).slice(0, limit - selected.length));',
    '    }',
    '',
    '    return selected.slice(0, limit);',
    '  }, [academyCountry.id]);',
  ].join("\n");

  source = replaceOnce(source, oldAcademyClubs, newAcademyClubs, "academy club distribution");

  if (!source.includes('className={`${styles.page} ${styles.identityPage}`}')) {
    const academyStart = source.indexOf('  if (game.phase === "academy") {');
    if (academyStart < 0) throw new Error("Missing final polish marker: academy phase");
    const sectionStart = source.indexOf('<section className={styles.page}>', academyStart);
    if (sectionStart < 0) throw new Error("Missing final polish marker: academy section");
    source = source.slice(0, sectionStart)
      + '<section className={`${styles.page} ${styles.identityPage}`}> '
      + source.slice(sectionStart + '<section className={styles.page}>'.length);
    source = source.replace('}> \n        <SetupHeader step="4 · IDENTIDADE"', '}>\n        <SetupHeader step="4 · IDENTIDADE"');
  }

  write(path, source);
}

appendOnce("app/components/career/PlayerCreationV2.module.css", "/* UX FINAL POLISH V3 */", String.raw`
/* UX FINAL POLISH V3 */
/* Swatches are rigid squares before border-radius, so flex/grid compression can never turn them into ovals. */
.appearanceWrap :global(.appearance-palette button) {
  width:30px !important;
  height:30px !important;
  min-width:30px !important;
  min-height:30px !important;
  max-width:30px !important;
  max-height:30px !important;
  flex:0 0 30px !important;
  aspect-ratio:1 / 1 !important;
  border-radius:50% !important;
  box-sizing:border-box !important;
}

/* Desktop identity is a viewport screen: no page scroll, with a slightly tighter preview to guarantee fit. */
@media (min-width:761px) {
  .identityPage {
    height:100dvh;
    min-height:100dvh;
    overflow:hidden;
  }
  .identityPage .identityStage {
    height:calc(100dvh - 68px);
    min-height:0;
    padding:8px 0 10px;
    align-content:center;
    overflow:hidden;
  }
  .identityPage .appearanceWrap {
    max-height:calc(100dvh - 86px);
    overflow:hidden;
  }
  .identityPage .appearanceWrap :global(.appearance-editor) {
    max-height:100%;
    overflow:hidden;
  }
  .identityPage .appearanceWrap :global(.appearance-preview canvas) {
    width:min(240px,32dvh) !important;
    height:min(240px,32dvh) !important;
  }
  .identityPage .previewOptions { gap:5px; margin-top:5px; }
  .identityPage .previewOption { min-height:48px; }
  .identityPage .previewContinue { min-height:44px; }
}

/* On phones give the preview/country/story column a little more room and let controls take the remainder. */
@media (max-width:760px) {
  .appearanceWrap :global(.appearance-editor) {
    grid-template-columns:minmax(168px,44%) minmax(0,1fr) !important;
  }
  .appearanceWrap :global(.appearance-preview canvas) {
    width:142px !important;
    height:142px !important;
  }
  .appearanceWrap :global(.appearance-palette button) {
    width:28px !important;
    height:28px !important;
    min-width:28px !important;
    min-height:28px !important;
    max-width:28px !important;
    max-height:28px !important;
    flex-basis:28px !important;
  }
}

@media (max-width:480px) {
  .appearanceWrap :global(.appearance-editor) {
    grid-template-columns:minmax(152px,46%) minmax(0,1fr) !important;
  }
  .appearanceWrap :global(.appearance-preview canvas) {
    width:128px !important;
    height:128px !important;
  }
  .appearanceWrap :global(.appearance-preview strong),
  .appearanceWrap :global(.appearance-preview small) { max-width:142px; }
  .appearanceWrap :global(.appearance-palette button) {
    width:26px !important;
    height:26px !important;
    min-width:26px !important;
    min-height:26px !important;
    max-width:26px !important;
    max-height:26px !important;
    flex-basis:26px !important;
  }
}
`);

console.log("Applied Futbobo final UX polish v3.");
