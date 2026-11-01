"use client";

// Folhas das telas da sala (sair, testar conexão): o mesmo fundo, foco e Esc das folhas do
// vestiário (teams/TeamCodeSheet.tsx, que não exporta a base) e as mesmas classes de desenho.
//
// A folha de sair é daqui e não a ConfirmSheet: lá a confirmação é sempre a ação dourada, e
// sair da sala não pode ser o botão que chama o dedo. Aqui ficar é o dourado; sair é o
// vermelho discreto. Tocar fora ou Esc também fica.

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { BodyPortal } from "../teams/TeamCodeSheet";

/** Base: fundo que fecha no toque, Esc fecha, foco entra na folha e volta para quem abriu. */
export function BobSheet({ labelledBy, className, role = "dialog", onClose, children }: {
  labelledBy: string;
  className?: string;
  role?: "dialog" | "alertdialog";
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // Foco na folha (não num botão: no celular o anel de foco apareceria sem ninguém pedir).
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
      <div className="modal-backdrop bob-sheet-backdrop" role="presentation" onMouseDown={onClose} onKeyDown={handleKeys}>
        <section
          ref={sheetRef}
          className={`bob-sheet${className ? ` ${className}` : ""}`}
          role={role}
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {children}
        </section>
      </div>
    </BodyPortal>
  );
}

/** "Sair da sala?" / "Sair do torneio?": ficar é a ação principal; sair, a secundária vermelha. */
export function LeaveSheet({ pending, entrant, onLeave, onStay }: {
  /** Ainda tenho partida no torneio: sair vira W.O. */
  pending: boolean;
  /** Estou na chave (já sem partida): sair só para de acompanhar. */
  entrant: boolean;
  onLeave: () => void;
  onStay: () => void;
}) {
  const titleId = useId();
  const detail = pending ? "Suas próximas partidas viram W.O." : entrant ? "Você deixa de acompanhar o torneio." : null;
  return (
    <BobSheet labelledBy={titleId} className="bob-confirm bob-leave-sheet" role="alertdialog" onClose={onStay}>
      <h2 id={titleId}>{pending ? "Sair do torneio?" : "Sair da sala?"}</h2>
      {detail && <p>{detail}</p>}
      <div className="bob-confirm-actions">
        <button type="button" className="bob-danger-button" data-testid="bob-leave-confirm" onClick={onLeave}>Sair</button>
        <button type="button" className="primary-button" data-testid="bob-leave-stay" onClick={onStay}>Ficar</button>
      </div>
    </BobSheet>
  );
}
