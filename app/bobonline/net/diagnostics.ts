// "Testar conexão" do Bobonline: mede, deste aparelho, tudo de que uma partida online depende e
// monta um texto para o jogador mandar no WhatsApp quando não conecta.
//
// CONTRATO T0 (stub): a implementação de verdade substitui o corpo de runDiagnostics e
// diagnosticsText sem mudar os tipos. Nunca põe usuário/senha do TURN no relatório.

export type DiagId = "versao" | "relays" | "relogio" | "nat" | "apoio-udp" | "apoio-tcp" | "erro";
export type DiagStatus = "testando" | "ok" | "aviso" | "falha" | "pulado";
/** `label`: nome curto da linha ("Servidores de encontro"); `detail`: o resultado em uma frase ("7 de 11 respondem"). */
export type DiagCheck = { id: DiagId; status: DiagStatus; label: string; detail: string };
/**
 * - "bom": este aparelho conecta direto na maioria das redes;
 * - "apoio": a rede exige o servidor de apoio (CGNAT simétrico) e ele responde: conecta, com mais atraso;
 * - "sem-apoio": a rede exige o servidor de apoio e ele não responde daqui: só outra rede resolve;
 * - "sem-rede": nenhum servidor de encontro respondeu.
 */
export type DiagVerdict = "bom" | "apoio" | "sem-apoio" | "sem-rede";
export type DiagReport = { at: number; checks: DiagCheck[]; verdict: DiagVerdict; headline: string };
export type DiagOptions = {
  signal?: AbortSignal;
  /** Motivo técnico da última falha da sala (RoomClientState.netError), se houver. */
  lastError?: string | null;
  /** Chamado a cada linha que muda (a tela mostra o progresso). */
  onProgress?: (checks: DiagCheck[]) => void;
};

export async function runDiagnostics(options: DiagOptions = {}): Promise<DiagReport> {
  const checks: DiagCheck[] = [{ id: "versao", status: "pulado", label: "Versão", detail: "—" }];
  options.onProgress?.(checks);
  return { at: Date.now(), checks, verdict: "bom", headline: "" };
}

/** Texto puro para copiar (uma linha por item). */
export function diagnosticsText(report: DiagReport): string {
  return report.checks.map((check) => `${check.label}: ${check.detail}`).join("\n");
}
