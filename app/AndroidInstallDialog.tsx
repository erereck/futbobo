"use client";

import { ANDROID_APP_VERSION, type AndroidRelease } from "./android-app";
import FutboboIcon from "./components/FutboboIcon";

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
    <div className="modal-backdrop android-install-backdrop" role="presentation">
      <section className="android-install-dialog" role="dialog" aria-modal="true" aria-labelledby="android-install-title">
        <button type="button" className="android-install-close" onClick={onClose} aria-label="Fechar">×</button>
        <div className="android-install-logo"><span>F</span><b><FutboboIcon name="ball" /></b></div>
        <span className="android-install-kicker">{update ? `ATUALIZAÇÃO ${release.version}` : "FUTBOBO PARA ANDROID"}</span>
        <h2 id="android-install-title">
          {update ? "Tem Futbobo novo esperando." : "Leve sua carreira no bolso."}
        </h2>
        <p>
          {update
            ? release.notes
            : "A versão APK leva o jogo inteiro no aparelho: clubes, escudos, futebol de botão e seus saves, mesmo sem internet."}
        </p>
        {!update && (
          <div className="android-install-benefits">
            <span><b><FutboboIcon name="check" /></b><strong>100% offline</strong><small>Depois de instalar, é só abrir e jogar.</small></span>
            <span><b><FutboboIcon name="download" /></b><strong>Atualizações avisadas</strong><small>Com internet, o app procura versões novas.</small></span>
            <span><b><FutboboIcon name="ball" /></b><strong>Mesmo Futbobo</strong><small>Site e aplicativo usam exatamente o mesmo jogo.</small></span>
          </div>
        )}
        <button type="button" className="android-apk-download" onClick={onDownload}>
          <span>{update ? "Baixar atualização" : "Baixar APK offline"}</span><b><FutboboIcon name="download" /></b>
        </button>
        {!native && onWebInstall && (
          <button type="button" className="android-web-install" onClick={onWebInstall}>
            Prefiro apenas criar um atalho leve
          </button>
        )}
        <small className="android-install-note">
          {native
            ? `Instalada: ${ANDROID_APP_VERSION}. O Android pedirá confirmação antes de atualizar.`
            : "O Android pode pedir para autorizar a instalação pelo navegador. O arquivo é assinado e publicado no GitHub oficial do Futbobo."}
        </small>
      </section>
    </div>
  );
}
