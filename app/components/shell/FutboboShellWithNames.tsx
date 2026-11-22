"use client";

import { useEffect, useState } from "react";
import { installSecondDivisions } from "../../career/second-divisions";
import { installLargeStorageBridge } from "../../career/indexed-storage";
import FutboboShell from "./FutboboShell";

// Os clubes da segunda divisão entram antes do primeiro render (a figurinha de um save pode ser de um deles).
// Os nomes extras de jogadores entram com o pacote da carreira (CareerGame), que é o único que sorteia nomes.
installSecondDivisions();

export default function FutboboShellWithNames() {
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void installLargeStorageBridge()
      .catch((error) => {
        console.error("[Futbobo] Falha ao preparar armazenamento; usando fallback legado.", error);
      })
      .finally(() => {
        if (mounted) setStorageReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // O shell só monta depois que os saves antigos foram carregados/migrados.
  // Isso mantém toda a API síncrona de localStorage que o jogo já usa.
  if (!storageReady) return null;
  return <FutboboShell />;
}
