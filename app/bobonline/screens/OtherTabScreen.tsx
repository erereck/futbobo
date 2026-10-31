"use client";

// Uma aba só (§1, §3.3): duas abas do mesmo navegador dividiriam identidade,
// sessão e checkpoint. "blocked": esta aba chegou depois; "lost": outra aba tomou
// a vez (ou outro aparelho com a mesma identidade entrou na sala).

import Link from "next/link";

export default function OtherTabScreen({
  mode,
  busy,
  onUseHere,
}: {
  mode: "blocked" | "lost";
  busy: boolean;
  onUseHere: () => void;
}) {
  return (
    <section className="bob-other-tab" aria-labelledby="bob-other-tab-title" data-testid="bob-other-tab">
      <span className="bob-eyebrow">OUTRA ABA</span>
      <h1 id="bob-other-tab-title">
        {mode === "blocked" ? "O Bobonline já está aberto em outra aba." : "O Bobonline foi aberto em outra aba."}
      </h1>
      <div className="bob-cta">
        {mode === "blocked" && (
          <button type="button" className="primary-button" data-testid="bob-use-here" disabled={busy} onClick={onUseHere}>Usar aqui</button>
        )}
        <Link className="secondary-button bob-link-button" href="/">Voltar ao início</Link>
      </div>
    </section>
  );
}
