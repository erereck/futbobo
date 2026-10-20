"use client";

import { useEffect, useRef, useState } from "react";
import { isValidCareerPin } from "../../career/save-system";
import styles from "./FutboboShell.module.css";

export default function CareerAccessDialog({ creating, name, onClose, onSubmit }: {
  creating: boolean;
  name?: string;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<boolean>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submittingRef = useRef(false);
  const [protectedCareer, setProtectedCareer] = useState(!creating);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog ref={dialogRef} className={styles.accessDialog} aria-labelledby="career-access-title" onCancel={(event) => { event.preventDefault(); if (!submittingRef.current) onClose(); }}>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (submittingRef.current) return;
        if (protectedCareer && !isValidCareerPin(pin)) { setError("Digite exatamente 4 números."); return; }
        submittingRef.current = true;
        setBusy(true);
        setError("");
        try {
          if (!await onSubmit(protectedCareer ? pin : "")) setError("Senha incorreta ou carreira indisponível.");
        } catch {
          setError(creating ? "Não foi possível criar a carreira. Tente novamente." : "Não foi possível abrir a carreira. Tente novamente.");
        } finally {
          submittingRef.current = false;
          setBusy(false);
        }
      }}>
        <span>RUMO AO ESTRELATO</span>
        <h2 id="career-access-title">{creating ? "Nova carreira" : "Carreira protegida"}</h2>
        <p>{creating ? "Você pode proteger esta carreira com uma senha de 4 números." : `Digite a senha para continuar ${name || "sua carreira"}.`}</p>
        {creating && <label className={styles.pinToggle}><input type="checkbox" checked={protectedCareer} disabled={busy} onChange={(event) => { setProtectedCareer(event.target.checked); setPin(""); setError(""); }} /> Proteger com senha</label>}
        {protectedCareer && <label className={styles.pinField}>Senha de 4 dígitos<input autoFocus={!creating} type="password" inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required autoComplete={creating ? "new-password" : "off"} value={pin} disabled={busy} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} aria-describedby="career-pin-help" aria-invalid={Boolean(error)} /><small id="career-pin-help">{creating ? "Guarde a senha: ela será pedida para abrir esta carreira." : "Somente números, incluindo zeros no início."}</small></label>}
        {error && <p className={styles.pinError} role="alert">{error}</p>}
        <footer><button type="button" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" disabled={busy || (protectedCareer && !isValidCareerPin(pin))}>{busy ? "Aguarde…" : creating ? "Criar carreira" : "Entrar"}</button></footer>
      </form>
    </dialog>
  );
}
