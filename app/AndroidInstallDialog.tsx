"use client";

import { ANDROID_APP_VERSION, type AndroidRelease } from "./android-app";
import FutboboIcon from "./components/FutboboIcon";
import AlbumSheet, { sheetStyles } from "./components/career/album/sheets/AlbumSheet";
import { Stamp } from "./components/career/album/primitives";
import styles from "./AndroidInstallDialog.module.css";

const ANDROID_INK = { primary: "#1f8a4c", secondary: "#f6c431" };

/** Aviso do app Android (atualização nova) ou convite do APK: uma folha solta do álbum. */
export default function AndroidInstallDialog({
  native,
  release,
  onClose,
  onDownload,
  onWebInstall,
}: {
  native: boolean;
  release: AndroidRelease | null;
  onClose: () => void;
  onDownload: () => void;
  onWebInstall?: () => void;
}) {
  const update = native && release;
  return (
    <AlbumSheet
      ink="green"
      club={ANDROID_INK}
      titleId="android-install-title"
      kicker={update ? `Atualização ${release.version}` : "Futbobo para Android"}
      title={update ? "Tem Futbobo novo esperando." : "Leve sua carreira no bolso."}
      onDismiss={onClose}
      footer={(
        <>
          {!native && onWebInstall && <Stamp onClick={onWebInstall}>Só um atalho leve</Stamp>}
          <Stamp variant="primary" onClick={onDownload}>{update ? "Baixar atualização" : "Baixar APK offline"}</Stamp>
        </>
      )}
    >
      <p className={sheetStyles.lead}>
        {update
          ? release.notes
          : "A versão APK leva o jogo inteiro no aparelho: clubes, escudos, futebol de botão e seus saves, mesmo sem internet."}
      </p>
      {!update && (
        <ul className={styles.benefits}>
          <li><FutboboIcon name="check" /><span><strong>100% offline</strong><small>Depois de instalar, é só abrir e jogar.</small></span></li>
          <li><FutboboIcon name="download" /><span><strong>Atualizações avisadas</strong><small>Com internet, o app procura versões novas.</small></span></li>
          <li><FutboboIcon name="ball" /><span><strong>Mesmo Futbobo</strong><small>Site e aplicativo usam exatamente o mesmo jogo.</small></span></li>
        </ul>
      )}
      <small className={styles.note}>
        {native
          ? `Instalada: ${ANDROID_APP_VERSION}. O Android pede confirmação antes de atualizar.`
          : "O Android pode pedir para autorizar a instalação pelo navegador. O arquivo é assinado e publicado no GitHub oficial do Futbobo."}
      </small>
    </AlbumSheet>
  );
}
