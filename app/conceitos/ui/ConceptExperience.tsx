"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CONCEPTS, type Concept } from "../data";
import { CHAPTERS, newDemo, resolveDemo, restoreDemo, type Choice, type DemoState, type Stat } from "../model";
import { Brand, ChapterTrack, Icon, Identity, Label, Primary, QuickModes, Stats, type Panel, type ScreenProps } from "./Primitives";
import { FocusMenu, HolofoteMenu, LegacyMenu, NewspaperMenu, ResenhaMenu, RetroMenu } from "./MenuScreens";
import { FocusGame, HolofoteGame, LegacyGame, NewspaperGame, ResenhaGame, RetroGame } from "./GameScreens";
import s from "./lab.module.css";

const MENUS = { holofote: HolofoteMenu, resenha: ResenhaMenu, "primeira-pagina": NewspaperMenu, legado: LegacyMenu, "fita-98": RetroMenu, "proximo-lance": FocusMenu };
const GAMES = { holofote: HolofoteGame, resenha: ResenhaGame, "primeira-pagina": NewspaperGame, legado: LegacyGame, "fita-98": RetroGame, "proximo-lance": FocusGame };

export default function ConceptExperience({ concept }: { concept: Concept }) {
  const [state, setState] = useState<DemoState>(newDemo);
  const [view, setView] = useState<"menu" | "game">("menu");
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Choice | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [phone, setPhone] = useState(false);
  const [still, setStill] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const resultLock = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const storageKey = `futbobo:concept-lab:v1:${concept.id}`;

  useEffect(() => {
    try { setState(restoreDemo(localStorage.getItem(storageKey))); } catch { setStorageError(true); }
    if (window.location.hash === "#jogo") setView("game");
  }, [storageKey]);

  const persist = (next: DemoState) => {
    setState(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { setStorageError(true); }
  };
  const changeView = (next: "menu" | "game") => {
    setView(next);
    setSelected(null);
    setResult(null);
    resultLock.current = false;
    window.history.replaceState(null, "", next === "game" ? "#jogo" : "#menu");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const event = CHAPTERS[Math.min(state.chapter - (result ? 1 : 0), CHAPTERS.length - 1)];
  const confirm = () => {
    if (selected === null || result || resultLock.current || state.chapter >= CHAPTERS.length) return;
    resultLock.current = true;
    const choice = event.choices[selected];
    const resolved = resolveDemo(state, selected);
    const actualEffects = Object.fromEntries((Object.keys(choice.effects) as Stat[]).map(key => [key, resolved.stats[key] - state.stats[key]]));
    setResult({ ...choice, effects: actualEffects });
    persist(resolved);
    setSelected(null);
    requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>("[data-event-heading]")?.focus());
  };
  const next = () => {
    setResult(null);
    setSelected(null);
    resultLock.current = false;
    requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>("[data-event-heading]")?.focus());
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (panel || target.closest("input, textarea, select, [contenteditable=true]") || e.altKey || e.metaKey || e.ctrlKey) return;
      if (view !== "game") return;
      if (["1", "2", "3"].includes(e.key) && !result && state.chapter < CHAPTERS.length) { e.preventDefault(); setSelected(Number(e.key) - 1); }
      if (e.key === "Enter" && !target.closest("a,button:not([data-choice-option])") && (selected !== null || result)) { e.preventDefault(); if (result) next(); else confirm(); }
      if (e.key === "Escape") { e.preventDefault(); changeView("menu"); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const props: ScreenProps = { state, event, selected, result, onSelect: setSelected, onConfirm: confirm, onNext: next, onPlay: () => changeView("game"), onMenu: () => changeView("menu"), onPanel: setPanel };
  const Menu = MENUS[concept.id];
  const Game = GAMES[concept.id];
  const completed = state.chapter >= CHAPTERS.length && !result;

  return <div className={`${s.lab} ${s[concept.id]} ${still ? s.still : ""} ${largeText ? s.largeText : ""}`}>
    <div className={s.labToolbar}><Link href="/conceitos" className={s.labBack}><Icon name="arrow-left" size={16} /><span>Os seis conceitos</span></Link><nav className={s.labConceptNav} aria-label="Escolher conceito">{CONCEPTS.map(c => <Link key={c.id} href={`/conceitos/${c.id}/`} aria-current={c.id === concept.id ? "page" : undefined} title={c.name}><span>{c.number}</span><span>{c.name}</span></Link>)}</nav><div className={s.labTools}><button type="button" className={phone ? s.toolActive : ""} aria-pressed={phone} onClick={() => setPhone(v => !v)} title="Alternar prévia com largura de celular"><svg width="15" height="18" viewBox="0 0 15 20" fill="none" aria-hidden="true"><rect x="2" y="1" width="11" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M6 16h3" stroke="currentColor" strokeWidth="1.5" /></svg><span>Celular</span></button><button type="button" onClick={() => setPanel("about")} aria-label="Sobre este conceito"><span className={s.infoGlyph}>i</span></button></div></div>
    <div className={s.labSubbar}><div><span style={{ background: concept.accent }} /><strong>{concept.name}</strong><span>{concept.category}</span></div><div className={s.viewSwitch} aria-label="Tela do conceito"><button type="button" aria-pressed={view === "menu"} onClick={() => changeView("menu")}>Menu inicial</button><button type="button" aria-pressed={view === "game"} onClick={() => changeView("game")}>Tela de escolhas</button></div><span className={s.demoBadge}>PROTÓTIPO INTERATIVO</span></div>
    <div className={`${s.previewSurround} ${phone ? s.phoneSurround : ""}`}><div className={`${s.viewport} ${phone ? s.phoneViewport : ""}`}><div className={s.stage} ref={stage} data-view={view}>
      {view === "menu" ? <Menu {...props} /> : completed ? <div className={s.completed}><Brand /><Label>UMA TEMPORADA. TRÊS DECISÕES. A SUA HISTÓRIA.</Label><h1>O começo<br /><em>é só seu.</em></h1><Identity state={state} /><Stats state={state} /><p>Você chegou ao fim desta demonstração. Cada escolha mudou seus números e ficou no arquivo. A carreira completa continua no Futbobo.</p><ChapterTrack state={state} /><Primary onClick={() => setPanel("history")}>Rever minhas escolhas</Primary><div><button type="button" onClick={() => setPanel("new")}>Jogar outra história</button><button type="button" onClick={() => changeView("menu")}>Voltar ao menu</button><Link href="https://futbobo.top/">Ir para o jogo completo ↗</Link></div></div> : <Game {...props} />}
    </div></div></div>
    <footer className={s.labFootnote}><span>{concept.number} / 06 <b>{concept.signature}</b></span><span>{storageError ? "Armazenamento indisponível: progresso somente nesta sessão." : "Dados de demonstração · seus saves do Futbobo ficam separados."}</span><span>Explore. Jogue. Escolha seu futuro.</span></footer>
    {panel ? <LabDialog panel={panel} concept={concept} state={state} close={() => setPanel(null)} still={still} setStill={setStill} largeText={largeText} setLargeText={setLargeText} start={name => { persist(newDemo(name)); setPanel(null); changeView("game"); }} /> : null}
  </div>;
}

function LabDialog({ panel, concept, state, close, start, still, setStill, largeText, setLargeText }: { panel: Panel; concept: Concept; state: DemoState; close: () => void; start: (name: string) => void; still: boolean; setStill: (v: boolean) => void; largeText: boolean; setLargeText: (v: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const title = { new: "Uma nova história.", profile: "O seu camisa 10.", history: "O caminho até aqui.", settings: "Do seu jeito.", modes: "Qual é o jogo de hoje?", about: concept.name }[panel];
  return <dialog ref={ref} className={`${s.dialog} ${s[concept.id]}`} aria-labelledby="lab-dialog-title" onClose={close} onClick={e => { if (e.target === ref.current) close(); }}><div className={s.dialogHeader}><Label>{panel === "about" ? `CONCEITO ${concept.number} / 06` : "FUTBOBO · DEMONSTRAÇÃO"}</Label><button type="button" onClick={close} aria-label="Fechar diálogo">×</button></div><h2 id="lab-dialog-title">{title}</h2>
    {panel === "new" ? <form onSubmit={e => { e.preventDefault(); start(String(new FormData(e.currentTarget).get("name") ?? "")); }}><p>Como o estádio vai gritar o seu nome?</p><label className={s.inputLabel}>Nome do jogador<input name="name" defaultValue={state.name} maxLength={28} required minLength={2} autoComplete="off" /></label><span className={s.dialogNote}>Esta é uma minicarreira de três decisões. Começar reinicia somente a demonstração deste conceito.</span><button type="submit" className={s.primary}>Entrar para a história <Icon name="arrow-right" /></button></form> : null}
    {panel === "profile" ? <><Identity state={state} /><Stats state={state} /><div className={s.profileDetails}><span><small>POSIÇÃO</small><b>Atacante</b></span><span><small>IDADE</small><b>18 anos</b></span><span><small>CONTRATO</small><b>Até 2028</b></span><span><small>PÉ PREFERIDO</small><b>Direito</b></span></div><p>Formado na base. Sonhando com o mundo. Esta ficha acompanha os efeitos das suas escolhas na demonstração.</p><ChapterTrack state={state} /></> : null}
    {panel === "history" ? <><p>As escolhas ficam. O próximo capítulo ainda é seu.</p>{state.history.length ? <ol className={s.historyList}>{state.history.map(h => <li key={h.chapter}><span>0{h.chapter + 1}</span><div><small>{CHAPTERS[h.chapter].title}</small><strong>{CHAPTERS[h.chapter].choices[h.choice].title}</strong><p>{CHAPTERS[h.chapter].choices[h.choice].result}</p></div></li>)}</ol> : <div className={s.emptyHistory}><Icon name="history" size={36} /><h3>Seu arquivo começa em campo.</h3><p>Entre na tela de escolhas e escreva a primeira página.</p><Primary onClick={close}>Vamos lá</Primary></div>}</> : null}
    {panel === "settings" ? <><p>Pequenos ajustes para uma boa partida.</p><label className={s.settingRow}><span><strong>Reduzir movimento</strong><small>Desativa as transições desta demonstração.</small></span><input type="checkbox" checked={still} onChange={e => setStill(e.target.checked)} /></label><label className={s.settingRow}><span><strong>Texto de leitura maior</strong><small>Amplia narrativa e pistas das escolhas.</small></span><input type="checkbox" checked={largeText} onChange={e => setLargeText(e.target.checked)} /></label><div className={s.shortcutGuide}><Label>NO TECLADO</Label><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> escolher uma resposta</span><span><kbd>Enter</kbd> confirmar / continuar</span><span><kbd>Esc</kbd> voltar ao menu / fechar diálogo</span></div><span className={s.dialogNote}>O ajuste de movimento do seu sistema também é respeitado.</span></> : null}
    {panel === "modes" ? <><p>As portas para os modos completos do Futbobo.</p><QuickModes /><Link className={s.fullGameLink} href="https://futbobo.top/">Jogar a carreira completa <Icon name="arrow-right" /></Link><span className={s.dialogNote}>Esses links abrem o jogo real e saem da demonstração.</span></> : null}
    {panel === "about" ? <><Label>{concept.category}</Label><p className={s.aboutLine}>{concept.line}</p><p>{concept.description}</p><div className={s.aboutFacts}><span><small>ASSINATURA</small><strong>{concept.signature}</strong></span><span><small>ARQUITETURA</small><strong>{concept.architecture}</strong></span><span><small>NO CELULAR</small><strong>{concept.mobile}</strong></span></div><span className={s.dialogNote}>Explore menu, escolhas, consequência e histórico. As seis direções usam o mesmo cenário para você comparar a experiência.</span></> : null}
  </dialog>;
}
