"use client";

import { useEffect, useState } from "react";
import { installExpandedPlayerNames } from "../../career/player-name-expansion";
import { installSecondDivisions } from "../../career/second-divisions";
import { installLargeStorageBridge } from "../../career/indexed-storage";
import FutboboShell from "./FutboboShell";

export default function FutboboShellWithNames() {
  const [storageReady, setStorageReady] = useState(false);

  installExpandedPlayerNames();
  installSecondDivisions();

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
