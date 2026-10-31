"use client";

// Editor do time ("Editar time"): identidade, cores, uniforme, escudo e os cinco
// jogadores. Salva sozinho 400 ms depois de cada mudança, mas só rascunho que
// passa na validação: o aparelho sempre guarda a última cópia válida.
// O rascunho fica aqui (null = sem mudança local, vale o que está salvo).

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CELEBRATION_OPTIONS, KIT_PATTERN_NAMES } from "../../player-appearance";
import { PlayerAppearancePortrait } from "../../PlayerAppearanceEditor";
import { claimBack } from "../screen-history";
import type { BobPlayer, BobTeam } from "../types";
import BobCrest from "./BobCrest";
import { CREST_SHAPE_NAMES, kitSvg } from "./crest";
import { newSeed, randomBobTeam } from "./generator";
import { LIMITS, abbrChars, cleanText, deriveAbbr, deriveShortName, validateTeamDraft, type TeamDraftIssue } from "./model";
import PlayerSheet from "./PlayerSheet";
import TeamCodeSheet, { ConfirmSheet, TeamsToastHost } from "./TeamCodeSheet";
import { getBobStoreSnapshot, removeTeam, saveTeam, setActiveTeam, showTeamsToast, useBobTeams } from "./team-storage";
import "./teams.css";

const AUTOSAVE_MS = 400;

/** 12 cores de atalho (o seletor nativo ao lado escolhe qualquer outra). */
const PRESET_COLORS: ReadonlyArray<{ hex: string; name: string }> = [
  { hex: "#f5f5f0", name: "Branco" },
  { hex: "#111111", name: "Preto" },
  { hex: "#c8102e", name: "Vermelho" },
  { hex: "#7a1f2b", name: "Grená" },
  { hex: "#ff7a1a", name: "Laranja" },
  { hex: "#ffd200", name: "Amarelo" },
  { hex: "#0b6b45", name: "Verde" },
  { hex: "#0e7c86", name: "Verde-água" },
  { hex: "#1e88e5", name: "Azul-celeste" },
  { hex: "#14213d", name: "Azul-marinho" },
  { hex: "#6b2fa3", name: "Roxo" },
  { hex: "#ff4fa3", name: "Rosa" },
];

type ColorSlot = "primary" | "secondary";
type Confirm = "shuffle" | "delete" | "leave" | null;
type Sheet = { kind: "player"; index: number } | { kind: "export"; team: BobTeam } | null;

/** "Não salvo: corrija …" com o primeiro campo que falha. */
function issueLabel(issue: TeamDraftIssue, team: BobTeam): string {
  if (issue.field === "name") return "o nome do time";
  if (issue.field === "shortName") return "o nome curto";
  if (issue.field === "abbr") return "a sigla";
  const match = /^players\.(\d+)\.(name|number)$/.exec(issue.field);
  if (!match) return "o elenco";
  const player = team.players[Number(match[1])];
  if (match[2] === "name") return `o nome do jogador ${Number(match[1]) + 1}`;
  return `o número de ${cleanText(player?.name, LIMITS.playerName[1]) || `jogador ${Number(match[1]) + 1}`}`;
}

function Field({ label, htmlFor, error, counter, children }: { label: string; htmlFor: string; error?: string; counter?: string; children: ReactNode }) {
  return (
    <div className="bob-field" data-invalid={error ? "true" : undefined}>
      <label htmlFor={htmlFor}>{label}{counter && <small>{counter}</small>}</label>
      {children}
      {error && <small id={`${htmlFor}-erro`} className="bob-field-error">{error}</small>}
    </div>
  );
}

function KitThumb({ pattern, primary, secondary, size = 40 }: { pattern: number; primary: string; secondary: string; size?: number }) {
  // kitSvg só aceita cor "#rrggbb" e número de estampa: seguro como innerHTML.
  return <span className="bob-kit-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: kitSvg(pattern, primary, secondary, size) }} />;
}

export default function TeamEditor({ teamId, onBack, stageNotice }: { teamId: string; onBack: () => void; stageNotice?: string }) {
  const { teams, active, ready } = useBobTeams();
  const saved = teams.find((team) => team.id === teamId) ?? null;
  const [draft, setDraft] = useState<BobTeam | null>(null);
  const [pending, setPending] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // Sigla e nome curto acompanham o nome até o usuário mexer neles.
  const [manual, setManual] = useState<{ abbr: boolean; shortName: boolean } | null>(null);
  const [colorSlot, setColorSlot] = useState<ColorSlot>("primary");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const baseId = useId();
  const latest = useRef<{ draft: BobTeam | null; pending: boolean; valid: boolean; gone: boolean }>({ draft: null, pending: false, valid: true, gone: false });

  const team = draft ?? saved;
  const issues = team ? validateTeamDraft(team) : [];
  const valid = issues.length === 0;

  // Autosave: 400 ms depois da última mudança, e só se o rascunho passa.
  useEffect(() => {
    if (!draft || !pending || !valid) return;
    const timer = setTimeout(() => {
      setSaveFailed(!saveTeam(draft));
      setPending(false);
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, pending, valid]);

  // Cópia do estado para o desmonte (a página pode trocar de tela sem passar pelo Voltar).
  useEffect(() => {
    latest.current = { ...latest.current, draft, pending, valid };
  });
  useEffect(() => {
    const state = latest;
    return () => {
      const { draft: last, pending: unsaved, valid: ok, gone } = state.current;
      if (last && unsaved && ok && !gone) saveTeam(last);
    };
  }, []);

  // Voltar do aparelho na tela "editor": fecha a folha ou a confirmação aberta; com o rascunho inválido pergunta antes de sair.
  useEffect(() => claimBack(() => {
    if (sheet) { setSheet(null); return true; }
    if (confirm) { setConfirm(null); return true; }
    if (!valid && draft) { setConfirm("leave"); return true; }
    return false;
  }));

  if (!ready) return <section className="bob-editor" aria-busy="true" />;

  if (!team) {
    return (
      <section className="bob-editor">
        <div className="bob-editor-bar"><button type="button" className="bob-back" onClick={onBack}>‹ Voltar</button></div>
        <header className="bob-screen-head"><span>VESTIÁRIO</span><h1>Editar time</h1><p>Esse time não está mais salvo neste aparelho.</p></header>
      </section>
    );
  }

  const current = team;
  const isActive = active.id === current.id;
  const autoAbbr = manual ? !manual.abbr : current.abbr === deriveAbbr(current.name);
  const autoShort = manual ? !manual.shortName : current.shortName === deriveShortName(current.name);
  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;

  function update(next: BobTeam) {
    setDraft(next);
    setPending(true);
  }

  function setName(name: string) {
    const next = { ...current, name };
    if (autoAbbr) next.abbr = deriveAbbr(name);
    if (autoShort) next.shortName = deriveShortName(name);
    setManual({ abbr: !autoAbbr, shortName: !autoShort });
    update(next);
  }

  function setShortName(shortName: string) {
    setManual({ abbr: !autoAbbr, shortName: shortName !== deriveShortName(current.name) });
    update({ ...current, shortName });
  }

  function setAbbr(raw: string) {
    const abbr = abbrChars(raw);
    setManual({ abbr: abbr !== deriveAbbr(current.name), shortName: !autoShort });
    update({ ...current, abbr });
  }

  function setColor(slot: ColorSlot, hex: string) {
    update({ ...current, [slot]: hex.toLowerCase() });
  }

  function setKitPattern(kitPattern: number) {
    // A estampa é do time: todos os jogadores vestem a mesma.
    update({ ...current, kitPattern, players: current.players.map((player) => ({ ...player, appearance: { ...player.appearance, kitPattern } })) });
  }

  function setPlayer(index: number, player: BobPlayer) {
    update({ ...current, players: current.players.map((item, at) => (at === index ? player : item)) });
  }

  /** Grava já o que estiver pendente e válido (antes de sair, usar ou exportar). */
  function flush(): BobTeam {
    if (draft && pending && valid) {
      setSaveFailed(!saveTeam(draft));
      setPending(false);
    }
    return getBobStoreSnapshot().teams.find((item) => item.id === current.id) ?? current;
  }

  function leave() {
    if (!valid && draft) {
      setConfirm("leave");
      return;
    }
    flush();
    onBack();
  }

  function useThisTeam() {
    flush();
    if (setActiveTeam(current.id)) showTeamsToast(`${cleanText(current.name, LIMITS.teamName[1])} é o time em uso`);
  }

  function shuffleAll() {
    const fresh = randomBobTeam(newSeed(), { id: current.id, now: current.createdAt });
    setManual({ abbr: false, shortName: false });
    update({ ...fresh, createdAt: current.createdAt });
    setConfirm(null);
  }

  function deleteTeam() {
    latest.current.gone = true;
    setPending(false);
    setConfirm(null);
    if (removeTeam(current.id)) {
      showTeamsToast("Time excluído");
      onBack();
    } else {
      latest.current.gone = false;
    }
  }

  const firstIssue = issues[0];
  const chip = !valid && firstIssue
    ? { state: "invalid", text: `Não salvo: corrija ${issueLabel(firstIssue, current)}` }
    : pending
      ? { state: "saving", text: "Salvando…" }
      : saveFailed
        ? { state: "failed", text: "Não salvo: o aparelho recusou a gravação" }
        : { state: "saved", text: "Salvo no aparelho ✓" };
  const color = colorSlot === "primary" ? current.primary : current.secondary;
  const customColor = !PRESET_COLORS.some((preset) => preset.hex === color);
  const lastTeam = teams.length <= 1;
  const heroStyle = { "--bob-primary": current.primary, "--bob-secondary": current.secondary } as CSSProperties;
  const nameId = `${baseId}-nome`;
  const shortId = `${baseId}-curto`;
  const abbrId = `${baseId}-sigla`;

  return (
    <section className="bob-editor" aria-labelledby={`${baseId}-titulo`}>
      <div className="bob-editor-bar">
        <button type="button" className="bob-back" onClick={leave}>‹ Voltar</button>
        <span className="bob-save-chip" data-state={chip.state} role="status">{chip.text}</span>
      </div>

      <header className="bob-screen-head">
        <span>VESTIÁRIO</span>
        <h1 id={`${baseId}-titulo`}>Editar time</h1>
      </header>

      {stageNotice && <p className="bob-editor-notice" role="note">{stageNotice}</p>}

      <div className="bob-editor-hero" style={heroStyle}>
        <BobCrest team={current} size={76} />
        <div>
          <strong>{cleanText(current.name, LIMITS.teamName[1]) || "Seu time"}</strong>
          <small>{current.abbr || "—"} · {cleanText(current.shortName, LIMITS.shortName[1]) || "—"}</small>
          {isActive && <em className="bob-team-tag">EM USO</em>}
        </div>
        <KitThumb pattern={current.kitPattern} primary={current.primary} secondary={current.secondary} size={52} />
      </div>

      <div className="bob-editor-body">
        <section className="bob-editor-section" aria-labelledby={`${baseId}-identidade`}>
          <h2 id={`${baseId}-identidade`}>Identidade</h2>
          <div className="bob-editor-grid">
            <Field label="Nome do time" htmlFor={nameId} error={issueFor("name")} counter={`${Array.from(current.name).length}/${LIMITS.teamName[1]}`}>
              <input
                id={nameId}
                value={current.name}
                maxLength={LIMITS.teamName[1]}
                autoComplete="off"
                enterKeyHint="done"
                aria-invalid={issueFor("name") ? true : undefined}
                aria-describedby={issueFor("name") ? `${nameId}-erro` : undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <div className="bob-editor-pair">
              <Field label="Nome curto" htmlFor={shortId} error={issueFor("shortName")}>
                <input
                  id={shortId}
                  value={current.shortName}
                  maxLength={LIMITS.shortName[1]}
                  autoComplete="off"
                  enterKeyHint="done"
                  aria-invalid={issueFor("shortName") ? true : undefined}
                  aria-describedby={issueFor("shortName") ? `${shortId}-erro` : undefined}
                  onChange={(event) => setShortName(event.target.value)}
                />
              </Field>
              <Field label="Sigla" htmlFor={abbrId} error={issueFor("abbr")}>
                <input
                  id={abbrId}
                  className="bob-abbr-input"
                  value={current.abbr}
                  maxLength={LIMITS.abbr[1]}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  enterKeyHint="done"
                  aria-invalid={issueFor("abbr") ? true : undefined}
                  aria-describedby={issueFor("abbr") ? `${abbrId}-erro` : undefined}
                  onChange={(event) => setAbbr(event.target.value)}
                />
              </Field>
            </div>
            <p className="bob-editor-hint">{autoAbbr || autoShort ? "Nome curto e sigla acompanham o nome até você mudar." : "O nome curto aparece no placar."}</p>

            <div className="bob-editor-block">
              <div className="bob-block-title"><span>Cores</span></div>
              <div className="bob-color-tabs" role="group" aria-label="Qual cor editar">
                <button type="button" aria-pressed={colorSlot === "primary"} onClick={() => setColorSlot("primary")}>
                  <i style={{ background: current.primary }} />
                  <span><small>Cor </small>principal</span>
                </button>
                <button type="button" aria-pressed={colorSlot === "secondary"} onClick={() => setColorSlot("secondary")}>
                  <i style={{ background: current.secondary }} />
                  <span><small>Cor </small>secundária</span>
                </button>
                <button
                  type="button"
                  className="bob-color-swap"
                  aria-label="Trocar a cor principal com a secundária"
                  title="Trocar as cores"
                  onClick={() => update({ ...current, primary: current.secondary, secondary: current.primary })}
                >
                  ⇄
                </button>
              </div>
              <div className="bob-swatches" role="group" aria-label={colorSlot === "primary" ? "Cor principal" : "Cor secundária"}>
                {PRESET_COLORS.map((preset) => (
                  <button
                    type="button"
                    key={preset.hex}
                    aria-label={preset.name}
                    title={preset.name}
                    aria-pressed={color === preset.hex}
                    style={{ "--bob-swatch": preset.hex } as CSSProperties}
                    onClick={() => setColor(colorSlot, preset.hex)}
                  />
                ))}
                <label className="bob-swatch-custom" data-active={customColor ? "true" : undefined}>
                  <input
                    type="color"
                    value={color}
                    aria-label={colorSlot === "primary" ? "Cor principal: outra cor" : "Cor secundária: outra cor"}
                    onChange={(event) => setColor(colorSlot, event.target.value)}
                  />
                  <i aria-hidden="true" style={customColor ? { background: color } : undefined} />
                  <span aria-hidden="true">{customColor ? `Outra cor · ${color.toUpperCase()}` : "Outra cor…"}</span>
                </label>
              </div>
            </div>

            <div className="bob-editor-block">
              <div className="bob-block-title"><span>Uniforme</span><b>{KIT_PATTERN_NAMES[current.kitPattern] ?? KIT_PATTERN_NAMES[0]}</b></div>
              <div className="bob-kit-grid" role="group" aria-label="Uniforme">
                {KIT_PATTERN_NAMES.map((name, pattern) => (
                  <button type="button" key={name} aria-label={name} title={name} aria-pressed={current.kitPattern === pattern} onClick={() => setKitPattern(pattern)}>
                    <KitThumb pattern={pattern} primary={current.primary} secondary={current.secondary} />
                  </button>
                ))}
              </div>
            </div>

            <div className="bob-editor-block">
              <div className="bob-block-title"><span>Escudo</span></div>
              <div className="bob-shape-grid" role="group" aria-label="Escudo">
                {CREST_SHAPE_NAMES.map((name, shape) => (
                  <button type="button" key={name} aria-pressed={current.crest === shape} onClick={() => update({ ...current, crest: shape as BobTeam["crest"] })}>
                    <BobCrest team={{ ...current, crest: shape as BobTeam["crest"] }} size={38} />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="bob-editor-side">
          <section className="bob-editor-section" aria-labelledby={`${baseId}-elenco`}>
            <h2 id={`${baseId}-elenco`}>Elenco <small>5 jogadores · toque para personalizar</small></h2>
            <ul className="bob-roster">
              {current.players.map((player, index) => {
                const playerIssue = issues.find((issue) => issue.field.startsWith(`players.${index}.`));
                const celebration = CELEBRATION_OPTIONS[player.appearance.celebration ?? 0]?.name ?? CELEBRATION_OPTIONS[0].name;
                const name = cleanText(player.name, LIMITS.playerName[1]) || "Sem nome";
                return (
                  <li key={player.id}>
                    <button
                      type="button"
                      className="bob-player-card"
                      data-invalid={playerIssue ? "true" : undefined}
                      aria-label={`Personalizar ${name}, camisa ${Number.isFinite(player.number) ? player.number : "sem número"}`}
                      onClick={() => setSheet({ kind: "player", index })}
                    >
                      <PlayerAppearancePortrait appearance={player.appearance} primary={current.primary} secondary={current.secondary} size={54} frame="compact" label={`Rosto de ${name}`} />
                      <span>
                        <strong><b>#{Number.isFinite(player.number) ? player.number : "?"}</b> {name}</strong>
                        <small>{playerIssue ? playerIssue.message : `Comemoração: ${celebration}`}</small>
                      </span>
                      <i aria-hidden="true">›</i>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="bob-editor-actions">
            {isActive ? (
              <p className="bob-editor-inuse"><em className="bob-team-tag">EM USO</em> Este é o time que vai para a sala.</p>
            ) : (
              <button type="button" className="primary-button" onClick={useThisTeam}>Usar este time <span>✓</span></button>
            )}
            <button type="button" className="secondary-button" onClick={() => setSheet({ kind: "export", team: flush() })}>Exportar código</button>
            <button type="button" className="secondary-button" onClick={() => setConfirm("shuffle")}>Sortear time inteiro</button>
            <button type="button" className="bob-danger-button" disabled={lastTeam} aria-describedby={lastTeam ? `${baseId}-ultimo` : undefined} onClick={() => setConfirm("delete")}>
              Excluir time
            </button>
            {lastTeam && <small id={`${baseId}-ultimo`} className="bob-editor-hint">Você precisa de pelo menos um time.</small>}
          </div>
        </div>
      </div>

      {sheet?.kind === "player" && (
        <PlayerSheet team={current} index={sheet.index} onChange={(player) => setPlayer(sheet.index, player)} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "export" && <TeamCodeSheet mode="export" team={sheet.team} onClose={() => setSheet(null)} />}
      {confirm === "shuffle" && (
        <ConfirmSheet
          title="Sortear tudo de novo?"
          detail="Nome, cores e jogadores atuais serão trocados."
          confirmLabel="Sortear"
          onConfirm={shuffleAll}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "delete" && (
        <ConfirmSheet
          title={`Excluir ${cleanText(saved?.name ?? current.name, LIMITS.teamName[1])}?`}
          detail="Isso não tem volta."
          confirmLabel="Excluir"
          danger
          onConfirm={deleteTeam}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "leave" && (
        <ConfirmSheet
          title="Sair sem salvar a última mudança?"
          detail={firstIssue ? `Falta corrigir ${issueLabel(firstIssue, current)}. O time salvo fica como estava.` : undefined}
          confirmLabel="Sair"
          cancelLabel="Continuar editando"
          onConfirm={() => {
            latest.current.gone = true;
            setConfirm(null);
            onBack();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      <TeamsToastHost />
    </section>
  );
}
