"use client";

// Folhas do vestiário: exportar/importar o código do time, a confirmação de
// ações sem volta e o aviso curto (toast) das telas de time. O papel é o da folha
// solta do álbum (screens/paper.tsx).

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SheetPaper, paper, type SheetInk } from "../screens/paper";
import type { BobTeam } from "../types";
import { exportTeamCode } from "./codes";
import { importTeam, showTeamsToast, useTeamsToast, type ImportResult } from "./team-storage";
import "./teams.css";

const IMPORT_ERRORS: Record<Exclude<ImportResult, { ok: true }>["reason"], string> = {
  invalido: "Código inválido ou incompleto.",
  versao: "Esse código é de uma versão mais nova do Futbobo.",
  limite: "Limite de 6 times. Exclua um para importar.",
};

const subscribeNothing = () => () => {};

/**
 * Folhas e aviso vão direto para o <body>: assim nenhum ancestral da página (com
 * transform, filtro ou z-index próprio) prende o `position: fixed` do fundo.
 * No export estático (servidor) não desenha nada.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return client ? createPortal(children, document.body) : null;
}

/** Base das folhas: fundo que fecha no toque, Esc fecha, foco entra na folha. */
function Sheet({ labelledBy, className, role = "dialog", ink = "red", kicker, title, closeLabel = "Fechar", footer, onClose, children }: {
  labelledBy: string;
  className?: string;
  role?: "dialog" | "alertdialog";
  ink?: SheetInk;
  kicker?: ReactNode;
  title: ReactNode;
  /** Com rótulo: o "×" na faixa. */
  closeLabel?: string | null;
  footer?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Foco na folha (não num campo: no celular isso abriria o teclado sem pedir) e, ao fechar, de volta a quem abriu.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus({ preventScroll: true });
    return () => opener?.focus({ preventScroll: true });
  }, []);
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  }
  return (
    <BodyPortal>
      <SheetPaper
        ink={ink}
        titleId={labelledBy}
        kicker={kicker}
        title={title}
        role={role}
        className={className}
        sheetRef={sheetRef}
        onClose={onClose}
        closeLabel={closeLabel}
        onKeyDown={handleKeys}
        footer={footer}
      >
        {children}
      </SheetPaper>
    </BodyPortal>
  );
}

export function ConfirmSheet({ title, detail, confirmLabel, cancelLabel = "Cancelar", danger = false, onConfirm, onCancel }: {
  title: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <Sheet
      labelledBy={titleId}
      className="bob-confirm"
      role="alertdialog"
      ink={danger ? "red" : "blue"}
      title={title}
      closeLabel={null}
      onClose={onCancel}
      footer={(
        <div className="bob-confirm-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? "bob-danger-button" : "primary-button"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      )}
    >
      {detail && <p className="bob-sheet-lead">{detail}</p>}
    </Sheet>
  );
}

/** Região viva do aviso curto (role="status"); fica montada para o leitor de tela ouvir a troca. */
export function TeamsToastHost() {
  const toast = useTeamsToast();
  return (
    <BodyPortal>
      <div className={`bob-teams-toast-region ${paper.tokens}`} role="status" aria-live="polite">
        {toast && <p key={toast.id} className="bob-teams-toast">{toast.text}</p>}
      </div>
    </BodyPortal>
  );
}

function ExportBody({ team, onClose }: { team: BobTeam; onClose: () => void }) {
  const titleId = useId();
  const fieldId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [code, setCode] = useState<{ team: BobTeam; text: string } | null>(null);
  const [holdHint, setHoldHint] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const text = code?.team === team ? code.text : "";

  useEffect(() => {
    let alive = true;
    exportTeamCode(team).then((value) => {
      if (alive) setCode({ team, text: value });
    });
    return () => {
      alive = false;
    };
  }, [team]);

  function selectAll() {
    const area = areaRef.current;
    if (!area) return;
    area.focus();
    area.select();
    area.setSelectionRange(0, area.value.length);
  }

  async function copy() {
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("sem clipboard");
      await navigator.clipboard.writeText(text);
      setHoldHint(false);
      showTeamsToast("Código copiado");
    } catch {
      // WebView sem permissão de área de transferência: deixa o texto pronto para o toque longo.
      selectAll();
      setHoldHint(true);
    }
  }

  async function share() {
    if (!text) return;
    try {
      await navigator.share({ title: `Time ${team.name} · Futbobo`, text });
    } catch {
      // Cancelado pelo usuário: nada a fazer.
    }
  }

  return (
    <Sheet
      labelledBy={titleId}
      className="bob-code-sheet"
      kicker={team.name}
      title="Código do time"
      onClose={onClose}
      footer={(
        <div className="bob-code-actions">
          {canShare && <button type="button" className="secondary-button" disabled={!text} onClick={share}>Compartilhar</button>}
          <button type="button" className="primary-button" disabled={!text} onClick={copy}>Copiar código</button>
        </div>
      )}
    >
      <div className="bob-field">
        <label htmlFor={fieldId}>Código do time</label>
        <textarea
          ref={areaRef}
          id={fieldId}
          readOnly
          value={text}
          placeholder="Gerando o código…"
          rows={6}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
      {holdHint && <p className="bob-sheet-hint">Toque e segure para copiar.</p>}
      <p className="bob-sheet-help">Em outro aparelho, cole em Meus times, no Importar código.</p>
    </Sheet>
  );
}

function ImportBody({ onClose, onImported }: { onClose: () => void; onImported: (team: BobTeam) => void }) {
  const titleId = useId();
  const fieldId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    if (!value.trim()) {
      setError(IMPORT_ERRORS.invalido);
      return;
    }
    setBusy(true);
    const result = await importTeam(value);
    setBusy(false);
    if (!result.ok) {
      setError(IMPORT_ERRORS[result.reason]);
      return;
    }
    showTeamsToast("Time importado!");
    onImported(result.team);
  }

  return (
    <Sheet
      labelledBy={titleId}
      className="bob-code-sheet"
      kicker="Meus times"
      title="Importar código"
      onClose={onClose}
      footer={(
        <div className="bob-code-actions">
          <button type="button" className="primary-button" disabled={busy} aria-busy={busy || undefined} onClick={submit}>
            {busy ? "Importando…" : "Importar"}
          </button>
        </div>
      )}
    >
      <div className="bob-field" data-invalid={error ? "true" : undefined}>
        <label htmlFor={fieldId}>Cole o código do time</label>
        <textarea
          id={fieldId}
          value={value}
          rows={6}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          placeholder="BOB1-…"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-erro` : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
        />
        {error && <small id={`${fieldId}-erro`} className="bob-field-error">{error}</small>}
      </div>
    </Sheet>
  );
}

export default function TeamCodeSheet(
  props: { mode: "export"; team: BobTeam; onClose: () => void } | { mode: "import"; onClose: () => void; onImported: (team: BobTeam) => void },
) {
  if (props.mode === "export") return <ExportBody team={props.team} onClose={props.onClose} />;
  return <ImportBody onClose={props.onClose} onImported={props.onImported} />;
}
