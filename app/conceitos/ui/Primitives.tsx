import Link from "next/link";
import FutboboIcon, { type FutboboIconName } from "../../components/FutboboIcon";
import { CHAPTERS, STAT_LABELS, type Chapter, type Choice, type DemoState, type Stat } from "../model";
import s from "./lab.module.css";

export type Panel = "new" | "profile" | "history" | "settings" | "modes" | "about";
export type ScreenProps = {
  state: DemoState; event: Chapter; selected: number | null;
  result: Choice | null; onSelect: (index: number) => void; onConfirm: () => void;
  onNext: () => void; onPlay: () => void; onMenu: () => void;
  onPanel: (panel: Panel) => void;
};

export function Icon({ name, size = 20 }: { name: FutboboIconName; size?: number }) {
  return <FutboboIcon name={name} size={size} />;
}
export function Arrow() { return <Icon name="arrow-right" />; }
export function Brand({ small = false }: { small?: boolean }) {
  return <span className={`${s.brand} ${small ? s.brandSmall : ""}`}><Icon name="ball" size={small ? 24 : 30} /><span>futbobo<span className={s.brandDot}>®</span></span></span>;
}
export function Label({ children }: { children: React.ReactNode }) { return <span className={s.eyebrow}>{children}</span>; }
export function Primary({ children, onClick, disabled = false }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className={s.primary} onClick={onClick} disabled={disabled}>{children}<Arrow /></button>;
}
export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`${s.avatar} ${large ? s.avatarLarge : ""}`} aria-label={`Jogador ${name}`}><span>10</span></span>;
}
export function Identity({ state, compact = false }: { state: DemoState; compact?: boolean }) {
  return <div className={s.identity}><Avatar name={state.name} /><span><strong>{state.name}</strong><small>{compact ? `${state.club} · ATA` : `${state.club} · 18 anos · Atacante`}</small></span><b className={s.overall}>{state.stats.overall}<small>OVR</small></b></div>;
}
export function Stats({ state }: { state: DemoState }) {
  return <div className={s.stats}>{(["overall", "morale", "fitness", "trust"] as Stat[]).map(key => <div className={s.stat} key={key}><span>{STAT_LABELS[key]}<b>{state.stats[key]}</b></span><meter min={0} max={99} value={state.stats[key]} aria-label={STAT_LABELS[key]} /></div>)}</div>;
}
export function ChapterTrack({ state }: { state: DemoState }) {
  return <div className={s.chapterTrack} aria-label={`${state.chapter} de ${CHAPTERS.length} decisões concluídas`}>{CHAPTERS.map((ch, i) => <span key={ch.tag} className={state.chapter > i ? s.trackDone : state.chapter === i ? s.trackCurrent : ""}><i>{state.chapter > i ? "✓" : `0${i + 1}`}</i><span>{["A chance", "O clássico", "A vitrine"][i]}</span></span>)}</div>;
}
export function Effects({ choice, state }: { choice: Choice; state?: DemoState }) {
  return <span className={s.effects}>{(Object.entries(choice.effects) as [Stat, number][]).map(([key, delta]) => { const n = state ? Math.max(0, Math.min(99, state.stats[key] + delta)) - state.stats[key] : delta; return <span key={key} className={n >= 0 ? s.positive : s.negative}>{n >= 0 ? "+" : ""}{n} {STAT_LABELS[key]}</span>; })}</span>;
}
export function EventCopy({ event, result }: { event: Chapter; result: Choice | null }) {
  return <div className={s.eventCopy}><Label>{result ? "O QUE SUA ESCOLHA MUDOU" : event.tag}</Label><h1 tabIndex={-1} data-event-heading>{result ? "Sua história avançou." : event.title}</h1><p>{result ? result.result : event.description}</p>{result ? <div className={s.resultEffects}><Icon name="check" /><span><small>VOCÊ ESCOLHEU</small><strong>{result.title}</strong><Effects choice={result} /></span></div> : null}</div>;
}
export function Choices({ state, event, selected, result, onSelect, onConfirm, onNext }: ScreenProps) {
  if (result) return <div className={s.resultActions}><span className={s.saved}><i /> Decisão registrada nesta demonstração</span><Primary onClick={onNext}>Continuar a história</Primary></div>;
  return <div className={s.choices}>
    <div className={s.choiceTop}><Label>QUAL VAI SER O SEU CAMINHO?</Label><span>01 — 03</span></div>
    <div className={s.choiceList}>{event.choices.map((choice, i) => <button type="button" data-choice-option className={`${s.choice} ${selected === i ? s.choiceSelected : ""}`} aria-pressed={selected === i} onClick={() => onSelect(i)} key={choice.title}><span className={s.choiceNumber}>0{i + 1}</span><span className={s.choiceText}><strong>{choice.title}</strong><small>{choice.hint}</small>{selected === i ? <Effects choice={choice} state={state} /> : null}</span><span className={s.choiceMark}>{selected === i ? <Icon name="check" size={21} /> : <Arrow />}</span></button>)}</div>
    <div className={s.decisionFooter}><span>{selected === null ? "Sem pressa. A escolha é sua." : event.choices[selected].risk}</span><Primary onClick={onConfirm} disabled={selected === null}>Confirmar escolha</Primary></div>
  </div>;
}
export function GameNav({ onPanel, onMenu }: Pick<ScreenProps, "onPanel" | "onMenu">) {
  return <nav className={s.gameNav} aria-label="Navegação da carreira"><button type="button" onClick={onMenu}><Icon name="arrow-left" /><span>Menu</span></button><button type="button" onClick={() => onPanel("profile")}><Icon name="player" /><span>Jogador</span></button><button type="button" onClick={() => onPanel("history")}><Icon name="history" /><span>História</span></button><button type="button" onClick={() => onPanel("settings")}><Icon name="settings" /><span>Ajustes</span></button></nav>;
}
export function MenuLinks({ onPanel }: Pick<ScreenProps, "onPanel">) {
  return <nav className={s.menuLinks} aria-label="Mais opções"><button type="button" onClick={() => onPanel("new")}>Nova carreira <span>↗</span></button><button type="button" onClick={() => onPanel("history")}>Minha história <span>↗</span></button><button type="button" onClick={() => onPanel("settings")}>Configurações <Icon name="settings" size={17} /></button></nav>;
}
export function QuickModes() {
  return <div className={s.quickModes}><Link href="https://futbobo.top/copa/"><Icon name="trophy" /><span>Copa do Mundo<small>Uma seleção. Um sonho.</small></span><Arrow /></Link><Link href="https://futbobo.top/x1/"><Icon name="ball" /><span>Futebol de botão<small>Um clássico com os amigos.</small></span><Arrow /></Link></div>;
}
export function PixelPitch({ compact = false }: { compact?: boolean }) {
  return <svg className={`${s.pixelPitch} ${compact ? s.pixelCompact : ""}`} viewBox="0 0 440 300" role="img" aria-label="Campo de futebol em pixel art com jogadores e bola" shapeRendering="crispEdges"><rect width="440" height="300" fill="#526f48" />{[0, 2, 4, 6, 8].map(i => <rect key={i} x={0} y={i * 33} width={440} height={33} fill="#5b7950" />)}<g stroke="#dddcc2" strokeWidth="3" fill="none"><rect x="28" y="24" width="384" height="252" /><path d="M220 24v252M28 93h65v114H28M412 93h-65v114h65M28 122h23v56H28M412 122h-23v56h23" /><path d="M197 114h46v9h13v54h-13v9h-46v-9h-13v-54h13z" /></g>{[[100, 65, "#ffc35c"], [162, 200, "#ffc35c"], [210, 145, "#ffc35c"], [280, 80, "#ebe0c2"], [315, 218, "#ebe0c2"], [364, 143, "#ebe0c2"]].map(([x, y, color], i) => <g key={i} transform={`translate(${x},${y})`}><rect x="-8" y="16" width="26" height="7" fill="#263f32" /><rect width="12" height="10" fill="#b48661" /><rect x="-5" y="10" width="22" height="16" fill={String(color)} /><rect x="-3" y="26" width="7" height="10" fill="#282b44" /><rect x="9" y="26" width="7" height="10" fill="#282b44" /></g>)}<rect x="237" y="171" width="9" height="9" fill="#fff9dc" /><rect x="240" y="174" width="3" height="3" fill="#292741" /></svg>;
}
