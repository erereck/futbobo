"use client";

// "Testar conexão": a folha que roda o diagnóstico de rede deste aparelho e deixa copiar o
// resultado para mandar no WhatsApp quando dois amigos não se acham.
//
// O módulo do diagnóstico (net/diagnostics.ts: RTCPeerConnection de teste, relays, TURN) só
// baixa quando a folha abre, com import(): nada dele entra no primeiro carregamento do
// /bobonline. A folha em si vem com a página (leve): um pedaço que não baixa (sem rede, deploy
// novo) fica aqui dentro, com "Recarregar", e nunca derruba a tela. Cada linha aparece e muda ao
// vivo pelo onProgress; fechar a folha aborta o teste em andamento (AbortSignal).

import { useEffect, useId, useRef, useState } from "react";
import type { DiagCheck, DiagReport, DiagStatus, DiagVerdict } from "../net/diagnostics";
import { copyText } from "../share";
import { BobSheet } from "./BobSheet";

type DiagModule = typeof import("../net/diagnostics");

const STATUS_WORD: Record<DiagStatus, string> = { testando: "testando", ok: "ok", aviso: "atenção", falha: "falhou", pulado: "pulado" };
/** Só se o relatório vier sem manchete (as mesmas frases do DIAG_HEADLINES, que não dá para importar sem baixar o módulo). */
const VERDICT_TEXT: Record<DiagVerdict, string> = {
  bom: "Conexão boa para jogar.",
  apoio: "Dá para jogar pelo servidor de apoio, com um pouco mais de atraso.",
  "sem-apoio": "Esta rede bloqueia o jogo online: tente outra (Wi-Fi ↔ dados móveis).",
  "sem-rede": "Nenhum servidor de encontro respondeu: confira a internet ou tente outra rede.",
  "sem-webrtc": "Este navegador não conecta o jogo: abra no Chrome.",
};
const COPIED_MS = 2000;
/** O import() que falhou: a corrente para aqui (o teste nem começou). */
const SKIP = Symbol("pulado");

export default function DiagnosticsSheet({ lastError, onClose }: {
  /** Motivo técnico da última falha da sala (vai no relatório). */
  lastError: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const moduleRef = useRef<DiagModule | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [run, setRun] = useState(0);
  const [checks, setChecks] = useState<DiagCheck[]>([]);
  const [report, setReport] = useState<DiagReport | null>(null);
  const [broken, setBroken] = useState(false);
  /** O módulo do teste não baixou: o runtime guarda a falha do pedaço, então só recarregar resolve. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  // O motivo da falha que abriu a folha: a sala pode trocar o netError enquanto o teste roda, e
  // isso não deve recomeçar o teste no meio.
  const [reason] = useState(lastError);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    // Já baixado numa rodada anterior: usa o mesmo (sem outro import()).
    const loaded: Promise<DiagModule> = moduleRef.current
      ? Promise.resolve(moduleRef.current)
      : import("../net/diagnostics").catch(() => {
        if (alive) setLoadFailed(true);
        throw SKIP;
      });
    loaded
      .then((diagnostics) => {
        moduleRef.current = diagnostics;
        return diagnostics.runDiagnostics({
          signal: controller.signal,
          lastError: reason,
          onProgress: (list) => {
            if (alive) setChecks(list.map((check) => ({ ...check })));
          },
        });
      })
      .then((result) => {
        if (!alive) return;
        setChecks(result.checks);
        setReport(result);
      })
      .catch((error: unknown) => {
        // O teste em si falhou: a folha diz e deixa tentar de novo. Abortado (fechou, "Testar de novo")
        // nunca chega aqui com alive; o módulo que não baixou já virou loadFailed.
        if (alive && error !== SKIP) setBroken(true);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [run, reason]);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  useEffect(() => {
    if (!manual) return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [manual]);

  function again() {
    setChecks([]);
    setReport(null);
    setBroken(false);
    setCopied(false);
    setManual(null);
    setRun((value) => value + 1);
  }

  async function copy() {
    const diagnostics = moduleRef.current;
    if (!report || !diagnostics) return;
    const text = diagnostics.diagnosticsText(report);
    if (await copyText(text)) {
      setManual(null);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } else {
      // WebView sem permissão de área de transferência: o texto fica pronto para o toque longo.
      setManual(text);
    }
  }

  const running = !report && !broken && !loadFailed;

  return (
    <BobSheet
      labelledBy={titleId}
      className="bob-diag-sheet"
      title="Testar conexão"
      closeLabel="Fechar"
      onClose={onClose}
      footer={(
        <div className="bob-confirm-actions">
          {loadFailed ? (
            // O mesmo import() cairia na falha guardada do pedaço: "Testar de novo" não resolveria.
            <button type="button" className="secondary-button" data-testid="bob-diag-reload" onClick={() => window.location.reload()}>Recarregar</button>
          ) : (
            <button type="button" className="secondary-button" data-testid="bob-diag-again" disabled={running} onClick={again}>Testar de novo</button>
          )}
          <button type="button" className="primary-button" data-testid="bob-diag-copy" disabled={!report} onClick={() => void copy()} aria-live="polite">
            {copied ? "Copiado" : "Copiar diagnóstico"}
          </button>
        </div>
      )}
    >
      {checks.length === 0 && running && (
        <p className="bob-hint" role="status"><span className="bob-spinner" aria-hidden="true" />Preparando o teste…</p>
      )}
      {checks.length > 0 && (
        <ol className="bob-diag-list" aria-label="Resultado do teste" aria-busy={running || undefined}>
          {checks.map((check) => (
            <li key={check.id} className="bob-diag-row" data-status={check.status} data-testid="bob-diag-row">
              <span className="bob-diag-text">
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </span>
              <span className="bob-diag-status">
                {check.status === "testando" ? <span className="bob-spinner" aria-hidden="true" /> : <i aria-hidden="true" />}
                {STATUS_WORD[check.status]}
              </span>
            </li>
          ))}
        </ol>
      )}

      {report && (
        <p className="bob-diag-verdict" role="status" data-verdict={report.verdict} data-testid="bob-diag-verdict">
          {report.headline || VERDICT_TEXT[report.verdict]}
        </p>
      )}
      {broken && <p className="bob-alert" role="alert">O teste não rodou. Confira a internet e tente de novo.</p>}
      {loadFailed && <p className="bob-alert" role="alert">O teste não abriu. Recarregue a página.</p>}

      {manual && (
        <div className="bob-field">
          <label htmlFor={`${titleId}-texto`}>Toque e segure para copiar.</label>
          <textarea id={`${titleId}-texto`} ref={fallbackRef} readOnly rows={6} value={manual} spellCheck={false} onFocus={(event) => event.currentTarget.select()} />
        </div>
      )}
    </BobSheet>
  );
}
