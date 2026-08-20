import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, source) {
  fs.writeFileSync(path, source);
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing polish marker: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) throw new Error(`Ambiguous polish marker: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function appendOnce(path, marker, content) {
  let source = read(path);
  if (source.includes(marker)) return;
  source = `${source.trimEnd()}\n\n${content.trim()}\n`;
  write(path, source);
}

// ---------------------------------------------------------------------------
// Menu shell: viewport-first home/modes + exact title requested.
// ---------------------------------------------------------------------------
{
  const path = "app/components/shell/FutboboShell.tsx";
  let source = read(path);
  source = replaceOnce(source, '<main className={styles.shell}>', '<main className={styles.shell} data-screen={screen}>', "shell data-screen");
  source = replaceOnce(source, '<header className={styles.panelHeading}><span>JOGAR</span><h2>Escolha seu futebol.</h2><p>Carreira longa, copa rápida ou o sofá contra alguém.</p></header>', '<header className={styles.panelHeading}><span>JOGAR</span><h2>Escolher seu futbobo.</h2><p>Carreira longa, copa rápida ou o sofá contra alguém.</p></header>', "modes title");
  write(path, source);
}

appendOnce(
  "app/components/shell/FutboboShell.module.css",
  "/* UX POLISH V2 */",
  String.raw`
/* UX POLISH V2 */
.shell[data-screen="home"],
.shell[data-screen="modes"] {
  height: 100dvh;
  min-height: 100dvh;
  overflow: hidden;
}

.shell[data-screen="home"] .home {
  min-height: 0;
  padding: clamp(12px, 2.2dvh, 26px) 0;
  gap: clamp(16px, 3.5dvh, 36px);
}
.shell[data-screen="home"] .heroLogo h1 {
  font-size: clamp(48px, min(8.5vw, 10dvh), 96px);
}
.shell[data-screen="home"] .heroLogo > span { margin-top: clamp(9px, 1.8dvh, 16px); }
.shell[data-screen="home"] .mainActions .playButton { min-height: clamp(56px, 8.5dvh, 70px); }
.shell[data-screen="home"] .mainActions button:not(.playButton) { min-height: clamp(42px, 6dvh, 48px); }

.shell[data-screen="modes"] .panelScreen {
  min-height: 0;
  height: 100%;
  padding: clamp(12px, 2.4dvh, 26px) 0 clamp(12px, 2.4dvh, 24px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}
.shell[data-screen="modes"] .panelHeading { margin-bottom: clamp(9px, 1.8dvh, 18px); }
.shell[data-screen="modes"] .panelHeading h2 { font-size: clamp(32px, min(5.2vw, 7.3dvh), 60px); }
.shell[data-screen="modes"] .modeList {
  min-height: 0;
  grid-template-rows: repeat(4, minmax(0, 1fr));
  gap: clamp(5px, .9dvh, 8px);
}
.shell[data-screen="modes"] .modeCard {
  min-height: 0;
  height: 100%;
  padding-block: clamp(8px, 1.35dvh, 14px);
}

/* Desktop career panels deliberately follow the reliable mobile stack. */
@media (min-width: 761px) {
  .careerHost :global(.career-tab-profile .panel-screen),
  .careerHost :global(.career-tab-stats .panel-screen) {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 12px !important;
  }
  .careerHost :global(.career-tab-profile .panel-screen > *),
  .careerHost :global(.career-tab-stats .panel-screen > *) {
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    margin: 0 !important;
  }
}

/* Event cards should hug their actual text/options instead of filling the viewport. */
.careerHost :global(.event-stage) { min-height: 0 !important; }
.careerHost :global(.event-card) {
  min-height: 0 !important;
  height: auto !important;
  grid-template-rows: auto auto !important;
  align-content: start !important;
}
.careerHost :global(.event-card .choice-list) {
  align-self: start !important;
  margin-top: clamp(14px, 2.2vh, 24px) !important;
}

@media (max-height: 720px) {
  .shell[data-screen="home"] .home { gap: 12px; padding-block: 8px; }
  .shell[data-screen="home"] .heroLogo h1 { font-size: clamp(44px, 8dvh, 68px); }
  .shell[data-screen="home"] .heroLogo > span { margin-top: 7px; }
  .shell[data-screen="modes"] .modeCard p { display: none; }
  .shell[data-screen="modes"] .modeCard strong { font-size: 18px; }
}

@media (max-width: 800px) {
  .shell[data-screen="home"] .mainActions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .shell[data-screen="home"] .mainActions .playButton { grid-column: 1 / -1; }
  .shell[data-screen="home"] .home { padding-top: 12px; }

  .careerHost :global(.bottom-nav) {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    justify-content: center !important;
    justify-items: stretch !important;
  }
  .careerHost :global(.bottom-nav .desktop-career-nav-brand) { display: none !important; }
  .careerHost :global(.bottom-nav > button) { width: 100% !important; min-width: 0 !important; }

  .careerHost :global(.club-badge-lg) {
    width: 62px !important;
    height: 62px !important;
    min-width: 62px !important;
  }
}

@media (max-width: 520px) {
  .shell[data-screen="home"] .mainActions { gap: 6px; }
  .shell[data-screen="home"] .mainActions button { padding-inline: 11px; font-size: 11px; }
  .shell[data-screen="home"] .mainActions .playButton { font-size: 17px; }
  .shell[data-screen="home"] .heroLogo h1 { font-size: clamp(46px, 16vw, 64px); }
  .shell[data-screen="modes"] .panelHeading p { display: none; }
  .shell[data-screen="modes"] .modeCard { grid-template-columns: 34px minmax(0, 1fr) 22px; padding-inline: 10px; }
  .shell[data-screen="modes"] .modeCard p { display: none; }
  .shell[data-screen="modes"] .modeCard strong { font-size: 16px; }
  .shell[data-screen="modes"] .modeIndex { font-size: 13px; }
}
`,
);

// ---------------------------------------------------------------------------
// Appearance editor: allow creation flow to place country/story below preview.
// ---------------------------------------------------------------------------
{
  const path = "app/PlayerAppearanceEditor.tsx";
  let source = read(path);
  source = replaceOnce(source, 'import { useEffect, useRef, type CSSProperties } from "react";', 'import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";', "appearance ReactNode import");
  source = replaceOnce(source, '  kitPattern,\n  compact = false,\n}: {', '  kitPattern,\n  compact = false,\n  previewExtras,\n}: {', "appearance previewExtras destructure");
  source = replaceOnce(source, '  kitPattern?: number;\n  compact?: boolean;\n}) {', '  kitPattern?: number;\n  compact?: boolean;\n  previewExtras?: ReactNode;\n}) {', "appearance previewExtras type");
  source = replaceOnce(source, '        <button type="button" className="appearance-random" onClick={() => onChange(randomPlayerAppearance())}>⚄ Sortear visual</button>\n      </div>', '        <button type="button" className="appearance-random" onClick={() => onChange(randomPlayerAppearance())}>⚄ Sortear visual</button>\n        {previewExtras && <div className="appearance-preview-extras">{previewExtras}</div>}\n      </div>', "appearance preview extras render");
  write(path, source);
}

// ---------------------------------------------------------------------------
// Player creation: responsive pitch, physical shirt controls, preview options.
// ---------------------------------------------------------------------------
{
  const path = "app/components/career/PlayerCreationV2.tsx";
  let source = read(path);
  source = replaceOnce(
    source,
    '  if (!SETUP_PHASES.has(game.phase)) return null;\n',
    `  const updateShirtNumber = (raw: string | number) => {\n    const number = Math.max(1, Math.min(99, Number(raw) || DEFAULT_NUMBER[game.position]));\n    setShirtNumberInput(String(number));\n    setGame((current) => ({ ...current, number }));\n  };\n\n  const adjustShirtNumber = (delta: number) => {\n    const current = Math.max(1, Math.min(99, Number(shirtNumberInput) || DEFAULT_NUMBER[game.position]));\n    updateShirtNumber(current + delta);\n  };\n\n  if (!SETUP_PHASES.has(game.phase)) return null;\n`,
    "shirt helpers",
  );
  source = replaceOnce(source, '  if (game.phase === "appearance") {\n    return (\n      <section className={styles.page}>', '  if (game.phase === "appearance") {\n    return (\n      <section className={`${styles.page} ${styles.positionPage}`}>', "position page class");
  source = replaceOnce(source, '                className={`${styles.position} ${game.position === item.key ? styles.positionSelected : ""}`}', '                className={styles.position}', "remove default MEI selection");
  source = replaceOnce(
    source,
    '          <div className={styles.shirtNumber}><small>CAMISA</small><input type="number" min={1} max={99} inputMode="numeric" value={shirtNumberInput} onChange={(event) => { const value = event.target.value; setShirtNumberInput(value); if (value) setGame((current) => ({ ...current, number: Math.max(1, Math.min(99, Number(value) || DEFAULT_NUMBER[current.position])) })); }} /></div>',
    `          <div className={styles.shirtNumber}>\n            <small>CAMISA</small>\n            <div className={styles.shirtStepper}>\n              <button type="button" onClick={() => adjustShirtNumber(-1)} aria-label="Diminuir número da camisa">−</button>\n              <input type="text" inputMode="numeric" pattern="[0-9]*" value={shirtNumberInput} onChange={(event) => { const clean = event.target.value.replace(/\\D/g, "").slice(0, 2); setShirtNumberInput(clean); if (clean) setGame((current) => ({ ...current, number: Math.max(1, Math.min(99, Number(clean) || DEFAULT_NUMBER[current.position])) })); }} onBlur={() => updateShirtNumber(shirtNumberInput)} />\n              <button type="button" onClick={() => adjustShirtNumber(1)} aria-label="Aumentar número da camisa">＋</button>\n            </div>\n          </div>`,
    "physical shirt stepper",
  );

  const oldIdentity = `          {appearanceEnabled ? (\n            <div className={styles.appearanceWrap}><PlayerAppearanceEditor compact value={game.playerAppearance} onChange={(playerAppearance) => setGame((current) => ({ ...current, playerAppearance }))} playerName={game.name} number={game.number} /></div>\n          ) : <div className={styles.appearanceDisabled}><b>#{game.number}</b><strong>{game.name}</strong><small>Personagens personalizados estão desativados nas configurações.</small></div>}\n          <aside className={styles.identityOptions}>\n            <button type="button" className={styles.optionCard} onClick={() => setCountryPickerOpen(true)}><NationBadge country={selectedCountry} size="md" /><span><small>PAÍS</small><strong>{selectedCountry.name}</strong></span><b>›</b></button>\n            <button type="button" className={\`${styles.optionCard} ${styles.storyOption}\`} onClick={() => setStoryPickerOpen(true)}><span className={styles.storyIcon}>{selectedStory.icon}</span><span><small>{selectedStory.tagline}</small><strong>{displayStoryTitle(selectedStory.id, selectedStory.title)}</strong></span><b>›</b></button>\n            <button className={styles.primary} type="button" onClick={goClub}>Escolher primeiro clube <b>→</b></button>\n          </aside>`;
  const newIdentity = `          {appearanceEnabled ? (\n            <div className={styles.appearanceWrap}>\n              <PlayerAppearanceEditor\n                compact\n                value={game.playerAppearance}\n                onChange={(playerAppearance) => setGame((current) => ({ ...current, playerAppearance }))}\n                playerName={game.name}\n                number={game.number}\n                previewExtras={(\n                  <div className={styles.previewOptions}>\n                    <button type="button" className={styles.previewOption} onClick={() => setCountryPickerOpen(true)}><NationBadge country={selectedCountry} size="sm" /><span><small>PAÍS</small><strong>{selectedCountry.name}</strong></span><b>›</b></button>\n                    <button type="button" className={\`${styles.previewOption} ${styles.storyOption}\`} onClick={() => setStoryPickerOpen(true)}><span className={styles.storyIcon}>{selectedStory.icon}</span><span><small>{selectedStory.tagline}</small><strong>{displayStoryTitle(selectedStory.id, selectedStory.title)}</strong></span><b>›</b></button>\n                    <button className={\`${styles.primary} ${styles.previewContinue}\`} type="button" onClick={goClub}>Escolher primeiro clube <b>→</b></button>\n                  </div>\n                )}\n              />\n            </div>\n          ) : (\n            <div className={styles.appearanceDisabled}>\n              <b>#{game.number}</b><strong>{game.name}</strong><small>Personagens personalizados estão desativados nas configurações.</small>\n              <div className={styles.previewOptions}>\n                <button type="button" className={styles.previewOption} onClick={() => setCountryPickerOpen(true)}><NationBadge country={selectedCountry} size="sm" /><span><small>PAÍS</small><strong>{selectedCountry.name}</strong></span><b>›</b></button>\n                <button type="button" className={\`${styles.previewOption} ${styles.storyOption}\`} onClick={() => setStoryPickerOpen(true)}><span className={styles.storyIcon}>{selectedStory.icon}</span><span><small>{selectedStory.tagline}</small><strong>{displayStoryTitle(selectedStory.id, selectedStory.title)}</strong></span><b>›</b></button>\n                <button className={\`${styles.primary} ${styles.previewContinue}\`} type="button" onClick={goClub}>Escolher primeiro clube <b>→</b></button>\n              </div>\n            </div>\n          )}`;
  source = replaceOnce(source, oldIdentity, newIdentity, "identity options under preview");
  write(path, source);
}

appendOnce(
  "app/components/career/PlayerCreationV2.module.css",
  "/* UX POLISH V2 */",
  String.raw`
/* UX POLISH V2 */
.positionPage { height:100dvh; min-height:100dvh; overflow:hidden; }
.positionPage .fieldStage {
  height:calc(100dvh - 68px);
  min-height:0;
  padding:clamp(7px,1.4dvh,14px) 0 8px;
  grid-template-rows:minmax(0,1fr) auto;
  align-items:center;
}
.positionPage .pitch {
  min-height:0;
  height:min(680px,calc(100dvh - 116px));
  width:auto;
  max-width:min(100%,470px);
}
.position { width:clamp(44px,7.2dvh,61px); height:clamp(44px,7.2dvh,61px); }

.shirtStepper { display:grid; grid-template-columns:58px minmax(0,180px) 58px; align-items:stretch; gap:8px; }
.shirtStepper input {
  width:100%;
  min-width:0;
  border:0;
  border-bottom:2px solid #f4c430;
  outline:0;
  background:transparent;
  color:white;
  text-align:center;
  font:1000 104px/.9 "Arial Narrow",Impact,sans-serif;
  -moz-appearance:textfield;
}
.shirtStepper button {
  align-self:center;
  width:58px;
  height:58px;
  border:1px solid rgba(244,196,48,.28);
  border-radius:12px;
  background:#111a15;
  color:#f4c430;
  font-size:28px;
  font-weight:900;
  cursor:pointer;
}
.shirtStepper button:hover { border-color:#f4c430; background:#1a2116; }

.identityStage { width:min(1180px,calc(100% - 28px)); grid-template-columns:1fr; padding-top:18px; }
.appearanceWrap { width:100%; min-width:0; }
.appearanceWrap :global(.appearance-editor) { width:100% !important; max-width:none !important; }
.appearanceWrap :global(.appearance-preview-extras) { width:100%; }
.previewOptions { width:100%; display:grid; gap:7px; margin-top:7px; }
.previewOption {
  width:100%;
  min-height:54px;
  border:1px solid rgba(255,255,255,.11);
  border-radius:9px;
  background:#101914;
  color:white;
  display:grid;
  grid-template-columns:40px minmax(0,1fr) 14px;
  align-items:center;
  gap:8px;
  padding:7px 9px;
  text-align:left;
  cursor:pointer;
}
.previewOption > span:nth-child(2) { display:grid; gap:3px; min-width:0; }
.previewOption small { color:#789083; font:800 7px/1 ui-monospace,monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.previewOption strong { font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.previewOption > b { justify-self:end; }
.previewOption .storyIcon, .storyIcon { width:34px; height:34px; font-size:14px; }
.previewOption :global(.nation-badge) { max-width:36px; max-height:36px; }
.previewContinue { width:100%; min-height:48px; }

/* The picker is a vertical flex stack so search/warning can never sit behind results. */
.picker { display:flex; flex-direction:column; grid-template-rows:none; }
.picker > header, .warning, .search { flex:0 0 auto; }
.pickerGrid, .allClubs, .storyList { min-height:0; flex:1 1 auto; }

.publicProfileFix { min-height:0; }

@media (max-width:760px) {
  .positionPage .fieldStage { height:calc(100dvh - 68px); padding-top:6px; }
  .positionPage .pitch { height:min(590px,calc(100dvh - 112px)); max-width:calc(100% - 4px); padding:18px 13px; }
  .position { width:clamp(42px,7dvh,53px); height:clamp(42px,7dvh,53px); }

  .shirtStepper { grid-template-columns:52px minmax(0,160px) 52px; justify-content:center; }
  .shirtStepper input { font-size:88px; }
  .shirtStepper button { width:52px; height:52px; }

  .identityStage { grid-template-columns:1fr; width:min(100% - 18px,760px); padding-top:9px; }
  .appearanceWrap { max-height:calc(100dvh - 88px); }
  .appearanceWrap :global(.appearance-editor) { grid-template-columns:150px minmax(0,1fr) !important; }
  .appearanceWrap :global(.appearance-preview) { z-index:2; }
  .previewOptions { gap:5px; margin-top:5px; }
  .previewOption { min-height:44px; grid-template-columns:32px minmax(0,1fr) 10px; gap:5px; padding:5px 6px; }
  .previewOption :global(.nation-badge) { width:30px !important; height:30px !important; min-width:30px !important; }
  .previewOption .storyIcon, .storyIcon { width:30px; height:30px; }
  .previewOption strong { font-size:9px; }
  .previewOption small { font-size:6px; }
  .previewContinue { min-height:44px; font-size:10px; padding-inline:9px; }

  .clubCards > button { grid-template-columns:46px minmax(0,1fr) 20px; min-width:0; }
  .clubCards :global(.club-badge-md) { width:44px !important; height:44px !important; min-width:44px !important; }
  .allClubs button { min-width:0; }
  .allClubs button > span { min-width:0; }
  .allClubs strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .allClubs :global(.club-badge-sm) { width:40px !important; height:40px !important; min-width:40px !important; }

  .contractOffers button { grid-template-columns:58px minmax(0,1fr) 20px; gap:10px; min-width:0; }
  .contractOffers :global(.club-badge-lg) { width:58px !important; height:58px !important; min-width:58px !important; }
  .contractOffers span { min-width:0; }
  .contractOffers strong { font-size:16px; overflow-wrap:anywhere; }
}

@media (max-width:480px) {
  .positionPage .pitch { height:min(520px,calc(100dvh - 108px)); }
  .position { width:clamp(39px,6.7dvh,49px); height:clamp(39px,6.7dvh,49px); }
  .position small { display:none; }

  .appearanceWrap :global(.appearance-editor) { grid-template-columns:140px minmax(0,1fr) !important; }
  .appearanceWrap :global(.appearance-preview canvas) { width:116px !important; height:116px !important; }
  .appearanceWrap :global(.appearance-preview strong), .appearanceWrap :global(.appearance-preview small) { max-width:122px; }
  .appearanceWrap :global(.appearance-palette button) { width:26px !important; height:26px !important; min-width:26px !important; }

  .contractOffers button { grid-template-columns:52px minmax(0,1fr) 18px; padding:11px 9px; }
  .contractOffers :global(.club-badge-lg) { width:52px !important; height:52px !important; min-width:52px !important; }
}
`,
);

// ---------------------------------------------------------------------------
// Player/statistics: force one dependable vertical flow everywhere.
// ---------------------------------------------------------------------------
{
  const path = "app/components/career/CareerReworkPanels.tsx";
  let source = read(path);
  source = replaceOnce(source, '  return (\n    <>\n      <section className={styles.playerEssentials}>', '  return (\n    <div className={styles.playerStack}>\n      <section className={styles.playerEssentials}>', "player stack opening");
  source = replaceOnce(source, '      )}\n    </>\n  );\n}\n\nexport function CareerStatisticsArchive', '      )}\n    </div>\n  );\n}\n\nexport function CareerStatisticsArchive', "player stack closing");
  write(path, source);
}

appendOnce(
  "app/components/career/CareerReworkPanels.module.css",
  "/* UX POLISH V2 */",
  String.raw`
/* UX POLISH V2 */
.playerStack { width:100%; min-width:0; display:grid; grid-template-columns:1fr; gap:12px; }
.playerStack .playerEssentials, .playerStack .publicProfile { margin:0; }
.publicProfile { grid-template-columns:1fr !important; }
.publicProfile > * { min-height:0; }
.statisticsArchive { width:100%; min-width:0; }
`,
);

appendOnce(
  "app/components/career/CareerExtraStats.module.css",
  "/* UX POLISH V2 */",
  String.raw`
/* UX POLISH V2 */
.grid { grid-template-columns:1fr; }
.grid > article { min-height:0; }
`,
);

// ---------------------------------------------------------------------------
// Sem história definida is now genuinely no-story, not a renamed preset.
// ---------------------------------------------------------------------------
{
  const path = "app/player-stories.ts";
  let source = read(path);
  source = replaceOnce(source, '    title: "Uma página em branco",', '    title: "Sem história definida",', "open-book title");
  source = replaceOnce(source, '    tagline: "Nenhum rótulo veio antes de você.",', '    tagline: "Sem eventos de história. Só futebol.",', "open-book tagline");
  source = replaceOnce(source, '    description: "Não existe sobrenome famoso, grande trauma ou profecia. A história nasce apenas do que acontecer na carreira — e isso também pode ser extraordinário.",', '    description: "Modo direto para quem quer jogar a carreira sem capítulos de origem ou eventos exclusivos de história.",', "open-book description");
  source = replaceOnce(source, '    promise: "Começo neutro e capítulos construídos inteiramente pelos acontecimentos do save.",', '    promise: "Nenhum evento de história pós-temporada; o foco fica no futebol e nos sistemas gerais da carreira.",', "open-book promise");
  write(path, source);
}

{
  const path = "app/career/events.ts";
  let source = read(path);
  source = replaceOnce(source, '  if (seeded(state.seed, state.season * 1871 + salt) < 0.18) return DYNAMIC_STORY_EVENT_ID;', '  if (state.playerStoryId !== "open-book" && seeded(state.seed, state.season * 1871 + salt) < 0.18) return DYNAMIC_STORY_EVENT_ID;', "skip dynamic story for open-book");
  source = replaceOnce(source, '): StoryDecision | null {\n  const story = playerStoryById(state.playerStoryId);', '): StoryDecision | null {\n  if (state.playerStoryId === "open-book") return null;\n  const story = playerStoryById(state.playerStoryId);', "skip season story decision for open-book");
  write(path, source);
}

// ---------------------------------------------------------------------------
// Three more eye colors so the palette has the same horizontal rhythm.
// ---------------------------------------------------------------------------
{
  const path = "app/player-appearance.ts";
  let source = read(path);
  source = replaceOnce(source, 'export const EYE_COLORS = ["#111816", "#35251d", "#31505b", "#49633c", "#765139", "#7c8f98", "#5c3f76"];', 'export const EYE_COLORS = ["#111816", "#35251d", "#31505b", "#49633c", "#765139", "#7c8f98", "#5c3f76", "#1f6a74", "#9a742d", "#9eb4cf"];', "eye palette expansion");
  write(path, source);
}

console.log("Applied Futbobo UX polish v2.");
