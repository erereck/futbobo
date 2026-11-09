"use client";

import type { ReactNode } from "react";
import type { Club } from "../../../game-data";
import FutboboIcon from "../../FutboboIcon";
import type { FutboboIconName } from "../../FutboboIcon";
import { clubInks } from "./inks";
import styles from "./album.module.css";

/** Ponto de montagem das sobreposições do álbum (use com createPortal). */
export const ALBUM_OVERLAY_ID = "album-overlay-root";

export type AlbumTabId = "event" | "profile" | "team" | "history" | "stats" | "world";

export const ALBUM_TABS: Array<{ id: AlbumTabId; label: string; icon: FutboboIconName; ink: string }> = [
  { id: "event", label: "Carreira", icon: "career", ink: "club" },
  { id: "profile", label: "Jogador", icon: "player", ink: "blue" },
  { id: "team", label: "Time", icon: "team", ink: "red" },
  { id: "history", label: "Histórico", icon: "history", ink: "ink" },
  { id: "stats", label: "Estatísticas", icon: "stats", ink: "mustard" },
  { id: "world", label: "Mundo", icon: "globe", ink: "green" },
];

/**
 * O objeto álbum: mesa, capa amarela, duas páginas e as abas do índice.
 * No celular vira uma página só com as abas presas no rodapé.
 */
export default function AlbumShell({
  club,
  tab,
  onTab,
  showTabs,
  label,
  spreadClassName,
  children,
}: {
  club: Club;
  tab: AlbumTabId | null;
  onTab: (tab: AlbumTabId) => void;
  showTabs: boolean;
  label: string;
  spreadClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.root} albumMounted`} style={clubInks(club.primary, club.secondary)} data-tabs={showTabs ? "" : undefined}>
      <main className={styles.album} aria-label={label}>
        <div className={styles.cover} aria-hidden="true" />
        <div className={`${styles.spread} ${spreadClassName ?? ""}`}>{children}</div>
        {showTabs && (
          <nav aria-label="Navegação da carreira">
            <ul className={styles.tabs}>
              {ALBUM_TABS.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.tab}
                    data-ink={item.ink}
                    style={item.ink === "club" && tab !== item.id ? { background: "var(--club)", color: "var(--club-ink)" } : undefined}
                    aria-current={tab === item.id ? "page" : undefined}
                    onClick={() => onTab(item.id)}
                  >
                    <FutboboIcon name={item.icon} />
                    <span>{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </main>
      {/* Folhas e diálogos das abas montam aqui: cobrem o álbum inteiro, abas incluídas, sem sair dos tokens. */}
      <div id={ALBUM_OVERLAY_ID} className={styles.overlayRoot} />
    </div>
  );
}

/** Uma página do álbum. No desktop é metade do álbum aberto; no celular, um trecho da página única. */
export function AlbumPage({ side, label, className, children }: { side: "left" | "right"; label: string; className?: string; children: ReactNode }) {
  return (
    <section className={`${styles.page} ${className ?? ""}`} data-side={side} aria-label={label}>
      {children}
    </section>
  );
}

export { styles as albumStyles };

/** Classe para o `main.app-shell` do jogo enquanto o álbum estiver na tela. */
export const albumHostClass = styles.host;
